-- =====================================================
-- 回滾：bootstrap_mock_exam_base_schema.sql
--
-- ⚠️ 這會刪掉整個 mock 考試 schema 與其中的所有資料。
--    只有在「bootstrap 剛套用、確認全空」的情況下才是安全的。
--    有任何真實考卷、attempt 或作答時，不要執行本檔。
--
-- ⚠️ 完全不碰 iLearn：本檔不提及 exam_records、exam_types，
--    也不刪除任何 legacy 物件。
--
-- 若已經套用過 harden_mock_exam_answers.sql，請先執行
-- harden_mock_exam_answers.rollback.sql，再執行本檔。
-- （其實不先跑也可以：DROP TABLE CASCADE 會一併帶走硬化加上去的
--   約束與 trigger，但那樣就不會發現硬化階段有沒有留下孤兒函式。）
-- =====================================================

-- 依外鍵相依順序反向刪除
DROP TABLE IF EXISTS public.exam_user_answers CASCADE;
DROP TABLE IF EXISTS public.exam_attempts CASCADE;
DROP TABLE IF EXISTS public.essay_questions CASCADE;
DROP TABLE IF EXISTS public.translation_questions CASCADE;
DROP TABLE IF EXISTS public.vocabulary_questions CASCADE;
DROP TABLE IF EXISTS public.group_questions CASCADE;
DROP TABLE IF EXISTS public.question_groups CASCADE;
DROP TABLE IF EXISTS public.exams CASCADE;

-- 表沒了，trigger 自然跟著沒了；函式要另外刪
DROP FUNCTION IF EXISTS public.auto_grade_choice_answer();

DROP TYPE IF EXISTS public.exam_status;

-- 驗證：這八張表、型別與函式都不該再存在
DO $$
DECLARE v_left text[] := ARRAY[]::text[]; v_t text;
BEGIN
  FOREACH v_t IN ARRAY ARRAY[
    'exams','question_groups','group_questions','vocabulary_questions',
    'translation_questions','essay_questions','exam_attempts','exam_user_answers'] LOOP
    IF to_regclass('public.' || v_t) IS NOT NULL THEN
      v_left := v_left || ('table ' || v_t);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = 'public' AND t.typname = 'exam_status') THEN
    v_left := v_left || 'type exam_status'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname LIKE 'mock\_exam\_%') THEN
    v_left := v_left || 'leftover mock_exam_% function(s) from the hardening stage'::text;
  END IF;
  IF array_length(v_left, 1) IS NOT NULL THEN
    RAISE EXCEPTION '回滾不完整，仍殘留：%', array_to_string(v_left, ', ');
  END IF;
END $$;
