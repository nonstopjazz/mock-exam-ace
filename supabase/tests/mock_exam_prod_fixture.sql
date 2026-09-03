-- =====================================================
-- 本機測試替身：套用硬化 migration「之前」的正式環境形狀
--
-- ⚠️ 只給本機臨時資料庫使用，絕對不要在任何真實環境執行。
-- ⚠️ psql 專用（用了 \echo 等反斜線指令的檔案請勿貼進 Supabase SQL Editor；
--    本檔本身是純 SQL，但用途仍限於本機）。
--
-- 內容依照正式環境稽核結果重建：
--   · mock 考試引擎的八張表，含實測到的約束、索引、RLS 政策
--   · 原始的 auto_grade_choice_answer() 與 trigger_auto_grade
--   · iLearn 的 exam_records / exam_types 與其政策、trigger、函式、資料
--     —— 用來證明 migration 不會碰到它們
-- =====================================================

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('app.uid', true), '')
  )::uuid;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────
-- mock 考試引擎
-- ─────────────────────────────────────────────
CREATE TYPE exam_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text, year int, status exam_status DEFAULT 'draft',
  total_score numeric, created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE question_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE,
  title text, group_type text, group_order int,
  UNIQUE (exam_id, group_type, group_order)
);

CREATE TABLE group_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES question_groups(id) ON DELETE CASCADE,
  question_number int, question_text text,
  correct_answer text NOT NULL,
  score numeric,
  grammar_large text, grammar_medium text, grammar_small text,
  level_tag int CHECK (level_tag >= 1 AND level_tag <= 6),
  UNIQUE (group_id, question_number)
);
CREATE INDEX idx_group_questions_group ON group_questions (group_id);

CREATE TABLE vocabulary_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE,
  question_number int,
  correct_answer character NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  score numeric,
  level_tag int CHECK (level_tag >= 1 AND level_tag <= 6),
  UNIQUE (exam_id, question_number)
);

CREATE TABLE translation_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE,
  question_number int, grammar_tags text[], score numeric,
  level_tag int CHECK (level_tag >= 1 AND level_tag <= 6),
  UNIQUE (exam_id, question_number)
);

CREATE TABLE essay_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE,
  question_number int, score numeric,
  UNIQUE (exam_id, question_number)
);

CREATE TABLE exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  submitted_at timestamptz,
  time_spent_seconds int,
  status text DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','submitted','graded')),
  vocabulary_score numeric, cloze_score numeric, contextual_score numeric,
  structure_score numeric, reading_score numeric, mixed_score numeric,
  translation_score numeric, essay_score numeric, total_score numeric
);
CREATE INDEX idx_attempts_user   ON exam_attempts (user_id);
CREATE INDEX idx_attempts_exam   ON exam_attempts (exam_id);
CREATE INDEX idx_attempts_status ON exam_attempts (status);

CREATE TABLE exam_user_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  vocabulary_question_id  uuid REFERENCES vocabulary_questions(id)  ON DELETE CASCADE,
  group_question_id       uuid REFERENCES group_questions(id)       ON DELETE CASCADE,
  translation_question_id uuid REFERENCES translation_questions(id) ON DELETE CASCADE,
  essay_question_id       uuid REFERENCES essay_questions(id)       ON DELETE CASCADE,
  user_answer text,
  is_correct boolean,
  score_earned numeric DEFAULT 0,
  grader_feedback text,
  graded_by uuid REFERENCES auth.users(id),
  graded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  time_spent_seconds int DEFAULT 0,
  CONSTRAINT single_question_source CHECK (
    (CASE WHEN vocabulary_question_id  IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN group_question_id       IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN translation_question_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN essay_question_id       IS NOT NULL THEN 1 ELSE 0 END) = 1)
);
CREATE INDEX idx_answers_attempt ON exam_user_answers (attempt_id);

-- 原始的自動判分器（migration 會取代它）
CREATE OR REPLACE FUNCTION public.auto_grade_choice_answer()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
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

