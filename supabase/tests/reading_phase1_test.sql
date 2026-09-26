-- =====================================================
-- Six-Way Reading Phase 1 資料層測試
--
-- ⚠️ psql 專用（\set / \echo / \ir）。不要貼進 Supabase SQL Editor。
-- ⚠️ 只在本機臨時資料庫跑。
--
--   createdb rd
--   psql -v ON_ERROR_STOP=1 -d rd -f supabase/tests/reading_phase1_test.sql
--
-- 🛑 這支測試最重要的工作是 A 組：【答案在作答前讀不到】。
--    那不是靠 RPC 回傳形狀，是靠 reading_question_keys 沒有發給
--    authenticated 任何權限、也沒有給它的 RLS 政策。
--    A1–A6 若失敗，代表學生可以在 DevTools 裡一行把正解撈出來。
--
-- 其次是 B 組：不完整的文章【入得了庫但上不了架】。
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

-- 🛑 p_expect：期望的錯誤訊息片段。
--    不給的話任何錯誤都算通過——而「擋下了」與「擋下的是對的理由」
--    是兩件事。H12 第一次就是因為 uuid 轉型失敗而「通過」的：
--    授權檢查根本沒被執行到，測試卻是綠的。
--    授權類的斷言一律要帶 p_expect。
CREATE OR REPLACE FUNCTION t_expect_error(stmt TEXT, label TEXT,
                                          p_expect TEXT DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE EXCEPTION 'FAIL  % （預期要失敗，但成功了）', label;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL %' THEN RAISE; END IF;
  IF p_expect IS NOT NULL AND position(p_expect IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FAIL  % （擋下了，但理由不對：預期含「%」，實際是「%」）',
      label, p_expect, left(SQLERRM, 80);
  END IF;
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
\ir ../migrations/create_reading_student_rpc_1_fetch.sql
\ir ../migrations/create_reading_student_rpc_2_submit.sql
\ir ../migrations/create_reading_student_rpc_3_start.sql
\ir ../migrations/create_reading_student_rpc_4_finish.sql

-- ── 資料 ─────────────────────────────────────────────
-- FULL   六題齊全 → 可以上架
-- PARTIAL 只有三題 → 入得了庫，上不了架
-- NOKEY  六題但其中一題沒有答案 → 上不了架
\set stu  '''11111111-1111-1111-1111-111111111111'''
\set stu2 '''22222222-2222-2222-2222-222222222222'''
INSERT INTO auth.users (id) VALUES (:stu), (:stu2);

INSERT INTO reading_passages
  (passage_id, title, passage_text, content_source, cefr_level, content_family, status)
VALUES
  ('FULL',    'Full',    'Every year the industry produces many things.', 'WRITER',  'B2', 'science', 'DRAFT'),
  ('PARTIAL', 'Partial', 'A shorter text for the partial case.',          'REVISED', 'B2', 'science', 'DRAFT'),
  ('NOKEY',   'NoKey',   'A text whose questions lack one key.',          'FINAL',   'C1', 'history', 'DRAFT');

INSERT INTO reading_questions (passage_id, construct, question, option_a, option_b, option_c, option_d, display_order)
SELECT v.pid, v.c, 'Q ' || v.c, 'opt A', 'opt B', 'opt C', 'opt D', v.ord
  FROM (VALUES
    ('FULL','SM',1),('FULL','MI',2),('FULL','SD',3),('FULL','CO',4),('FULL','CD',5),('FULL','VC',6),
    ('PARTIAL','SM',1),('PARTIAL','MI',2),('PARTIAL','SD',3),
    ('NOKEY','SM',1),('NOKEY','MI',2),('NOKEY','SD',3),('NOKEY','CO',4),('NOKEY','CD',5),('NOKEY','VC',6)
  ) AS v(pid, c, ord);

-- FULL 與 PARTIAL 的題目都有答案；NOKEY 故意少一題的答案
INSERT INTO reading_question_keys (question_id, correct_answer, explanation)
SELECT q.id, 'B', '因為 B 才對。'
  FROM reading_questions q
 WHERE NOT (q.passage_id = 'NOKEY' AND q.construct = 'VC');

INSERT INTO reading_passage_paragraphs (passage_id, paragraph_no, description)
VALUES ('FULL', 1, '開場鉤子'), ('FULL', 2, '發展');
INSERT INTO reading_passage_vocab (passage_id, tier, term, definition, paragraph_no)
VALUES ('FULL','CANDIDATE','settled','firmly decided',1),
       ('FULL','ACADEMIC','evidence',NULL,NULL);
INSERT INTO reading_question_skills (question_id, skill_code, emphasis)
SELECT q.id, 'topic_identification', 90 FROM reading_questions q
 WHERE q.passage_id='FULL' AND q.construct='SM';
-- 來源資料真的有空的 emphasis，NULL 必須進得去
INSERT INTO reading_question_skills (question_id, skill_code, emphasis)
SELECT q.id, 'rhetorical_function', NULL FROM reading_questions q
 WHERE q.passage_id='FULL' AND q.construct='CD';


\echo ''
\echo '════════ A. 答案在作答前讀不到 ════════'

SELECT t_assert(
  NOT has_table_privilege('authenticated','reading_question_keys','SELECT'),
  'A1 authenticated 對 reading_question_keys 【沒有 SELECT 權限】');
SELECT t_assert(
  NOT has_table_privilege('anon','reading_question_keys','SELECT'),
  'A2 anon 更沒有');
SELECT t_assert(
  NOT has_table_privilege('authenticated','reading_question_keys','INSERT')
  AND NOT has_table_privilege('authenticated','reading_question_keys','UPDATE')
  AND NOT has_table_privilege('authenticated','reading_question_keys','DELETE'),
  'A3 連寫入也沒有——學生不能自己塞一個正解進去');
-- 🛑 兩層都要成立。就算有人日後不小心 GRANT 了，RLS 仍然擋住。
SELECT t_assert(
  (SELECT relrowsecurity FROM pg_class WHERE relname='reading_question_keys'),
  'A4 reading_question_keys 開著 RLS');
SELECT t_assert(
  NOT EXISTS (SELECT 1 FROM pg_policies
               WHERE tablename='reading_question_keys'
                 AND 'authenticated' = ANY (roles)),
  'A5 而且【沒有任何】給 authenticated 的政策（少了 grant 也不能靠政策補回來）');
SELECT t_assert(
  NOT has_table_privilege('authenticated','reading_question_skills','SELECT'),
  'A6 micro-skill 同樣不給——v1 學生端用不到');

-- 取題 RPC 的回傳裡不可以有答案的影子
-- 這個 harness 的身分鍵是 app.uid（見 _local_harness.sql）
SELECT set_config('app.uid', '11111111-1111-1111-1111-111111111111', false) IS NOT NULL;
UPDATE reading_passages SET status='PUBLISHED' WHERE passage_id='FULL';

SELECT t_assert(
  (reading_get_passage('FULL')::text NOT LIKE '%correct_answer%')
  AND (reading_get_passage('FULL')::text NOT LIKE '%explanation%')
  AND (reading_get_passage('FULL')::text NOT LIKE '%因為 B 才對%'),
  'A7 reading_get_passage 的回傳沒有正解、沒有解說');
SELECT t_assert(
  jsonb_array_length(reading_get_passage('FULL') -> 'questions') = 6,
  'A8 六題都回來了');
SELECT t_assert(
  (reading_get_passage('FULL') -> 'questions' -> 0 -> 'options' ->> 'A') = 'opt A',
  'A9 四個選項以 A/B/C/D 命名回傳');

-- 未上架的文章不給看，而且錯誤訊息不透露「存在但未上架」
SELECT t_expect_error($$SELECT reading_get_passage('PARTIAL')$$,
  'A10 未上架的文章讀不到');
SELECT t_expect_error($$SELECT reading_get_passage('NO_SUCH_ID')$$,
  'A11 不存在的 id 回同一種錯誤（不能用來探測哪些 id 存在）');


\echo ''
\echo '════════ B. 半成品入得了庫，上不了架 ════════'

SELECT t_assert(
  (SELECT count(*)::int FROM reading_passages WHERE passage_id='PARTIAL') = 1,
  'B1 只有三題的文章【入得了庫】');
SELECT t_assert(
  (reading_publish_readiness('PARTIAL') ->> 'ready')::boolean = false,
  'B2 但它不 ready');
SELECT t_assert(
  reading_publish_readiness('PARTIAL') -> 'missing' = '["CD","CO","VC"]'::jsonb,
  'B3 而且說得出缺哪三個 construct');
SELECT t_expect_error(
  $$UPDATE reading_passages SET status='PUBLISHED' WHERE passage_id='PARTIAL'$$,
  'B4 改成 PUBLISHED 被 trigger 擋下');
SELECT t_assert(
  (SELECT status FROM reading_passages WHERE passage_id='PARTIAL') = 'DRAFT',
  'B5 擋下之後狀態沒有被改掉');

-- 🛑 六題齊全但少一個答案，同樣不能上架
SELECT t_assert(
  (reading_publish_readiness('NOKEY') ->> 'ready')::boolean = false,
  'B6 六題齊全但缺一個答案 → 仍然不 ready');
SELECT t_expect_error(
  $$UPDATE reading_passages SET status='PUBLISHED' WHERE passage_id='NOKEY'$$,
  'B7 缺答案的文章也上不了架');
SELECT t_assert(
  (reading_publish_readiness('FULL') ->> 'ready')::boolean = true,
  'B8 六題齊全且都有答案 → ready');
SELECT t_assert(
  (SELECT status FROM reading_passages WHERE passage_id='FULL') = 'PUBLISHED',
  'B9 完整的文章上架成功');
-- 空白內容騙不過閘門
UPDATE reading_passages SET status='DRAFT' WHERE passage_id='FULL';
SELECT t_expect_error(
  $$UPDATE reading_questions SET option_c='   ' WHERE passage_id='FULL' AND construct='SM'$$,
  'B10 選項改成空白被 CHECK 擋下（連製造半成品的機會都沒有）');
UPDATE reading_passages SET status='PUBLISHED' WHERE passage_id='FULL';


\echo ''
\echo '════════ C. construct identity ════════'

SELECT t_expect_error(
  $$INSERT INTO reading_questions (passage_id, construct, question, option_a, option_b, option_c, option_d, display_order)
    VALUES ('FULL','SM','dup','a','b','c','d',1)$$,
  'C1 同一篇同一個 construct 不能有第二題');
SELECT t_expect_error(
  $$INSERT INTO reading_questions (passage_id, construct, question, option_a, option_b, option_c, option_d, display_order)
    VALUES ('FULL','主旨題','x','a','b','c','d',1)$$,
  'C2 中文標籤不是合法 construct（identity 只能是短碼）');
SELECT t_expect_error(
  $$INSERT INTO reading_questions (passage_id, construct, question, option_a, option_b, option_c, option_d, display_order)
    VALUES ('FULL','IC','x','a','b','c','d',1)$$,
  'C3 IC 也不是——六個短碼是 SM/MI/SD/CO/CD/VC');


\echo ''
\echo '════════ D. micro-skill：NULL 不等於 0 ════════'

SELECT t_assert(
  (SELECT emphasis IS NULL FROM reading_question_skills
    WHERE skill_code='rhetorical_function'),
  'D1 emphasis 可以是 NULL（來源真的有空值）');
SELECT t_assert(
  (SELECT count(*)::int FROM reading_question_skills WHERE emphasis = 0) = 0,
  'D2 而且沒有被悄悄轉成 0');
SELECT t_expect_error(
  $$INSERT INTO reading_question_skills (question_id, skill_code, emphasis)
    SELECT id, 'bad', 150 FROM reading_questions WHERE passage_id='FULL' AND construct='MI'$$,
  'D3 emphasis 超過 100 被擋');


\echo ''
\echo '════════ E. 作答：計分在伺服器端 ════════'

INSERT INTO reading_sessions (id, student_id, passage_id)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', :stu, 'FULL');

SELECT t_assert(
  (reading_submit_answer('aaaaaaaa-0000-0000-0000-000000000001',
     (SELECT id FROM reading_questions WHERE passage_id='FULL' AND construct='SM'),
     'B') ->> 'is_correct')::boolean = true,
  'E1 答對回 true');
SELECT t_assert(
  (reading_submit_answer('aaaaaaaa-0000-0000-0000-000000000001',
     (SELECT id FROM reading_questions WHERE passage_id='FULL' AND construct='MI'),
     'A') ->> 'is_correct')::boolean = false,
  'E2 答錯回 false');
SELECT t_assert(
  (reading_submit_answer('aaaaaaaa-0000-0000-0000-000000000001',
     (SELECT id FROM reading_questions WHERE passage_id='FULL' AND construct='MI'),
     'A') ->> 'correct_answer') = 'B',
  'E3 作答【之後】才拿得到正解');
SELECT t_assert(
  (SELECT count(*)::int FROM reading_attempts
    WHERE session_id='aaaaaaaa-0000-0000-0000-000000000001') = 2,
  'E4 兩題各留下一筆紀錄');

-- 🛑 重送同一題不會重新計分，也不會多一筆
SELECT t_assert(
  (reading_submit_answer('aaaaaaaa-0000-0000-0000-000000000001',
     (SELECT id FROM reading_questions WHERE passage_id='FULL' AND construct='MI'),
     'B') ->> 'is_correct')::boolean = false,
  'E5 重送同一題：即使改送正解，仍然回傳第一次的結果');
SELECT t_assert(
  (SELECT count(*)::int FROM reading_attempts
    WHERE session_id='aaaaaaaa-0000-0000-0000-000000000001') = 2,
  'E6 而且沒有多出一筆紀錄');

-- 🛑 別人的 session 不能用
INSERT INTO reading_sessions (id, student_id, passage_id)
VALUES ('bbbbbbbb-0000-0000-0000-000000000002', :stu2, 'FULL');
SELECT t_expect_error(
  $$SELECT reading_submit_answer('bbbbbbbb-0000-0000-0000-000000000002',
      (SELECT id FROM reading_questions WHERE passage_id='FULL' AND construct='SD'), 'B')$$,
  'E7 用別人的 session 作答被擋（SECURITY DEFINER 繞過 RLS，所以函式要自己擋）');

-- 🛑 不能拿自己的 session 去問別篇文章的題目
INSERT INTO reading_passages (passage_id, title, passage_text, content_source, status)
VALUES ('OTHER','Other','Another passage text here.','WRITER','DRAFT');
INSERT INTO reading_questions (passage_id, construct, question, option_a, option_b, option_c, option_d, display_order)
VALUES ('OTHER','SM','other q','a','b','c','d',1);
INSERT INTO reading_question_keys (question_id, correct_answer, explanation)
SELECT id, 'C', '別篇的解說' FROM reading_questions WHERE passage_id='OTHER';
SELECT t_expect_error(
  $$SELECT reading_submit_answer('aaaaaaaa-0000-0000-0000-000000000001',
      (SELECT id FROM reading_questions WHERE passage_id='OTHER'), 'A')$$,
  'E8 用這篇的 session 問別篇的題目被擋（否則等於免費拿到別篇的答案）');

SELECT t_expect_error(
  $$SELECT reading_submit_answer('aaaaaaaa-0000-0000-0000-000000000001',
      (SELECT id FROM reading_questions WHERE passage_id='FULL' AND construct='SD'), 'E')$$,
  'E9 不合法的選項被擋');

-- 已結束的 session 不能再作答
UPDATE reading_sessions SET status='SUBMITTED', submitted_at=now()
 WHERE id='aaaaaaaa-0000-0000-0000-000000000001';
SELECT t_expect_error(
  $$SELECT reading_submit_answer('aaaaaaaa-0000-0000-0000-000000000001',
      (SELECT id FROM reading_questions WHERE passage_id='FULL' AND construct='SD'), 'B')$$,
  'E10 已結束的練習不能再作答');


\echo ''
\echo '════════ F. 作答紀錄的權限 ════════'

SELECT t_assert(
  NOT has_table_privilege('authenticated','reading_attempts','INSERT')
  AND NOT has_table_privilege('authenticated','reading_attempts','UPDATE'),
  'F1 學生【不能】自己寫作答紀錄（否則可以自己 INSERT is_correct = true）');
SELECT t_assert(
  has_table_privilege('authenticated','reading_attempts','SELECT'),
  'F2 但讀得到——結果頁要用');
SELECT t_assert(
  (SELECT qual::text LIKE '%auth.uid()%' FROM pg_policies
    WHERE tablename='reading_attempts' AND policyname='reading_attempts_own_read'),
  'F3 而且政策綁 auth.uid()，只看得到自己的');
SELECT t_assert(
  NOT has_table_privilege('anon','reading_passages','SELECT'),
  'F4 未登入者連文章都讀不到');


\echo ''
\echo '════════ G. 函式安全設定 ════════'

SELECT t_assert(
  (SELECT bool_and(p.prosecdef AND p.proconfig::text = '{"search_path=\"\""}')
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('reading_get_passage','reading_submit_answer')),
  'G1 兩支學生端 RPC 都是 SECURITY DEFINER + SET search_path = ''''');
SELECT t_assert(
  NOT has_function_privilege('anon','reading_get_passage(text)','EXECUTE')
  AND NOT has_function_privilege('anon',
    'reading_submit_answer(uuid,uuid,character,integer,integer,character)','EXECUTE'),
  'G2 anon 兩支都叫不動');
SELECT t_assert(
  (SELECT bool_and(pg_get_function_arguments(p.oid) NOT LIKE '%student%')
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('reading_get_passage','reading_submit_answer')),
  'G3 兩支都沒有 student 參數（對象只能是 auth.uid()）');

\echo ''
\echo '════════ H. 學生用【真實身分】走完整條路 ════════'
-- 🛑 前面所有作答測試都是以 superuser 身分直接 INSERT session 的。
--    那條路學生走不到——reading_sessions 對 authenticated 只有 SELECT。
--    這一段【切換成 authenticated 角色】，只用 grant 出去的東西，
--    證明真實路徑接得起來。一個只有測試走得通的路徑不是路徑。

-- 專屬於這一段的學生：stu2 在 E7 已經有一個進行中的 session，會干擾 H2。
INSERT INTO auth.users (id) VALUES ('33333333-3333-3333-3333-333333333333');
SELECT set_config('app.uid', '33333333-3333-3333-3333-333333333333', false) IS NOT NULL;
SELECT set_config('app.is_admin', 'false', false) IS NOT NULL;
SET ROLE authenticated;

-- 學生不能自己建 session（否則可以偽造 passage_id）
SELECT t_expect_error(
  $$INSERT INTO reading_sessions (student_id, passage_id)
    VALUES (current_setting('app.uid')::uuid, 'FULL')$$,
  '🛑 H1 學生【不能】自己 INSERT session', 'permission denied');

CREATE TEMP TABLE h_start AS SELECT reading_start_session('FULL') AS j;
SELECT t_assert((SELECT (j ->> 'session_id') IS NOT NULL FROM h_start),
  '🛑 H2 學生用 RPC 拿得到 session_id —— 真實路徑走得通');
SELECT t_assert(NOT (SELECT (j ->> 'resumed')::boolean FROM h_start),
  'H2 第一次不是 resumed');

-- 🛑 重新整理／開第二個分頁：必須回到同一個 session，不是開新的
SELECT t_assert(
  (reading_start_session('FULL') ->> 'session_id')::uuid
    = (SELECT (j ->> 'session_id')::uuid FROM h_start),
  '🛑 H3 再叫一次回到同一個 session（partial unique index，不是先查再寫）');
SELECT t_assert((reading_start_session('FULL') ->> 'resumed')::boolean,
  'H3 而且講明它是接續的');
SELECT t_assert(
  (SELECT count(*)::int FROM reading_sessions
    WHERE student_id = current_setting('app.uid')::uuid AND passage_id='FULL') = 1,
  'H3 資料庫裡只有一列 session');

-- 沒上架的文章開不了
SELECT t_expect_error($$SELECT reading_start_session('PARTIAL')$$,
  'H4 沒上架的文章開不了練習（訊息與「不存在」相同，不可被用來探測）',
  '找不到這篇文章');

-- 取題 → 作答 → 結算，全部以學生身分
SELECT t_assert((reading_get_passage('FULL') -> 'questions') != '[]'::jsonb,
  'H5 取得題目');
SELECT t_assert((reading_get_passage('FULL'))::text NOT LIKE '%correct_answer%',
  '🛑 H5 取題回傳不含正解');

SELECT t_assert(
  (reading_submit_answer((SELECT (j ->> 'session_id')::uuid FROM h_start),
     (SELECT id FROM reading_questions WHERE passage_id='FULL' AND construct='SM'),
     'B') ->> 'is_correct')::boolean,
  'H6 學生身分作答，伺服器判定正確');

CREATE TEMP TABLE h_fin AS
SELECT reading_finish_session((SELECT (j ->> 'session_id')::uuid FROM h_start)) AS j;
SELECT t_assert((SELECT j ->> 'status' FROM h_fin) = 'SUBMITTED',
  '🛑 H7 session 收得掉 —— 沒有這支，狀態永遠停在 IN_PROGRESS');
SELECT t_assert((SELECT (j ->> 'answered')::int FROM h_fin) = 1
            AND (SELECT (j ->> 'correct')::int FROM h_fin) = 1,
  'H7 結算數字由伺服器統計');
SELECT t_assert(
  (SELECT count(*)::int FROM jsonb_array_elements((SELECT j -> 'by_construct' FROM h_fin))) = 6,
  'H7 六個 construct 都在結算裡');
SELECT t_assert(
  (SELECT count(*)::int FROM jsonb_array_elements((SELECT j -> 'by_construct' FROM h_fin)) e
    WHERE e ->> 'status' = 'SKIPPED') = 5,
  '🛑 H8 沒作答的五題標成 SKIPPED，不是 WRONG —— 沒寫跟寫錯不是同一件事');

-- 收掉之後不能再作答
SELECT t_expect_error(
  format($$SELECT reading_submit_answer(%L::uuid,
            (SELECT id FROM reading_questions WHERE passage_id='FULL' AND construct='MI'),
            'B')$$, (SELECT j ->> 'session_id' FROM h_start)),
  'H9 收掉之後不能再作答', '已經結束');

-- 🛑 別人的 session 碰不到
SELECT t_assert(
  (SELECT count(*)::int FROM reading_sessions WHERE student_id <> current_setting('app.uid')::uuid) = 0,
  '🛑 H10 RLS：學生看不到別人的 session');
SELECT t_expect_error($$SELECT correct_answer FROM reading_question_keys LIMIT 1$$,
  '🛑 H11 學生直接查答案表仍然被擋（權限層，不是靠 RPC 的形狀）', 'permission denied');

RESET ROLE;

-- 換一位學生，用第一位的 session_id 作答 → 必須被擋
SELECT set_config('app.uid', '22222222-2222-2222-2222-222222222222', false) IS NOT NULL;
SET ROLE authenticated;
SELECT t_expect_error(
  format($$SELECT reading_submit_answer(%L::uuid,
            (SELECT id FROM reading_questions WHERE passage_id='FULL' AND construct='SD'),
            'B')$$, (SELECT j ->> 'session_id' FROM h_start)),
  '🛑 H12 拿別人的 session_id 作答被擋（SECURITY DEFINER 繞過 RLS，所以函式自己擋）',
  '找不到這次練習');
SELECT t_expect_error(
  format($$SELECT reading_finish_session(%L::uuid)$$,
         (SELECT j ->> 'session_id' FROM h_start)),
  'H12 也結算不了別人的 session', '找不到這次練習');
RESET ROLE;


\echo ''
\echo '全部通過。'
