-- =====================================================
-- Six-Way Reading（1／7）：文章
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- 這一批建立的是【內容層】。學生作答的部分在
-- create_reading_sessions.sql，答案在 create_reading_questions.sql
-- 的獨立表。
--
-- ═══════════════════════════════════════════════════════════
-- 🛑 模組邊界：Six-Way Reading 與模考系統【完全分離】
-- ═══════════════════════════════════════════════════════════
--
-- 這是產品決策，不是實作細節。閱讀專項訓練與模考是兩個不同的
-- 產品流程，共用的只有基礎設施。
--
-- 【不可以】把 reading 接到：
--     exams / question_groups / group_questions
--     exam_attempts / exam_statistics
--     模考的作答流程、計分、結果分析
--     src/types/exam.ts、src/store/examStore.ts、src/hooks/useExam.ts
--     src/data/mock-exam*.ts、src/pages/Exam*.tsx
--
-- 【可以】共用：
--     auth（auth.uid()、is_admin()）
--     admin shell 與 UI 元件
--     Supabase client
--     design system
--     一般性的 hooks / utilities
--
-- 為什麼要寫在這裡：question_groups 的 groupType 有 'reading'，
-- 結構上看起來很像（文章 + 選擇題 + 解說），所以【很容易】有人
-- 日後為了「不要重複」而把兩邊接起來。那會把一個產品的改動
-- 變成兩個產品的風險。
--
-- 順帶一提，那條路今天也走不通：question_groups 在 repo 裡
-- 沒有 DDL（production 有、版控沒有），而且模考的學生端流程
-- 根本不讀資料庫——它讀 src/data/mock-exam.ts 的靜態資料，
-- 作答存在 zustand 的 localStorage 裡。
--
-- 詳見 docs/reading/module-boundary.md
-- ═══════════════════════════════════════════════════════════
--
-- 🛑 passage_id 是【外部識別碼】（KR0001），不是 UUID。
--    它是題庫管線那邊的主鍵，也是冪等匯入唯一可靠的錨點。
--    用 UUID 當 PK 會讓「同一篇」變成要另外比對的事。
--
-- 🛑 content_source 必須存下來。
--    來源檔的 passage_final_text 在 2026-09 那批 21 篇【全部壞掉】——
--    值是字串 "passage_revised_text"，也就是欄位名稱本身，不是內容。
--    匯入器因此要依序 final → revised → writer 挑第一個有效的，
--    並把實際用了哪一個記在這裡。
--
--    不記的話，之後沒有人分得出「這篇用的是最終稿」還是
--    「最終稿壞了所以退回初稿」。那個差別會影響內容品質判斷。
--
-- 分數欄位（quality / readability / sixway / topic_quality）全部可以是 NULL。
-- 它們來自產製管線的自評，不是學生作答的結果——兩者要分開看，
-- 而且日後可以拿「預測好讀」對照「實際答對率」來校準。
--
-- 回滾：supabase/migrations/create_reading_passages.rollback.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS reading_passages (
  passage_id   TEXT PRIMARY KEY CHECK (length(btrim(passage_id)) > 0),

  title        TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  passage_text TEXT NOT NULL CHECK (length(btrim(passage_text)) > 0),

  -- 這篇的內文實際取自來源檔的哪一欄
  content_source TEXT NOT NULL CHECK (content_source IN ('FINAL', 'REVISED', 'WRITER')),

  -- CEFR。來源資料就是 B2，不轉換成自訂難度級距。
  cefr_level TEXT CHECK (cefr_level IN ('A1','A2','B1','B2','C1','C2')),

  -- ── 主題分類（六個都存，分析時才分得出群）──────────
  content_family      TEXT,
  subdomain           TEXT,
  narrative_archetype TEXT,
  geography           TEXT,
  time_period         TEXT,
  -- 原始值長這樣：「3 = Hidden Gem」。原文與序數都留，
  -- 因為序數可以排序，而原文是老師看得懂的那一個。
  fame_level          TEXT,
  fame_rank           SMALLINT CHECK (fame_rank BETWEEN 1 AND 5),

  -- ── 產製管線的自評分數（全部可 NULL）────────────────
  quality_score       SMALLINT CHECK (quality_score       BETWEEN 0 AND 100),
  readability_score   SMALLINT CHECK (readability_score   BETWEEN 0 AND 100),
  sixway_score        SMALLINT CHECK (sixway_score        BETWEEN 0 AND 100),
  topic_quality_score SMALLINT CHECK (topic_quality_score BETWEEN 0 AND 100),
  factual_risk        TEXT     CHECK (factual_risk IN ('LOW','MEDIUM','HIGH')),

  -- 🛑 預設 DRAFT。能不能 PUBLISHED 由 reading_publish_guard 那支把關，
  --    不是匯入時決定——六題不齊的半成品可以入庫，但不能上架。
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),

  -- 來源批次。2026-09 那批是空的，欄位先留著。
  source_package_id TEXT,
  source_batch_id   TEXT,

  -- 🛑 canonical payload 的雜湊，冪等匯入靠它。
  --    重新匯入同一個 passage_id 時：雜湊相同 → skipped，不同 → conflict。
  --    用雜湊而不是逐欄比對，是因為「內容」橫跨五張表
  --    （文章、六題、選項、skill、段落、詞彙），逐欄比對會漏掉
  --    新增的欄位——而漏掉的那一欄正好是被改動的那一欄時，
  --    系統會回報「相同」然後靜默略過一筆真的有變更的資料。
  content_hash TEXT,

  imported_by UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE reading_passages IS
  'Six-Way Reading 的文章。passage_id 是題庫管線的外部識別碼，也是冪等匯入的錨點。🛑 這個模組與模考系統（exams / question_groups / exam_attempts）刻意完全分離，不可以互相引用——見 docs/reading/module-boundary.md。';
COMMENT ON COLUMN reading_passages.content_source IS
  '內文實際取自 final / revised / writer 哪一欄。來源檔的 final 欄位曾整批壞掉（值是欄位名稱），所以這個來源必須留下紀錄。';
COMMENT ON COLUMN reading_passages.status IS
  'DRAFT 可以是半成品；PUBLISHED 必須六個 construct 齊全且內容完整，由 trigger 把關。';

CREATE INDEX IF NOT EXISTS reading_passages_status_idx
  ON reading_passages (status, cefr_level);
CREATE INDEX IF NOT EXISTS reading_passages_family_idx
  ON reading_passages (content_family, status);


-- ── 權限 ──────────────────────────────────────────────
-- 🛑 anon 一律不給。未登入者不需要看到任何題庫內容。
REVOKE ALL ON reading_passages FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON reading_passages TO authenticated;
GRANT ALL    ON reading_passages TO service_role;

ALTER TABLE reading_passages ENABLE ROW LEVEL SECURITY;

-- 學生只看得到已上架的。草稿與封存只有管理員看得到。
DROP POLICY IF EXISTS reading_passages_published_read ON reading_passages;
CREATE POLICY reading_passages_published_read ON reading_passages
  FOR SELECT TO authenticated
  USING (status = 'PUBLISHED' OR coalesce(public.is_admin(), false));

DROP POLICY IF EXISTS reading_passages_service_all ON reading_passages;
CREATE POLICY reading_passages_service_all ON reading_passages
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT c.relname,
       c.relrowsecurity                                      AS "RLS 開啟",
       has_table_privilege('anon',          c.oid, 'SELECT') AS "anon可讀",
       has_table_privilege('authenticated', c.oid, 'SELECT') AS "登入者可讀",
       has_table_privilege('authenticated', c.oid, 'INSERT') AS "登入者可寫"
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'reading_passages';
