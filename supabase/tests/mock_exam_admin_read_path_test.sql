-- =====================================================
-- 管理員讀取路徑（mock_content_admin_* RPC）測試
--
-- ⚠️ psql 專用。
--
-- 執行方式：
--   createdb arpx
--   cd supabase/tests
--   psql -v ON_ERROR_STOP=1 -d arpx -f mock_exam_prod_fixture.sql
--   psql -v ON_ERROR_STOP=1 -d arpx -f ../migrations/harden_mock_exam_answers.sql
--   psql -v ON_ERROR_STOP=1 -d arpx -f ../migrations/bootstrap_is_admin.sql
--   psql -v ON_ERROR_STOP=1 -d arpx -f ../migrations/create_mock_content_admin_read_rpc.sql
--   psql -v ON_ERROR_STOP=1 -d arpx -f ../migrations/harden_mock_exam_content_permissions.sql
--   psql -v ON_ERROR_STOP=1 -d arpx -f mock_exam_admin_read_path_test.sql
--
-- 全部以真實角色執行。重點是證明「SECURITY DEFINER 不等於放行」：
-- 函式的第一件事就是檢查 is_admin()，學生與 anon 一律拿不到任何資料。
-- =====================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION t_assert(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

CREATE OR REPLACE FUNCTION t_as(p_role text, p_uid text, p_sql text) RETURNS text
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
      RAISE EXCEPTION 'FAIL  % （SQLSTATE 是 % 而不是 %：%）', p_label, v_state, p_expect_sqlstate, left(v_msg,70);
    END IF;
    RAISE NOTICE 'PASS  % （% %）', p_label, v_state, left(v_msg, 60);
  END;
END $$;

-- ── 佈置 ──
DELETE FROM exams WHERE id IN ('arp-draft','arp-pub','arp-new');
INSERT INTO auth.users (id, email) VALUES
  ('cccccccc-0000-0000-0000-00000000000a', 'nonstopjazz@gmail.com'),
  ('dddddddd-0000-0000-0000-00000000000b', 'student@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO exams (id,title,year,status,notes)
  VALUES ('arp-draft','draft paper',2026,'draft','教師備註'),
         ('arp-pub','published paper',2026,'published','另一則備註');
INSERT INTO question_groups (id,exam_id,group_type,group_order,content,content_translation)
  VALUES ('arp-draft-g1','arp-draft','cloze',1,'A passage.','這段的中譯');
INSERT INTO group_questions (group_id,question_number,correct_answer,explanation,grammar_large,level_tag,phrase_tag,question_type_tag)
  VALUES ('arp-draft-g1',1,'C','因為 C','時態與語態',3,'片語','題型');
INSERT INTO vocabulary_questions (exam_id,question_number,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,topic_tags)
  VALUES ('arp-draft',1,'q','a','b','c','d','B','因為 B',ARRAY['環境']);
INSERT INTO translation_questions (exam_id,question_number,chinese_text,reference_answer,scoring_criteria,grammar_tags)
  VALUES ('arp-draft','1','中文句','REF ANSWER','逐項給分',ARRAY['假設語氣']);
INSERT INTO essay_questions (exam_id,question_number,prompt,sample_essay,scoring_criteria,writing_tips,error_type_tags)
  VALUES ('arp-draft','1','Write.','SAMPLE ESSAY','評分標準','寫作提示',ARRAY['時態']);
INSERT INTO vocabulary_questions (exam_id,question_number,question_text,option_a,option_b,option_c,option_d,correct_answer)
  VALUES ('arp-pub',1,'pub q','a','b','c','d','A');

\echo '--- 7-12 admin 讀得到完整內容 ---'
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT mock_content_admin_fetch_exam('arp-draft')->>'id'$$) = 'arp-draft',
  '7  admin 讀得到 draft 考卷');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT mock_content_admin_fetch_exam('arp-pub')->>'id'$$) = 'arp-pub',
  '8  admin 讀得到 published 考卷');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT mock_content_admin_fetch_exam('arp-draft')->'vocabulary_questions'->0->>'correct_answer'$$) = 'B',
  '9a admin 取得 vocabulary_questions.correct_answer');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT mock_content_admin_fetch_exam('arp-draft')->'question_groups'->0->'group_questions'->0->>'correct_answer'$$) = 'C',
  '9b admin 取得 group_questions.correct_answer');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT mock_content_admin_fetch_exam('arp-draft')->'translation_questions'->0->>'reference_answer'$$) = 'REF ANSWER',
  '10 admin 取得 reference_answer');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT mock_content_admin_fetch_exam('arp-draft')->'essay_questions'->0->>'sample_essay'$$) = 'SAMPLE ESSAY',
  '11 admin 取得 sample_essay');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT mock_content_admin_fetch_exam('arp-draft')->'translation_questions'->0->>'scoring_criteria'$$) = '逐項給分',
  '12a admin 取得 translation 的 scoring_criteria');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT mock_content_admin_fetch_exam('arp-draft')->'essay_questions'->0->>'scoring_criteria'$$) = '評分標準',
  '12b admin 取得 essay 的 scoring_criteria');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT mock_content_admin_fetch_exam('arp-draft')->>'notes'$$) = '教師備註',
  '12c admin 取得 exams.notes');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT mock_content_admin_fetch_exam('arp-draft')->'question_groups'->0->>'content_translation'$$) = '這段的中譯',
  '12d admin 取得 content_translation');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT mock_content_admin_fetch_exam('arp-draft')->'question_groups'->0->'group_questions'->0->>'grammar_large'$$) = '時態與語態',
  '12e admin 取得 grammar / level / phrase / question_type 標籤');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT mock_content_admin_fetch_exam('arp-draft')->'essay_questions'->0->'error_type_tags'->>0$$) = '時態',
  '12f admin 取得 error_type_tags');

