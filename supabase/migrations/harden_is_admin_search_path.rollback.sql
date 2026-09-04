-- =====================================================
-- 回滾：harden_is_admin_search_path.sql
--
-- 把 public.is_admin() 的 search_path 設定移除，回到硬化前的狀態
-- （SECURITY DEFINER、proconfig 為 NULL）。函式本體從未被更動，
-- 所以這裡也不需要重建它。
--
-- ⚠️ 回滾等於把 SECURITY DEFINER 函式重新暴露在 search_path 攻擊下。
--    只有在確定要回到硬化前狀態時才執行。
-- =====================================================

ALTER FUNCTION public.is_admin() RESET search_path;

COMMENT ON FUNCTION public.is_admin() IS NULL;

DO $verify$
DECLARE v_config text;
BEGIN
  SELECT coalesce(array_to_string(p.proconfig, ','), '(null)') INTO v_config
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_admin';

  IF v_config <> '(null)' THEN
    RAISE EXCEPTION '回滾未完成：proconfig 仍為 %。', v_config;
  END IF;
END $verify$;
