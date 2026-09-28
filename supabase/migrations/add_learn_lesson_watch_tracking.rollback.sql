-- 回滾：拿掉自動進度追蹤。🛑 會一併失去每個人已累積的 watched_seconds。
DROP FUNCTION IF EXISTS learn_lesson_progress_set(UUID, INTEGER, BOOLEAN, INTEGER);
ALTER TABLE learn_lesson_progress DROP COLUMN IF EXISTS watched_seconds;
ALTER TABLE learn_courses DROP COLUMN IF EXISTS require_watch;
DROP FUNCTION IF EXISTS learn_watch_complete_ratio();
-- 之後重跑 create_learn_course_rpcs.sql 與 create_learn_course_admin.sql 還原舊版
