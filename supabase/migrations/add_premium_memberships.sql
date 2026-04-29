-- =====================================================
-- Premium Memberships: 精華會員資格管理
-- =====================================================

-- 1. 建立 premium_memberships 表
CREATE TABLE IF NOT EXISTS premium_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone, -- null = 永不過期
  is_active boolean DEFAULT true,      -- false = 手動收回
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,                          -- 備註（例如「2025暑期班」）

  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_premium_memberships_user_id ON premium_memberships(user_id);
CREATE INDEX idx_premium_memberships_active ON premium_memberships(is_active, expires_at);

-- RLS
ALTER TABLE premium_memberships ENABLE ROW LEVEL SECURITY;

-- 使用者可查看自己的會員資格
CREATE POLICY "Users can view own memberships"
  ON premium_memberships FOR SELECT
  USING (auth.uid() = user_id);

-- Admin 可完整操作（透過 security definer 函數處理）

-- 2. packs 表新增 is_premium 欄位
ALTER TABLE packs
ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;

-- 3. 建立檢查函數：使用者是否為有效 premium 會員
CREATE OR REPLACE FUNCTION is_premium_member(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM premium_memberships
    WHERE user_id = p_user_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;

-- 4. 更新 claim_pack_with_token 函數，加入 premium 檢查
CREATE OR REPLACE FUNCTION claim_pack_with_token(p_token text, p_site text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_record invite_tokens%rowtype;
  v_pack_record packs%rowtype;
  v_user_id uuid;
  v_existing_claim user_pack_claims%rowtype;
BEGIN
  -- 取得當前使用者
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  -- 查詢 token
  SELECT * INTO v_token_record
  FROM invite_tokens
  WHERE token = p_token
  AND is_active = true;

  IF v_token_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_TOKEN');
  END IF;

  -- 檢查是否過期
  IF v_token_record.expires_at IS NOT NULL AND v_token_record.expires_at < now() THEN
    RETURN json_build_object('success', false, 'error', 'TOKEN_EXPIRED');
  END IF;

  -- 檢查使用次數
  IF v_token_record.max_uses IS NOT NULL AND v_token_record.current_uses >= v_token_record.max_uses THEN
    RETURN json_build_object('success', false, 'error', 'TOKEN_EXHAUSTED');
  END IF;

  -- 查詢 pack
  SELECT * INTO v_pack_record
  FROM packs
  WHERE id = v_token_record.pack_id
  AND is_active = true;

  IF v_pack_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'PACK_NOT_FOUND');
  END IF;

  -- ★ Premium 檢查：如果是精華包，確認使用者是否為 premium 會員
  IF v_pack_record.is_premium AND NOT is_premium_member(v_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'PREMIUM_REQUIRED');
  END IF;

  -- 檢查是否已領取
  SELECT * INTO v_existing_claim
  FROM user_pack_claims
  WHERE user_id = v_user_id
  AND pack_id = v_pack_record.id;

  IF v_existing_claim IS NOT NULL THEN
    RETURN json_build_object(
      'success', true,
      'already_claimed', true,
      'pack_id', v_pack_record.id,
      'pack_title', v_pack_record.title
    );
  END IF;

  -- 新增 claim
  INSERT INTO user_pack_claims (user_id, pack_id, claimed_via_token)
  VALUES (v_user_id, v_pack_record.id, v_token_record.id);

  -- 更新 token 使用次數
  UPDATE invite_tokens
  SET current_uses = current_uses + 1
  WHERE id = v_token_record.id;

  RETURN json_build_object(
    'success', true,
    'already_claimed', false,
    'pack_id', v_pack_record.id,
    'pack_title', v_pack_record.title
  );
END;
$$;

-- 5. Admin 管理函數：授予 premium 資格
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
  v_admin_id := auth.uid();

  INSERT INTO premium_memberships (user_id, expires_at, granted_by, notes)
  VALUES (p_user_id, p_expires_at, v_admin_id, p_notes);

  RETURN json_build_object('success', true);
END;
$$;

-- 6. Admin 管理函數：收回 premium 資格
CREATE OR REPLACE FUNCTION admin_revoke_premium(p_membership_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE premium_memberships
  SET is_active = false
  WHERE id = p_membership_id;

  RETURN json_build_object('success', true);
END;
$$;
