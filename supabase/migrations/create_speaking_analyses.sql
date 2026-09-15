-- =====================================================
-- speaking_analyses —— 一次口說 AI 批改
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_speaking_recordings.sql 之後執行。
--
--
-- 這一批做什麼、不做什麼
--
--   做：transcript、S1–S4 四項 0–9 band、overall band、中英雙語回饋與建議。
--   不做：19 個 skill 的 rubric evidence。
--
--   四項本來就對應 LEARNING_DOMAIN_MODEL.md §9.12 的四個 Category：
--     fluency      → S1 流暢與連貫   Fluency & Coherence
--     lexical      → S2 詞彙運用     Lexical Resource
--     grammar      → S3 文法運用     Grammatical Range & Accuracy
--     pronunciation→ S4 發音與語調   Pronunciation & Intonation
--
--   ⚠️ 這四個分數【不寫入任何 skill mastery】。§9.13 說可計分的單位是
--      rubric evidence 而不是錄音，而一個 band 分數不是 evidence——
--      它是四項的總評，不帶「哪一個 skill、什麼證據」。要接能力模型得先
--      產出 evidence，那是另一批的事。§9.16 另外釘死：口說 S3 不等於文法領域，
--      一個 70% 的口說文法分數不會寫進文法能力。
--
--
-- 為什麼佇列比作文那套簡單
--
--   一篇作文是 Stage 1 四支 pass + 綜合層，一次請求跑不完，所以需要
--   stage1_progress 記住哪幾支已經過了。口說是【一次】呼叫：把音訊丟給模型、
--   拿回一份 JSON，十幾二十秒就結束。
--
--   所以這裡沒有 stage、沒有 progress、沒有「綜合層完成但狀態沒推上去」的殘局，
--   狀態機只有四個值。照抄作文的複雜度只會多出永遠不會走到的分支。
--
-- 回滾：supabase/migrations/create_speaking_analyses.rollback.sql
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'speaking_recordings'
  ) THEN
    RAISE EXCEPTION '需要 speaking_recordings，請先套用 create_speaking_recordings.sql';
  END IF;
END;
$$;


CREATE TABLE IF NOT EXISTS speaking_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  recording_id UUID NOT NULL REFERENCES speaking_recordings(id) ON DELETE CASCADE,

  --   QUEUED     已排入，等 worker 認領
  --   ANALYZING  worker 正在跑
  --   COMPLETED  有分數與回饋
  --   FAILED     跑不完，error_detail 有原因
  status TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'ANALYZING', 'COMPLETED', 'FAILED')),

  -- 誰按下「開始批改」。只可能是老師／管理員——學生不能觸發（產品決策）。
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at    TIMESTAMPTZ,

  -- 🛑 給老師看的一句話。不含 API key、不含模型的原始回應。
  error_detail TEXT,

  -- ── 佇列（與作文同一個租約模型）──────────────────────────
  lease_expires_at TIMESTAMPTZ,
  lease_worker_id  TEXT,
  queue_batch_id   UUID,
  queue_attempts   INTEGER NOT NULL DEFAULT 0 CHECK (queue_attempts >= 0),

  provider TEXT NOT NULL DEFAULT 'gemini',
  model    TEXT,
  -- 分類法改版走 versioning，舊報告照舊可讀。
  taxonomy_version TEXT NOT NULL DEFAULT 'speaking-v1',
  -- 同一則錄音的第幾次批改。重新批改永遠是新的一列，舊的留著。
  analysis_version INTEGER NOT NULL DEFAULT 1 CHECK (analysis_version >= 1),

  -- ── 結果 ─────────────────────────────────────────────────
  transcript TEXT,

  -- IELTS band：0–9，0.5 一階。CHECK 同時擋住範圍與步進——
  -- 模型偶爾會回 6.3 這種值，讓它進到資料庫，畫面上就會出現一個
  -- 不存在於任何評分表的分數。
  fluency_score       NUMERIC(2,1) CHECK (fluency_score       IS NULL OR (fluency_score       BETWEEN 0 AND 9 AND (fluency_score       * 2) % 1 = 0)),
  lexical_score       NUMERIC(2,1) CHECK (lexical_score       IS NULL OR (lexical_score       BETWEEN 0 AND 9 AND (lexical_score       * 2) % 1 = 0)),
  grammar_score       NUMERIC(2,1) CHECK (grammar_score       IS NULL OR (grammar_score       BETWEEN 0 AND 9 AND (grammar_score       * 2) % 1 = 0)),
  pronunciation_score NUMERIC(2,1) CHECK (pronunciation_score IS NULL OR (pronunciation_score BETWEEN 0 AND 9 AND (pronunciation_score * 2) % 1 = 0)),
  overall_band        NUMERIC(2,1) CHECK (overall_band        IS NULL OR (overall_band        BETWEEN 0 AND 9 AND (overall_band        * 2) % 1 = 0)),

  -- 中英雙語。格式由 prompt 約定，資料庫不解析它的內部結構。
  feedback    TEXT,
  suggestions TEXT,

  -- token 用量、耗時、重試次數。成本估算唯一的資料來源——
  -- 與作文一樣，不在程式裡寫死單價。
  telemetry JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- COMPLETED 一定有分數；沒有分數就不可能是 COMPLETED
  CONSTRAINT speaking_analyses_completed_has_scores CHECK (
    status <> 'COMPLETED' OR (
      overall_band IS NOT NULL AND fluency_score IS NOT NULL AND
      lexical_score IS NOT NULL AND grammar_score IS NOT NULL AND
      pronunciation_score IS NOT NULL
    )
  )
);

