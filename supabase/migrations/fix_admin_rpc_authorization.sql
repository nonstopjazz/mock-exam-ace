-- =====================================================
-- 修補：四支 admin RPC 對未登入呼叫者不設防
--
-- 這份 migration 取代了先前的 fix_admin_user_rpc_null_guard.sql
-- （那一份從未套用到任何環境，合併成單一檔案比較不會漏跑）。
--
-- ─────────────────────────────────────────────────────
-- 破口 A：admin_get_all_users() / admin_get_user_stats()
-- ─────────────────────────────────────────────────────
-- 守門寫成：
--     v_is_admin := is_admin();
--     IF NOT v_is_admin THEN RETURN ... 'UNAUTHORIZED'; END IF;
--
-- is_admin() 對【未登入】者回傳 NULL 而不是 false —— 它做
-- `SELECT email ... WHERE id = auth.uid()`，auth.uid() 為 NULL 時查不到列，
-- v_user_email 是 NULL，而 `NULL = 'nonstopjazz@gmail.com'` 的結果是 NULL。
-- `NOT NULL` 是 NULL，不是 TRUE ——> IF 區塊不執行 ——> 直接往下回傳整份名單。
--
-- ─────────────────────────────────────────────────────
-- 破口 B：admin_grant_premium() / admin_revoke_premium()
-- ─────────────────────────────────────────────────────
-- 更嚴重：這兩支【完全沒有授權分支】，連壞掉的守門都沒有。SECURITY DEFINER
-- 讓它們以擁有者身分執行，因此也繞過 premium_memberships 的 RLS。
--
-- 兩者共通：Supabase 的 ALTER DEFAULT PRIVILEGES 會把新函式的 EXECUTE
-- 自動授予 anon，而 anon key 內建在每一份部署出去的瀏覽器 bundle 裡。
-- 本機用逐字照抄的 migration 重現的完整攻擊鏈（全程未登入）：
--     admin_get_all_users()  → 取得所有人的 uuid 與 email
--     admin_grant_premium()  → 替任意帳號開通 premium（granted_by 為 NULL）
--     admin_revoke_premium() → 撤銷任意人的會員資格
--
-- 🔎 鑑識線索：未登入的授權會留下 granted_by IS NULL。
--    PRODUCTION_SCHEMA_AUDIT.md 的 R14 檢查顯示正式環境 5 列全部
--    granted_by 非 NULL ——> 目前沒有被利用的跡象。
--
-- ─────────────────────────────────────────────────────
-- 修法：兩層，刻意重複
-- ─────────────────────────────────────────────────────
--   1. 守門一律 coalesce(is_admin(), false) IS NOT TRUE ——> NULL 與 false 都擋
--   2. 對 PUBLIC 與 anon 收回 EXECUTE，只授予 authenticated
--      （這四支唯一的呼叫端是 /admin/users 的瀏覽器程式碼，也就是已登入的
--        管理員。api/ 與 scripts/ 都沒有呼叫，所以不需要 service_role。）
-- 任一層單獨都足夠。兩層都做，是因為將來若有人重建函式，
-- ALTER DEFAULT PRIVILEGES 會再次把 anon 加回來，那時第 1 層還在。
--
-- 相容性：四支的簽章、參數、回傳形狀都不變。失敗時回傳的
-- {"success": false, "error": "UNAUTHORIZED"} 沿用同一份 migration 裡
-- admin_get_all_users 既有的錯誤形狀，不改成 RAISE EXCEPTION。
--
-- 🛑 這份 migration 刻意【不】碰：
--    • is_admin() 本身（全站都在用）
--    • 稽核 §9.1 那 11 張 RLS 關閉的 legacy 表
--    • /exam 保留領域、Writing / Classes / Tasks 的 schema
--    • 計費架構（premium 的商業邏輯一行都沒改，只加授權把關）
--    • essays storage bucket（見 docs/learn/security-followups.md）
--
-- 回滾：fix_admin_rpc_authorization.rollback.sql
-- =====================================================


