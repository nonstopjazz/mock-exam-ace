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
-- 🛑 這一支必須在上面那支【之後】載入：它會 DROP 舊簽章再重建，
--    加上姓名搜尋（A）與「班級含已離開」（B）。
--    順序顛倒的話 DROP 會打到空氣，然後舊簽章又被建回來。
\ir ../migrations/add_writing_error_tracking_search_and_history.sql
\ir ../migrations/create_writing_my_errors_1_overview.sql
\ir ../migrations/create_writing_my_errors_2_findings.sql

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
\echo '════════ 5b. 🛑 p_include_left：班級含已離開（2026-10-09）════════'
-- 🛑 為什麼需要這個開關：
--    班級語意是 S1「目前在籍」，所以學生一旦被標記離開，在【任何】班級篩選下
--    都找不到他 —— 只會出現在「所有班級」裡，而那正是會截斷的那份清單。
--    截斷時畫面建議「縮小班級或時間範圍」，但對已離開的學生縮小班級做不到。
--    兩件事互相鎖死，而且今天標記任何一位學生離開就會發生，不用等到明年。
--
-- Cara 此刻是【已退出】狀態（上面最後一行 UPDATE 設回 left_at）。

-- 對照組先跑：預設必須與改版前一致，不然下面的差異證明不了是開關造成的。
SELECT t_assert(
  (writing_admin_error_students(:clsA,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE'],
                                p_include_left => false) ->> 'total')::int = 2,
  '🛑 T19b 對照組：include_left = false 時仍然是 2 位（預設不改變現有行為）');
SELECT t_assert(
  (writing_admin_error_students(:clsA,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE'],
                                p_include_left => true) ->> 'total')::int = 3,
  '🛑 T19c include_left = true 時 Cara 回到清單（2 → 3）');
SELECT t_assert(
  EXISTS (SELECT 1 FROM jsonb_array_elements(
            writing_admin_error_students(:clsA,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE'],
                                         p_include_left => true) -> 'rows') r
           WHERE r ->> 'student_name' = 'cara'),
  'T19d 而且清單裡真的有 cara（不只是數字變了）');

-- 🛑 開關在【共用 scope】上，所以四支的數字要一起動。
--    只加在其中一支，老師會看到「A5 說 3 位、A6 說 2 位」這種對不起來的畫面。
SELECT t_assert(
  (writing_admin_student_errors(:clsA,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE'],
                                p_include_left => true) ->> 'student_total')::int = 3
  AND (writing_admin_student_errors(:clsA,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE'],
                                    p_include_left => false) ->> 'student_total')::int = 2,
  '🛑 T19e A6 跟著一起動（3 / 2），與 A5 的數字對得起來');
SELECT t_assert(
  (SELECT (r ->> 'student_count')::int
     FROM jsonb_array_elements(
            writing_admin_error_overview(:clsA,NULL,NULL,NULL,NULL,
                                         p_include_left => true) -> 'rows') r
    WHERE r ->> 'error_code' = 'WRITE_ERR_ARTICLE') = 3,
  'T19f A4 的 student_count 也跟著動');

-- 🛑 這一條守住「清單上有、點開卻沒有」那種最難查的不一致。
--    A7 若不吃 include_left，老師在「含已離開」狀態下點開 Cara 的錯誤會是空的。
SELECT t_assert(
  (writing_admin_error_findings(:cara,'WRITE_ERR_ARTICLE',:clsA,NULL,NULL,NULL,
                                p_include_left => false) ->> 'total')::int = 0,
  'T19g 對照組：A7 在 include_left = false 時撈不到已離開學生（這就是那個不一致）');
SELECT t_assert(
  (writing_admin_error_findings(:cara,'WRITE_ERR_ARTICLE',:clsA,NULL,NULL,NULL,
                                p_include_left => true) ->> 'total')::int > 0,
  '🛑 T19h A7 吃 include_left，所以點開看得到 —— 清單與明細一致');

-- 沒有班級篩選時這個開關不該有任何作用（它只影響 membership 那一段）
SELECT t_assert(
  (writing_admin_error_students(NULL,NULL,NULL,NULL,NULL,p_include_left => true) ->> 'total')::int
  = (writing_admin_error_students(NULL,NULL,NULL,NULL,NULL,p_include_left => false) ->> 'total')::int,
  'T19i class_id 是 NULL 時，include_left 不改變任何結果');

