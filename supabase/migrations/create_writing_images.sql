-- =====================================================
-- Migration: 建立 writing_images 表（寫作系統 Phase 2 · 拍照上傳）
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_writing_ocr_runs.sql 之後執行。
--
-- 一頁一列。同一頁的「手機原檔」與「正規化封存圖」是同一件事的兩個階段，
-- 所以放同一列 —— 拆兩張表的話，「這一頁現在還剩什麼檔案」要 join 才答得出來。
--
-- 保存策略（產品決策，2026-09）：
--   原檔     暫存。條件滿足後的下一次清理即刪除，通常送出後 24 小時內。
--   封存圖   送出後 60 天，到期自動刪除。
--   本表的列 永久保留 —— 圖片刪了，頁序與尺寸紀錄還在。
--
-- 圖片消失之後這篇作文仍然完整可用：報告、評語、字數、AI 分析讀的都是
-- writing_texts 的文字，沒有一項依賴圖片。
-- =====================================================

CREATE TABLE IF NOT EXISTS writing_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  essay_id UUID NOT NULL REFERENCES writing_submissions(id) ON DELETE CASCADE,

  -- 從 1 開始。上限 5 頁與前端一致；放在 CHECK 是為了讓「多傳一頁」在資料庫就被擋下。
  page_number INTEGER NOT NULL CHECK (page_number BETWEEN 1 AND 5),

  -- ── 手機原檔（暫存）────────────────────────────────
  raw_path TEXT,
  raw_bytes BIGINT CHECK (raw_bytes IS NULL OR raw_bytes >= 0),
  raw_mime TEXT,
  raw_uploaded_at TIMESTAMPTZ,
  raw_deleted_at TIMESTAMPTZ,

  -- ── 正規化封存圖（60 天）──────────────────────────
  archive_path TEXT,
  archive_bytes BIGINT CHECK (archive_bytes IS NULL OR archive_bytes >= 0),
  archive_width INTEGER CHECK (archive_width IS NULL OR archive_width > 0),
  archive_height INTEGER CHECK (archive_height IS NULL OR archive_height > 0),
  archive_created_at TIMESTAMPTZ,
  -- 有值 = 產生之後真的讀得回來、尺寸也解析得出。刪原檔的前提之一。
  archive_verified_at TIMESTAMPTZ,
  archive_deleted_at TIMESTAMPTZ,

  -- ── 生命週期 ─────────────────────────────────────
  state TEXT NOT NULL DEFAULT 'UPLOADED'
    CHECK (state IN ('UPLOADED', 'NORMALIZED', 'NORMALIZE_FAILED')),
  error_code TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT writing_images_unique_page UNIQUE (essay_id, page_number),

  -- NORMALIZED 一定有封存圖；沒有封存圖就不可能是 NORMALIZED
  CONSTRAINT writing_images_normalized_has_archive CHECK (
    state <> 'NORMALIZED' OR archive_path IS NOT NULL
  ),
  CONSTRAINT writing_images_failed_has_reason CHECK (
    state <> 'NORMALIZE_FAILED' OR error_code IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_writing_images_essay
  ON writing_images (essay_id, page_number);

-- 清理工作用：只掃還沒刪掉的
CREATE INDEX IF NOT EXISTS idx_writing_images_raw_alive
  ON writing_images (essay_id) WHERE raw_path IS NOT NULL AND raw_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_writing_images_archive_alive
  ON writing_images (essay_id) WHERE archive_path IS NOT NULL AND archive_deleted_at IS NULL;

COMMENT ON TABLE writing_images IS
  '拍照作文的影像頁。列本身永久保留；檔案有保存期限——原檔約 1 天（上限 7 天），封存圖為送出後 60 天。';
COMMENT ON COLUMN writing_images.raw_deleted_at IS
  '有值表示手機原檔已由清理工作刪除。這是正常結果，不是錯誤。';
COMMENT ON COLUMN writing_images.archive_deleted_at IS
  '有值表示封存圖已過 60 天保存期並刪除。作文本身仍然完整——文字與批改不依賴圖片。';
COMMENT ON COLUMN writing_images.archive_verified_at IS
  '封存圖產生後實際讀回並解析成功的時間。沒有這個時間戳就不准刪原檔。';

-- =====================================================
-- updated_at 自動更新
-- =====================================================

CREATE OR REPLACE FUNCTION writing_images_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_writing_images_touch ON writing_images;
CREATE TRIGGER trg_writing_images_touch
  BEFORE UPDATE ON writing_images
  FOR EACH ROW
  EXECUTE FUNCTION writing_images_touch_updated_at();

-- =====================================================
-- RLS
--
-- 學生：在自己尚未送出的作文上登記頁面、讀自己的。
-- 【沒有 UPDATE 政策，也沒有 DELETE 政策】—— archive_* 與 state 一律由伺服器（service_role）寫入。
-- 學生若能自己把 state 改成 NORMALIZED，就能繞過「所有頁都處理成功才能送出」的把關。
-- =====================================================

ALTER TABLE writing_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Writing: students view own images" ON writing_images;
CREATE POLICY "Writing: students view own images"
  ON writing_images FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM writing_submissions e
    WHERE e.id = writing_images.essay_id AND e.student_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Writing: admins view all images" ON writing_images;
CREATE POLICY "Writing: admins view all images"
  ON writing_images FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "Writing: students insert own draft images" ON writing_images;
CREATE POLICY "Writing: students insert own draft images"
  ON writing_images FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM writing_submissions e
    WHERE e.id = writing_images.essay_id
      AND e.student_id = auth.uid()
      AND e.status = 'DRAFT'
  ));

-- 刻意【不】給 DELETE 政策。
--
-- 若學生能自己刪掉 writing_images 的列，Storage 裡的檔案就失去了唯一一份索引，
-- 清理工作再也找不到它們 —— 那些檔案會永遠留在 bucket 裡。
-- 「重新開始」的作法是開一篇新草稿，舊草稿 30 天後由清理工作連同檔案一起帶走。
--
REVOKE ALL ON TABLE writing_images FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE writing_images TO authenticated;
GRANT ALL ON TABLE writing_images TO service_role;
