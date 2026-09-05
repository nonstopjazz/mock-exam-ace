-- 回滾 add_writing_analyses_stage1_progress.sql
--
-- 只移除跨請求的進度欄位。已完成分析的 canonical 三軸不受影響；
-- 移除之後正在進行中（ANALYZING）的分析會失去進度，必須整個重跑。

ALTER TABLE writing_analyses
  DROP COLUMN IF EXISTS stage1_progress;
