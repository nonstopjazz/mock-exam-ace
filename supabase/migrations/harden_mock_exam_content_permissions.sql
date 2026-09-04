-- =====================================================
-- mock 模考「題目內容」權限硬化
--
-- 範圍嚴格限制在六張內容表：
--   exams · question_groups · group_questions
--   vocabulary_questions · translation_questions · essay_questions
--
-- 不碰：exam_attempts、exam_user_answers（作答硬化已另外處理）、
--       iLearn 的 exam_records / exam_types、writing_* 系列、任何其他資料表。
--
-- 稽核發現（在 staging 的複本上以真實角色實測）：
--
--   1. 這六張表對 anon 與 authenticated 都是 Supabase 預設權限的全套七項。
--      寫入目前打不穿，但擋住它的是 RLS（這幾張表只有 SELECT 政策，
--      沒有 INSERT/UPDATE/DELETE 政策），不是授權。
--
--   2. TRUNCATE 完全不受 RLS 管轄。實測在硬化前的複本上，
--      以 authenticated 身分執行 TRUNCATE exams CASCADE 會成功，
--      連帶清空全部題目與作答。這是唯一真正可以一句話毀掉考試領域的動詞。
--
--   3. 答案鍵對每一個登入的學生都是可讀的：correct_answer、explanation、
--      reference_answer、scoring_criteria、sample_essay 全部明文。
--      RLS 是「列」級的，表達不了「這一列可以看、但這幾欄不行」。
--
-- 本檔的做法，與 exam_user_answers 的硬化一致：
--   RLS 負責「哪些列」，欄位級 GRANT 負責「哪些欄」。
--
-- 前置條件：必須先套用 bootstrap_is_admin.sql，
--           因為下面的 admin 政策以 is_admin() 為授權邊界。
-- =====================================================

-- ─────────────────────────────────────────────
-- 0. 前置檢查
-- ─────────────────────────────────────────────
DO $guard$
DECLARE
  v_t text;
  v_config text;
BEGIN
  FOREACH v_t IN ARRAY ARRAY[
    'exams','question_groups','group_questions',
    'vocabulary_questions','translation_questions','essay_questions'] LOOP
    IF to_regclass('public.' || v_t) IS NULL THEN
      RAISE EXCEPTION '中止：找不到 public.%。請先套用 bootstrap_mock_exam_base_schema.sql。', v_t;
    END IF;
  END LOOP;

  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION '中止：找不到 public.is_admin()。請先套用 bootstrap_is_admin.sql。';
  END IF;

  SELECT coalesce(array_to_string(p.proconfig, ','), '(null)') INTO v_config
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_admin';

  IF v_config <> 'search_path=public' THEN
    RAISE EXCEPTION '中止：public.is_admin() 的 search_path 是 %，預期正式環境的 search_path=public。'
      '請先套用 bootstrap_is_admin.sql —— 本檔要拿它當授權邊界，'
      '不鎖 search_path 的 SECURITY DEFINER 函式不適合擔任這個角色。', v_config;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname = 'public' AND policyname LIKE 'mock\_content\_%') THEN
    RAISE EXCEPTION '中止：已經存在 mock_content_%% 政策，本檔可能已套用過。';
  END IF;
END $guard$;


-- ─────────────────────────────────────────────
-- 1. 收回全部既有授權
--
-- 只點名這六張表，不使用 ALL TABLES IN SCHEMA。
-- service_role 與 owner 不在收回名單內，維持原狀。
-- ─────────────────────────────────────────────
REVOKE ALL ON public.exams                 FROM anon, authenticated;
REVOKE ALL ON public.question_groups       FROM anon, authenticated;
REVOKE ALL ON public.group_questions       FROM anon, authenticated;
REVOKE ALL ON public.vocabulary_questions  FROM anon, authenticated;
REVOKE ALL ON public.translation_questions FROM anon, authenticated;
REVOKE ALL ON public.essay_questions       FROM anon, authenticated;

-- anon 到此為止：這六張表對未登入者一項權限都沒有。
-- 現有的 "…viewable for published exams" 政策角色是 public（含 anon），
-- 但沒有授權就沒有入口，政策不會被評估到。


