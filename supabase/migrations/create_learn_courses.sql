-- =====================================================
-- 影片課程：資料表
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 這一份只建表，不含任何 RPC。RPC 在 create_learn_course_rpcs.sql。
--
--
-- 【為什麼不沿用 courses / course_lessons】
--
--   那三張遺留表（courses 2 列、course_lessons 10 列、user_course_access 3 列）
--   在 lock_down_dead_legacy_tables.sql 裡已經被判定為死表並關閉。復活它們
--   等於把剛收掉的攻擊面重新打開，而且它們的欄位撐不住底下這些需求。
--   新的走 learn_* 家族，跟 reading / writing 同一套閘門與同一套慣例。
--
--
-- 🛑 影片位址存成 (provider, video_id)，不存完整網址
--
--   存 URL 的話，換 CDN、加簽章、改網域都要掃全表做字串取代，而且沒有
--   任何東西擋得住有人貼進一個 http:// 的外部連結。拆成兩欄之後，
--   「網址長什麼樣」是播放層的事，資料庫只記「這支片子是誰家的第幾號」。
--
-- 🛑 duration_seconds 是整數，不是 "15:30"
--
--   現有樣板存的是顯示字串。字串沒辦法加總、沒辦法算「這門課還剩多久」、
--   排序會變成字典序（"9:00" > "15:30"）。格式化是前端的事。
--
-- 🛑 learn_course_lessons 對 authenticated 完全不開放 SELECT
--
--   只要能直接 select，就等於把每一支影片的 video_id 一次發給所有登入者,
--   鎖住的單元也一樣。學生端一律走 SECURITY DEFINER 的 RPC，
--   而 video_id 只在 learn_course_playback() 裡、驗過權限之後才會出現。
--
-- 回滾：supabase/migrations/create_learn_courses.rollback.sql
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'learn_require_admin'
  ) THEN
    RAISE EXCEPTION '需要 learn_require_admin()，請先套用 create_learn_classes_tasks.sql';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'learn_feature_enabled'
  ) THEN
    RAISE EXCEPTION '需要 learn_feature_enabled()，請先套用 create_learn_feature_access.sql';
  END IF;
END;
$$;


-- ── 課程 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learn_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 網址用的代號。給人看的、可以改，所以主鍵仍然是 UUID。
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),

  title       TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  instructor  TEXT NOT NULL DEFAULT '',

  -- 封面圖：Supabase storage 的 path，不是完整網址（理由同影片）
  cover_path TEXT,

  level  TEXT NOT NULL DEFAULT 'BEGINNER'
         CHECK (level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
  category TEXT NOT NULL DEFAULT '',

  -- STANDARD = 週次課，全部單元一開始就開著
  -- DRIP     = 循序解鎖，前一個單元全部看完才開下一個
  type TEXT NOT NULL DEFAULT 'STANDARD' CHECK (type IN ('STANDARD', 'DRIP')),

  -- 🛑 FREE 不等於「公開」。它的意思是「有課程功能的人不必個別選課」，
  --    沒有課程功能的人一樣看不到。真正的公開是不存在的選項。
  access TEXT NOT NULL DEFAULT 'ENROLLED' CHECK (access IN ('FREE', 'ENROLLED')),

  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),

  sort_order INTEGER NOT NULL DEFAULT 0,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE learn_courses IS
  '影片課程。type 決定解鎖方式，access 決定要不要個別選課，status 決定學生看不看得到。';
COMMENT ON COLUMN learn_courses.access IS
  'FREE = 有課程功能的人都看得到，不必個別選課；ENROLLED = 要在 learn_course_access 裡有一列。🛑 兩者都擋未開放課程功能的人。';


-- ── 章節（週次 / 單元）────────────────────────────────
-- 週次課叫「第 N 週」、循序課叫「單元 N」，那只是標籤，資料結構同一個。
CREATE TABLE IF NOT EXISTS learn_course_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES learn_courses(id) ON DELETE CASCADE,

  position    INTEGER NOT NULL CHECK (position >= 1),
  title       TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (course_id, position)
);


