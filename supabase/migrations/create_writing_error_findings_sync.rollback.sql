-- 回滾 create_writing_error_findings_sync.sql
--
-- 🟢 只要在 production 執行一次。不動任何一列資料。
--
-- 只移除三支函式。writing_error_findings 表與裡面的資料【不動】——
-- 那是 create_writing_error_findings.rollback.sql 的事，而且應該在這之後才跑。
--
-- ⚠️ 跑這份之前請先確認 api/analyze-writing.ts 已經【不再】呼叫
--    writing_sync_error_findings()，否則每次分析完成都會在 log 裡留下
--    「function does not exist」。那不會讓分析失敗（呼叫端只記 log），
--    但會持續污染 log 並讓 findings 停止更新。

DROP FUNCTION IF EXISTS writing_backfill_error_findings(INTEGER, UUID);
DROP FUNCTION IF EXISTS writing_sync_error_findings(UUID);
DROP FUNCTION IF EXISTS writing_sync_error_findings_for_essay(UUID);

-- 驗證：三支都應該消失（0 列）
SELECT p.proname AS "還存在的函式"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('writing_sync_error_findings',
                     'writing_sync_error_findings_for_essay',
                     'writing_backfill_error_findings');
