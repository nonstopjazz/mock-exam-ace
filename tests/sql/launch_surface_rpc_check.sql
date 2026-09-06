-- =====================================================
-- 上線前檢查（二）：未登入者呼叫得到哪些 RPC
--
-- ✅ 唯讀。可以直接貼進 staging / 正式環境的 SQL Editor。
--
-- 🛑 重點在 admin_get_all_users / admin_get_user_stats：
--    它們的守門寫成 `IF NOT is_admin()`，而 is_admin() 對未登入者回傳 NULL，
--    `NOT NULL` 不成立 —— 守門會被跳過。加上 Supabase 預設把 EXECUTE 授予
--    anon，未登入者就能拿到整份使用者名單（email / 姓名 / 年級 / 學校）。
--    這兩支在 "anon可執行" 欄位必須是 f。
--    admin_grant_premium / admin_revoke_premium 更嚴重：它們【完全沒有授權
--    分支】，未登入者可替任意帳號開通 premium、撤銷任意人的會員資格。
--    這四支在 "anon可執行" 欄位都必須是 f，"守門有防NULL" 都必須是 t。
--    修補：supabase/migrations/fix_admin_rpc_authorization.sql
-- =====================================================

SELECT
  p.proname                                                   AS "函式",
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END     AS "安全模式",
  EXISTS (SELECT 1 FROM information_schema.role_routine_grants g
           WHERE g.routine_schema = 'public'
             AND g.routine_name = p.proname
             AND g.grantee IN ('anon', 'PUBLIC'))             AS "anon可執行",
  (p.prosrc ~ 'coalesce\s*\(\s*(public\.)?is_admin')          AS "守門有防NULL",
  CASE
    WHEN p.proname LIKE 'learn\_student\_%' THEN 'ℹ️ 學生端：以 auth.uid() 過濾，不吃 student_id 參數'
    WHEN EXISTS (SELECT 1 FROM information_schema.role_routine_grants g
                  WHERE g.routine_schema='public' AND g.routine_name=p.proname
                    AND g.grantee IN ('anon','PUBLIC'))
     AND NOT (p.prosrc ~ 'coalesce\s*\(\s*(public\.)?is_admin')
     AND p.proname LIKE 'admin\_%'                            THEN '🔴 未登入可呼叫且守門不防 NULL'
    WHEN EXISTS (SELECT 1 FROM information_schema.role_routine_grants g
                  WHERE g.routine_schema='public' AND g.routine_name=p.proname
                    AND g.grantee IN ('anon','PUBLIC'))       THEN '⚠️ anon 可執行——請確認是刻意的'
    ELSE '✅ 未登入者呼叫不到'
  END                                                         AS "判讀"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE 'learn\_%'
    OR p.proname LIKE 'writing\_%'
    OR p.proname IN ('admin_get_all_users','admin_get_user_stats',
                     'admin_grant_premium','admin_revoke_premium',
                     'get_user_profile','upsert_user_profile','get_user_stats','is_admin'))
ORDER BY (p.proname LIKE 'admin\_%') DESC, p.proname;
