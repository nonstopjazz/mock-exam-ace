-- =====================================================
-- Six-Way Reading（2／7）：題目、答案、micro-skill
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_reading_passages.sql（這裡有 FK 指向它）。
--
-- 這一支建三張表，刻意分開的理由在下面：
--
--   reading_questions        題幹與選項 —— 學生【看得到】
--   reading_question_keys    正解與解說 —— 學生【絕對看不到】
--   reading_question_skills  micro-skill —— v1 只存不用
--
-- 🛑 答案為什麼要獨立一張表
--
--    如果正解跟題幹放在同一列，那麼「學生可以讀題目」與
--    「學生不能讀答案」就得靠欄位層級的權限或 view 來維持。
--    Postgres 的 column-level GRANT 做得到，但它有個致命的性質：
--    【新增一欄時預設是可讀的】。某天有人加了 answer_note 欄位，
--    答案就外洩了，而且沒有任何東西會報錯。
--
--    分成兩張表之後，規則變成「那張表誰都不給」——
--    加欄位不會改變它，忘記也不會出事。安全性不該依賴記得做某件事。
--
-- 🛑 construct 用穩定短碼 SM/MI/SD/CO/CD/VC，不用中文或長英文標籤。
--    標籤會改（「推論結論」→「推論與結論」），identity 不能跟著改。
--    顯示用的名稱放在前端，不進資料庫。
--
-- 🛑 UNIQUE (passage_id, construct)：一篇文章每個 construct 最多一題。
--    【不是】強制六題都要有——半成品要能入庫，否則管線壞掉的那幾篇
--    連看都看不到。六題齊全是 PUBLISHED 的條件，見 create_reading_publish_guard.sql。
--
-- 回滾：supabase/migrations/create_reading_questions.rollback.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS reading_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  passage_id TEXT NOT NULL REFERENCES reading_passages(passage_id) ON DELETE CASCADE,

  -- Six Ways 的穩定短碼
  construct TEXT NOT NULL CHECK (construct IN ('SM','MI','SD','CO','CD','VC')),

  question  TEXT NOT NULL CHECK (length(btrim(question)) > 0),
  option_a  TEXT NOT NULL CHECK (length(btrim(option_a)) > 0),
  option_b  TEXT NOT NULL CHECK (length(btrim(option_b)) > 0),
  option_c  TEXT NOT NULL CHECK (length(btrim(option_c)) > 0),
  option_d  TEXT NOT NULL CHECK (length(btrim(option_d)) > 0),

  -- 呈現順序。固定六題，照 Six Ways 的既定順序，不隨機。
  display_order SMALLINT NOT NULL CHECK (display_order BETWEEN 1 AND 6),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (passage_id, construct)
);

COMMENT ON TABLE reading_questions IS
  '題幹與四個選項。學生讀得到。正解與解說在 reading_question_keys，那張表學生讀不到。';
COMMENT ON COLUMN reading_questions.construct IS
  'SM 主旨題材 / MI 主旨大意 / SD 細節支持 / CO 推論結論 / CD 釐清手法 / VC 字彙語境。顯示名稱在前端，這裡只放穩定短碼。';

CREATE INDEX IF NOT EXISTS reading_questions_passage_idx
  ON reading_questions (passage_id, display_order);


