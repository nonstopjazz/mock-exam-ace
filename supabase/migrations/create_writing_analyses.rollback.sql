-- =====================================================
-- Rollback: create_writing_analyses.sql
--
-- 只移除這份 migration 建立的物件。writing_submissions、writing_texts、
-- public.is_admin() 以及任何 iLearn 物件都不動。
--
-- ⚠️ DROP TABLE 會連同所有已完成的分析結果一起刪除，且無法復原。
--    正式環境執行前請先確認已備份，或先跑：
--      SELECT count(*) FROM writing_analyses WHERE status = 'COMPLETED';
-- =====================================================

DROP FUNCTION IF EXISTS writing_enqueue_analysis(UUID);
DROP FUNCTION IF EXISTS writing_admin_analysis(UUID);
DROP FUNCTION IF EXISTS writing_admin_queue();
DROP FUNCTION IF EXISTS writing_student_analysis(UUID);

DROP TRIGGER IF EXISTS writing_analyses_guard_immutable_trigger ON writing_analyses;
DROP FUNCTION IF EXISTS writing_analyses_guard_immutable();

DROP POLICY IF EXISTS "Writing: service role manages analyses" ON writing_analyses;

DROP INDEX IF EXISTS idx_writing_analyses_pending;
DROP INDEX IF EXISTS idx_writing_analyses_latest;
DROP INDEX IF EXISTS writing_analyses_one_active_per_essay;

DROP TABLE IF EXISTS writing_analyses;
