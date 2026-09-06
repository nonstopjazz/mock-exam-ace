-- =====================================================
-- learn_classes / learn_tasks 的安全與行為測試
--
-- 🛑 本機專用。不要在 staging 或正式環境執行——它會寫入資料，
--    而且依賴 tests/sql/_writing_local_harness.sql 把 auth.uid() / is_admin()
--    換成讀 GUC 的替身。
--
-- 前置：
--   psql -f tests/sql/_writing_local_harness.sql
--   （建 user_profiles）
--   psql -f supabase/migrations/create_learn_classes_tasks.sql
--
-- 身分切換沿用全專案的慣例：
--   request.jwt.claim.sub → auth.uid()
--   test.is_admin         → is_admin()（空字串 = NULL，重現未登入的語意）
--
-- 輸出一張表：項目 / 結果 / 說明。
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS t (seq SERIAL, name TEXT, verdict TEXT, detail TEXT);
TRUNCATE t;

CREATE OR REPLACE FUNCTION pg_temp.as_admin(p_uid UUID) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('test.is_admin', 'true', true);
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.as_student(p_uid UUID) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('test.is_admin', 'false', true);
END; $$;

DO $test$
DECLARE
  v_teacher UUID;
  v_amy     UUID;
  v_ben     UUID;
  v_cara    UUID;
  v_class   UUID;
  v_class2  UUID;
  v_hw      UUID;
  v_hw2     UUID;
  v_rec     UUID;
  v_n       INTEGER;
  v_bool    BOOLEAN;
  v_date    DATE;
  v_today   DATE;
  v_json    JSONB;
  v_res     JSONB;
