-- =====================================================
-- Lexical Model Phase 1：canonical 字詞本體 + legacy 對照表
--
-- 🟢 只要在 production 執行一次（先在 gsat-staging 驗過再上）。
--
-- ⚠️ 這一份是【純新增】。不動 level_words、pack_items、user_word_progress、
--    pack_item_progress 任何一個欄位、任何一列、任何一條政策。
--    回滾見 create_lexical_core.rollback.sql。
--
-- 為什麼不是「phrase 另開一套表」
--   word / phrase / collocation / pattern / expression 在教學上是同一種東西：
--   一個可以被學、被考、被記住熟練度的語彙單位。差別只在 item_type。
--   拆成兩套表會讓 relations、pack、mastery、attempt 全部都要寫兩次。
-- =====================================================


-- =====================================================
-- 0. updated_at 觸發器（本模組自有，不借用 learn_ 的）
-- =====================================================

CREATE OR REPLACE FUNCTION lexical_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.created_at := OLD.created_at;   -- created_at 是事實，不接受改寫
  RETURN NEW;
END;
$$;

-- ⚠️ 觸發器函式也吃得到 Supabase 的 ALTER DEFAULT PRIVILEGES EXECUTE，要點名收回。
REVOKE ALL ON FUNCTION lexical_touch_updated_at() FROM PUBLIC, anon, authenticated;


-- =====================================================
-- 1. lexical_items：所有語彙內容的 canonical source
-- =====================================================

CREATE TABLE IF NOT EXISTS lexical_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 第一版五種。之後要加新型別請走新的 migration 改 CHECK，不要放寬成自由字串。
  item_type            TEXT NOT NULL
                       CHECK (item_type IN ('word','phrase','collocation','pattern','expression')),

  display_form         TEXT NOT NULL CHECK (btrim(display_form) <> ''),
  lemma                TEXT NOT NULL CHECK (btrim(lemma) <> ''),

  translation          TEXT,
  part_of_speech       TEXT,
  ipa                  TEXT,
  example              TEXT,
  example_translation  TEXT,
  difficulty           TEXT,
  extra_notes          TEXT,
  audio_url            TEXT,
  example_audio_url    TEXT,

  -- 這三欄不在規格的必要清單裡，但 level_words 有，不帶過來就是資料遺失，
  -- 而且前端的 VocabularyWord 篩選器（level / 詞性 / 主題）直接依賴它們。
  level                SMALLINT,
  category             TEXT,
  tags                 TEXT[] NOT NULL DEFAULT '{}',

  -- level_words.id 是 TEXT（'4448' 這種原始匯入編號），不是 uuid。
  -- UNIQUE 讓 Phase 7 的匯入可以重跑而不會產生第二份。
  -- 刻意【不加】FK 到 level_words：legacy 表的生命週期不該綁住 canonical 表。
  legacy_level_word_id TEXT UNIQUE,

  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE lexical_items IS
  'Canonical 語彙單位。word / phrase / collocation / pattern / expression 共用同一張表，差別只在 item_type。level_words 與 pack_items 仍然存在，透過 lexical_legacy_map 對應過來。';
COMMENT ON COLUMN lexical_items.lemma IS
  '正規化後的比對鍵（小寫、收斂空白）。刻意【不是】UNIQUE：同形異義與尚未確認可合併的項目允許並存，合併是人工決定，不是資料庫幫你猜。';
COMMENT ON COLUMN lexical_items.legacy_level_word_id IS
  'level_words.id（TEXT）。只有從官方題庫匯入的列才有值。無 FK：legacy 表之後若退役不應連帶影響 canonical 資料。';
COMMENT ON COLUMN lexical_items.level IS
  '沿用自 level_words.level（2–6）。pack_items 匯入的列為 NULL。';

CREATE INDEX IF NOT EXISTS lexical_items_lemma_idx        ON lexical_items (lower(lemma));
CREATE INDEX IF NOT EXISTS lexical_items_type_idx         ON lexical_items (item_type);
CREATE INDEX IF NOT EXISTS lexical_items_level_idx        ON lexical_items (level) WHERE level IS NOT NULL;
CREATE INDEX IF NOT EXISTS lexical_items_display_form_idx ON lexical_items (lower(display_form));
CREATE INDEX IF NOT EXISTS lexical_items_tags_idx         ON lexical_items USING GIN (tags);

