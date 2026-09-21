-- =====================================================
-- writing_error_findings —— 錯誤 findings 的物化事實表（Phase 1A / A1）
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_writing_analyses.sql 與 create_writing_texts.sql 之後執行。
--
-- 計畫：docs/plans/writing-error-intelligence-phase1/04-PHASE-1A-REVISION.md
-- 回滾：supabase/migrations/create_writing_error_findings.rollback.sql
--
--
-- 這張表是什麼
--
--   writing_analyses.error_analysis（JSONB）才是真相。這張表只是它的【物化視圖】：
--   把 findings 陣列攤平成一列一個 finding，讓「誰犯過這個錯」變成一句 GROUP BY，
--   而不是每次查詢都要展開 44 份 JSONB。
--
--   ⚠️ 因此這張表【隨時可以整個清空重建】。任何時候懷疑它不對，
--      就 DELETE 全表再跑一次 writing_backfill_error_findings()。
--      資料不會遺失，因為真相從來不在這裡。
--
--
-- 只放「目前有效」的那一版
--
--   一篇作文可能有多次分析（重跑）。這張表【只放該篇最高的 COMPLETED 版次】的 findings。
--
--   🛑 是「最高的 COMPLETED 版次」，不是「最高版次」。
--      v1=COMPLETED、v2=FAILED 的時候，有效的是 v1。
--      若判成 v2 就會把 v1 的正確結果清空——而且沒有人會馬上發現。
--      2026-09-20 production 查過：目前 8 筆 FAILED 都沒有蓋過較舊的 COMPLETED，
--      所以這是預防性的，但只要有人重跑一次失敗就會立刻發生。
--
--   這也是為什麼【不需要】is_latest 這種旗標：表裡本來就只有有效的那一版。
--   （writing_analyses 的 COMPLETED 列有 trigger 擋住任何 UPDATE，
--     所以就算想加旗標也加不了。）
--
--
-- 2026-09-20 的 production 實測（決定了下面幾個 NOT NULL）
--
--   有效作文 44 篇 · findings 420 筆 · 17 個 code 全數出現
--   形狀異常 0 · 欄位不齊全 0
--   → quote / reason / correction / primary_skill 四欄設 NOT NULL 是安全的
-- =====================================================

CREATE TABLE IF NOT EXISTS writing_error_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 來源。analysis_id 只作稽核用，不參與去重（理由見下方 UNIQUE）
  analysis_id      UUID NOT NULL REFERENCES writing_analyses(id) ON DELETE CASCADE,
  essay_id         UUID NOT NULL REFERENCES writing_submissions(id) ON DELETE CASCADE,
  analysis_version INTEGER NOT NULL,

  -- 這個 finding 在 error_analysis -> 'findings' 陣列裡的位置（0 起算）。
  --
  -- 🛑 去重鍵【刻意】是它，不是 (error_code, quote, correction)。
  --    同一篇作文裡兩個一模一樣的 finding 是【合法的】——同一個字錯兩次，
  --    AI 會吐出兩個內容相同的 finding，那是兩個真實的錯誤。
  --    用內容當鍵會吃掉一個，而【計數正是這個功能的全部意義】。
  --    冪等性由 writing_sync_error_findings() 交易內的 DELETE → INSERT 保證，
  --    從來不需要靠 UNIQUE。
  --    （2026-09-20 實測目前 0 筆重複，但「現在沒有」不是設計理由。）
  --
  --    附帶好處：它同時保留了原文順序，drill-down 可以照作文裡的先後呈現。
  finding_index INTEGER NOT NULL CHECK (finding_index >= 0),

  -- 刻意反正規化：所有查詢都以學生為中心，不該每次都 join 回 writing_submissions
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 17 個 writing-v2 的 WRITE_ERR_*。
  -- 硬編在 CHECK 裡：taxonomy 若變動，這裡會【當場擋下】而不是默默收下未知的 code。
  -- 2026-09-20 已逐一比對過 api/_lib/taxonomy.ts 的 ERROR_TAGS，兩邊完全一致。
  error_code TEXT NOT NULL CHECK (error_code IN (
    'WRITE_ERR_ARTICLE',
    'WRITE_ERR_CHINGLISH',
    'WRITE_ERR_COUNTABILITY',
    'WRITE_ERR_DISCOURSE_STRUCTURE',
    'WRITE_ERR_FRAGMENT',
    'WRITE_ERR_GRAMMAR_OTHER',
    'WRITE_ERR_NUMBER',
    'WRITE_ERR_PREP_CLAUSE',
    'WRITE_ERR_PRONOUN',
    'WRITE_ERR_PUNCTUATION',
    'WRITE_ERR_RUN_ON',
    'WRITE_ERR_SPELLING',
    'WRITE_ERR_SV_AGREEMENT',
    'WRITE_ERR_THAT',
    'WRITE_ERR_TRANSITIVITY',
    'WRITE_ERR_WORD_BOUNDARY',
    'WRITE_ERR_WORD_CLASS'
  )),

  -- 掛回 Axis 1 的 Primary Writing Skill
  primary_skill TEXT NOT NULL,

  quote      TEXT NOT NULL,
  reason     TEXT NOT NULL,
  correction TEXT NOT NULL,

  -- WRITE_ERR_GRAMMAR_OTHER 是已知被濫用的 fallback：2026-09-20 實測佔全部
  -- findings 的 11%（46/420），每篇密度 2.42 是全部 code 第二高——它一出現就大量出現。
  -- 做成 GENERATED 是為了讓「標記低訊號」的查詢不必到處寫字串比對。
  --
  -- ⚠️ 它是【標記】不是【隱藏】。老師的需求是「不要漏掉任何錯」，
  --    所以 UI 照常列出它，只是提示老師點開看實際例句。
  is_fallback_code BOOLEAN GENERATED ALWAYS AS
    (error_code = 'WRITE_ERR_GRAMMAR_OTHER') STORED,

  -- ── 以下是快照，不是 join ─────────────────────────────────────
  -- 作文送出後就不會變，所以快照永遠正確；真的變了就重跑 backfill。
  --
  -- 🛑 刻意【不】快照班級：班級語意採 S1（目前在籍），必須即時 join
  --    learn_class_members 並帶 left_at IS NULL。快照會凍結在物化當下，與 S1 矛盾。
  essay_word_count   INTEGER,        -- 來自 writing_texts。1B 算 errors/100 words 要用
  essay_topic        TEXT,           -- 題目 filter 用，避免每次 join 回去
  essay_submitted_at TIMESTAMPTZ NOT NULL,

  taxonomy_version TEXT NOT NULL,

  -- 物化的時間，不是作文的時間
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (essay_id, finding_index)
);


