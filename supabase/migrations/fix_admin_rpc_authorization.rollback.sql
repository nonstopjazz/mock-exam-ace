-- 回滾 fix_admin_rpc_authorization.sql
--
-- 🛑 這會把「未登入即可讀取完整使用者名單、並自行開通／撤銷 premium」的破口
--    整個放回去。除非確認是這份修補造成了其他問題，否則不要執行。
--
-- 這裡只還原【授權】，不還原函式本體的守門修正 ——
-- 守門修正不會破壞任何既有的合法呼叫端（管理員與 service_role 都不受影響），
-- 沒有理由把它拿掉。
--
-- 若真的需要完整還原函式本體，重跑：
--   supabase/migrations/create_user_profiles_table.sql   （A1 / A2 的原始定義）
--   supabase/migrations/add_premium_memberships.sql      （B1 / B2 的原始定義）
-- ⚠️ 但那兩份會連同破口一起還原。

GRANT EXECUTE ON FUNCTION admin_get_all_users(TEXT, TEXT, INTEGER, INTEGER)
  TO anon, service_role;
GRANT EXECUTE ON FUNCTION admin_get_user_stats() TO anon, service_role;
GRANT EXECUTE ON FUNCTION admin_grant_premium(uuid, timestamp with time zone, text)
  TO anon, service_role;
GRANT EXECUTE ON FUNCTION admin_revoke_premium(uuid) TO anon, service_role;
