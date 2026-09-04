-- =====================================================
-- BOOTSTRAP：mock 模考「基礎 schema」（硬化「之前」的狀態）
--
-- 來源：ytzspnjmkvrkbztnaomm（正式）在 2026-09 執行
--       supabase/tests/mock_exam_schema_fingerprint.sql 的輸出。
--       正式環境是唯一的 source of truth；本檔逐項照抄，不做「改良」。
--
-- 用途：staging cwymrzcovgobfqxtithn 完全沒有這八張表。
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
-- 幾個容易被誤讀、但正式環境確實如此的地方（不要「順手修正」）：
--    · exams.id 與 question_groups.id 是 text，而且沒有預設值。
--      題目與 attempt 一路往下的 exam_id / group_id 因此都是 text。
--    · essay_questions.question_number 與 translation_questions.question_number
--      是 text；vocabulary_questions 與 group_questions 的則是 integer。
--    · 分數欄位有精度：題目與作答是 numeric(4,2)，考卷與 attempt 是 numeric(5,2)。
--    · 五個 ENUM 全部使用中文標籤（difficulty_level、essay_type、
--      mixed_question_type），只有 exam_status 與 question_group_type 是英文。
--
-- 前置條件（Supabase 平台本來就會提供）：
--    · schema auth 與 auth.users
--    · 函式 auth.uid()
--    · 角色 authenticated、anon、service_role
--
-- 套用後請執行 supabase/tests/mock_exam_schema_fingerprint.sql，
-- 與 supabase/tests/mock_exam_base_schema.expected.txt 逐行比對。
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

  FOREACH v_t IN ARRAY ARRAY[
    'exam_status','difficulty_level','question_group_type',
    'mixed_question_type','essay_type'] LOOP
    IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
               WHERE n.nspname = 'public' AND t.typname = v_t) THEN
      v_taken := v_taken || ('type ' || v_t);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'auto_grade_choice_answer') THEN
    v_taken := v_taken || 'function auto_grade_choice_answer'::text;
  END IF;

  FOREACH v_t IN ARRAY ARRAY[
    'idx_exams_status','idx_exams_year','idx_groups_exam','idx_groups_type',
    'idx_group_questions_group','idx_group_questions_number','idx_vocab_exam',
    'idx_vocab_level','idx_translation_exam','idx_essay_exam',
    'idx_attempts_user','idx_attempts_exam','idx_attempts_status','idx_answers_attempt'] LOOP
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = v_t) THEN
      v_taken := v_taken || ('index ' || v_t);
    END IF;
  END LOOP;

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

  FOREACH v_t IN ARRAY ARRAY['authenticated','anon','service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_t) THEN
      RAISE EXCEPTION 'bootstrap 中止：找不到角色 %。', v_t;
    END IF;
  END LOOP;
END $guard$;


-- ─────────────────────────────────────────────
-- 1. 型別
-- ─────────────────────────────────────────────
CREATE TYPE public.exam_status         AS ENUM ('draft', 'published', 'archived');
CREATE TYPE public.difficulty_level    AS ENUM ('簡單', '中等', '困難');
CREATE TYPE public.question_group_type AS ENUM ('cloze', 'contextual', 'structure', 'reading', 'mixed');
CREATE TYPE public.mixed_question_type AS ENUM ('選擇', '填空', '配對', '排序');
CREATE TYPE public.essay_type          AS ENUM ('記敘文', '議論文', '說明文');


-- ─────────────────────────────────────────────
-- 2. 考卷
--
-- id 是 text 且沒有預設值：正式環境用的是人類可讀的識別碼
-- （例如 "114-gsat"），不是 uuid。所有下游的 exam_id 因此都是 text。
-- ─────────────────────────────────────────────
CREATE TABLE public.exams (
  id               text PRIMARY KEY,
  title            text NOT NULL,
  year             integer NOT NULL,
  month            integer,
  difficulty       public.difficulty_level DEFAULT '中等',
  total_score      numeric(5,2) DEFAULT 100,
  duration_minutes integer DEFAULT 100,
  notes            text,
  status           public.exam_status DEFAULT 'draft',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  created_by       uuid REFERENCES auth.users(id)
);
CREATE INDEX idx_exams_status ON public.exams (status);
CREATE INDEX idx_exams_year   ON public.exams (year);


-- ─────────────────────────────────────────────
-- 3. 題組
--
-- 克漏字／文意選填／篇章結構／閱讀測驗／混合題各是一個 group，
-- 底下掛 N 道原子 group_questions。部分給分由原子加總自然浮現。
-- ─────────────────────────────────────────────
CREATE TABLE public.question_groups (
  id                  text PRIMARY KEY,
  exam_id             text NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  group_type          public.question_group_type NOT NULL,
  group_order         integer NOT NULL,
  title               text,
  content             text NOT NULL,
  content_translation text,
  option_count        integer,
  option_list         text,
  structure_option_a  text,
  structure_option_b  text,
  structure_option_c  text,
  structure_option_d  text,
  structure_option_e  text,
  article_type        text,
  chart_description   text,
  topic_tags          text[],
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  content_image       text,
  UNIQUE (exam_id, group_type, group_order)
);
CREATE INDEX idx_groups_exam ON public.question_groups (exam_id);
CREATE INDEX idx_groups_type ON public.question_groups (group_type);


-- ─────────────────────────────────────────────
-- 4. 題目
-- ─────────────────────────────────────────────
CREATE TABLE public.group_questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          text NOT NULL REFERENCES public.question_groups(id) ON DELETE CASCADE,
  question_number   integer NOT NULL,
  blank_number      integer,
  question_text     text,
  option_a          text,
  option_b          text,
  option_c          text,
  option_d          text,
  correct_answer    text NOT NULL,
  explanation       text,
  mixed_type        public.mixed_question_type,
  grammar_small     text,
  grammar_medium    text,
  grammar_large     text,
  level_tag         integer CHECK (level_tag >= 1 AND level_tag <= 6),
  phrase_tag        text,
  question_type_tag text,
  score             numeric(4,2) DEFAULT 2,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  options_type      text DEFAULT 'text',
  UNIQUE (group_id, question_number)
);
CREATE INDEX idx_group_questions_group  ON public.group_questions (group_id);
CREATE INDEX idx_group_questions_number ON public.group_questions (question_number);

