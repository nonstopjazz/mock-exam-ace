-- =====================================================
-- Rollback: create_writing_image_rpcs.sql
--
-- 🔴 staging 與 production 各自執行。
--
-- 只移除函式。資料不受影響——已經送出的拍照作文照樣讀得到，
-- 只是不能再建立新的（前端的 writing_images 旗標也要一起關掉）。
-- =====================================================

DROP FUNCTION IF EXISTS create_writing_image_draft(TEXT, TEXT, DATE, TEXT);
DROP FUNCTION IF EXISTS register_writing_image(UUID, INTEGER, TEXT, BIGINT, TEXT);
DROP FUNCTION IF EXISTS submit_writing_image_essay(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS writing_images_cleanup_candidates(TEXT, INTEGER);
DROP FUNCTION IF EXISTS writing_images_mark_deleted(UUID[], TEXT);
