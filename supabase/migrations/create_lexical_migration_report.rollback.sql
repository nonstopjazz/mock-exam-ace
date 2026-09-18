-- =====================================================
-- 回滾 create_lexical_migration_report.sql
-- 🟢 只要在 production 執行一次。只刪視圖，不動任何資料。
-- =====================================================

DROP VIEW IF EXISTS lexical_progress_coexistence;
DROP VIEW IF EXISTS lexical_unresolved_relations_report;
DROP VIEW IF EXISTS lexical_duplicate_candidates;
DROP VIEW IF EXISTS lexical_migration_needs_review;
DROP VIEW IF EXISTS lexical_migration_report;
