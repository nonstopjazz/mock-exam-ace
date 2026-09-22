-- 回滾 create_writing_error_findings.sql
--
-- 🔴 這份會【刪掉整張表】。先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_writing_error_findings_sync.rollback.sql 之後執行
--    （函式相依於這張表）。
--
-- 🛑 但請先想清楚這份【不需要】被跑的理由：
--
--    writing_error_findings 是 writing_analyses.error_analysis 的【物化視圖】。
--    刪掉它不會遺失任何真相——真相一直在 error_analysis JSONB 裡，這份 rollback
--    也完全不碰那張表。要重建只要重跑 migration 加一次 backfill。
--
--    所以「資料不對」從來不是刪表的理由，DELETE 全表再 backfill 就好：
--      DELETE FROM writing_error_findings;
--      SELECT writing_backfill_error_findings(200);
--
--    真正該跑這份的情況只有一個：整個 Phase 1A 要撤掉。
--
-- ⚠️ 跑之前請先確認沒有任何 RPC 還在讀它（A4–A7 若已上線，要先撤掉那一批）。

DROP TABLE IF EXISTS writing_error_findings;

-- 驗證：應該回 0 列
SELECT c.relname AS "還存在的表"
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'writing_error_findings';
