-- =====================================================
-- Migration: 建立 level_words 表
-- 將 Level 單字從前端靜態檔案搬到 Supabase 資料庫
-- =====================================================

-- 1. 建立 level_words 表
CREATE TABLE IF NOT EXISTS level_words (
  id text PRIMARY KEY,                    -- 原始 word ID，如 "4448"
  word text NOT NULL,                     -- 英文單字
  ipa text,                               -- 音標，如 "/əˈbɪləti/"
  translation text,                       -- 中文翻譯
  part_of_speech text,                    -- 詞性：n., v., adj., adv.
  example text,                           -- 英文例句
  example_translation text,               -- 中文例句翻譯
  synonyms text[] DEFAULT '{}',           -- 同義字陣列
  antonyms text[] DEFAULT '{}',           -- 反義字陣列
  level integer NOT NULL,                 -- 級別：1-6
  difficulty text,                        -- 難度：beginner, intermediate, advanced
  category text,                          -- 分類：名詞、動詞...
  tags text[] DEFAULT '{}',              -- 標籤陣列
  extra_notes text,                       -- 補充說明

  -- TTS 音檔 URL（預留給 Google TTS 使用）
  audio_url text,                         -- 單字發音 mp3 URL
  example_audio_url text,                 -- 例句發音 mp3 URL

  -- 時間戳記
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. 建立索引
CREATE INDEX idx_level_words_level ON level_words(level);
CREATE INDEX idx_level_words_word ON level_words(word);
CREATE INDEX idx_level_words_difficulty ON level_words(difficulty);
CREATE INDEX idx_level_words_category ON level_words(category);

-- 3. 啟用 RLS
ALTER TABLE level_words ENABLE ROW LEVEL SECURITY;

-- 所有人都可以讀取（公開教學內容）
CREATE POLICY "Level words are viewable by everyone"
  ON level_words FOR SELECT
  USING (true);

-- 只有 admin 可以新增
CREATE POLICY "Only admins can insert level words"
  ON level_words FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.uid() = id
      AND email = 'nonstopjazz@gmail.com'
    )
  );

-- 只有 admin 可以更新
CREATE POLICY "Only admins can update level words"
  ON level_words FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.uid() = id
      AND email = 'nonstopjazz@gmail.com'
    )
  );

-- 只有 admin 可以刪除
CREATE POLICY "Only admins can delete level words"
  ON level_words FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.uid() = id
      AND email = 'nonstopjazz@gmail.com'
    )
  );

-- =====================================================
-- 完成！
-- =====================================================