\echo ''
\echo '════════ 5c. 🛑 p_name_query：姓名搜尋（2026-10-09）════════'
-- 🛑 為什麼一定要做在伺服器端：
--    依學生查看的上限是 100 位，而截斷保留的是【錯誤最多】的前 100 位。
--    在前端對已載入的陣列搜尋，是在一份已經被截斷的資料上過濾 ——
--    搜不到的學生會看起來像「沒有錯誤紀錄」，實際上是沒被撈回來。
--    那比沒有搜尋更危險，因為它看起來能用。
-- 名字來自 email 的前半：amy / bob / cara / dan

SELECT t_assert(
  (writing_admin_student_errors(NULL,NULL,NULL,NULL,NULL,
                                p_name_query => 'amy') ->> 'student_total')::int = 1,
  'T19j 姓名搜尋 amy → 1 位');
SELECT t_assert(
  (writing_admin_student_errors(NULL,NULL,NULL,NULL,NULL,
                                p_name_query => 'AMY') ->> 'student_total')::int = 1,
  'T19k 不分大小寫（AMY 一樣找到）');
SELECT t_assert(
  (writing_admin_student_errors(NULL,NULL,NULL,NULL,NULL,
                                p_name_query => 'a') ->> 'student_total')::int = 3,
  'T19l 子字串比對：a → amy / cara / dan 三位（bob 沒有 a）');
SELECT t_assert(
  (writing_admin_student_errors(NULL,NULL,NULL,NULL,NULL,
                                p_name_query => '  amy  ') ->> 'student_total')::int = 1,
  'T19m 前後空白會被 btrim 掉');
SELECT t_assert(
  (writing_admin_student_errors(NULL,NULL,NULL,NULL,NULL,
                                p_name_query => '   ') ->> 'student_total')::int = 4,
  '🛑 T19n 只有空白＝沒有搜尋條件（4 位全回），不是「找不到人」');
SELECT t_assert(
  (writing_admin_student_errors(NULL,NULL,NULL,NULL,NULL,
                                p_name_query => 'zzz') ->> 'student_total')::int = 0
  AND jsonb_array_length(
        writing_admin_student_errors(NULL,NULL,NULL,NULL,NULL,
                                     p_name_query => 'zzz') -> 'rows') = 0,
  'T19o 查無此人時 total = 0 而且 rows 是空陣列');

-- 🛑 萬用字元跳脫。這兩條是「結果看起來正常但其實是錯的」那一類，
--    沒有斷言的話永遠不會有人發現。
SELECT t_assert(
  (writing_admin_student_errors(NULL,NULL,NULL,NULL,NULL,
                                p_name_query => '%') ->> 'student_total')::int = 0,
  '🛑 T19p 輸入 % 不會比對到全部（沒跳脫的話會回 4 位）');
SELECT t_assert(
  (writing_admin_student_errors(NULL,NULL,NULL,NULL,NULL,
                                p_name_query => 'a_y') ->> 'student_total')::int = 0,
  '🛑 T19q 輸入 a_y 不會當成萬用字元（沒跳脫的話會比對到 amy）');
SELECT t_assert(
  (writing_admin_student_errors(NULL,NULL,NULL,NULL,NULL,
                                p_name_query => 'am_') ->> 'student_total')::int = 0,
  'T19r 同上，_ 在結尾也一樣（沒跳脫會比對到 amy）');

-- 🛑 student_total 必須跟著姓名條件縮小。
--    若 total 保持全域而 limit 套在搜尋結果上，畫面那句
--    「只顯示前 N 位，共 M 位」就會說謊。
SELECT t_assert(
  (writing_admin_student_errors(NULL,NULL,NULL,NULL,NULL,
                                p_name_query => 'amy') ->> 'student_total')::int
  < (writing_admin_student_errors(NULL,NULL,NULL,NULL,NULL) ->> 'student_total')::int,
  '🛑 T19s student_total 跟著姓名條件縮小（1 < 4），截斷訊息才不會說謊');

-- 🛑 S-b 在搜尋狀態下仍然成立：因 ARTICLE 入列的 Amy，
--    她【全部】的 code 都要列出來，不是只有 ARTICLE。
SELECT t_assert(
  EXISTS (SELECT 1 FROM jsonb_array_elements(
            writing_admin_student_errors(NULL,NULL,NULL,NULL,ARRAY['WRITE_ERR_ARTICLE'],
                                         p_name_query => 'amy') -> 'rows') r
           WHERE r ->> 'error_code' = 'WRITE_ERR_SV_AGREEMENT'),
  '🛑 T19t 姓名搜尋不破壞 S-b：Amy 的 SV_AGREEMENT 仍然一起回傳');

