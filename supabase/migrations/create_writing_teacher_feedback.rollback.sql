-- 回滾 create_writing_teacher_feedback.sql
--
-- 只移除這份 migration 建立的物件。不碰 writing_submissions、writing_analyses、
-- user_profiles、is_admin()。
--
-- ⚠️ 會一併刪除已寫下的老師講評內容。

DROP FUNCTION IF EXISTS writing_teacher_feedback_for(UUID);
DROP FUNCTION IF EXISTS writing_upsert_teacher_feedback(UUID, TEXT);
DROP TRIGGER IF EXISTS writing_teacher_feedback_touch_trigger ON writing_teacher_feedback;
DROP FUNCTION IF EXISTS writing_teacher_feedback_touch();
DROP TABLE IF EXISTS writing_teacher_feedback;
