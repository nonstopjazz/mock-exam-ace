-- =====================================================
-- Rollback: create_speaking_bucket.sql
--
-- 🔴 先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 刻意【不刪除 bucket】。bucket 裡若還有錄音，刪掉等於刪掉學生的聲音檔，
--    而那是還原一份 migration 不該造成的後果。這裡只移除政策；
--    確定不要那些檔案了，再自己到 Storage 介面刪 bucket。
-- =====================================================

DROP POLICY IF EXISTS "Speaking: delete own recordings" ON storage.objects;
DROP POLICY IF EXISTS "Speaking: replace own recordings" ON storage.objects;
DROP POLICY IF EXISTS "Speaking: upload own recordings" ON storage.objects;
DROP POLICY IF EXISTS "Speaking: read own recordings" ON storage.objects;
