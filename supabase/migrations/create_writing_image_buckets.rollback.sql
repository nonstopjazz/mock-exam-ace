-- =====================================================
-- Rollback: create_writing_image_buckets.sql
--
-- 🔴 staging 與 production 各自執行。
--
-- ⚠️ 這份【只移除政策，不刪 bucket】。
--    bucket 裡若還有檔案，DELETE FROM storage.buckets 會失敗；
--    強行清空等於刪掉學生還在保存期內的作文照片。
--
--    真的要移除 bucket 時，先確認是空的：
--      SELECT bucket_id, count(*) FROM storage.objects
--       WHERE bucket_id IN ('writing-raw','writing-archive') GROUP BY 1;
--    然後才：
--      DELETE FROM storage.buckets WHERE id IN ('writing-raw','writing-archive');
-- =====================================================

DROP POLICY IF EXISTS "Writing: students upload own raw images" ON storage.objects;
DROP POLICY IF EXISTS "Writing: students read own raw images" ON storage.objects;
DROP POLICY IF EXISTS "Writing: students replace own raw images" ON storage.objects;
DROP POLICY IF EXISTS "Writing: students delete own raw images" ON storage.objects;
DROP POLICY IF EXISTS "Writing: students read own archive images" ON storage.objects;