-- 伺服器要回報它【實際套用】的條件，畫面才能顯示真相而不是輸入框裡的字
SELECT t_assert(
  (writing_admin_student_errors(NULL,NULL,NULL,NULL,NULL,
                                p_name_query => '  amy  ') ->> 'name_query') = 'amy'
  AND (writing_admin_student_errors(NULL,NULL,NULL,NULL,NULL,
                                    p_name_query => '   ') -> 'name_query') = 'null'::jsonb,
  'T19u 回傳實際套用的 name_query（btrim 過；只有空白時是 null）');

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
-- 🛑 用【名字】查而不是把簽章寫死成字串。
--    這一條原本寫死 'writing_error_scoped_findings(uuid,...,text[])'，
--    2026-10-09 加 p_include_left 之後簽章改了，斷言就變成
--    「function does not exist」而整支測試中斷 ——
--    而它想守的事（這支函式誰都不給 EXECUTE）其實完全沒變。
--    斷言要綁在意圖上，不是綁在簽章字串上。
SELECT t_assert(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='writing_error_scoped_findings') = 1,
  'T41a 共用 scope 函式只有一個版本（沒有留下舊 overload）');
SELECT t_assert(
  (SELECT bool_and(NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
                   AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
                   AND NOT has_function_privilege('anon', p.oid, 'EXECUTE'))
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='writing_error_scoped_findings'),
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
\echo '════════ 11. 學生版：writing_my_error_* ════════'
--
-- 🛑 這一段最重要的是【跨學生隔離】。老師版靠 is_admin() 擋，
--    學生版沒有任何 student_id 參數——授權不是靠檢查參數，是靠參數不存在。
--    所以要證明的是：切換 auth.uid() 就只會看到那個人的資料，
--    而且沒有任何辦法從外面指定別人。

-- Amy 的形狀（見上方 fixture）：
--   ARTICLE ×3（2 篇）、SV_AGREEMENT ×2（1 篇）、
--   PUNCTUATION ×1（1 篇）、GRAMMAR_OTHER ×1（1 篇）、CHINGLISH ×1（1 篇，7 月）
SELECT set_config('test.uid','a0000000-0000-0000-0000-000000000001',false);

SELECT t_assert(
  (writing_my_error_overview() -> 'rows' -> 0 ->> 'error_code') = 'WRITE_ERR_ARTICLE',
  'T46 排第一的是出現在最多篇作文裡的錯（ARTICLE，2 篇）');
SELECT t_assert(
  ((writing_my_error_overview() -> 'rows' -> 0 ->> 'essay_count')::int = 2
   AND (writing_my_error_overview() -> 'rows' -> 0 ->> 'occurrence_count')::int = 3),
  'T47 ARTICLE 是 2 篇 / 3 次');
SELECT t_assert(
  NOT (writing_my_error_overview() -> 'rows' -> 0 ? 'student_count'),
  'T48 【沒有】student_count 欄位（對一個人來說永遠是 1，只會佔位置）');
SELECT t_assert(
  (writing_my_error_overview() ->> 'essay_total')::int = 3,
  'T49 essay_total 是我有 findings 的作文數（Amy 有 3 篇）');

-- 🛑 門檻測試：只犯過一次的也必須列出來，與老師版同一條規則
SELECT t_assert(
  EXISTS (SELECT 1 FROM jsonb_array_elements(writing_my_error_overview() -> 'rows') r
           WHERE r ->> 'error_code' = 'WRITE_ERR_PUNCTUATION'),
  'T50 只犯過一次的 code 也在清單裡（沒有 HAVING 門檻）');

-- ── 跨學生隔離 ────────────────────────────────────────
-- Bob 只有 1 筆 ARTICLE。切過去之後絕對不能看到 Amy 的任何東西。
SELECT set_config('test.uid','a0000000-0000-0000-0000-000000000002',false);
SELECT t_assert(
  (writing_my_error_overview() ->> 'total')::int = 1,
  'T51 Bob 只看得到自己的 1 個 code');
SELECT t_assert(
  (writing_my_error_overview() -> 'rows' -> 0 ->> 'occurrence_count')::int = 1,
  'T52 Bob 的 ARTICLE 是 1 次，不是 Amy 的 3 次');
SELECT t_assert(
  (SELECT count(*)::int FROM jsonb_array_elements(
     writing_my_error_findings('WRITE_ERR_ARTICLE') -> 'rows')) = 1,
  'T53 Bob 的 drill-down 只有自己那 1 筆');
SELECT t_assert(
  NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
                writing_my_error_findings() -> 'rows') r
               WHERE r ->> 'quote' IN ('go to park','is best','visited museum')),
  'T54 Bob 的 drill-down 裡沒有任何一句是 Amy 寫的');

