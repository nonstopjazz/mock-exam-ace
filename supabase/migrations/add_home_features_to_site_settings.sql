-- =====================================================
-- Migration: site_settings.home_features
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--    （若目前只用正式站，就只在 production 執行一次；但兩邊的 schema 要一致。）
--
-- 用途：讓管理員在 /admin/settings 決定首頁下方的功能卡片要顯示哪幾張。
--
-- 形狀（與 navigation_tabs 一樣是 JSONB，但只存開關）：
--   { "exams": false, "dashboard": false, "essay": false }
--
--   · 沒有列出來的 key = 顯示（缺席不等於關閉）
--   · 整欄為 NULL = 全部依 Phase 顯示，也就是這份 migration 之前的行為
--
-- 🛑 開關只能【關掉】卡片，不能打開 Phase 尚未開放的功能。
--    卡片的 key 與所屬 Phase 定義在 src/config/homeFeatures.ts。
--
-- 本檔只新增一個可為 NULL 的欄位：不改既有欄位、不動 RLS、不需要回填。
-- =====================================================

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS home_features JSONB;

COMMENT ON COLUMN site_settings.home_features IS
  '首頁功能卡片的開關，{ key: boolean }。NULL 或缺少該 key 皆視為顯示；只能關掉卡片，不能越過 Phase 打開功能。key 的定義在 src/config/homeFeatures.ts。';
