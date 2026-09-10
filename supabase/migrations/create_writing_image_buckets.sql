-- =====================================================
-- Migration: 兩個私有 Storage bucket（寫作系統 Phase 2 · 拍照上傳）
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 這份 migration 只能在【真正的 Supabase 專案】執行 —— 它動的是 storage schema，
--    本機 PostgreSQL 沒有那個 schema。本機測試會略過這一份。
--
--
-- 為什麼開新的 bucket，而不是沿用既有的 essays / Essays
--
-- 正式專案裡的 essays 與 Essays 兩個 bucket 都是 public = true，
-- 而且 insert/update/delete 政策授予 {authenticated} 卻【沒有 owner 判斷式】——
-- 任何登入者都能覆蓋或刪除別人的作文檔案（PRODUCTION_SCHEMA_AUDIT §9.2、
-- docs/learn/security-followups.md 第 1 項）。裡面還有 iLearn 的 86 筆真實作文。
--
-- 修那兩個 bucket 會動到正在線上的 iLearn 應用，必須與它的維護者一起規劃。
-- 開新 bucket 則讓寫作系統從第一天就是私有的，那個既有問題留在原地，
-- 不會因為這次上線而擴大。
--
--
-- 路徑慣例（兩個 bucket 相同）
--   {student_id}/{essay_id}/{page}-{uuid}.jpg
--    └─ 第一段一定是 uid，policy 的 owner 判斷式才寫得出來
--
-- 存取一律走 signed URL（createSignedUrl），永遠不用 getPublicUrl。
-- =====================================================

-- ── bucket ───────────────────────────────────────────────────────
-- file_size_limit 是最後一道防線：前端擋 10MB、API 擋 10MB，這裡再擋一次。
-- 三層都擋是刻意的——前端可以被繞過，API 可能有 bug，bucket 這層繞不過。

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'writing-raw', 'writing-raw', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'writing-archive', 'writing-archive', false, 5242880,
  ARRAY['image/jpeg']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── writing-raw 的政策 ───────────────────────────────────────────
--
-- 學生：只能在自己的資料夾裡上傳、讀取、刪除。
-- 刪除給學生是因為上傳失敗要能重來；反正原檔本來就是暫存的。

DROP POLICY IF EXISTS "Writing: students upload own raw images" ON storage.objects;
CREATE POLICY "Writing: students upload own raw images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'writing-raw'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Writing: students read own raw images" ON storage.objects;
CREATE POLICY "Writing: students read own raw images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'writing-raw'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR is_admin()
    )
  );

DROP POLICY IF EXISTS "Writing: students replace own raw images" ON storage.objects;
CREATE POLICY "Writing: students replace own raw images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'writing-raw'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Writing: students delete own raw images" ON storage.objects;
CREATE POLICY "Writing: students delete own raw images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'writing-raw'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── writing-archive 的政策 ───────────────────────────────────────
--
-- 學生只能【讀】自己的。封存圖是伺服器產生的，寫入與刪除都只有 service_role
-- （它 BYPASSRLS，不需要政策）。學生若能寫入這個 bucket，
-- 就能在送出後偷換掉「老師看到的那張照片」。

DROP POLICY IF EXISTS "Writing: students read own archive images" ON storage.objects;
CREATE POLICY "Writing: students read own archive images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'writing-archive'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR is_admin()
    )
  );

-- 刻意不建立 writing-archive 的 INSERT / UPDATE / DELETE 政策。

-- ── 驗證用（執行後自己看一眼）─────────────────────────────────────
--   SELECT id, public, file_size_limit FROM storage.buckets
--    WHERE id IN ('writing-raw','writing-archive');
--   → public 必須都是 false
--
--   SELECT policyname, cmd, roles FROM pg_policies
--    WHERE schemaname='storage' AND tablename='objects'
--      AND policyname LIKE 'Writing:%' ORDER BY policyname;
--   → 五條，roles 全部是 {authenticated}
