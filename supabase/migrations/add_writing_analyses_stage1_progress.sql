-- =====================================================
-- writing_analyses.stage1_progress
--
-- 為什麼需要這一欄
-- ---------------
-- 驗證重試從「同一次 invocation 裡再打一次」改成「另一次請求」之後，四支 pass
-- 的完成狀態必須跨請求保存下來，否則重試那一次不知道哪些已經好了、哪些要重跑。
--
-- 2026-09-05 的量測顯示這是必要的：偏弱作文的 error 這一支第 1 次跑了 27.8 秒
-- 才驗證失敗，重打又需要約 28 秒，兩者相加超過 50 秒期限；而期限一到，
-- 同批的 competency（19.6 秒）、H1–H3（17.8 秒）、H4–H5（14.3 秒）三支【已經成功】
-- 的結果會隨著 Promise.all 的共用 signal 一起被丟掉，重跑要重新付費。
--
-- 形狀（Stage1Progress，定義在 api/analyze-writing.ts）：
--   {
--     "competency":       { state, attempts, value? , ... },
--     "error":            { state, attempts, lastIssues?, lastRaw?, ... },
--     "high_score_h1_h3": { ... },
--     "high_score_h4_h5": { ... }
--   }
--   state ∈ PENDING / RUNNING / VALID / RETRY_REQUIRED / FAILED
--
--   value   ：這一支已驗證的結果。只有 VALID 時存在，重試請求不會重跑它。
--   lastRaw ：上一次沒過驗證的原始輸出。跨請求重試時餵回去，讓它是「修正」
--             而不是「重寫」。
--   lastIssues：上一次的缺漏清單，用來組修正指示。
--
-- ⚠️ 四軸的 canonical 欄位（competency_analysis / error_analysis /
--    high_score_feature_analysis）只有在四支【全部】VALID 時才寫入，同時進入
--    ANALYZED。stage1_progress 是進行中的暫存，不是分析結果，永不呈現給學生。
--
-- 純新增，沒有任何破壞性操作：
--   • 不改既有欄位、不改既有資料、不改 RLS、不改 grants、不改 trigger
--   • ADD COLUMN IF NOT EXISTS，重複執行是冪等的
--
-- 回滾：supabase/migrations/add_writing_analyses_stage1_progress.rollback.sql
-- =====================================================

ALTER TABLE writing_analyses
  ADD COLUMN IF NOT EXISTS stage1_progress JSONB;

COMMENT ON COLUMN writing_analyses.stage1_progress IS
  'Stage 1 四支 pass 各自的跨請求完成狀態（PENDING/RUNNING/VALID/RETRY_REQUIRED/FAILED）與已驗證結果。重試只重跑非 VALID 的那幾支；已成功的不重跑也不丟棄。進行中的暫存，不是分析結果。';
