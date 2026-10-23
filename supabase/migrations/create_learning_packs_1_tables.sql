-- =====================================================
-- 主題學習包 —— 第一期：資料表
--
-- 🔴 先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 只新增表，不改任何既有表、不動任何既有資料。
--
-- 回滾：supabase/migrations/create_learning_packs_1_tables.rollback.sql
--
-- ══════════════════════════════════════════════════════════════
-- 這是什麼
-- ══════════════════════════════════════════════════════════════
--
-- 一個「引用既有教材、排出順序、設定完成條件」的容器。
-- 教材本身【不複製】—— 閱讀文章仍然在 reading_passages，
-- 單字集仍然在 packs。學習包只存「引用」與「順序」。
--
-- 為什麼不擴充 learn_courses：那張表的單元是影片
-- （learn_course_lessons 有 video_id、bunny 設定、watch tracking）。
-- 把閱讀題組與單字任務塞進去，會讓那張表的語意變成「有時候是影片、
-- 有時候不是」，而每一個讀它的地方都要開始分辨。
--
-- ══════════════════════════════════════════════════════════════
-- 🛑 三種單字任務的分母與完成條件（規格要求明確定義）
-- ══════════════════════════════════════════════════════════════
--
-- 這三個定義是這張表存在的理由之一。第三期實作判定時【必須】照這裡寫的，
-- 不可以改成「點進頁面就算完成」。
--
--   exposure（接觸型）
--     分母：target_count，或 NULL 時 = 該單字集的字數
--     完成：學生在本單元對【target_count 個不同的單字】
--           各留下至少一筆 flashcard attempt
--     ⚠️ 用【不同單字數】當分母，不是 attempt 筆數 ——
--        同一張卡翻十次不等於看了十個字。
--
--   srs（複習型）
--     分母：指定字數（同上）
--     完成：那些字【各自】在本單元期間完成至少一次 srs 複習
--           （lexical_attempts 有 self_rating 的那種）
--     🛑 刻意【不】用「完成本次到期字」。到期字會因為完成而減少，
--        分母一邊算一邊縮水，完成率會失真 —— 規格自己也點出這件事。
--
--   quiz（檢核型）
--     分母：target_count 題
--     完成：達到題數，而且【以首次作答計】
--     ⚠️ 首次作答的定義：同一個學習包單元內，該學生對該題的第一筆。
--        看完答案再答對不等於首次獨立答對，所以重作不會補回首次的錯。
--
-- ══════════════════════════════════════════════════════════════
-- 🛑 pack 來源不可以選「同反義字」
-- ══════════════════════════════════════════════════════════════
--
--   pack_items 這張表【沒有】synonyms / antonyms 欄位
--   （見 src/lib/lexical/mapper.ts 的註解，那是結構性缺失不是漏填）。
--   所以單字集來源的同反義字練習，候選清單恆為空、出不了題。
--
--   這裡用 CHECK 擋住，而不是只在前端 disable：
--   讓一個永遠產不出題目的單元存進資料庫，學生端只會看到空畫面，
--   而管理員不會知道為什麼。
--
--   canonical 的 lexical_items 有這兩個欄位，但七個練習頁目前還沒改讀新表。
--   之後若改了，放寬這個 CHECK 即可。
-- =====================================================

