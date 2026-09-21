-- =====================================================
-- A4–A7 查詢 RPC 資料層測試
--
-- ⚠️ psql 專用（\set / \echo / \ir）。不要貼進 Supabase SQL Editor。
-- ⚠️ 只在本機臨時資料庫跑。
--
--   createdb wq
--   psql -v ON_ERROR_STOP=1 -d wq -f supabase/tests/writing_error_query_rpcs_test.sql
--
-- 🛑 這支測試最重要的工作是守住【沒有門檻】這條規則。
--    T3 / T9 / T14 若失敗，代表有人加了 HAVING 之類的過濾 ——
--    那會讓老師最想追蹤的案例（只犯過一次）直接消失。
-- =====================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION t_assert(cond BOOLEAN, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

-- ── 最小 schema ──────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT);
CREATE TABLE user_profiles (user_id UUID PRIMARY KEY, display_name TEXT);

CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION public.is_admin() RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT nullif(current_setting('test.is_admin', true), '')::boolean $$;
CREATE FUNCTION public.learn_display_name(p UUID) RETURNS TEXT
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT coalesce(nullif(btrim(pr.display_name),''), split_part(u.email,'@',1), '未命名學生')
    FROM auth.users u LEFT JOIN public.user_profiles pr ON pr.user_id=u.id WHERE u.id=p $$;

CREATE TABLE learn_classes (id UUID PRIMARY KEY, name TEXT, status TEXT DEFAULT 'ACTIVE');
CREATE TABLE learn_class_members (
  class_id UUID NOT NULL, student_id UUID NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now(), left_at TIMESTAMPTZ,
  PRIMARY KEY (class_id, student_id));

CREATE TABLE writing_submissions (
  id UUID PRIMARY KEY, student_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT, essay_topic TEXT, status TEXT NOT NULL, submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE writing_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), essay_id UUID NOT NULL,
  content TEXT NOT NULL, char_count INTEGER GENERATED ALWAYS AS (char_length(content)) STORED,
  word_count INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE writing_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), essay_id UUID NOT NULL,
  status TEXT NOT NULL, analysis_version INTEGER NOT NULL, error_analysis JSONB,
  UNIQUE (essay_id, analysis_version));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

\ir ../migrations/create_writing_error_findings.sql
\ir ../migrations/create_writing_error_findings_sync.sql
\ir ../migrations/create_writing_error_query_rpcs.sql

-- ── 資料 ─────────────────────────────────────────────────────────
-- Amy  ：高二A 在籍。ARTICLE 多、另有數個只出現一次的 code
-- Bob  ：高二A 在籍。ARTICLE 只有 1 篇 / 1 finding  ← 門檻測試的主角
-- Cara ：高二A 【已退出】。有 ARTICLE  ← left_at 測試
-- Dan  ：沒有班級。只有 SPELLING（沒有 ARTICLE）
\set amy  '''a0000000-0000-0000-0000-000000000001'''
\set bob  '''a0000000-0000-0000-0000-000000000002'''
\set cara '''a0000000-0000-0000-0000-000000000003'''
\set dan  '''a0000000-0000-0000-0000-000000000004'''
\set clsA '''c0000000-0000-0000-0000-00000000000a'''

INSERT INTO auth.users (id, email) VALUES
 (:amy,'amy@x.com'), (:bob,'bob@x.com'), (:cara,'cara@x.com'), (:dan,'dan@x.com');
INSERT INTO learn_classes (id, name) VALUES (:clsA, '高二A');
INSERT INTO learn_class_members (class_id, student_id, left_at) VALUES
 (:clsA, :amy, NULL), (:clsA, :bob, NULL),
 (:clsA, :cara, now() - interval '5 days');     -- 已退出

