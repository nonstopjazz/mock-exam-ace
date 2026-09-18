-- =====================================================
-- 回滾 create_lexical_relations.sql
-- 🟢 只要在 production 執行一次。
--
-- ⚠️ 會刪掉所有 lexical_relations 與 unresolved 清單。
--    level_words.synonyms / antonyms 這兩個原始 text[] 欄位【完全沒有被動過】，
--    所以重跑 migrate_lexical_relations_from_arrays.sql 就能全部重建。
-- =====================================================

DROP POLICY IF EXISTS lexical_unresolved_admin_all   ON lexical_unresolved_relations;
DROP POLICY IF EXISTS lexical_relations_admin_write  ON lexical_relations;
DROP POLICY IF EXISTS lexical_relations_read         ON lexical_relations;

DROP TABLE IF EXISTS lexical_unresolved_relations;
DROP TABLE IF EXISTS lexical_relations;
