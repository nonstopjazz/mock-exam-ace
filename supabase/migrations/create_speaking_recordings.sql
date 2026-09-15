-- =====================================================
-- speaking_recordings —— 一次口說練習
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_speaking_prompts.sql 之後執行（外鍵指向它）。
--
--
-- 保存策略（產品決策）
--
--   錄音檔  90 天，到期自動刪除
--   這一列  永久保留 —— 檔案刪了，練了幾次、練了哪些題、什麼時候練的都還在
--
--   90 天而不是作文那邊的 60 天：口說的價值有一半在「回頭聽自己一個月前的樣子」。
--   兩分鐘的錄音約 1–2 MB，100 人每週一次、存 90 天約 2–3 GB —— 與拍照作文同量級，
--   而且同樣不隨年份成長。
--
--   🛑 沒有成功上傳的不算數，也刪不到 —— 清理只看 storage_path 有值的列。
--
--
-- 這一批【不做】AI 批改
--
--   ai_* 欄位刻意先不建。下一批要接 Gemini 時再用一份 additive migration 加，
--   那時才知道確切要存什麼形狀。現在先開一堆空欄位，只會在下一批被改掉一次——
--   而中間這段時間，任何人讀 schema 都會以為那些欄位有意義。
--
--   status 已經留了 'GRADED' 這個值：下一批不必改 CHECK。
--
-- 回滾：supabase/migrations/create_speaking_recordings.rollback.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS speaking_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 題目停用或被改寫都不影響既有練習；題目真的被刪才會變 NULL。
  -- 所以下面另外存了一份當下的題目文字快照。
  prompt_id UUID REFERENCES speaking_prompts(id) ON DELETE SET NULL,

  -- 🛑 練習當下的題目【快照】。
  --    不靠 join 回 speaking_prompts 取題目，因為老師之後可能改題、停用、甚至刪題。
  --    學生回頭看自己三個月前的練習時，看到的必須是他當時真正回答的那一題。
  --    這與 writing_texts 逐字保存作文內容是同一個理由。
  prompt_part INTEGER NOT NULL CHECK (prompt_part IN (1, 2, 3)),
  prompt_text TEXT NOT NULL CHECK (length(btrim(prompt_text)) > 0),

  -- ── 錄音檔（90 天）──────────────────────────────────
  storage_path TEXT,
  mime_type    TEXT,
  file_bytes   BIGINT CHECK (file_bytes IS NULL OR file_bytes >= 0),
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  uploaded_at  TIMESTAMPTZ,
  -- 有值 = 檔案已經不在 Storage 了。這一列本身永遠留著。
  file_deleted_at TIMESTAMPTZ,

  -- ── 生命週期 ───────────────────────────────────────
  --   PENDING   已建立，檔案還沒上傳成功
  --   UPLOADED  錄音已就位
  --   FAILED    上傳失敗（學生可以重錄）
  --   GRADED    下一批：AI 批改完成。CHECK 先留著，下一批不必改
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'UPLOADED', 'FAILED', 'GRADED')),
  error_detail TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- UPLOADED 一定有檔案；沒有檔案就不可能是 UPLOADED
  CONSTRAINT speaking_recordings_uploaded_has_file CHECK (
    status NOT IN ('UPLOADED', 'GRADED') OR storage_path IS NOT NULL
  )
);

COMMENT ON TABLE speaking_recordings IS
  '一次口說練習。錄音檔保存 90 天後自動刪除，本列永久保留（練習紀錄不隨檔案消失）。prompt_text 是練習當下的快照，不靠 join 取題目。';
COMMENT ON COLUMN speaking_recordings.prompt_text IS
  '練習當下的題目全文快照。老師改題、停用或刪題都不影響學生回頭看到的內容。';
COMMENT ON COLUMN speaking_recordings.file_deleted_at IS
  '有值 = 錄音檔已被清理排程刪除。這一列仍然存在，畫面上只是不再提供播放。';

CREATE INDEX IF NOT EXISTS speaking_recordings_student_idx
  ON speaking_recordings (student_id, created_at DESC);

-- 清理排程要撈的：已上傳、還沒刪、上傳超過 90 天。
-- 錨點是 uploaded_at 不是 created_at —— 見 speaking_cleanup_candidates 的說明。
CREATE INDEX IF NOT EXISTS speaking_recordings_cleanup_idx
  ON speaking_recordings (uploaded_at)
  WHERE storage_path IS NOT NULL AND file_deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS speaking_recordings_prompt_idx
  ON speaking_recordings (prompt_id) WHERE prompt_id IS NOT NULL;


DROP TRIGGER IF EXISTS trg_speaking_recordings_touch ON speaking_recordings;
CREATE TRIGGER trg_speaking_recordings_touch
  BEFORE UPDATE ON speaking_recordings
  FOR EACH ROW EXECUTE FUNCTION learn_touch_updated_at();


-- =====================================================
-- 權限
-- =====================================================

ALTER TABLE speaking_recordings ENABLE ROW LEVEL SECURITY;

-- 明確點名收回：Supabase 的 ALTER DEFAULT PRIVILEGES 會把 ALL 授予這三個角色，
-- REVOKE FROM PUBLIC 收不掉。
REVOKE ALL ON TABLE speaking_recordings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON speaking_recordings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON speaking_recordings TO service_role;

-- 學生只讀得到自己的。寫入一律走 RPC（見 create_speaking_rpcs.sql）——
-- 沒有 INSERT / UPDATE 政策，所以學生改不了狀態、也偽造不出一筆已上傳的練習。
DROP POLICY IF EXISTS "Speaking: students read own recordings" ON speaking_recordings;
CREATE POLICY "Speaking: students read own recordings"
  ON speaking_recordings FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Speaking: admins read all recordings" ON speaking_recordings;
CREATE POLICY "Speaking: admins read all recordings"
  ON speaking_recordings FOR SELECT
  TO authenticated
  USING (coalesce(is_admin(), false));

DROP POLICY IF EXISTS "Speaking: service role manages recordings" ON speaking_recordings;
CREATE POLICY "Speaking: service role manages recordings"
  ON speaking_recordings FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 🛑 刻意沒有 DELETE 政策。
--    這一列是 Storage 檔案的唯一索引；列被刪掉，檔案就永遠留在 bucket 裡
--    沒有人找得到。不要的練習用 90 天自然到期處理。
--    （與 writing_images 同一個理由。）
