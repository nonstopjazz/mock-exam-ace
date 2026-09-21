-- =====================================================
-- findings 的物化與回填（Phase 1A / A2 + A3）
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_writing_error_findings.sql 之後執行。
--
-- 回滾：supabase/migrations/create_writing_error_findings_sync.rollback.sql
--
-- 三支函式：
--   writing_sync_error_findings_for_essay(p_essay_id)  內部實作
--   writing_sync_error_findings(p_analysis_id)         給 api/analyze-writing.ts 呼叫
--   writing_backfill_error_findings(p_limit, p_after)  回填既有分析
-- =====================================================


-- =====================================================
-- A2-core：以 essay 為單位重新物化
-- =====================================================
/**
 * 把某篇作文【目前有效】的分析 findings 重新物化。
 *
 * 有效 = 該 essay 最高的【COMPLETED】版次。
 *   🛑 不是最高版次。v1=COMPLETED、v2=FAILED 時有效的是 v1；
 *      判成 v2 會把 v1 的正確結果清空，而且沒有人會馬上發現。
 *
 * 冪等：同一個 essay 跑兩次，結果與跑一次完全相同。
 *   靠的是「DELETE 該 essay 全部 findings → INSERT」在同一個交易裡完成，
 *   不是靠任何 UNIQUE 約束。
 *
 * 沒有有效分析（從未成功、或分析被刪掉）→ 清掉該 essay 的 findings 後 return。
 * 這是對的：沒有有效分析就不該有 findings。
 */
CREATE OR REPLACE FUNCTION writing_sync_error_findings_for_essay(p_essay_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_analysis    RECORD;
  v_essay       RECORD;
  v_word_count  INTEGER;
  v_deleted     INTEGER := 0;
  v_inserted    INTEGER := 0;
BEGIN
  -- 這篇作文目前有效的分析
  SELECT a.id, a.analysis_version, a.error_analysis
    INTO v_analysis
    FROM public.writing_analyses a
   WHERE a.essay_id = p_essay_id
     AND a.status = 'COMPLETED'
   ORDER BY a.analysis_version DESC
   LIMIT 1;

  IF NOT FOUND THEN
    DELETE FROM public.writing_error_findings f WHERE f.essay_id = p_essay_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN jsonb_build_object(
      'essay_id', p_essay_id, 'deleted', v_deleted, 'inserted', 0,
      'skipped', 'NO_COMPLETED_ANALYSIS');
  END IF;

  -- findings 不是陣列（NULL、缺鍵、或形狀不對）→ 視為零個 finding，但明講。
  -- 2026-09-20 production 實測 44 篇全部是良好陣列，這一段是防禦，不是常態。
  IF jsonb_typeof(v_analysis.error_analysis -> 'findings') IS DISTINCT FROM 'array' THEN
    DELETE FROM public.writing_error_findings f WHERE f.essay_id = p_essay_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN jsonb_build_object(
      'essay_id', p_essay_id, 'deleted', v_deleted, 'inserted', 0,
      'skipped', 'FINDINGS_NOT_ARRAY');
  END IF;

  SELECT s.student_id, s.essay_topic,
         -- submitted_at 對 DRAFT 是 NULL。COMPLETED 的分析理論上不會掛在 DRAFT 上，
         -- 但 essay_submitted_at 是 NOT NULL，所以留一個不會讓整批失敗的退路。
         coalesce(s.submitted_at, s.created_at) AS submitted_at
    INTO v_essay
    FROM public.writing_submissions s
   WHERE s.id = p_essay_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'essay_id', p_essay_id, 'deleted', 0, 'inserted', 0, 'skipped', 'ESSAY_NOT_FOUND');
  END IF;

  -- writing_texts 是 append-only，取最新那一版（與 writing_admin_queue() 同一個判準）。
  -- ⚠️ 要的是 word_count 不是 char_count——1B 算的是 errors per 100 【words】。
  SELECT wt.word_count INTO v_word_count
    FROM public.writing_texts wt
   WHERE wt.essay_id = p_essay_id
   ORDER BY wt.created_at DESC
   LIMIT 1;

  DELETE FROM public.writing_error_findings f WHERE f.essay_id = p_essay_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO public.writing_error_findings (
    analysis_id, essay_id, analysis_version, finding_index, student_id,
    error_code, primary_skill, quote, reason, correction,
    essay_word_count, essay_topic, essay_submitted_at, taxonomy_version)
  SELECT v_analysis.id,
         p_essay_id,
         v_analysis.analysis_version,
         (t.ord - 1)::int,                     -- WITH ORDINALITY 從 1 起算，這裡改成 0 起算
         v_essay.student_id,
         t.f ->> 'code',
         t.f ->> 'primary_skill',
         t.f ->> 'quote',
         t.f ->> 'reason',
         t.f ->> 'correction',
         v_word_count,
         v_essay.essay_topic,
         v_essay.submitted_at,
         coalesce(v_analysis.error_analysis ->> 'taxonomy_version', 'unknown')
    FROM jsonb_array_elements(v_analysis.error_analysis -> 'findings')
         WITH ORDINALITY AS t(f, ord);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'essay_id', p_essay_id,
    'analysis_id', v_analysis.id,
    'analysis_version', v_analysis.analysis_version,
    'deleted', v_deleted,
    'inserted', v_inserted);
