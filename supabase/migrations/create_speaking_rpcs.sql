-- =====================================================
-- 口說練習的寫入路徑與清理
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_speaking_prompts.sql 與 create_speaking_recordings.sql 之後執行。
--
--
-- 為什麼學生的寫入全部走函式
--
--   speaking_recordings 只給 authenticated 一個 SELECT 政策，沒有 INSERT／UPDATE。
--   所以學生偽造不出一筆「已上傳」的練習，也改不了自己的 status。
--
--   最重要的是【路徑歸屬檢查】（見 speaking_register_recording）：
--   伺服器與清理排程是用 service-role 去 Storage 操作的，那把鑰匙繞過 Storage 的
--   RLS。路徑若能亂填，一個學生就能讓系統把別人的錄音掛到自己的練習上，
--   或是讓清理排程刪掉別人的檔案。這一條與 register_writing_image 是同一個防護。
--
-- 回滾：supabase/migrations/create_speaking_rpcs.rollback.sql
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'speaking_recordings'
  ) THEN
    RAISE EXCEPTION '需要 speaking_recordings，請先套用 create_speaking_recordings.sql';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'learn_feature_enabled'
  ) THEN
    RAISE EXCEPTION '需要 learn_feature_enabled()，請先套用 create_learn_feature_access.sql';
  END IF;
END;
$$;


-- =====================================================
-- 學生端
-- =====================================================

/**
 * 開始一次練習：建立 PENDING 的一列，回傳 id。
 *
 * 題目文字在這一刻【快照】下來。之後老師改題、停用、刪題，學生回頭看到的
 * 都還是他當時真正回答的那一題。
 */
