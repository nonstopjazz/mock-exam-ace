-- 回滾：移除課程封面 bucket 的政策。
-- 🛑 刻意【不】刪 bucket 也不刪裡面的檔案——刪了封面就回不來了。
DROP POLICY IF EXISTS "Course covers: admins upload"  ON storage.objects;
DROP POLICY IF EXISTS "Course covers: admins replace" ON storage.objects;
DROP POLICY IF EXISTS "Course covers: admins delete"  ON storage.objects;
