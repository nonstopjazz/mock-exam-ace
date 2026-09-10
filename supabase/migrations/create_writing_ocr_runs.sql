-- =====================================================
-- Migration: 建立 writing_ocr_runs 表（寫作系統 Phase 2 · 拍照上傳）
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- 一次辨識 = 一列。永不就地修改既有的成功紀錄；重跑就插入新的一列。
-- 「目前的辨識結果」= 該作文最新一筆 SUCCEEDED，於讀取時推導，不存旗標。
--
-- 為什麼 raw_text 是永久保留的：
--   學生送出的是「校對後的文字」，機器原本讀到的是另一回事。兩份都留著，
--   之後才回答得了「這個錯字是學生寫的，還是機器讀錯的」。照片只留 60 天，
--   raw_text 不會跟著消失。
--
-- ⚠️ 刻意【不】建立逐詞座標表（ilearn 的 essay_ocr_tokens 那種）。
--   封存圖 60 天後會刪除，逐詞座標在那之後指向一張不存在的圖，是純負債。
--   若日後要做「在原圖上標出錯誤位置」，必須先改保存策略，再回來加這張表。
--
-- 命名沿用 writing_ 前綴：正式專案與 iLearn 共用同一個資料庫，
-- essay_ 開頭的名稱會撞到它既有的表與政策。請不要改回 essay_。
-- =====================================================

CREATE TABLE IF NOT EXISTS writing_ocr_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  essay_id UUID NOT NULL REFERENCES writing_submissions(id) ON DELETE CASCADE,

  provider TEXT NOT NULL DEFAULT 'google_vision',
  -- Vision 的 feature 名稱。手寫要用 DOCUMENT_TEXT_DETECTION，不是 TEXT_DETECTION。
  provider_feature TEXT NOT NULL DEFAULT 'DOCUMENT_TEXT_DETECTION',

  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),

  -- 機器原本讀到的完整文字（各頁以 page_separator 串接）
  raw_text TEXT,
  -- [{ "page_number": 1, "text": "...", "confidence": 0.94 }, ...]
  page_texts JSONB,
  page_separator TEXT NOT NULL DEFAULT E'\n\n',

  error_code TEXT,
  error_message TEXT,

  -- 第幾次嘗試（同一篇作文內遞增）。上限由 API 端把關，見 api/writing-images-process.ts
  attempt_no INTEGER NOT NULL DEFAULT 1 CHECK (attempt_no > 0),

  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT writing_ocr_runs_succeeded_has_text CHECK (
    status <> 'SUCCEEDED' OR (raw_text IS NOT NULL AND char_length(raw_text) > 0)
  ),
  CONSTRAINT writing_ocr_runs_failed_has_reason CHECK (
    status <> 'FAILED' OR error_code IS NOT NULL
  )
);

-- 推導「目前結果」用
CREATE INDEX IF NOT EXISTS idx_writing_ocr_runs_current
  ON writing_ocr_runs (essay_id, status, finished_at DESC);

COMMENT ON TABLE writing_ocr_runs IS
  '一次文字辨識的紀錄。永久保留：照片 60 天後會刪除，機器讀到的原始文字不會跟著消失。';
COMMENT ON COLUMN writing_ocr_runs.raw_text IS
  '機器原本讀到的文字，未經學生修改。與 writing_texts 的正式文字比對，才知道學生改了什麼。';
COMMENT ON COLUMN writing_ocr_runs.provider_feature IS
  'Google Vision 的 feature。手寫作文用 DOCUMENT_TEXT_DETECTION；TEXT_DETECTION 是給招牌那種稀疏文字的。';

-- =====================================================
-- Append-only：成功之後不可修改
--
-- PENDING → RUNNING → SUCCEEDED/FAILED 這條路要允許 UPDATE，
-- 但終局狀態一旦寫下就凍結，否則「重跑一次覆蓋掉上一次」會讓
-- writing_texts.source_ocr_run_id 指向一份已經被改掉的文字。
-- =====================================================

CREATE OR REPLACE FUNCTION writing_ocr_runs_guard_final()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IN ('SUCCEEDED', 'FAILED') THEN
    RAISE EXCEPTION '已完成的辨識紀錄不可修改（run_id=%）。重跑請插入新的一列。', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_writing_ocr_runs_guard_final ON writing_ocr_runs;
CREATE TRIGGER trg_writing_ocr_runs_guard_final
  BEFORE UPDATE ON writing_ocr_runs
  FOR EACH ROW
  EXECUTE FUNCTION writing_ocr_runs_guard_final();

-- =====================================================
-- RLS
--
-- 學生【要】讀得到 raw_text —— 校對畫面就是拿它預填的。
-- 但寫入一律由伺服器（service_role）進行：辨識要花錢，不能讓 client 自己宣稱跑過。
-- 因此本表沒有 INSERT / UPDATE / DELETE 政策，service_role 走 BYPASSRLS。
-- =====================================================

ALTER TABLE writing_ocr_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Writing: students view own ocr runs" ON writing_ocr_runs;
CREATE POLICY "Writing: students view own ocr runs"
  ON writing_ocr_runs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM writing_submissions e
    WHERE e.id = writing_ocr_runs.essay_id AND e.student_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Writing: admins view all ocr runs" ON writing_ocr_runs;
CREATE POLICY "Writing: admins view all ocr runs"
  ON writing_ocr_runs FOR SELECT
  USING (is_admin());

-- anon 不該碰這張表。Supabase 的 ALTER DEFAULT PRIVILEGES 會在新表上自動
-- 授權給 anon，所以這裡必須明確收回 —— REVOKE FROM PUBLIC 收不掉它。
REVOKE ALL ON TABLE writing_ocr_runs FROM PUBLIC, anon;
GRANT SELECT ON TABLE writing_ocr_runs TO authenticated;
GRANT ALL ON TABLE writing_ocr_runs TO service_role;
