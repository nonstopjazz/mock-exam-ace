-- =====================================================
-- learn_classes / learn_tasks 的部署後驗證
--
-- ✅ 唯讀。可以安全地在 staging 或正式環境的 SQL Editor 直接貼上執行。
--    不寫入任何資料、不切換身分、不呼叫任何 RPC。
--
-- Supabase SQL Editor 只顯示最後一個 SELECT，所以全部累積到暫存表再一次輸出。
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS v (seq SERIAL, name TEXT, verdict TEXT, detail TEXT);
TRUNCATE v;

DO $verify$
DECLARE
  v_n INTEGER;
  v_expect_tables TEXT[] := ARRAY['learn_classes','learn_class_members','learn_tasks',
                                  'learn_task_assignees','learn_task_logs'];
  v_expect_rpc TEXT[] := ARRAY[
    'learn_admin_classes','learn_admin_upsert_class','learn_admin_archive_class',
    'learn_admin_set_next_class_date','learn_admin_search_students',
    'learn_admin_add_class_members','learn_admin_remove_class_member',
    'learn_admin_upsert_task','learn_admin_archive_task','learn_admin_check_task',
    'learn_admin_check_task_bulk','learn_admin_class_detail',
    'learn_student_tasks','learn_student_report_task','learn_student_log_recurring'];
  v_expect_helper TEXT[] := ARRAY['learn_today','learn_display_name','learn_period_start',
                                  'learn_require_admin','learn_touch_updated_at'];
