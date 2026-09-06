-- =====================================================
-- writing_teacher_feedback 的安全與行為測試
--
-- 🛑 本機專用。不要在 staging 或正式環境執行——它會寫入資料，
--    而且依賴本機把 auth.uid() / is_admin() 換成讀 GUC 的替身。
--
-- 執行前置（見 tests/sql/README 或這個檔頭的說明）：
--   建 anon / authenticated / service_role 角色、auth.users、
--   writing_submissions、user_profiles，並重現 Supabase 的
--   ALTER DEFAULT PRIVILEGES，再套用 create_writing_teacher_feedback.sql。
--
-- 輸出一張表：項目 / 結果 / 說明。
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS t (seq SERIAL, name TEXT, verdict TEXT, detail TEXT);
TRUNCATE t;

DO $test$
DECLARE
  v_teacher UUID;
  v_student UUID;
  v_other   UUID;
  v_essay   UUID;
  v_n       INTEGER;
  v_bool    BOOLEAN;
  v_txt     TEXT;
  v_json    JSONB;
BEGIN
  INSERT INTO auth.users (email) VALUES ('teacher@test') RETURNING id INTO v_teacher;
  INSERT INTO auth.users (email) VALUES ('student@test') RETURNING id INTO v_student;
  INSERT INTO auth.users (email) VALUES ('other@test')   RETURNING id INTO v_other;
  INSERT INTO user_profiles (user_id, display_name) VALUES (v_teacher, '王老師');
  INSERT INTO writing_submissions (student_id, title) VALUES (v_student, '測試作文')
    RETURNING id INTO v_essay;

  /* ---------- 權限：這張表誰都不該碰得到 ---------- */
  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
   WHERE table_name = 'writing_teacher_feedback'
     AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC');
  INSERT INTO t (name, verdict, detail) VALUES
    ('anon / authenticated / service_role 對表沒有任何權限',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 項授權');

  SELECT relrowsecurity INTO v_bool FROM pg_class WHERE relname = 'writing_teacher_feedback';
  INSERT INTO t (name, verdict, detail) VALUES
    ('RLS 已啟用', CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END, '');

  SELECT count(*) INTO v_n FROM pg_policies WHERE tablename = 'writing_teacher_feedback';
  INSERT INTO t (name, verdict, detail) VALUES
    ('沒有任何 RLS 政策（唯一入口是 SECURITY DEFINER 函式）',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 條政策');

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('writing_upsert_teacher_feedback', 'writing_teacher_feedback_for')
     AND p.prosecdef AND p.proconfig::text LIKE '%search_path%';
  INSERT INTO t (name, verdict, detail) VALUES
    ('兩支函式皆 SECURITY DEFINER 且鎖定 search_path',
     CASE WHEN v_n = 2 THEN 'PASS' ELSE 'FAIL' END, v_n || '/2');

  SELECT count(*) INTO v_n FROM information_schema.role_routine_grants
   WHERE routine_name IN ('writing_upsert_teacher_feedback', 'writing_teacher_feedback_for')
     AND grantee = 'anon';
  INSERT INTO t (name, verdict, detail) VALUES
    ('anon 不能執行任何一支函式',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 支可執行');

  /* ---------- 寫入：僅限管理員 ---------- */
  PERFORM set_config('test.uid', v_student::text, true);
  PERFORM set_config('test.admin', 'false', true);
  BEGIN
    PERFORM writing_upsert_teacher_feedback(v_essay, '學生自己寫的假講評');
    INSERT INTO t (name, verdict, detail) VALUES ('學生無法寫入講評', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t (name, verdict, detail) VALUES ('學生無法寫入講評', 'PASS', '僅限管理員');
  END;

  PERFORM set_config('test.admin', '', true);
  BEGIN
    PERFORM writing_upsert_teacher_feedback(v_essay, '未登入的假講評');
    INSERT INTO t (name, verdict, detail) VALUES ('is_admin() 回 NULL 時也擋下', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t (name, verdict, detail) VALUES ('is_admin() 回 NULL 時也擋下', 'PASS', 'coalesce 生效');
  END;

  /* ---------- 老師寫入 ---------- */
  PERFORM set_config('test.uid', v_teacher::text, true);
  PERFORM set_config('test.admin', 'true', true);
  PERFORM writing_upsert_teacher_feedback(v_essay, '  這次結構進步很多，下次注意時態一致。  ');
  SELECT body INTO v_txt FROM writing_teacher_feedback WHERE essay_id = v_essay;
  INSERT INTO t (name, verdict, detail) VALUES
    ('老師可以寫入，且前後空白被去掉',
     CASE WHEN v_txt = '這次結構進步很多，下次注意時態一致。' THEN 'PASS' ELSE 'FAIL' END, v_txt);

  /* ---------- 一篇一則：再寫是覆蓋不是新增 ---------- */
  PERFORM writing_upsert_teacher_feedback(v_essay, '改過的講評');
  SELECT count(*) INTO v_n FROM writing_teacher_feedback WHERE essay_id = v_essay;
  SELECT body INTO v_txt FROM writing_teacher_feedback WHERE essay_id = v_essay;
  INSERT INTO t (name, verdict, detail) VALUES
    ('再次寫入是覆蓋，一篇作文仍只有一則',
     CASE WHEN v_n = 1 AND v_txt = '改過的講評' THEN 'PASS' ELSE 'FAIL' END, v_n || ' 列');

  /* ---------- 讀取：本人學生 ---------- */
  PERFORM set_config('test.uid', v_student::text, true);
  PERFORM set_config('test.admin', 'false', true);
  v_json := writing_teacher_feedback_for(v_essay);
  INSERT INTO t (name, verdict, detail) VALUES
    ('學生讀得到自己作文的講評',
     CASE WHEN v_json ->> 'body' = '改過的講評' THEN 'PASS' ELSE 'FAIL' END, coalesce(v_json::text, 'NULL'));
  INSERT INTO t (name, verdict, detail) VALUES
    ('回傳老師姓名，但不回傳 author_id',
     CASE WHEN v_json ->> 'author_name' = '王老師' AND NOT (v_json ? 'author_id')
          THEN 'PASS' ELSE 'FAIL' END, coalesce(v_json ->> 'author_name', 'NULL'));

  /* ---------- 讀取：別的學生 ---------- */
  PERFORM set_config('test.uid', v_other::text, true);
  v_json := writing_teacher_feedback_for(v_essay);
  INSERT INTO t (name, verdict, detail) VALUES
    ('別的學生讀不到（回 NULL）',
     CASE WHEN v_json IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_json::text, 'NULL'));

  /* ---------- 讀取：管理員 ---------- */
  PERFORM set_config('test.uid', v_teacher::text, true);
  PERFORM set_config('test.admin', 'true', true);
  v_json := writing_teacher_feedback_for(v_essay);
  INSERT INTO t (name, verdict, detail) VALUES
    ('管理員讀得到',
     CASE WHEN v_json ->> 'body' = '改過的講評' THEN 'PASS' ELSE 'FAIL' END, '');

  /* ---------- 清除：空白 = 刪列 ---------- */
  PERFORM writing_upsert_teacher_feedback(v_essay, '   ');
  SELECT count(*) INTO v_n FROM writing_teacher_feedback WHERE essay_id = v_essay;
  INSERT INTO t (name, verdict, detail) VALUES
    ('空白內容代表清除（刪列，不是存空字串）',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 列');

  PERFORM set_config('test.uid', v_student::text, true);
  PERFORM set_config('test.admin', 'false', true);
  v_json := writing_teacher_feedback_for(v_essay);
  INSERT INTO t (name, verdict, detail) VALUES
    ('清除後學生端讀到 NULL（區塊整個不顯示）',
     CASE WHEN v_json IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_json::text, 'NULL'));

  /* ---------- 不存在的作文 ---------- */
  PERFORM set_config('test.uid', v_teacher::text, true);
  PERFORM set_config('test.admin', 'true', true);
  BEGIN
    PERFORM writing_upsert_teacher_feedback(gen_random_uuid(), '對不存在的作文寫講評');
    INSERT INTO t (name, verdict, detail) VALUES ('不存在的作文被擋下', 'FAIL', '竟然成功了');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t (name, verdict, detail) VALUES ('不存在的作文被擋下', 'PASS', SQLERRM);
  END;

  /* ---------- 空白內容進不了資料表 ---------- */
  BEGIN
    INSERT INTO writing_teacher_feedback (essay_id, body, author_id)
    VALUES (v_essay, '   ', v_teacher);
    INSERT INTO t (name, verdict, detail) VALUES ('CHECK 擋下空白 body', 'FAIL', '竟然寫進去了');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO t (name, verdict, detail) VALUES ('CHECK 擋下空白 body', 'PASS', '');
  END;
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
