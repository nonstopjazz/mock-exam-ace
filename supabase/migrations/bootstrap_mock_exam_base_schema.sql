-- =====================================================
-- BOOTSTRAP：mock 模考「基礎 schema」（硬化「之前」的狀態）
--
-- 用途：staging cwymrzcovgobfqxtithn 完全沒有這八張表。
--       正式 ytzspnjmkvrkbztnaomm 才是這份 schema 的 source of truth。
--
-- ⚠️ 這份檔案「不含」任何硬化內容。分兩階段，順序不可顛倒：
--       階段 1：本檔（BASE SCHEMA）
--       階段 2：harden_mock_exam_answers.sql（HARDENING）
--    所以這裡刻意保留 score_earned DEFAULT 0、可為 NULL 的 user_answer、
--    沒有 (attempt_id, question_id) 唯一鍵、寬鬆的表級授權——
--    那些正是階段 2 要修掉的東西。在這裡先修掉，等於讓階段 2 無法被驗證。
--
-- ⚠️ 只建立 schema。不寫入任何資料：
--    沒有 exams、沒有題目、沒有 attempts、沒有作答、不碰 auth.users。
--
-- ⚠️ 不碰 iLearn：本檔完全不提及 exam_records、exam_types，
--    也不建立、修改或刪除任何 legacy 物件。
--
-- ⚠️ 刻意不使用 CREATE ... IF NOT EXISTS。
--    在共用資料庫裡，「跑完沒報錯」不等於「做了對的事」——
--    寫作系統當初就是因為 IF NOT EXISTS 靜默略過，
--    後續的索引與政策全都落到 iLearn 的同名表上。
--    這裡改成：名稱一旦被占用就大聲失敗。
--
-- 前置條件（Supabase 平台本來就會提供）：
--    · schema auth 與 auth.users
--    · 函式 auth.uid()
--    · 角色 authenticated、anon
--
-- 套用前必做：先在正式環境跑 supabase/tests/mock_exam_schema_fingerprint.sql，
--            與 supabase/tests/mock_exam_base_schema.expected.txt 比對，
--            確認本檔真的重現了正式環境的形狀。
-- =====================================================

-- ─────────────────────────────────────────────
-- 0. 名稱占用檢查 —— 有任何一個被占用就中止
-- ─────────────────────────────────────────────
DO $guard$
DECLARE
  v_taken text[] := ARRAY[]::text[];
  v_t text;
BEGIN
  FOREACH v_t IN ARRAY ARRAY[
    'exams','question_groups','group_questions','vocabulary_questions',
    'translation_questions','essay_questions','exam_attempts','exam_user_answers'] LOOP
    IF to_regclass('public.' || v_t) IS NOT NULL THEN
      v_taken := v_taken || ('table ' || v_t);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = 'public' AND t.typname = 'exam_status') THEN
    v_taken := v_taken || 'type exam_status'::text;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'auto_grade_choice_answer') THEN
    v_taken := v_taken || 'function auto_grade_choice_answer'::text;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
             AND indexname IN ('idx_group_questions_group','idx_attempts_user',
                               'idx_attempts_exam','idx_attempts_status','idx_answers_attempt')) THEN
    v_taken := v_taken || 'one or more idx_* index names'::text;
  END IF;

  IF array_length(v_taken, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'bootstrap 中止：以下名稱已被占用 → %。'
      '請先確認它們屬於誰，不要覆蓋既有物件。', array_to_string(v_taken, ', ');
  END IF;

  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'bootstrap 中止：找不到 auth.users。本檔需要 Supabase 的 auth schema。';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'auth' AND p.proname = 'uid') THEN
    RAISE EXCEPTION 'bootstrap 中止：找不到 auth.uid()。RLS 政策需要它。';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE EXCEPTION 'bootstrap 中止：找不到 authenticated / anon 角色。';
  END IF;
END $guard$;


-- ─────────────────────────────────────────────
-- 1. 型別
-- ─────────────────────────────────────────────
CREATE TYPE public.exam_status AS ENUM ('draft', 'published', 'archived');


-- ─────────────────────────────────────────────
-- 2. 考卷與題目
-- ─────────────────────────────────────────────
CREATE TABLE public.exams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text,
  year        int,
  status      public.exam_status DEFAULT 'draft',
  total_score numeric,
  created_by  uuid REFERENCES auth.users(id)
);