-- ─────────────────────────────────────────────────────
-- A1. admin_get_all_users
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_all_users(
  p_product TEXT DEFAULT NULL,
  p_grade TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_users JSON;
  v_total INTEGER;
BEGIN
  -- ⚠️ is_admin() 對未登入者回傳 NULL，不是 false。
  --    `IF NOT is_admin()` 在 NULL 時不成立，會直接放行——必須用 coalesce。
  IF coalesce(is_admin(), false) IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM auth.users u
  LEFT JOIN user_profiles p ON u.id = p.user_id
  WHERE (p_product IS NULL OR p.product = p_product)
    AND (p_grade IS NULL OR p.grade = p_grade);

  SELECT json_agg(user_data) INTO v_users
  FROM (
    SELECT
      u.id,
      u.email,
      u.created_at AS registered_at,
      u.last_sign_in_at,
      p.display_name,
      p.product,
      p.grade,
      p.school,
      p.created_at AS profile_created_at,
      p.updated_at AS profile_updated_at
    FROM auth.users u
    LEFT JOIN user_profiles p ON u.id = p.user_id
    WHERE (p_product IS NULL OR p.product = p_product)
      AND (p_grade IS NULL OR p.grade = p_grade)
    ORDER BY u.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) AS user_data;

  RETURN json_build_object(
    'success', true,
    'users', COALESCE(v_users, '[]'::json),
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;


-- ─────────────────────────────────────────────────────
-- A2. admin_get_user_stats
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_user_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_users INTEGER;
  v_users_with_profile INTEGER;
  v_grade_stats JSON;
  v_product_stats JSON;
BEGIN
  IF coalesce(is_admin(), false) IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT COUNT(*) INTO v_total_users FROM auth.users;
  SELECT COUNT(*) INTO v_users_with_profile FROM user_profiles;

  SELECT json_agg(grade_data) INTO v_grade_stats
  FROM (
    SELECT grade, COUNT(*) as count
    FROM user_profiles
    WHERE grade IS NOT NULL
    GROUP BY grade
    ORDER BY count DESC
  ) AS grade_data;

  SELECT json_agg(product_data) INTO v_product_stats
  FROM (
    SELECT product, COUNT(*) as count
    FROM user_profiles
    GROUP BY product
    ORDER BY count DESC
  ) AS product_data;

  RETURN json_build_object(
    'success', true,
    'total_users', v_total_users,
    'users_with_profile', v_users_with_profile,
    'grade_stats', COALESCE(v_grade_stats, '[]'::json),
    'product_stats', COALESCE(v_product_stats, '[]'::json)
  );
END;
$$;


-- ─────────────────────────────────────────────────────
-- B1. admin_grant_premium —— 原本完全沒有授權分支
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_grant_premium(
  p_user_id uuid,
  p_expires_at timestamp with time zone DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  -- ⚠️ 新增：原本這裡什麼檢查都沒有，未登入者可以替任意帳號開通 premium。
  IF coalesce(is_admin(), false) IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  v_admin_id := auth.uid();

  INSERT INTO premium_memberships (user_id, expires_at, granted_by, notes)
  VALUES (p_user_id, p_expires_at, v_admin_id, p_notes);

  RETURN json_build_object('success', true);
END;
$$;


-- ─────────────────────────────────────────────────────
-- B2. admin_revoke_premium —— 原本完全沒有授權分支
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_revoke_premium(p_membership_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- ⚠️ 新增：原本這裡什麼檢查都沒有，未登入者可以撤銷任意人的會員資格。
  IF coalesce(is_admin(), false) IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  UPDATE premium_memberships
  SET is_active = false
  WHERE id = p_membership_id;

  RETURN json_build_object('success', true);
END;
$$;


-- ─────────────────────────────────────────────────────
-- 第二層：未登入者連呼叫都呼叫不到
--
-- 必須點名 anon —— ALTER DEFAULT PRIVILEGES 是明確授予角色，
-- REVOKE ... FROM PUBLIC 收不掉它。
--
-- 只授予 authenticated：這四支唯一的呼叫端是 /admin/users 的前端程式碼，
-- 而管理員一定是登入狀態。api/ 與 scripts/ 都沒有呼叫，所以不給 service_role。
-- ─────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION admin_get_all_users(TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION admin_get_all_users(TEXT, TEXT, INTEGER, INTEGER)
  TO authenticated;

REVOKE ALL ON FUNCTION admin_get_user_stats() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION admin_get_user_stats() TO authenticated;

REVOKE ALL ON FUNCTION admin_grant_premium(uuid, timestamp with time zone, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION admin_grant_premium(uuid, timestamp with time zone, text)
  TO authenticated;

REVOKE ALL ON FUNCTION admin_revoke_premium(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION admin_revoke_premium(uuid) TO authenticated;


COMMENT ON FUNCTION admin_get_all_users IS
  '使用者目錄，僅限管理員。守門用 coalesce(is_admin(), false) IS NOT TRUE —— is_admin() 對未登入者回傳 NULL，NOT NULL 不成立會直接放行。';
COMMENT ON FUNCTION admin_grant_premium IS
  '授予 premium，僅限管理員。原始版本沒有任何授權分支，未登入者可自行開通。';
COMMENT ON FUNCTION admin_revoke_premium IS
  '收回 premium，僅限管理員。原始版本沒有任何授權分支。';
