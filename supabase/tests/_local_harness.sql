-- =====================================================
-- 本機測試替身：模擬 Supabase 平台提供的部分
--
-- 只給本機臨時資料庫使用，絕對不要在正式環境執行。
-- 正式環境的 auth schema、auth.uid()、authenticated 角色由 Supabase 提供，
-- is_admin() 由 create_user_profiles_table.sql 建立。
--
-- 這裡把 auth.uid() 與 is_admin() 改成讀 GUC，方便在測試中切換身分。
-- =====================================================

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 與正式 Supabase 一致：優先讀 request.jwt.claims 的 sub。
-- 保留 app.uid 作為後備，讓既有測試不需要改寫。
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('app.uid', true), '')
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce(current_setting('app.is_admin', true), 'false')::boolean;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- storage.buckets 的替身，讓 preflight 腳本能在本機驗證
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (id TEXT PRIMARY KEY, public BOOLEAN DEFAULT false);

GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, anon;
