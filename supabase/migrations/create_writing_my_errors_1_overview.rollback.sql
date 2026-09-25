-- =====================================================
-- 回滾 create_writing_my_errors_1_overview.sql
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- 只移除函式。writing_error_findings 表與裡面的資料【完全不動】——
-- 這支只是讀它。
--
-- ⚠️ 跑這份之前確認沒有 UI 還在呼叫它（學生端的「我常犯的錯」）。
-- =====================================================

DROP FUNCTION IF EXISTS writing_my_error_overview(INTEGER);

-- 驗證：應該回 0 列
SELECT p.proname AS "還存在的函式"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'writing_my_error_overview';