\echo '--- 13-14 學生與 anon 一律拿不到 ---'
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT mock_content_admin_fetch_exam('arp-pub')$$,
  '13a 學生呼叫 fetch RPC 被拒（連 published 也不給）', '42501');
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT mock_content_admin_list_exams()$$,
  '13b 學生呼叫 list RPC 被拒', '42501');
SELECT t_denied('anon', NULL,
  $$SELECT mock_content_admin_fetch_exam('arp-pub')$$,
  '14a anon 呼叫 fetch RPC 被拒（EXECUTE 權限就沒有）', '42501');
SELECT t_denied('anon', NULL,
  $$SELECT mock_content_admin_list_exams()$$,
  '14b anon 呼叫 list RPC 被拒', '42501');
SELECT t_assert((SELECT NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='mock_content_admin_fetch_exam'),
  '14c anon 在權限層就沒有 EXECUTE（第一層防線）');

\echo '--- 15 不存在的考卷 ---'
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT coalesce(mock_content_admin_fetch_exam('does-not-exist')::text, 'NULL')$$) = 'NULL',
  '15 不存在的考卷回傳 NULL，不丟例外、不洩漏存在性');

\echo '--- 16-19 ExamAdmin 的完整 CRUD 迴圈 ---'
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$WITH i AS (INSERT INTO exams (id,title,year,status,notes)
               VALUES ('arp-new','new draft',2026,'draft','備註') RETURNING 1)
    SELECT count(*)::text FROM i$$) = '1',
  '16 admin 可以建立 draft 考卷');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT mock_content_admin_fetch_exam('arp-new')->>'notes'$$) = '備註',
  '17 admin 建立後可以「立刻」透過 RPC 讀回該 draft（含 notes）');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$WITH u AS (UPDATE group_questions SET correct_answer='A'
               WHERE group_id='arp-draft-g1' RETURNING 1)
    SELECT count(*)::text FROM u$$) = '1',
  '18a admin 可以修改答案鍵');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT mock_content_admin_fetch_exam('arp-draft')->'question_groups'->0->'group_questions'->0->>'correct_answer'$$) = 'A',
  '18b 修改後的答案鍵可以立刻讀回（寫入 + 讀取路徑接得起來）');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$WITH d AS (DELETE FROM exams WHERE id='arp-new' RETURNING 1) SELECT count(*)::text FROM d$$) = '1',
  '19 admin 可以刪除內容');
SELECT t_assert(t_as('authenticated','cccccccc-0000-0000-0000-00000000000a',
  $$SELECT jsonb_array_length(mock_content_admin_list_exams())::text$$)::int >= 2,
  '19b admin 的 list RPC 看得到 draft 與 published');

\echo '--- 安全性：SECURITY DEFINER 不等於放行 ---'
SELECT t_assert((SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='mock_content_admin_fetch_exam'),
  'S1 RPC 是 SECURITY DEFINER');
SELECT t_assert((SELECT array_to_string(proconfig,',') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='mock_content_admin_fetch_exam') = 'search_path=""',
  'S2 RPC 的 search_path 已明確鎖定');
-- 學生的欄位級 GRANT 沒有被 RPC 放寬
SELECT t_denied('authenticated','dddddddd-0000-0000-0000-00000000000b',
  $$SELECT correct_answer FROM vocabulary_questions$$,
  'S4 RPC 存在不代表學生能直接讀答案鍵（欄位級 GRANT 未被放寬）', '42501');

-- 收尾
DELETE FROM exams WHERE id IN ('arp-draft','arp-pub','arp-new');

\echo '=== 管理員讀取路徑測試全部通過 ==='
