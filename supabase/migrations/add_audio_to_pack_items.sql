-- 為 pack_items 加入發音欄位
ALTER TABLE pack_items ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE pack_items ADD COLUMN IF NOT EXISTS example_audio_url TEXT;