-- ── 退出班級的學生仍然看得到自己的資料 ────────────────
-- 🛑 班級是【老師】的篩選維度。學生看自己的錯誤與班級無關，
--    退出班級不該讓他看不到自己寫過的東西。
SELECT set_config('test.uid','a0000000-0000-0000-0000-000000000003',false);
SELECT t_assert(
  (writing_my_error_overview() ->> 'total')::int = 1,
  'T55 已退出班級的 Cara 仍然看得到自己的錯誤');

-- ── 沒有作文的人 ──────────────────────────────────────
SELECT set_config('test.uid','a0000000-0000-0000-0000-00000000009f',false);
SELECT t_assert(
  writing_my_error_overview() -> 'rows' = '[]'::jsonb
  AND (writing_my_error_overview() ->> 'essay_total')::int = 0,
  'T56 沒有任何 findings 的人回空陣列，不是 NULL');

-- ── 未登入 ────────────────────────────────────────────
SELECT set_config('test.uid','',false);
DO $t57$ BEGIN
  PERFORM writing_my_error_overview();
  RAISE EXCEPTION 'FAIL  T57 未登入卻查得到';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL %' THEN RAISE; END IF;
  RAISE NOTICE 'PASS  T57 未登入被擋（%）', left(SQLERRM, 20);
END $t57$;

-- ── drill-down 的內容與排序 ───────────────────────────
SELECT set_config('test.uid','a0000000-0000-0000-0000-000000000001',false);
SELECT t_assert(
  (SELECT count(*)::int FROM jsonb_array_elements(
     writing_my_error_findings('WRITE_ERR_ARTICLE') -> 'rows')) = 3,
  'T58 Amy 的 ARTICLE drill-down 有 3 筆');
SELECT t_assert(
  (writing_my_error_findings('WRITE_ERR_ARTICLE') -> 'rows' -> 0 ->> 'essay_submitted_at')::date
    >= (writing_my_error_findings('WRITE_ERR_ARTICLE') -> 'rows' -> 2 ->> 'essay_submitted_at')::date,
  'T59 drill-down 依時間新到舊');
-- 🛑 整句改寫的 correction 不可以被截斷——畫面要拿它跟 quote 做逐詞比對
SELECT t_assert(
  (SELECT max(length(r ->> 'correction')) FROM jsonb_array_elements(
     writing_my_error_findings('WRITE_ERR_PUNCTUATION') -> 'rows') r) > 100,
  'T60 超過 100 字元的 correction 原樣回傳，沒有被截斷');
SELECT t_assert(
  writing_my_error_findings('不存在的code') -> 'rows' = '[]'::jsonb,
  'T61 查不存在的 code 回空陣列');

-- ── 權限 ──────────────────────────────────────────────
SELECT t_assert(
  (SELECT bool_and(p.prosecdef AND p.proconfig::text = '{"search_path=\"\""}')
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'writing_my_error%'),
  'T62 兩支都是 SECURITY DEFINER + SET search_path = ''''');
SELECT t_assert(
  NOT has_function_privilege('anon','writing_my_error_overview(integer)','EXECUTE')
  AND NOT has_function_privilege('anon','writing_my_error_findings(text,integer)','EXECUTE'),
  'T63 anon 兩支都叫不動');
SELECT t_assert(
  has_function_privilege('authenticated','writing_my_error_overview(integer)','EXECUTE')
  AND has_function_privilege('authenticated','writing_my_error_findings(text,integer)','EXECUTE'),
  'T64 登入者兩支都叫得動');
-- 🛑 這一條守住整個設計：函式不可以有 student_id 之類的參數。
--    有了參數，授權就變成「記得檢查」；沒有參數，就沒有東西可以忘記檢查。
SELECT t_assert(
  (SELECT bool_and(pg_get_function_arguments(p.oid) NOT LIKE '%student%')
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'writing_my_error%'),
  'T65 兩支都沒有 student 參數（對象只能是 auth.uid()）');

\echo ''
\echo '全部通過。'
