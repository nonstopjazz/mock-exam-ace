-- =====================================================
-- Phase 1A 第 1 批（A1 表 / A2 sync / A3 backfill）資料層測試
--
-- ⚠️ psql 專用（用到 \set / \echo / \ir）。不要貼進 Supabase SQL Editor。
-- ⚠️ 只在本機臨時資料庫跑，不要指向 staging 或 production。
--
-- 執行方式：
--   createdb wef
--   psql -v ON_ERROR_STOP=1 -d wef -f supabase/tests/writing_error_findings_test.sql
--
-- 這支自己建最小 schema，不需要 baseline migration。
--
-- 重點不在快樂路徑。真正要守住的是：
--   * 「最高 COMPLETED 版次」而不是「最高版次」——FAILED 重跑不得清掉正確結果
--   * 冪等：重跑不產生重複、也不產生缺漏
--   * 同一篇兩個【內容完全相同】的 finding 必須兩列都在（計數不能變少）
--   * 回填單篇失敗不影響整批，而且失敗查得出來
--   * remaining 在跑完之後必須是 0（否則呼叫端會無限迴圈）
--   * 權限：anon / authenticated 讀不到、寫不到
-- =====================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION t_assert(cond BOOLEAN, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

-- ── 最小 schema ──────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT);

CREATE TABLE writing_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT, essay_topic TEXT, status TEXT NOT NULL,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE writing_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  essay_id UUID NOT NULL REFERENCES writing_submissions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  char_count INTEGER GENERATED ALWAYS AS (char_length(content)) STORED,
  word_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE writing_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  essay_id UUID NOT NULL REFERENCES writing_submissions(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  analysis_version INTEGER NOT NULL,
  error_analysis JSONB,
  UNIQUE (essay_id, analysis_version));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
-- 模擬 Supabase 的 ALTER DEFAULT PRIVILEGES：新表會【明確授予】三個角色全部權限。
-- 不模擬這件事，REVOKE 的測試就是假的。
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

\ir ../migrations/create_writing_error_findings.sql
\ir ../migrations/create_writing_error_findings_sync.sql

-- ── 資料 ─────────────────────────────────────────────────────────
\set amy   '''11111111-1111-1111-1111-111111111111'''
\set bob   '''22222222-2222-2222-2222-222222222222'''
\set e1    '''e0000000-0000-0000-0000-000000000001'''
\set e2    '''e0000000-0000-0000-0000-000000000002'''
\set e3    '''e0000000-0000-0000-0000-000000000003'''
\set e4    '''e0000000-0000-0000-0000-000000000004'''
\set e5    '''e0000000-0000-0000-0000-000000000005'''

INSERT INTO auth.users (id, email) VALUES (:amy,'amy@x.com'), (:bob,'bob@x.com');

INSERT INTO writing_submissions (id, student_id, title, essay_topic, status, submitted_at) VALUES
 (:e1,:amy,'A1','My Summer','SUBMITTED', '2026-09-18'),
 (:e2,:amy,'A2','A Letter',  'SUBMITTED', '2026-09-11'),
 (:e3,:bob,'B1','My Summer','SUBMITTED', '2026-09-04'),
 (:e4,:bob,'B2','A Letter',  'SUBMITTED', '2026-08-30'),
 (:e5,:amy,'A3','My Summer','SUBMITTED', '2026-08-20');

INSERT INTO writing_texts (essay_id, content, word_count) VALUES
 (:e1,'x',180),(:e2,'x',210),(:e3,'x',165),(:e4,'x',150),(:e5,'x',200);

-- e1：v1 COMPLETED，v2 FAILED  ← 最關鍵的案例
INSERT INTO writing_analyses (essay_id, status, analysis_version, error_analysis) VALUES
 (:e1,'COMPLETED',1,'{"taxonomy_version":"writing-v2","findings":[
    {"code":"WRITE_ERR_ARTICLE","quote":"go to park","reason":"r1","correction":"c1","primary_skill":"W2"},
    {"code":"WRITE_ERR_ARTICLE","quote":"go to park","reason":"r1","correction":"c1","primary_skill":"W2"},
    {"code":"WRITE_ERR_CHINGLISH","quote":"open light","reason":"r2","correction":"c2","primary_skill":"W3"}]}'),
 (:e1,'FAILED',2,NULL),
-- e2：單純 COMPLETED
 (:e2,'COMPLETED',1,'{"taxonomy_version":"writing-v2","findings":[
    {"code":"WRITE_ERR_ARTICLE","quote":"is best","reason":"r","correction":"c","primary_skill":"W2"}]}'),
