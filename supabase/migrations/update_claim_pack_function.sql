-- =====================================================
-- Migration: 更新 claim_pack_with_token 函數
-- 修復重複領取時的錯誤處理
-- =====================================================

-- 重新建立函數（會覆蓋舊版本）
create or replace function claim_pack_with_token(p_token text)
returns json
language plpgsql
security definer
as $$
declare
  v_token_record invite_tokens%rowtype;
  v_pack_record packs%rowtype;
  v_user_id uuid;
  v_existing_claim user_pack_claims%rowtype;
begin
  -- 取得當前使用者
  v_user_id := auth.uid();
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  -- 查詢 token
  select * into v_token_record
  from invite_tokens
  where token = p_token
  and is_active = true;

  if v_token_record is null then
    return json_build_object('success', false, 'error', 'INVALID_TOKEN');
  end if;

  -- 檢查是否過期
  if v_token_record.expires_at is not null and v_token_record.expires_at < now() then
    return json_build_object('success', false, 'error', 'TOKEN_EXPIRED');
  end if;

  -- 檢查使用次數
  if v_token_record.max_uses is not null and v_token_record.current_uses >= v_token_record.max_uses then
    return json_build_object('success', false, 'error', 'TOKEN_EXHAUSTED');
  end if;

  -- 查詢 pack
  select * into v_pack_record
  from packs
  where id = v_token_record.pack_id
  and is_active = true;

  if v_pack_record is null then
    return json_build_object('success', false, 'error', 'PACK_NOT_FOUND');
  end if;

  -- 檢查是否已領取（在 INSERT 之前檢查）
  select * into v_existing_claim
  from user_pack_claims
  where user_id = v_user_id
  and pack_id = v_pack_record.id;

  if v_existing_claim is not null then
    return json_build_object(
      'success', true,
      'already_claimed', true,
      'pack_id', v_pack_record.id,
      'pack_title', v_pack_record.title
    );
  end if;

  -- 新增 claim
  insert into user_pack_claims (user_id, pack_id, claimed_via_token)
  values (v_user_id, v_pack_record.id, v_token_record.id);

  -- 更新 token 使用次數
  update invite_tokens
  set current_uses = current_uses + 1
  where id = v_token_record.id;

  return json_build_object(
    'success', true,
    'already_claimed', false,
    'pack_id', v_pack_record.id,
    'pack_title', v_pack_record.title
  );
end;
$$;
