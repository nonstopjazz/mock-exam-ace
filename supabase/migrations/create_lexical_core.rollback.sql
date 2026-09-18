-- =====================================================
-- 回滾 create_lexical_core.sql
--
-- 🟢 只要在 production 執行一次。
--
-- ⚠️ 會刪掉 lexical_items 與 lexical_legacy_map 的【所有資料】。
--    這兩張表都是 Phase 1 新建的，裡面沒有任何 legacy 資料 ——
--    level_words / pack_items / user_word_progress / pack_item_progress
--    一列都不會被動到，重跑 migration 就能重建。
--
-- 🛑 依存順序：必須先回滾 relations / pack_items / progress / rpcs，
--    否則這裡的 DROP 會因為外鍵而失敗（這是刻意的保護，不要加 CASCADE）。
-- =====================================================

DROP POLICY IF EXISTS lexical_legacy_map_admin_write ON lexical_legacy_map;
DROP POLICY IF EXISTS lexical_legacy_map_read        ON lexical_legacy_map;
DROP POLICY IF EXISTS lexical_items_admin_write      ON lexical_items;
DROP POLICY IF EXISTS lexical_items_read             ON lexical_items;

DROP TRIGGER IF EXISTS trg_lexical_items_touch ON lexical_items;

DROP TABLE IF EXISTS lexical_legacy_map;
DROP TABLE IF EXISTS lexical_items;

DROP FUNCTION IF EXISTS lexical_touch_updated_at();
