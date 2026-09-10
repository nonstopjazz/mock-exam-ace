-- =====================================================
-- Migration: 放行圖片作文（寫作系統 Phase 2）
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_writing_ocr_runs.sql 與 create_writing_images.sql 之後執行
--    （writing_texts.source_ocr_run_id 的外鍵指向 writing_ocr_runs）。
--
-- Phase 1 的兩個 CHECK 是刻意收緊的：在「保存原圖 + OCR 持久化」還沒做好之前，
-- 資料庫在結構上就不允許收下圖片作文。現在那兩件事都做好了，才放行。
--
--   writing_submissions.submission_type  ('text')  → ('text','image')
--   writing_texts.provenance             ('TYPED') → ('TYPED','OCR','OCR_CORRECTED')
--
-- 這份 migration 不改任何既有資料：現有的作文全部是 text / TYPED，放寬 CHECK
-- 不會動到它們。
-- =====================================================

-- ── 1. submission_type 放寬 ──────────────────────────────────────
--
-- 舊 CHECK 是匿名建立的，Postgres 自動命名為 writing_submissions_submission_type_check。
-- 為了不依賴那個名字，這裡掃出「掛在這張表、定義裡提到 submission_type」的
-- 所有 CHECK 一併移除，再加上具名的新約束。重跑這份 migration 是安全的。
DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'writing_submissions'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%submission_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.writing_submissions DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;

ALTER TABLE writing_submissions
  ADD CONSTRAINT writing_submissions_submission_type_allowed
  CHECK (submission_type IN ('text', 'image'));

COMMENT ON COLUMN writing_submissions.submission_type IS
  'text = 學生打字；image = 拍照上傳後由 OCR 辨識、學生校對。兩者最後都落到 writing_texts。';

-- ── 2. provenance 放寬 ───────────────────────────────────────────
DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'writing_texts'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%provenance%'
  LOOP
    EXECUTE format('ALTER TABLE public.writing_texts DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;

ALTER TABLE writing_texts
  ADD CONSTRAINT writing_texts_provenance_allowed
  CHECK (provenance IN ('TYPED', 'OCR', 'OCR_CORRECTED'));

-- ── 3. 文字從哪一次辨識來的 ──────────────────────────────────────
--
-- ON DELETE SET NULL 而不是 CASCADE：辨識紀錄若消失，作文文字必須留下。
-- 反過來會讓「刪掉一列 log」變成「刪掉學生的作文」。
ALTER TABLE writing_texts
  ADD COLUMN IF NOT EXISTS source_ocr_run_id UUID
  REFERENCES writing_ocr_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_writing_texts_source_ocr_run
  ON writing_texts (source_ocr_run_id) WHERE source_ocr_run_id IS NOT NULL;

COMMENT ON COLUMN writing_texts.provenance IS
  'TYPED = 學生直接打字；OCR = 辨識結果原封不動送出；OCR_CORRECTED = 學生校對時改過。由資料庫比對決定，不由 client 宣稱。';
COMMENT ON COLUMN writing_texts.source_ocr_run_id IS
  '這段文字是從哪一次辨識來的。TYPED 為 NULL。用來比對「機器讀到的」與「學生送出的」差在哪。';

-- ── 4. 圖片草稿不可由學生直接刪除 ────────────────────────────────
--
-- Phase 1 給了學生「刪掉自己的草稿」的政策。對文字作文沒問題，
-- 但圖片作文的列是 Storage 檔案的唯一索引：列一被刪掉（連帶 cascade 掉
-- writing_images），bucket 裡的檔案就再也沒有人找得到，清理工作也掃不到，
-- 等於永久佔用空間。
--
-- 因此圖片草稿改為不可刪 —— 不要的草稿放著，30 天後由清理工作連同檔案一起帶走。
DROP POLICY IF EXISTS "Writing: students delete own drafts" ON writing_submissions;
CREATE POLICY "Writing: students delete own drafts"
  ON writing_submissions FOR DELETE
  USING (
    auth.uid() = student_id
    AND status = 'DRAFT'
    AND submission_type = 'text'
  );
