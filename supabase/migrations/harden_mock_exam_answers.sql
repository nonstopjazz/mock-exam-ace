-- =====================================================
-- Migration: mock 模考作答與 attempt 的 schema 硬化
--
-- 範圍：只有 mock 的「學生逐題作答」考試引擎。
--   exam_user_answers · exam_attempts
--
-- ⛔ 不在範圍內，本檔一個字都不會碰：
--   exam_records · exam_types —— iLearn 的「老師手動輸入成績」功能，
--   與本系統是完全不同的概念（整份考試的結果，沒有題目、沒有作答），
--   而且是這個共用資料庫裡唯一有真實資料的考試相關資料。
--   以及 assignment_submissions · essay_submissions · student_tasks
--   等 iLearn 課業領域的表。
--
-- ⚠️ 共用命名空間
--   正式專案由 mock 與 iLearn 共用。約束、索引、函式的名稱是
--   schema 層級唯一的，因此本檔新增的每一個物件都加 mock_exam_ 前綴。
--   同理刻意不建立任何新的 ENUM 型別（型別名也是 schema 層級），
--   狀態欄位一律用 text + CHECK。
--
-- 適用前提：mock 的兩張表目前皆為 0 列。以下多項變更只在零列時是免費的
--   （見 rollback 段落）。套用前務必先確認列數仍為 0。
-- =====================================================


-- =====================================================
-- 1. exam_user_answers —— 欄位
-- =====================================================

-- 1a. 未批改就是「沒有分數」，不是「零分」。
--     DEFAULT 0 會讓未批改的翻譯／作文在任何加總裡看起來像得零分，
--     而那正是「未測得 ≠ 弱」這條規則要防止的事。
ALTER TABLE public.exam_user_answers
  ALTER COLUMN score_earned DROP DEFAULT;

-- 1b. 批改狀態。UNGRADED 與 GRADED 兩態；
--     「未作答」不是狀態，而是「沒有這一列」（見 1d）。
ALTER TABLE public.exam_user_answers
  ADD COLUMN IF NOT EXISTS grading_status  text NOT NULL DEFAULT 'UNGRADED',
  ADD COLUMN IF NOT EXISTS max_score       numeric(4,2),
  ADD COLUMN IF NOT EXISTS grading_method  text;

COMMENT ON COLUMN public.exam_user_answers.grading_status IS
  'UNGRADED = 已作答但尚未批改；GRADED = 已批改。未作答的題目不會有列。';
COMMENT ON COLUMN public.exam_user_answers.max_score IS
  '批改當下題目配分的快照。之後有人修改題目配分，不會回頭改變歷史加權。';
COMMENT ON COLUMN public.exam_user_answers.grading_method IS
  'AUTO（資料庫自動判分）／TEACHER／AI。讓 AUTO 與 TEACHER 兩條證據流可以在查詢層分開，而不是靠慣例。';
COMMENT ON COLUMN public.exam_user_answers.is_correct IS
  '只對客觀題有意義。主觀題（翻譯／作文）永遠為 NULL —— 是「不適用」，不是「答錯」。';

-- 1c. 邏輯題目鍵。
--     四個可為空的題目 FK 讓 upsert 無法有單一衝突目標；
--     partial unique index 雖然能表達約束，但 PostgREST 的 onConflict
--     只接受欄位名稱、無法重述 WHERE 子句，upsert 仍會失敗。
--     產生欄位是實體欄位，因此可以掛一般的 UNIQUE，onConflict 直接可用。
ALTER TABLE public.exam_user_answers
  ADD COLUMN IF NOT EXISTS question_id uuid
    GENERATED ALWAYS AS (coalesce(
      vocabulary_question_id, group_question_id,
      translation_question_id, essay_question_id)) STORED,
  ADD COLUMN IF NOT EXISTS question_kind text
    GENERATED ALWAYS AS (
      CASE WHEN vocabulary_question_id  IS NOT NULL THEN 'vocabulary'
           WHEN group_question_id       IS NOT NULL THEN 'group'
           WHEN translation_question_id IS NOT NULL THEN 'translation'
           WHEN essay_question_id       IS NOT NULL THEN 'essay' END) STORED;

COMMENT ON COLUMN public.exam_user_answers.question_id IS
  '四個題目 FK 的 coalesce。single_question_source 保證恰好一個非空，因此不會有歧義。';

-- 1d. 一列的存在，代表學生確實作答了。
--     「未作答」以「沒有列」表示 —— 分母來自題目集合，不是作答列數。
--     這讓 is_correct IS NULL 不再同時代表未作答／未批改／不適用三件事。
ALTER TABLE public.exam_user_answers
  ALTER COLUMN user_answer SET NOT NULL;