-- ─────────────────────────────────────────────
-- 2. authenticated 的 SELECT —— 逐欄點名
--
-- 沒有列在下面的欄位，學生就是讀不到，連 PostgREST 直接打 API 也一樣。
-- 「前端沒有顯示」不算安全措施；這裡是資料庫層的邊界。
--
-- ⚠️ exams.id / exams.status / question_groups.id / question_groups.exam_id
--    必須保留：六張表的 SELECT 政策內含對它們的子查詢，
--    而政策子查詢以呼叫者身分執行。實測收回 exams 的 SELECT 之後，
--    讀 vocabulary_questions 會直接 42501 permission denied for table exams。
-- ─────────────────────────────────────────────

-- 考卷：不含 notes（教師備註）與 created_by
GRANT SELECT (id, title, year, month, difficulty,
              total_score, duration_minutes, status)
  ON public.exams TO authenticated;

-- 題組：不含 content_translation（中譯）與 topic_tags
GRANT SELECT (id, exam_id, group_type, group_order, title, content,
              option_count, option_list,
              structure_option_a, structure_option_b, structure_option_c,
              structure_option_d, structure_option_e,
              article_type, chart_description, content_image)
  ON public.question_groups TO authenticated;

-- 題組題目：不含 correct_answer、explanation、grammar_*、level_tag、
--           phrase_tag、question_type_tag
GRANT SELECT (id, group_id, question_number, blank_number, question_text,
              option_a, option_b, option_c, option_d,
              mixed_type, options_type, score)
  ON public.group_questions TO authenticated;

-- 單字題：不含 correct_answer、explanation、level_tag、topic_tags
GRANT SELECT (id, exam_id, question_number, question_text,
              option_a, option_b, option_c, option_d, score)
  ON public.vocabulary_questions TO authenticated;

-- 翻譯題：不含 reference_answer、scoring_criteria、explanation、
--         grammar_tags、level_tag、phrase_tag、topic_tags
GRANT SELECT (id, exam_id, question_number, chinese_text, score)
  ON public.translation_questions TO authenticated;

-- 作文題：不含 sample_essay、scoring_criteria、writing_tips、
--         error_type_tags、topic_tags
GRANT SELECT (id, exam_id, question_number, prompt,
              essay_type, word_count_requirement, prompt_image, score)
  ON public.essay_questions TO authenticated;


-- ─────────────────────────────────────────────
-- 3. authenticated 的寫入 —— 表級授權，由 RLS 把關
--
-- 這裡發的是「入口」，不是「許可」。誰真的寫得進去由第 4 節的
-- is_admin() 政策決定。一般學生拿到同樣的表級授權，
-- 但每一條政策都會拒絕他。
--
-- 刻意不發：TRUNCATE（唯一繞過 RLS 的動詞）、REFERENCES、TRIGGER。
-- ─────────────────────────────────────────────
GRANT INSERT, UPDATE, DELETE ON public.exams                 TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.question_groups       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.group_questions       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vocabulary_questions  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.translation_questions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.essay_questions       TO authenticated;


