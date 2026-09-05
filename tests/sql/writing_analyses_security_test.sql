-- =====================================================
-- writing_analyses 安全性與資料完整性測試
--
-- 🛑 本機專用。不要在 Supabase 專案（staging 或正式）執行。
--
--    原因有兩個，都是硬的：
--      1. 它會 INSERT INTO auth.users(email) 並依賴 id 有 DEFAULT。
--         真正的 Supabase auth.users.id 沒有 DEFAULT，這裡會直接失敗。
--      2. 它依賴 _writing_local_harness.sql 把 is_admin() 換成讀 GUC 的替身，
--         才能在同一個交易裡切換管理員／學生身分。真正的 is_admin() 不吃 GUC。
--
--    staging 請改用：
--      tests/sql/staging_writing_analyses_verify.sql   （唯讀結構與權限驗證）
--      tests/sql/staging_writing_audit_report.sql      （跑過分析之後的可讀報告）
--
-- 本機執行（PostgreSQL 16）：
--   psql -d wtest -f tests/sql/_writing_local_harness.sql
--   psql -d wtest -f supabase/migrations/create_writing_submissions.sql
--   psql -d wtest -f supabase/migrations/create_writing_texts.sql
--   psql -d wtest -f supabase/migrations/create_writing_analyses.sql
--   psql -d wtest -f tests/sql/writing_analyses_security_test.sql
--
-- 純 SQL，沒有 \ir / \echo / \set，結果累積到 temp table 後一次 SELECT，
-- 因此也可以直接貼進 Supabase SQL Editor（該編輯器不會顯示 RAISE NOTICE）。
--
-- 所有寫入都在最後被清掉；這個檔案跑完不留任何資料。
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS t_result (
  seq SERIAL,
  name TEXT,
  verdict TEXT,
  detail TEXT
);
TRUNCATE t_result;

-- 測試過程會切換到 authenticated 角色，記錄結果時仍需要寫入這張暫存表。
GRANT SELECT, INSERT ON t_result TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE t_result_seq_seq TO authenticated;

DO $outer$
DECLARE
  v_student_a UUID;
  v_student_b UUID;
  v_admin     UUID;
  v_essay_a   UUID;
  v_essay_b   UUID;
  v_draft     UUID;
  v_no_text   UUID;
  v_an1       UUID;
  v_an2       UUID;
  v_got       UUID;
  v_json      JSONB;
  v_int       INTEGER;
  v_txt       TEXT;

  c_axis JSONB := '{"taxonomy_version":"writing-v1"}'::jsonb;