CREATE TABLE public.vocabulary_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id         text NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  question_number integer NOT NULL,
  question_text   text NOT NULL,
  option_a        text NOT NULL,
  option_b        text NOT NULL,
  option_c        text NOT NULL,
  option_d        text NOT NULL,
  correct_answer  character(1) NOT NULL
                    CHECK (correct_answer = ANY (ARRAY['A'::bpchar,'B'::bpchar,'C'::bpchar,'D'::bpchar])),
  explanation     text,
  level_tag       integer CHECK (level_tag >= 1 AND level_tag <= 6),
  topic_tags      text[],
  score           numeric(4,2) DEFAULT 1,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (exam_id, question_number)
);
CREATE INDEX idx_vocab_exam  ON public.vocabulary_questions (exam_id);
CREATE INDEX idx_vocab_level ON public.vocabulary_questions (level_tag);

-- question_number 在這裡是 text（正式環境如此），與單字題的 integer 不同。
CREATE TABLE public.translation_questions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id          text NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  question_number  text NOT NULL,
  chinese_text     text NOT NULL,
  reference_answer text NOT NULL,
  scoring_criteria text,
  explanation      text,
  grammar_tags     text[],
  level_tag        integer CHECK (level_tag >= 1 AND level_tag <= 6),
  phrase_tag       text,
  topic_tags       text[],
  score            numeric(4,2) DEFAULT 4,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (exam_id, question_number)
);
CREATE INDEX idx_translation_exam ON public.translation_questions (exam_id);

-- 注意：作文題「沒有」level_tag，也因此沒有對應的 CHECK。
CREATE TABLE public.essay_questions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id                text NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  question_number        text NOT NULL,
  prompt                 text NOT NULL,
  essay_type             public.essay_type DEFAULT '記敘文',
  word_count_requirement integer DEFAULT 120,
  scoring_criteria       text,
  sample_essay           text,
  writing_tips           text,
  error_type_tags        text[],
  topic_tags             text[],
  score                  numeric(4,2) DEFAULT 20,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  prompt_image           text,
  UNIQUE (exam_id, question_number)
);
CREATE INDEX idx_essay_exam ON public.essay_questions (exam_id);


