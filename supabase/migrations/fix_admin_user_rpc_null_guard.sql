-- =====================================================
-- 修補：admin_get_all_users() / admin_get_user_stats() 對【未登入】呼叫者不設防
--
-- 問題
-- ----
-- 兩支函式的授權檢查寫成：
--     v_is_admin := is_admin();
--     IF NOT v_is_admin THEN RETURN ... 'UNAUTHORIZED'; END IF;
--
-- is_admin() 對未登入者回傳的是 NULL 而不是 false（它做
-- `SELECT email ... WHERE id = auth.uid()`，auth.uid() 為 NULL 時查不到列，
-- v_user_email 是 NULL，NULL = 'nonstopjazz@gmail.com' 的結果是 NULL）。
--
-- 而 `NOT NULL` 的結果是 NULL，不是 TRUE ——> IF 區塊不執行 ——> 直接往下
-- 回傳整份使用者名單。
--
-- 再加上 Supabase 的 ALTER DEFAULT PRIVILEGES 會自動把新函式的 EXECUTE
-- 授予 anon，而 anon key 內建在每一份部署出去的瀏覽器 bundle 裡，
-- 所以任何人不需要登入就能取得：
--     email、display_name、grade、school、註冊時間、最後登入時間
--
-- 已登入的一般使用者【不受影響】：對他們 is_admin() 回傳 false，
-- `NOT false` 是 TRUE，守門正常生效。這個破口只存在於未登入這條路徑。
--
-- 修法（兩層，刻意重複）
-- --------------------
--   1. 守門改成 coalesce(is_admin(), false) IS NOT TRUE ——
--      NULL 與 false 都會被擋下。
--   2. 對 PUBLIC 與 anon 收回 EXECUTE ——
--      未登入者連呼叫都呼叫不到。
-- 任何一層單獨都足夠；兩層都做，是因為將來若有人重建函式，
-- ALTER DEFAULT PRIVILEGES 會再次把 anon 加回來，那時第 1 層還在。
--
-- 🛑 這份 migration 刻意【不】碰：
--    • is_admin() 本身（全站到處在用，改它風險遠大於收益）
--    • 稽核報告裡那 11 張 RLS 關閉的 legacy 表
--    • /exam 保留領域
--    • premium_memberships 的 admin_grant_premium / admin_revoke_premium
--      （PRODUCTION_SCHEMA_AUDIT.md §9.3 另有記載，不在本次上線範圍內）
--
-- 相容性：函式簽章、參數、回傳格式完全不變。管理員端 /admin/users 不受影響。
-- 回滾：fix_admin_user_rpc_null_guard.rollback.sql
-- =====================================================

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

-- 第二層：未登入者連呼叫都呼叫不到。
-- 必須點名 anon —— ALTER DEFAULT PRIVILEGES 是明確授予角色，
-- REVOKE ... FROM PUBLIC 收不掉它。
REVOKE ALL ON FUNCTION admin_get_all_users(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_get_all_users(TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION admin_get_user_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_get_user_stats() TO authenticated, service_role;

COMMENT ON FUNCTION admin_get_all_users IS
  '使用者目錄，僅限管理員。守門用 coalesce(is_admin(), false) IS NOT TRUE —— is_admin() 對未登入者回傳 NULL，NOT NULL 不成立會直接放行。';
