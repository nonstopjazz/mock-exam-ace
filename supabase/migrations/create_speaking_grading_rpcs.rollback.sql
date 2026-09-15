-- 回滾 create_speaking_grading_rpcs.sql
DROP FUNCTION IF EXISTS speaking_my_practices(INTEGER);
DROP FUNCTION IF EXISTS speaking_admin_grading_queue(TEXT, INTEGER);
DROP FUNCTION IF EXISTS speaking_grading_summary();
DROP FUNCTION IF EXISTS speaking_grading_fail(UUID, TEXT, BOOLEAN, INTEGER);
DROP FUNCTION IF EXISTS speaking_grading_complete(UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS speaking_grading_claim(TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS speaking_enqueue_grading_batch(UUID[]);
DROP FUNCTION IF EXISTS speaking_daily_grading_used();
DROP FUNCTION IF EXISTS speaking_daily_grading_cap();