CREATE TABLE public.question_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     uuid REFERENCES public.exams(id) ON DELETE CASCADE,
  title       text,
  group_type  text,
  group_order int,
  UNIQUE (exam_id, group_type, group_order)
);

-- 題組題：克漏字一組 = 一個 question_group + N 道原子題目。
-- 部分給分由「原子題目加總」自然浮現，不需要題組層級的部分分數。
CREATE TABLE public.group_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid REFERENCES public.question_groups(id) ON DELETE CASCADE,
  question_number int,
  question_text   text,
  correct_answer  text NOT NULL,
  score           numeric,
  grammar_large   text,
  grammar_medium  text,
  grammar_small   text,
  level_tag       int CHECK (level_tag >= 1 AND level_tag <= 6),
  UNIQUE (group_id, question_number)
);
CREATE INDEX idx_group_questions_group ON public.group_questions (group_id);

CREATE TABLE public.vocabulary_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id         uuid REFERENCES public.exams(id) ON DELETE CASCADE,
  question_number int,
  correct_answer  character NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  score           numeric,
  level_tag       int CHECK (level_tag >= 1 AND level_tag <= 6),
  UNIQUE (exam_id, question_number)
);

CREATE TABLE public.translation_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id         uuid REFERENCES public.exams(id) ON DELETE CASCADE,
  question_number int,
  grammar_tags    text[],
  score           numeric,
  level_tag       int CHECK (level_tag >= 1 AND level_tag <= 6),
  UNIQUE (exam_id, question_number)
);

CREATE TABLE public.essay_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id         uuid REFERENCES public.exams(id) ON DELETE CASCADE,
  question_number int,
  score           numeric,
  UNIQUE (exam_id, question_number)
);


-- ─────────────────────────────────────────────
-- 3. 作答
--
-- 這兩張表刻意維持硬化「之前」的狀態。
-- 已知缺陷（由階段 2 修補，這裡不要先修）：
--   · score_earned DEFAULT 0 → 未批改與零分無法區分
--   · 沒有 (attempt_id, question_id) 唯一鍵 → saveAnswer() 的 upsert 會 42P10
--   · user_answer 可為 NULL、可為空字串
--   · RLS 只限制「哪些列」，沒限制「哪些欄」→ 學生可自行給分
--   · updated_at 沒有任何東西維護
-- ─────────────────────────────────────────────
CREATE TABLE public.exam_attempts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id            uuid REFERENCES public.exams(id) ON DELETE CASCADE,
  started_at         timestamptz DEFAULT now(),
  submitted_at       timestamptz,
  time_spent_seconds int,
  status             text DEFAULT 'in_progress'
                       CHECK (status IN ('in_progress','submitted','graded')),
  vocabulary_score   numeric,
  cloze_score        numeric,
  contextual_score   numeric,
  structure_score    numeric,
  reading_score      numeric,
  mixed_score        numeric,
  translation_score  numeric,
  essay_score        numeric,
  total_score        numeric
);
CREATE INDEX idx_attempts_user   ON public.exam_attempts (user_id);
CREATE INDEX idx_attempts_exam   ON public.exam_attempts (exam_id);
CREATE INDEX idx_attempts_status ON public.exam_attempts (status);

CREATE TABLE public.exam_user_answers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id              uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  vocabulary_question_id  uuid REFERENCES public.vocabulary_questions(id)  ON DELETE CASCADE,
  group_question_id       uuid REFERENCES public.group_questions(id)       ON DELETE CASCADE,
  translation_question_id uuid REFERENCES public.translation_questions(id) ON DELETE CASCADE,
  essay_question_id       uuid REFERENCES public.essay_questions(id)       ON DELETE CASCADE,
  user_answer             text,
  is_correct              boolean,
  score_earned            numeric DEFAULT 0,
  grader_feedback         text,
  graded_by               uuid REFERENCES auth.users(id),
  graded_at               timestamptz,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  time_spent_seconds      int DEFAULT 0,
  CONSTRAINT single_question_source CHECK (
    (CASE WHEN vocabulary_question_id  IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN group_question_id       IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN translation_question_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN essay_question_id       IS NOT NULL THEN 1 ELSE 0 END) = 1)
);
CREATE INDEX idx_answers_attempt ON public.exam_user_answers (attempt_id);


