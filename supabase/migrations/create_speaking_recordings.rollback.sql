-- Rollback: create_speaking_recordings.sql
-- 🔴 先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_speaking_rpcs.rollback.sql 之後執行。
-- ⚠️ 這會刪掉所有練習紀錄。Storage 裡的錄音檔【不會】被刪除，
--    而且刪掉這張表之後就再也沒有人找得到它們了——
--    若要一併清掉，先在 Storage 介面處理完再跑這一份。
DROP TABLE IF EXISTS speaking_recordings;
