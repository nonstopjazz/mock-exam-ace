-- 回滾：移除 p_as_student，還原成單參數的版本。
DROP FUNCTION IF EXISTS learn_course_detail(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS learn_course_playback(UUID, BOOLEAN);
-- 之後重跑 add_learn_lesson_watch_tracking.sql 還原那兩支。
