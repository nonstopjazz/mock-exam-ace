-- =====================================================
-- Rollback: add_home_features_to_site_settings.sql
--
-- 🔴 與 migration 同樣的原則：staging 與 production 各自執行。
--    （gsat-staging 在 Supabase 免費組織，可能已自動暫停：執行前先 Restore。見 docs/STAGING.md）
--
-- 刪掉欄位之後，首頁會回到「全部依 Phase 顯示」，也就是這個功能之前的行為。
-- 前端讀的是 select('*') 加上 ?? null，所以欄位不存在不會讓查詢失敗，
-- 可以先回滾資料庫、之後再回滾前端。
-- =====================================================

ALTER TABLE site_settings
  DROP COLUMN IF EXISTS home_features;
