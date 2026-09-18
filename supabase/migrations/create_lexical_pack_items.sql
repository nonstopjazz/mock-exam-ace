-- =====================================================
-- Lexical Model Phase 3：Pack 改成 collection model
--
-- 🟢 只要在 production 執行一次。前置：create_lexical_core.sql
--
-- 沿用既有的 packs 當 pack master —— 規格要求「若可以沿用 packs，優先沿用」。
-- 不另建重複的 pack 主表。
--
-- 現況：pack_items.pack_id 是 FK，一個單字只屬於一個 pack；
--       同一個 persist 出現在五個 pack 就是五列不同 uuid 的獨立字詞。
-- 之後：lexical_pack_items 是 many-to-many，同一個 canonical persist
--       可以同時掛在 GSAT Level 5、高二第二課、易混淆動詞、
--       Writing Vocabulary、Amy Week 3 底下。
--
-- pack_items 不刪、不改。
-- =====================================================


CREATE TABLE IF NOT EXISTS lexical_pack_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  pack_id                UUID NOT NULL REFERENCES packs(id)         ON DELETE CASCADE,
  lexical_item_id        UUID NOT NULL REFERENCES lexical_items(id) ON DELETE CASCADE,

  sort_order             INTEGER NOT NULL DEFAULT 0,

  -- 同一個 canonical 字詞在不同 pack 裡可以有不同的老師註記。
  -- 字詞本體（翻譯、例句）仍然只有一份，在 lexical_items。
  teacher_note           TEXT,
  pack_specific_metadata JSONB,

  created_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 同一個 pack 裡同一個 canonical 字詞只會出現一次
  UNIQUE (pack_id, lexical_item_id)
);

COMMENT ON TABLE lexical_pack_items IS
  'packs ↔ lexical_items 的 many-to-many。同一個 canonical 字詞可同時屬於多個 pack，但學生對它的熟練度只有一份（見 student_lexical_mastery）。取代 pack_items 的一對多歸屬，pack_items 本身保留不動。';
COMMENT ON COLUMN lexical_pack_items.pack_specific_metadata IS
  '這個 pack 專屬的附加資料（例如課本頁碼、週次）。字詞本體不放這裡。';

CREATE INDEX IF NOT EXISTS lexical_pack_items_pack_idx ON lexical_pack_items (pack_id, sort_order);
CREATE INDEX IF NOT EXISTS lexical_pack_items_item_idx ON lexical_pack_items (lexical_item_id);

DROP TRIGGER IF EXISTS trg_lexical_pack_items_touch ON lexical_pack_items;
CREATE TRIGGER trg_lexical_pack_items_touch
  BEFORE UPDATE ON lexical_pack_items
  FOR EACH ROW EXECUTE FUNCTION lexical_touch_updated_at();


-- =====================================================
-- 權限
--
-- 可見性跟 pack_items 現行政策對齊：看得到 pack 就看得到它的內容。
-- 這樣「學生只能看到自己領取的 pack」這個既有保證不會因為新表而破功。
-- =====================================================

ALTER TABLE lexical_pack_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE lexical_pack_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE lexical_pack_items TO authenticated;

DROP POLICY IF EXISTS lexical_pack_items_read ON lexical_pack_items;
CREATE POLICY lexical_pack_items_read ON lexical_pack_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM packs p
      WHERE p.id = lexical_pack_items.pack_id
        AND (
          p.is_public = true
          OR p.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM user_pack_claims c
            WHERE c.pack_id = p.id AND c.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS lexical_pack_items_owner_write ON lexical_pack_items;
CREATE POLICY lexical_pack_items_owner_write ON lexical_pack_items
  FOR ALL TO authenticated
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM packs p WHERE p.id = lexical_pack_items.pack_id AND p.created_by = auth.uid())
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (SELECT 1 FROM packs p WHERE p.id = lexical_pack_items.pack_id AND p.created_by = auth.uid())
  );

-- 與 lexical_items 一樣：Phase 1 不發 DML grant，寫入只發生在 migration。
-- 後台編輯介面之後走 SECURITY DEFINER 函式。
