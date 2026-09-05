-- =====================================================
-- writing_analyses.stage1_telemetry / synthesis_telemetry
--
-- 為什麼需要這兩欄
-- ---------------
-- 2026-09-05 的偏弱作文 502 診斷卡住，是因為資料庫裡沒有任何可用的量測：
--
--   • attempt_count 是寫死的常數 1，從來沒有反映真實嘗試次數。
--     所以「這次有沒有發生驗證重試」在資料庫裡查不到——那次 Vercel trace 顯示
--     5 次 DeepSeek 呼叫、Stage 1 卻只有 4 支 pass，多出來的那一次完全不可見。
--   • 被中斷的那一次呼叫，telemetry 停在 latencyMs 0 / httpStatus 0，
--     所以「被砍之前它跑了多久」也查不到。
--   • 失敗時只留最後一次的 validation_issues。attempt 1 驗證失敗、attempt 2
--     撞上期限時，attempt 2 的空陣列會把 attempt 1 的缺漏清單蓋掉，
--     於是「為什麼要重試」永遠查不到。
--
-- 這兩欄是結構化的逐支、逐次紀錄，取代那三個盲點。用 JSONB 而不是一堆單一用途
-- 的欄位，是因為量測的形狀還會隨診斷需要調整，不該每次都動 schema。
--
-- 形狀（PassTelemetry，定義在 api/_lib/deepseek.ts）：
--   stage1_telemetry = {
--     "competency":       { label, attempts, totalLatencyMs, finalOutcome,
--                           retried, hitDeadline, detail, records: [...] },
--     "error":            { ... },
--     "high_score_h1_h3": { ... },
--     "high_score_h4_h5": { ... }
--   }
--   records[n] = { attempt, isRepair, offsetMs, latencyMs, outcome, detail,
--                  httpStatus, promptTokens, completionTokens, totalTokens,
--                  responseChars, shape, issueCount, issues }
--
--   outcome ∈ OK / VALIDATION_FAILED / DEADLINE / ABORTED / HTTP_ERROR /
--             MALFORMED_JSON / NO_CONTENT / NETWORK_ERROR
--
-- 純新增，沒有任何破壞性操作：
--   • 不改既有欄位、不改既有資料、不改 RLS、不改 grants、不改 trigger
--   • ADD COLUMN IF NOT EXISTS，重複執行是冪等的
--   • 既有的列這兩欄為 NULL，稽核報告會說「此列在加入量測之前產生」
--
-- 回滾：supabase/migrations/add_writing_analyses_telemetry.rollback.sql
-- =====================================================

ALTER TABLE writing_analyses
  ADD COLUMN IF NOT EXISTS stage1_telemetry JSONB,
  ADD COLUMN IF NOT EXISTS synthesis_telemetry JSONB;

COMMENT ON COLUMN writing_analyses.stage1_telemetry IS
  'Stage 1 四支 pass 各自的逐次嘗試紀錄（PassTelemetry）。attempts 是量測值不是常數；每一次嘗試各自保留自己的 validation issues，後面的嘗試不會覆蓋前面的；被我們自己的 50 秒期限中斷會記為 outcome = DEADLINE。';
COMMENT ON COLUMN writing_analyses.synthesis_telemetry IS
  '綜合層的逐次嘗試紀錄，形狀與 stage1_telemetry 的單一 pass 相同。';
