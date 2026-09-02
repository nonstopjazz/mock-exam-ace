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
  email TEXT UNIQUE
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.uid', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce(current_setting('app.is_admin', true), 'false')::boolean;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public, auth TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