-- e3：零錯誤
 (:e3,'COMPLETED',1,'{"taxonomy_version":"writing-v2","findings":[]}'),
-- e4：沒有任何 COMPLETED
 (:e4,'FAILED',1,NULL),
-- e5：error_analysis 整個是 NULL（防禦案例）
 (:e5,'COMPLETED',1,NULL);

\echo ''
\echo '════════ 1. 最高 COMPLETED 版次（不是最高版次）════════'
SELECT writing_sync_error_findings_for_essay(:e1);
SELECT t_assert((SELECT count(*) FROM writing_error_findings WHERE essay_id=:e1) = 3,
  'S1 e1 有 v2=FAILED，仍然物化 v1=COMPLETED 的 3 筆（不是清空）');
SELECT t_assert((SELECT DISTINCT analysis_version FROM writing_error_findings WHERE essay_id=:e1) = 1,
  'S2 存的是 v1 的 analysis_version');

\echo ''
\echo '════════ 2. 內容完全相同的兩個 finding 必須都在 ════════'
SELECT t_assert(
  (SELECT count(*) FROM writing_error_findings
    WHERE essay_id=:e1 AND error_code='WRITE_ERR_ARTICLE'
      AND quote='go to park' AND correction='c1') = 2,
  'S3 同一篇兩個一模一樣的 finding → 兩列都在（若用內容當 UNIQUE 這裡會是 1）');
SELECT t_assert(
  (SELECT array_agg(finding_index ORDER BY finding_index)
     FROM writing_error_findings WHERE essay_id=:e1) = ARRAY[0,1,2],
  'S4 finding_index 是 0 起算且保留原始順序');

\echo ''
\echo '════════ 3. 冪等 ════════'
SELECT writing_sync_error_findings_for_essay(:e1);
SELECT writing_sync_error_findings_for_essay(:e1);
SELECT t_assert((SELECT count(*) FROM writing_error_findings WHERE essay_id=:e1) = 3,
  'S5 連跑三次仍然是 3 筆（不重複、不缺漏）');

\echo ''
\echo '════════ 4. 零錯誤 / 無有效分析 / NULL 形狀 ════════'
SELECT writing_sync_error_findings_for_essay(:e3);
SELECT t_assert((SELECT count(*) FROM writing_error_findings WHERE essay_id=:e3) = 0,
  'S6 零錯誤作文 → 0 列，且不報錯');
SELECT t_assert(writing_sync_error_findings_for_essay(:e4) ->> 'skipped' = 'NO_COMPLETED_ANALYSIS',
  'S7 沒有 COMPLETED → 明確回報 NO_COMPLETED_ANALYSIS');
SELECT t_assert(writing_sync_error_findings_for_essay(:e5) ->> 'skipped' = 'FINDINGS_NOT_ARRAY',
  'S8 error_analysis 是 NULL → 明確回報 FINDINGS_NOT_ARRAY，不是炸掉');

\echo ''
\echo '════════ 5. 快照欄位 ════════'
SELECT t_assert((SELECT DISTINCT essay_word_count FROM writing_error_findings WHERE essay_id=:e1) = 180,
  'S9 essay_word_count 取的是 word_count 不是 char_count');
SELECT t_assert((SELECT DISTINCT essay_topic FROM writing_error_findings WHERE essay_id=:e1) = 'My Summer',
  'S10 essay_topic 有快照');
SELECT t_assert((SELECT DISTINCT student_id FROM writing_error_findings WHERE essay_id=:e1) = :amy,
  'S11 student_id 有反正規化');
SELECT t_assert((SELECT count(*) FROM writing_error_findings
                  WHERE essay_id=:e1 AND essay_submitted_at::date = '2026-09-18') = 3,
  'S12 essay_submitted_at 有快照');

\echo ''
\echo '════════ 6. is_fallback_code 是 GENERATED ════════'
UPDATE writing_analyses SET error_analysis = '{"taxonomy_version":"writing-v2","findings":[
  {"code":"WRITE_ERR_GRAMMAR_OTHER","quote":"q","reason":"r","correction":"c","primary_skill":"W2"}]}'
 WHERE essay_id=:e2 AND analysis_version=1;
SELECT writing_sync_error_findings_for_essay(:e2);
SELECT t_assert((SELECT is_fallback_code FROM writing_error_findings WHERE essay_id=:e2) IS TRUE,
  'S13 GRAMMAR_OTHER → is_fallback_code = true（不需要任何人記得設）');