BEGIN
  INSERT INTO auth.users (email) VALUES ('teacher@test') RETURNING id INTO v_teacher;
  INSERT INTO auth.users (email) VALUES ('amy@test')     RETURNING id INTO v_amy;
  INSERT INTO auth.users (email) VALUES ('ben@test')     RETURNING id INTO v_ben;
  INSERT INTO auth.users (email) VALUES ('cara@test')    RETURNING id INTO v_cara;
  INSERT INTO user_profiles (user_id, display_name) VALUES (v_amy, 'Amy Chen');
  -- ben 刻意沒有 profile：測 email 前段的 fallback
  v_today := learn_today();

  /* ================= 1. 表層權限 ================= */

  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
   WHERE table_name IN ('learn_classes','learn_class_members','learn_tasks',
                        'learn_task_assignees','learn_task_logs')
     AND grantee IN ('anon','authenticated','service_role','PUBLIC');
  INSERT INTO t (name, verdict, detail) VALUES
    ('五張表對 anon / authenticated / service_role 都沒有任何權限',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 項授權');

  SELECT count(*) INTO v_n FROM pg_class
   WHERE relname IN ('learn_classes','learn_class_members','learn_tasks',
                     'learn_task_assignees','learn_task_logs')
     AND relrowsecurity;
  INSERT INTO t (name, verdict, detail) VALUES
    ('五張表都啟用 RLS', CASE WHEN v_n = 5 THEN 'PASS' ELSE 'FAIL' END, v_n || '/5');

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE tablename IN ('learn_classes','learn_class_members','learn_tasks',
                       'learn_task_assignees','learn_task_logs');
  INSERT INTO t (name, verdict, detail) VALUES
    ('沒有任何 RLS 政策（唯一入口是 SECURITY DEFINER 函式）',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 條政策');

  /* ================= 2. 函式權限 ================= */

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'learn\_admin\_%'
     AND p.prosecdef AND p.proconfig::text LIKE '%search_path%';
  INSERT INTO t (name, verdict, detail) VALUES
    ('所有 learn_admin_* 皆 SECURITY DEFINER 且鎖定 search_path',
     CASE WHEN v_n = 12 THEN 'PASS' ELSE 'FAIL' END, v_n || '/12');

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'learn\_student\_%'
     AND p.prosecdef AND p.proconfig::text LIKE '%search_path%';
  INSERT INTO t (name, verdict, detail) VALUES
    ('所有 learn_student_* 皆 SECURITY DEFINER 且鎖定 search_path',
     CASE WHEN v_n = 3 THEN 'PASS' ELSE 'FAIL' END, v_n || '/3');

  SELECT count(*) INTO v_n FROM information_schema.role_routine_grants
   WHERE routine_name LIKE 'learn\_%' AND grantee = 'anon';
  INSERT INTO t (name, verdict, detail) VALUES
    ('anon 不能執行任何一支 learn_* 函式',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 支可執行');

  SELECT count(*) INTO v_n FROM information_schema.role_routine_grants
   WHERE routine_name IN ('learn_today','learn_display_name','learn_period_start',
                          'learn_require_admin','learn_touch_updated_at')
     AND grantee IN ('anon','authenticated');
  INSERT INTO t (name, verdict, detail) VALUES
    ('內部輔助函式不對 anon / authenticated 開放',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 支可執行');

  -- 靜態檢查：學生端函式的原始碼裡不存在對 teacher_* 欄位的賦值
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'learn\_student\_%'
     AND p.prosrc ~ 'teacher_[a-z_]+[[:space:]]*=';
  INSERT INTO t (name, verdict, detail) VALUES
    ('學生端函式原始碼裡沒有任何 teacher_* 欄位賦值',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 支有賦值');

  /* ================= 3. 老師端授權 ================= */

  PERFORM pg_temp.as_student(v_amy);
  BEGIN
    PERFORM learn_admin_upsert_class(NULL, '學生自己開的班');
    INSERT INTO t (name, verdict, detail) VALUES ('學生無法建立班級', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t (name, verdict, detail) VALUES ('學生無法建立班級', 'PASS', '僅限管理員');
  END;

  PERFORM set_config('test.is_admin', '', true);
  BEGIN
    PERFORM learn_admin_classes();
    INSERT INTO t (name, verdict, detail) VALUES ('is_admin() 回 NULL 時也擋下', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t (name, verdict, detail) VALUES ('is_admin() 回 NULL 時也擋下', 'PASS', 'coalesce 生效');
  END;

  /* ================= 4. 班級與名冊 ================= */

  PERFORM pg_temp.as_admin(v_teacher);
  v_class  := (learn_admin_upsert_class(NULL, '  週六 A 班  ', v_today + 3)) ->> 'id';
  v_class2 := (learn_admin_upsert_class(NULL, '一對一 · Cara')) ->> 'id';

  INSERT INTO t (name, verdict, detail) VALUES
    ('管理員可以建班，名稱前後空白被去掉',
     CASE WHEN (SELECT name FROM learn_classes WHERE id = v_class) = '週六 A 班'
          THEN 'PASS' ELSE 'FAIL' END, '');

  BEGIN
    PERFORM learn_admin_upsert_class(NULL, '   ');
    INSERT INTO t (name, verdict, detail) VALUES ('空白班名被擋下', 'FAIL', '竟然成功了');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t (name, verdict, detail) VALUES ('空白班名被擋下', 'PASS', '');
  END;

  -- 加入三位，其中一個是不存在的帳號
  v_res := learn_admin_add_class_members(v_class, ARRAY[v_amy, v_ben, gen_random_uuid()]);
  SELECT count(*) INTO v_n FROM learn_class_members WHERE class_id = v_class AND left_at IS NULL;
  INSERT INTO t (name, verdict, detail) VALUES
    ('批次加入名冊，不存在的帳號被跳過',
     CASE WHEN v_n = 2 AND (v_res ->> 'added')::int = 2 THEN 'PASS' ELSE 'FAIL' END,
     v_n || ' 位在籍 / added=' || (v_res ->> 'added'));

  PERFORM learn_admin_add_class_members(v_class, ARRAY[v_amy]);
  SELECT count(*) INTO v_n FROM learn_class_members WHERE class_id = v_class AND student_id = v_amy;
  INSERT INTO t (name, verdict, detail) VALUES
    ('重複加入同一人不會產生第二列',
     CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 列');

  -- 一人可屬多班
  PERFORM learn_admin_add_class_members(v_class2, ARRAY[v_amy, v_cara]);
  SELECT count(*) INTO v_n FROM learn_class_members
   WHERE student_id = v_amy AND left_at IS NULL;
  INSERT INTO t (name, verdict, detail) VALUES
    ('同一位學生可以同時屬於多個班',
     CASE WHEN v_n = 2 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 個班');

  -- 顯示名稱：有 profile 用 display_name，沒有的用 email 前段
  INSERT INTO t (name, verdict, detail) VALUES
    ('顯示名稱：display_name → email 前段，永遠不是裸 uuid',
     CASE WHEN learn_display_name(v_amy) = 'Amy Chen'
           AND learn_display_name(v_ben) = 'ben'
          THEN 'PASS' ELSE 'FAIL' END,
     learn_display_name(v_amy) || ' / ' || learn_display_name(v_ben));

  /* ================= 5. 學生搜尋不外洩目錄 ================= */

  INSERT INTO t (name, verdict, detail) VALUES
    ('搜尋字串少於 2 字元一律回空陣列',
     CASE WHEN learn_admin_search_students('a') = '[]'::jsonb THEN 'PASS' ELSE 'FAIL' END,
     learn_admin_search_students('a')::text);

  v_json := learn_admin_search_students('amy');
  INSERT INTO t (name, verdict, detail) VALUES
    ('搜尋得到指定帳號',
     CASE WHEN jsonb_array_length(v_json) = 1
           AND v_json -> 0 ->> 'display_name' = 'Amy Chen'
          THEN 'PASS' ELSE 'FAIL' END, v_json::text);

  PERFORM pg_temp.as_student(v_amy);
  BEGIN
    PERFORM learn_admin_search_students('ben');
    INSERT INTO t (name, verdict, detail) VALUES ('學生不能搜尋使用者目錄', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t (name, verdict, detail) VALUES ('學生不能搜尋使用者目錄', 'PASS', '僅限管理員');
  END;

  /* ================= 6. 指派：內容不複製 ================= */

  PERFORM pg_temp.as_admin(v_teacher);
  v_res := learn_admin_upsert_task(NULL, v_class, 'HOMEWORK', '講義 P.20–25',
                                   '寫完對答案', 'NEXT_CLASS');
  v_hw := v_res -> 'task' ->> 'id';

  SELECT count(*) INTO v_n FROM learn_tasks WHERE id = v_hw;
  INSERT INTO t (name, verdict, detail) VALUES
    ('全班指派：任務內容只有一列',
     CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 列 task');

  SELECT count(*) INTO v_n FROM learn_task_assignees WHERE task_id = v_hw;
  INSERT INTO t (name, verdict, detail) VALUES
    ('全班指派：展開成在籍人數的 assignee 列',
     CASE WHEN v_n = 2 AND (v_res ->> 'assigned_count')::int = 2 THEN 'PASS' ELSE 'FAIL' END,
     v_n || ' 列 assignee');

  -- 只指派給部分學生
  v_res := learn_admin_upsert_task(NULL, v_class, 'HOMEWORK', '補救練習卷',
                                   NULL, 'CUSTOM_DATE', v_today + 5, NULL, NULL, ARRAY[v_ben]);
  v_hw2 := v_res -> 'task' ->> 'id';
  SELECT count(*) INTO v_n FROM learn_task_assignees WHERE task_id = v_hw2;
  INSERT INTO t (name, verdict, detail) VALUES
    ('只指派給選定的學生',
     CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 列 assignee');

  BEGIN
    PERFORM learn_admin_upsert_task(NULL, v_class, 'HOMEWORK', '亂指派', NULL,
                                    'NEXT_CLASS', NULL, NULL, NULL, ARRAY[v_cara]);
    INSERT INTO t (name, verdict, detail) VALUES ('不能指派給非在籍成員', 'FAIL', '竟然成功了');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t (name, verdict, detail) VALUES ('不能指派給非在籍成員', 'PASS', SQLERRM);
  END;

  /* ================= 7. NEXT_CLASS 解析 ================= */

  SELECT due_date INTO v_date FROM learn_tasks WHERE id = v_hw;
  INSERT INTO t (name, verdict, detail) VALUES
    ('NEXT_CLASS 作業的 due_date 保持 NULL（不快照日期）',
     CASE WHEN v_date IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_date::text, 'NULL'));

  v_res := learn_admin_set_next_class_date(v_class, v_today + 10);
  v_json := learn_admin_class_detail(v_class);
  SELECT (e ->> 'resolved_due_date')::date INTO v_date
    FROM jsonb_array_elements(v_json -> 'tasks') e WHERE e ->> 'task_id' = v_hw::text;
  INSERT INTO t (name, verdict, detail) VALUES
    ('改班級日期後，NEXT_CLASS 作業跟著移動',
     CASE WHEN v_date = v_today + 10 AND (v_res ->> 'affected_homework')::int = 1
          THEN 'PASS' ELSE 'FAIL' END,
     coalesce(v_date::text, 'NULL') || ' / 影響 ' || (v_res ->> 'affected_homework') || ' 筆');

  SELECT (e ->> 'resolved_due_date')::date INTO v_date
    FROM jsonb_array_elements(v_json -> 'tasks') e WHERE e ->> 'task_id' = v_hw2::text;
  INSERT INTO t (name, verdict, detail) VALUES
    ('CUSTOM_DATE 作業不受班級日期影響',
     CASE WHEN v_date = v_today + 5 THEN 'PASS' ELSE 'FAIL' END, coalesce(v_date::text, 'NULL'));

  /* ================= 8. 型別欄位互斥 ================= */

  BEGIN
    INSERT INTO learn_tasks (class_id, type, title, due_type, recurrence, target_per_period)
    VALUES (v_class, 'HOMEWORK', '四不像', 'NEXT_CLASS', 'DAILY', 1);
    INSERT INTO t (name, verdict, detail) VALUES ('CHECK 擋下 HOMEWORK 帶 recurrence', 'FAIL', '竟然寫進去了');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO t (name, verdict, detail) VALUES ('CHECK 擋下 HOMEWORK 帶 recurrence', 'PASS', '');
  END;

  BEGIN
    INSERT INTO learn_tasks (class_id, type, title, due_type, due_date)
    VALUES (v_class, 'HOMEWORK', '沒給日期的自訂截止', 'CUSTOM_DATE', NULL);
    INSERT INTO t (name, verdict, detail) VALUES ('CHECK 擋下 CUSTOM_DATE 沒有日期', 'FAIL', '竟然寫進去了');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO t (name, verdict, detail) VALUES ('CHECK 擋下 CUSTOM_DATE 沒有日期', 'PASS', '');
  END;

  BEGIN
    INSERT INTO learn_task_assignees (task_id, student_id, teacher_status, teacher_percent)
    VALUES (v_hw, v_cara, 'DONE', 80);
    INSERT INTO t (name, verdict, detail) VALUES ('CHECK 擋下非 PARTIAL 帶 percent', 'FAIL', '竟然寫進去了');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO t (name, verdict, detail) VALUES ('CHECK 擋下非 PARTIAL 帶 percent', 'PASS', '');
  END;

  /* ================= 9. 常態練習 ================= */

  v_res := learn_admin_upsert_task(NULL, v_class, 'RECURRING', '每天複習單字',
                                   NULL, NULL, NULL, 'DAILY', 1);
  v_rec := v_res -> 'task' ->> 'id';

  PERFORM pg_temp.as_student(v_amy);
  v_res := learn_student_log_recurring(v_rec);
  INSERT INTO t (name, verdict, detail) VALUES
    ('學生可以替自己的常態練習打卡',
     CASE WHEN (v_res ->> 'today_count')::int = 1 THEN 'PASS' ELSE 'FAIL' END, v_res::text);

  SELECT count(*) INTO v_n FROM learn_task_logs l
    JOIN learn_task_assignees a ON a.id = l.assignee_id
   WHERE a.task_id = v_rec;
  INSERT INTO t (name, verdict, detail) VALUES
    ('打卡不會預先產生每日任務列（一天一列）',
     CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 列 log');

  v_res := learn_student_log_recurring(v_rec, v_today, -1);
  SELECT count(*) INTO v_n FROM learn_task_logs l
    JOIN learn_task_assignees a ON a.id = l.assignee_id
   WHERE a.task_id = v_rec;
  INSERT INTO t (name, verdict, detail) VALUES
    ('取消打卡會把那一列刪掉',
     CASE WHEN v_n = 0 AND (v_res ->> 'today_count')::int = 0 THEN 'PASS' ELSE 'FAIL' END,
     v_n || ' 列 log');

  BEGIN
    PERFORM learn_student_log_recurring(v_rec, v_today + 1);
    INSERT INTO t (name, verdict, detail) VALUES ('不能替未來的日期打卡', 'FAIL', '竟然成功了');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t (name, verdict, detail) VALUES ('不能替未來的日期打卡', 'PASS', SQLERRM);
  END;

  PERFORM pg_temp.as_student(v_cara);
  BEGIN
    PERFORM learn_student_log_recurring(v_rec);
    INSERT INTO t (name, verdict, detail) VALUES ('不能替別人的練習打卡', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t (name, verdict, detail) VALUES ('不能替別人的練習打卡', 'PASS', '找不到你的這項常態練習');
  END;

  -- WEEKLY 的當期累計
  PERFORM pg_temp.as_admin(v_teacher);
  PERFORM learn_admin_upsert_task(v_rec, v_class, 'RECURRING', '每週閱讀',
                                  NULL, NULL, NULL, 'WEEKLY', 3);
  PERFORM pg_temp.as_student(v_amy);
  PERFORM learn_student_log_recurring(v_rec, v_today);
  IF v_today > date_trunc('week', v_today::timestamp)::date THEN
    v_res := learn_student_log_recurring(v_rec, v_today - 1);
    INSERT INTO t (name, verdict, detail) VALUES
      ('WEEKLY 的當期進度累計同一週的多天',
       CASE WHEN (v_res ->> 'period_count')::int = 2 THEN 'PASS' ELSE 'FAIL' END, v_res::text);
  ELSE
    INSERT INTO t (name, verdict, detail) VALUES
      ('WEEKLY 的當期進度累計同一週的多天', 'PASS', '今天是週一，跨週不測（避免假失敗）');
  END IF;

  /* ================= 10. 學生只看得到自己的 ================= */

  PERFORM pg_temp.as_student(v_amy);
  v_json := learn_student_tasks();
  SELECT count(*) INTO v_n FROM jsonb_array_elements(v_json -> 'homework');
  INSERT INTO t (name, verdict, detail) VALUES
    ('學生只拿到指派給自己的作業（Amy 1 筆，不含只給 Ben 的那筆）',
     CASE WHEN v_n = 1 AND v_json -> 'homework' -> 0 ->> 'task_id' = v_hw::text
          THEN 'PASS' ELSE 'FAIL' END, v_n || ' 筆');

  INSERT INTO t (name, verdict, detail) VALUES
    ('學生端回傳不含同班同學的名單或進度',
     CASE WHEN NOT (v_json::text LIKE '%' || v_ben::text || '%')
           AND NOT (v_json ? 'members')
          THEN 'PASS' ELSE 'FAIL' END, '');

  PERFORM pg_temp.as_student(v_cara);
  v_json := learn_student_tasks();
  SELECT count(*) INTO v_n FROM jsonb_array_elements(v_json -> 'homework');
  INSERT INTO t (name, verdict, detail) VALUES
    ('別班的學生拿不到這個班的作業',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 筆');

  /* ================= 11. 自述 ≠ 老師確認 ================= */

  PERFORM pg_temp.as_student(v_amy);
  v_res := learn_student_report_task(v_hw, true);
  SELECT teacher_status IS NULL INTO v_bool
    FROM learn_task_assignees WHERE task_id = v_hw AND student_id = v_amy;
  INSERT INTO t (name, verdict, detail) VALUES
    ('學生自述後，teacher_status 仍然是未檢查',
     CASE WHEN (v_res ->> 'student_reported')::boolean AND v_bool THEN 'PASS' ELSE 'FAIL' END, '');

  BEGIN
    PERFORM learn_student_report_task(v_hw2, true);
    INSERT INTO t (name, verdict, detail) VALUES ('學生不能自述沒指派給自己的作業', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t (name, verdict, detail) VALUES ('學生不能自述沒指派給自己的作業', 'PASS', '');
  END;

  BEGIN
    PERFORM learn_admin_check_task(v_hw, v_amy, 'DONE');
    INSERT INTO t (name, verdict, detail) VALUES ('學生不能替自己蓋老師確認章', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t (name, verdict, detail) VALUES ('學生不能替自己蓋老師確認章', 'PASS', '僅限管理員');
  END;

  PERFORM pg_temp.as_admin(v_teacher);
  PERFORM learn_admin_check_task(v_hw, v_amy, 'PARTIAL', 60, 'P.23–25 還沒寫');
  PERFORM pg_temp.as_student(v_amy);
  v_json := learn_student_tasks();
  INSERT INTO t (name, verdict, detail) VALUES
    ('老師的檢查結果與備註會出現在學生端',
     CASE WHEN v_json -> 'homework' -> 0 ->> 'teacher_status' = 'PARTIAL'
           AND (v_json -> 'homework' -> 0 ->> 'teacher_percent')::int = 60
           AND v_json -> 'homework' -> 0 ->> 'teacher_note' = 'P.23–25 還沒寫'
          THEN 'PASS' ELSE 'FAIL' END, (v_json -> 'homework' -> 0)::text);

  /* ================= 12. 改指派名單時保留有紀錄的人 ================= */

  PERFORM pg_temp.as_admin(v_teacher);
  v_res := learn_admin_upsert_task(v_hw, v_class, 'HOMEWORK', '講義 P.20–25',
                                   '寫完對答案', 'NEXT_CLASS', NULL, NULL, NULL, ARRAY[v_ben]);
  SELECT count(*) INTO v_n FROM learn_task_assignees WHERE task_id = v_hw AND student_id = v_amy;
  INSERT INTO t (name, verdict, detail) VALUES
    ('把已有紀錄的學生移出指派名單時，那一列被保留而不是靜靜刪掉',
     CASE WHEN v_n = 1 AND jsonb_array_length(v_res -> 'retained') = 1
          THEN 'PASS' ELSE 'FAIL' END, (v_res -> 'retained')::text);

  /* ================= 13. 名冊軟移除保留歷史 ================= */

  PERFORM learn_admin_remove_class_member(v_class, v_amy);
  SELECT count(*) INTO v_n FROM learn_class_members
   WHERE class_id = v_class AND student_id = v_amy AND left_at IS NOT NULL;
  INSERT INTO t (name, verdict, detail) VALUES
    ('移除名冊是軟移除（left_at），列還在',
     CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 列');

  SELECT count(*) INTO v_n FROM learn_task_assignees WHERE task_id = v_hw AND student_id = v_amy;
  INSERT INTO t (name, verdict, detail) VALUES
    ('退出名冊不會刪掉既有的指派與紀錄',
     CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 列 assignee');

  PERFORM learn_admin_add_class_members(v_class, ARRAY[v_amy]);
  SELECT count(*) INTO v_n FROM learn_class_members WHERE class_id = v_class AND student_id = v_amy;
  INSERT INTO t (name, verdict, detail) VALUES
    ('重新加入是清掉 left_at，不是新增第二列',
     CASE WHEN v_n = 1 AND (SELECT left_at IS NULL FROM learn_class_members
                             WHERE class_id = v_class AND student_id = v_amy)
          THEN 'PASS' ELSE 'FAIL' END, v_n || ' 列');

  /* ================= 14. 封存 ================= */

  PERFORM learn_admin_archive_class(v_class, true);
  PERFORM pg_temp.as_student(v_amy);
  v_json := learn_student_tasks();
  SELECT count(*) INTO v_n FROM jsonb_array_elements(v_json -> 'homework');
  INSERT INTO t (name, verdict, detail) VALUES
    ('封存班級後，學生端看不到它的任務',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 筆');

  PERFORM pg_temp.as_admin(v_teacher);
  SELECT count(*) INTO v_n FROM jsonb_array_elements(learn_admin_classes());
  INSERT INTO t (name, verdict, detail) VALUES
    ('封存班級不出現在預設清單',
     CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 個班');
END;
$test$;

INSERT INTO t (name, verdict, detail)
SELECT '總結',
       CASE WHEN count(*) = 0 THEN 'FAIL'                      -- DO 區塊中途失敗
            WHEN count(*) FILTER (WHERE verdict = 'FAIL') = 0 THEN 'PASS'
            ELSE 'FAIL' END,
       CASE WHEN count(*) = 0
            THEN '沒有跑到任何一項——上面的 ERROR 就是原因'
            ELSE count(*) FILTER (WHERE verdict = 'PASS') || ' / ' || count(*) END
  FROM t WHERE name <> '總結';

SELECT name AS "項目", verdict AS "結果", detail AS "說明" FROM t ORDER BY seq;
