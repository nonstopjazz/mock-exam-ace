-- =====================================================
-- 新增 current_phase 欄位到 site_settings
-- 改為 per-site 設定（gsat / toeic / kids 各一筆）
-- =====================================================

-- 新增 current_phase 欄位，預設為 0
ALTER TABLE site_settings
ADD COLUMN IF NOT EXISTS current_phase smallint NOT NULL DEFAULT 0
CHECK (current_phase IN (0, 1, 2));

-- 為每個站點建立獨立設定（如果尚未存在）
-- 從現有的 'main' 設定複製，或使用預設值
INSERT INTO site_settings (id, navigation_tabs, current_phase, updated_at)
SELECT 'gsat', COALESCE(m.navigation_tabs, '{}'::jsonb), COALESCE(m.current_phase, 0), now()
FROM (SELECT 1) AS dummy
LEFT JOIN site_settings m ON m.id = 'main'
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE id = 'gsat')
ON CONFLICT (id) DO NOTHING;

INSERT INTO site_settings (id, navigation_tabs, current_phase, updated_at)
SELECT 'toeic', COALESCE(m.navigation_tabs, '{}'::jsonb), COALESCE(m.current_phase, 0), now()
FROM (SELECT 1) AS dummy
LEFT JOIN site_settings m ON m.id = 'main'
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE id = 'toeic')
ON CONFLICT (id) DO NOTHING;

INSERT INTO site_settings (id, navigation_tabs, current_phase, updated_at)
SELECT 'kids', COALESCE(m.navigation_tabs, '{}'::jsonb), COALESCE(m.current_phase, 0), now()
FROM (SELECT 1) AS dummy
LEFT JOIN site_settings m ON m.id = 'main'
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE id = 'kids')
ON CONFLICT (id) DO NOTHING;
