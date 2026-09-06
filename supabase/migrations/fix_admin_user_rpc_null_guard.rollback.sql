-- 回滾 fix_admin_user_rpc_null_guard.sql
--
-- ⚠️ 這會把「未登入即可取得完整使用者名單」的破口放回去。
--    除非確認是這份修補造成了其他問題，否則不要執行。
--
-- 只還原授權；函式本體的守門修正建議保留（它不會破壞任何既有呼叫端）。

GRANT EXECUTE ON FUNCTION admin_get_all_users(TEXT, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION admin_get_user_stats() TO anon;
