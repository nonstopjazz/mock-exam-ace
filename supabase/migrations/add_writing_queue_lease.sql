-- =====================================================
-- Migration: writing_analyses 加上佇列租約欄位
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- 為什麼【不】新開一張 queue 表
-- ----------------------------
-- writing_analyses 本來就是佇列：它已經有 QUEUED → ANALYZING → ANALYZED →
-- COMPLETED / FAILED 的狀態機、有 writing_analyses_one_active_per_essay 這個
-- 唯一部分索引（同一篇同時只能有一筆在飛行中），還有 stage1_progress 讓分析
-- 可以跨請求續跑。再開一張 queue 表等於把同一件事寫兩遍，兩邊遲早會不一致。
--
-- 真正缺的只有一樣：**租約**。
-- 現有的 isStillInFlight() 是拿 started_at 推算的，只在單篇範圍內有效，
-- 撐不起「全域同時只有一篇在分析」這個保證。租約讓「誰現在持有這一列、
-- 持有到什麼時候」變成資料庫裡查得到的事實。
--
-- 欄位
-- ----
--   lease_expires_at  worker 持有到什麼時候。NULL = 沒有人持有，可被認領。
--   lease_worker_id   哪一次 serverless 呼叫持有它。純診斷用。
--   queue_batch_id    這一篇屬於哪一次批次。用來算「11 / 15 完成」。
--   queue_attempts    被認領過幾次。租約過期放回佇列會 +1；用完就收成 FAILED，
--                     這是「不自動無限重試」的上界。
--
-- ⚠️ 這四個欄位只有在 status 非終局（QUEUED / ANALYZING / ANALYZED）時才會被寫。
--    writing_analyses_guard_immutable() 對 COMPLETED / FAILED 的列一律拒絕 UPDATE，
--    所以認領函式永遠不碰終局的列——包含不去「清掉」它們的租約。
--    終局列上殘留的 lease_expires_at 沒有意義，也沒有人會讀它。
--
-- 回滾：supabase/migrations/add_writing_queue_lease.rollback.sql
-- =====================================================

ALTER TABLE writing_analyses
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_worker_id  TEXT,
  ADD COLUMN IF NOT EXISTS queue_batch_id   UUID,
  ADD COLUMN IF NOT EXISTS queue_attempts   INTEGER NOT NULL DEFAULT 0;

-- 既有的列補上 CHECK。ADD CONSTRAINT 沒有 IF NOT EXISTS，所以用 DO block。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.writing_analyses'::regclass
       AND conname  = 'writing_analyses_queue_attempts_sane'
  ) THEN
    ALTER TABLE writing_analyses
      ADD CONSTRAINT writing_analyses_queue_attempts_sane
      CHECK (queue_attempts >= 0);
  END IF;
END;
$$;

COMMENT ON COLUMN writing_analyses.lease_expires_at IS
  'worker 的租約到期時間。NULL 或已過期 = 沒有人在跑這一列，可被重新認領。concurrency = 1 靠這個欄位在資料庫層保證，不是靠前端停用按鈕。';
COMMENT ON COLUMN writing_analyses.lease_worker_id IS
  '持有租約的那一次 serverless 呼叫。診斷用，不參與任何判斷。';
COMMENT ON COLUMN writing_analyses.queue_batch_id IS
  '批次識別。老師一次選 15 篇時這 15 列共用同一個 id，進度「11 / 15」由它算出來。單篇觸發時為 NULL。';
COMMENT ON COLUMN writing_analyses.queue_attempts IS
  '被 worker 認領過幾次。租約過期放回佇列時 +1，達到上限就收成 FAILED——這是自動重試的上界，之後只能由老師明確按「重試失敗項目」。';

-- 認領時要挑「最舊的、沒有人持有的」。部分索引讓終局的列完全不進來。
CREATE INDEX IF NOT EXISTS idx_writing_analyses_claimable
  ON writing_analyses (requested_at)
  WHERE status IN ('QUEUED', 'ANALYZING', 'ANALYZED');

-- 批次進度查詢
CREATE INDEX IF NOT EXISTS idx_writing_analyses_batch
  ON writing_analyses (queue_batch_id)
  WHERE queue_batch_id IS NOT NULL;
