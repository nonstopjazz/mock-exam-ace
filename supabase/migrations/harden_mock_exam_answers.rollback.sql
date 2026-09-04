-- =====================================================
-- 回滾：harden_mock_exam_answers.sql
--
-- ⚠️ 只在 exam_user_answers 與 exam_attempts 仍為 0 列時是乾淨的。
--    套用前務必先確認：
--      SELECT count(*) FROM exam_user_answers;   -- 必須為 0
--      SELECT count(*) FROM exam_attempts;       -- 必須為 0
--    若已有真實資料，請改為向前修正，不要回滾 ——
--    score_earned 恢復 DEFAULT 0 之後，既有的 NULL 與 0 就再也分不出來了。
--
-- ⛔ 本檔同樣不碰任何 iLearn legacy 物件。
-- =====================================================

-- 7. RLS
DROP POLICY IF EXISTS "Users delete own in-progress answers" ON public.exam_user_answers;

-- 6. 權限：還原為套用前的寬鬆授權
REVOKE ALL ON public.exam_user_answers FROM authenticated, anon;
REVOKE ALL ON public.exam_attempts     FROM authenticated, anon;
-- 正式環境的硬化前狀態是 Supabase 預設權限的全套七項，不是四項。
GRANT ALL ON public.exam_user_answers TO authenticated, anon;
GRANT ALL ON public.exam_attempts     TO authenticated, anon;

-- 5. attempts guard
DROP TRIGGER IF EXISTS mock_exam_trg_attempts_guard ON public.exam_attempts;
DROP FUNCTION IF EXISTS public.mock_exam_attempts_guard();

-- 4. updated_at
DROP TRIGGER IF EXISTS mock_exam_trg_answers_touch ON public.exam_user_answers;
DROP FUNCTION IF EXISTS public.mock_exam_touch_updated_at();

-- 3. 判分 trigger：還原原始版本
DROP TRIGGER IF EXISTS mock_exam_trg_auto_grade ON public.exam_user_answers;
DROP FUNCTION IF EXISTS public.mock_exam_auto_grade();

CREATE OR REPLACE FUNCTION public.auto_grade_choice_answer()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE correct TEXT; q_score NUMERIC(4,2);
BEGIN
  IF NEW.vocabulary_question_id IS NOT NULL THEN
    SELECT correct_answer, score INTO correct, q_score
    FROM vocabulary_questions WHERE id = NEW.vocabulary_question_id;
    NEW.is_correct := (UPPER(NEW.user_answer) = correct);
    NEW.score_earned := CASE WHEN NEW.is_correct THEN q_score ELSE 0 END;
  ELSIF NEW.group_question_id IS NOT NULL THEN
    SELECT correct_answer, score INTO correct, q_score
    FROM group_questions WHERE id = NEW.group_question_id;
    NEW.is_correct := (UPPER(NEW.user_answer) = UPPER(correct));
    NEW.score_earned := CASE WHEN NEW.is_correct THEN q_score ELSE 0 END;
  END IF;
  RETURN NEW;
END; $function$;

CREATE TRIGGER trigger_auto_grade
  BEFORE INSERT OR UPDATE ON public.exam_user_answers
  FOR EACH ROW EXECUTE FUNCTION public.auto_grade_choice_answer();

-- 2. 約束
ALTER TABLE public.exam_user_answers
  DROP CONSTRAINT IF EXISTS mock_exam_answers_one_per_question,
  DROP CONSTRAINT IF EXISTS mock_exam_answers_objective_graded_has_verdict,
  DROP CONSTRAINT IF EXISTS mock_exam_answers_verdict_objective_only,
  DROP CONSTRAINT IF EXISTS mock_exam_answers_teacher_named,
  DROP CONSTRAINT IF EXISTS mock_exam_answers_auto_has_no_grader,
  DROP CONSTRAINT IF EXISTS mock_exam_answers_score_bounds,
  DROP CONSTRAINT IF EXISTS mock_exam_answers_graded_is_complete,
  DROP CONSTRAINT IF EXISTS mock_exam_answers_ungraded_is_empty,
  DROP CONSTRAINT IF EXISTS mock_exam_answers_method_domain,
  DROP CONSTRAINT IF EXISTS mock_exam_answers_status_domain,
  DROP CONSTRAINT IF EXISTS mock_exam_answers_user_answer_not_blank;

-- 1. 欄位
ALTER TABLE public.exam_user_answers
  ALTER COLUMN user_answer DROP NOT NULL,
  DROP COLUMN IF EXISTS question_kind,
  DROP COLUMN IF EXISTS question_id,
  DROP COLUMN IF EXISTS grading_method,
  DROP COLUMN IF EXISTS max_score,
  DROP COLUMN IF EXISTS grading_status,
  ALTER COLUMN score_earned SET DEFAULT 0;