-- =====================================================
-- 2. exam_user_answers —— 約束
-- =====================================================

ALTER TABLE public.exam_user_answers
  ADD CONSTRAINT mock_exam_answers_user_answer_not_blank
    CHECK (btrim(user_answer) <> ''),

  ADD CONSTRAINT mock_exam_answers_status_domain
    CHECK (grading_status IN ('UNGRADED', 'GRADED')),

  ADD CONSTRAINT mock_exam_answers_method_domain
    CHECK (grading_method IS NULL OR grading_method IN ('AUTO', 'TEACHER', 'AI')),

  -- UNGRADED ⇒ 所有批改欄位皆空。杜絕「未批改卻有分數」。
  ADD CONSTRAINT mock_exam_answers_ungraded_is_empty
    CHECK (grading_status <> 'UNGRADED' OR (
      is_correct IS NULL AND score_earned IS NULL AND max_score IS NULL
      AND grading_method IS NULL AND graded_by IS NULL AND graded_at IS NULL)),

  -- GRADED ⇒ 批改資訊完整。杜絕「已批改但不知道誰、何時、滿分多少」。
  ADD CONSTRAINT mock_exam_answers_graded_is_complete
    CHECK (grading_status <> 'GRADED' OR (
      score_earned IS NOT NULL AND max_score IS NOT NULL
      AND grading_method IS NOT NULL AND graded_at IS NOT NULL)),

  ADD CONSTRAINT mock_exam_answers_score_bounds
    CHECK (score_earned IS NULL
           OR (max_score IS NOT NULL AND score_earned >= 0 AND score_earned <= max_score)),

  ADD CONSTRAINT mock_exam_answers_auto_has_no_grader
    CHECK (grading_method IS DISTINCT FROM 'AUTO' OR graded_by IS NULL),

  ADD CONSTRAINT mock_exam_answers_teacher_named
    CHECK (grading_method IS DISTINCT FROM 'TEACHER' OR graded_by IS NOT NULL),

  -- 翻譯／作文在結構上不可能被記成「答錯」。只能是未批改，或已評分有分數。
  ADD CONSTRAINT mock_exam_answers_verdict_objective_only
    CHECK (question_kind IN ('vocabulary', 'group') OR is_correct IS NULL),

  -- 反過來：客觀題一旦批改，一定要有明確的對錯。
  ADD CONSTRAINT mock_exam_answers_objective_graded_has_verdict
    CHECK (grading_status <> 'GRADED'
           OR question_kind NOT IN ('vocabulary', 'group')
           OR is_correct IS NOT NULL),

  -- 一個 attempt 對一道邏輯題目只有一列。
  ADD CONSTRAINT mock_exam_answers_one_per_question
    UNIQUE (attempt_id, question_id);


-- =====================================================
-- 3. exam_user_answers —— 自動判分 trigger
--
-- 沿用既有設計中正確的部分：在寫入當下讀題目的答案與配分並存下結果，
-- 因此成績天生免疫於之後修改答案鍵。以下是五項變更：
--   1. 補上新欄位（grading_status / max_score / grading_method / graded_at）
--   2. 主觀題新增明確分支，不再直接掉出去
--   3. 為未來的老師／AI 批改留一個 session flag 缺口
--   4. 找不到題目時明確報錯，不再靜默產生 is_correct=NULL, score=0
--   5. 改為 SECURITY DEFINER —— 實作過程實測發現的缺陷，詳見函式上方註解
-- =====================================================

CREATE OR REPLACE FUNCTION public.mock_exam_auto_grade()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY DEFINER：判分不可以依賴「學生看不看得到題目」。
--   trigger 函式預設以呼叫者身分執行，因此函式內對 vocabulary_questions /
--   group_questions 的 SELECT 會受 RLS 限制。那些政策只放行 status='published'
--   的考試，所以草稿考試（或政策日後收緊時）會讓判分整個失敗，
--   錯誤訊息還是「找不到題目」，極難追查。實測確認過這個行為。
--   原本的 auto_grade_choice_answer() 也有同樣問題，只是從未被觸發過。
-- search_path 已鎖定為 public，是 SECURITY DEFINER 的安全前提。
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_correct    text;
  v_score      numeric;
  -- 未來的批改 RPC（SECURITY DEFINER）會設這個旗標。
  -- 沒有旗標時，批改欄位一律由本函式決定，呼叫端寫什麼都沒有用。
  v_privileged boolean := coalesce(
    current_setting('app.mock_exam_grading', true) = 'on', false);
