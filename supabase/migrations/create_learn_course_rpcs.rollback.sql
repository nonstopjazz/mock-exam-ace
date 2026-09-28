-- 回滾：移除影片課程的學生端 RPC（資料表不動）
DROP FUNCTION IF EXISTS learn_lesson_progress_set(UUID, INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS learn_course_detail(UUID);
DROP FUNCTION IF EXISTS learn_course_list();
DROP FUNCTION IF EXISTS learn_course_visible(UUID);
