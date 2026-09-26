-- =====================================================
-- 回滾 create_reading_import_1_batches.sql —— 匯入批次紀錄
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- 🛑 回滾順序與建立相反：4 → 3 → 2 → 1。
--
-- ⚠️ 回滾【不會】刪掉已經匯入的題庫。reading_passages 等表不受影響——
--    這一批只是匯入的工具。要清題庫請用 create_reading_passages.rollback.sql。
-- =====================================================

DROP TABLE IF EXISTS reading_import_batches;

SELECT count(*)::int AS "剩下的 reading_import 物件"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'reading_import%';
