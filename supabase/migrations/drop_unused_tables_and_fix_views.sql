-- ============================================
-- 清除未使用的表和修復 Security Definer Views
-- 執行前請先備份（Supabase Dashboard → Settings → Database → Backups）
-- ============================================

-- 1. 先刪除 Security Definer Views
DROP VIEW IF EXISTS public.exam_statistics CASCADE;
DROP VIEW IF EXISTS public.blog_post_stats CASCADE;

-- 2. 刪除未使用的表（程式碼中均無引用）
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.learning_progress_stats CASCADE;
DROP TABLE IF EXISTS public.vocabulary_sessions CASCADE;
DROP TABLE IF EXISTS public.learning_reminders CASCADE;
DROP TABLE IF EXISTS public.courses CASCADE;
DROP TABLE IF EXISTS public.course_categories CASCADE;
DROP TABLE IF EXISTS public.course_lessons CASCADE;
DROP TABLE IF EXISTS public.user_course_access CASCADE;
DROP TABLE IF EXISTS public.blog_tags CASCADE;
DROP TABLE IF EXISTS public.blog_post_tags CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.parent_notifications CASCADE;
DROP TABLE IF EXISTS public.project_assignment_templates CASCADE;
DROP TABLE IF EXISTS public.project_assignment_distributions CASCADE;
DROP TABLE IF EXISTS public.assignments CASCADE;
DROP TABLE IF EXISTS public.daily_assignment_types CASCADE;
DROP TABLE IF EXISTS public.student_tasks CASCADE;
DROP TABLE IF EXISTS public.user_assignment_status CASCADE;
DROP TABLE IF EXISTS public.assignment_submissions CASCADE;
DROP TABLE IF EXISTS public.quiz_sets CASCADE;
DROP TABLE IF EXISTS public.quiz_questions CASCADE;
DROP TABLE IF EXISTS public.quiz_options CASCADE;
DROP TABLE IF EXISTS public.quiz_fill_answers CASCADE;
DROP TABLE IF EXISTS public.quiz_attempts CASCADE;
DROP TABLE IF EXISTS public.quiz_answers CASCADE;
DROP TABLE IF EXISTS public.quiz_uploads CASCADE;
DROP TABLE IF EXISTS public.exam_types CASCADE;
DROP TABLE IF EXISTS public.exam_records CASCADE;
DROP TABLE IF EXISTS public.special_projects CASCADE;
DROP TABLE IF EXISTS public.user_packs CASCADE;