CREATE OR REPLACE FUNCTION speaking_start_practice(p_prompt_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_prompt public.speaking_prompts%ROWTYPE;
  v_text TEXT;
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '42501';
  END IF;
  -- 🛑 自己檢查一次，不依賴前端把頁面藏起來。
  IF coalesce(public.learn_feature_enabled('speaking'), false) IS NOT TRUE THEN
    RAISE EXCEPTION '口說練習尚未對你開放' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prompt FROM public.speaking_prompts sp
   WHERE sp.id = p_prompt_id AND sp.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這一題，或它已經停用' USING ERRCODE = '22023';
  END IF;

  -- 快照的文字：Part 2 是卡片（標題＋提示＋要點），Part 1/3 是一句問題。
  v_text := CASE
    WHEN v_prompt.part = 2 THEN
      v_prompt.title || E'\n' || v_prompt.cue ||
      CASE WHEN array_length(v_prompt.bullets, 1) > 0
           THEN E'\n' || array_to_string(v_prompt.bullets, E'\n')
           ELSE '' END
    ELSE
      coalesce(v_prompt.topic || '：', '') || v_prompt.question
  END;

  INSERT INTO public.speaking_recordings
    (student_id, prompt_id, prompt_part, prompt_text, status)
  VALUES (v_uid, v_prompt.id, v_prompt.part, v_text, 'PENDING')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION speaking_start_practice IS
  '建立一次練習（PENDING）並快照題目文字。自行檢查 learn_feature_enabled(''speaking'')。';

REVOKE ALL ON FUNCTION speaking_start_practice(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION speaking_start_practice(UUID) TO authenticated, service_role;


/**
 * 錄音上傳成功之後登記檔案。
 *
 * 🛑 路徑歸屬檢查是這一支存在的主要理由。
 *
 *    清理排程是用 service-role 去 Storage 刪檔的，那把鑰匙繞過 Storage 的 RLS。
 *    如果學生能把 storage_path 填成別人的路徑，他就能讓系統刪掉別人的錄音，
 *    或是把別人的錄音掛到自己的練習上（之後 AI 批改就會去讀那個檔）。
 *
 *    路徑必須是 `<自己的 uid>/<這次練習的 id>/...`，兩段都對才收。
 */
CREATE OR REPLACE FUNCTION speaking_register_recording(
  p_recording_id UUID,
  p_storage_path TEXT,
  p_mime_type TEXT,
  p_file_bytes BIGINT,
  p_duration_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_expected_prefix TEXT;
  v_row public.speaking_recordings%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.speaking_recordings r
   WHERE r.id = p_recording_id AND r.student_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這次練習' USING ERRCODE = '22023';
  END IF;
  IF v_row.status NOT IN ('PENDING', 'FAILED') THEN
    RAISE EXCEPTION '這次練習已經有錄音了' USING ERRCODE = '22023';
  END IF;

  -- ── 路徑歸屬 ────────────────────────────────────────────────
  v_expected_prefix := v_uid::text || '/' || p_recording_id::text || '/';
  IF position(v_expected_prefix in coalesce(p_storage_path, '')) <> 1 THEN
    RAISE EXCEPTION '檔案路徑與這次練習不符' USING ERRCODE = '42501';
  END IF;

  UPDATE public.speaking_recordings
     SET storage_path = p_storage_path,
         mime_type = p_mime_type,
         file_bytes = p_file_bytes,
         duration_seconds = p_duration_seconds,
         uploaded_at = now(),
         status = 'UPLOADED',
         error_detail = NULL
   WHERE id = p_recording_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION speaking_register_recording IS
  '登記已上傳的錄音。路徑必須是 <uid>/<recording_id>/... —— 這一條擋住「讓系統去碰別人的檔案」。';

REVOKE ALL ON FUNCTION speaking_register_recording(UUID, TEXT, TEXT, BIGINT, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION speaking_register_recording(UUID, TEXT, TEXT, BIGINT, INTEGER)
  TO authenticated, service_role;


/** 上傳失敗時留下原因，讓學生知道為什麼要重錄。只能標記自己的練習。 */
CREATE OR REPLACE FUNCTION speaking_fail_recording(p_recording_id UUID, p_detail TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_n INTEGER;
BEGIN
  UPDATE public.speaking_recordings
     SET status = 'FAILED', error_detail = left(coalesce(p_detail, '上傳失敗'), 500)
   WHERE id = p_recording_id
     AND student_id = v_uid
     AND status = 'PENDING';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

COMMENT ON FUNCTION speaking_fail_recording IS
  '把自己的 PENDING 練習標成 FAILED 並留下原因。只動得了自己的、也只動得了 PENDING 的。';

REVOKE ALL ON FUNCTION speaking_fail_recording(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION speaking_fail_recording(UUID, TEXT) TO authenticated, service_role;


-- =====================================================
-- 管理端：題庫清單（含被練習過幾次）
--
-- 放在這裡而不是 create_speaking_prompts.sql，是因為它要查 speaking_recordings，
-- 而那張表在那個時候還不存在。
-- =====================================================

CREATE OR REPLACE FUNCTION speaking_admin_prompts()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM public.learn_require_admin('speaking_admin_prompts');

  SELECT coalesce(jsonb_agg(row_to_json(p)::jsonb ORDER BY p.part, p.sort_order, p.created_at), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT sp.id, sp.part, sp.topic, sp.question, sp.title, sp.cue, sp.bullets,
             sp.is_active, sp.sort_order, sp.created_at, sp.updated_at,
             -- 停用一題之前，老師會想知道有多少人練過它
             (SELECT count(*) FROM public.speaking_recordings r WHERE r.prompt_id = sp.id)::int
               AS practice_count
        FROM public.speaking_prompts sp
    ) p;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION speaking_admin_prompts IS
  '題庫全表（含停用），每題附上被練習過幾次。僅限管理員。';

REVOKE ALL ON FUNCTION speaking_admin_prompts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION speaking_admin_prompts() TO authenticated, service_role;


-- =====================================================
-- 清理：錄音檔保存 90 天
-- =====================================================

/**
 * 可以刪除的錄音檔。【只有 service_role 叫得到】。
 *
 * 條件全部寫在這裡，不接受 client 傳來的「可以刪了」：
 *   · 真的有檔案（storage_path 有值）
 *   · 還沒刪過
 *   · 【上傳】超過 90 天
 *
 * ⚠️ 90 天從 uploaded_at 起算，不是 created_at。
 *    學生可能開了一次練習就跑掉，三個月後才回來錄——用 created_at 的話，
 *    那個檔案一上傳就立刻符合刪除條件，他隔天就聽不到自己剛錄的東西。
 *    保存期要從「檔案存在的那一刻」開始算。
 *
 * 🛑 PENDING／FAILED 的列沒有 storage_path，所以不會被掃到——
 *    沒上傳成功的東西本來就沒有檔案可刪。
 */
CREATE OR REPLACE FUNCTION speaking_cleanup_candidates(p_limit INTEGER DEFAULT 200)
RETURNS TABLE (recording_id UUID, storage_path TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id, r.storage_path
    FROM public.speaking_recordings r
   WHERE r.storage_path IS NOT NULL
     AND r.file_deleted_at IS NULL
     AND r.uploaded_at IS NOT NULL
     AND r.uploaded_at < now() - interval '90 days'
   ORDER BY r.uploaded_at
   LIMIT greatest(coalesce(p_limit, 200), 1);
$$;

COMMENT ON FUNCTION speaking_cleanup_candidates IS
  '上傳超過 90 天、還沒刪除的錄音檔。90 天從 uploaded_at 起算（不是 created_at）。保存條件全部在這支函式裡。僅限 service_role。';

REVOKE ALL ON FUNCTION speaking_cleanup_candidates(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION speaking_cleanup_candidates(INTEGER) TO service_role;


/**
 * 標記這些錄音的檔案已經刪掉了。【只有 service_role 叫得到】。
 *
 * 呼叫順序固定：先刪 Storage 的檔案，成功之後才呼叫這一支。
 * 反過來會留下「資料庫說刪了、檔案還在」的孤兒。
 *
 * 冪等：已經標記過的不會被重複計算。
 */
CREATE OR REPLACE FUNCTION speaking_mark_deleted(p_recording_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  UPDATE public.speaking_recordings
     SET file_deleted_at = now()
   WHERE id = ANY (coalesce(p_recording_ids, ARRAY[]::UUID[]))
     AND file_deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION speaking_mark_deleted IS
  '標記錄音檔已刪除。務必先刪 Storage 再呼叫這一支。冪等。僅限 service_role。';

REVOKE ALL ON FUNCTION speaking_mark_deleted(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION speaking_mark_deleted(UUID[]) TO service_role;
