-- =====================================================
-- Migration: 為 user_pack_claims 加入 site 欄位
-- 用於區分不同子站的單字包領取
-- =====================================================

-- 1. 新增 site 欄位
ALTER TABLE user_pack_claims
ADD COLUMN IF NOT EXISTS site text DEFAULT 'gsat';

-- 2. 建立索引以加速查詢
CREATE INDEX IF NOT EXISTS idx_user_pack_claims_site ON user_pack_claims(site);

-- 3. 更新 claim_pack_with_token 函數，加入 site 參數
CREATE OR REPLACE FUNCTION claim_pack_with_token(p_token text, p_site text DEFAULT 'gsat')
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

  -- 檢查是否在同一站點已領取（允許不同站點重複領取）
  SELECT * INTO v_existing_claim
  FROM user_pack_claims
  WHERE user_id = v_user_id
  AND pack_id = v_pack_record.id
  AND site = p_site;

  IF v_existing_claim IS NOT NULL THEN
    RETURN json_build_object(
      'success', true,
      'already_claimed', true,
      'pack_id', v_pack_record.id,
      'pack_title', v_pack_record.title,
      'site', p_site
    );
  END IF;

  -- 新增 claim（包含 site）
  INSERT INTO user_pack_claims (user_id, pack_id, claimed_via_token, site)
  VALUES (v_user_id, v_pack_record.id, v_token_record.id, p_site);

  -- 更新 token 使用次數
  UPDATE invite_tokens
  SET current_uses = current_uses + 1
  WHERE id = v_token_record.id;

  RETURN json_build_object(
    'success', true,
    'already_claimed', false,
    'pack_id', v_pack_record.id,
    'pack_title', v_pack_record.title,
    'site', p_site
  );
END;
$$;

-- 4. 更新 unique constraint（如果需要允許同用戶在不同站領取同一包）
-- 先移除舊的 unique constraint
ALTER TABLE user_pack_claims DROP CONSTRAINT IF EXISTS user_pack_claims_user_id_pack_id_key;

-- 新增包含 site 的 unique constraint
ALTER TABLE user_pack_claims ADD CONSTRAINT user_pack_claims_user_id_pack_id_site_key UNIQUE (user_id, pack_id, site);

-- =====================================================
-- 完成！
-- =====================================================
