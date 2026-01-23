-- =====================================================
-- Migration: 新增 skill_type 欄位到 packs 表
-- 用於區分英文能力類型：單字、寫作、閱讀等
-- =====================================================

-- 新增欄位
ALTER TABLE packs ADD COLUMN IF NOT EXISTS skill_type text;

-- 更新現有資料（目前只有一筆，是閱讀類型）
UPDATE packs SET skill_type = 'reading' WHERE skill_type IS NULL;

-- 建立索引（方便篩選）
CREATE INDEX IF NOT EXISTS idx_packs_skill_type ON packs(skill_type);

-- =====================================================
-- skill_type 可選值說明：
-- - vocabulary: 單字
-- - writing: 寫作
-- - reading: 閱讀
-- - listening: 聽力（未來擴充）
-- - grammar: 文法（未來擴充）
-- =====================================================
