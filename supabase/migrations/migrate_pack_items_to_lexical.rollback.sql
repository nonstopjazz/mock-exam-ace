-- =====================================================
-- 回滾 migrate_pack_items_to_lexical.sql
-- 🟢 只要在 production 執行一次。
--
-- ⚠️ pack_items 與 packs 完全不受影響 —— 單字包的內容仍然完整，
--    七個 practice 頁面照常運作（它們讀的是 pack_items，不是新表）。
--
-- 只刪：
--   1. 這支建立的 pack ↔ lexical 連結
--   2. 這支【新建】的 lexical_items（legacy_level_word_id IS NULL 那些）
--   3. pack_item 的對照列
--
-- 從 level_words 匯入的 canonical 項目不動（它們有 legacy_level_word_id）。
-- =====================================================

-- 先拆連結，再刪項目（避免 CASCADE 連帶刪到不該刪的）
DELETE FROM lexical_pack_items lpi
WHERE EXISTS (
  SELECT 1 FROM lexical_legacy_map m
  WHERE m.legacy_source = 'pack_item'
    AND m.lexical_item_id = lpi.lexical_item_id
);

DELETE FROM lexical_items i
WHERE i.legacy_level_word_id IS NULL
  AND EXISTS (
    SELECT 1 FROM lexical_legacy_map m
    WHERE m.legacy_source = 'pack_item'
      AND m.lexical_item_id = i.id
      AND m.match_method IN ('new_item_created', 'ambiguous_match')
  );

DELETE FROM lexical_legacy_map WHERE legacy_source = 'pack_item';
