-- 回滾 create_writing_error_query_rpcs.sql
--
-- 🟢 只要在 production 執行一次。不動任何一列資料。
--
-- 只移除五支查詢函式。writing_error_findings 表與裡面的 420 筆資料【完全不動】——
-- 那是第 1 批的東西，這一批只是讀它。
--
-- ⚠️ 跑這份之前確認沒有 UI 還在呼叫這四支 RPC（Phase 1A 的 UI 尚未實作，
--    所以 2026-09-21 當下沒有呼叫端）。

DROP FUNCTION IF EXISTS writing_admin_error_findings(UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER);
DROP FUNCTION IF EXISTS writing_admin_student_errors(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER);
DROP FUNCTION IF EXISTS writing_admin_error_students(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER);
DROP FUNCTION IF EXISTS writing_admin_error_overview(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER);
DROP FUNCTION IF EXISTS writing_error_scoped_findings(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[]);

-- 驗證：五支都應該消失（0 列）
SELECT p.proname AS "還存在的函式"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('writing_error_scoped_findings','writing_admin_error_overview',
                     'writing_admin_error_students','writing_admin_student_errors',
                     'writing_admin_error_findings');

-- findings 表應該還在，420 筆一筆不少
SELECT count(*)::int AS "findings 仍然在" FROM public.writing_error_findings;
