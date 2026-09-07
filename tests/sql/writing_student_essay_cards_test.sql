-- =====================================================
-- writing_student_essay_cards() 的安全與行為測試
--
-- 🛑 本機專用。不要在 staging 或正式環境執行——它會寫入資料，
--    而且依賴 tests/sql/_writing_local_harness.sql 把 auth.uid() / is_admin()
--    換成讀 GUC 的替身。
--
-- 前置：
--   psql -d <本機測試庫> -f tests/sql/_writing_local_harness.sql
--   CREATE TABLE user_profiles (user_id UUID PRIMARY KEY REFERENCES auth.users(id), display_name TEXT);
--   psql -f supabase/migrations/create_writing_submissions.sql
--   psql -f supabase/migrations/create_writing_texts.sql
--   psql -f supabase/migrations/create_writing_analyses.sql
--   psql -f supabase/migrations/create_writing_teacher_feedback.sql
--   psql -f supabase/migrations/create_writing_student_essay_cards.sql
--
-- 輸出一張表：項目 / 結果 / 說明。FAIL = 0 才算通過。
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS t (seq SERIAL, name TEXT, verdict TEXT, detail TEXT);
TRUNCATE t;

DO $test$
DECLARE
  v_student UUID;
  v_other   UUID;
  v_teacher UUID;
  v_e_plain UUID;   -- 沒有分析
  v_e_queued UUID;  -- 分析排隊中
  v_e_analyzed UUID;-- 四軸好了、綜合層還沒
  v_e_done UUID;    -- 完成
  v_e_failed UUID;  -- 失敗
  v_e_other UUID;   -- 別人的作文
  v_json JSONB;
  v_card JSONB;
  v_n INTEGER;
  v_txt TEXT;

  -- 三軸的內容在這裡不重要，只要非 NULL 就能通過 trigger 的完整性檢查
  v_axis JSONB := '{"stub": true}'::jsonb;
  v_overall JSONB := '{"level": "SOLID", "headline": "結構完整，論點清楚", "summary": "……"}'::jsonb;
