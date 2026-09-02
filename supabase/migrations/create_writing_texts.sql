-- =====================================================
-- Migration: 建立 writing_texts 表（寫作系統 Phase 1）
--
-- writing_texts 是「正規作文文字」—— 未來 AI evidence 的字元位移都以它為基準。
--
-- 兩條合法的輸入路徑（rev 4 決策 L9）：
--   文字提交 ─────────────────────────▸ writing_texts  provenance = TYPED
--   圖片提交 ─▸ assets ─▸ ocr_run ────▸ writing_texts  provenance = OCR
-- 文字作文「不會」被造出一筆什麼都沒辨識的假 OCR run。
--
-- 為什麼是 append-only：
--   evidence span 以字元位移指向這段文字。若文字可以就地修改，所有既有的
--   span 會靜默指向錯誤的字，而且不會有任何錯誤訊息。因此修正 = 插入新的一列，
--   舊 evidence 仍然掛在它當初真正讀到的那一版文字上。
--   「目前的文字」= 同一篇作文最新的一列，於讀取時推導，不存旗標。
--
--
-- ⚠️ 為什麼是 writing_ 前綴，不是 essay_
--
-- 正式環境的 Supabase 專案（ytzspnjmkvrkbztnaomm）是 mock 與 iLearn 共用的。
-- iLearn 在同一個資料庫裡已經有 essay_submissions 這張表，以及
-- 「Students can view own essays」「Admins can view all essays」
-- 「Students can insert own essays」這三個同名的 RLS 政策。
--
-- 若沿用 essay_ 命名，把這份 migration 套到正式專案會「安靜地跑完而不報錯」，
-- 結果是：mock 的表根本沒被建立（CREATE TABLE IF NOT EXISTS 略過），
-- 而後續的索引、trigger 與 RLS 政策全部落到 iLearn 的正式資料表上，
-- 並覆蓋掉它既有的政策。已在本機 PostgreSQL 16 重現確認。
--
-- 因此寫作系統的所有物件一律使用 writing_ 前綴，政策名稱一律加上
-- 「Writing:」開頭。請不要把它們改回 essay_。
--
-- Phase 1 的 CHECK 只允許 'TYPED'。Phase 2 會放寬並加上 source_ocr_run_id
-- （現在還不能加，因為 essay_ocr_runs 這張表要到 Phase 2 才存在）。
-- =====================================================

CREATE TABLE IF NOT EXISTS writing_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  essay_id UUID NOT NULL REFERENCES writing_submissions(id) ON DELETE CASCADE,

  -- 原樣保存，不做任何 trim 或正規化：字元位移必須對得上學生真正寫下的內容
  content TEXT NOT NULL CHECK (char_length(content) > 0),

  -- Phase 2 會放寬為 ('TYPED', 'OCR', 'OCR_CORRECTED')
  provenance TEXT NOT NULL CHECK (provenance IN ('TYPED')),

  -- 由資料庫計算，不信任 client
  char_count INTEGER GENERATED ALWAYS AS (char_length(content)) STORED,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 推導「目前文字」用
CREATE INDEX IF NOT EXISTS idx_writing_texts_current
  ON writing_texts (essay_id, created_at DESC);

COMMENT ON TABLE writing_texts IS
  '正規作文文字，append-only。AI evidence 的字元位移以此為基準，因此永不就地修改；修正一律插入新列。';
COMMENT ON COLUMN writing_texts.provenance IS
  'TYPED = 學生直接打字；OCR = 由 OCR run 產生（Phase 2）；OCR_CORRECTED = 人工修正過的辨識結果（Phase 4）。';
COMMENT ON COLUMN writing_texts.content IS
  '未經 trim 或正規化的原始文字。任何清理都會讓字元位移與學生實際寫下的內容產生偏移。';