-- ─────────────────────────────────────────────
-- 4. admin 專用政策
--
-- 既有的 6 條 "…viewable for published exams" SELECT 政策完全不動。
-- 這裡新增 24 條：6 張表 × (SELECT + INSERT + UPDATE + DELETE)。
-- 不建立任何學生寫入政策。
--
-- ⚠️ 為什麼需要 admin 的 SELECT 政策（實作時才發現，設計階段漏了）：
--    唯一既有的 SELECT 政策是 USING (status = 'published')，
--    而 PostgreSQL 的 UPDATE / DELETE 只要帶 WHERE 子句就同時受 SELECT 政策約束。
--    結果是 admin 連自己剛建立的 draft 考卷都看不到，
--    UPDATE 與 DELETE 一律影響 0 列 —— 而編輯 draft 正是 ExamAdmin 的本職。
--    實測：admin 在只有 published 政策時，3 列考卷只看得到 1 列。
--
--    這些政策是 PERMISSIVE，與既有政策以 OR 結合：
--    對學生而言 is_admin() 為 false，可見範圍完全不變。
--    欄位級限制不受影響，對 admin 一樣生效（見報告中的已知限制）。
-- ─────────────────────────────────────────────
CREATE POLICY "mock_content_exams_admin_select" ON public.exams
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "mock_content_question_groups_admin_select" ON public.question_groups
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "mock_content_group_questions_admin_select" ON public.group_questions
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "mock_content_vocabulary_questions_admin_select" ON public.vocabulary_questions
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "mock_content_translation_questions_admin_select" ON public.translation_questions
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "mock_content_essay_questions_admin_select" ON public.essay_questions
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "mock_content_exams_admin_insert" ON public.exams
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "mock_content_exams_admin_update" ON public.exams
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "mock_content_exams_admin_delete" ON public.exams
  FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "mock_content_question_groups_admin_insert" ON public.question_groups
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "mock_content_question_groups_admin_update" ON public.question_groups
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "mock_content_question_groups_admin_delete" ON public.question_groups
  FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "mock_content_group_questions_admin_insert" ON public.group_questions
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "mock_content_group_questions_admin_update" ON public.group_questions
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "mock_content_group_questions_admin_delete" ON public.group_questions
  FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "mock_content_vocabulary_questions_admin_insert" ON public.vocabulary_questions
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "mock_content_vocabulary_questions_admin_update" ON public.vocabulary_questions
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "mock_content_vocabulary_questions_admin_delete" ON public.vocabulary_questions
  FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "mock_content_translation_questions_admin_insert" ON public.translation_questions
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "mock_content_translation_questions_admin_update" ON public.translation_questions
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "mock_content_translation_questions_admin_delete" ON public.translation_questions
  FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "mock_content_essay_questions_admin_insert" ON public.essay_questions
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "mock_content_essay_questions_admin_update" ON public.essay_questions
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "mock_content_essay_questions_admin_delete" ON public.essay_questions
  FOR DELETE TO authenticated USING (is_admin());


-- ─────────────────────────────────────────────
-- 5. 註解
-- ─────────────────────────────────────────────
COMMENT ON COLUMN public.vocabulary_questions.correct_answer IS
  '答案鍵。authenticated 沒有 SELECT 權限——RLS 是列級的，擋不住欄位，'
  '所以這一層由欄位級 GRANT 負責。判分由 SECURITY DEFINER 的 mock_exam_auto_grade() 執行。';
COMMENT ON COLUMN public.group_questions.correct_answer IS
  '答案鍵。authenticated 沒有 SELECT 權限。';
COMMENT ON COLUMN public.translation_questions.reference_answer IS
  '參考答案。authenticated 沒有 SELECT 權限。';
COMMENT ON COLUMN public.essay_questions.sample_essay IS
  '範文。authenticated 沒有 SELECT 權限。';


-- ─────────────────────────────────────────────
-- 6. 套用後自我驗證
-- ─────────────────────────────────────────────
DO $verify$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee = 'anon'
    AND table_name IN ('exams','question_groups','group_questions',
                       'vocabulary_questions','translation_questions','essay_questions');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '驗證失敗：anon 仍持有 % 項授權。', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee = 'authenticated'
    AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')
    AND table_name IN ('exams','question_groups','group_questions',
                       'vocabulary_questions','translation_questions','essay_questions');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '驗證失敗：authenticated 仍持有 % 項 TRUNCATE/REFERENCES/TRIGGER。', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'public' AND policyname LIKE 'mock\_content\_%';
  IF v_n <> 24 THEN
    RAISE EXCEPTION '驗證失敗：mock_content_ 政策應為 24 條，實得 %。', v_n;
  END IF;

  -- 答案鍵欄位不得對 authenticated 開放
  SELECT count(*) INTO v_n FROM information_schema.column_privileges
  WHERE table_schema = 'public' AND grantee = 'authenticated' AND privilege_type = 'SELECT'
    AND (table_name, column_name) IN (
      ('vocabulary_questions','correct_answer'), ('vocabulary_questions','explanation'),
      ('group_questions','correct_answer'),      ('group_questions','explanation'),
      ('translation_questions','reference_answer'), ('translation_questions','scoring_criteria'),
      ('essay_questions','sample_essay'),        ('essay_questions','scoring_criteria'),
      ('essay_questions','writing_tips'),        ('question_groups','content_translation'),
      ('exams','notes'),                         ('exams','created_by'));
  IF v_n <> 0 THEN
    RAISE EXCEPTION '驗證失敗：仍有 % 個應保密欄位對 authenticated 開放 SELECT。', v_n;
  END IF;
END $verify$;