-- ── Indexes：對應 Phase 1A 的三個查詢形狀 ─────────────────────────

-- ① Error → Students：先卡 code，再卡時間
CREATE INDEX IF NOT EXISTS idx_wef_code_time
  ON writing_error_findings (error_code, essay_submitted_at DESC, student_id);

-- ② Student → Errors：先卡學生，再卡時間
CREATE INDEX IF NOT EXISTS idx_wef_student_time
  ON writing_error_findings (student_id, essay_submitted_at DESC, error_code);

-- ③ 重新物化時的 DELETE，以及 drill-down 依作文取用
CREATE INDEX IF NOT EXISTS idx_wef_essay
  ON writing_error_findings (essay_id);

-- ④ 題目 filter
CREATE INDEX IF NOT EXISTS idx_wef_topic_time
  ON writing_error_findings (essay_topic, essay_submitted_at DESC)
  WHERE essay_topic IS NOT NULL;


COMMENT ON TABLE writing_error_findings IS
  'writing_analyses.error_analysis 的物化視圖：一列一個 finding，只保留該篇最高 COMPLETED 版次的結果。可隨時清空重建。';
COMMENT ON COLUMN writing_error_findings.finding_index IS
  'JSONB findings 陣列的位置（0 起算）。去重鍵刻意用它而非內容——同一篇兩個相同的 finding 是合法的，用內容去重會讓計數變少。';
COMMENT ON COLUMN writing_error_findings.is_fallback_code IS
  'WRITE_ERR_GRAMMAR_OTHER 的標記。用於在 UI 上提示「這一類混了多種錯誤」，不用於隱藏。';


-- ── 權限 ─────────────────────────────────────────────────────────
--
-- ⚠️ 必須明確 REVOKE 這三個角色，不能只 REVOKE FROM PUBLIC。
--    Supabase 專案設有 ALTER DEFAULT PRIVILEGES，新建的表會【明確授予】
--    anon / authenticated / service_role 全部權限，那收不掉於 REVOKE ... FROM PUBLIC。
--
-- 寫入【只】透過 writing_sync_error_findings() 這支 SECURITY DEFINER 函式，
-- 它以擁有者身分執行，靠所有權寫入，不需要任何角色的 grant。
-- service_role 只留 SELECT，供診斷與匯出；它不該直接改這張表。
REVOKE ALL ON writing_error_findings FROM anon, authenticated, service_role;
GRANT SELECT ON writing_error_findings TO service_role;

-- RLS 開著但不給 authenticated 任何 policy：
-- 就算未來有人不小心把 GRANT 加回去，RLS 仍然擋住。兩層都要成立才進得來。
ALTER TABLE writing_error_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Writing: service role reads findings" ON writing_error_findings;
CREATE POLICY "Writing: service role reads findings"
  ON writing_error_findings
  FOR SELECT
  TO service_role
  USING (true);


-- ── 驗證 ─────────────────────────────────────────────────────────
SELECT c.relname                                            AS "表",
       c.relrowsecurity                                     AS "RLS開著",
       has_table_privilege('anon', c.oid, 'SELECT')          AS "anon可讀",
       has_table_privilege('authenticated', c.oid, 'SELECT') AS "登入者可讀",
       has_table_privilege('service_role', c.oid, 'SELECT')  AS "service_role可讀",
       has_table_privilege('service_role', c.oid, 'INSERT')  AS "service_role可寫",
       (SELECT count(*) FROM pg_index i WHERE i.indrelid = c.oid)::int AS "索引數"
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'writing_error_findings';
-- 預期：RLS開著=true · anon可讀=false · 登入者可讀=false
--       service_role可讀=true · service_role可寫=false · 索引數=6（PK + UNIQUE + 4 個）
