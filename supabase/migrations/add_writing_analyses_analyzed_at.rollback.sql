-- 回滾 add_writing_analyses_analyzed_at.sql
--
-- 只移除那一個純量測欄位。分析結果、狀態機、RLS、grants 都不受影響；
-- 移除之後稽核報告會退回舊的 Stage 1 推導方式（拆成兩次請求後會偏高，
-- 因為它會把客戶端往返的空檔算進 Stage 1）。

ALTER TABLE writing_analyses
  DROP COLUMN IF EXISTS analyzed_at;