INSERT INTO writing_submissions (id, student_id, title, essay_topic, status, submitted_at) VALUES
 ('e0000000-0000-0000-0000-000000000001', :amy,  'A1','My Summer','SUBMITTED','2026-09-18'),
 ('e0000000-0000-0000-0000-000000000002', :amy,  'A2','A Letter', 'SUBMITTED','2026-09-11'),
 ('e0000000-0000-0000-0000-000000000003', :amy,  'A3','My Summer','SUBMITTED','2026-07-01'), -- 時間 filter 用
 ('e0000000-0000-0000-0000-000000000004', :bob,  'B1','My Summer','SUBMITTED','2026-09-17'),
 ('e0000000-0000-0000-0000-000000000005', :cara, 'C1','My Summer','SUBMITTED','2026-09-16'),
 ('e0000000-0000-0000-0000-000000000006', :dan,  'D1','A Letter', 'SUBMITTED','2026-09-15');
INSERT INTO writing_texts (essay_id, content, word_count)
 SELECT id, 'x', 180 FROM writing_submissions;

-- findings 直接寫進表（這一批測的是查詢層，不是物化層）。
-- analysis_id 有 FK，所以每篇作文先補一列 COMPLETED 分析。
INSERT INTO writing_analyses (essay_id, status, analysis_version, error_analysis)
  SELECT id, 'COMPLETED', 1, '{"taxonomy_version":"writing-v2","findings":[]}'::jsonb
    FROM writing_submissions;

INSERT INTO writing_error_findings
  (analysis_id, essay_id, analysis_version, finding_index, student_id, error_code,
   primary_skill, quote, reason, correction, essay_word_count, essay_topic,
   essay_submitted_at, taxonomy_version)
SELECT a.id, v.essay, 1, v.idx, v.stu, v.code, 'W2',
       v.quote, 'reason text', v.corr, 180, s.essay_topic, s.submitted_at, 'writing-v2'
  FROM (VALUES
    -- Amy：ARTICLE ×3（2 篇）、SV ×2（1 篇）、PUNCTUATION ×1（1 篇）← 只出現一次
    ('e0000000-0000-0000-0000-000000000001'::uuid, 0, :amy::uuid, 'WRITE_ERR_ARTICLE',     'go to park',   'go to the park'),
    ('e0000000-0000-0000-0000-000000000001'::uuid, 1, :amy::uuid, 'WRITE_ERR_ARTICLE',     'is best',      'is the best'),
    ('e0000000-0000-0000-0000-000000000001'::uuid, 2, :amy::uuid, 'WRITE_ERR_SV_AGREEMENT','he go',        'he goes'),
    ('e0000000-0000-0000-0000-000000000001'::uuid, 3, :amy::uuid, 'WRITE_ERR_SV_AGREEMENT','they was',     'they were'),
    -- 🔴 這一筆是【整句改寫】的 correction，超過 100 字元，測不會被截斷
    ('e0000000-0000-0000-0000-000000000001'::uuid, 4, :amy::uuid, 'WRITE_ERR_PUNCTUATION', 'However ,',
       'As the sun gradually rises over the horizon, the train stations slowly come into the public''s lives, and however, the noise begins.'),
    ('e0000000-0000-0000-0000-000000000002'::uuid, 0, :amy::uuid, 'WRITE_ERR_ARTICLE',     'visited museum','visited the museum'),
    ('e0000000-0000-0000-0000-000000000002'::uuid, 1, :amy::uuid, 'WRITE_ERR_GRAMMAR_OTHER','got scold',   'got scolded'),
    -- Amy 的舊作文（2026-07-01），時間 filter 要能把它排除
    ('e0000000-0000-0000-0000-000000000003'::uuid, 0, :amy::uuid, 'WRITE_ERR_CHINGLISH',   'open light',   'turn on the light'),
    -- Bob：ARTICLE 只有 1 篇 / 1 finding  ← 門檻測試的主角
    ('e0000000-0000-0000-0000-000000000004'::uuid, 0, :bob::uuid, 'WRITE_ERR_ARTICLE',     'in class',     'in the class'),
    -- Cara（已退出）：有 ARTICLE
    ('e0000000-0000-0000-0000-000000000005'::uuid, 0, :cara,'WRITE_ERR_ARTICLE',     'at school',    'at the school'),
    -- Dan（無班級）：SPELLING ×1
    ('e0000000-0000-0000-0000-000000000006'::uuid, 0, :dan::uuid, 'WRITE_ERR_SPELLING',    'recieve',      'receive'),
    -- 🛑 Dan 的 GRAMMAR_OTHER ×6 —— 刻意複製 production 的形狀：
    --    【少數學生、大量出現】。GRAMMAR_OTHER 在 production 是
    --    14 位學生 / 46 findings，依 findings 排會衝到第 3，依學生數排落在第 5。
    --    沒有這種資料，「依 student_count 排序」這個設計就測不出來
    --    —— 任何排序方式都會給出一樣的結果。
    ('e0000000-0000-0000-0000-000000000006'::uuid, 1, :dan::uuid, 'WRITE_ERR_GRAMMAR_OTHER','g1','c1'),
    ('e0000000-0000-0000-0000-000000000006'::uuid, 2, :dan::uuid, 'WRITE_ERR_GRAMMAR_OTHER','g2','c2'),
    ('e0000000-0000-0000-0000-000000000006'::uuid, 3, :dan::uuid, 'WRITE_ERR_GRAMMAR_OTHER','g3','c3'),
    ('e0000000-0000-0000-0000-000000000006'::uuid, 4, :dan::uuid, 'WRITE_ERR_GRAMMAR_OTHER','g4','c4'),
    ('e0000000-0000-0000-0000-000000000006'::uuid, 5, :dan::uuid, 'WRITE_ERR_GRAMMAR_OTHER','g5','c5'),
    ('e0000000-0000-0000-0000-000000000006'::uuid, 6, :dan::uuid, 'WRITE_ERR_GRAMMAR_OTHER','g6','c6')
  ) AS v(essay, idx, stu, code, quote, corr)
  JOIN writing_submissions s ON s.id = v.essay
  JOIN writing_analyses a ON a.essay_id = v.essay AND a.analysis_version = 1;

