-- Rollback: create_speaking_rpcs.sql
-- 🔴 先在 gsat-staging 執行並確認，再在 production 執行。
DROP FUNCTION IF EXISTS speaking_mark_deleted(UUID[]);
DROP FUNCTION IF EXISTS speaking_cleanup_candidates(INTEGER);
DROP FUNCTION IF EXISTS speaking_admin_prompts();
DROP FUNCTION IF EXISTS speaking_fail_recording(UUID, TEXT);
DROP FUNCTION IF EXISTS speaking_register_recording(UUID, TEXT, TEXT, BIGINT, INTEGER);
DROP FUNCTION IF EXISTS speaking_start_practice(UUID);