BEGIN
  ----------------------------------------------------------------
  -- 客觀題：一律在寫入當下重新判分。
  -- 學生把 A 改成 B，同一句 statement 內就會重新判分。
  ----------------------------------------------------------------
  IF NEW.vocabulary_question_id IS NOT NULL THEN
    SELECT correct_answer, score INTO v_correct, v_score
    FROM vocabulary_questions WHERE id = NEW.vocabulary_question_id;
    IF NOT FOUND OR v_correct IS NULL THEN
      RAISE EXCEPTION 'mock_exam_auto_grade: 找不到單字題或其答案為空 (id=%)',
        NEW.vocabulary_question_id;
    END IF;

  ELSIF NEW.group_question_id IS NOT NULL THEN
    SELECT correct_answer, score INTO v_correct, v_score
    FROM group_questions WHERE id = NEW.group_question_id;
    IF NOT FOUND OR v_correct IS NULL THEN
      RAISE EXCEPTION 'mock_exam_auto_grade: 找不到題組題目或其答案為空 (id=%)',
        NEW.group_question_id;
    END IF;

  ELSE
    ----------------------------------------------------------------
    -- 主觀題（翻譯／作文）：學生送出後維持 UNGRADED。
    -- 絕不預設為 0 分，也絕不由學生自己填。
    ----------------------------------------------------------------
    IF v_privileged THEN
      -- 授權過的批改動作正在寫入：放行，由 CHECK 約束驗證完整性。
      RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.grading_status  := 'UNGRADED';
      NEW.is_correct      := NULL;
      NEW.score_earned    := NULL;
      NEW.max_score       := NULL;
      NEW.grading_method  := NULL;
      NEW.graded_by       := NULL;
      NEW.graded_at       := NULL;
      NEW.grader_feedback := NULL;
    ELSE
      -- 學生修改作文內容時，不得覆蓋（或抹掉）已經給過的評分。
      NEW.grading_status  := OLD.grading_status;
      NEW.is_correct      := OLD.is_correct;
      NEW.score_earned    := OLD.score_earned;
      NEW.max_score       := OLD.max_score;
      NEW.grading_method  := OLD.grading_method;
      NEW.graded_by       := OLD.graded_by;
      NEW.graded_at       := OLD.graded_at;
      NEW.grader_feedback := OLD.grader_feedback;
    END IF;
    RETURN NEW;
  END IF;

  -- 客觀題的判分結果
  NEW.max_score      := coalesce(v_score, 0);
  NEW.is_correct     := (upper(btrim(NEW.user_answer)) = upper(btrim(v_correct)));
  NEW.score_earned   := CASE WHEN NEW.is_correct THEN NEW.max_score ELSE 0 END;
  NEW.grading_status := 'GRADED';
  NEW.grading_method := 'AUTO';
  NEW.graded_by      := NULL;   -- AUTO 沒有人類批改者
  NEW.graded_at      := now();

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.mock_exam_auto_grade() IS
  'mock 模考客觀題的寫入時自動判分。主觀題保持 UNGRADED。'
  '批改欄位不接受呼叫端指定，除非 app.mock_exam_grading = on（未來的批改 RPC 會設定）。';

DROP TRIGGER IF EXISTS trigger_auto_grade ON public.exam_user_answers;
DROP TRIGGER IF EXISTS mock_exam_trg_auto_grade ON public.exam_user_answers;
CREATE TRIGGER mock_exam_trg_auto_grade
  BEFORE INSERT OR UPDATE ON public.exam_user_answers
  FOR EACH ROW EXECUTE FUNCTION public.mock_exam_auto_grade();

-- 舊函式已無 trigger 引用，移除以免留下兩套判分邏輯。
DROP FUNCTION IF EXISTS public.auto_grade_choice_answer();


-- =====================================================
-- 4. exam_user_answers —— updated_at
--
-- 該欄位原本存在但沒有任何東西維護它。一個永遠不變的時間戳
-- 比沒有更糟：它看起來可信。這裡補上維護，而不是移除欄位。
-- =====================================================

CREATE OR REPLACE FUNCTION public.mock_exam_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS mock_exam_trg_answers_touch ON public.exam_user_answers;
CREATE TRIGGER mock_exam_trg_answers_touch
  BEFORE UPDATE ON public.exam_user_answers
  FOR EACH ROW EXECUTE FUNCTION public.mock_exam_touch_updated_at();