SELECT set_config('test.is_admin','true',false);

\echo ''
\echo '════════ 1. A4 Common Errors：排序與內容 ════════'
SELECT t_assert(
  (writing_admin_error_overview() -> 'rows' -> 0 ->> 'error_code') = 'WRITE_ERR_ARTICLE',
  'T1 依 student_count 排序：ARTICLE（3 位學生）排第一');
SELECT t_assert(
  (writing_admin_error_overview() -> 'rows' -> 0 ->> 'student_count')::int = 3,
  'T2 ARTICLE 有 3 位學生（Amy/Bob/Cara）');
SELECT t_assert(
  EXISTS (SELECT 1 FROM jsonb_array_elements(writing_admin_error_overview() -> 'rows') r
           WHERE r ->> 'error_code' = 'WRITE_ERR_PUNCTUATION'
             AND (r ->> 'occurrence_count')::int = 1),
  '🛑 T3 只出現 1 次的 PUNCTUATION 仍然在 A4 清單裡（沒有門檻）');
SELECT t_assert(
  (SELECT (r ->> 'is_fallback_code')::boolean FROM jsonb_array_elements(
     writing_admin_error_overview() -> 'rows') r
    WHERE r ->> 'error_code' = 'WRITE_ERR_GRAMMAR_OTHER') IS TRUE,
  'T4 GRAMMAR_OTHER 照常回傳且 is_fallback_code = true');
-- window function 不能寫在 WHERE 裡，所以先算出 lag 再過濾。
-- WITH ORDINALITY 保證窗框看到的是 JSON 陣列的原始順序。
SELECT t_assert(
  (SELECT count(*) FROM (
     SELECT (x.r ->> 'student_count')::int AS sc,
            lag((x.r ->> 'student_count')::int) OVER (ORDER BY x.ord) AS prev
       FROM jsonb_array_elements(writing_admin_error_overview() -> 'rows')
            WITH ORDINALITY AS x(r, ord)) q
    WHERE q.prev IS NOT NULL AND q.sc > q.prev) = 0,
  'T5 student_count 單調遞減（排序真的生效）');

