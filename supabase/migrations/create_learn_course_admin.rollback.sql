-- 回滾：移除影片課程的管理端 RPC（資料一列都不動）
DROP FUNCTION IF EXISTS learn_admin_course_config_set(TEXT, INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS learn_admin_course_config();
DROP FUNCTION IF EXISTS learn_admin_course_access_set(UUID, UUID, UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS learn_admin_course_access(UUID);
DROP FUNCTION IF EXISTS learn_admin_course_outline_save(UUID, JSONB);
DROP FUNCTION IF EXISTS learn_admin_course_save(JSONB);
DROP FUNCTION IF EXISTS learn_admin_course_get(UUID);