-- =====================================================
-- 學習包
-- =====================================================
CREATE TABLE IF NOT EXISTS learning_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 獨立網址。規則與 learn_courses.slug 相同，不另立一套。
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),

  title   TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  summary TEXT NOT NULL DEFAULT '',
  cover_path TEXT,

  -- 適用年級。自由文字：各校說法不一，列舉會立刻不夠用。
  grade TEXT,

  -- 🛑 教材對應。全部可為 NULL，而 NULL 有明確語意：
  --    沒有對應教材版本 = 這個包是【共通能力練習】，
  --    學生端必須明講，不可以讓人以為涵蓋了他學校的範圍。
  --    「高一上第一次段考」各校範圍不同，這是規格特別點出的陷阱。
  textbook_version TEXT,   -- 版本（龍騰／三民／…）
  textbook_volume  TEXT,   -- 冊別
  textbook_lessons TEXT,   -- 課次，可能是 'L1-L3' 這種區間
  scope_note       TEXT,   -- 補充範圍的說明

  -- 學習目標。字串陣列，順序有意義。
  goals JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(goals) = 'array'),

  estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),

  status TEXT NOT NULL DEFAULT 'DRAFT'
         CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),

  -- 開放與截止。都可為 NULL = 不限。
  open_at  TIMESTAMPTZ,
  close_at TIMESTAMPTZ,
  CONSTRAINT learning_packs_window
    CHECK (close_at IS NULL OR open_at IS NULL OR close_at > open_at),

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE learning_packs IS
  '主題學習包：引用既有教材、排序、設定完成條件的容器。教材本身不複製。🛑 textbook_version 為 NULL 代表「共通能力練習」，學生端必須明講 —— 各校段考範圍不同，不可以讓人誤以為涵蓋了他的範圍。';
COMMENT ON COLUMN learning_packs.goals IS
  '學習目標，字串陣列，順序有意義。';


-- =====================================================
-- 單元
-- =====================================================
CREATE TABLE IF NOT EXISTS learning_pack_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  pack_id UUID NOT NULL REFERENCES learning_packs(id) ON DELETE CASCADE,

  sort_order INTEGER NOT NULL DEFAULT 0,
  title      TEXT    NOT NULL CHECK (length(btrim(title)) > 0),

  activity_type TEXT NOT NULL CHECK (activity_type IN ('reading', 'vocab')),

  -- ── 來源：恰好一個 ──
  -- 🛑 ON DELETE RESTRICT 而不是 CASCADE：教材被刪掉時應該要擋下來，
  --    而不是安靜地讓學習包少一個單元。已經有人做過的單元更不能無聲消失。
  -- ⚠️ reading_passages.passage_id 是 TEXT 不是 UUID。
  reading_passage_id TEXT REFERENCES reading_passages(passage_id) ON DELETE RESTRICT,
  vocab_pack_id      UUID REFERENCES packs(id)                    ON DELETE RESTRICT,

  -- ── vocab 專用 ──
  -- 練習模式。與 lexical_attempts.exercise_type 同一組字串，
  -- 但【不含 cluster_recall】（那不是學生端的七個模式之一）。
  vocab_mode TEXT CHECK (vocab_mode IN (
    'srs', 'quick_quiz', 'flashcard', 'spelling',
    'fill_blank', 'match', 'synonym_antonym'
  )),

  -- 任務型態。三種的分母與完成條件見檔頭。
  task_kind TEXT NOT NULL CHECK (task_kind IN ('reading', 'exposure', 'srs', 'quiz')),

  -- 分母。NULL = 全部（由來源推算），讓老師不必手動數字數。
  target_count INTEGER CHECK (target_count IS NULL OR target_count > 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── 一致性 ──
  CONSTRAINT lpu_exactly_one_source
    CHECK (num_nonnulls(reading_passage_id, vocab_pack_id) = 1),

  CONSTRAINT lpu_reading_shape CHECK (
    activity_type <> 'reading' OR (
      reading_passage_id IS NOT NULL
      AND vocab_mode IS NULL
      AND task_kind = 'reading')),

  CONSTRAINT lpu_vocab_shape CHECK (
    activity_type <> 'vocab' OR (
      vocab_pack_id IS NOT NULL
      AND vocab_mode IS NOT NULL
      AND task_kind IN ('exposure', 'srs', 'quiz'))),

  -- 🛑 見檔頭：pack_items 沒有同反義字欄位，這個組合永遠產不出題目。
  CONSTRAINT lpu_no_synonym_antonym_from_pack
    CHECK (vocab_mode IS DISTINCT FROM 'synonym_antonym'),

  -- srs 任務一定是 srs 模式；反過來也成立。混用會讓完成條件沒有意義。
  CONSTRAINT lpu_srs_pairs_with_srs_mode
    CHECK ((task_kind = 'srs') = (vocab_mode = 'srs') OR activity_type = 'reading'),

  -- 接觸型只有翻卡做得到「曝光」這件事
  CONSTRAINT lpu_exposure_is_flashcard
    CHECK (task_kind <> 'exposure' OR vocab_mode = 'flashcard')
);

