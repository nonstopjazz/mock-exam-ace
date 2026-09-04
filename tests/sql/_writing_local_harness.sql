-- =====================================================
-- 本機測試用的 Supabase 環境替身（只在本機 PostgreSQL 16 使用，絕不套用到任何 Supabase 專案）
--
-- 提供 migration 依賴、但本機沒有的東西：
--   • anon / authenticated / service_role 三個角色
--   • auth schema、auth.users、auth.uid()
--   • public.is_admin()
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT
);

-- 測試時用 set_config('request.jwt.claim.sub', ...) 切換身分
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- 正式環境 is_admin() 對未登入者回傳 NULL（不是 false）。這裡刻意重現同樣的語意，
-- 否則本機測不出 coalesce(is_admin(), false) IS NOT TRUE 這個防護是否真的需要。
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT nullif(current_setting('test.is_admin', true), '')::boolean;
$$;

GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