BEGIN
  INSERT INTO auth.users (email) VALUES ('cards-student@test') RETURNING id INTO v_student;
  INSERT INTO auth.users (email) VALUES ('cards-other@test')   RETURNING id INTO v_other;
  INSERT INTO auth.users (email) VALUES ('cards-teacher@test') RETURNING id INTO v_teacher;

  INSERT INTO writing_submissions (student_id, title, essay_topic, essay_date, status, submitted_at)
    VALUES (v_student, '第一篇', '自我介紹', DATE '2026-01-10', 'SUBMITTED', now())
    RETURNING id INTO v_e_plain;
  INSERT INTO writing_submissions (student_id, title, essay_date, status, submitted_at)
    VALUES (v_student, '排隊中', DATE '2026-02-10', 'SUBMITTED', now())
    RETURNING id INTO v_e_queued;
  INSERT INTO writing_submissions (student_id, title, essay_date, status, submitted_at)
    VALUES (v_student, '四軸完成', DATE '2026-03-10', 'SUBMITTED', now())
    RETURNING id INTO v_e_analyzed;
  INSERT INTO writing_submissions (student_id, title, essay_date, status, submitted_at)
    VALUES (v_student, '批改完成', DATE '2026-04-10', 'SUBMITTED', now())
    RETURNING id INTO v_e_done;
  INSERT INTO writing_submissions (student_id, title, essay_date, status, submitted_at)
    VALUES (v_student, '批改失敗', DATE '2026-05-10', 'SUBMITTED', now())
    RETURNING id INTO v_e_failed;
  INSERT INTO writing_submissions (student_id, title, essay_date, status, submitted_at)
    VALUES (v_other, '別人的作文', DATE '2026-06-10', 'SUBMITTED', now())
    RETURNING id INTO v_e_other;

  -- writing_texts 是 append-only：第一篇故意寫兩次，卡片必須拿最新那一版的字數
  INSERT INTO writing_texts (essay_id, content, provenance, created_by, created_at)
    VALUES (v_e_plain, repeat('a', 100), 'TYPED', v_student, now() - interval '1 hour');
  INSERT INTO writing_texts (essay_id, content, provenance, created_by, created_at)
    VALUES (v_e_plain, repeat('b', 250), 'TYPED', v_student, now());

  INSERT INTO writing_analyses (essay_id, status, requested_by, provider, model, error_detail)
    VALUES (v_e_queued, 'QUEUED', v_teacher, 'deepseek', 'deepseek-chat', NULL);

  INSERT INTO writing_analyses (
    essay_id, status, requested_by,
    competency_analysis, error_analysis, high_score_feature_analysis,
    overall_evaluation, synthesis_status)
    VALUES (v_e_analyzed, 'ANALYZED', v_teacher, v_axis, v_axis, v_axis,
            v_overall, 'RUNNING');

  -- 同一篇兩個版本：v1 舊的（STRONG），v2 才是現在的（SOLID）
  INSERT INTO writing_analyses (
    essay_id, analysis_version, status, requested_by,
    competency_analysis, error_analysis, high_score_feature_analysis,
    overall_evaluation, next_steps, synthesis_status, completed_at)
    VALUES (v_e_done, 1, 'COMPLETED', v_teacher, v_axis, v_axis, v_axis,
            '{"level": "STRONG", "headline": "舊版本", "summary": "……"}'::jsonb,
            '[]'::jsonb, 'COMPLETED', now() - interval '2 days');
  INSERT INTO writing_analyses (
    essay_id, analysis_version, status, requested_by,
    competency_analysis, error_analysis, high_score_feature_analysis,
    overall_evaluation, next_steps, synthesis_status, completed_at)
    VALUES (v_e_done, 2, 'COMPLETED', v_teacher, v_axis, v_axis, v_axis,
            v_overall, '[]'::jsonb, 'COMPLETED', now());

  INSERT INTO writing_analyses (
    essay_id, status, requested_by, failed_at, error_detail, failed_pass, validation_issues)
    VALUES (v_e_failed, 'FAILED', v_teacher, now(),
            'DeepSeek 回傳 429，已重試三次', 'competency',
            '[{"kind":"MALFORMED","path":"x","detail":"y"}]'::jsonb);

  INSERT INTO writing_teacher_feedback (essay_id, body, author_id)
    VALUES (v_e_done, '這篇的轉折語用得很好。', v_teacher);

  /* ---------- 未登入 ---------- */
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM writing_student_essay_cards();
    INSERT INTO t (name, verdict, detail)
      VALUES ('未登入呼叫', 'FAIL', '竟然沒有拋錯');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t (name, verdict, detail)
      VALUES ('未登入呼叫', 'PASS', '42501 需要登入');
  END;

  /* ---------- 只看得到自己的作文 ---------- */
  PERFORM set_config('request.jwt.claim.sub', v_student::text, true);
  v_json := writing_student_essay_cards();

  SELECT jsonb_array_length(v_json) INTO v_n;
  INSERT INTO t (name, verdict, detail) VALUES (
    '只回傳自己的作文', CASE WHEN v_n = 5 THEN 'PASS' ELSE 'FAIL' END,
    format('本人 5 篇、別人 1 篇，實得 %s 筆', v_n));

  SELECT count(*) INTO v_n
    FROM jsonb_array_elements(v_json) e
   WHERE (e ->> 'essay_id')::uuid = v_e_other;
  INSERT INTO t (name, verdict, detail) VALUES (
    '不含別人的作文', CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('命中 %s 筆', v_n));

  /* ---------- 排序：essay_date DESC ---------- */
  INSERT INTO t (name, verdict, detail) VALUES (
    '依 essay_date 由新到舊',
    CASE WHEN (v_json -> 0 ->> 'essay_id')::uuid = v_e_failed
          AND (v_json -> 4 ->> 'essay_id')::uuid = v_e_plain
         THEN 'PASS' ELSE 'FAIL' END,
    format('第一筆 %s、最後一筆 %s',
           v_json -> 0 ->> 'title', v_json -> 4 ->> 'title'));

  /* ---------- 沒有分析的那一篇 ---------- */
  SELECT e INTO v_card FROM jsonb_array_elements(v_json) e
   WHERE (e ->> 'essay_id')::uuid = v_e_plain;
  INSERT INTO t (name, verdict, detail) VALUES (
    '未送批改：analysis_status 為 NULL',
    CASE WHEN v_card ->> 'analysis_status' IS NULL
          AND (v_card ->> 'report_ready')::boolean IS FALSE
         THEN 'PASS' ELSE 'FAIL' END,
    format('analysis_status=%s report_ready=%s',
           coalesce(v_card ->> 'analysis_status', 'NULL'),
           coalesce(v_card ->> 'report_ready', 'NULL')));
  INSERT INTO t (name, verdict, detail) VALUES (
    'char_count 取最新一版文字',
    CASE WHEN (v_card ->> 'char_count')::int = 250 THEN 'PASS' ELSE 'FAIL' END,
    format('舊版 100 字、新版 250 字，實得 %s', v_card ->> 'char_count'));
  INSERT INTO t (name, verdict, detail) VALUES (
    'essay_topic 與 submission_type 有帶出來',
    CASE WHEN v_card ->> 'essay_topic' = '自我介紹'
          AND v_card ->> 'submission_type' = 'text'
         THEN 'PASS' ELSE 'FAIL' END,
    format('topic=%s type=%s', v_card ->> 'essay_topic', v_card ->> 'submission_type'));

  /* ---------- QUEUED ---------- */
  SELECT e INTO v_card FROM jsonb_array_elements(v_json) e
   WHERE (e ->> 'essay_id')::uuid = v_e_queued;
  INSERT INTO t (name, verdict, detail) VALUES (
    'QUEUED：report_ready = false 且無等第',
    CASE WHEN v_card ->> 'analysis_status' = 'QUEUED'
          AND (v_card ->> 'report_ready')::boolean IS FALSE
          AND v_card ->> 'overall_level' IS NULL
         THEN 'PASS' ELSE 'FAIL' END,
    format('status=%s ready=%s level=%s',
           v_card ->> 'analysis_status', v_card ->> 'report_ready',
           coalesce(v_card ->> 'overall_level', 'NULL')));

  /* ---------- ANALYZED：綜合層已寫入但尚未 COMPLETED ---------- */
  SELECT e INTO v_card FROM jsonb_array_elements(v_json) e
   WHERE (e ->> 'essay_id')::uuid = v_e_analyzed;
  INSERT INTO t (name, verdict, detail) VALUES (
    'ANALYZED：等第仍被閘門擋住',
    CASE WHEN v_card ->> 'analysis_status' = 'ANALYZED'
          AND (v_card ->> 'report_ready')::boolean IS FALSE
          AND v_card ->> 'overall_level' IS NULL
          AND v_card ->> 'overall_headline' IS NULL
         THEN 'PASS' ELSE 'FAIL' END,
    '資料庫裡已有 overall_evaluation，但未 COMPLETED 就不得外流');

  /* ---------- COMPLETED ---------- */
  SELECT e INTO v_card FROM jsonb_array_elements(v_json) e
   WHERE (e ->> 'essay_id')::uuid = v_e_done;
  INSERT INTO t (name, verdict, detail) VALUES (
    'COMPLETED：等第與 headline 都給',
    CASE WHEN (v_card ->> 'report_ready')::boolean IS TRUE
          AND v_card ->> 'overall_level' = 'SOLID'
          AND v_card ->> 'overall_headline' = '結構完整，論點清楚'
         THEN 'PASS' ELSE 'FAIL' END,
    format('level=%s headline=%s',
           coalesce(v_card ->> 'overall_level', 'NULL'),
           coalesce(v_card ->> 'overall_headline', 'NULL')));
  INSERT INTO t (name, verdict, detail) VALUES (
    '多版本取最新一次分析',
    CASE WHEN v_card ->> 'overall_headline' = '結構完整，論點清楚'
         THEN 'PASS' ELSE 'FAIL' END,
    'v1 是「舊版本」、v2 才是現在的');
  INSERT INTO t (name, verdict, detail) VALUES (
    'has_teacher_feedback 正確',
    CASE WHEN (v_card ->> 'has_teacher_feedback')::boolean IS TRUE
         THEN 'PASS' ELSE 'FAIL' END, '這篇有老師評語');

  SELECT e INTO v_card FROM jsonb_array_elements(v_json) e
   WHERE (e ->> 'essay_id')::uuid = v_e_plain;
  INSERT INTO t (name, verdict, detail) VALUES (
    '沒有老師評語時為 false',
    CASE WHEN (v_card ->> 'has_teacher_feedback')::boolean IS FALSE
         THEN 'PASS' ELSE 'FAIL' END, '第一篇沒有評語');

  /* ---------- FAILED：狀態給，細節不給 ---------- */
  SELECT e INTO v_card FROM jsonb_array_elements(v_json) e
   WHERE (e ->> 'essay_id')::uuid = v_e_failed;
  INSERT INTO t (name, verdict, detail) VALUES (
    'FAILED：只給狀態',
    CASE WHEN v_card ->> 'analysis_status' = 'FAILED'
          AND (v_card ->> 'report_ready')::boolean IS FALSE
         THEN 'PASS' ELSE 'FAIL' END,
    format('status=%s', v_card ->> 'analysis_status'));

  /* ---------- 策展：不得出現的欄位 ---------- */
  SELECT string_agg(k, ', ') INTO v_txt
    FROM (
      SELECT DISTINCT k
        FROM jsonb_array_elements(v_json) e,
             jsonb_object_keys(e) k
       WHERE k IN ('provider', 'model', 'error_detail', 'failed_pass',
                   'validation_issues', 'requested_by', 'attempt_count',
                   'competency_analysis', 'error_analysis',
                   'high_score_feature_analysis', 'student_id')
    ) x;
  INSERT INTO t (name, verdict, detail) VALUES (
    '不回傳診斷欄位', CASE WHEN v_txt IS NULL THEN 'PASS' ELSE 'FAIL' END,
    coalesce('外洩：' || v_txt, '無 provider / model / error_detail / validation_issues / 三軸'));

  -- 保險：整段 JSON 的文字裡不得出現失敗訊息原文
  INSERT INTO t (name, verdict, detail) VALUES (
    '整包 JSON 不含錯誤訊息原文',
    CASE WHEN position('DeepSeek 回傳 429' in v_json::text) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'error_detail 內容不得以任何形式出現');

  /* ---------- 別人登入時看到自己的 ---------- */
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  v_json := writing_student_essay_cards();
  INSERT INTO t (name, verdict, detail) VALUES (
    '另一個學生只看到自己那一篇',
    CASE WHEN jsonb_array_length(v_json) = 1
          AND (v_json -> 0 ->> 'essay_id')::uuid = v_e_other
         THEN 'PASS' ELSE 'FAIL' END,
    format('%s 筆', jsonb_array_length(v_json)));

  /* ---------- 沒有作文的人拿到空陣列 ---------- */
  PERFORM set_config('request.jwt.claim.sub', v_teacher::text, true);
  v_json := writing_student_essay_cards();
  INSERT INTO t (name, verdict, detail) VALUES (
    '沒有作文時回傳空陣列',
    CASE WHEN v_json = '[]'::jsonb THEN 'PASS' ELSE 'FAIL' END,
    format('實得 %s', v_json::text));