COMMENT ON TABLE learning_pack_units IS
  '學習包的單元。引用既有教材（reading_passages 或 packs），不複製內容。ON DELETE RESTRICT：教材被刪時擋下來，不讓學習包安靜地少一個單元。🛑 三種單字任務的分母與完成條件定義在 create_learning_packs_1_tables.sql 檔頭，第三期判定時必須照那裡寫的。';
COMMENT ON COLUMN learning_pack_units.target_count IS
  '分母。NULL = 全部（由來源推算）。exposure/srs 算的是【不同單字數】不是 attempt 筆數 —— 同一張卡翻十次不等於看了十個字。';


-- ── 索引 ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_learning_packs_status
  ON learning_packs (status, created_at DESC);
-- 學生端用 slug 進來
CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_packs_slug
  ON learning_packs (slug);
-- 單元依序取出
CREATE INDEX IF NOT EXISTS idx_learning_pack_units_order
  ON learning_pack_units (pack_id, sort_order, id);
-- 「這篇文章／這個單字集被哪些學習包用了」—— 刪除教材前要查得到
CREATE INDEX IF NOT EXISTS idx_learning_pack_units_passage
  ON learning_pack_units (reading_passage_id) WHERE reading_passage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_pack_units_vocab
  ON learning_pack_units (vocab_pack_id) WHERE vocab_pack_id IS NOT NULL;


-- ── updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION learning_packs_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_learning_packs_touch ON learning_packs;
CREATE TRIGGER trg_learning_packs_touch
  BEFORE UPDATE ON learning_packs
  FOR EACH ROW EXECUTE FUNCTION learning_packs_touch();

DROP TRIGGER IF EXISTS trg_learning_pack_units_touch ON learning_pack_units;
CREATE TRIGGER trg_learning_pack_units_touch
  BEFORE UPDATE ON learning_pack_units
  FOR EACH ROW EXECUTE FUNCTION learning_packs_touch();


-- ── RLS ───────────────────────────────────────────────
-- 🛑 與 learn_courses 同一個作法：authenticated 一列都讀不到，全部走 RPC。
--    未發布的學習包不可以透過公開 API 讀到 —— 規格十一明確要求。
--    沒有 authenticated 的 policy 就是讀不到，這是刻意的。
ALTER TABLE learning_packs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_pack_units ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['learning_packs', 'learning_pack_units'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_service_all ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_service_all ON public.%I FOR ALL TO service_role
         USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT '1. 兩張表都建好'                       AS "檢查項",
       (SELECT count(*)::text FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('learning_packs', 'learning_pack_units')) AS "結果",
       (SELECT count(*) FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('learning_packs', 'learning_pack_units')) = 2 AS "通過"

UNION ALL
SELECT '2. 兩張表都開了 RLS',
       (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relrowsecurity
           AND c.relname IN ('learning_packs', 'learning_pack_units')),
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relrowsecurity
           AND c.relname IN ('learning_packs', 'learning_pack_units')) = 2

UNION ALL
SELECT '🛑 3. authenticated 一列都讀不到（未發布的包不可外流）',
       (SELECT has_table_privilege('authenticated', 'public.learning_packs', 'SELECT')::text),
       NOT has_table_privilege('authenticated', 'public.learning_packs', 'SELECT')
       AND NOT has_table_privilege('authenticated', 'public.learning_pack_units', 'SELECT')

UNION ALL
SELECT '🛑 4. 同反義字 + 單字集的組合被擋下',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conname = 'lpu_no_synonym_antonym_from_pack'),
       (SELECT count(*) FROM pg_constraint
         WHERE conname = 'lpu_no_synonym_antonym_from_pack') = 1

UNION ALL
SELECT '5. 目前的學習包數（剛建好應該是 0）',
       (SELECT count(*)::text FROM public.learning_packs),
       true;
