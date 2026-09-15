-- =====================================================
-- Rollback: create_learn_feature_access.sql
--
-- 🔴 先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_speaking_rpcs.rollback.sql 之後執行 —— 口說的 RPC 會呼叫
--    learn_feature_enabled()。
--
-- ⚠️ 這會刪掉所有開放紀錄。還原之後沒有任何學生看得到被它守住的功能
--    （管理員仍然看得到）。
-- =====================================================

DROP FUNCTION IF EXISTS learn_admin_set_feature_access(TEXT, UUID, UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS learn_admin_feature_access(TEXT);
DROP FUNCTION IF EXISTS learn_feature_enabled(TEXT);
DROP TABLE IF EXISTS learn_feature_access;
