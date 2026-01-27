-- =====================================================
-- User Profiles Table
-- 儲存使用者背景資料（年級、產品等）
-- =====================================================

-- 建立 user_profiles 表
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 基本資料
  display_name TEXT,

  -- 產品類型 (gsat/toeic/kids)
  product TEXT NOT NULL DEFAULT 'gsat',

  -- 年級/身分
  -- GSAT: 國一、國二、國三、高一、高二、高三、重考
  -- TOEIC: 大學生、上班族、其他
  -- KIDS: 小班、中班、大班、小一~小六
  grade TEXT,

  -- 選填資料
  school TEXT,

  -- 時間戳記
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 確保每個使用者只有一筆資料
  UNIQUE(user_id)
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_product ON user_profiles(product);
CREATE INDEX IF NOT EXISTS idx_user_profiles_grade ON user_profiles(grade);

-- 啟用 RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS 政策：使用者只能存取自己的資料
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- =====================================================
-- RPC Functions
-- =====================================================

-- 取得使用者 Profile
CREATE OR REPLACE FUNCTION get_user_profile()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_profile user_profiles%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  SELECT * INTO v_profile
  FROM user_profiles
  WHERE user_id = v_user_id;

  IF v_profile IS NULL THEN
    -- 沒有 profile，回傳 null 但標記成功
    RETURN json_build_object(
      'success', true,
      'profile', null,
      'has_profile', false
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'has_profile', true,
    'profile', json_build_object(
      'id', v_profile.id,
      'user_id', v_profile.user_id,
      'display_name', v_profile.display_name,
      'product', v_profile.product,
      'grade', v_profile.grade,
      'school', v_profile.school,
      'created_at', v_profile.created_at,
      'updated_at', v_profile.updated_at
    )
  );
END;
$$;

-- 更新/建立使用者 Profile
CREATE OR REPLACE FUNCTION upsert_user_profile(
  p_product TEXT DEFAULT 'gsat',
  p_grade TEXT DEFAULT NULL,
  p_display_name TEXT DEFAULT NULL,
  p_school TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_profile user_profiles%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  -- Upsert profile
  INSERT INTO user_profiles (user_id, product, grade, display_name, school)
  VALUES (v_user_id, p_product, p_grade, p_display_name, p_school)
  ON CONFLICT (user_id) DO UPDATE SET
    product = COALESCE(EXCLUDED.product, user_profiles.product),
    grade = COALESCE(EXCLUDED.grade, user_profiles.grade),
    display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name),
    school = COALESCE(EXCLUDED.school, user_profiles.school),
    updated_at = now()
  RETURNING * INTO v_profile;

  RETURN json_build_object(
    'success', true,
    'profile', json_build_object(
      'id', v_profile.id,
      'user_id', v_profile.user_id,
      'display_name', v_profile.display_name,
      'product', v_profile.product,
      'grade', v_profile.grade,
      'school', v_profile.school,
      'created_at', v_profile.created_at,
      'updated_at', v_profile.updated_at
    )
  );
END;
$$;

-- =====================================================
-- Admin Functions (只有 admin 可以使用)
-- =====================================================

-- 檢查是否為 admin
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

-- Admin: 取得所有使用者資料
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
  v_is_admin BOOLEAN;
  v_users JSON;
  v_total INTEGER;
BEGIN
  -- 檢查是否為 admin
  v_is_admin := is_admin();
  IF NOT v_is_admin THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- 計算總數
  SELECT COUNT(*) INTO v_total
  FROM auth.users u
  LEFT JOIN user_profiles p ON u.id = p.user_id
  WHERE (p_product IS NULL OR p.product = p_product)
    AND (p_grade IS NULL OR p.grade = p_grade);

  -- 取得使用者列表
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

-- Admin: 取得使用者統計
CREATE OR REPLACE FUNCTION admin_get_user_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_total_users INTEGER;
  v_users_with_profile INTEGER;
  v_grade_stats JSON;
  v_product_stats JSON;
BEGIN
  -- 檢查是否為 admin
  v_is_admin := is_admin();
  IF NOT v_is_admin THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- 總使用者數
  SELECT COUNT(*) INTO v_total_users FROM auth.users;

  -- 有填寫 profile 的使用者數
  SELECT COUNT(*) INTO v_users_with_profile FROM user_profiles;

  -- 各年級人數統計
  SELECT json_agg(grade_data) INTO v_grade_stats
  FROM (
    SELECT grade, COUNT(*) as count
    FROM user_profiles
    WHERE grade IS NOT NULL
    GROUP BY grade
    ORDER BY count DESC
  ) AS grade_data;

  -- 各產品人數統計
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
