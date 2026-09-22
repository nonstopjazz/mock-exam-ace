-- =====================================================
-- 回滾 create_lexical_pack_items.sql
-- 🟢 只要在 production 執行一次。
--
-- ⚠️ 只刪 lexical_pack_items。packs 與 pack_items 完全不受影響 ——
--    pack 的內容仍然完整地在 pack_items 裡，七個 practice 頁面照常運作。
-- =====================================================

DROP POLICY IF EXISTS lexical_pack_items_owner_write ON lexical_pack_items;
DROP POLICY IF EXISTS lexical_pack_items_read        ON lexical_pack_items;
DROP TRIGGER IF EXISTS trg_lexical_pack_items_touch  ON lexical_pack_items;
DROP TABLE IF EXISTS lexical_pack_items;