-- ─────────────────────────────────────────────
-- 4. 自動判分（硬化前的版本）
--
-- 這一版是刻意保留缺陷的：
--   · 沒有 SECURITY DEFINER → SELECT 受 RLS 限制，
--     在 draft 考卷上判分會失敗，而且錯誤訊息會誤導人
--   · 翻譯／作文沒有分支 → 整列原封不動穿過去，
--     學生可以自行寫入 is_correct 與 score_earned
-- 兩者都由階段 2 的 mock_exam_auto_grade() 修掉。
-- ─────────────────────────────────────────────
CREATE FUNCTION public.auto_grade_choice_answer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  correct TEXT;
  q_score NUMERIC(4,2);
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
END;
$function$;

CREATE TRIGGER trigger_auto_grade
  BEFORE INSERT OR UPDATE ON public.exam_user_answers
  FOR EACH ROW EXECUTE FUNCTION public.auto_grade_choice_answer();


-- ─────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────
ALTER TABLE public.exams                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocabulary_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translation_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.essay_questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_user_answers     ENABLE ROW LEVEL SECURITY;

-- 只有 published 的考卷對學生可見。
-- 附帶影響：判分 trigger 的 SELECT 也受這條限制——這正是階段 2 的發現。
CREATE POLICY "Published exams viewable by all" ON public.exams
  FOR SELECT USING (status = 'published');

CREATE POLICY "Question groups viewable for published exams" ON public.question_groups
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.exams
    WHERE exams.id = question_groups.exam_id AND exams.status = 'published'));

CREATE POLICY "Group questions viewable for published exams" ON public.group_questions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.question_groups qg
    JOIN public.exams e ON e.id = qg.exam_id
    WHERE qg.id = group_questions.group_id AND e.status = 'published'));

CREATE POLICY "Vocab questions viewable for published exams" ON public.vocabulary_questions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.exams
    WHERE exams.id = vocabulary_questions.exam_id AND exams.status = 'published'));

CREATE POLICY "Translation questions viewable for published exams" ON public.translation_questions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.exams
    WHERE exams.id = translation_questions.exam_id AND exams.status = 'published'));

CREATE POLICY "Essay questions viewable for published exams" ON public.essay_questions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.exams
    WHERE exams.id = essay_questions.exam_id AND exams.status = 'published'));

CREATE POLICY "Users view own attempts" ON public.exam_attempts
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users create own attempts" ON public.exam_attempts
  FOR INSERT WITH CHECK (user_id = auth.uid());
-- 注意：這條限制了「哪些列」，但完全沒限制「哪些欄」。
-- 學生因此可以寫自己的 total_score 並把 status 改成 graded。階段 2 修這個。
CREATE POLICY "Users update own attempts" ON public.exam_attempts
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users view own answers" ON public.exam_user_answers
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.exam_attempts
    WHERE exam_attempts.id = exam_user_answers.attempt_id
      AND exam_attempts.user_id = auth.uid()));
CREATE POLICY "Users create own answers" ON public.exam_user_answers
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.exam_attempts
    WHERE exam_attempts.id = exam_user_answers.attempt_id
      AND exam_attempts.user_id = auth.uid()));
CREATE POLICY "Users update own answers" ON public.exam_user_answers
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.exam_attempts
    WHERE exam_attempts.id = exam_user_answers.attempt_id
      AND exam_attempts.user_id = auth.uid()));


-- ─────────────────────────────────────────────
-- 6. 授權（硬化前的寬鬆狀態）
--
-- ⚠️ 最容易與正式環境產生落差的一段。
--    Supabase 的 ALTER DEFAULT PRIVILEGES 可能已經自動授權給
--    anon / authenticated / service_role，實際內容因專案而異。
--    套用前後都請用 fingerprint 的 GRA 行與正式環境對照。
-- ─────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_user_answers TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_attempts     TO authenticated, anon;
GRANT SELECT ON public.exams, public.question_groups, public.group_questions,
                public.vocabulary_questions, public.translation_questions,
                public.essay_questions TO authenticated, anon;


-- ─────────────────────────────────────────────
-- 7. 註解
-- ─────────────────────────────────────────────
COMMENT ON TABLE public.exam_user_answers IS
  'mock 模考的逐題作答。基礎 schema（硬化前）。'
  '尚未具備 (attempt_id, question_id) 唯一鍵與欄位級寫入限制。';
COMMENT ON TABLE public.exam_attempts IS
  'mock 模考的一次作答。基礎 schema（硬化前）。分數欄位目前學生可自行寫入。';
