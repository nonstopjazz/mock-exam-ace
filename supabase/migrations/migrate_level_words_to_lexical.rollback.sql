-- =====================================================
-- 回滾 migrate_level_words_to_lexical.sql
-- 🟢 只要在 production 執行一次。
--
-- ⚠️ 只刪這支 migration 建立的列（靠 legacy_level_word_id 認）。
--    level_words 一列都不會被動到 —— 原始題庫仍然完整，重跑就能重建。
--
-- 🛑 會連帶刪掉指向這些項目的 lexical_relations / lexical_pack_items /
--    student_lexical_mastery / lexical_attempts（外鍵 ON DELETE CASCADE）。
--    lexical_attempts 是無法從別處重建的原生資料，回滾前請先確認是否需要備份。
-- =====================================================

DELETE FROM lexical_legacy_map WHERE legacy_source = 'level_word';
DELETE FROM lexical_items      WHERE legacy_level_word_id IS NOT NULL;