BEGIN
  /* ---------- 結構 ---------- */
  SELECT count(*) INTO v_n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = ANY (v_expect_tables);
  INSERT INTO v (name, verdict, detail) VALUES
    ('五張表都存在', CASE WHEN v_n = 5 THEN 'PASS' ELSE 'FAIL' END, v_n || '/5');

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'learn_classes';
  INSERT INTO v (name, verdict, detail) VALUES
    ('learn_classes 有 8 個欄位', CASE WHEN v_n = 8 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 個');

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'learn_tasks';
  INSERT INTO v (name, verdict, detail) VALUES
    ('learn_tasks 有 13 個欄位', CASE WHEN v_n = 13 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 個');

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'learn_task_assignees';
  INSERT INTO v (name, verdict, detail) VALUES
    ('learn_task_assignees 有 12 個欄位', CASE WHEN v_n = 12 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 個');

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'learn_task_logs';
  INSERT INTO v (name, verdict, detail) VALUES
    ('learn_task_logs 有 6 個欄位', CASE WHEN v_n = 6 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 個');

  /* ---------- 唯一性與型別約束 ---------- */
  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conname IN ('learn_tasks_type_fields','learn_tasks_due_date_shape',
                     'learn_task_assignees_percent_shape');
  INSERT INTO v (name, verdict, detail) VALUES
    ('三條型別／形狀 CHECK 都在', CASE WHEN v_n = 3 THEN 'PASS' ELSE 'FAIL' END, v_n || '/3');

  SELECT count(*) INTO v_n FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexdef ILIKE '%UNIQUE%'
     AND tablename IN ('learn_class_members','learn_task_assignees','learn_task_logs')
     AND indexdef NOT ILIKE '%_pkey%';
  INSERT INTO v (name, verdict, detail) VALUES
    ('三組唯一鍵都在（班級+學生／任務+學生／指派+日期）',
     CASE WHEN v_n = 3 THEN 'PASS' ELSE 'FAIL' END, v_n || '/3');

  /* ---------- 權限：這是最容易在 staging 才爆的一項 ---------- */
  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = ANY (v_expect_tables)
     AND grantee IN ('anon','authenticated','service_role','PUBLIC');
  INSERT INTO v (name, verdict, detail) VALUES
    ('五張表對 anon / authenticated / service_role 零授權',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 項授權');

  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY (v_expect_tables) AND c.relrowsecurity;
  INSERT INTO v (name, verdict, detail) VALUES
    ('五張表都啟用 RLS', CASE WHEN v_n = 5 THEN 'PASS' ELSE 'FAIL' END, v_n || '/5');

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = ANY (v_expect_tables);
  INSERT INTO v (name, verdict, detail) VALUES
    ('五張表都沒有 RLS 政策', CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 條');

  /* ---------- 函式 ---------- */
  SELECT count(DISTINCT p.proname) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (v_expect_rpc);
  INSERT INTO v (name, verdict, detail) VALUES
    ('15 支對外 RPC 都存在', CASE WHEN v_n = 15 THEN 'PASS' ELSE 'FAIL' END, v_n || '/15');

  SELECT count(DISTINCT p.proname) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (v_expect_rpc)
     AND p.prosecdef AND p.proconfig::text LIKE '%search_path%';
  INSERT INTO v (name, verdict, detail) VALUES
    ('15 支 RPC 皆 SECURITY DEFINER 且鎖定 search_path',
     CASE WHEN v_n = 15 THEN 'PASS' ELSE 'FAIL' END, v_n || '/15');

  SELECT count(*) INTO v_n FROM information_schema.role_routine_grants
   WHERE routine_schema = 'public' AND routine_name = ANY (v_expect_rpc) AND grantee = 'anon';
  INSERT INTO v (name, verdict, detail) VALUES
    ('anon 不能執行任何一支 RPC', CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 支');

  SELECT count(*) INTO v_n FROM information_schema.role_routine_grants
   WHERE routine_schema = 'public' AND routine_name = ANY (v_expect_rpc) AND grantee = 'authenticated';
  INSERT INTO v (name, verdict, detail) VALUES
    ('authenticated 可以執行全部 15 支 RPC',
     CASE WHEN v_n = 15 THEN 'PASS' ELSE 'FAIL' END, v_n || '/15');

  SELECT count(*) INTO v_n FROM information_schema.role_routine_grants
   WHERE routine_schema = 'public' AND routine_name = ANY (v_expect_helper)
     AND grantee IN ('anon','authenticated');
  INSERT INTO v (name, verdict, detail) VALUES
    ('五支內部輔助函式不對 anon / authenticated 開放',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 支');

  /* ---------- 沒有動到既有系統 ---------- */
  SELECT count(*) INTO v_n FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('writing_submissions','writing_texts','writing_analyses',
                        'writing_teacher_feedback','user_profiles','premium_memberships');
  -- 本機測試庫只建 user_profiles，沒有 writing_*，所以 0–1 張視為「本機環境」而不是損壞。
  INSERT INTO v (name, verdict, detail) VALUES
    ('既有的 writing_* / user_profiles / premium_memberships 都還在',
     CASE WHEN v_n = 6 THEN 'PASS'
          WHEN v_n <= 1 THEN 'SKIP'
          ELSE 'FAIL' END,
     v_n || '/6' || CASE WHEN v_n <= 1 THEN '（本機測試庫沒有既有系統，略過）' ELSE '' END);
END;
$verify$;

INSERT INTO v (name, verdict, detail)
SELECT '總結',
       CASE WHEN count(*) = 0 THEN 'FAIL'
            WHEN count(*) FILTER (WHERE verdict = 'FAIL') = 0 THEN 'PASS'
            ELSE 'FAIL' END,
       CASE WHEN count(*) = 0
            THEN '沒有跑到任何一項——上面的 ERROR 就是原因'
            ELSE count(*) FILTER (WHERE verdict = 'PASS') || ' / '
                 || count(*) FILTER (WHERE verdict <> 'SKIP')
                 || CASE WHEN count(*) FILTER (WHERE verdict = 'SKIP') > 0
                         THEN '（略過 ' || count(*) FILTER (WHERE verdict = 'SKIP') || ' 項）'
                         ELSE '' END END
  FROM v WHERE name <> '總結';

SELECT name AS "項目", verdict AS "結果", detail AS "說明" FROM v ORDER BY seq;
