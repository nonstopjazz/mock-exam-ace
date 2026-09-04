-- =====================================================
-- 回滾：bootstrap_is_admin.sql
--
-- ⚠️ 只有在「本檔建立了 is_admin()」的專案上才適用（例如 staging）。
--    正式環境的 is_admin() 由 create_user_profiles_table.sql 建立，
--    而且被 writing、premium、Edge Function 共用——
--    在那裡執行本檔會一次打壞多個功能。
--
-- 守衛：如果有任何 RLS 政策仍在使用 is_admin()，就中止。
-- =====================================================

DO $guard$
DECLARE v_users text;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname)
    INTO v_users
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (coalesce(qual, '') LIKE '%is_admin()%' OR coalesce(with_check, '') LIKE '%is_admin()%');

  IF v_users IS NOT NULL THEN
    RAISE EXCEPTION '中止：仍有 RLS 政策依賴 is_admin() → %。'
      '請先回滾那些政策（例如 harden_mock_exam_content_permissions.rollback.sql）。', v_users;
  END IF;
END $guard$;

DROP FUNCTION IF EXISTS public.is_admin();

DO $verify$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NOT NULL THEN
    RAISE EXCEPTION '回滾未完成：public.is_admin() 仍然存在。';
  END IF;
END $verify$;
