-- =====================================================
-- speaking-recordings —— 私有的錄音 bucket
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 只能在真正的 Supabase 專案執行（本機 PostgreSQL 沒有 storage schema）。
--
-- 路徑慣例（與拍照作文一致，也是 speaking_register_recording 驗的那個形狀）：
--   <student_uid>/<recording_id>/<timestamp>.<ext>
--
-- 政策全部釘在第一段資料夾＝自己的 uid 上。學生看得到、放得進自己的資料夾，
-- 看不到別人的。
--
-- 🛑 bucket 是私有的。播放一律靠 signed URL，沒有公開網址可用。
--    錄音是學生的聲音，公開 bucket 等於把它放到網路上。
--
-- 回滾：supabase/migrations/create_speaking_bucket.rollback.sql
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'speaking-recordings',
  'speaking-recordings',
  false,
  20971520,  -- 20 MB。三分鐘的壓縮音訊遠小於此；這是「收不收」的上限
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 學生讀自己的；管理員讀全部
DROP POLICY IF EXISTS "Speaking: read own recordings" ON storage.objects;
CREATE POLICY "Speaking: read own recordings"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'speaking-recordings'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR coalesce(is_admin(), false))
  );

-- 學生只能寫進自己的資料夾
DROP POLICY IF EXISTS "Speaking: upload own recordings" ON storage.objects;
CREATE POLICY "Speaking: upload own recordings"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'speaking-recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 重錄時覆蓋自己的檔案
DROP POLICY IF EXISTS "Speaking: replace own recordings" ON storage.objects;
CREATE POLICY "Speaking: replace own recordings"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'speaking-recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 學生刪自己的。刪了檔案不影響那一列練習紀錄——
-- 清理排程下次掃到「檔案不存在」會當作已刪成功處理。
DROP POLICY IF EXISTS "Speaking: delete own recordings" ON storage.objects;
CREATE POLICY "Speaking: delete own recordings"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'speaking-recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
