-- 回滾 create_writing_score_20.sql
-- 🛑 先把 writing_student_essay_cards() 還原（重新執行
--    add_writing_texts_word_count.sql 裡的那一段），再刪這支——
--    順序反了的話卡片列表會因為函式不存在而整個讀不到。
DROP FUNCTION IF EXISTS writing_score_20(JSONB);