-- ═══════════════════════════════════════════════════════
-- 答案。這張表【沒有任何角色讀得到】，service_role 除外。
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reading_question_keys (
  question_id UUID PRIMARY KEY REFERENCES reading_questions(id) ON DELETE CASCADE,

  correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  explanation    TEXT NOT NULL CHECK (length(btrim(explanation)) > 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE reading_question_keys IS
  '正解與中文解說。🛑 authenticated 與 anon 完全沒有權限，RLS 也沒有給他們的政策。學生只能在作答之後，由 reading_submit_answer() 以 SECURITY DEFINER 身分回傳。';


-- ═══════════════════════════════════════════════════════
-- micro-skill。v1 只存，不做任何學生端分析。
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reading_question_skills (
  question_id UUID NOT NULL REFERENCES reading_questions(id) ON DELETE CASCADE,

  skill_code TEXT NOT NULL CHECK (length(btrim(skill_code)) > 0),

  -- 🛑 這是【強調程度】，不是權重也不是機率。
  --    來源資料是 0–100 的分數，而且同一個 construct 的三個 skill
  --    在 21 篇裡幾乎是常數（topic_identification 全部都是 90）。
  --    拿它當機率去乘、或加總成 1，都是在無中生有。
  --
  --    允許 NULL：來源資料本來就有空值
  --    （cd.rhetorical_function 21/21 全空、organizational_structure 13/21 空）。
  --    NULL 的意思是「沒有這個資訊」，【不是 0】。
  emphasis SMALLINT CHECK (emphasis BETWEEN 0 AND 100),

  PRIMARY KEY (question_id, skill_code)
);

COMMENT ON TABLE reading_question_skills IS
  'micro-skill 的強調程度。v1 只保存，不計入任何學生能力分析——來源資料裡每個 construct 固定三個 skill 且分數近乎常數，拿來做分析只是把 construct 的數字換個名字再講一次。';
COMMENT ON COLUMN reading_question_skills.emphasis IS
  '0–100 的強調程度。NULL = 來源沒有提供，不等於 0。不可以當成權重或機率。';


-- ── 權限 ──────────────────────────────────────────────
REVOKE ALL ON reading_questions       FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON reading_question_keys   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON reading_question_skills FROM PUBLIC, anon, authenticated, service_role;

-- 題幹與選項：登入者讀得到（而且只有已上架文章的，見政策）
GRANT SELECT ON reading_questions TO authenticated;
GRANT ALL    ON reading_questions TO service_role;

-- 🛑 答案：【不給 authenticated 任何權限】。連 SELECT 都沒有。
GRANT ALL ON reading_question_keys TO service_role;

-- micro-skill：v1 學生端用不到，比照答案不發 grant。
GRANT ALL ON reading_question_skills TO service_role;

ALTER TABLE reading_questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_question_keys   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_question_skills ENABLE ROW LEVEL SECURITY;

-- 題目：只看得到已上架文章底下的題目
DROP POLICY IF EXISTS reading_questions_published_read ON reading_questions;
CREATE POLICY reading_questions_published_read ON reading_questions
  FOR SELECT TO authenticated
  USING (
    coalesce(public.is_admin(), false)
    OR EXISTS (SELECT 1 FROM public.reading_passages p
                WHERE p.passage_id = reading_questions.passage_id
                  AND p.status = 'PUBLISHED')
  );

-- 🛑 reading_question_keys 【刻意沒有任何 authenticated 政策】。
--    兩層都不給：沒有 grant，也沒有政策。少任何一層都還擋得住，
--    兩層一起才是「就算有人不小心補了 grant 也還是讀不到」。
DROP POLICY IF EXISTS reading_question_keys_service_all ON reading_question_keys;
CREATE POLICY reading_question_keys_service_all ON reading_question_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS reading_question_skills_service_all ON reading_question_skills;
CREATE POLICY reading_question_skills_service_all ON reading_question_skills
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 驗證（唯讀）───────────────────────────────────────
-- 預期：keys 與 skills 的「登入者可讀」都是 false
SELECT c.relname,
       c.relrowsecurity                                      AS "RLS 開啟",
       has_table_privilege('anon',          c.oid, 'SELECT') AS "anon可讀",
       has_table_privilege('authenticated', c.oid, 'SELECT') AS "登入者可讀",
       (SELECT count(*)::int FROM pg_policies pol
         WHERE pol.schemaname='public' AND pol.tablename=c.relname) AS "政策數"
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('reading_questions','reading_question_keys','reading_question_skills')
 ORDER BY c.relname;
