-- =====================================================
-- Six-Way Reading 匯入層測試
--
-- ⚠️ psql 專用。只在本機臨時資料庫跑。
--   createdb ri
--   psql -v ON_ERROR_STOP=1 -d ri -f supabase/tests/reading_import_test.sql
--
-- 🛑 I7 是這裡最重要的一條：一篇失敗不可以讓整批回滾。
--    那【不是】plpgsql 的預設行為——沒有 EXCEPTION 子句時，
--    任何錯誤都會讓整個函式呼叫回滾。若哪天有人把那個區塊拿掉，
--    296 篇裡一篇壞掉就會讓 295 篇白做，而且不會有任何警告。
--
-- 🛑 I9 守的是另一個方向：批次匯入【絕對不可以】覆蓋既有內容。
-- =====================================================

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

CREATE OR REPLACE FUNCTION t_assert(cond BOOLEAN, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

CREATE OR REPLACE FUNCTION t_expect_error(stmt TEXT, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE EXCEPTION 'FAIL  % （預期要失敗，但成功了）', label;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL %' THEN RAISE; END IF;
  RAISE NOTICE 'PASS  % （擋下：%）', label, left(SQLERRM, 46);
END $$;

\ir _local_harness.sql
\ir ../migrations/create_lexical_core.sql
\ir ../migrations/create_reading_passages.sql
\ir ../migrations/create_reading_questions.sql
\ir ../migrations/create_reading_passage_aux.sql
\ir ../migrations/create_reading_sessions.sql
\ir ../migrations/create_reading_publish_guard.sql
\ir ../migrations/create_reading_publish_guard_2_trigger.sql
\ir ../migrations/create_reading_import_1_batches.sql
\ir ../migrations/create_reading_import_2_hash.sql
\ir ../migrations/create_reading_import_3_one.sql
\ir ../migrations/create_reading_import_4_batch.sql

\set admin '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set stu   '''55555555-0000-0000-0000-000000000005'''
INSERT INTO auth.users (id) VALUES (:admin), (:stu);

-- canonical payload 產生器：六題齊全的一篇
CREATE OR REPLACE FUNCTION t_payload(p_id TEXT, p_title TEXT DEFAULT 'T',
                                     p_constructs TEXT[] DEFAULT ARRAY['SM','MI','SD','CO','CD','VC'],
                                     p_text TEXT DEFAULT 'A passage long enough to be real.')
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'passage', jsonb_build_object(
      'passage_id', p_id, 'title', p_title, 'passage_text', p_text,
      'content_source', 'REVISED', 'cefr_level', 'B2',
      'content_family', 'science', 'subdomain', 'geodesy'),
    'questions', (SELECT jsonb_agg(jsonb_build_object(
        'construct', c, 'display_order', ord,
        'question', 'Q ' || c,
        'options', jsonb_build_object('A','a','B','b','C','c','D','d'),
        'correct_answer', 'B', 'explanation', '因為 B。',
        'skills', jsonb_build_array(
          jsonb_build_object('skill_code','s1','emphasis',90),
          jsonb_build_object('skill_code','s2','emphasis',NULL))))
      FROM unnest(p_constructs) WITH ORDINALITY AS t(c, ord)),
    'paragraphs', jsonb_build_array(jsonb_build_object('paragraph_no',1,'description','開場')),
    'vocabulary', jsonb_build_array(
      jsonb_build_object('tier','CANDIDATE','term','settled','definition','decided','paragraph_no',1)));
$$;


\echo ''
\echo '════════ I. 授權 ════════'

SELECT set_config('app.uid', '55555555-0000-0000-0000-000000000005', false) IS NOT NULL;
SELECT set_config('app.is_admin', 'false', false) IS NOT NULL;
SELECT t_expect_error(
  $$SELECT reading_import_batch(jsonb_build_array(t_payload('X1')), 'f.xlsx')$$,
  'I1 非管理員被拒');

SELECT set_config('app.uid', '', false) IS NOT NULL;
SELECT t_expect_error(
  $$SELECT reading_import_batch(jsonb_build_array(t_payload('X1')), 'f.xlsx')$$,
  'I2 未登入被拒');

-- 🛑 內部函式不可以被直接叫用
SELECT set_config('app.uid', '55555555-0000-0000-0000-000000000005', false) IS NOT NULL;
SELECT t_assert(
  NOT has_function_privilege('authenticated','reading_import_one_passage(jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','reading_import_one_passage(jsonb)','EXECUTE'),
  'I3 單篇匯入函式誰都叫不動（沒有 is_admin 檢查，授權在批次那一層）');
SELECT t_assert(
  NOT has_function_privilege('anon','reading_import_batch(jsonb,text,uuid,boolean)','EXECUTE'),
  'I4 anon 叫不動批次 RPC');


\echo ''
\echo '════════ II. 正常匯入 ════════'

SELECT set_config('app.uid', 'aaaaaaaa-0000-0000-0000-00000000000a', false) IS NOT NULL;
SELECT set_config('app.is_admin', 'true', false) IS NOT NULL;

CREATE TEMP TABLE r AS
SELECT reading_import_batch(jsonb_build_array(t_payload('P1')), 'file.xlsx') AS j;

SELECT t_assert((SELECT (j -> 'results' -> 0 ->> 'status') FROM r) = 'imported',
  'I5 六題齊全的文章匯入成功');
SELECT t_assert((SELECT count(*)::int FROM reading_questions WHERE passage_id='P1') = 6,
  'I5 六題都寫進去了');
SELECT t_assert((SELECT count(*)::int FROM reading_question_keys k
                   JOIN reading_questions q ON q.id=k.question_id WHERE q.passage_id='P1') = 6,
  'I5 六個答案寫進 reading_question_keys');
SELECT t_assert((SELECT status FROM reading_passages WHERE passage_id='P1') = 'DRAFT',
  'I5 匯入後一律是 DRAFT，上架是另一個動作');
SELECT t_assert((reading_publish_readiness('P1') ->> 'ready')::boolean,
  'I6 而且它 publish-ready');
SELECT t_assert((SELECT emphasis IS NULL FROM reading_question_skills s
                   JOIN reading_questions q ON q.id=s.question_id
                  WHERE q.passage_id='P1' AND s.skill_code='s2' LIMIT 1),
  'I6 emphasis 的 null 原樣保存，沒有變成 0');
SELECT t_assert((SELECT count(*)::int FROM reading_passage_paragraphs WHERE passage_id='P1') = 1
            AND (SELECT count(*)::int FROM reading_passage_vocab WHERE passage_id='P1') = 1,
  'I6 段落與詞彙也寫進去了');
-- 🛑 回傳不可以帶正解
SELECT t_assert((SELECT j::text NOT LIKE '%correct_answer%' AND j::text NOT LIKE '%因為 B%' FROM r),
  'I6 RPC 回傳【不含】正解與解說');

-- 不完整的草稿：三題
SELECT reading_import_batch(jsonb_build_array(t_payload('P2','T',ARRAY['SM','MI','SD'])), 'file.xlsx');
SELECT t_assert((SELECT count(*)::int FROM reading_passages WHERE passage_id='P2') = 1,
  'I7 只有三題的文章【入得了庫】');
SELECT t_assert(NOT (reading_publish_readiness('P2') ->> 'ready')::boolean,
  'I7 但它不 publish-ready');
SELECT t_expect_error($$UPDATE reading_passages SET status='PUBLISHED' WHERE passage_id='P2'$$,
  'I7 而且上不了架');

-- 🛑 0 題 = blocked，不進資料庫。
--    產品規則：0 題 blocked／1–5 題 DRAFT／6 題可上架。
--    parser 那一側已經擋掉了，但 RPC【不信任前端】——瀏覽器 console 裡
--    一行 supabase.rpc() 就能送一份 0 題的 payload 進來。
CREATE TEMP TABLE rb AS
SELECT reading_import_batch(
  jsonb_build_array(jsonb_set(t_payload('P3'), '{questions}', '[]'::jsonb)),
  'file.xlsx') AS j;

SELECT t_assert((SELECT (j -> 'results' -> 0 ->> 'status') FROM rb) = 'blocked',
  '🛑 I7b 0 題的文章回 blocked');
SELECT t_assert((SELECT count(*)::int FROM reading_passages WHERE passage_id='P3') = 0,
  '🛑 I7b 而且【一列都沒有寫進去】——不是寫進去再標記');
SELECT t_assert((SELECT count(*)::int FROM reading_passage_paragraphs WHERE passage_id='P3') = 0
            AND (SELECT count(*)::int FROM reading_passage_vocab WHERE passage_id='P3') = 0,
  'I7b 段落與詞彙也沒有殘留');
SELECT t_assert((SELECT (j -> 'chunk' ->> 'blocked')::int FROM rb) = 1
            AND (SELECT (j -> 'chunk' ->> 'failed')::int FROM rb) = 0,
  '🛑 I7c blocked 自己數一欄，不會被混進 failed（缺料 ≠ 匯入壞掉）');
SELECT t_assert((SELECT (j -> 'batch' ->> 'blocked')::int FROM rb) = 1,
  'I7c 批次的累計數字也有 blocked');


\echo ''
\echo '════════ III. 冪等與衝突 ════════'

CREATE TEMP TABLE r2 AS
SELECT reading_import_batch(jsonb_build_array(t_payload('P1')), 'file.xlsx') AS j;
SELECT t_assert((SELECT (j -> 'results' -> 0 ->> 'status') FROM r2) = 'skipped',
  'I8 重送完全相同的內容 → skipped');
SELECT t_assert((SELECT count(*)::int FROM reading_questions WHERE passage_id='P1') = 6,
  'I8 而且沒有產生重複的題目');

CREATE TEMP TABLE r3 AS
SELECT reading_import_batch(
  jsonb_build_array(t_payload('P1','改過的標題')), 'file.xlsx') AS j;
SELECT t_assert((SELECT (j -> 'results' -> 0 ->> 'status') FROM r3) = 'conflict',
  '🛑 I9 內容不同 → conflict，【不覆蓋】');
SELECT t_assert((SELECT title FROM reading_passages WHERE passage_id='P1') = 'T',
  '🛑 I9 庫裡的內容原封不動');

-- 已有作答紀錄時，理由要講得更重
UPDATE reading_passages SET status='PUBLISHED' WHERE passage_id='P1';
INSERT INTO reading_sessions (id, student_id, passage_id)
VALUES ('cccccccc-0000-0000-0000-000000000001', :stu, 'P1');
INSERT INTO reading_attempts (session_id, question_id, student_id, selected_answer, is_correct)
SELECT 'cccccccc-0000-0000-0000-000000000001', id, :stu, 'B', true
  FROM reading_questions WHERE passage_id='P1' LIMIT 1;

SELECT t_assert(
  (reading_import_batch(jsonb_build_array(t_payload('P1','又改一次')), 'f.xlsx')
     -> 'results' -> 0 ->> 'reason') LIKE '%已經有學生作答%',
  '🛑 I10 已有作答紀錄時，拒絕的理由明講那個風險');


\echo ''
\echo '════════ IV. 一篇失敗不影響整批 ════════'
-- 🛑 這一條釘住 BEGIN…EXCEPTION。沒有它，整批會一起回滾。

CREATE TEMP TABLE r4 AS
SELECT reading_import_batch(jsonb_build_array(
    t_payload('OK1'),
    jsonb_set(t_payload('BAD1'), '{questions,0,correct_answer}', '"Z"'),  -- 正解不合法
    t_payload('OK2'),
    jsonb_set(t_payload('BAD2'), '{passage,cefr_level}', '"Z9"'),          -- CEFR 不合法
    t_payload('OK3')), 'mixed.xlsx') AS j;

SELECT t_assert((SELECT (j -> 'chunk' ->> 'imported')::int FROM r4) = 3,
  '🛑 I11 五篇裡三篇成功（壞的兩篇沒有拖垮整批）');
SELECT t_assert((SELECT (j -> 'chunk' ->> 'failed')::int FROM r4) = 2,
  'I11 兩篇 failed');
SELECT t_assert(
  (SELECT count(*)::int FROM reading_passages WHERE passage_id IN ('OK1','OK2','OK3')) = 3,
  '🛑 I12 三篇【真的寫進資料庫】了，不是只在回傳裡說成功');
SELECT t_assert(
  (SELECT count(*)::int FROM reading_passages WHERE passage_id IN ('BAD1','BAD2')) = 0,
  'I12 壞的兩篇一列都沒留下（subtransaction 回滾乾淨）');
SELECT t_assert(
  (SELECT count(*)::int FROM reading_questions WHERE passage_id IN ('BAD1','BAD2')) = 0,
  'I12 連題目也沒有殘留');
SELECT t_assert(
  (SELECT (j -> 'results' -> 1 ->> 'reason') FROM r4) LIKE '%正解%',
  'I13 每一篇都回傳自己的失敗原因');
SELECT t_assert(
  (SELECT (j -> 'results' -> 3 ->> 'reason') FROM r4) LIKE '%cefr%',
  'I13 第二篇的原因是 CEFR，不是別人的');


\echo ''
\echo '════════ V. 伺服器端驗證 ════════'

SELECT t_assert((reading_import_batch(jsonb_build_array(
    jsonb_set(t_payload('V1'), '{questions,0,construct}', '"IC"')), 'f.xlsx')
    -> 'results' -> 0 ->> 'reason') LIKE '%construct 不合法%',
  'I14 construct 只能是六個短碼');
SELECT t_assert((reading_import_batch(jsonb_build_array(
    jsonb_set(t_payload('V2'), '{questions,0,options,C}', '"  "')), 'f.xlsx')
    -> 'results' -> 0 ->> 'reason') LIKE '%四個選項%',
  'I15 選項空白被擋');
SELECT t_assert((reading_import_batch(jsonb_build_array(
    jsonb_set(t_payload('V3'), '{questions,0,skills,0,emphasis}', '150')), 'f.xlsx')
    -> 'results' -> 0 ->> 'reason') LIKE '%emphasis%',
  'I16 emphasis 超出 0–100 被擋');
SELECT t_assert((reading_import_batch(jsonb_build_array(
    jsonb_set(t_payload('V4'), '{vocabulary,0,tier}', '"BOGUS"')), 'f.xlsx')
    -> 'results' -> 0 ->> 'reason') LIKE '%tier%',
  'I17 vocab tier 不合法被擋');
SELECT t_assert((reading_import_batch(jsonb_build_array(
    jsonb_set(t_payload('V5'), '{paragraphs,0,paragraph_no}', '99')), 'f.xlsx')
    -> 'results' -> 0 ->> 'reason') LIKE '%paragraph_no%',
  'I18 paragraph_no 不合法被擋');
-- 同一個 construct 兩題
SELECT t_assert((reading_import_batch(jsonb_build_array(
    t_payload('V6','T',ARRAY['SM','SM','MI'])), 'f.xlsx')
    -> 'results' -> 0 ->> 'reason') LIKE '%超過一題%',
  'I19 同一篇同一個 construct 兩題被擋');
SELECT t_assert(
  (SELECT count(*)::int FROM reading_passages
    WHERE passage_id IN ('V1','V2','V3','V4','V5','V6')) = 0,
  'I20 被驗證擋下的六篇一列都沒進去');


\echo ''
\echo '════════ VI. 批次紀錄 ════════'

CREATE TEMP TABLE b AS
SELECT (reading_import_batch(jsonb_build_array(t_payload('B1')), 'batch.xlsx')
        ->> 'batch_id')::uuid AS id;

SELECT t_assert((SELECT filename FROM reading_import_batches
                  WHERE id=(SELECT id FROM b)) = 'batch.xlsx',
  'I21 批次紀錄留下檔名');
SELECT t_assert((SELECT admin_id FROM reading_import_batches
                  WHERE id=(SELECT id FROM b)) = :admin,
  'I21 以及是誰匯的');
SELECT t_assert((SELECT status FROM reading_import_batches
                  WHERE id=(SELECT id FROM b)) = 'IN_PROGRESS',
  'I22 沒帶 p_final 時批次還是進行中');

-- 第二批累加到同一個 batch
SELECT reading_import_batch(jsonb_build_array(t_payload('B2')), 'batch.xlsx',
                            (SELECT id FROM b), true);
SELECT t_assert((SELECT total_count FROM reading_import_batches
                  WHERE id=(SELECT id FROM b)) = 2,
  'I23 第二批累加到同一個批次');
SELECT t_assert((SELECT status FROM reading_import_batches
                  WHERE id=(SELECT id FROM b)) = 'COMPLETED'
            AND (SELECT completed_at IS NOT NULL FROM reading_import_batches
                  WHERE id=(SELECT id FROM b)),
  'I23 帶 p_final 才收尾');

-- 🛑 批次紀錄不可以有題目內容
SELECT t_assert(
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_name='reading_import_batches'
      AND column_name IN ('passage_text','question','explanation','correct_answer')) = 0,
  'I24 批次紀錄表【沒有】任何存內容或答案的欄位');

-- 別人的批次不能接續
SELECT set_config('app.uid', '55555555-0000-0000-0000-000000000005', false) IS NOT NULL;
SELECT set_config('app.is_admin', 'true', false) IS NOT NULL;
SELECT t_expect_error(
  format($$SELECT reading_import_batch(jsonb_build_array(t_payload('B3')), 'x.xlsx', %L)$$,
         (SELECT id FROM b)),
  'I25 別人的批次接續不了');


\echo ''
\echo '════════ VII. 答案對學生不可讀 ════════'

SELECT t_assert(
  NOT has_table_privilege('authenticated','reading_question_keys','SELECT'),
  'I26 匯入之後，答案表對登入者仍然沒有 SELECT 權限');
SELECT t_assert(
  NOT has_table_privilege('authenticated','reading_import_batches','INSERT'),
  'I27 學生不能自己寫匯入紀錄');
SELECT t_assert(
  (SELECT qual::text LIKE '%is_admin%' FROM pg_policies
    WHERE tablename='reading_import_batches' AND policyname='reading_import_batches_admin_read'),
  'I28 匯入紀錄只有管理員讀得到');

\echo ''
\echo '全部通過。'
