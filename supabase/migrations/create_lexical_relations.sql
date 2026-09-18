-- =====================================================
-- Lexical Model Phase 2：語彙關係
--
-- 🟢 只要在 production 執行一次。前置：create_lexical_core.sql
--
-- 關係一律用 lexical_items 的 FK，【不存純文字】。
-- 現況 level_words.synonyms/antonyms 是 text[]，那些字串指不到任何東西 ——
-- 系統不知道 insist 的 synonyms 裡那個 "persist" 就是 id='2936' 那一列。
-- 這張表要解決的就是這件事。
--
-- 要能表達的例子：
--   persist      --phrase_of-->    persist in
--   persist in   --synonym-->      insist on
--   persist      --confusable-->   resist
--   persist      --word_family-->  persistence
-- =====================================================


CREATE TABLE IF NOT EXISTS lexical_relations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source_item_id UUID NOT NULL REFERENCES lexical_items(id) ON DELETE CASCADE,
  target_item_id UUID NOT NULL REFERENCES lexical_items(id) ON DELETE CASCADE,

  relation_type  TEXT NOT NULL
                 CHECK (relation_type IN (
                   'synonym',      -- 同義
                   'antonym',      -- 反義
                   'word_family',  -- 同字族（persist / persistence / persistent）
                   'confusable',   -- 易混淆（persist / resist）
                   'phrase_of',    -- source 是 target 的組成字（persist → persist in）
                   'pattern_of',   -- source 是 target 這個句型的核心字
                   'related'       -- 其他語意相關
                 )),

  note           TEXT,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 自己不能指自己
  CONSTRAINT lexical_relations_no_self CHECK (source_item_id <> target_item_id),

  -- 同一組關係不重複。方向性刻意保留：
  -- phrase_of / pattern_of 是有方向的，synonym / antonym 實務上會寫成兩列。
  UNIQUE (source_item_id, target_item_id, relation_type)
);

COMMENT ON TABLE lexical_relations IS
  '語彙之間的關係，兩端都是 lexical_items 的 FK。取代 level_words.synonyms/antonyms 那種純文字陣列。';
COMMENT ON COLUMN lexical_relations.relation_type IS
  'phrase_of 與 pattern_of 有方向（source 是 target 的組成／核心）；synonym、antonym、confusable、word_family、related 在語意上對稱，但仍以兩列表示，查詢時不必 OR 兩個方向。';

CREATE INDEX IF NOT EXISTS lexical_relations_source_idx ON lexical_relations (source_item_id, relation_type);
CREATE INDEX IF NOT EXISTS lexical_relations_target_idx ON lexical_relations (target_item_id, relation_type);


-- =====================================================
-- lexical_unresolved_relations：Phase 8 匯入時無法安全判定的關係
--
-- 規格明講「找不到或有 ambiguity → 不要猜」。
-- 猜錯的同義詞會直接變成出錯的考題，所以寧可留在這裡等人工處理。
-- =====================================================

CREATE TABLE IF NOT EXISTS lexical_unresolved_relations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source_item_id  UUID NOT NULL REFERENCES lexical_items(id) ON DELETE CASCADE,
  raw_target      TEXT NOT NULL,              -- 原本 text[] 裡那個字串，原樣保留
  relation_type   TEXT NOT NULL CHECK (relation_type IN ('synonym','antonym')),

  reason          TEXT NOT NULL CHECK (reason IN ('no_match','ambiguous_match')),
  candidate_count INTEGER NOT NULL DEFAULT 0,

  resolved_at     TIMESTAMPTZ,                -- 人工處理完之後填，不刪列（保留稽核軌跡）
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (source_item_id, raw_target, relation_type)
);

COMMENT ON TABLE lexical_unresolved_relations IS
  'Phase 8 匯入 level_words.synonyms/antonyms 時，字串無法唯一對應到 lexical_items 的項目。no_match = 題庫裡沒有這個字；ambiguous_match = 有多個候選。處理完填 resolved_at，不要刪列。';

CREATE INDEX IF NOT EXISTS lexical_unresolved_open_idx
  ON lexical_unresolved_relations (reason, relation_type) WHERE resolved_at IS NULL;


-- =====================================================
-- 權限
-- =====================================================

ALTER TABLE lexical_relations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE lexical_unresolved_relations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE lexical_relations            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE lexical_unresolved_relations FROM PUBLIC, anon, authenticated;

-- 關係是教學內容，已登入者可讀（同義／反義練習要用）。
GRANT SELECT ON TABLE lexical_relations TO authenticated;

-- unresolved 是內部待辦清單，學生沒有理由看到 → 不給 grant，只有 admin 走函式或後台。
-- （service_role 的 grant 保留，後端／排程要得到。）

DROP POLICY IF EXISTS lexical_relations_read ON lexical_relations;
CREATE POLICY lexical_relations_read ON lexical_relations
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS lexical_relations_admin_write ON lexical_relations;
CREATE POLICY lexical_relations_admin_write ON lexical_relations
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS lexical_unresolved_admin_all ON lexical_unresolved_relations;
CREATE POLICY lexical_unresolved_admin_all ON lexical_unresolved_relations
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
