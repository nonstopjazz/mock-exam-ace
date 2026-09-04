-- =====================================================
-- 測試替身：安裝「硬化前」的真實 is_admin()
--
-- ⚠️ 只給本機臨時資料庫使用。
--
-- _local_harness.sql 提供的是讀 GUC 的 is_admin() 假替身，方便寫作系統的
-- 測試切換身分。但內容權限硬化要驗證的正是「真實的 is_admin() 當授權邊界」
-- 以及「harden_is_admin_search_path.sql 的指紋守衛」，用假替身會讓
-- 那些測試失去意義（守衛會因為本體不符而中止，這也是它該做的事）。
--
-- 本檔逐字複製 create_user_profiles_table.sql:155 的定義，
-- 包含它「沒有 SET search_path」這個要被修掉的缺陷。
-- =====================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
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

-- 確認裝進去的就是硬化前的樣子
DO $$
DECLARE v_norm text; v_config text;
BEGIN
  SELECT md5(regexp_replace(replace(p.prosrc, chr(13), ''), '[[:space:]]+', ' ', 'g')),
         coalesce(array_to_string(p.proconfig, ','), '(null)')
    INTO v_norm, v_config
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_admin';
  IF v_norm <> '4f2510c540d405db752d1a70d5b0cffb' THEN
    RAISE EXCEPTION '替身安裝失敗：正規化指紋 % 與 create_user_profiles_table.sql 不符', v_norm;
  END IF;
  IF v_config <> '(null)' THEN
    RAISE EXCEPTION '替身安裝失敗：proconfig 應為 null，實得 %', v_config;
  END IF;
END $$;

-- 測試身分：admin 與一般學生
INSERT INTO auth.users (id, email) VALUES
  ('cccccccc-0000-0000-0000-00000000000a', 'nonstopjazz@gmail.com'),
  ('dddddddd-0000-0000-0000-00000000000b', 'student@test.local')
ON CONFLICT (id) DO NOTHING;
