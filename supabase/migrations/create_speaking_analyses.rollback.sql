-- 回滾 create_speaking_analyses.sql
--
-- 🛑 這會刪掉所有的口說批改結果。已經批改過的錄音會退回「還沒批改」，
--    而那些分數是真的花錢換來的。錄音本身（speaking_recordings）不受影響。

DROP TRIGGER IF EXISTS trg_speaking_analyses_touch ON speaking_analyses;
DROP TABLE IF EXISTS speaking_analyses;
