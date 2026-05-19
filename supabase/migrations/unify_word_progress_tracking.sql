-- =====================================================
-- Migration: 統一 Level 與 Pack 單字的學習進度追蹤
-- 在 user_word_progress 加入 source 和 pack_id 欄位
-- =====================================================

-- 1. 移除 word_id 的外鍵約束（pack items 的 ID 不在 level_words 表裡）
ALTER TABLE user_word_progress DROP CONSTRAINT IF EXISTS user_word_progress_word_id_fkey;

-- 2. 新增 source 和 pack_id 欄位
ALTER TABLE user_word_progress
ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'level';

ALTER TABLE user_word_progress
ADD COLUMN IF NOT EXISTS pack_id UUID;

-- 3. 更新 UNIQUE 約束（同一個字可能同時出現在 Level 和 Pack 中）
ALTER TABLE user_word_progress DROP CONSTRAINT IF EXISTS user_word_progress_user_id_word_id_key;
ALTER TABLE user_word_progress ADD CONSTRAINT user_word_progress_user_source_key UNIQUE (user_id, word_id, source, COALESCE(pack_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 4. 新增索引
CREATE INDEX IF NOT EXISTS idx_user_word_progress_source ON user_word_progress(user_id, source);
CREATE INDEX IF NOT EXISTS idx_user_word_progress_pack ON user_word_progress(user_id, pack_id) WHERE pack_id IS NOT NULL;

-- 5. 更新 upsert 函數：支援 source 和 pack_id
CREATE OR REPLACE FUNCTION upsert_word_progress(
  p_word_id TEXT,
  p_mastery_level INTEGER,
  p_next_review_time BIGINT,
  p_review_count INTEGER,
  p_correct_count INTEGER,
  p_last_review_time BIGINT,
  p_source TEXT DEFAULT 'level',
  p_pack_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  INSERT INTO user_word_progress (
    user_id, word_id, mastery_level, next_review_time,
    review_count, correct_count, last_review_time, source, pack_id
  )
  VALUES (
    v_user_id, p_word_id, p_mastery_level, p_next_review_time,
    p_review_count, p_correct_count, p_last_review_time, p_source, p_pack_id
  )
  ON CONFLICT ON CONSTRAINT user_word_progress_user_source_key DO UPDATE SET
    mastery_level = EXCLUDED.mastery_level,
    next_review_time = EXCLUDED.next_review_time,
    review_count = EXCLUDED.review_count,
    correct_count = EXCLUDED.correct_count,
    last_review_time = EXCLUDED.last_review_time,
    updated_at = now();

  RETURN json_build_object('success', true);
END;
$$;

-- 6. 更新 get_all_word_progress 函數：回傳 source 和 pack_id
CREATE OR REPLACE FUNCTION get_all_word_progress()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_result JSON;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  SELECT json_build_object(
    'success', true,
    'progress', COALESCE(json_agg(
      json_build_object(
        'word_id', word_id,
        'mastery_level', mastery_level,
        'next_review_time', next_review_time,
        'review_count', review_count,
        'correct_count', correct_count,
        'last_review_time', last_review_time,
        'source', source,
        'pack_id', pack_id
      )
    ), '[]'::json)
  ) INTO v_result
  FROM user_word_progress
  WHERE user_id = v_user_id;

  RETURN v_result;
END;
$$;
