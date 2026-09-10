-- =====================================================
-- Rollback: create_writing_images.sql
--
-- 🔴 staging 與 production 各自執行。
--
-- ⚠️ 先確認 Storage 裡沒有還沒清掉的檔案，再刪這張表。
--    這張表是 writing-raw / writing-archive 兩個 bucket 的唯一索引：
--    表沒了，檔案就再也沒有人找得到，也不會被清理工作帶走。
--
--    刪之前先看一眼還剩多少檔案：
--      SELECT count(*) FILTER (WHERE raw_deleted_at IS NULL AND raw_path IS NOT NULL) AS raw_alive,
--             count(*) FILTER (WHERE archive_deleted_at IS NULL AND archive_path IS NOT NULL) AS archive_alive
--        FROM writing_images;
--    兩個都是 0 才可以安心刪。不是 0 的話，先跑一次
--    /api/writing-images-cleanup，或手動在 Storage 刪除。
-- =====================================================

DROP TABLE IF EXISTS writing_images CASCADE;
DROP FUNCTION IF EXISTS writing_images_touch_updated_at();
