-- 回滾 add_reading_question_target.sql
-- 🛑 先把 reading_get_passage 還原（重新執行 create_reading_shuffle_2_fetch.sql，
--    那是加 anchor 之前的最新版本），再刪欄位。順序反了學生端會取不到題。
ALTER TABLE reading_questions DROP CONSTRAINT IF EXISTS reading_questions_target_pair;
ALTER TABLE reading_questions DROP COLUMN IF EXISTS target_occurrence;
ALTER TABLE reading_questions DROP COLUMN IF EXISTS target_text;