COMMENT ON TABLE speaking_analyses IS
  '一次口說 AI 批改。S1–S4 四項 0–9 band + 雙語回饋。🛑 這些分數不寫入任何 skill mastery（見 LEARNING_DOMAIN_MODEL.md §9.13／§9.16）。';
COMMENT ON COLUMN speaking_analyses.error_detail IS
  '失敗原因，給老師看的一句話。🛑 絕不放 API key 或模型的原始回應。';
COMMENT ON COLUMN speaking_analyses.telemetry IS
  'token 用量與耗時。成本估算的唯一來源，不在程式裡寫死單價。';

-- 🛑 一則錄音同時只能有一個活躍的批改。
--    老師連按兩次、或同一則錄音出現在兩個批次裡，都不該變成兩次付費呼叫。
CREATE UNIQUE INDEX IF NOT EXISTS speaking_analyses_one_active_per_recording
  ON speaking_analyses (recording_id)
  WHERE status IN ('QUEUED', 'ANALYZING');

-- worker 撈可認領的列
CREATE INDEX IF NOT EXISTS speaking_analyses_claimable_idx
  ON speaking_analyses (status, requested_at)
  WHERE status IN ('QUEUED', 'ANALYZING');

CREATE INDEX IF NOT EXISTS speaking_analyses_recording_idx
  ON speaking_analyses (recording_id, created_at DESC);

CREATE INDEX IF NOT EXISTS speaking_analyses_batch_idx
  ON speaking_analyses (queue_batch_id) WHERE queue_batch_id IS NOT NULL;

-- 每日上限要數「今天排了幾件」
CREATE INDEX IF NOT EXISTS speaking_analyses_requested_at_idx
  ON speaking_analyses (requested_at);


DROP TRIGGER IF EXISTS trg_speaking_analyses_touch ON speaking_analyses;
CREATE TRIGGER trg_speaking_analyses_touch
  BEFORE UPDATE ON speaking_analyses
  FOR EACH ROW EXECUTE FUNCTION learn_touch_updated_at();


-- =====================================================
-- 權限：零 grant，只走函式
--
-- 學生【不】直接讀這張表。他們該看到的是分數與回饋，不是 error_detail、
-- 不是 lease_worker_id、也不是 telemetry。欄位級的遮蔽 RLS 做不到，
-- 所以入口是 speaking_my_practices()（見 create_speaking_grading_rpcs.sql）。
-- =====================================================

ALTER TABLE speaking_analyses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE speaking_analyses FROM PUBLIC, anon, authenticated, service_role;
