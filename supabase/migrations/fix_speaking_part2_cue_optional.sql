-- =====================================================
-- Part 2 的 cue 改成選填，並修正快照文字的組法
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_speaking_rpcs.sql 之後執行。
--
--
-- 為什麼要改
--
--   原本的 speaking_prompts_part_shape 要求 Part 2 同時有 title 和 cue。
--   那是我看著 IELTS 題卡的樣子推測的，不是真實資料長的樣子——
--   既有題庫的 Part 2 有 101 題，cue 全部是 NULL，一題都進不來。
--
--   實際上 cue 就是「You should say:」那句固定的引導語，本來就屬於畫面，
--   不是題目的一部分。真正不能少的是 title（題卡標題）。
--
--   所以：Part 2 只要求 title，cue 有就用、沒有就由畫面補預設那一句。
--
--
-- 順便修掉一個會讓學生按不下去的 bug
--
--   speaking_start_practice 原本是這樣組快照文字的：
--     title || E'\n' || cue || ...
--   cue 是 NULL 的話【整個運算式就是 NULL】，接著撞上 prompt_text 的
--   NOT NULL，學生一按「開始錄音」就拿到一個資料庫錯誤。
--
--   CHECK 放寬之前碰不到（cue 是必填），放寬之後每一題 Part 2 都會踩到。
--   改用 concat_ws：它會跳過 NULL，而且順手處理「沒有 bullets」的情形。
--
-- 回滾：supabase/migrations/fix_speaking_part2_cue_optional.rollback.sql
-- =====================================================

ALTER TABLE speaking_prompts DROP CONSTRAINT IF EXISTS speaking_prompts_part_shape;

ALTER TABLE speaking_prompts ADD CONSTRAINT speaking_prompts_part_shape CHECK (
  (part IN (1, 3) AND length(btrim(coalesce(question, ''))) > 0)
  OR
  -- cue 不再是必填。畫面在它是空的時候顯示預設的「You should say:」。
  (part = 2 AND length(btrim(coalesce(title, ''))) > 0)
);

COMMENT ON COLUMN speaking_prompts.cue IS
  'Part 2 的引導語。選填——空的時候畫面顯示預設的「You should say:」。既有題庫這一欄整批是空的。';


CREATE OR REPLACE FUNCTION speaking_start_practice(p_prompt_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_prompt public.speaking_prompts%ROWTYPE;
  v_text TEXT;
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '42501';
  END IF;
  -- 🛑 自己檢查一次，不依賴前端把頁面藏起來。
  IF coalesce(public.learn_feature_enabled('speaking'), false) IS NOT TRUE THEN
    RAISE EXCEPTION '口說練習尚未對你開放' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prompt FROM public.speaking_prompts sp
   WHERE sp.id = p_prompt_id AND sp.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這一題，或它已經停用' USING ERRCODE = '22023';
  END IF;

  -- 快照的文字。concat_ws 會跳過 NULL —— 這正是重點：
  -- Part 2 的 cue 與 bullets 都可能沒有，用 || 串接會讓整串變成 NULL。
  v_text := CASE
    WHEN v_prompt.part = 2 THEN
      concat_ws(E'\n',
        v_prompt.title,
        nullif(btrim(coalesce(v_prompt.cue, '')), ''),
        nullif(array_to_string(coalesce(v_prompt.bullets, '{}'), E'\n'), ''))
    ELSE
      concat_ws('：', nullif(btrim(coalesce(v_prompt.topic, '')), ''), v_prompt.question)
  END;

  -- 表上的 CHECK 應該擋住空題目，但快照是學生唯一的紀錄——
  -- 寧可在這裡講清楚，也不要讓它撞上 NOT NULL 變成一句看不懂的資料庫錯誤。
  IF coalesce(btrim(v_text), '') = '' THEN
    RAISE EXCEPTION '這一題沒有題目內容，請聯絡老師' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.speaking_recordings
    (student_id, prompt_id, prompt_part, prompt_text, status)
  VALUES (v_uid, v_prompt.id, v_prompt.part, v_text, 'PENDING')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION speaking_start_practice IS
  '建立一次練習（PENDING）並快照題目文字。cue／bullets 可以是空的。自行檢查 learn_feature_enabled(''speaking'')。';
