-- =====================================================
-- Mock Exam Ace - Vocabulary Pack Schema
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. PACKS: 單字包主表
-- =====================================================
create table if not exists packs (
  id uuid primary key default gen_random_uuid(),

  -- 基本資訊
  title text not null,
  description text,
  theme text,                    -- 主題分類：環境議題、社會議題、商務英語...
  difficulty text,               -- 難度：初級、中級、中高級、高級

  -- 建立者
  created_by uuid references auth.users(id) on delete set null,

  -- 狀態
  is_public boolean default false,  -- 是否公開（公開的 pack 不需要 token 即可查看）
  is_active boolean default true,   -- 是否啟用

  -- 時間戳記
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 索引
create index idx_packs_created_by on packs(created_by);
create index idx_packs_theme on packs(theme);
create index idx_packs_is_public on packs(is_public);

-- =====================================================
-- 2. PACK_ITEMS: 單字包內容（單字列表）
-- =====================================================
create table if not exists pack_items (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references packs(id) on delete cascade,

  -- 單字資料
  word text not null,
  definition text,               -- 中文定義
  part_of_speech text,           -- 詞性：n., v., adj., adv....
  example_sentence text,         -- 例句
  phonetic text,                 -- 音標

  -- 排序
  sort_order integer default 0,

  -- 時間戳記
  created_at timestamp with time zone default now()
);

-- 索引
create index idx_pack_items_pack_id on pack_items(pack_id);
create index idx_pack_items_word on pack_items(word);

-- =====================================================
-- 3. INVITE_TOKENS: 邀請碼（用於分享單字包）
-- =====================================================
create table if not exists invite_tokens (
  id uuid primary key default gen_random_uuid(),

  -- 關聯
  pack_id uuid not null references packs(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,

  -- Token 資訊
  token text unique not null,        -- 邀請碼（短碼或 UUID）

  -- 使用限制
  max_uses integer,                  -- 最大使用次數（null = 無限）
  current_uses integer default 0,    -- 目前使用次數
  expires_at timestamp with time zone, -- 過期時間（null = 永不過期）

  -- 狀態
  is_active boolean default true,

  -- 時間戳記
  created_at timestamp with time zone default now()
);

-- 索引
create index idx_invite_tokens_token on invite_tokens(token);
create index idx_invite_tokens_pack_id on invite_tokens(pack_id);

-- =====================================================
-- 4. USER_PACK_CLAIMS: 使用者領取的單字包
-- =====================================================
create table if not exists user_pack_claims (
  id uuid primary key default gen_random_uuid(),

  -- 關聯
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id uuid not null references packs(id) on delete cascade,
  claimed_via_token uuid references invite_tokens(id) on delete set null,

  -- 學習進度
  progress integer default 0,        -- 學習進度百分比 0-100
  last_studied_at timestamp with time zone,

  -- 時間戳記
  claimed_at timestamp with time zone default now(),

  -- 確保同一使用者不會重複領取同一包
  unique(user_id, pack_id)
);

-- 索引
create index idx_user_pack_claims_user_id on user_pack_claims(user_id);
create index idx_user_pack_claims_pack_id on user_pack_claims(pack_id);

-- =====================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- 啟用 RLS
alter table packs enable row level security;
alter table pack_items enable row level security;
alter table invite_tokens enable row level security;
alter table user_pack_claims enable row level security;

-- ----- PACKS RLS -----

-- 任何人都可以查看公開的 pack
create policy "Public packs are viewable by everyone"
  on packs for select
  using (is_public = true and is_active = true);

-- 使用者可以查看自己建立的 pack
create policy "Users can view own packs"
  on packs for select
  using (auth.uid() = created_by);

-- 使用者可以查看已領取的 pack
create policy "Users can view claimed packs"
  on packs for select
  using (
    exists (
      select 1 from user_pack_claims
      where user_pack_claims.pack_id = packs.id
      and user_pack_claims.user_id = auth.uid()
    )
  );

-- 使用者可以建立 pack
create policy "Authenticated users can create packs"
  on packs for insert
  with check (auth.uid() = created_by);

-- 使用者可以更新自己的 pack
create policy "Users can update own packs"
  on packs for update
  using (auth.uid() = created_by);

-- 使用者可以刪除自己的 pack
create policy "Users can delete own packs"
  on packs for delete
  using (auth.uid() = created_by);

-- ----- PACK_ITEMS RLS -----

-- 可以查看有權限的 pack 的 items
create policy "Users can view items of accessible packs"
  on pack_items for select
  using (
    exists (
      select 1 from packs
      where packs.id = pack_items.pack_id
      and (
        packs.is_public = true
        or packs.created_by = auth.uid()
        or exists (
          select 1 from user_pack_claims
          where user_pack_claims.pack_id = packs.id
          and user_pack_claims.user_id = auth.uid()
        )
      )
    )
  );

-- Pack 建立者可以新增 items
create policy "Pack owners can insert items"
  on pack_items for insert
  with check (
    exists (
      select 1 from packs
      where packs.id = pack_items.pack_id
      and packs.created_by = auth.uid()
    )
  );

-- Pack 建立者可以更新 items
create policy "Pack owners can update items"
  on pack_items for update
  using (
    exists (
      select 1 from packs
      where packs.id = pack_items.pack_id
      and packs.created_by = auth.uid()
    )
  );

-- Pack 建立者可以刪除 items
create policy "Pack owners can delete items"
  on pack_items for delete
  using (
    exists (
      select 1 from packs
      where packs.id = pack_items.pack_id
      and packs.created_by = auth.uid()
    )
  );

-- ----- INVITE_TOKENS RLS -----

-- 任何人都可以用 token 查詢（用於驗證 token）
create policy "Anyone can validate tokens"
  on invite_tokens for select
  using (is_active = true);

-- Token 建立者可以查看自己的 tokens
create policy "Users can view own tokens"
  on invite_tokens for select
  using (auth.uid() = created_by);

-- Pack 擁有者可以建立 tokens
create policy "Pack owners can create tokens"
  on invite_tokens for insert
  with check (
    exists (
      select 1 from packs
      where packs.id = invite_tokens.pack_id
      and packs.created_by = auth.uid()
    )
  );

-- Token 建立者可以更新（停用）tokens
create policy "Token creators can update tokens"
  on invite_tokens for update
  using (auth.uid() = created_by);

-- Token 建立者可以刪除 tokens
create policy "Token creators can delete tokens"
  on invite_tokens for delete
  using (auth.uid() = created_by);

-- ----- USER_PACK_CLAIMS RLS -----

-- 使用者只能查看自己的 claims
create policy "Users can view own claims"
  on user_pack_claims for select
  using (auth.uid() = user_id);

-- 已登入使用者可以 claim packs
create policy "Authenticated users can claim packs"
  on user_pack_claims for insert
  with check (auth.uid() = user_id);

-- 使用者可以更新自己的 claim（進度等）
create policy "Users can update own claims"
  on user_pack_claims for update
  using (auth.uid() = user_id);

-- 使用者可以刪除自己的 claim（取消收藏）
create policy "Users can delete own claims"
  on user_pack_claims for delete
  using (auth.uid() = user_id);

-- =====================================================
-- 6. FUNCTIONS: 輔助函數
-- =====================================================

-- 函數：領取單字包（含 token 驗證與使用次數更新）
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

  -- 檢查是否已領取
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

-- 函數：產生短碼 token
create or replace function generate_short_token(length int default 8)
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..length loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end;
$$;

-- =====================================================
-- 7. SAMPLE DATA (可選 - 測試用)
-- =====================================================

-- 取消註解以下區塊來插入測試資料
/*
-- 插入測試 pack（需要先有使用者）
insert into packs (id, title, description, theme, difficulty, is_public, created_by)
values
  ('11111111-1111-1111-1111-111111111111', '全球暖化核心詞彙', '探討全球暖化相關的核心詞彙', '環境議題', '中高級', false, null),
  ('22222222-2222-2222-2222-222222222222', '少子化議題詞彙', '討論少子化現象的相關詞彙', '社會議題', '中級', false, null);

-- 插入測試單字
insert into pack_items (pack_id, word, definition, part_of_speech, example_sentence, sort_order)
values
  ('11111111-1111-1111-1111-111111111111', 'climate change', '氣候變遷', 'n.', 'Climate change is affecting weather patterns worldwide.', 1),
  ('11111111-1111-1111-1111-111111111111', 'greenhouse effect', '溫室效應', 'n.', 'The greenhouse effect traps heat in the atmosphere.', 2),
  ('11111111-1111-1111-1111-111111111111', 'carbon footprint', '碳足跡', 'n.', 'We should reduce our carbon footprint.', 3);

-- 插入測試 token
insert into invite_tokens (pack_id, token, created_by)
values
  ('11111111-1111-1111-1111-111111111111', 'CLIMATE2024', null),
  ('22222222-2222-2222-2222-222222222222', 'BIRTH2024', null);
*/

-- =====================================================
-- 完成！
-- =====================================================