DROP TRIGGER IF EXISTS trg_lexical_items_touch ON lexical_items;
CREATE TRIGGER trg_lexical_items_touch
  BEFORE UPDATE ON lexical_items
  FOR EACH ROW EXECUTE FUNCTION lexical_touch_updated_at();


-- =====================================================
-- 2. lexical_legacy_map：legacy id → canonical id
--
-- 這張表同時是 Phase 7 的 migration report ——
-- match_method 就是規格要求的四個分類。
-- =====================================================

CREATE TABLE IF NOT EXISTS lexical_legacy_map (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  legacy_source   TEXT NOT NULL CHECK (legacy_source IN ('level_word','pack_item')),
  legacy_id       TEXT NOT NULL,                -- level_words.id 或 pack_items.id（uuid 的字串形式）

  -- manual_review_required 的列沒有 canonical 對象，所以可為 NULL。
  lexical_item_id UUID REFERENCES lexical_items(id) ON DELETE CASCADE,

  match_method    TEXT NOT NULL
                  CHECK (match_method IN (
                    'exact_safe_match',        -- 可安全確認是同一個 lexical item
                    'new_item_created',        -- 找不到既有對象，建立了新的
                    'ambiguous_match',         -- 有多個候選，沒有合併，另建新項目並留待人工確認
                    'manual_review_required'   -- 資料本身有問題（空字串等），完全沒有建立
                  )),

  candidate_count INTEGER NOT NULL DEFAULT 0,   -- ambiguous 時有幾個候選
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (legacy_source, legacy_id),

  -- manual_review_required 以外都必須指得到 canonical 項目
  CHECK (match_method = 'manual_review_required' OR lexical_item_id IS NOT NULL)
);

COMMENT ON TABLE lexical_legacy_map IS
  'legacy 識別碼 → canonical lexical_items。同時是 Phase 7 的 migration report：match_method 即四個分類。前端與 record_lexical_attempt() 都靠它解析舊 id。';
COMMENT ON COLUMN lexical_legacy_map.legacy_id IS
  '刻意用 TEXT：level_words.id 是 TEXT、pack_items.id 是 UUID，一張表要能同時容納兩者。';

CREATE INDEX IF NOT EXISTS lexical_legacy_map_item_idx   ON lexical_legacy_map (lexical_item_id);
CREATE INDEX IF NOT EXISTS lexical_legacy_map_method_idx ON lexical_legacy_map (match_method);


-- =====================================================
-- 3. 權限
--
-- ⚠️ Supabase 的 ALTER DEFAULT PRIVILEGES 會把新表的 ALL 權限直接發給
--    anon / authenticated / service_role。不點名收回，這兩張表一建立就是全開。
--    （這是 PR #124 那次稽核的教訓。）
-- =====================================================

ALTER TABLE lexical_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lexical_legacy_map ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE lexical_items      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE lexical_legacy_map FROM PUBLIC, anon, authenticated;

-- 已登入者【只能讀】。寫入一律走 migration 或 admin 函式。
GRANT SELECT ON TABLE lexical_items      TO authenticated;
GRANT SELECT ON TABLE lexical_legacy_map TO authenticated;

-- 🛑 service_role 的 grant 保留：它繞過 RLS 但【不繞過 grant】，
--    收掉之後後端與排程就動不了這兩張表。

DROP POLICY IF EXISTS lexical_items_read ON lexical_items;
CREATE POLICY lexical_items_read ON lexical_items
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS lexical_legacy_map_read ON lexical_legacy_map;
CREATE POLICY lexical_legacy_map_read ON lexical_legacy_map
  FOR SELECT TO authenticated
  USING (true);

-- 寫入政策：只有 admin。
-- 用既有的 is_admin()，不自己重寫一套 email 比對。
DROP POLICY IF EXISTS lexical_items_admin_write ON lexical_items;
CREATE POLICY lexical_items_admin_write ON lexical_items
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS lexical_legacy_map_admin_write ON lexical_legacy_map;
CREATE POLICY lexical_legacy_map_admin_write ON lexical_legacy_map
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- 注意：admin 的 FOR ALL 政策要真的能寫，還需要 grant。
-- 這裡刻意【不給】INSERT/UPDATE/DELETE grant —— Phase 1 的寫入只發生在
-- migration（以 table owner 身分執行，繞過 grant 與 RLS）。
-- 之後要做後台編輯介面時，再開一支 SECURITY DEFINER 的 admin 函式，
-- 而不是把 DML grant 發給 authenticated。
