-- 回滾：刪掉影片課程的五張表。🛑 會連同課程、章節、影片、選課權限與進度一起刪。
DROP TABLE IF EXISTS learn_lesson_progress CASCADE;
DROP TABLE IF EXISTS learn_course_access   CASCADE;
DROP TABLE IF EXISTS learn_course_lessons  CASCADE;
DROP TABLE IF EXISTS learn_course_sections CASCADE;
DROP TABLE IF EXISTS learn_courses         CASCADE;
DROP FUNCTION IF EXISTS learn_courses_touch() CASCADE;