BEGIN
  -- ---------- 建資料 ----------
  INSERT INTO auth.users (email) VALUES ('a@test') RETURNING id INTO v_student_a;
  INSERT INTO auth.users (email) VALUES ('b@test') RETURNING id INTO v_student_b;
  INSERT INTO auth.users (email) VALUES ('admin@test') RETURNING id INTO v_admin;

  INSERT INTO writing_submissions (student_id, submission_type, title, essay_date, status, submitted_at)
  VALUES (v_student_a, 'text', 'A 的作文', CURRENT_DATE, 'SUBMITTED', now())
  RETURNING id INTO v_essay_a;
  INSERT INTO writing_texts (essay_id, content, provenance, created_by)
  VALUES (v_essay_a, 'Many student thinks the policy are unfair.', 'TYPED', v_student_a);

  INSERT INTO writing_submissions (student_id, submission_type, title, essay_date, status, submitted_at)
  VALUES (v_student_b, 'text', 'B 的作文', CURRENT_DATE, 'SUBMITTED', now())
  RETURNING id INTO v_essay_b;
  INSERT INTO writing_texts (essay_id, content, provenance, created_by)
  VALUES (v_essay_b, 'B wrote something else entirely.', 'TYPED', v_student_b);

  INSERT INTO writing_submissions (student_id, submission_type, title, essay_date, status)
  VALUES (v_student_a, 'text', '還沒送出', CURRENT_DATE, 'DRAFT')
  RETURNING id INTO v_draft;

  INSERT INTO writing_submissions (student_id, submission_type, title, essay_date, status, submitted_at)
  VALUES (v_student_a, 'text', '沒有正文', CURRENT_DATE, 'SUBMITTED', now())
  RETURNING id INTO v_no_text;

  -- ==========================================================
  -- 第一組：表層權限——一般使用者對這張表沒有任何直接管道
  -- ==========================================================

  INSERT INTO t_result (name, verdict, detail)
  SELECT
    'T01 anon 對 writing_analyses 無任何權限',
    CASE WHEN bool_or(has_table_privilege('anon', 'writing_analyses', p))
         THEN 'FAIL' ELSE 'PASS' END,
    coalesce(string_agg(p, ',') FILTER (WHERE has_table_privilege('anon', 'writing_analyses', p)), '（無）')
  FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;

  INSERT INTO t_result (name, verdict, detail)
  SELECT
    'T02 authenticated 對 writing_analyses 無任何權限',
    CASE WHEN bool_or(has_table_privilege('authenticated', 'writing_analyses', p))
         THEN 'FAIL' ELSE 'PASS' END,
    coalesce(string_agg(p, ',') FILTER (WHERE has_table_privilege('authenticated', 'writing_analyses', p)), '（無）')
  FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;

  INSERT INTO t_result (name, verdict, detail)
  SELECT
    'T03 service_role 可讀寫（但沒有 DELETE / TRUNCATE）',
    CASE WHEN has_table_privilege('service_role', 'writing_analyses', 'SELECT')
          AND has_table_privilege('service_role', 'writing_analyses', 'INSERT')
          AND has_table_privilege('service_role', 'writing_analyses', 'UPDATE')
          AND NOT has_table_privilege('service_role', 'writing_analyses', 'DELETE')
          AND NOT has_table_privilege('service_role', 'writing_analyses', 'TRUNCATE')
         THEN 'PASS' ELSE 'FAIL' END,
    'SELECT/INSERT/UPDATE 有，DELETE/TRUNCATE 無';

  INSERT INTO t_result (name, verdict, detail)
  SELECT 'T04 RLS 已啟用',
         CASE WHEN c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END,
         'relrowsecurity = ' || c.relrowsecurity
  FROM pg_class c WHERE c.relname = 'writing_analyses';

  SELECT count(*) INTO v_int
    FROM pg_policies
   WHERE tablename = 'writing_analyses' AND 'authenticated' = ANY(roles);
  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T05 沒有任何政策開放給 authenticated',
          CASE WHEN v_int = 0 THEN 'PASS' ELSE 'FAIL' END,
          v_int || ' 個');

  -- ==========================================================
  -- 第二組：排入佇列只有管理員做得到
  -- ==========================================================

  -- 未登入：is_admin() 回傳 NULL，不是 false
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM writing_enqueue_analysis(v_essay_a);
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T06 未登入無法排入分析（is_admin() = NULL）', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T06 未登入無法排入分析（is_admin() = NULL）', 'PASS', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  -- 一般學生
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'false', true);
  PERFORM set_config('request.jwt.claim.sub', v_student_a::text, true);
  BEGIN
    PERFORM writing_enqueue_analysis(v_essay_a);
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T07 學生無法觸發 AI 分析', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T07 學生無法觸發 AI 分析', 'PASS', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  -- 管理員
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'true', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  v_an1 := writing_enqueue_analysis(v_essay_a);
  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T08 管理員可以排入分析',
          CASE WHEN v_an1 IS NOT NULL THEN 'PASS' ELSE 'FAIL' END, v_an1::text);

  -- 重複點擊必須冪等
  v_got := writing_enqueue_analysis(v_essay_a);
  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T09 重複排入為冪等（回傳同一筆）',
          CASE WHEN v_got = v_an1 THEN 'PASS' ELSE 'FAIL' END,
          v_got::text);

  BEGIN
    PERFORM writing_enqueue_analysis(v_draft);
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T10 未送出的草稿不能排入分析', 'FAIL', '竟然成功了');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T10 未送出的草稿不能排入分析', 'PASS', SQLERRM);
  END;

  BEGIN
    PERFORM writing_enqueue_analysis(v_no_text);
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T11 沒有正規文字的作文不能排入分析', 'FAIL', '竟然成功了');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T11 沒有正規文字的作文不能排入分析', 'PASS', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  -- ==========================================================
  -- 第三組：Stage 1 狀態機
  -- ==========================================================

  UPDATE writing_analyses SET status = 'ANALYZING', started_at = now() WHERE id = v_an1;

  BEGIN
    UPDATE writing_analyses SET status = 'QUEUED' WHERE id = v_an1;
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T12 ANALYZING 不可退回 QUEUED', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T12 ANALYZING 不可退回 QUEUED', 'PASS', SQLERRM);
  END;

  BEGIN
    UPDATE writing_analyses SET essay_id = v_essay_b WHERE id = v_an1;
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T13 essay_id 不可竄改', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T13 essay_id 不可竄改', 'PASS', SQLERRM);
  END;

  -- 四軸都還沒寫進去就想宣稱 ANALYZED
  BEGIN
    UPDATE writing_analyses SET status = 'ANALYZED' WHERE id = v_an1;
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T14 四軸未齊備不得標記為 ANALYZED', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T14 四軸未齊備不得標記為 ANALYZED', 'PASS', SQLERRM);
  END;

  -- 跳過 ANALYZED 直接宣稱完成
  BEGIN
    UPDATE writing_analyses SET status = 'COMPLETED' WHERE id = v_an1;
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T15 ANALYZING 不可直接跳到 COMPLETED', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T15 ANALYZING 不可直接跳到 COMPLETED', 'PASS', SQLERRM);
  END;

  -- 綜合層產出不得在 ANALYZED 之前寫入
  BEGIN
    UPDATE writing_analyses
       SET overall_evaluation = '{"level":"SOLID","headline":"h","summary":"s"}'::jsonb
     WHERE id = v_an1;
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T16 綜合層結果不得在 ANALYZED 之前寫入', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T16 綜合層結果不得在 ANALYZED 之前寫入', 'PASS', SQLERRM);
  END;

  -- ==========================================================
  -- 第四組：Stage 1 → Stage 2 的交接，四軸凍結
  -- ==========================================================

  UPDATE writing_analyses
     SET status = 'ANALYZED',
         model = 'deepseek-chat',
         competency_analysis = c_axis,
         error_analysis = c_axis,
         high_score_feature_analysis = c_axis,
         synthesis_status = 'PENDING'
   WHERE id = v_an1;

  INSERT INTO t_result (name, verdict, detail)
  SELECT 'T17 四軸寫齊後可進入 ANALYZED',
         CASE WHEN a.status = 'ANALYZED' AND a.synthesis_status = 'PENDING'
              THEN 'PASS' ELSE 'FAIL' END,
         a.status || ' / ' || coalesce(a.synthesis_status, 'NULL')
  FROM writing_analyses a WHERE a.id = v_an1;

  -- ── 紅線 B ──
  BEGIN
    UPDATE writing_analyses
       SET competency_analysis = '{"tampered":true}'::jsonb
     WHERE id = v_an1;
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T18 進入 ANALYZED 後四軸凍結，綜合層不得覆寫（紅線 B）', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T18 進入 ANALYZED 後四軸凍結，綜合層不得覆寫（紅線 B）', 'PASS', SQLERRM);
  END;

  -- ── 紅線 F ──
  UPDATE writing_analyses
     SET synthesis_status = 'RUNNING', synthesis_started_at = now(),
         synthesis_attempt_count = 1
   WHERE id = v_an1;

  BEGIN
    UPDATE writing_analyses SET status = 'COMPLETED' WHERE id = v_an1;
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T19 綜合層未完成不得標記為 COMPLETED（紅線 F）', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T19 綜合層未完成不得標記為 COMPLETED（紅線 F）', 'PASS', SQLERRM);
  END;

  -- 綜合層失敗：Stage 1 的資料必須原封不動留著
  UPDATE writing_analyses
     SET synthesis_status = 'FAILED', synthesis_failed_at = now(),
         synthesis_error_detail = '綜合層驗證失敗：strengths 未引用已驗證的 finding',
         synthesis_validation_issues = '[{"kind":"MISSING_CITATION","path":"synthesis.strengths[0]","detail":"x"}]'::jsonb
   WHERE id = v_an1;

  INSERT INTO t_result (name, verdict, detail)
  SELECT 'T20 綜合層失敗不影響 status，四軸資料完整保留（紅線 E）',
         CASE WHEN a.status = 'ANALYZED'
               AND a.synthesis_status = 'FAILED'
               AND a.competency_analysis IS NOT NULL
               AND a.error_analysis IS NOT NULL
               AND a.high_score_feature_analysis IS NOT NULL
              THEN 'PASS' ELSE 'FAIL' END,
         a.status || ' / synthesis=' || a.synthesis_status
  FROM writing_analyses a WHERE a.id = v_an1;

  -- 學生端：未 ready 就不給摘要
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'false', true);
  PERFORM set_config('request.jwt.claim.sub', v_student_a::text, true);
  v_json := writing_student_analysis(v_essay_a);
  EXECUTE 'RESET ROLE';

  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T21 綜合層未完成時 report_ready = false，且不吐半套摘要（紅線 F）',
          CASE WHEN (v_json ->> 'report_ready')::boolean IS FALSE
                AND v_json ->> 'overall_evaluation' IS NULL
                AND v_json ->> 'strengths' IS NULL
                AND v_json ->> 'next_steps' IS NULL
                AND v_json ->> 'competency_analysis' IS NOT NULL
               THEN 'PASS' ELSE 'FAIL' END,
          'report_ready=' || coalesce(v_json ->> 'report_ready', '?')
          || ' overall=' || coalesce(v_json ->> 'overall_evaluation', 'NULL'));

  -- ==========================================================
  -- 第五組：只重跑綜合層
  -- ==========================================================

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'false', true);
  PERFORM set_config('request.jwt.claim.sub', v_student_a::text, true);
  BEGIN
    PERFORM writing_retry_synthesis(v_an1);
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T22 學生不能重跑綜合層', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T22 學生不能重跑綜合層', 'PASS', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'true', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM writing_retry_synthesis(v_an1);
  EXECUTE 'RESET ROLE';

  INSERT INTO t_result (name, verdict, detail)
  SELECT 'T23 管理員可以只重跑綜合層（四軸不重跑，紅線 E）',
         CASE WHEN a.synthesis_status = 'RUNNING'
               AND a.synthesis_attempt_count = 2
               AND a.synthesis_error_detail IS NULL
               AND a.competency_analysis = c_axis
              THEN 'PASS' ELSE 'FAIL' END,
         'synthesis=' || a.synthesis_status || ' attempt=' || a.synthesis_attempt_count
  FROM writing_analyses a WHERE a.id = v_an1;

  -- 綜合層成功，報告才 ready
  UPDATE writing_analyses
     SET synthesis_status = 'COMPLETED',
         synthesis_completed_at = now(),
         overall_evaluation = '{"level":"SOLID","headline":"h","summary":"s"}'::jsonb,
         strengths  = '[{"text":"段落分明","refs":["WRITE_ORG_PARAGRAPH"]}]'::jsonb,
         needs_work = '[{"text":"主詞單複數","refs":["WRITE_ERR_SV_AGREEMENT"]}]'::jsonb,
         next_steps = '[{"text":"檢查主詞單複數"}]'::jsonb
   WHERE id = v_an1;

  UPDATE writing_analyses SET status = 'COMPLETED', completed_at = now() WHERE id = v_an1;

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'false', true);
  PERFORM set_config('request.jwt.claim.sub', v_student_a::text, true);
  v_json := writing_student_analysis(v_essay_a);
  EXECUTE 'RESET ROLE';

  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T24 四軸有效 + 綜合層完成 → report_ready = true',
          CASE WHEN (v_json ->> 'report_ready')::boolean IS TRUE
                AND v_json ->> 'overall_evaluation' IS NOT NULL
                AND v_json ->> 'next_steps' IS NOT NULL
               THEN 'PASS' ELSE 'FAIL' END,
          'report_ready=' || coalesce(v_json ->> 'report_ready', '?'));

  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T25 學生看不到 provider / model / error_detail / validation_issues / requested_by',
          CASE WHEN NOT (v_json ? 'provider') AND NOT (v_json ? 'model')
                AND NOT (v_json ? 'error_detail') AND NOT (v_json ? 'validation_issues')
                AND NOT (v_json ? 'requested_by') AND NOT (v_json ? 'failed_pass')
                AND NOT (v_json ? 'synthesis_error_detail')
               THEN 'PASS' ELSE 'FAIL' END,
          array_to_string(ARRAY(SELECT jsonb_object_keys(v_json)), ','));

  BEGIN
    UPDATE writing_analyses SET overall_evaluation = '{"level":"STRONG"}'::jsonb WHERE id = v_an1;
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T26 已完成的分析永久凍結', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T26 已完成的分析永久凍結', 'PASS', SQLERRM);
  END;

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'true', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  BEGIN
    PERFORM writing_retry_synthesis(v_an1);
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T27 已完成的分析不能再重跑綜合層', 'FAIL', '竟然成功了');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T27 已完成的分析不能再重跑綜合層', 'PASS', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  -- ==========================================================
  -- 第六組：版本與並行
  -- ==========================================================

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'true', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  v_an2 := writing_enqueue_analysis(v_essay_a);
  EXECUTE 'RESET ROLE';

  SELECT analysis_version INTO v_int FROM writing_analyses WHERE id = v_an2;
  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T28 重新分析建立新的一列，version + 1',
          CASE WHEN v_an2 <> v_an1 AND v_int = 2 THEN 'PASS' ELSE 'FAIL' END,
          'analysis_version = ' || v_int);

  BEGIN
    INSERT INTO writing_analyses (essay_id, status, requested_by, analysis_version)
    VALUES (v_essay_a, 'QUEUED', v_admin, 3);
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T29 同一篇不得同時有兩筆進行中的分析', 'FAIL', '竟然成功了');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T29 同一篇不得同時有兩筆進行中的分析', 'PASS', SQLERRM);
  END;

  -- 讓 v2 停在「四軸過了但綜合層永久失敗」的狀態
  UPDATE writing_analyses SET status = 'ANALYZING', started_at = now() WHERE id = v_an2;
  UPDATE writing_analyses
     SET status = 'ANALYZED',
         competency_analysis = c_axis, error_analysis = c_axis,
         high_score_feature_analysis = c_axis,
         synthesis_status = 'PENDING'
   WHERE id = v_an2;
  UPDATE writing_analyses
     SET synthesis_status = 'FAILED', synthesis_failed_at = now(),
         synthesis_error_detail = '連續失敗'
   WHERE id = v_an2;

  -- 重新分析：把卡住的 v2 收成 FAILED（資料保留），另開 v3
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'true', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  v_got := writing_enqueue_analysis(v_essay_a);
  EXECUTE 'RESET ROLE';

  SELECT status || ' / ' || coalesce(failed_pass, 'NULL')
         || ' / axis=' || (competency_analysis IS NOT NULL)::text
    INTO v_txt
    FROM writing_analyses WHERE id = v_an2;
  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T30 綜合層永久失敗的舊版本被收束為 FAILED，但四軸資料不被丟棄',
          CASE WHEN v_txt = 'FAILED / synthesis / axis=true' THEN 'PASS' ELSE 'FAIL' END,
          v_txt);

  SELECT analysis_version INTO v_int FROM writing_analyses WHERE id = v_got;
  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T31 重新分析開出 version 3',
          CASE WHEN v_int = 3 THEN 'PASS' ELSE 'FAIL' END, 'version = ' || v_int);

  -- ==========================================================
  -- 第七組：讀取路徑的授權
  -- ==========================================================

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'false', true);
  PERFORM set_config('request.jwt.claim.sub', v_student_b::text, true);
  v_json := writing_student_analysis(v_essay_a);
  EXECUTE 'RESET ROLE';

  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T32 學生讀不到別人作文的分析',
          CASE WHEN v_json IS NULL THEN 'PASS' ELSE 'FAIL' END,
          coalesce(v_json::text, 'NULL'));

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM writing_student_analysis(v_essay_a);
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T33 未登入無法讀取分析', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T33 未登入無法讀取分析', 'PASS', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'false', true);
  PERFORM set_config('request.jwt.claim.sub', v_student_a::text, true);
  BEGIN
    PERFORM writing_admin_queue();
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T34 學生讀不到批改佇列', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T34 學生讀不到批改佇列', 'PASS', SQLERRM);
  END;

  BEGIN
    PERFORM writing_admin_analysis(v_essay_a);
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T35 學生讀不到管理員的完整分析（含診斷欄位）', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T35 學生讀不到管理員的完整分析（含診斷欄位）', 'PASS', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM writing_admin_queue();
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T36 未登入讀不到批改佇列（is_admin() = NULL）', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T36 未登入讀不到批改佇列（is_admin() = NULL）', 'PASS', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'true', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  v_json := writing_admin_queue();
  EXECUTE 'RESET ROLE';

  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T37 管理員看得到全部已送出作文（含尚未分析的）',
          CASE WHEN jsonb_array_length(v_json) = 3 THEN 'PASS' ELSE 'FAIL' END,
          jsonb_array_length(v_json) || ' 篇');

  SELECT count(*) INTO v_int
    FROM jsonb_array_elements(v_json) e
   WHERE e ->> 'analysis_status' IS NULL;
  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T38 沒分析過的作文 analysis_status 為 NULL（不是假裝跑過）',
          CASE WHEN v_int = 2 THEN 'PASS' ELSE 'FAIL' END,
          v_int || ' 篇未分析');

  SELECT count(*) INTO v_int
    FROM jsonb_array_elements(v_json) e
   WHERE e ? 'synthesis_status' AND e ? 'report_ready';
  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T39 批改佇列帶出綜合層狀態與 report_ready',
          CASE WHEN v_int = 3 THEN 'PASS' ELSE 'FAIL' END, v_int || ' 筆');

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'true', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  v_json := writing_admin_analysis(v_essay_a);
  EXECUTE 'RESET ROLE';

  -- 依 analysis_version DESC 排序，所以 [1] 是 v2，也就是綜合層永久失敗那一版。
  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T40 管理員讀得到歷次分析與診斷欄位',
          CASE WHEN jsonb_array_length(v_json) = 3
                AND (v_json -> 1 ->> 'analysis_version') = '2'
                AND (v_json -> 1 ->> 'error_detail') = '連續失敗'
                AND (v_json -> 1 ->> 'failed_pass') = 'synthesis'
                AND (v_json -> 1 ? 'validation_issues')
               THEN 'PASS' ELSE 'FAIL' END,
          jsonb_array_length(v_json) || ' 次；v2 failed_pass = '
          || coalesce(v_json -> 1 ->> 'failed_pass', 'NULL'));

  -- ---------- 清乾淨 ----------
  DELETE FROM writing_analyses
   WHERE essay_id IN (v_essay_a, v_essay_b, v_draft, v_no_text);
  DELETE FROM writing_texts WHERE essay_id IN (v_essay_a, v_essay_b, v_draft, v_no_text);
  DELETE FROM writing_submissions WHERE id IN (v_essay_a, v_essay_b, v_draft, v_no_text);
  DELETE FROM auth.users WHERE id IN (v_student_a, v_student_b, v_admin);
END;
$outer$;

SELECT seq, name, verdict, left(coalesce(detail, ''), 90) AS detail
  FROM t_result
 ORDER BY seq;

SELECT
  count(*) FILTER (WHERE verdict = 'PASS') || '/' || count(*) AS "通過",
  CASE WHEN count(*) FILTER (WHERE verdict <> 'PASS') = 0
       THEN '全部通過' ELSE '有失敗項目' END AS "結論"
  FROM t_result;

-- 殘留檢查：這個測試不應該留下任何資料
SELECT
  (SELECT count(*) FROM writing_analyses)   AS "殘留 analyses",
  (SELECT count(*) FROM writing_texts)      AS "殘留 texts",
  (SELECT count(*) FROM writing_submissions) AS "殘留 submissions";
