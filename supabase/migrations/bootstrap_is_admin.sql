-- =====================================================
-- BOOTSTRAP：在缺少 public.is_admin() 的專案上建立它
--
-- 背景：staging cwymrzcovgobfqxtithn 沒有 is_admin()。
--       正式環境 ytzspnjmkvrkbztnaomm 有，它由
--       supabase/migrations/create_user_profiles_table.sql 建立。
--       但那份 migration 還會建立 user_profiles 整套 schema 與一堆 admin 函式，
--       完全不在本次範圍內。這裡只取其中的 is_admin() 一個函式。
--
-- ⚠️ 不引進教師角色、不建立角色表、不改「誰算 admin」。
--    v1 的 staging 必須與正式環境有「完全相同」的授權語意。
--
-- ⚠️ 刻意不使用無條件的 CREATE OR REPLACE。
--    CREATE OR REPLACE 會連同函式的 SET 子句一起取代——如果目標專案的
--    is_admin() 已經套過 harden_is_admin_search_path.sql，
--    一個沒有 SET 子句的 CREATE OR REPLACE 會安靜地把 search_path 拆掉。
--    所以這裡分三種情況處理：
--      · 不存在              → 建立
--      · 存在且指紋相符      → 什麼都不做（含已硬化的情況）
--      · 存在但指紋不符      → 大聲中止
--
-- 執行順序：本檔 → harden_is_admin_search_path.sql
--           → create_mock_content_admin_read_rpc.sql
--           → harden_mock_exam_content_permissions.sql
-- =====================================================

DO $boot$
DECLARE
  k_expected_norm constant text := '4f2510c540d405db752d1a70d5b0cffb';
  v_norm    text;
  v_secdef  boolean;
BEGIN
  SELECT md5(regexp_replace(replace(p.prosrc, chr(13), ''), '[[:space:]]+', ' ', 'g')),
         p.prosecdef
    INTO v_norm, v_secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_admin'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF v_norm IS NULL THEN
    -- 情況 1：不存在。逐字建立正式環境的定義。
    -- 這裡「沒有」SET search_path —— 那是下一份 migration 的事，
    -- 目的是讓 staging 先精確重現正式環境的硬化前狀態，
    -- 兩個環境才能套用同一份硬化 migration 並得到同一個指紋。
    EXECUTE $fn$
      CREATE FUNCTION public.is_admin()
      RETURNS BOOLEAN
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $body$
      DECLARE
        v_user_email TEXT;
      BEGIN
        SELECT email INTO v_user_email
        FROM auth.users
        WHERE id = auth.uid();

        -- 只有特定 email 是 admin
        RETURN v_user_email = 'nonstopjazz@gmail.com';
      END;
      $body$;
    $fn$;
    RAISE NOTICE 'public.is_admin() 已建立（正式環境等價定義，尚未鎖 search_path）。';

  ELSIF v_norm = k_expected_norm THEN
    -- 情況 2：已存在且相同。不動它。
    IF NOT v_secdef THEN
      RAISE EXCEPTION '中止：既有的 public.is_admin() 本體相符，但不是 SECURITY DEFINER。';
    END IF;
    RAISE NOTICE 'public.is_admin() 已存在且與正式環境相符，本檔不做任何變更。';

  ELSE
    -- 情況 3：存在但不一樣。絕不覆蓋。
    RAISE EXCEPTION '中止：public.is_admin() 已存在，但本體與正式環境不符'
      '（實得 %，預期 %）。這個函式被 writing、premium、Edge Function 等多個功能共用，'
      '請先確認它是什麼、屬於誰，再決定要不要動它。本檔不會覆蓋既有定義。',
      v_norm, k_expected_norm;
  END IF;
END $boot$;


-- ── 建立後驗證：本體、SECURITY DEFINER、可被前端 rpc 呼叫 ──
DO $verify$
DECLARE
  v_norm text; v_secdef boolean; v_execute_ok boolean;
BEGIN
  SELECT md5(regexp_replace(replace(p.prosrc, chr(13), ''), '[[:space:]]+', ' ', 'g')),
         p.prosecdef,
         has_function_privilege('authenticated', p.oid, 'EXECUTE')
    INTO v_norm, v_secdef, v_execute_ok
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_admin';

  IF v_norm <> '4f2510c540d405db752d1a70d5b0cffb' THEN
    RAISE EXCEPTION '驗證失敗：is_admin() 本體指紋 %。', v_norm;
  END IF;
  IF NOT v_secdef THEN
    RAISE EXCEPTION '驗證失敗：is_admin() 不是 SECURITY DEFINER。';
  END IF;
  IF NOT v_execute_ok THEN
    RAISE EXCEPTION '驗證失敗：authenticated 無法 EXECUTE is_admin()，'
      '前端的 supabase.rpc(''is_admin'') 會失敗。';
  END IF;
END $verify$;
