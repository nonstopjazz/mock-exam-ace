-- =====================================================
-- is_admin() bootstrap 測試（以正式環境定義為準）
--
-- ⚠️ psql 專用。需要一個「乾淨」的資料庫：只有 auth 替身，
--    沒有任何依賴 is_admin() 的政策（本測試會 DROP 它來重跑三種分支）。
--
-- 執行方式：
--   createdb iabootx
--   cd supabase/tests
--   psql -v ON_ERROR_STOP=1 -d iabootx -f _auth_stub.sql
--   psql -v ON_ERROR_STOP=1 -d iabootx -f mock_exam_is_admin_bootstrap_test.sql
-- =====================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION t_assert(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

DROP FUNCTION IF EXISTS public.is_admin();

\echo '--- 1 不存在 → 可以安全建立 ---'
\ir ../migrations/bootstrap_is_admin.sql
SELECT t_assert(to_regprocedure('public.is_admin()') IS NOT NULL,
  '1  缺少 is_admin() 的專案可以安全建立它');
SELECT t_assert((SELECT md5(regexp_replace(replace(prosrc, chr(13), ''), '[[:space:]]+', ' ', 'g'))
                 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND proname='is_admin')
                = 'b0dc3065d87e4196524357d2d080e276',
  '1b 建立出來的本體與正式環境逐字等價');
SELECT t_assert((SELECT array_to_string(proconfig,',') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND proname='is_admin') = 'search_path=public',
  '1c 建立時就帶著正式環境的 search_path=public（不需要第二份 migration）');

\echo '--- 2 已存在但不同 → 大聲中止，且不覆蓋 ---'
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER AS $$ SELECT true $$;

-- 真的把 migration 跑下去，預期它會 ERROR 並且什麼都不改
\set ON_ERROR_STOP off
\ir ../migrations/bootstrap_is_admin.sql
\set ON_ERROR_STOP on

SELECT t_assert((SELECT md5(regexp_replace(replace(prosrc, chr(13), ''), '[[:space:]]+', ' ', 'g'))
                 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND proname='is_admin')
                NOT IN ('b0dc3065d87e4196524357d2d080e276','4f2510c540d405db752d1a70d5b0cffb'),
  '2  存在衝突的 is_admin() 時 bootstrap 中止，且沒有覆蓋既有定義');

-- 復原成正確的定義再繼續
DROP FUNCTION public.is_admin();
\ir ../migrations/bootstrap_is_admin.sql

\echo '--- 2b repo 版（含註解行）也被接受，並補上 search_path ---'
DROP FUNCTION public.is_admin();
CREATE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_email TEXT;
BEGIN
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = auth.uid();

  -- 只有特定 email 是 admin
  RETURN v_user_email = 'nonstopjazz@gmail.com';
END;
$$;
\ir ../migrations/bootstrap_is_admin.sql
SELECT t_assert((SELECT array_to_string(proconfig,',') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND proname='is_admin') = 'search_path=public',
  '2b repo 版存在但缺 search_path 時，bootstrap 只補上 SET');
SELECT t_assert((SELECT md5(regexp_replace(replace(prosrc, chr(13), ''), '[[:space:]]+', ' ', 'g'))
                 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND proname='is_admin')
                = '4f2510c540d405db752d1a70d5b0cffb',
  '2c 補 SET 時本體一個字元都沒動');

-- 回到正式環境版繼續
DROP FUNCTION public.is_admin();
\ir ../migrations/bootstrap_is_admin.sql

\echo '--- 3-6 語意與執行環境 ---'
INSERT INTO auth.users (id, email) VALUES
  ('cccccccc-0000-0000-0000-00000000000a', 'nonstopjazz@gmail.com'),
  ('dddddddd-0000-0000-0000-00000000000b', 'student@test.local')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION t_as(p_uid text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SET LOCAL ROLE authenticated;
  IF p_uid IS NULL THEN
    PERFORM set_config('request.jwt.claims', '', true);
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  END IF;
  EXECUTE p_sql INTO v;
  RESET ROLE;
  RETURN v;
END $$;

SELECT t_assert(t_as('cccccccc-0000-0000-0000-00000000000a', 'SELECT is_admin()::text') = 'true',
  '3  授權的 admin 回 true');
SELECT t_assert(t_as('dddddddd-0000-0000-0000-00000000000b', 'SELECT is_admin()::text') = 'false',
  '4  一般使用者回 false');
SELECT t_assert(coalesce(t_as(NULL, 'SELECT coalesce(is_admin()::text, ''(null)'')'), '(null)') <> 'true',
  '4b 未登入不會回 true（實際是 NULL —— 呼叫端必須用 IS NOT TRUE 判斷）');
SELECT t_assert((SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND proname='is_admin'),
  '5  仍是 SECURITY DEFINER');
SELECT t_assert((SELECT array_to_string(proconfig, ',') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND proname='is_admin') = 'search_path=public',
  '6  search_path 與正式環境一致（public），沒有製造環境落差');
SELECT t_assert((SELECT md5(regexp_replace(replace(prosrc, chr(13), ''), '[[:space:]]+', ' ', 'g'))
                 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND proname='is_admin')
                = 'b0dc3065d87e4196524357d2d080e276',
  '6b 本體指紋＝正式環境（授權語意逐字相同）');

\echo '--- 7 其他功能對 is_admin() 的依賴，行為與正式環境一致 ---'
-- writing_submissions / writing_texts / premium_memberships 的 RLS 都是
-- USING (is_admin())。這裡用同樣形狀的替身表，驗證 search_path 硬化
-- 前後這類政策的判定結果完全一樣。
CREATE TABLE IF NOT EXISTS public.t_shared_consumer (id int primary key, secret text);
ALTER TABLE public.t_shared_consumer ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shared consumer admin only" ON public.t_shared_consumer;
CREATE POLICY "shared consumer admin only" ON public.t_shared_consumer
  FOR SELECT USING (is_admin());
GRANT SELECT ON public.t_shared_consumer TO authenticated;
INSERT INTO public.t_shared_consumer VALUES (1, 's') ON CONFLICT DO NOTHING;

SELECT t_assert(t_as('cccccccc-0000-0000-0000-00000000000a',
  'SELECT count(*)::text FROM public.t_shared_consumer') = '1',
  '7a admin 讀得到 USING (is_admin()) 保護的資料');
SELECT t_assert(t_as('dddddddd-0000-0000-0000-00000000000b',
  'SELECT count(*)::text FROM public.t_shared_consumer') = '0',
  '7b 一般使用者讀不到');
SELECT t_assert(coalesce(t_as(NULL,
  'SELECT count(*)::text FROM public.t_shared_consumer'), '0') = '0',
  '7c 未登入讀不到（is_admin() 回 NULL，RLS 視為 false）');

DROP TABLE public.t_shared_consumer;

\echo '=== is_admin bootstrap 測試全部通過 ==='