-- 🛑 T5b 才是真正測得到「依 student_count 排序」的那一條。
--    T5 只證明結果是排過的，不證明是依哪一欄排的 ——
--    若資料裡沒有「學生少但出現多」的 code，兩種排序法會給出一樣的順序。
--    GRAMMAR_OTHER：2 位學生 / 7 次   vs   ARTICLE：3 位學生 / 5 次
--      依 student_count → ARTICLE 在前   ← 正確
--      依 occurrence    → GRAMMAR_OTHER 在前
SELECT t_assert(
  (SELECT (r ->> 'occurrence_count')::int FROM jsonb_array_elements(
     writing_admin_error_overview() -> 'rows') r
    WHERE r ->> 'error_code' = 'WRITE_ERR_GRAMMAR_OTHER') = 7
  AND (SELECT (r ->> 'student_count')::int FROM jsonb_array_elements(
     writing_admin_error_overview() -> 'rows') r
    WHERE r ->> 'error_code' = 'WRITE_ERR_GRAMMAR_OTHER') = 2,
  'T5b 測試資料裡確實有「學生少、出現多」的 code（GRAMMAR_OTHER 2 位 / 7 次）');
SELECT t_assert(
  (SELECT x.ord FROM jsonb_array_elements(writing_admin_error_overview() -> 'rows')
        WITH ORDINALITY AS x(r, ord) WHERE x.r ->> 'error_code' = 'WRITE_ERR_ARTICLE')
  < (SELECT x.ord FROM jsonb_array_elements(writing_admin_error_overview() -> 'rows')
          WITH ORDINALITY AS x(r, ord) WHERE x.r ->> 'error_code' = 'WRITE_ERR_GRAMMAR_OTHER'),
  '🛑 T5c ARTICLE（3 位學生 / 5 次）排在 GRAMMAR_OTHER（2 位 / 7 次）前面 —— 依學生數而非出現次數');

