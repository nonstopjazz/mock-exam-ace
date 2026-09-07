-- =====================================================
-- writing_analyses.analyzed_at
--
-- 為什麼需要這一欄
-- ---------------
-- 分析流程從「一次請求跑完兩個 Stage」拆成兩次請求之後，Stage 1 的結束時間
-- 不再能從既有欄位推導。舊的稽核報告是用
--     (completed_at - started_at) - (synthesis_completed_at - synthesis_started_at)
-- 反推 Stage 1 的，那只在兩個 Stage 同屬一次執行時成立。拆開之後 completed_at
-- 與 started_at 之間還夾著一段客戶端往返的空檔，那個減法會把空檔算進 Stage 1。
--
-- analyzed_at 記錄「四軸全部驗證通過並落地」的那一刻，於是：
--     Stage 1 = analyzed_at - started_at                （純 Stage 1）
--     Stage 2 = synthesis_completed_at - synthesis_started_at
-- 兩段各自對照 50 秒硬性期限，不再互相污染。
--
-- 這份 migration 是純新增，沒有任何破壞性操作：
--   • 不改既有欄位、不改既有資料、不改 RLS、不改 grants、不改 trigger
--   • ADD COLUMN IF NOT EXISTS，重複執行是冪等的
--   • 既有的列 analyzed_at 為 NULL，稽核報告會退回舊的推導方式
--
-- 回滾：supabase/migrations/add_writing_analyses_analyzed_at.rollback.sql
-- =====================================================

ALTER TABLE writing_analyses
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

COMMENT ON COLUMN writing_analyses.analyzed_at IS
  'Stage 1 四軸全部驗證通過並落地的時間。用來把 Stage 1 與 Stage 2 的延遲分開量測——兩次請求之間的客戶端空檔不屬於任何一個 Stage。';
