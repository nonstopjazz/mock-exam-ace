-- =====================================================
-- writing_analyses 安全性與資料完整性測試
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
  -- 第三組：狀態機與不可修改保護
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

  -- 完成它
  UPDATE writing_analyses
     SET status = 'COMPLETED',
         completed_at = now(),
         model = 'deepseek-chat',
         competency_analysis = '{"taxonomy_version":"writing-v1","categories":[]}'::jsonb,
         error_analysis = '{"taxonomy_version":"writing-v1","findings":[],"coverage":[]}'::jsonb,
         high_score_feature_analysis = '{"taxonomy_version":"writing-v1","features":[]}'::jsonb,
         overall_evaluation = '{"level":"SOLID","headline":"h","summary":"s"}'::jsonb,
         next_steps = '[{"text":"n"}]'::jsonb,
         validation_issues = '[{"kind":"MISSING_NODE","path":"x","detail":"僅供診斷"}]'::jsonb
   WHERE id = v_an1;

  BEGIN
    UPDATE writing_analyses SET overall_evaluation = '{"level":"STRONG"}'::jsonb WHERE id = v_an1;
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T14 已完成的分析永久凍結', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T14 已完成的分析永久凍結', 'PASS', SQLERRM);
  END;

  -- 同一篇再排一次：COMPLETED 不佔 partial unique index，所以應該成功且 version = 2
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'true', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  v_an2 := writing_enqueue_analysis(v_essay_a);
  EXECUTE 'RESET ROLE';

  SELECT analysis_version INTO v_int FROM writing_analyses WHERE id = v_an2;
  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T15 重新分析建立新的一列，version + 1',
          CASE WHEN v_an2 <> v_an1 AND v_int = 2 THEN 'PASS' ELSE 'FAIL' END,
          'analysis_version = ' || v_int);

  -- 同時兩筆 active 必須被擋
  BEGIN
    INSERT INTO writing_analyses (essay_id, status, requested_by, analysis_version)
    VALUES (v_essay_a, 'QUEUED', v_admin, 3);
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T16 同一篇不得同時有兩筆進行中的分析', 'FAIL', '竟然成功了');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T16 同一篇不得同時有兩筆進行中的分析', 'PASS', SQLERRM);
  END;

  UPDATE writing_analyses
     SET status = 'FAILED', failed_at = now(), failed_pass = 'competency',
         error_detail = '完整覆蓋驗證失敗'
   WHERE id = v_an2;

  BEGIN
    UPDATE writing_analyses SET status = 'ANALYZING' WHERE id = v_an2;
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T17 失敗的分析不可復活', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T17 失敗的分析不可復活', 'PASS', SQLERRM);
  END;

  -- ==========================================================
  -- 第四組：讀取路徑
  -- ==========================================================

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'false', true);
  PERFORM set_config('request.jwt.claim.sub', v_student_a::text, true);
  v_json := writing_student_analysis(v_essay_a);
  EXECUTE 'RESET ROLE';

  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T18 學生讀得到自己作文的最新一次分析',
          CASE WHEN v_json ->> 'status' = 'FAILED'
                AND (v_json ->> 'analysis_version')::int = 2
               THEN 'PASS' ELSE 'FAIL' END,
          coalesce(v_json ->> 'status', 'NULL') || ' v' || coalesce(v_json ->> 'analysis_version', '?'));

  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T19 學生看不到 provider / model / error_detail / validation_issues / requested_by',
          CASE WHEN NOT (v_json ? 'provider') AND NOT (v_json ? 'model')
                AND NOT (v_json ? 'error_detail') AND NOT (v_json ? 'validation_issues')
                AND NOT (v_json ? 'requested_by') AND NOT (v_json ? 'failed_pass')
               THEN 'PASS' ELSE 'FAIL' END,
          array_to_string(ARRAY(SELECT jsonb_object_keys(v_json)), ','));

  -- 別人的作文
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'false', true);
  PERFORM set_config('request.jwt.claim.sub', v_student_b::text, true);
  v_json := writing_student_analysis(v_essay_a);
  EXECUTE 'RESET ROLE';

  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T20 學生讀不到別人作文的分析',
          CASE WHEN v_json IS NULL THEN 'PASS' ELSE 'FAIL' END,
          coalesce(v_json::text, 'NULL'));

  -- 未登入
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM writing_student_analysis(v_essay_a);
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T21 未登入無法讀取分析', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T21 未登入無法讀取分析', 'PASS', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  -- 佇列：非管理員
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'false', true);
  PERFORM set_config('request.jwt.claim.sub', v_student_a::text, true);
  BEGIN
    PERFORM writing_admin_queue();
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T22 學生讀不到批改佇列', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T22 學生讀不到批改佇列', 'PASS', SQLERRM);
  END;

  BEGIN
    PERFORM writing_admin_analysis(v_essay_a);
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T23 學生讀不到管理員的完整分析（含診斷欄位）', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T23 學生讀不到管理員的完整分析（含診斷欄位）', 'PASS', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  -- 佇列：未登入（is_admin() = NULL）
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM writing_admin_queue();
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T24 未登入讀不到批改佇列（is_admin() = NULL）', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_result (name, verdict, detail)
    VALUES ('T24 未登入讀不到批改佇列（is_admin() = NULL）', 'PASS', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  -- 佇列：管理員
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'true', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  v_json := writing_admin_queue();
  EXECUTE 'RESET ROLE';

  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T25 管理員看得到全部已送出作文（含尚未分析的）',
          CASE WHEN jsonb_array_length(v_json) = 3 THEN 'PASS' ELSE 'FAIL' END,
          jsonb_array_length(v_json) || ' 篇');

  SELECT count(*) INTO v_int
    FROM jsonb_array_elements(v_json) e
   WHERE e ->> 'analysis_status' IS NULL;
  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T26 沒分析過的作文 analysis_status 為 NULL（不是假裝跑過）',
          CASE WHEN v_int = 2 THEN 'PASS' ELSE 'FAIL' END,
          v_int || ' 篇未分析');

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('test.is_admin', 'true', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  v_json := writing_admin_analysis(v_essay_a);
  EXECUTE 'RESET ROLE';

  INSERT INTO t_result (name, verdict, detail)
  VALUES ('T27 管理員讀得到歷次分析與 validation_issues',
          CASE WHEN jsonb_array_length(v_json) = 2
                AND (v_json -> 1 ->> 'validation_issues') IS NOT NULL
               THEN 'PASS' ELSE 'FAIL' END,
          jsonb_array_length(v_json) || ' 次');

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
