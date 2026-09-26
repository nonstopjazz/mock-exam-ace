-- =====================================================
-- Six-Way Reading（3／7）：段落地圖與三層詞彙
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_reading_passages.sql。
--
-- 這兩張表保存來源資料裡【已經有、但 v1 還不會拿來分析】的東西。
-- 現在不存，之後就要重新匯入一次 296 篇。
--
-- 🛑 段落地圖【不能】用來告訴學生「這題答案在第 2 段」。
--
--    我把 183 個欄位全部搜過 evidence / paragraph / source / quote /
--    rationale / location / anchor 等關鍵字。命中四個，沒有一個是題目層級：
--
--      specific_anchor              主題描述（「19 世紀把聖伊利亞斯山畫錯位置的測繪失誤」）
--      source_verifiability         主題可查證性，21 篇全是 High
--      source_citation_requirement  引用政策，21 篇全是 INTERNAL
--      passage_writer_paragraph_map 段落地圖，【文章層級】
--
--    而且 183 欄裡有 106 欄完全沒有任何值，包含全部的
--    *_metadata_json / *_diagnostics_json / *_repair_item_json ——
--    題目層級的證據若存在，最可能就在那裡，但它們是空的。
--
--    所以【沒有 question → paragraph 的對應】。硬要推（例如用字串比對
--    去猜答案句在哪一段）會產生看起來精確、實際上是猜的分析結果。
--    Phase 1 只保存地圖本身。
--
-- 回滾：supabase/migrations/create_reading_passage_aux.rollback.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS reading_passage_paragraphs (
  passage_id   TEXT NOT NULL REFERENCES reading_passages(passage_id) ON DELETE CASCADE,
  paragraph_no SMALLINT NOT NULL CHECK (paragraph_no BETWEEN 1 AND 20),

  -- 來源長這樣：「Opening hook about maps appearing precise…」
  description TEXT NOT NULL CHECK (length(btrim(description)) > 0),

  PRIMARY KEY (passage_id, paragraph_no)
);

COMMENT ON TABLE reading_passage_paragraphs IS
  '文章的段落地圖（P1 開場鉤子 / P2 發展 / P3 轉折…）。🛑 來源資料【沒有】題目到段落的對應，所以 v1 不做段落層級的弱點分析，只保存。';


CREATE TABLE IF NOT EXISTS reading_passage_vocab (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  passage_id TEXT NOT NULL REFERENCES reading_passages(passage_id) ON DELETE CASCADE,

  -- 來源的三層。CANDIDATE 帶定義與段落錨點，另外兩層只有詞。
  tier TEXT NOT NULL CHECK (tier IN ('CANDIDATE','ACADEMIC','KNOWLEDGE')),

  term       TEXT NOT NULL CHECK (length(btrim(term)) > 0),
  definition TEXT,

  -- CANDIDATE 的「(P2)」。另外兩層沒有，所以可以是 NULL。
  paragraph_no SMALLINT CHECK (paragraph_no BETWEEN 1 AND 20),

  -- 🛑 預留給未來接上 lexical_items，v1 【一律是 NULL】。
  --    自動比對不可靠：我查過 vocabulary_context 題考的那個字
  --    是否出現在 CANDIDATE 清單裡，21 篇只有 8 篇命中。
  --    那個比率不足以自動連結，錯誤的連結會把學生的單字排程弄髒。
  --    之後要做，應該是後台人工確認，不是匯入時自動猜。
  lexical_item_id UUID REFERENCES lexical_items(id) ON DELETE SET NULL,

  UNIQUE (passage_id, tier, term)
);

COMMENT ON TABLE reading_passage_vocab IS
  '文章的三層詞彙。lexical_item_id 是為將來預留的，v1 不做自動比對——VC 題考的字只有 8/21 出現在 CANDIDATE 清單裡，自動連會連錯。';
COMMENT ON COLUMN reading_passage_vocab.lexical_item_id IS
  '🛑 v1 一律 NULL。要連上 canonical 單字應該由後台人工確認，不是匯入時猜。';

CREATE INDEX IF NOT EXISTS reading_passage_vocab_passage_idx
  ON reading_passage_vocab (passage_id, tier);


-- ── 權限 ──────────────────────────────────────────────
REVOKE ALL ON reading_passage_paragraphs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON reading_passage_vocab      FROM PUBLIC, anon, authenticated, service_role;

-- 這兩張都是教學內容，學生看得到沒有問題（而且看得到才有用）。
GRANT SELECT ON reading_passage_paragraphs TO authenticated;
GRANT SELECT ON reading_passage_vocab      TO authenticated;
GRANT ALL    ON reading_passage_paragraphs TO service_role;
GRANT ALL    ON reading_passage_vocab      TO service_role;

ALTER TABLE reading_passage_paragraphs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_passage_vocab      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reading_paragraphs_published_read ON reading_passage_paragraphs;
CREATE POLICY reading_paragraphs_published_read ON reading_passage_paragraphs
  FOR SELECT TO authenticated
  USING (
    coalesce(public.is_admin(), false)
    OR EXISTS (SELECT 1 FROM public.reading_passages p
                WHERE p.passage_id = reading_passage_paragraphs.passage_id
                  AND p.status = 'PUBLISHED')
  );

DROP POLICY IF EXISTS reading_vocab_published_read ON reading_passage_vocab;
CREATE POLICY reading_vocab_published_read ON reading_passage_vocab
  FOR SELECT TO authenticated
  USING (
    coalesce(public.is_admin(), false)
    OR EXISTS (SELECT 1 FROM public.reading_passages p
                WHERE p.passage_id = reading_passage_vocab.passage_id
                  AND p.status = 'PUBLISHED')
  );

DROP POLICY IF EXISTS reading_paragraphs_service_all ON reading_passage_paragraphs;
CREATE POLICY reading_paragraphs_service_all ON reading_passage_paragraphs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS reading_vocab_service_all ON reading_passage_vocab;
CREATE POLICY reading_vocab_service_all ON reading_passage_vocab
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT c.relname,
       c.relrowsecurity AS "RLS 開啟",
       has_table_privilege('anon',          c.oid, 'SELECT') AS "anon可讀",
       has_table_privilege('authenticated', c.oid, 'SELECT') AS "登入者可讀"
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname='public'
   AND c.relname IN ('reading_passage_paragraphs','reading_passage_vocab')
 ORDER BY c.relname;
