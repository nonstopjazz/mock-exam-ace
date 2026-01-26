-- =====================================================
-- Migration: 建立 user_stats 表
-- 用於儲存使用者的學習統計（跨裝置同步）
-- =====================================================

-- 建立 user_stats 表
CREATE TABLE IF NOT EXISTS user_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_study_date DATE,
  total_review_count INTEGER NOT NULL DEFAULT 0,
  total_words_learned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);

-- 啟用 RLS
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- RLS 政策：使用者只能查看自己的統計
CREATE POLICY "Users can view own stats"
  ON user_stats FOR SELECT
  USING (auth.uid() = user_id);

-- RLS 政策：使用者可以新增自己的統計
CREATE POLICY "Users can insert own stats"
  ON user_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS 政策：使用者可以更新自己的統計
CREATE POLICY "Users can update own stats"
  ON user_stats FOR UPDATE
  USING (auth.uid() = user_id);

-- 建立更新 streak 的函數
CREATE OR REPLACE FUNCTION update_user_streak(
  p_review_count INTEGER DEFAULT 1,
  p_words_learned INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_stats user_stats%ROWTYPE;
  v_today DATE;
  v_yesterday DATE;
  v_new_streak INTEGER;
BEGIN
  -- 取得當前使用者
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  v_today := CURRENT_DATE;
  v_yesterday := v_today - INTERVAL '1 day';

  -- 查詢現有統計
  SELECT * INTO v_stats
  FROM user_stats
  WHERE user_id = v_user_id;

  IF v_stats IS NULL THEN
    -- 新使用者，建立記錄
    INSERT INTO user_stats (user_id, streak_days, last_study_date, total_review_count, total_words_learned)
    VALUES (v_user_id, 1, v_today, p_review_count, p_words_learned)
    RETURNING * INTO v_stats;

    RETURN json_build_object(
      'success', true,
      'streak_days', v_stats.streak_days,
      'total_review_count', v_stats.total_review_count,
      'total_words_learned', v_stats.total_words_learned,
      'is_new_day', true
    );
  END IF;

  -- 計算新的 streak
  IF v_stats.last_study_date = v_today THEN
    -- 今天已經學習過，只更新計數
    v_new_streak := v_stats.streak_days;

    UPDATE user_stats
    SET
      total_review_count = total_review_count + p_review_count,
      total_words_learned = GREATEST(total_words_learned, p_words_learned),
      updated_at = now()
    WHERE user_id = v_user_id
    RETURNING * INTO v_stats;

    RETURN json_build_object(
      'success', true,
      'streak_days', v_stats.streak_days,
      'total_review_count', v_stats.total_review_count,
      'total_words_learned', v_stats.total_words_learned,
      'is_new_day', false
    );
  ELSIF v_stats.last_study_date = v_yesterday THEN
    -- 昨天有學習，連續天數 +1
    v_new_streak := v_stats.streak_days + 1;
  ELSE
    -- 中斷了，重新開始
    v_new_streak := 1;
  END IF;

  -- 更新統計
  UPDATE user_stats
  SET
    streak_days = v_new_streak,
    last_study_date = v_today,
    total_review_count = total_review_count + p_review_count,
    total_words_learned = GREATEST(total_words_learned, p_words_learned),
    updated_at = now()
  WHERE user_id = v_user_id
  RETURNING * INTO v_stats;

  RETURN json_build_object(
    'success', true,
    'streak_days', v_stats.streak_days,
    'total_review_count', v_stats.total_review_count,
    'total_words_learned', v_stats.total_words_learned,
    'is_new_day', true
  );
END;
$$;

-- 建立取得統計的函數
CREATE OR REPLACE FUNCTION get_user_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_stats user_stats%ROWTYPE;
  v_today DATE;
  v_yesterday DATE;
  v_actual_streak INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  v_today := CURRENT_DATE;
  v_yesterday := v_today - INTERVAL '1 day';

  SELECT * INTO v_stats
  FROM user_stats
  WHERE user_id = v_user_id;

  IF v_stats IS NULL THEN
    -- 沒有記錄，回傳預設值
    RETURN json_build_object(
      'success', true,
      'streak_days', 0,
      'total_review_count', 0,
      'total_words_learned', 0,
      'last_study_date', NULL
    );
  END IF;

  -- 檢查 streak 是否仍然有效
  IF v_stats.last_study_date = v_today OR v_stats.last_study_date = v_yesterday THEN
    v_actual_streak := v_stats.streak_days;
  ELSE
    -- Streak 已中斷（但不更新資料庫，等下次學習時才更新）
    v_actual_streak := 0;
  END IF;

  RETURN json_build_object(
    'success', true,
    'streak_days', v_actual_streak,
    'total_review_count', v_stats.total_review_count,
    'total_words_learned', v_stats.total_words_learned,
    'last_study_date', v_stats.last_study_date
  );
END;
$$;
