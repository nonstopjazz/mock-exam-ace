-- =====================================================
-- Migration: 建立 writing_submissions 表（寫作系統 Phase 1）
--
-- Phase 1 只收「文字作文」。圖片提交、OCR、AI 分析都不在此階段。
-- submission_type 的 CHECK 在 Phase 1 只允許 'text'，Phase 2 才放寬 —— 這讓
-- Phase 1 在結構上不可能收下圖片作文，也就不可能重演舊系統丟棄原圖的問題。
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
-- 設計依據：Essay Data Architecture rev 4
--   · 送出後的提交紀錄不可變（requirement 4）
--   · 五項評分不放在這張表 —— 那是老師撰寫的內容，屬於 Phase 4 的
--     teacher_assessment。放在提交紀錄上正是舊系統讓 AI 覆蓋老師欄位的結構前提。
--   · 沒有 total_score 欄位（L10）：總分於讀取／呈現時推導，不存、不用 trigger。
-- =====================================================

CREATE TABLE IF NOT EXISTS writing_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Phase 2 會放寬為 ('text', 'image')
  submission_type TEXT NOT NULL DEFAULT 'text'
    CHECK (submission_type IN ('text')),

  title TEXT NOT NULL CHECK (char_length(btrim(title)) > 0),
  essay_topic TEXT,
  essay_date DATE NOT NULL DEFAULT CURRENT_DATE,
  student_notes TEXT,

  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SUBMITTED')),
  submitted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT writing_submissions_submitted_has_timestamp CHECK (
    (status = 'SUBMITTED' AND submitted_at IS NOT NULL)
    OR (status = 'DRAFT' AND submitted_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_writing_submissions_student
  ON writing_submissions (student_id, essay_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_writing_submissions_status
  ON writing_submissions (student_id, status);

COMMENT ON TABLE writing_submissions IS
  '學生作文提交紀錄。送出（SUBMITTED）之後即為不可變，內容修改一律以新的一篇提交處理。';
COMMENT ON COLUMN writing_submissions.submission_type IS
  'Phase 1 僅允許 text。Phase 2 放寬為 image 時，同時新增 essay_assets 與 OCR 資料表。';
COMMENT ON COLUMN writing_submissions.status IS
  'DRAFT = 撰寫中，可修改可刪除；SUBMITTED = 已送出，不可變。批改與發布狀態不在這裡，屬於 Phase 4 的 teacher_assessment。';

-- =====================================================
-- 不可變性：送出後禁止修改
--
-- RLS 無法表達「送出前可改、送出後凍結」這種依狀態而異的規則，
-- 因此用 trigger 補上。RLS 擋的是「誰」，trigger 擋的是「什麼時候」。
-- =====================================================

CREATE OR REPLACE FUNCTION writing_submissions_guard_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'SUBMITTED' AND (
       NEW.student_id      IS DISTINCT FROM OLD.student_id
    OR NEW.submission_type IS DISTINCT FROM OLD.submission_type
    OR NEW.title           IS DISTINCT FROM OLD.title
    OR NEW.essay_topic     IS DISTINCT FROM OLD.essay_topic
    OR NEW.essay_date      IS DISTINCT FROM OLD.essay_date
    OR NEW.student_notes   IS DISTINCT FROM OLD.student_notes
    OR NEW.status          IS DISTINCT FROM OLD.status
    OR NEW.submitted_at    IS DISTINCT FROM OLD.submitted_at
  ) THEN
    -- 預設 errcode P0001，PostgREST 會轉成 400 並帶出這段訊息
    RAISE EXCEPTION '已送出的作文不可修改（essay_id=%）', OLD.id;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_writing_submissions_guard_immutable ON writing_submissions;
CREATE TRIGGER trg_writing_submissions_guard_immutable
  BEFORE UPDATE ON writing_submissions
  FOR EACH ROW
  EXECUTE FUNCTION writing_submissions_guard_immutable();

-- =====================================================
-- RLS
--
-- 依賴 create_user_profiles_table.sql 建立的 is_admin()。
-- Phase 1 不開放 admin 的 UPDATE／DELETE —— 此階段還沒有老師這個角色，
-- 給出沒有人需要的權限只會擴大暴露面。
-- =====================================================

ALTER TABLE writing_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Writing: students view own submissions" ON writing_submissions;
CREATE POLICY "Writing: students view own submissions"
  ON writing_submissions FOR SELECT
  USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Writing: admins view all submissions" ON writing_submissions;
CREATE POLICY "Writing: admins view all submissions"
  ON writing_submissions FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "Writing: students insert own submissions" ON writing_submissions;
CREATE POLICY "Writing: students insert own submissions"
  ON writing_submissions FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- USING 限定只有 DRAFT 可以被更新；WITH CHECK 允許新值為 SUBMITTED，
-- 也就是「送出」這個轉換。送出後這條政策就再也選不到該列。
DROP POLICY IF EXISTS "Writing: students update own drafts" ON writing_submissions;
CREATE POLICY "Writing: students update own drafts"
  ON writing_submissions FOR UPDATE
  USING (auth.uid() = student_id AND status = 'DRAFT')
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Writing: students delete own drafts" ON writing_submissions;
CREATE POLICY "Writing: students delete own drafts"
  ON writing_submissions FOR DELETE
  USING (auth.uid() = student_id AND status = 'DRAFT');