END;
$$;

COMMENT ON FUNCTION writing_sync_error_findings_for_essay IS
  '重新物化某篇作文【最高 COMPLETED 版次】的 error findings。冪等（交易內 DELETE → INSERT）。內部函式，不給任何角色 EXECUTE。';

-- 內部實作，不給任何角色。兩支公開入口以擁有者身分執行，靠所有權叫得動。
REVOKE ALL ON FUNCTION writing_sync_error_findings_for_essay(UUID)
  FROM PUBLIC, anon, authenticated, service_role;


-- =====================================================
-- A2：給 api/analyze-writing.ts 呼叫的入口
-- =====================================================
/**
 * 收 analysis_id 而不是 essay_id —— 因為呼叫點（performSynthesis()）只拿得到
 * analysisId，ctx.essayId 不在那個函式的作用域裡。這樣呼叫點就是一行，
 * 不必為了拿 essay_id 多跑一次查詢。
 *
 * ⚠️ 傳進來的 analysis_id 只用來找出它屬於哪一篇作文。
 *    真正物化的永遠是【該篇最高的 COMPLETED 版次】，
 *    所以就算呼叫端傳了一個過時或失敗的 analysis_id，結果一樣正確。
 */
CREATE OR REPLACE FUNCTION writing_sync_error_findings(p_analysis_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_essay_id UUID;
BEGIN
  SELECT a.essay_id INTO v_essay_id
    FROM public.writing_analyses a WHERE a.id = p_analysis_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'analysis_id', p_analysis_id, 'deleted', 0, 'inserted', 0,
      'skipped', 'ANALYSIS_NOT_FOUND');
  END IF;

  RETURN public.writing_sync_error_findings_for_essay(v_essay_id);
END;
$$;

COMMENT ON FUNCTION writing_sync_error_findings IS
  '單篇 findings 物化入口。收 analysis_id（呼叫點只有這個），但物化的永遠是該篇最高 COMPLETED 版次。冪等。';