-- ── 單支影片 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learn_course_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES learn_course_sections(id) ON DELETE CASCADE,

  position    INTEGER NOT NULL CHECK (position >= 1),
  title       TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',

  -- 🛑 provider + video_id，不是網址。理由見檔頭。
  provider TEXT NOT NULL CHECK (provider IN ('BUNNY', 'YOUTUBE')),
  video_id TEXT NOT NULL CHECK (length(btrim(video_id)) > 0),

  -- 🛑 秒數。前端自己格式化成 15:30。
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),

  -- 試看：就算沒選課也能播。用來做課程介紹的第一支。
  is_preview BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (section_id, position)
);

COMMENT ON COLUMN learn_course_lessons.video_id IS
  'BUNNY = Bunny Stream 的 video GUID；YOUTUBE = 11 碼的影片 ID。🛑 不是網址。';
COMMENT ON COLUMN learn_course_lessons.is_preview IS
  '試看。true 時不需要選課也能播，但仍然需要「課程」功能與課程已發布。';


-- ── 選課權限 ──────────────────────────────────────────
-- 形狀刻意跟 learn_feature_access 一樣：一列只授權一種對象，兩者取聯集。
CREATE TABLE IF NOT EXISTS learn_course_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES learn_courses(id) ON DELETE CASCADE,

  class_id   UUID REFERENCES learn_classes(id) ON DELETE CASCADE,
  student_id UUID REFERENCES auth.users(id)    ON DELETE CASCADE,

  granted_by UUID NOT NULL REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,

  CONSTRAINT learn_course_access_one_subject
    CHECK (num_nonnulls(class_id, student_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS learn_course_access_class_uq
  ON learn_course_access (course_id, class_id)   WHERE class_id   IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS learn_course_access_student_uq
  ON learn_course_access (course_id, student_id) WHERE student_id IS NOT NULL;


-- ── 觀看進度 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learn_lesson_progress (
  student_id UUID NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  lesson_id  UUID NOT NULL REFERENCES learn_course_lessons(id) ON DELETE CASCADE,

  -- NULL = 看過但沒看完。看完的時間戳，不是布林——日後要算
  -- 「這一週有幾個人上完」需要時間，補不回來。
  completed_at TIMESTAMPTZ,

  -- 續看用。播放器每隔一段時間回報一次。
  last_position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (last_position_seconds >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (student_id, lesson_id)
);


-- ── 索引 ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS learn_courses_status_idx
  ON learn_courses (status, sort_order, created_at);
CREATE INDEX IF NOT EXISTS learn_course_sections_course_idx
  ON learn_course_sections (course_id, position);
CREATE INDEX IF NOT EXISTS learn_course_lessons_section_idx
  ON learn_course_lessons (section_id, position);
CREATE INDEX IF NOT EXISTS learn_course_access_student_idx
  ON learn_course_access (student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS learn_course_access_class_idx
  ON learn_course_access (class_id) WHERE class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS learn_lesson_progress_lesson_idx
  ON learn_lesson_progress (lesson_id) WHERE completed_at IS NOT NULL;


-- ── updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION learn_courses_touch() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['learn_courses','learn_course_sections',
                           'learn_course_lessons','learn_lesson_progress'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_touch BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.learn_courses_touch()', t, t);
  END LOOP;
END $$;


-- ── RLS ───────────────────────────────────────────────
-- 🛑 除了 learn_courses 的清單之外，一律【不給 authenticated 直接讀】。
--    學生端全部走 RPC。這不是多此一舉：只要 learn_course_lessons 能被
--    直接 select，鎖住單元的 video_id 就等於公開。
ALTER TABLE learn_courses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_course_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_course_lessons  ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_course_access   ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_lesson_progress ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['learn_courses','learn_course_sections','learn_course_lessons',
                           'learn_course_access','learn_lesson_progress'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_service_all ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_service_all ON public.%I FOR ALL TO service_role
         USING (true) WITH CHECK (true)', t, t);
    -- 沒有 authenticated 的 policy = 一列都讀不到。這是刻意的。
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('learn_courses','learn_course_sections','learn_course_lessons',
                         'learn_course_access','learn_lesson_progress'))   AS "新表數（應為 5）",
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relrowsecurity
      AND c.relname LIKE 'learn_course%' OR c.relname = 'learn_lesson_progress') AS "已開 RLS",
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename LIKE 'learn_%'
      AND roles::text LIKE '%authenticated%'
      AND tablename IN ('learn_courses','learn_course_sections','learn_course_lessons',
                        'learn_course_access','learn_lesson_progress'))    AS "authenticated 的 policy（應為 0）";