SELECT t_assert((SELECT bool_and(NOT is_fallback_code) FROM writing_error_findings WHERE essay_id=:e1),
  'S14 其他 code → false');

\echo ''
\echo '════════ 7. 未知 code 必須當場擋下 ════════'
UPDATE writing_analyses SET error_analysis = '{"taxonomy_version":"writing-v3","findings":[
  {"code":"WRITE_ERR_MADE_UP","quote":"q","reason":"r","correction":"c","primary_skill":"W2"}]}'
 WHERE essay_id=:e2 AND analysis_version=1;
DO $$
DECLARE v_ok BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM public.writing_sync_error_findings_for_essay('e0000000-0000-0000-0000-000000000002');
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  PERFORM t_assert(v_ok, 'S15 未知的 error_code 被 CHECK 擋下（taxonomy 變動會當場發現，不會默默收下）');
END $$;
SELECT t_assert((SELECT count(*) FROM writing_error_findings WHERE essay_id=:e2) = 1,
  'S16 擋下之後舊 findings 還在（DELETE 隨著交易一起回滾，不是先刪再失敗）');

\echo ''
\echo '════════ 8. 入口函式收 analysis_id ════════'
-- 傳【失敗的 v2】，仍然要物化 v1 的結果
SELECT t_assert(
  (writing_sync_error_findings(
     (SELECT id FROM writing_analyses WHERE essay_id=:e1 AND analysis_version=2))
   ->> 'inserted')::int = 3,
  'S17 傳入 FAILED 的 v2 analysis_id，仍然物化 v1 的 3 筆');
SELECT t_assert(writing_sync_error_findings('99999999-9999-9999-9999-999999999999') ->> 'skipped'
                = 'ANALYSIS_NOT_FOUND',
  'S18 不存在的 analysis_id → 明確回報，不是炸掉');

\echo ''
\echo '════════ 9. 回填 ════════'
DELETE FROM writing_error_findings;
-- 先把 e2 改回合法資料
UPDATE writing_analyses SET error_analysis = '{"taxonomy_version":"writing-v2","findings":[
  {"code":"WRITE_ERR_ARTICLE","quote":"is best","reason":"r","correction":"c","primary_skill":"W2"}]}'
 WHERE essay_id=:e2 AND analysis_version=1;

SELECT t_assert((writing_backfill_error_findings(200) ->> 'inserted')::int = 4,
  'S19 一批回填 4 筆（e1 的 3 + e2 的 1；e3 零錯誤、e4 無 COMPLETED、e5 形狀異常）');
SELECT t_assert((writing_backfill_error_findings(200) ->> 'remaining')::int = 0,
  'S20 跑完之後 remaining = 0');
SELECT t_assert((writing_backfill_error_findings(200) ->> 'failed')::int = 0,
  'S21 沒有失敗的篇數');

\echo '--- 9b. 分批 + cursor ---'
DELETE FROM writing_error_findings;
SELECT t_assert((writing_backfill_error_findings(2) ->> 'processed')::int = 2,
  'S22 p_limit=2 只處理 2 篇');
SELECT t_assert((writing_backfill_error_findings(2) ->> 'remaining')::int = 2,
  'S23 第一批之後 remaining = 2');

-- ⚠️ 這個迴圈【刻意用 remaining 當結束條件】，不是用 processed。
--    真實的呼叫端就是這樣驅動的：「還有剩就再跑一批」。
--    若改用 processed = 0 當出口，remaining 算錯這個 bug 就測不出來
--    ——迴圈照樣會停，但正式環境的呼叫端會永遠跑下去。
DO $$
DECLARE v_r JSONB; v_cursor UUID := NULL; v_total INT := 0; v_guard INT := 0;
        v_remaining INT := NULL; v_ended_by_remaining BOOLEAN := false;
BEGIN
  LOOP
    v_guard := v_guard + 1;
    EXIT WHEN v_guard > 10;               -- 無限迴圈的保險絲
    v_r         := public.writing_backfill_error_findings(2, v_cursor);
    v_total     := v_total + (v_r ->> 'processed')::int;
    v_remaining := (v_r ->> 'remaining')::int;
    IF (v_r ->> 'last_essay_id') IS NOT NULL THEN
      v_cursor := (v_r ->> 'last_essay_id')::uuid;
    END IF;
    IF v_remaining = 0 THEN
      v_ended_by_remaining := true;
      EXIT;
    END IF;
  END LOOP;
  PERFORM t_assert(v_ended_by_remaining,
    'S24 以 remaining = 0 結束迴圈（cursor 的 coalesce 寫錯的話，這裡會耗盡保險絲）');
  PERFORM t_assert(v_guard <= 10, 'S24b 沒有耗盡保險絲');
  PERFORM t_assert(v_total = 4, 'S25 分批跑完總共處理 4 篇 essay，一篇不漏一篇不重');