REVOKE ALL ON FUNCTION writing_sync_error_findings(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_sync_error_findings(UUID) TO service_role;


-- =====================================================
-- A3：回填
-- =====================================================
/**
 * 把既有分析的 findings 補進表裡。
 *
 * 可重跑：每一篇都走同一支冪等的 sync，重跑不會產生重複。
 * 可中斷續跑：用 essay_id 當 keyset cursor（id 唯一，不會有 tie 漏行的問題）。
 *   呼叫方式：
 *     SELECT writing_backfill_error_findings(200);              -- 第一批
 *     SELECT writing_backfill_error_findings(200, '<last_essay_id>');  -- 下一批
 *   直到回傳的 processed = 0。
 *
 * 🛑 單篇失敗【不會】讓整批失敗。失敗的 essay_id 與錯誤訊息會收進 failures，
 *    讓「哪幾篇有問題」查得出來，而不是整批回滾、什麼都不知道。
 *    這正是 R2（JSONB 形狀與契約有出入）的緩解手段。
 *
 * 2026-09-20 production 實測：44 篇 / 420 findings，一批就跑得完。
 */
CREATE OR REPLACE FUNCTION writing_backfill_error_findings(
  p_limit INTEGER DEFAULT 200,
  p_after_essay_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_essay      RECORD;
  v_result     JSONB;
  v_processed  INTEGER := 0;
  v_inserted   INTEGER := 0;
  v_deleted    INTEGER := 0;
  v_failed     INTEGER := 0;
  v_failures   JSONB := '[]'::jsonb;
  v_last       UUID := NULL;
  v_remaining  INTEGER;
BEGIN
  IF coalesce(p_limit, 0) <= 0 THEN
    RAISE EXCEPTION 'writing_backfill_error_findings：p_limit 必須大於 0';
  END IF;

  FOR v_essay IN
    SELECT DISTINCT a.essay_id AS id
      FROM public.writing_analyses a
     WHERE a.status = 'COMPLETED'
       AND (p_after_essay_id IS NULL OR a.essay_id > p_after_essay_id)
     ORDER BY 1
     LIMIT p_limit
  LOOP
    BEGIN
      v_result   := public.writing_sync_error_findings_for_essay(v_essay.id);
      v_inserted := v_inserted + coalesce((v_result ->> 'inserted')::int, 0);
      v_deleted  := v_deleted  + coalesce((v_result ->> 'deleted')::int, 0);
    EXCEPTION WHEN OTHERS THEN
      -- 這一篇失敗，記下來繼續下一篇。不讓一篇壞掉的資料擋住其他 43 篇。
      v_failed   := v_failed + 1;
      v_failures := v_failures || jsonb_build_object(
        'essay_id', v_essay.id, 'sqlstate', SQLSTATE, 'message', SQLERRM);
    END;

    v_processed := v_processed + 1;
    v_last      := v_essay.id;
  END LOOP;

  -- ⚠️ cursor 要用 coalesce(v_last, p_after_essay_id)，不能只用 v_last。
  --    這一批一篇都沒處理時 v_last 是 NULL，只看 v_last 會把「已經跑完了」
  --    誤報成「還有 44 篇」，呼叫端就會永遠迴圈下去。
  SELECT count(DISTINCT a.essay_id)::int INTO v_remaining
    FROM public.writing_analyses a
   WHERE a.status = 'COMPLETED'
     AND (coalesce(v_last, p_after_essay_id) IS NULL
          OR a.essay_id > coalesce(v_last, p_after_essay_id));

  RETURN jsonb_build_object(
    'processed',      v_processed,
    'inserted',       v_inserted,
    'deleted',        v_deleted,
    'failed',         v_failed,
    'failures',       v_failures,
    'last_essay_id',  v_last,
    'remaining',      v_remaining);
END;
$$;

COMMENT ON FUNCTION writing_backfill_error_findings IS
  '回填既有分析的 error findings。分批、可重跑、可中斷續跑（essay_id keyset）。單篇失敗不影響整批，失敗清單放在回傳的 failures。';

REVOKE ALL ON FUNCTION writing_backfill_error_findings(INTEGER, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_backfill_error_findings(INTEGER, UUID) TO service_role;


-- ── 驗證：函式都在，而且權限正確 ─────────────────────────────────
SELECT p.proname                                              AS "函式",
       p.prosecdef                                            AS "SECURITY_DEFINER",
       p.proconfig::text                                      AS "search_path",
       has_function_privilege('anon', p.oid, 'EXECUTE')         AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行",
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS "service_role可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('writing_sync_error_findings',
                     'writing_sync_error_findings_for_essay',
                     'writing_backfill_error_findings')
 ORDER BY p.proname;
-- 預期：三支都 SECURITY_DEFINER=true、search_path={"search_path=\"\""}、anon=false、登入者=false
--       _for_essay 的 service_role 也是 false（內部函式）；另外兩支 service_role=true
