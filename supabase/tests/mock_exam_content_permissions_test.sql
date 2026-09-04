-- =====================================================
-- mock 模考「題目內容」權限硬化測試
--
-- ⚠️ psql 專用（使用 \echo）。不要貼進 Supabase SQL Editor。
--
-- 執行方式：
--   createdb contentx
--   cd supabase/tests
--   psql -v ON_ERROR_STOP=1 -d contentx -f mock_exam_prod_fixture.sql
--   psql -v ON_ERROR_STOP=1 -d contentx -f ../migrations/bootstrap_is_admin.sql
--   psql -v ON_ERROR_STOP=1 -d contentx -f ../migrations/harden_mock_exam_content_permissions.sql
--   psql -v ON_ERROR_STOP=1 -d contentx -f mock_exam_content_permissions_test.sql
--
-- 重點：全部以真實的 PostgreSQL 角色（anon / authenticated / service_role）執行，
-- 不透過應用程式碼。學生就算自己組 PostgREST 請求也拿不到答案鍵——
-- 前端不顯示某個欄位「不算」安全措施。
-- =====================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION t_assert(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

-- 以指定身分執行一段 SQL，回報是否被擋下、以及擋下的 SQLSTATE
CREATE OR REPLACE FUNCTION t_denied(p_role text, p_uid text, p_sql text, p_label text,
                                    p_expect_sqlstate text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_state text; v_msg text;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    IF p_uid IS NULL THEN
      PERFORM set_config('request.jwt.claims', '', true);
    ELSE
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', p_uid, 'role', p_role)::text, true);
    END IF;
    EXECUTE p_sql;
    RESET ROLE;
    RAISE EXCEPTION 'FAIL  % （預期被擋，卻成功了）', p_label;
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE; v_msg := SQLERRM;
    RESET ROLE;
    IF v_msg LIKE 'FAIL %' THEN RAISE; END IF;
    IF p_expect_sqlstate IS NOT NULL AND v_state <> p_expect_sqlstate THEN
      RAISE EXCEPTION 'FAIL  % （被擋，但 SQLSTATE 是 % 而不是 %：%）',
        p_label, v_state, p_expect_sqlstate, left(v_msg, 80);
    END IF;
    RAISE NOTICE 'PASS  % （% %）', p_label, v_state, left(v_msg, 70);
  END;
END $$;

-- 以指定身分執行寫入，回傳影響列數（用於「應為 0 列」的情況）
CREATE OR REPLACE FUNCTION t_rowcount(p_role text, p_uid text, p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  RETURN n;
END $$;

-- 以指定身分執行單值查詢
CREATE OR REPLACE FUNCTION t_scalar(p_role text, p_uid text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  IF p_uid IS NULL THEN
    PERFORM set_config('request.jwt.claims', '', true);
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', p_uid, 'role', p_role)::text, true);
  END IF;
  EXECUTE p_sql INTO v;
  RESET ROLE;
  RETURN v;
END $$;

-- ── 佈置：一份 published 與一份 draft 考卷（以 owner 身分建立）──
DELETE FROM exams WHERE id IN ('content-pub','content-draft','admin-made');

INSERT INTO exams (id,title,year,status,notes)
  VALUES ('content-pub','published paper',2026,'published','教師備註不該外流'),
         ('content-draft','draft paper',2026,'draft','草稿');
INSERT INTO question_groups (id,exam_id,group_type,group_order,title,content,content_translation)
  VALUES ('content-pub-g1','content-pub','cloze',1,'cloze','A passage.','這段的中譯');
INSERT INTO group_questions (id,group_id,question_number,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,grammar_large)
  VALUES ('c1000000-0000-0000-0000-000000000001','content-pub-g1',1,'blank 1','a','b','c','d','C','因為 C','時態與語態');
INSERT INTO vocabulary_questions (exam_id,question_number,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation)
  VALUES ('content-pub',1,'vocab q','a','b','c','d','B','因為 B');
INSERT INTO translation_questions (exam_id,question_number,chinese_text,reference_answer,scoring_criteria)
  VALUES ('content-pub','1','中文句','THE REFERENCE ANSWER','逐項給分');
INSERT INTO essay_questions (exam_id,question_number,prompt,sample_essay,scoring_criteria,writing_tips)
  VALUES ('content-pub','1','Write.','SAMPLE ESSAY','評分標準','寫作提示');
-- draft 考卷也要有題目，才能證明 draft 對學生不可見
INSERT INTO vocabulary_questions (exam_id,question_number,question_text,option_a,option_b,option_c,option_d,correct_answer)
  VALUES ('content-draft',1,'draft q','a','b','c','d','A');

\echo '--- 寫入安全：anon ---'
SELECT t_denied('anon', NULL,
  $$INSERT INTO exams (id,title,year) VALUES ('anon-evil','x',2026)$$,
  '1  anon 不可 INSERT 考卷', '42501');
SELECT t_denied('anon', NULL,
  $$UPDATE exams SET title='hacked' WHERE id='content-pub'$$,
  '2  anon 不可 UPDATE 考卷', '42501');
SELECT t_denied('anon', NULL,
  $$DELETE FROM exams WHERE id='content-pub'$$,
  '3  anon 不可 DELETE 考卷', '42501');
SELECT t_denied('anon', NULL, $$TRUNCATE exams CASCADE$$,
  '4a anon 不可 TRUNCATE exams', '42501');
SELECT t_denied('anon', NULL, $$TRUNCATE vocabulary_questions$$,
  '4b anon 不可 TRUNCATE vocabulary_questions', '42501');
SELECT t_denied('anon', NULL, $$TRUNCATE group_questions$$,
  '4c anon 不可 TRUNCATE group_questions', '42501');

\echo '--- 寫入安全：一般學生 ---'
SELECT t_denied('authenticated', 'dddddddd-0000-0000-0000-00000000000b',
  $$INSERT INTO exams (id,title,year) VALUES ('stu-evil','x',2026)$$,
  '5  學生不可 INSERT 考卷', '42501');
SELECT t_assert(t_rowcount('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$UPDATE exams SET title='hacked' WHERE id='content-pub'$$) = 0,
  '6  學生 UPDATE 考卷影響 0 列');
SELECT t_assert(t_rowcount('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$UPDATE vocabulary_questions SET correct_answer='A' WHERE exam_id='content-pub'$$) = 0,
  '7  學生改答案鍵影響 0 列');
SELECT t_assert((SELECT correct_answer FROM vocabulary_questions WHERE exam_id='content-pub') = 'B',
  '7b 答案鍵確實沒被改動');
SELECT t_assert(t_rowcount('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$DELETE FROM vocabulary_questions WHERE exam_id='content-pub'$$) = 0,
  '8  學生 DELETE 題目影響 0 列');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$TRUNCATE exams CASCADE$$, '9a 學生不可 TRUNCATE exams', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$TRUNCATE vocabulary_questions$$, '9b 學生不可 TRUNCATE vocabulary_questions', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$TRUNCATE essay_questions$$, '9c 學生不可 TRUNCATE essay_questions', '42501');

\echo '--- admin CRUD ---'
SELECT t_assert(t_rowcount('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$INSERT INTO exams (id,title,year,status) VALUES ('admin-made','admin paper',2026,'draft')$$) = 1,
  '10 admin 可以 INSERT 考卷');
SELECT t_assert(t_rowcount('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$UPDATE exams SET title='admin paper v2' WHERE id='admin-made'$$) = 1,
  '11 admin 可以 UPDATE 考卷');
SELECT t_assert((SELECT title FROM exams WHERE id='admin-made') = 'admin paper v2',
  '11b 修改確實寫進去了');

SELECT t_assert(t_rowcount('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$INSERT INTO question_groups (id,exam_id,group_type,group_order,content)
    VALUES ('admin-made-g1','admin-made','reading',1,'passage')$$) = 1,
  '13a admin 可以 INSERT question_groups');
SELECT t_assert(t_rowcount('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$INSERT INTO group_questions (group_id,question_number,correct_answer)
    VALUES ('admin-made-g1',1,'D')$$) = 1,
  '13b admin 可以 INSERT group_questions（含答案鍵）');
SELECT t_assert(t_rowcount('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$UPDATE group_questions SET correct_answer='A' WHERE group_id='admin-made-g1'$$) = 1,
  '13c admin 可以修改答案鍵');
SELECT t_assert(t_rowcount('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$INSERT INTO vocabulary_questions (exam_id,question_number,question_text,option_a,option_b,option_c,option_d,correct_answer)
    VALUES ('admin-made',1,'q','a','b','c','d','A')$$) = 1,
  '13d admin 可以 INSERT vocabulary_questions');
SELECT t_assert(t_rowcount('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$INSERT INTO translation_questions (exam_id,question_number,chinese_text,reference_answer)
    VALUES ('admin-made','1','中文','ref')$$) = 1,
  '13e admin 可以 INSERT translation_questions');
SELECT t_assert(t_rowcount('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$INSERT INTO essay_questions (exam_id,question_number,prompt)
    VALUES ('admin-made','1','write')$$) = 1,
  '13f admin 可以 INSERT essay_questions');
SELECT t_assert(t_rowcount('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$DELETE FROM essay_questions WHERE exam_id='admin-made'$$) = 1,
  '13g admin 可以 DELETE 題目');
SELECT t_assert(t_rowcount('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$DELETE FROM exams WHERE id='admin-made'$$) = 1,
  '12 admin 可以 DELETE 考卷');

\echo '--- 已知限制：admin 的 RETURNING 讀不回受限欄位 ---'
-- 欄位級 SELECT 是「角色」層級的，admin 也是 authenticated，
-- 所以 INSERT ... RETURNING *（PostgREST 的預設行為）會失敗。
-- 這是實作時發現的設計缺口，記錄成測試以免被忘記。
SELECT t_denied('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$INSERT INTO exams (id,title,year,notes) VALUES ('admin-ret','x',2026,'n') RETURNING *$$,
  'X1 admin 的 INSERT ... RETURNING * 會被欄位級權限擋下（已知限制，見報告）', '42501');

\echo '--- 讀取安全：anon ---'
SELECT t_denied('anon', NULL, $$SELECT count(*) FROM exams$$,
  '14a anon 讀不到 exams', '42501');
SELECT t_denied('anon', NULL, $$SELECT count(*) FROM vocabulary_questions$$,
  '14b anon 讀不到 vocabulary_questions', '42501');
SELECT t_denied('anon', NULL, $$SELECT count(*) FROM essay_questions$$,
  '14c anon 讀不到 essay_questions', '42501');

\echo '--- 讀取安全：學生看得到安全欄位 ---'
SELECT t_assert(t_scalar('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT title FROM exams WHERE id='content-pub'$$) = 'published paper',
  '15a 學生讀得到 published 考卷的 title');
SELECT t_assert(t_scalar('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT question_text FROM vocabulary_questions WHERE exam_id='content-pub'$$) = 'vocab q',
  '15b 學生讀得到單字題題目與選項');
SELECT t_assert(t_scalar('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT chinese_text FROM translation_questions WHERE exam_id='content-pub'$$) = '中文句',
  '15c 學生讀得到翻譯題的中文');
SELECT t_assert(t_scalar('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT prompt FROM essay_questions WHERE exam_id='content-pub'$$) = 'Write.',
  '15d 學生讀得到作文題題目');

\echo '--- 讀取安全：答案鍵與教師欄位一律讀不到 ---'
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT correct_answer FROM vocabulary_questions WHERE exam_id='content-pub'$$,
  '16 學生讀不到 vocabulary_questions.correct_answer', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT correct_answer FROM group_questions$$,
  '17 學生讀不到 group_questions.correct_answer', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT reference_answer FROM translation_questions$$,
  '18 學生讀不到 translation_questions.reference_answer', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT scoring_criteria FROM translation_questions$$,
  '19 學生讀不到 translation_questions.scoring_criteria', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT sample_essay FROM essay_questions$$,
  '20 學生讀不到 essay_questions.sample_essay', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT scoring_criteria FROM essay_questions$$,
  '21 學生讀不到 essay_questions.scoring_criteria', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT writing_tips FROM essay_questions$$,
  '22a 學生讀不到 essay_questions.writing_tips', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT explanation FROM vocabulary_questions$$,
  '22b 學生讀不到 explanation', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT grammar_large FROM group_questions$$,
  '22c 學生讀不到 grammar 標籤', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT level_tag FROM vocabulary_questions$$,
  '22d 學生讀不到 level 標籤', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT topic_tags FROM essay_questions$$,
  '22e 學生讀不到 topic 標籤', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT content_translation FROM question_groups$$,
  '22f 學生讀不到題組的中譯', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT notes FROM exams$$,
  '22g 學生讀不到 exams.notes', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT created_by FROM exams$$,
  '22h 學生讀不到 exams.created_by', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT * FROM vocabulary_questions$$,
  '22i SELECT * 直接被擋（前端必須改用明確欄位清單）', '42501');

\echo '--- RLS 仍然正常：draft 隱形、published 可穿透 ---'
SELECT t_assert(t_scalar('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT count(*)::text FROM exams WHERE id='content-draft'$$) = '0',
  '23a 學生看不到 draft 考卷');
SELECT t_assert(t_scalar('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT count(*)::text FROM vocabulary_questions WHERE exam_id='content-draft'$$) = '0',
  '23b 學生看不到 draft 考卷的題目');
SELECT t_assert(t_scalar('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT count(*)::text FROM exams e
    JOIN question_groups g ON g.exam_id = e.id
    JOIN group_questions q ON q.group_id = g.id
    WHERE e.id='content-pub'$$) = '1',
  '24 published 的 exams → question_groups → group_questions 串接仍可讀');
SELECT t_assert(t_scalar('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT count(*)::text FROM vocabulary_questions WHERE exam_id='content-pub'$$) = '1',
  '25 政策子查詢不會 permission denied for table exams');

\echo '--- is_admin() ---'
SELECT t_assert(t_scalar('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT is_admin()::text$$) = 'true',
  '26 is_admin() 對既有 admin 仍回 true');
SELECT t_assert(t_scalar('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT is_admin()::text$$) = 'false',
  '27 is_admin() 對一般使用者回 false');
SELECT t_assert((SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='is_admin'),
  '28 is_admin() 仍是 SECURITY DEFINER');
SELECT t_assert((SELECT array_to_string(proconfig,',') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='is_admin') = 'search_path=public',
  '29 is_admin() 的 search_path 與正式環境一致（public）');
SELECT t_assert((SELECT md5(regexp_replace(replace(prosrc, chr(13), ''), '[[:space:]]+', ' ', 'g'))
                 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='is_admin')
                IN ('b0dc3065d87e4196524357d2d080e276', '4f2510c540d405db752d1a70d5b0cffb'),
  '30 is_admin() 的授權語意未改變（本體指紋為已知的正式／repo 版之一）');

\echo '--- service_role 不受影響 ---'
SELECT t_assert(t_scalar('service_role', NULL,
  $$SELECT correct_answer FROM vocabulary_questions WHERE exam_id='content-pub'$$) = 'B',
  '35a service_role 仍讀得到答案鍵');
SELECT t_assert(t_scalar('service_role', NULL,
  $$SELECT count(*)::text FROM exams$$)::int >= 2,
  '35b service_role 看得到全部考卷（含 draft）');
SELECT t_assert(t_rowcount('service_role', NULL,
  $$UPDATE exams SET notes='service_role 可寫' WHERE id='content-pub'$$) = 1,
  '35c service_role 仍可寫入');

\echo '--- 授權矩陣 ---'
SELECT t_assert((SELECT count(*) FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND grantee='anon'
                   AND table_name IN ('exams','question_groups','group_questions',
                       'vocabulary_questions','translation_questions','essay_questions')) = 0,
  'M1 anon 在六張內容表上零授權');
SELECT t_assert((SELECT count(*) FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND grantee='authenticated'
                   AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')
                   AND table_name IN ('exams','question_groups','group_questions',
                       'vocabulary_questions','translation_questions','essay_questions')) = 0,
  'M2 authenticated 沒有 TRUNCATE / REFERENCES / TRIGGER');
SELECT t_assert((SELECT count(*) FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND grantee='service_role'
                   AND table_name IN ('exams','question_groups','group_questions',
                       'vocabulary_questions','translation_questions','essay_questions')) = 42,
  'M3 service_role 的 42 項授權原封不動');
SELECT t_assert((SELECT count(*) FROM pg_policies
                 WHERE schemaname='public' AND policyname LIKE 'mock\_content\_%') = 24,
  'M4 新增 24 條 mock_content_ 政策');
-- 只數這六張表：legacy iLearn 的 "Exam types viewable by all" 也含 viewable，
-- 不限定表名的話會多數到它。
SELECT t_assert((SELECT count(*) FROM pg_policies
                 WHERE schemaname='public' AND policyname LIKE '%viewable%'
                   AND tablename IN ('exams','question_groups','group_questions',
                       'vocabulary_questions','translation_questions','essay_questions')) = 6,
  'M5 既有 6 條 published SELECT 政策未被動到');

\echo '--- 邊界：作答表與 legacy 未受影響 ---'
SELECT t_assert((SELECT count(*) FROM pg_policies
                 WHERE schemaname='public'
                   AND tablename IN ('exam_attempts','exam_user_answers')
                   AND policyname LIKE 'mock\_content\_%') = 0,
  '34a 作答表上沒有 mock_content_ 政策');
SELECT t_assert(to_regclass('public.exam_records') IS NULL
                OR (SELECT count(*) FROM pg_policies
                    WHERE schemaname='public' AND tablename IN ('exam_records','exam_types')
                      AND policyname LIKE 'mock\_content\_%') = 0,
  '34b legacy iLearn 表上沒有 mock_content_ 政策');

-- 收尾：清掉本測試建立的考卷
DELETE FROM exams WHERE id IN ('content-pub','content-draft','admin-made','admin-ret');

\echo '=== 內容權限測試全部通過 ==='