END $$;

-- 🛑 這一條是 remaining 那個 coalesce 的【唯一】真正測試點。
--    只跑「正常分批」測不出來：每一批都有處理到東西，v_last 就一直是非 NULL，
--    remaining 怎麼算都對。只有在【游標已經到底、這一批一篇都沒處理】的時候，
--    v_last 才會是 NULL——那時若只看 v_last，就會把「跑完了」誤報成「還有全部」，
--    而照著 remaining 迴圈的呼叫端會永遠跑下去。
DO $$
DECLARE v_end UUID; v_r JSONB;
BEGIN
  -- ⚠️ 沒有 max(uuid) 這個聚合函式，要用 ORDER BY ... DESC LIMIT 1
  SELECT a.essay_id INTO v_end
    FROM public.writing_analyses a WHERE a.status = 'COMPLETED'
   ORDER BY a.essay_id DESC LIMIT 1;
  v_r := public.writing_backfill_error_findings(200, v_end);
  PERFORM t_assert((v_r ->> 'processed')::int = 0,
    'S25b 游標已經到底 → processed = 0');
  PERFORM t_assert((v_r ->> 'remaining')::int = 0,
    'S25c 游標到底且一篇都沒處理 → remaining 仍然是 0（不是誤報成全部）');
END $$;
SELECT t_assert((SELECT count(*) FROM writing_error_findings) = 4,
  'S26 分批回填的結果與一次回填相同');

\echo '--- 9c. 單篇壞掉不影響整批 ---'
UPDATE writing_analyses SET error_analysis = '{"taxonomy_version":"writing-v2","findings":[
  {"code":"WRITE_ERR_NOT_REAL","quote":"q","reason":"r","correction":"c","primary_skill":"W2"}]}'
 WHERE essay_id=:e2 AND analysis_version=1;
DELETE FROM writing_error_findings;
SELECT t_assert((writing_backfill_error_findings(200) ->> 'failed')::int = 1,
  'S27 一篇壞掉 → failed = 1');
SELECT t_assert(jsonb_array_length(writing_backfill_error_findings(200) -> 'failures') = 1,
  'S28 失敗清單查得出來（不是整批回滾、什麼都不知道）');
SELECT t_assert((SELECT count(*) FROM writing_error_findings WHERE essay_id=:e1) = 3,
  'S29 其他篇照常回填（e1 的 3 筆還在）');
SELECT t_assert(writing_backfill_error_findings(200) -> 'failures' -> 0 ->> 'essay_id'
                = 'e0000000-0000-0000-0000-000000000002',
  'S30 失敗清單指得出是哪一篇');

\echo ''
\echo '════════ 10. 權限 ════════'
SELECT t_assert(NOT has_table_privilege('anon','writing_error_findings','SELECT'),
  'S31 anon 讀不到（ALTER DEFAULT PRIVILEGES 的明確授予有被 REVOKE 掉）');
SELECT t_assert(NOT has_table_privilege('authenticated','writing_error_findings','SELECT'),
  'S32 authenticated 讀不到');
SELECT t_assert(NOT has_table_privilege('authenticated','writing_error_findings','INSERT'),
  'S33 authenticated 寫不到');
SELECT t_assert(has_table_privilege('service_role','writing_error_findings','SELECT'),
  'S34 service_role 讀得到（診斷／匯出用）');
SELECT t_assert(NOT has_table_privilege('service_role','writing_error_findings','INSERT'),
  'S35 service_role 不能直接寫（寫入只走 SECURITY DEFINER 函式）');
SELECT t_assert((SELECT relrowsecurity FROM pg_class WHERE relname='writing_error_findings'),
  'S36 RLS 開著');
SELECT t_assert(NOT has_function_privilege('authenticated','writing_sync_error_findings(uuid)','EXECUTE'),
  'S37 authenticated 不能呼叫 sync');
SELECT t_assert(NOT has_function_privilege('service_role',
  'writing_sync_error_findings_for_essay(uuid)','EXECUTE'),
  'S38 內部函式誰都不給（只有擁有者叫得動）');
SELECT t_assert((SELECT bool_and(prosecdef AND proconfig::text = '{"search_path=\"\""}')
                   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname LIKE 'writing_%error_findings%'),
  'S39 三支都是 SECURITY DEFINER + SET search_path = ''''');

\echo ''
\echo '全部通過。'
