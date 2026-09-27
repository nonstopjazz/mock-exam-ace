-- 回滾 create_reading_shuffle_2_fetch.sql
-- 🛑 先 DROP 兩個參數的版本，再重新執行 create_reading_feature_gate_1_fetch.sql
--    （那支是亂序之前的最新版本：有開放控制、沒有 p_session_id）。
--    只 DROP 不重建的話，學生端會完全取不到題。
DROP FUNCTION IF EXISTS reading_get_passage(TEXT, UUID);
