-- =====================================================
-- Rollback: create_writing_queue_rpcs.sql
--
-- 🔴 先在 gsat-staging 執行並確認，再在 production 執行。
--
-- 刪掉這些函式之後：批次排入與 worker 都不能用，既有的單篇「開始 AI 批改」
-- （writing_enqueue_analysis / writing_retry_synthesis）不受影響，
-- 已經排在佇列裡的 QUEUED 列也還在，只是沒有人會去推進它們。
-- =====================================================

DROP FUNCTION IF EXISTS writing_queue_summary();
DROP FUNCTION IF EXISTS writing_queue_begin_synthesis(UUID);
DROP FUNCTION IF EXISTS writing_queue_ensure_analysis(UUID);
DROP FUNCTION IF EXISTS writing_queue_release(UUID);
DROP FUNCTION IF EXISTS writing_queue_claim(TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS writing_enqueue_analysis_batch(UUID[], BOOLEAN);
