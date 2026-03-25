-- =====================================================
-- 新增 current_phase 欄位到 site_settings
-- 用於後台動態控制前台功能階段開放
-- Phase 0: Public MVP (單字練習)
-- Phase 1: Free Member (登入、收藏、成就)
-- Phase 2: Premium (模考、儀表板、AI作文)
-- =====================================================

-- 新增 current_phase 欄位，預設為 0
ALTER TABLE site_settings
ADD COLUMN IF NOT EXISTS current_phase smallint NOT NULL DEFAULT 0
CHECK (current_phase IN (0, 1, 2));

-- 確保現有資料有 current_phase 值
UPDATE site_settings SET current_phase = 0 WHERE current_phase IS NULL;