END;
$test$;

/* ---------- 權限與函式屬性（不需要身分） ---------- */
DO $meta$
DECLARE
  v_n INTEGER;
  v_txt TEXT;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'writing_student_essay_cards'
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  INSERT INTO t (name, verdict, detail) VALUES (
    'anon 沒有 EXECUTE', CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('anon 可執行的數量 = %s（Supabase 的 ALTER DEFAULT PRIVILEGES 會自動授權，必須指名 REVOKE）', v_n));

  SELECT count(*) INTO v_n
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'writing_student_essay_cards'
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  INSERT INTO t (name, verdict, detail) VALUES (
    'authenticated 有 EXECUTE', CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, '');

  SELECT CASE WHEN p.prosecdef THEN 'yes' ELSE 'no' END INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'writing_student_essay_cards';
  INSERT INTO t (name, verdict, detail) VALUES (
    'SECURITY DEFINER', CASE WHEN v_txt = 'yes' THEN 'PASS' ELSE 'FAIL' END, '');

  SELECT array_to_string(p.proconfig, ',') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'writing_student_essay_cards';
  INSERT INTO t (name, verdict, detail) VALUES (
    'search_path 已釘死', CASE WHEN v_txt LIKE 'search_path=%' AND btrim(split_part(v_txt, '=', 2), '"') = '' THEN 'PASS' ELSE 'FAIL' END,
    coalesce(v_txt, 'NULL'));

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'writing_student_essay_cards'
     AND p.pronargs > 0;
  INSERT INTO t (name, verdict, detail) VALUES (
    '沒有任何參數', CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END,
    '不接受 student_id，結構上無法查別人的作文');
END;
$meta$;

SELECT seq AS "#", name AS "項目", verdict AS "結果", detail AS "說明" FROM t ORDER BY seq;
SELECT verdict AS "結果", count(*) AS "數量" FROM t GROUP BY verdict ORDER BY verdict;
