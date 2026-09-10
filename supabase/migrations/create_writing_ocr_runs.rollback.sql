-- =====================================================
-- Rollback: create_writing_ocr_runs.sql
--
-- 🔴 staging 與 production 各自執行。
--
-- ⚠️ 這會刪掉所有辨識紀錄，包含【機器原本讀到的文字】(raw_text)。
--    學生送出的正式文字在 writing_texts，不會受影響；但「機器讀到的」與
--    「學生改成的」之間的對照就永久消失了。
--
-- writing_texts.source_ocr_run_id 的外鍵會一併被移除（DROP TABLE ... CASCADE
-- 移除的是約束，不是欄位）。欄位本身留著，值變成孤兒 id。
-- 若要連欄位一起還原，跑 relax_writing_image_checks.rollback.sql。
-- =====================================================

DROP TABLE IF EXISTS writing_ocr_runs CASCADE;
DROP FUNCTION IF EXISTS writing_ocr_runs_guard_final();
