-- 回滾：移除自動補長度的 RPC。已經填好的 duration_seconds 不動。
DROP FUNCTION IF EXISTS learn_admin_lesson_duration_set(UUID, INTEGER);
