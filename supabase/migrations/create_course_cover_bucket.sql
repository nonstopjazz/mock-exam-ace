-- =====================================================
-- 課程封面的 Storage bucket 與政策
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 這份只能在【真正的 Supabase 專案】執行——它動的是 storage schema，
--    本機 PostgreSQL 沒有那個 schema，所以本機測試會略過這一份。
--
--
-- 【為什麼要這一份，Dashboard 建好 bucket 還不夠】
--
--   storage.objects 有 RLS，而且預設是【什麼都不准】。在 Dashboard 按下
--   Create bucket 只會建出一個誰都寫不進去的桶子——管理端按上傳會失敗，
--   訊息是 "new row violates row-level security policy"，看起來像程式壞了。
--
--   ON CONFLICT DO UPDATE：已經手動建過也沒關係，這份會把大小與格式限制補上。
--
--
-- 🛑 只有管理員能寫
--
--   封面是 public bucket，讀取走 CDN 不經過 RLS。但寫入不能放給所有登入者——
--   那等於任何學生都能把課程封面換成任何 2MB 的圖片，而且是公開網址。
--
-- 🛑 不建立 SELECT 政策
--
--   public = true 的 bucket，getPublicUrl 那條路徑本來就不過 RLS。
--   多開一條讀取政策不會讓畫面多看到什麼，只是多一個要維護的授權面。
--
--
-- 【為什麼是 2MB 與這三種格式】
--
--   封面顯示寬度約 429px（容器 1400 扣掉 padding 與格線，三欄），
--   高解析螢幕 2 倍是 858px。1280×720 的 JPG 大約 150–300KB，2MB 很寬裕。
--
--   🛑 沒有 image/svg+xml。SVG 可以內嵌 <script>，而這是一個公開可讀的
--      bucket——等於開一個任何人都打得開的網址放可執行內容。封面是照片，
--      沒有任何理由需要 SVG。
--
-- 回滾：supabase/migrations/create_course_cover_bucket.rollback.sql
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-covers', 'course-covers', true, 2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;


DROP POLICY IF EXISTS "Course covers: admins upload" ON storage.objects;
CREATE POLICY "Course covers: admins upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'course-covers' AND coalesce(is_admin(), false));

DROP POLICY IF EXISTS "Course covers: admins replace" ON storage.objects;
CREATE POLICY "Course covers: admins replace"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'course-covers' AND coalesce(is_admin(), false));

-- 換封面時要把舊檔刪掉，否則 bucket 會慢慢堆滿沒人用的圖
DROP POLICY IF EXISTS "Course covers: admins delete" ON storage.objects;
CREATE POLICY "Course covers: admins delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'course-covers' AND coalesce(is_admin(), false));


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT
  (SELECT public FROM storage.buckets WHERE id = 'course-covers')            AS "public（應為 true）",
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'course-covers')   AS "大小上限（應為 2097152）",
  (SELECT array_to_string(allowed_mime_types, ', ')
     FROM storage.buckets WHERE id = 'course-covers')                        AS "允許的格式",
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname LIKE 'Course covers:%')                                 AS "政策數（應為 3）",
  -- 🛑 SVG 絕對不可以在清單裡
  (SELECT 'image/svg+xml' = ANY(allowed_mime_types)
     FROM storage.buckets WHERE id = 'course-covers')                        AS "🛑 允許 SVG（必須為 false）";
