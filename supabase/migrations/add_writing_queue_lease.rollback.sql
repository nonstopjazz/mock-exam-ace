-- =====================================================
-- Rollback: add_writing_queue_lease.sql
--
-- 🔴 先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_writing_queue_rpcs.rollback.sql 之後執行——那些函式讀這些欄位。
--
-- 刪掉欄位會連同裡面的租約與批次紀錄一起消失。分析結果本身（三軸、綜合層、
-- 狀態）完全不受影響：那些都在別的欄位裡。
-- =====================================================

DROP INDEX IF EXISTS idx_writing_analyses_batch;
DROP INDEX IF EXISTS idx_writing_analyses_claimable;

ALTER TABLE writing_analyses
  DROP CONSTRAINT IF EXISTS writing_analyses_queue_attempts_sane;

ALTER TABLE writing_analyses
  DROP COLUMN IF EXISTS queue_attempts,
  DROP COLUMN IF EXISTS queue_batch_id,
  DROP COLUMN IF EXISTS lease_worker_id,
  DROP COLUMN IF EXISTS lease_expires_at;