-- =====================================================
-- Append-only：禁止 UPDATE
--
-- 只擋 UPDATE，不擋 DELETE。原因：writing_submissions 的 ON DELETE CASCADE
-- 會觸發本表的 row trigger，若這裡擋 DELETE，連帶刪除會直接失敗，
-- 學生也就永遠刪不掉自己的作文。直接刪除改由 RLS 擋 —— 本表沒有 DELETE 政策，
-- 而 cascade 是系統操作，不受 RLS 限制。
-- =====================================================

CREATE OR REPLACE FUNCTION writing_texts_guard_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'writing_texts 為 append-only，不可修改（id=%）。修正請插入新的一列。', OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS trg_writing_texts_guard_append_only ON writing_texts;
CREATE TRIGGER trg_writing_texts_guard_append_only
  BEFORE UPDATE ON writing_texts
  FOR EACH ROW
  EXECUTE FUNCTION writing_texts_guard_append_only();

-- =====================================================
-- RLS
-- =====================================================

ALTER TABLE writing_texts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Writing: students view own texts" ON writing_texts;
CREATE POLICY "Writing: students view own texts"
  ON writing_texts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM writing_submissions e
    WHERE e.id = writing_texts.essay_id AND e.student_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Writing: admins view all texts" ON writing_texts;
CREATE POLICY "Writing: admins view all texts"
  ON writing_texts FOR SELECT
  USING (is_admin());

-- 只能在自己的、尚未送出的作文上寫入文字
DROP POLICY IF EXISTS "Writing: students insert own texts" ON writing_texts;
CREATE POLICY "Writing: students insert own texts"
  ON writing_texts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM writing_submissions e
    WHERE e.id = writing_texts.essay_id
      AND e.student_id = auth.uid()
      AND e.status = 'DRAFT'
  ));

-- 刻意不建立 UPDATE / DELETE 政策。

-- =====================================================
-- submit_writing_essay() —— 一次交易完成整個送出流程
--
-- 若讓 client 分三次呼叫（建立草稿 → 寫入文字 → 標記送出），任何一步失敗都會
-- 留下半完成的狀態。包成一個函式後，整段是一個交易，全成或全不成。
--
-- SECURITY INVOKER（預設）：RLS 仍然生效，本函式沒有繞過任何權限檢查。
-- =====================================================

CREATE OR REPLACE FUNCTION submit_writing_essay(
  p_title         TEXT,
  p_content       TEXT,
  p_essay_topic   TEXT DEFAULT NULL,
  p_essay_date    DATE DEFAULT NULL,
  p_student_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid UUID;
  v_essay_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  IF p_title IS NULL OR char_length(btrim(p_title)) = 0 THEN
    RAISE EXCEPTION '請輸入作文標題' USING ERRCODE = '22023';
  END IF;

  IF p_content IS NULL OR char_length(btrim(p_content)) = 0 THEN
    RAISE EXCEPTION '請輸入作文內容' USING ERRCODE = '22023';
  END IF;

  INSERT INTO writing_submissions (
    student_id, submission_type, title, essay_topic, essay_date, student_notes, status
  ) VALUES (
    v_uid,
    'text',
    btrim(p_title),
    nullif(btrim(coalesce(p_essay_topic, '')), ''),
    coalesce(p_essay_date, CURRENT_DATE),
    nullif(btrim(coalesce(p_student_notes, '')), ''),
    'DRAFT'
  )
  RETURNING id INTO v_essay_id;

  -- content 刻意不 trim
  INSERT INTO writing_texts (essay_id, content, provenance, created_by)
  VALUES (v_essay_id, p_content, 'TYPED', v_uid);

  UPDATE writing_submissions
     SET status = 'SUBMITTED', submitted_at = now()
   WHERE id = v_essay_id;

  RETURN v_essay_id;
END;
$$;

COMMENT ON FUNCTION submit_writing_essay IS
  '在單一交易中建立文字作文：草稿 → 正規文字 → 送出。SECURITY INVOKER，RLS 全程生效。';

GRANT EXECUTE ON FUNCTION submit_writing_essay(TEXT, TEXT, TEXT, DATE, TEXT) TO authenticated;