-- =====================================================
-- 5. exam_attempts —— 狀態轉換保護
--
-- 稽核發現學生可以把自己的 attempt 標成 graded、並自行寫入 total_score。
-- 分數欄位由第 6 節的欄位級權限擋下；狀態轉換需要 trigger，
-- 因為學生「必須」能把 in_progress 改成 submitted（交卷）。
-- =====================================================

CREATE OR REPLACE FUNCTION public.mock_exam_attempts_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_privileged boolean := coalesce(
    current_setting('app.mock_exam_grading', true) = 'on', false);
BEGIN
  IF v_privileged THEN
    RETURN NEW;
  END IF;

  -- graded 只能由授權的批改流程設定
  IF NEW.status = 'graded' AND OLD.status IS DISTINCT FROM 'graded' THEN
    RAISE EXCEPTION 'mock_exam_attempts_guard: 不可自行將 attempt 標記為 graded';
  END IF;

  -- 已交卷不可退回進行中
  IF OLD.status IN ('submitted', 'graded') AND NEW.status = 'in_progress' THEN
    RAISE EXCEPTION 'mock_exam_attempts_guard: 已交卷的 attempt 不可退回 in_progress';
  END IF;

  -- 分數欄位由伺服器擁有。欄位級權限已擋下 authenticated；
  -- 這裡是 service_role 與未來 Edge Function 的後備防線。
  NEW.vocabulary_score := OLD.vocabulary_score;
  NEW.cloze_score      := OLD.cloze_score;
  NEW.contextual_score := OLD.contextual_score;
  NEW.structure_score  := OLD.structure_score;
  NEW.reading_score    := OLD.reading_score;
  NEW.mixed_score      := OLD.mixed_score;
  NEW.translation_score := OLD.translation_score;
  NEW.essay_score      := OLD.essay_score;
  NEW.total_score      := OLD.total_score;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.mock_exam_attempts_guard() IS
  '保護 mock attempt 的伺服器所有欄位。允許 in_progress → submitted，禁止自行 graded。';

DROP TRIGGER IF EXISTS mock_exam_trg_attempts_guard ON public.exam_attempts;
CREATE TRIGGER mock_exam_trg_attempts_guard
  BEFORE UPDATE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.mock_exam_attempts_guard();


-- =====================================================
-- 6. 欄位級權限 —— 學生寫入限制的主要防線
--
-- RLS 是「列」級的，表達不了「只能改這幾欄」。那正是原本會漏的原因：
-- 政策正確地限制了哪些列，卻對哪些欄位隻字未提。
--
-- 這裡不使用 ALL TABLES IN SCHEMA，只點名 mock 的兩張表，
-- 確保 iLearn 的任何表都不受影響。
-- =====================================================

REVOKE ALL ON public.exam_user_answers FROM authenticated, anon;
REVOKE ALL ON public.exam_attempts     FROM authenticated, anon;

-- 作答：可讀自己的、可新增、可改作答內容、可刪除（清除作答）
GRANT SELECT ON public.exam_user_answers TO authenticated;
GRANT INSERT (attempt_id,
              vocabulary_question_id, group_question_id,
              translation_question_id, essay_question_id,
              user_answer, time_spent_seconds)
  ON public.exam_user_answers TO authenticated;
GRANT UPDATE (user_answer, time_spent_seconds)
  ON public.exam_user_answers TO authenticated;
GRANT DELETE ON public.exam_user_answers TO authenticated;

-- attempt：可讀自己的、可開始、可交卷。分數欄位完全不授權。
GRANT SELECT ON public.exam_attempts TO authenticated;
GRANT INSERT (user_id, exam_id, started_at, status)
  ON public.exam_attempts TO authenticated;
GRANT UPDATE (status, submitted_at, time_spent_seconds)
  ON public.exam_attempts TO authenticated;

-- anon 對這兩張表沒有任何正當用途。


-- =====================================================
-- 7. RLS —— 補上刪除政策
--
-- 「未作答 = 沒有列」意味著清除作答就是 DELETE，而目前沒有 DELETE 政策。
-- 限定在自己的、仍在進行中的 attempt，交卷後不可再刪。
-- 既有的 SELECT / INSERT / UPDATE 政策維持不變。
-- =====================================================

DROP POLICY IF EXISTS "Users delete own in-progress answers" ON public.exam_user_answers;
CREATE POLICY "Users delete own in-progress answers"
  ON public.exam_user_answers FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.exam_attempts a
    WHERE a.id = exam_user_answers.attempt_id
      AND a.user_id = auth.uid()
      AND a.status = 'in_progress'
  ));