-- 實測到的 RLS 政策
ALTER TABLE exams                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabulary_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE essay_questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_user_answers     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published exams viewable by all" ON exams FOR SELECT USING (status = 'published');
CREATE POLICY "Vocab questions viewable for published exams" ON vocabulary_questions FOR SELECT
  USING (EXISTS (SELECT 1 FROM exams WHERE exams.id = vocabulary_questions.exam_id AND exams.status = 'published'));
CREATE POLICY "Group questions viewable for published exams" ON group_questions FOR SELECT
  USING (EXISTS (SELECT 1 FROM question_groups qg JOIN exams e ON e.id = qg.exam_id
                 WHERE qg.id = group_questions.group_id AND e.status = 'published'));
CREATE POLICY "Translation questions viewable for published exams" ON translation_questions FOR SELECT
  USING (EXISTS (SELECT 1 FROM exams WHERE exams.id = translation_questions.exam_id AND exams.status = 'published'));
CREATE POLICY "Essay questions viewable for published exams" ON essay_questions FOR SELECT
  USING (EXISTS (SELECT 1 FROM exams WHERE exams.id = essay_questions.exam_id AND exams.status = 'published'));
CREATE POLICY "Question groups viewable for published exams" ON question_groups FOR SELECT
  USING (EXISTS (SELECT 1 FROM exams WHERE exams.id = question_groups.exam_id AND exams.status = 'published'));

CREATE POLICY "Users view own attempts"   ON exam_attempts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users create own attempts" ON exam_attempts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own attempts" ON exam_attempts FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users view own answers"   ON exam_user_answers FOR SELECT
  USING (EXISTS (SELECT 1 FROM exam_attempts WHERE exam_attempts.id = exam_user_answers.attempt_id AND exam_attempts.user_id = auth.uid()));
CREATE POLICY "Users create own answers" ON exam_user_answers FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM exam_attempts WHERE exam_attempts.id = exam_user_answers.attempt_id AND exam_attempts.user_id = auth.uid()));
CREATE POLICY "Users update own answers" ON exam_user_answers FOR UPDATE
  USING (EXISTS (SELECT 1 FROM exam_attempts WHERE exam_attempts.id = exam_user_answers.attempt_id AND exam_attempts.user_id = auth.uid()));

-- 套用前的寬鬆授權（正是要被硬化收緊的部分）
GRANT SELECT, INSERT, UPDATE, DELETE ON exam_user_answers TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON exam_attempts     TO authenticated, anon;
GRANT SELECT ON exams, question_groups, group_questions, vocabulary_questions,
                translation_questions, essay_questions TO authenticated, anon;

-- ─────────────────────────────────────────────
-- iLearn legacy（不在範圍內；用來證明 migration 不碰它）
-- ─────────────────────────────────────────────
CREATE TABLE exam_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, description text
);

CREATE TABLE exam_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_type_id uuid REFERENCES exam_types(id),
  total_score numeric, max_score numeric,
  percentage_score numeric, grade varchar(10),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_exam_records_student ON exam_records (student_id);

CREATE OR REPLACE FUNCTION public.calculate_total_score()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.total_score IS NOT NULL AND NEW.max_score IS NOT NULL AND NEW.max_score > 0 THEN
    NEW.percentage_score := round((NEW.total_score / NEW.max_score) * 100, 2);
  END IF;
  RETURN NEW;
END; $function$;

CREATE TRIGGER legacy_calc_percentage
  BEFORE INSERT OR UPDATE ON public.exam_records
  FOR EACH ROW EXECUTE FUNCTION public.calculate_total_score();

ALTER TABLE exam_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_types   ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students view own exam records" ON exam_records FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Exam types viewable by all"     ON exam_types   FOR SELECT USING (true);
GRANT SELECT ON exam_records, exam_types TO authenticated;

-- legacy 的真實資料（正式環境有 5 列）
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','student.a@test'),
  ('bbbbbbbb-0000-0000-0000-000000000002','student.b@test');
INSERT INTO exam_types (name) VALUES ('段考'), ('模擬考');
INSERT INTO exam_records (student_id, exam_type_id, total_score, max_score, grade)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001', t.id, s.v, 100, 'A'
FROM exam_types t CROSS JOIN (VALUES (88),(92),(75),(81),(69)) AS s(v)
LIMIT 5;