\echo ''
\echo '════════ 2. A5 Error → Students ════════'
SELECT t_assert(
  (writing_admin_error_students(NULL,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE']) ->> 'total')::int = 3,
  'T6 ARTICLE 撈出 3 位學生');
SELECT t_assert(
  EXISTS (SELECT 1 FROM jsonb_array_elements(
            writing_admin_error_students(NULL,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE']) -> 'rows') r
           WHERE r ->> 'student_name' = 'bob'
             AND (r ->> 'essay_count')::int = 1 AND (r ->> 'occurrence_count')::int = 1),
  '🛑 T7 Bob 的 1 篇 / 1 finding 出現在清單裡（沒有門檻）');
SELECT t_assert(
  (writing_admin_error_students(NULL,NULL,NULL,NULL,
     ARRAY['WRITE_ERR_ARTICLE','WRITE_ERR_SPELLING']) ->> 'total')::int = 4,
  'T8 多個 error code 採 OR：ARTICLE(3) ∪ SPELLING(Dan) = 4 位');
SELECT t_assert(
  (SELECT r -> 'matched_codes' FROM jsonb_array_elements(
     writing_admin_error_students(NULL,NULL,NULL,NULL,
       ARRAY['WRITE_ERR_ARTICLE','WRITE_ERR_SPELLING']) -> 'rows') r
    WHERE r ->> 'student_name' = 'dan') = '["WRITE_ERR_SPELLING"]'::jsonb,
  'T9 matched_codes 說明該生中的是哪幾個');

\echo ''
\echo '════════ 3. A6 Student → Errors（D8 = S-b）════════'
SELECT t_assert(
  (writing_admin_student_errors(NULL,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE'])
   ->> 'student_total')::int = 3,
  'T10 選 ARTICLE → 3 位學生入列');
SELECT t_assert(
  EXISTS (SELECT 1 FROM jsonb_array_elements(
            writing_admin_student_errors(NULL,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE']) -> 'rows') r
           WHERE r ->> 'student_name' = 'amy' AND r ->> 'error_code' = 'WRITE_ERR_SV_AGREEMENT'),
  '🛑 T11 S-b：Amy 因 ARTICLE 入列，但她的 SV_AGREEMENT 也一起回傳');
SELECT t_assert(
  EXISTS (SELECT 1 FROM jsonb_array_elements(
            writing_admin_student_errors(NULL,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE']) -> 'rows') r
           WHERE r ->> 'student_name' = 'amy' AND r ->> 'error_code' = 'WRITE_ERR_PUNCTUATION'
             AND (r ->> 'occurrence_count')::int = 1),
  '🛑 T12 S-b + 無門檻：Amy 只出現 1 次的 PUNCTUATION 也回傳');
SELECT t_assert(
  (SELECT (r ->> 'is_selected')::boolean FROM jsonb_array_elements(
     writing_admin_student_errors(NULL,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE']) -> 'rows') r
    WHERE r ->> 'student_name' = 'amy' AND r ->> 'error_code' = 'WRITE_ERR_ARTICLE') IS TRUE,
  'T13 選中的 code 標記 is_selected = true');
SELECT t_assert(
  (SELECT (r ->> 'is_selected')::boolean FROM jsonb_array_elements(
     writing_admin_student_errors(NULL,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE']) -> 'rows') r
    WHERE r ->> 'student_name' = 'amy' AND r ->> 'error_code' = 'WRITE_ERR_SV_AGREEMENT') IS FALSE,
  'T14 沒選中的 code 是 is_selected = false');
SELECT t_assert(
  NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
                writing_admin_student_errors(NULL,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE']) -> 'rows') r
               WHERE r ->> 'student_name' = 'dan'),
  'T15 沒有 ARTICLE 的 Dan 不入列（內層的確有套 code filter）');

\echo ''
\echo '════════ 4. 三者 scope 數字一致 ════════'
SELECT t_assert(
  (SELECT (r ->> 'student_count')::int FROM jsonb_array_elements(
     writing_admin_error_overview(NULL,NULL,NULL,NULL,NULL) -> 'rows') r
    WHERE r ->> 'error_code' = 'WRITE_ERR_ARTICLE')
  = (writing_admin_error_students(NULL,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE']) ->> 'total')::int,
  'T16 A4 的 ARTICLE student_count = A5 選 ARTICLE 的 total');
SELECT t_assert(
  (SELECT (r ->> 'occurrence_count')::int FROM jsonb_array_elements(
     writing_admin_error_overview(NULL,NULL,NULL,NULL,NULL) -> 'rows') r
    WHERE r ->> 'error_code' = 'WRITE_ERR_ARTICLE')
  = (SELECT sum((r ->> 'occurrence_count')::int)::int FROM jsonb_array_elements(
       writing_admin_error_students(NULL,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE']) -> 'rows') r),
  'T17 A4 的 ARTICLE occurrence_count = A5 各生加總');
SELECT t_assert(
  (writing_admin_error_students(NULL,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE']) ->> 'total')::int
  = (writing_admin_student_errors(NULL,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE']) ->> 'student_total')::int,
  'T18 A5 的 total = A6 的 student_total');

\echo ''
\echo '════════ 5. class filter 尊重 left_at IS NULL ════════'
SELECT t_assert(
  (writing_admin_error_students(:clsA,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE']) ->> 'total')::int = 2,
  '🛑 T19 用高二A 篩選只剩 Amy 與 Bob —— 已退出的 Cara 不算（S1）');
SELECT t_assert(
  NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
                writing_admin_error_students(:clsA,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE']) -> 'rows') r
               WHERE r ->> 'student_name' = 'cara'),
  'T20 Cara 確實不在班級篩選結果裡');
UPDATE learn_class_members SET left_at = NULL WHERE class_id = :clsA AND student_id = :cara;
SELECT t_assert(
  (writing_admin_error_students(:clsA,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE']) ->> 'total')::int = 3,
  'T21 Cara 重新加入後就回到清單（left_at 清回 NULL）');
UPDATE learn_class_members SET left_at = now() WHERE class_id = :clsA AND student_id = :cara;

\echo ''
\echo '════════ 6. topic / time filter ════════'
SELECT t_assert(
  (writing_admin_error_students(NULL,NULL,NULL,'A Letter',NULL) ->> 'total')::int = 2,
  'T22 topic filter：A Letter 只有 Amy 與 Dan');
SELECT t_assert(
  NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
                writing_admin_error_overview(NULL,'2026-09-01','2026-10-01',NULL,NULL) -> 'rows') r
               WHERE r ->> 'error_code' = 'WRITE_ERR_CHINGLISH'),
  'T23 time filter：Amy 2026-07-01 的 CHINGLISH 被排除在九月的範圍外');
SELECT t_assert(
  EXISTS (SELECT 1 FROM jsonb_array_elements(
            writing_admin_error_overview(NULL,'2026-06-01','2026-10-01',NULL,NULL) -> 'rows') r
           WHERE r ->> 'error_code' = 'WRITE_ERR_CHINGLISH'),
  'T24 放寬時間範圍後 CHINGLISH 又出現');
SELECT t_assert(
  NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
                writing_admin_error_overview(NULL,NULL,'2026-09-18',NULL,NULL) -> 'rows') r
               WHERE r ->> 'error_code' = 'WRITE_ERR_PUNCTUATION'),
  'T25 p_to 是【不含】上界：2026-09-18 當天的 findings 不算進 p_to = 2026-09-18');

\echo ''
\echo '════════ 7. A7 Drill-down ════════'
SELECT t_assert(
  (writing_admin_error_findings(:amy,'WRITE_ERR_ARTICLE') ->> 'total')::int = 3,
  'T26 Amy 的 ARTICLE 有 3 筆');
SELECT t_assert(
  (writing_admin_error_findings(:amy,'WRITE_ERR_ARTICLE') -> 'rows' -> 0 ->> 'essay_submitted_at')::timestamptz
  >= (writing_admin_error_findings(:amy,'WRITE_ERR_ARTICLE') -> 'rows' -> 2 ->> 'essay_submitted_at')::timestamptz,
  'T27 依時間新到舊排序');
SELECT t_assert(
  (SELECT count(*) FROM jsonb_array_elements(
     writing_admin_error_findings(:amy,'WRITE_ERR_ARTICLE') -> 'rows') r
    WHERE r ->> 'quote' IS NOT NULL AND r ->> 'correction' IS NOT NULL
      AND r ->> 'reason' IS NOT NULL AND r ->> 'finding_id' IS NOT NULL
      AND r ->> 'essay_id' IS NOT NULL AND r ->> 'primary_skill' IS NOT NULL) = 3,
  'T28 quote / correction / reason / finding_id / essay_id / primary_skill 都完整');
SELECT t_assert(
  (SELECT length(r ->> 'correction') FROM jsonb_array_elements(
     writing_admin_error_findings(:amy,'WRITE_ERR_PUNCTUATION') -> 'rows') r LIMIT 1) > 100,
  '🛑 T29 整句改寫的長 correction 原樣回傳，沒有被截斷（>100 字元）');
SELECT t_assert(
  (SELECT r ->> 'correction' FROM jsonb_array_elements(
     writing_admin_error_findings(:amy,'WRITE_ERR_PUNCTUATION') -> 'rows') r LIMIT 1)
  = (SELECT correction FROM writing_error_findings
      WHERE student_id = :amy AND error_code = 'WRITE_ERR_PUNCTUATION'),
  'T30 correction 與表裡的值逐字相同（沒有任何加工）');
SELECT t_assert(
  (writing_admin_error_findings(:amy, NULL) ->> 'total')::int = 8,
  'T31 p_error_code = NULL 時回傳該生【全部】findings');
DO $$
DECLARE v_ok BOOLEAN := false;
BEGIN
  BEGIN PERFORM public.writing_admin_error_findings(NULL, 'WRITE_ERR_ARTICLE');
  EXCEPTION WHEN OTHERS THEN v_ok := (SQLSTATE = '22023');
  END;
  PERFORM t_assert(v_ok, 'T32 p_student_id 必填，沒帶會明確報錯而不是全表掃描');
END $$;

\echo ''
\echo '════════ 8. LIMIT 生效 ════════'
SELECT t_assert(
  jsonb_array_length(writing_admin_error_overview(NULL,NULL,NULL,NULL,NULL,2) -> 'rows') = 2
  AND (writing_admin_error_overview(NULL,NULL,NULL,NULL,NULL,2) ->> 'truncated')::boolean IS TRUE,
  'T33 A4 的 LIMIT 生效，且 truncated = true');
SELECT t_assert(
  (writing_admin_error_overview(NULL,NULL,NULL,NULL,NULL,2) ->> 'total')::int > 2,
  'T34 truncated 時 total 仍然回報【完整】筆數（不會靜默少算）');
SELECT t_assert(
  jsonb_array_length(writing_admin_error_students(NULL,NULL,NULL,NULL,NULL,1) -> 'rows') = 1,
  'T35 A5 的 LIMIT 生效');
SELECT t_assert(
  (writing_admin_error_students(NULL,NULL,NULL,NULL,NULL,99999) ->> 'limit')::int = 500,
  'T36 超過上限的 p_limit 被夾到 500，不是無上限');
SELECT t_assert(
  (writing_admin_error_findings(:amy, NULL, NULL,NULL,NULL,NULL, 2) ->> 'limit')::int = 2
  AND jsonb_array_length(writing_admin_error_findings(:amy,NULL,NULL,NULL,NULL,NULL,2) -> 'rows') = 2,
  'T37 A7 的 LIMIT 生效');
SELECT t_assert(
  (writing_admin_student_errors(NULL,NULL,NULL,NULL,NULL,1) ->> 'student_limit')::int = 1,
  'T38 A6 的 student_limit 生效');

\echo ''
\echo '════════ 9. 授權 ════════'
DO $$
DECLARE v_blocked INT := 0;
BEGIN
  PERFORM set_config('test.is_admin','false',false);
  BEGIN PERFORM public.writing_admin_error_overview();  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='42501' THEN v_blocked := v_blocked + 1; END IF; END;
  BEGIN PERFORM public.writing_admin_error_students(); EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='42501' THEN v_blocked := v_blocked + 1; END IF; END;
  BEGIN PERFORM public.writing_admin_student_errors(); EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='42501' THEN v_blocked := v_blocked + 1; END IF; END;
  BEGIN PERFORM public.writing_admin_error_findings('a0000000-0000-0000-0000-000000000001');
    EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='42501' THEN v_blocked := v_blocked + 1; END IF; END;
  PERFORM t_assert(v_blocked = 4, 'T39 非管理員呼叫四支都被擋下（42501）');
  PERFORM set_config('test.is_admin','true',false);
END $$;
SELECT t_assert(
  (SELECT bool_and(NOT has_function_privilege('anon', p.oid, 'EXECUTE'))
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'writing_admin_%error%'),
  'T40 anon 對四支都沒有 EXECUTE');
SELECT t_assert(
  NOT has_function_privilege('authenticated',
    'writing_error_scoped_findings(uuid,timestamptz,timestamptz,text,text[])','EXECUTE')
  AND NOT has_function_privilege('service_role',
    'writing_error_scoped_findings(uuid,timestamptz,timestamptz,text,text[])','EXECUTE'),
  'T41 共用 scope 函式誰都不給（只有擁有者叫得動）');
SELECT t_assert(
  (SELECT bool_and(p.prosecdef AND p.proconfig::text = '{"search_path=\"\""}')
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'writing_admin_%error%'),
  'T42 四支都是 SECURITY DEFINER + SET search_path = ''''');
SELECT t_assert(
  (SELECT NOT p.prosecdef AND p.proconfig IS NULL
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname = 'writing_error_scoped_findings'),
  'T43 scope 函式【刻意】不是 DEFINER、也不帶 search_path（保留 inlining，見檔案註解）');

\echo ''
\echo '════════ 10. 空結果不會炸 ════════'
SELECT t_assert(
  writing_admin_error_overview(NULL,NULL,NULL,'不存在的題目',NULL) -> 'rows' = '[]'::jsonb,
  'T44 查無資料回空陣列，不是 NULL');
SELECT t_assert(
  (writing_admin_student_errors(NULL,NULL,NULL,'不存在的題目',NULL) ->> 'student_total')::int = 0,
  'T45 A6 查無學生時不會炸（v_students 為空的路徑）');

\echo ''
\echo '全部通過。'
