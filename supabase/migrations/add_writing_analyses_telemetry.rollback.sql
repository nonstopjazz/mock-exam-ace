-- 回滾 add_writing_analyses_telemetry.sql
--
-- 只移除那兩個量測欄位。分析結果、狀態機、RLS、grants 都不受影響；
-- 移除之後就回到「驗證重試與期限中斷在資料庫裡不可見」的狀態。

ALTER TABLE writing_analyses
  DROP COLUMN IF EXISTS stage1_telemetry,
  DROP COLUMN IF EXISTS synthesis_telemetry;
