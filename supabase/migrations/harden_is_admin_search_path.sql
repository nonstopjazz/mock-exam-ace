-- =====================================================
-- 硬化 public.is_admin() 的執行環境 —— 只改 search_path，不改語意
--
-- ⚠️ 這是「共用基礎設施」，不是 mock 專屬的函式。目前依賴它的有：
--      · writing_submissions / writing_texts 的 RLS 政策
--      · premium_memberships 的 admin RLS 政策
--      · Edge Function supabase/functions/_shared/essayAuth.ts
--      · api/generate-pack-audio.ts
--      · src/hooks/useUserProfile.ts 的 supabase.rpc('is_admin')
--    所以獨立成一份最小範圍的 migration，不與內容權限硬化混在一起。
--
-- 問題：create_user_profiles_table.sql 建立它時是 SECURITY DEFINER
--       但沒有 SET search_path。SECURITY DEFINER 函式若不鎖 search_path，
--       呼叫端可以先把自己的 schema 放到最前面，讓函式內的未限定名稱
--       解析到攻擊者控制的物件上。
--
-- 本檔只做一件事：加上 SET search_path。
--   · 不改 SECURITY DEFINER
--   · 不改函式本體一個字元
--   · 不改「誰算 admin」
--   · 不引進教師角色
--
-- 為什麼是 search_path = '' 而不是 'public, auth'：
--   函式本體裡的每一個名稱都已經是 schema 限定的（auth.users、auth.uid()），
--   型別與運算子來自 pg_catalog（永遠隱含可見），所以空路徑是「本體實際需要的
--   最小安全路徑」。它同時讓日後有人加入未限定名稱時「大聲失敗」，
--   而不是安靜地解析到別的 schema。實測：admin → true、student → false，行為不變。
--
-- 執行順序：本檔必須在 harden_mock_exam_content_permissions.sql 「之前」執行，
--           因為後者的 admin 政策以 is_admin() 為授權邊界。
-- =====================================================

-- ─────────────────────────────────────────────
-- 0. 指紋守衛 —— 確認我們要改的是「預期中的那個函式」
--
-- 這裡不做 CREATE OR REPLACE，只做 ALTER FUNCTION ... SET，
-- 所以本體一定不會被換掉。守衛的用途是：如果正式環境的 is_admin()
-- 已經與 repo 不同（有人改過、或這裡其實是測試替身），就大聲中止，
-- 讓人先去確認，而不是在不知情的狀況下把 search_path 鎖在一個
-- 我們沒讀過的函式上。
--
-- 比對用的是「正規化」指紋：移除 CR、把連續空白收斂成一個空格。
-- 正式環境的函式是貼進 SQL Editor 建立的，本體含 CRLF；
-- 直接比 md5(prosrc) 會因為換行編碼而誤判。
-- ─────────────────────────────────────────────
DO $guard$
DECLARE
  k_expected_norm constant text := '4f2510c540d405db752d1a70d5b0cffb';
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

  IF v_norm IS NULL THEN
    RAISE EXCEPTION '中止：找不到 public.is_admin()。請先套用 create_user_profiles_table.sql。';
  END IF;

  IF v_norm <> k_expected_norm THEN
    RAISE EXCEPTION '中止：public.is_admin() 的本體與預期不符（實得 %，預期 %）。'
      '這個函式被多個功能共用，請先確認它現在是什麼、屬於誰，再決定要不要鎖 search_path。',
      v_norm, k_expected_norm;
  END IF;

  IF NOT v_secdef THEN
    RAISE EXCEPTION '中止：public.is_admin() 不是 SECURITY DEFINER，與稽核結果不符。';
  END IF;

  IF v_config <> '(null)' THEN
    RAISE EXCEPTION '中止：public.is_admin() 已經設定過 proconfig（%）。本檔預期它還沒有。', v_config;
  END IF;
END $guard$;


-- ─────────────────────────────────────────────
-- 1. 唯一的變更
-- ─────────────────────────────────────────────
ALTER FUNCTION public.is_admin() SET search_path = '';

COMMENT ON FUNCTION public.is_admin() IS
  '判斷目前呼叫者是否為管理員。SECURITY DEFINER，search_path 鎖為空字串——'
  '本體內所有名稱皆為 schema 限定，空路徑是最小安全路徑。'
  '授權語意未改變：仍以 create_user_profiles_table.sql 定義的單一 email 為準。';


-- ─────────────────────────────────────────────
-- 2. 套用後自我驗證 —— 本體與語意都沒變
-- ─────────────────────────────────────────────
DO $verify$
DECLARE
  k_expected_norm constant text := '4f2510c540d405db752d1a70d5b0cffb';
  v_norm text;
  v_secdef boolean;
  v_config text;
BEGIN
  SELECT md5(regexp_replace(replace(p.prosrc, chr(13), ''), '[[:space:]]+', ' ', 'g')),
         p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), '(null)')
    INTO v_norm, v_secdef, v_config
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_admin';

  IF v_norm <> k_expected_norm THEN
    RAISE EXCEPTION '套用後驗證失敗：函式本體被改動了（%）。', v_norm;
  END IF;
  IF NOT v_secdef THEN
    RAISE EXCEPTION '套用後驗證失敗：SECURITY DEFINER 不見了。';
  END IF;
  -- proconfig 把空字串存成 search_path=""（含兩個雙引號）
  IF v_config <> 'search_path=""' THEN
    RAISE EXCEPTION '套用後驗證失敗：proconfig 應為 search_path=""，實得 %。', v_config;
  END IF;
END $verify$;
