-- =====================================================
-- Six-Way Reading 匯入（1／4）：批次紀錄
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_reading_passages.sql。
--
-- 🛑 這張表【不存題目全文，也不存答案】。
--    它是操作紀錄：誰、什麼時候、用哪個檔案、匯了幾篇、幾篇被擋。
--    把內容複製一份進 log，等於多一個會外洩答案的地方，
--    而且那一份永遠不會跟正本同步。
--
-- 一個批次可以由多次 RPC 呼叫累加（瀏覽器分批送，每批 25 篇），
-- 所以 counts 是累加的，status 只有在最後一批才變 COMPLETED。
--
-- 回滾：supabase/migrations/create_reading_import_1_batches.rollback.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS reading_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  filename TEXT NOT NULL CHECK (length(btrim(filename)) > 0),
  admin_id UUID NOT NULL REFERENCES auth.users(id),

  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,

  total_count    INTEGER NOT NULL DEFAULT 0 CHECK (total_count    >= 0),
  imported_count INTEGER NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  skipped_count  INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count  >= 0),
  conflict_count INTEGER NOT NULL DEFAULT 0 CHECK (conflict_count >= 0),
  -- 🛑 blocked 與 failed 分開數。blocked 是【資料本身沒有題目】（可預期、
  --    要拿回去重新產製）；failed 是【這一篇丟了例外】（程式或格式問題）。
  --    混在一起數，匯入報告就永遠分不出「題庫缺料」和「匯入壞了」。
  blocked_count  INTEGER NOT NULL DEFAULT 0 CHECK (blocked_count  >= 0),
  failed_count   INTEGER NOT NULL DEFAULT 0 CHECK (failed_count   >= 0),

  status TEXT NOT NULL DEFAULT 'IN_PROGRESS'
         CHECK (status IN ('IN_PROGRESS','COMPLETED','ABORTED')),

  CONSTRAINT reading_import_batches_completed_has_time CHECK (
    (status = 'IN_PROGRESS' AND completed_at IS NULL)
    OR (status <> 'IN_PROGRESS' AND completed_at IS NOT NULL)
  )
);

COMMENT ON TABLE reading_import_batches IS
  '匯入的操作紀錄。🛑 刻意不存題目全文與答案——多存一份只是多一個外洩點，而且永遠不會跟正本同步。';

CREATE INDEX IF NOT EXISTS reading_import_batches_admin_idx
  ON reading_import_batches (admin_id, started_at DESC);


-- ── 權限 ──────────────────────────────────────────────
-- 🛑 學生完全看不到匯入紀錄。管理員也只能讀，寫入一律經過 RPC。
REVOKE ALL ON reading_import_batches FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON reading_import_batches TO authenticated;
GRANT ALL    ON reading_import_batches TO service_role;

ALTER TABLE reading_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reading_import_batches_admin_read ON reading_import_batches;
CREATE POLICY reading_import_batches_admin_read ON reading_import_batches
  FOR SELECT TO authenticated
  USING (coalesce(public.is_admin(), false));

DROP POLICY IF EXISTS reading_import_batches_service_all ON reading_import_batches;
CREATE POLICY reading_import_batches_service_all ON reading_import_batches
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT c.relname,
       c.relrowsecurity AS "RLS 開啟",
       has_table_privilege('authenticated', c.oid, 'SELECT') AS "登入者可讀",
       has_table_privilege('authenticated', c.oid, 'INSERT') AS "登入者可寫"
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname='public' AND c.relname = 'reading_import_batches';
