-- =====================================================
-- Rollback: relax_writing_image_checks.sql
--
-- 🔴 staging 與 production 各自執行。
--
-- ⚠️ 收回 CHECK 之前，資料庫裡不能有任何 image / OCR / OCR_CORRECTED 的資料，
--    否則 ALTER TABLE 會直接失敗（那是好事——它擋住了「回滾把學生作文弄不見」）。
--
--    先確認：
--      SELECT count(*) FROM writing_submissions WHERE submission_type = 'image';
--      SELECT count(*) FROM writing_texts WHERE provenance <> 'TYPED';
--    兩個都是 0 才跑得過。不是 0 的話，那些作文得先處理掉，
--    而「處理掉」意味著刪除學生已經送出的內容——請先想清楚。
-- =====================================================

ALTER TABLE writing_texts DROP COLUMN IF EXISTS source_ocr_run_id;

ALTER TABLE writing_texts DROP CONSTRAINT IF EXISTS writing_texts_provenance_allowed;
ALTER TABLE writing_texts
  ADD CONSTRAINT writing_texts_provenance_check CHECK (provenance IN ('TYPED'));

ALTER TABLE writing_submissions DROP CONSTRAINT IF EXISTS writing_submissions_submission_type_allowed;
ALTER TABLE writing_submissions
  ADD CONSTRAINT writing_submissions_submission_type_check CHECK (submission_type IN ('text'));

-- 草稿刪除政策還原成 Phase 1 的樣子（不分 submission_type）
DROP POLICY IF EXISTS "Writing: students delete own drafts" ON writing_submissions;
CREATE POLICY "Writing: students delete own drafts"
  ON writing_submissions FOR DELETE
  USING (auth.uid() = student_id AND status = 'DRAFT');
