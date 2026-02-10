-- =====================================================
-- Migration: 建立 user_word_progress 表
-- 儲存使用者的每個單字學習進度（跨裝置同步）
-- =====================================================

-- 建立 user_word_progress 表
CREATE TABLE IF NOT EXISTS user_word_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL REFERENCES level_words(id) ON DELETE CASCADE,

  -- 學習進度
  mastery_level INTEGER NOT NULL DEFAULT 0,       -- 熟練度 0-5
  next_review_time BIGINT NOT NULL DEFAULT 0,     -- 下次複習時間（Unix ms）
  review_count INTEGER NOT NULL DEFAULT 0,        -- 總複習次數
  correct_count INTEGER NOT NULL DEFAULT 0,       -- 答對次數
  last_review_time BIGINT,                        -- 最後複習時間（Unix ms）

  -- 時間戳記
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 同一使用者同一單字不重複
  UNIQUE(user_id, word_id)
);

-- 建立索引
CREATE INDEX idx_user_word_progress_user_id ON user_word_progress(user_id);
CREATE INDEX idx_user_word_progress_word_id ON user_word_progress(word_id);
CREATE INDEX idx_user_word_progress_mastery ON user_word_progress(user_id, mastery_level);
CREATE INDEX idx_user_word_progress_review ON user_word_progress(user_id, next_review_time);

-- 啟用 RLS
ALTER TABLE user_word_progress ENABLE ROW LEVEL SECURITY;

-- RLS 政策：使用者只能查看自己的進度
CREATE POLICY "Users can view own word progress"
  ON user_word_progress FOR SELECT
  USING (auth.uid() = user_id);

-- RLS 政策：使用者可以新增自己的進度
CREATE POLICY "Users can insert own word progress"
  ON user_word_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS 政策：使用者可以更新自己的進度
CREATE POLICY "Users can update own word progress"
  ON user_word_progress FOR UPDATE
  USING (auth.uid() = user_id);

-- =====================================================
-- 函數：更新單字學習進度（upsert）
-- =====================================================
CREATE OR REPLACE FUNCTION upsert_word_progress(
  p_word_id TEXT,
  p_mastery_level INTEGER,
  p_next_review_time BIGINT,
  p_review_count INTEGER,
  p_correct_count INTEGER,
  p_last_review_time BIGINT
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
    review_count, correct_count, last_review_time
  )
  VALUES (
    v_user_id, p_word_id, p_mastery_level, p_next_review_time,
    p_review_count, p_correct_count, p_last_review_time
  )
  ON CONFLICT (user_id, word_id) DO UPDATE SET
    mastery_level = EXCLUDED.mastery_level,
    next_review_time = EXCLUDED.next_review_time,
    review_count = EXCLUDED.review_count,
    correct_count = EXCLUDED.correct_count,
    last_review_time = EXCLUDED.last_review_time,
    updated_at = now();

  RETURN json_build_object('success', true);
END;
$$;

-- =====================================================
-- 函數：批次載入使用者的所有學習進度
-- =====================================================
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
        'last_review_time', last_review_time
      )
    ), '[]'::json)
  ) INTO v_result
  FROM user_word_progress
  WHERE user_id = v_user_id;

  RETURN v_result;
END;
$$;

-- =====================================================
-- 完成！
-- =====================================================
