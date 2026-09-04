-- =====================================================
-- BOOTSTRAP：讓專案的 public.is_admin() 與正式環境一致
--
-- Source of truth：ytzspnjmkvrkbztnaomm（2026-09 直接稽核）
--
--   CREATE OR REPLACE FUNCTION public.is_admin()
--   RETURNS boolean
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_user_email TEXT;
--   BEGIN
--     SELECT email INTO v_user_email
--     FROM auth.users
--     WHERE id = auth.uid();
--
--     RETURN v_user_email = 'nonstopjazz@gmail.com';
--   END;
--   $function$;
--
--   proconfig = search_path=public ／ owner = postgres
--   EXECUTE = PUBLIC, postgres, anon, authenticated, service_role（平台預設）
--
-- ⚠️ 正式環境「已經」鎖好 search_path，所以本專案不再有獨立的
--    search_path 硬化 migration。詳見報告：把它改成 '' 只會製造
--    環境落差，換不到實質的安全提升——函式本體的每個名稱都已經
--    schema 限定，search_path 對它的解析結果沒有影響。
--
-- ⚠️ 正式環境的本體與 repo 的 create_user_profiles_table.sql 差「一行註解」：
--      repo 有   -- 只有特定 email 是 admin
--      正式沒有
--    授權語意完全相同。兩種本體的指紋都被接受，見下方常數。
--
-- ⚠️ 這個函式被 writing_submissions / writing_texts / premium_memberships 的
--    RLS、essayAuth Edge Function、generate-pack-audio、useUserProfile 共用。
--    它不是 mock 專屬的東西。
--
-- ⚠️ 刻意不使用無條件的 CREATE OR REPLACE —— 那會連 SET 子句一起取代。
--    分四種情況：
--      · 不存在                        → 建立（含 SET search_path TO 'public'）
--      · 存在、本體已知、search_path 相符 → 什麼都不做
--      · 存在、本體已知、search_path 缺少 → 只補 SET，不碰本體
--      · 存在、本體未知                → 大聲中止
--
-- 執行順序：本檔 → create_mock_content_admin_read_rpc.sql
--                → harden_mock_exam_content_permissions.sql
-- =====================================================

DO $boot$
DECLARE
  -- 正規化指紋 = md5(移除 CR、連續空白收斂為一個空格 的本體)
  -- 正式環境的函式是貼進 SQL Editor 建立的，本體可能含 CRLF，
  -- 直接比 md5(prosrc) 會因為換行編碼而誤判。
  k_prod constant text := 'b0dc3065d87e4196524357d2d080e276';  -- 正式環境（無註解行）
  k_repo constant text := '4f2510c540d405db752d1a70d5b0cffb';  -- create_user_profiles_table.sql（含註解行）
  v_norm    text;
  v_secdef  boolean;
  v_config  text;
BEGIN
  SELECT md5(regexp_replace(replace(p.prosrc, chr(13), ''), '[[:space:]]+', ' ', 'g')),
         p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), '(null)')
    INTO v_norm, v_secdef, v_config
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_admin'
    AND pg_get_function_identity_arguments(p.oid) = '';

  ------------------------------------------------------------------
  -- 情況 1：不存在 → 建立正式環境等價定義
  ------------------------------------------------------------------
  IF v_norm IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.is_admin()
      RETURNS boolean
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO 'public'
      AS $body$
      DECLARE
        v_user_email TEXT;
      BEGIN
        SELECT email INTO v_user_email
        FROM auth.users
        WHERE id = auth.uid();

        RETURN v_user_email = 'nonstopjazz@gmail.com';
      END;
      $body$;
    $fn$;
    RAISE NOTICE 'public.is_admin() 已建立，與正式環境等價（含 SET search_path TO ''public''）。';

  ------------------------------------------------------------------
  -- 情況 4：存在但本體不是已知的兩種之一 → 絕不覆蓋
  ------------------------------------------------------------------
  ELSIF v_norm NOT IN (k_prod, k_repo) THEN
    RAISE EXCEPTION '中止：public.is_admin() 已存在，但本體不是已知的定義'
      '（實得 %，已知：正式環境 % ／ repo %）。'
      '這個函式被 writing、premium、Edge Function 等多個功能共用，'
      '請先確認它是什麼、屬於誰。本檔不會覆蓋既有定義。',
      v_norm, k_prod, k_repo;

  ELSE
    ----------------------------------------------------------------
    -- 情況 2／3：本體已知。只在 search_path 缺少時補上。
    ----------------------------------------------------------------
    IF NOT v_secdef THEN
      RAISE EXCEPTION '中止：既有的 public.is_admin() 本體相符，但不是 SECURITY DEFINER。';
    END IF;

    IF v_config = 'search_path=public' THEN
      RAISE NOTICE 'public.is_admin() 已存在且與正式環境一致（本體 %），本檔不做任何變更。',
        CASE WHEN v_norm = k_prod THEN '＝正式環境版' ELSE '＝repo 版，授權語意相同' END;

    ELSIF v_config = '(null)' THEN
      -- 只補 SET 子句，本體一個字元都不動（ALTER FUNCTION，不是 CREATE OR REPLACE）。
      -- 這是「往正式環境收斂」，不是製造新的落差。
      ALTER FUNCTION public.is_admin() SET search_path TO 'public';
      RAISE NOTICE 'public.is_admin() 已存在但缺少 search_path，已補上 ''public'' 以與正式環境一致。';

    ELSE
      RAISE EXCEPTION '中止：public.is_admin() 的 proconfig 是 %，'
        '與正式環境的 search_path=public 不同。請先確認為什麼。', v_config;
    END IF;
  END IF;
END $boot$;


-- ── 套用後驗證：本體、SECURITY DEFINER、search_path、前端可呼叫 ──
DO $verify$
DECLARE
  v_norm text; v_secdef boolean; v_config text; v_exec_auth boolean; v_email boolean;
BEGIN
  SELECT md5(regexp_replace(replace(p.prosrc, chr(13), ''), '[[:space:]]+', ' ', 'g')),
         p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), '(null)'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE'),
         p.prosrc LIKE '%nonstopjazz@gmail.com%'
    INTO v_norm, v_secdef, v_config, v_exec_auth, v_email
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_admin';

  IF v_norm NOT IN ('b0dc3065d87e4196524357d2d080e276', '4f2510c540d405db752d1a70d5b0cffb') THEN
    RAISE EXCEPTION '驗證失敗：is_admin() 本體指紋 % 不是已知定義。', v_norm;
  END IF;
  IF NOT v_secdef THEN
    RAISE EXCEPTION '驗證失敗：is_admin() 不是 SECURITY DEFINER。';
  END IF;
  IF v_config <> 'search_path=public' THEN
    RAISE EXCEPTION '驗證失敗：search_path 應為 public，實得 %。', v_config;
  END IF;
  IF NOT v_email THEN
    RAISE EXCEPTION '驗證失敗：找不到預期的管理員 email，授權語意可能已被改動。';
  END IF;
  IF NOT v_exec_auth THEN
    RAISE EXCEPTION '驗證失敗：authenticated 無法 EXECUTE is_admin()，'
      '前端的 supabase.rpc(''is_admin'') 會失敗。';
  END IF;
END $verify$;
