-- Rollback: create_speaking_prompts.sql
-- 🔴 先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_speaking_recordings.rollback.sql 之後執行（那張表的外鍵指向這裡）。
-- ⚠️ 這會刪掉整個題庫。
DROP FUNCTION IF EXISTS speaking_admin_upsert_prompt(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, INTEGER);
DROP FUNCTION IF EXISTS speaking_available_prompts(INTEGER);
DROP TABLE IF EXISTS speaking_prompts;
