-- 回滾 create_learn_classes_tasks.sql
--
-- 只移除這份 migration 建立的物件。不碰 writing_*、packs、exam_*、
-- user_profiles、premium_memberships、is_admin()。
--
-- ⚠️ 會一併刪除所有班級、名冊、任務、指派與打卡紀錄。

DROP FUNCTION IF EXISTS learn_student_log_recurring(UUID, DATE, INTEGER);
DROP FUNCTION IF EXISTS learn_student_report_task(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS learn_student_tasks();
DROP FUNCTION IF EXISTS learn_admin_class_detail(UUID);
DROP FUNCTION IF EXISTS learn_admin_check_task_bulk(UUID, TEXT);
DROP FUNCTION IF EXISTS learn_admin_check_task(UUID, UUID, TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS learn_admin_archive_task(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS learn_admin_upsert_task(UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, INTEGER, UUID[]);
DROP FUNCTION IF EXISTS learn_admin_remove_class_member(UUID, UUID);
DROP FUNCTION IF EXISTS learn_admin_add_class_members(UUID, UUID[]);
DROP FUNCTION IF EXISTS learn_admin_search_students(TEXT, UUID);
DROP FUNCTION IF EXISTS learn_admin_set_next_class_date(UUID, DATE);
DROP FUNCTION IF EXISTS learn_admin_archive_class(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS learn_admin_upsert_class(UUID, TEXT, DATE, TEXT);
DROP FUNCTION IF EXISTS learn_admin_classes(BOOLEAN);

DROP TRIGGER IF EXISTS learn_task_logs_touch      ON learn_task_logs;
DROP TRIGGER IF EXISTS learn_task_assignees_touch ON learn_task_assignees;
DROP TRIGGER IF EXISTS learn_tasks_touch          ON learn_tasks;
DROP TRIGGER IF EXISTS learn_classes_touch        ON learn_classes;

DROP TABLE IF EXISTS learn_task_logs;
DROP TABLE IF EXISTS learn_task_assignees;
DROP TABLE IF EXISTS learn_tasks;
DROP TABLE IF EXISTS learn_class_members;
DROP TABLE IF EXISTS learn_classes;

DROP FUNCTION IF EXISTS learn_require_admin(TEXT);
DROP FUNCTION IF EXISTS learn_period_start(TEXT, DATE);
DROP FUNCTION IF EXISTS learn_display_name(UUID);
DROP FUNCTION IF EXISTS learn_today();
DROP FUNCTION IF EXISTS learn_touch_updated_at();
