-- =====================================================
-- 回滾：harden_mock_exam_content_permissions.sql
--
-- ⚠️ 這會把六張內容表回復到 Supabase 預設權限的全開狀態：
--    anon 與 authenticated 各拿回七項全部權限，包含 TRUNCATE。
--    也就是說，回滾之後：
--      · 任何登入的學生又能讀到 correct_answer 等答案鍵
--      · TRUNCATE 又變成可用（RLS 擋不住它）
--    只有在確定要回到硬化前的狀態時才執行。
--
-- 本檔不碰：exam_attempts、exam_user_answers（作答硬化不受影響）、
--           iLearn 的 exam_records / exam_types、writing_* 系列。
--
-- is_admin() 由 bootstrap_is_admin.rollback.sql 單獨回滾；本檔不動它。
-- =====================================================

-- ── 1. 移除本次新增的 24 條政策 ──
DROP POLICY IF EXISTS "mock_content_exams_admin_select"                 ON public.exams;
DROP POLICY IF EXISTS "mock_content_question_groups_admin_select"       ON public.question_groups;
DROP POLICY IF EXISTS "mock_content_group_questions_admin_select"       ON public.group_questions;
DROP POLICY IF EXISTS "mock_content_vocabulary_questions_admin_select"  ON public.vocabulary_questions;
DROP POLICY IF EXISTS "mock_content_translation_questions_admin_select" ON public.translation_questions;
DROP POLICY IF EXISTS "mock_content_essay_questions_admin_select"       ON public.essay_questions;
DROP POLICY IF EXISTS "mock_content_exams_admin_insert"                 ON public.exams;
DROP POLICY IF EXISTS "mock_content_exams_admin_update"                 ON public.exams;
DROP POLICY IF EXISTS "mock_content_exams_admin_delete"                 ON public.exams;
DROP POLICY IF EXISTS "mock_content_question_groups_admin_insert"       ON public.question_groups;
DROP POLICY IF EXISTS "mock_content_question_groups_admin_update"       ON public.question_groups;
DROP POLICY IF EXISTS "mock_content_question_groups_admin_delete"       ON public.question_groups;
DROP POLICY IF EXISTS "mock_content_group_questions_admin_insert"       ON public.group_questions;
DROP POLICY IF EXISTS "mock_content_group_questions_admin_update"       ON public.group_questions;
DROP POLICY IF EXISTS "mock_content_group_questions_admin_delete"       ON public.group_questions;
DROP POLICY IF EXISTS "mock_content_vocabulary_questions_admin_insert"  ON public.vocabulary_questions;
DROP POLICY IF EXISTS "mock_content_vocabulary_questions_admin_update"  ON public.vocabulary_questions;
DROP POLICY IF EXISTS "mock_content_vocabulary_questions_admin_delete"  ON public.vocabulary_questions;
DROP POLICY IF EXISTS "mock_content_translation_questions_admin_insert" ON public.translation_questions;
DROP POLICY IF EXISTS "mock_content_translation_questions_admin_update" ON public.translation_questions;
DROP POLICY IF EXISTS "mock_content_translation_questions_admin_delete" ON public.translation_questions;
DROP POLICY IF EXISTS "mock_content_essay_questions_admin_insert"       ON public.essay_questions;
DROP POLICY IF EXISTS "mock_content_essay_questions_admin_update"       ON public.essay_questions;
DROP POLICY IF EXISTS "mock_content_essay_questions_admin_delete"       ON public.essay_questions;

-- ── 2. 清掉欄位級授權，回到表級 ──
-- REVOKE ALL 會一併清掉欄位級的 ACL 項目。
REVOKE ALL ON public.exams                 FROM anon, authenticated;
REVOKE ALL ON public.question_groups       FROM anon, authenticated;
REVOKE ALL ON public.group_questions       FROM anon, authenticated;
REVOKE ALL ON public.vocabulary_questions  FROM anon, authenticated;
REVOKE ALL ON public.translation_questions FROM anon, authenticated;
REVOKE ALL ON public.essay_questions       FROM anon, authenticated;

-- ── 3. 還原硬化前的授權 ──
-- 硬化前的實測狀態（正式與 staging 一致）：
--   anon / authenticated / postgres / service_role 各七項全開，
--   也就是 Supabase 預設權限原封未動的樣子。
GRANT ALL ON public.exams                 TO anon, authenticated;
GRANT ALL ON public.question_groups       TO anon, authenticated;
GRANT ALL ON public.group_questions       TO anon, authenticated;
GRANT ALL ON public.vocabulary_questions  TO anon, authenticated;
GRANT ALL ON public.translation_questions TO anon, authenticated;
GRANT ALL ON public.essay_questions       TO anon, authenticated;

-- ── 4. 移除本次新增的欄位註解 ──
COMMENT ON COLUMN public.vocabulary_questions.correct_answer  IS NULL;
COMMENT ON COLUMN public.group_questions.correct_answer       IS NULL;
COMMENT ON COLUMN public.translation_questions.reference_answer IS NULL;
COMMENT ON COLUMN public.essay_questions.sample_essay         IS NULL;

-- ── 5. 驗證回到硬化前狀態 ──
DO $verify$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'public' AND policyname LIKE 'mock\_content\_%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '回滾未完成：仍有 % 條 mock_content_ 政策。', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  WHERE n.nspname = 'public' AND a.attacl IS NOT NULL
    AND c.relname IN ('exams','question_groups','group_questions',
                      'vocabulary_questions','translation_questions','essay_questions');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '回滾未完成：仍有 % 欄留著欄位級 ACL。', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
    AND table_name IN ('exams','question_groups','group_questions',
                       'vocabulary_questions','translation_questions','essay_questions');
  IF v_n <> 84 THEN
    RAISE EXCEPTION '回滾未完成：anon+authenticated 的表級授權應為 84 項（6 表 × 2 角色 × 7 項），實得 %。', v_n;
  END IF;
END $verify$;