-- ─────────────────────────────────────────────
-- 5. 作答
--
-- 這兩張表刻意維持硬化「之前」的狀態。
-- 已知缺陷（由階段 2 修補，這裡不要先修）：
--   · score_earned DEFAULT 0 → 未批改與零分無法區分
--   · 沒有 (attempt_id, question_id) 唯一鍵 → saveAnswer() 的 upsert 會 42P10
--   · user_answer 可為 NULL、可為空字串
--   · RLS 只限制「哪些列」，沒限制「哪些欄」→ 學生可自行給分
--   · updated_at 沒有任何東西維護
--   · attempt 的九個分數欄位 DEFAULT 0 → 未評分與零分同樣無法區分
-- ─────────────────────────────────────────────
CREATE TABLE public.exam_attempts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id            text NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  started_at         timestamptz DEFAULT now(),
  submitted_at       timestamptz,
  time_spent_seconds integer,
  vocabulary_score   numeric(5,2) DEFAULT 0,
  cloze_score        numeric(5,2) DEFAULT 0,
  contextual_score   numeric(5,2) DEFAULT 0,
  structure_score    numeric(5,2) DEFAULT 0,
  reading_score      numeric(5,2) DEFAULT 0,
  mixed_score        numeric(5,2) DEFAULT 0,
  translation_score  numeric(5,2) DEFAULT 0,
  essay_score        numeric(5,2) DEFAULT 0,
  total_score        numeric(5,2) DEFAULT 0,
  status             text DEFAULT 'in_progress'
                       CHECK (status IN ('in_progress','submitted','graded')),
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
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
  score_earned            numeric(4,2) DEFAULT 0,
  grader_feedback         text,
  graded_by               uuid REFERENCES auth.users(id),
  graded_at               timestamptz,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  time_spent_seconds      integer DEFAULT 0,
  CONSTRAINT single_question_source CHECK (
    (CASE WHEN vocabulary_question_id  IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN group_question_id       IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN translation_question_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN essay_question_id       IS NOT NULL THEN 1 ELSE 0 END) = 1)
);
CREATE INDEX idx_answers_attempt ON public.exam_user_answers (attempt_id);


-- ─────────────────────────────────────────────
-- 6. 自動判分（硬化前的版本，逐字取自正式環境）
--
-- 這一版是刻意保留缺陷的：
--   · 沒有 SECURITY DEFINER → SELECT 受 RLS 限制，
--     在 draft 考卷上判分會失敗，而且錯誤訊息會誤導人
--   · 翻譯／作文沒有分支 → 整列原封不動穿過去，
--     學生可以自行寫入 is_correct 與 score_earned
--   · 單字題只把學生答案轉大寫，題組題兩邊都轉
-- 全部由階段 2 的 mock_exam_auto_grade() 修掉。
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_grade_choice_answer()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  correct TEXT;
  q_score NUMERIC(4,2);
BEGIN
  -- 單字題
  IF NEW.vocabulary_question_id IS NOT NULL THEN
    SELECT correct_answer, score INTO correct, q_score
    FROM vocabulary_questions WHERE id = NEW.vocabulary_question_id;
    
    NEW.is_correct := (UPPER(NEW.user_answer) = correct);
    NEW.score_earned := CASE WHEN NEW.is_correct THEN q_score ELSE 0 END;
  
  -- 題組題目
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
-- 7. RLS
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
-- 8. 授權（硬化前的寬鬆狀態）
--
-- 正式環境的實測結果：八張表對 anon、authenticated、postgres、service_role
-- 四個角色都是全套七項權限（DELETE、INSERT、REFERENCES、SELECT、
-- TRIGGER、TRUNCATE、UPDATE）——也就是 Supabase 預設權限的樣子，
-- 沒有任何人收斂過。連題目表都對 anon 可寫。
--
-- 這裡明確寫出來而不是依賴平台預設，是為了讓 staging 與正式一致且可驗證。
-- 收斂是階段 2 的工作，不是這裡的。
-- ─────────────────────────────────────────────
GRANT ALL ON public.exams,
             public.question_groups,
             public.group_questions,
             public.vocabulary_questions,
             public.translation_questions,
             public.essay_questions,
             public.exam_attempts,
             public.exam_user_answers
  TO anon, authenticated, service_role;


-- ─────────────────────────────────────────────
-- 9. 註解
-- ─────────────────────────────────────────────
COMMENT ON TABLE public.exam_user_answers IS
  'mock 模考的逐題作答。基礎 schema（硬化前）。'
  '尚未具備 (attempt_id, question_id) 唯一鍵與欄位級寫入限制。';
COMMENT ON TABLE public.exam_attempts IS
  'mock 模考的一次作答。基礎 schema（硬化前）。分數欄位目前學生可自行寫入。';
