-- =====================================================
-- 回滾 migrate_lexical_relations_from_arrays.sql
-- 🟢 只要在 production 執行一次。
--
-- ⚠️ level_words.synonyms / antonyms 兩個原始 text[] 欄位【從未被動過】，
--    所以刪掉之後重跑這支 migration 可以完全重建，沒有資料遺失風險。
--
-- 只刪這支匯入的關係（note 以固定前綴標記），人工後來手動建立的關係不動。
-- =====================================================

DELETE FROM lexical_relations
WHERE relation_type IN ('synonym','antonym')
  AND note LIKE '由 level_words.%s 匯入：%';

DELETE FROM lexical_unresolved_relations
WHERE relation_type IN ('synonym','antonym');
