-- =====================================================
-- 選項亂序 reading_option_* + 四支 RPC
--
-- 🛑 這份測試存在的理由：亂序一旦算錯，症狀是【計分默默偏掉】。
--    不會有例外、不會有錯誤訊息，只會有一個看起來低一點的正確率——
--    而且每個學生亂的方式不一樣，所以不會有人一眼看出是排列的問題。
--    所以這裡一路走到底：取題 → 作答 → 結算，每一步都比對實際文字。
-- =====================================================

\set ON_ERROR_STOP on
\set QUIET on

CREATE OR REPLACE FUNCTION t_assert(cond BOOLEAN, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION t_expect_error(stmt TEXT, label TEXT,
                                          p_expect TEXT DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE EXCEPTION 'FAIL  % （預期要失敗，但成功了）', label;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL %' THEN RAISE; END IF;
  IF p_expect IS NOT NULL AND position(p_expect IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FAIL  % （理由不對：預期含「%」，實際「%」）',
      label, p_expect, left(SQLERRM, 80);
  END IF;
  RAISE NOTICE 'PASS  % （擋下：%）', label, left(SQLERRM, 40);
END $$;

\set stu '''11111111-1111-1111-1111-111111111111'''
\set other '''22222222-2222-2222-2222-222222222222'''
INSERT INTO auth.users (id) VALUES (:stu), (:other) ON CONFLICT DO NOTHING;

-- 重跑時先清乾淨。這份測試會一路寫到 reading_attempts，不清的話
-- 第二次執行會被上一次的資料誤導。
DELETE FROM reading_attempts USING reading_questions q
 WHERE q.id = reading_attempts.question_id AND q.passage_id = 'SH1';
DELETE FROM reading_sessions WHERE passage_id = 'SH1';
DELETE FROM reading_passages WHERE passage_id = 'SH1';

-- 🛑 四個選項的文字【互不相同】。都填 'a' 的話，排列錯了也比不出來。
INSERT INTO reading_passages (passage_id, title, passage_text, content_source, status)
VALUES ('SH1','Shuffle','A passage long enough to be a passage.','WRITER','DRAFT');
INSERT INTO reading_questions (passage_id, construct, question,
                               option_a, option_b, option_c, option_d, display_order)
SELECT 'SH1', c, 'Q '||c, 'opt-A','opt-B','opt-C','opt-D', ord
  FROM unnest(ARRAY['SM','MI','SD','CO','CD','VC']) WITH ORDINALITY AS t(c, ord);
-- 正解一律 B —— 就是題庫那個 47.2% 的偏斜
INSERT INTO reading_question_keys (question_id, correct_answer, explanation)
SELECT id, 'B', '因為 B。' FROM reading_questions WHERE passage_id='SH1';
UPDATE reading_passages SET status='PUBLISHED' WHERE passage_id='SH1';

\echo '════════ A. 排列本身 ════════'

SELECT t_assert(
  (SELECT bool_and(cardinality(p)=4 AND (SELECT count(DISTINCT x) FROM unnest(p) x)=4)
     FROM (SELECT reading_option_permutation(gen_random_uuid(), gen_random_uuid()) p
             FROM generate_series(1,300)) t),
  'A1 永遠是 A–D 的一個排列，不重複也不缺');

SELECT t_assert(
  reading_option_permutation('aaaaaaaa-0000-0000-0000-00000000000a',
                             '00000000-0000-0000-0000-0000000000aa')
  = reading_option_permutation('aaaaaaaa-0000-0000-0000-00000000000a',
                               '00000000-0000-0000-0000-0000000000aa'),
  '🛑 A2 同一組 (session, question) 永遠算出同一個排列——重整不能重排');

SELECT t_assert(
  (SELECT count(DISTINCT array_to_string(p,'')) >= 20
     FROM (SELECT reading_option_permutation(gen_random_uuid(),
             '00000000-0000-0000-0000-0000000000aa') p FROM generate_series(1,2000)) t),
  'A3 同一題在不同 session 會拿到多種排列（24 種裡至少出現 20 種）');

-- 偏斜有沒有被打散：正解 B 落在四個位置的比例
SELECT t_assert(
  (SELECT min(n) > 2000 * 0.20 AND max(n) < 2000 * 0.30 FROM (
     SELECT count(*) AS n
       FROM (SELECT reading_option_to_display(gen_random_uuid(),
                      '00000000-0000-0000-0000-0000000000aa', 'B') d
               FROM generate_series(1,2000)) t
      GROUP BY d) g),
  '🛑 A4 正解落在四個位置的比例都在 20–30% 之間（原本 B 是 47.2%）');

SELECT t_assert(
  (SELECT bool_and(reading_option_to_canonical(sid, qid,
                     reading_option_to_display(sid, qid, c)) = c)
     FROM (SELECT gen_random_uuid() sid, gen_random_uuid() qid
             FROM generate_series(1,200)) t, unnest(ARRAY['A','B','C','D']) c),
  'A5 顯示位置與原始標籤可以互相換算，來回一致');

SELECT t_assert(reading_option_to_display(gen_random_uuid(), gen_random_uuid(), NULL) IS NULL,
  'A6 NULL 進 NULL 出——沒作答的題目不能被硬換算成某個字母');

\echo '════════ B. 取題 ════════'

SELECT set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);

CREATE TEMP TABLE me AS
SELECT (reading_start_session('SH1') ->> 'session_id')::uuid AS sid;

CREATE TEMP TABLE fetched AS
SELECT q ->> 'question_id' AS qid, q -> 'options' AS opts
  FROM me, jsonb_array_elements(
         reading_get_passage('SH1', me.sid) -> 'questions') q;

SELECT t_assert((SELECT count(*) FROM fetched) = 6, 'B1 六題都回來了');

SELECT t_assert(
  (SELECT bool_and((SELECT array_agg(v ORDER BY v) FROM jsonb_each_text(opts) AS e(k,v))
                   = ARRAY['opt-A','opt-B','opt-C','opt-D']) FROM fetched),
  '🛑 B2 四個選項的【文字】一個不多一個不少——重排不是換內容');

SELECT t_assert(
  (SELECT bool_and((SELECT array_agg(k ORDER BY k) FROM jsonb_each_text(opts) AS e(k,v))
                   = ARRAY['A','B','C','D']) FROM fetched),
  'B3 重排後仍然貼上 A–D，前端不知道發生過重排');

-- 正解的文字（opt-B）跑到哪個位置
CREATE TEMP TABLE shown AS
SELECT f.qid,
       (SELECT k FROM jsonb_each_text(f.opts) AS e(k,v) WHERE v = 'opt-B') AS correct_display
  FROM fetched f;

SELECT t_assert(
  (SELECT count(*) FROM shown WHERE correct_display IS NOT NULL) = 6,
  'B4 每一題都找得到正解文字所在的位置');

SELECT t_assert(
  (SELECT bool_and(correct_display = reading_option_to_display(
                     (SELECT sid FROM me), qid::uuid, 'B')) FROM shown),
  '🛑 B5 取題實際擺放的位置與換算函式說的一致——這兩者只要有一邊算錯，計分就全歪');

SELECT t_assert(
  (SELECT bool_and(q -> 'options' ->> 'A' = 'opt-A')
     FROM jsonb_array_elements(reading_get_passage('SH1') -> 'questions') q),
  'B6 沒有 session（後台預覽）時不重排，看到的是題庫原本的順序');

SELECT t_expect_error(
  $$SELECT reading_get_passage('SH1', 'bbbbbbbb-0000-0000-0000-00000000000b')$$,
  '🛑 B7 不能拿別人的 session_id 取題（那等於索取對照表）', '找不到這次練習');

\echo '════════ C. 作答 ════════'

-- 按下正解所在的位置 → 對
SELECT t_assert(
  (reading_submit_answer((SELECT sid FROM me),
                         (SELECT qid::uuid FROM shown LIMIT 1),
                         (SELECT correct_display FROM shown LIMIT 1),
                         1000, 0, NULL) ->> 'is_correct')::boolean,
  '🛑 C1 按下正解所在的位置就是對的——換算沒做對這裡就會紅');

SELECT t_assert(
  (SELECT selected_answer = (SELECT correct_display FROM shown LIMIT 1)
     FROM reading_attempts
    WHERE session_id = (SELECT sid FROM me)
      AND question_id = (SELECT qid::uuid FROM shown LIMIT 1)),
  '🛑 C2 存進 reading_attempts 的是【學生看到的位置】，不是題庫的原始標籤');

-- 按下別的位置 → 錯
SELECT t_assert(
  NOT (reading_submit_answer((SELECT sid FROM me),
        (SELECT qid::uuid FROM shown OFFSET 1 LIMIT 1),
        (SELECT chr(65 + (ascii(correct_display) - 65 + 1) % 4)
           FROM shown OFFSET 1 LIMIT 1),
        1000, 0, NULL) ->> 'is_correct')::boolean,
  'C3 按下別的位置就是錯的');

SELECT t_assert(
  (reading_submit_answer((SELECT sid FROM me),
     (SELECT qid::uuid FROM shown LIMIT 1),
     (SELECT correct_display FROM shown LIMIT 1), 1000, 0, NULL)
   ->> 'correct_answer') = (SELECT correct_display FROM shown LIMIT 1),
  '🛑 C4 回傳的正解是【顯示位置】——回原始標籤會指著他沒看到的選項');

\echo '════════ D. 結算 ════════'

CREATE TEMP TABLE finished AS
SELECT b ->> 'question_id' AS qid,
       b ->> 'selected_answer' AS sel,
       b ->> 'correct_answer' AS cor,
       b ->> 'status' AS st
  FROM jsonb_array_elements(
         reading_finish_session((SELECT sid FROM me)) -> 'by_construct') b;

SELECT t_assert(
  (SELECT bool_and(f.cor = s.correct_display) FROM finished f JOIN shown s ON s.qid = f.qid),
  '🛑 D1 結算的正解與學生當時看到的位置一致');

SELECT t_assert(
  (SELECT count(*) FROM finished WHERE st = 'SKIPPED') = 4
  AND (SELECT count(*) FROM finished WHERE st = 'CORRECT') = 1
  AND (SELECT count(*) FROM finished WHERE st = 'WRONG') = 1,
  'D2 沒作答的仍然是 SKIPPED，對錯各一題');

SELECT t_assert(
  (SELECT bool_and(cor IS NOT NULL) FROM finished),
  'D3 沒作答的題目也拿得到正解（學生要知道答案是哪個）');

\echo '════════ E. 兩個學生 ════════'

SELECT set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
CREATE TEMP TABLE other_me AS
SELECT (reading_start_session('SH1') ->> 'session_id')::uuid AS sid;

SELECT t_assert(
  (SELECT count(DISTINCT d) > 1 FROM (
     SELECT reading_option_to_display(sid, q.id, 'B') AS d
       FROM me, reading_questions q WHERE q.passage_id='SH1'
     UNION ALL
     SELECT reading_option_to_display(sid, q.id, 'B')
       FROM other_me, reading_questions q WHERE q.passage_id='SH1') t),
  '🛑 E1 十二個 (學生, 題目) 組合不會全部把正解放在同一個位置');

\echo '════════ F. 權限 ════════'

SELECT t_assert(
  NOT has_function_privilege('authenticated',
    'reading_option_permutation(uuid,uuid)', 'EXECUTE'),
  '🛑 F1 authenticated 不能執行排列函式——拿到對照表就能反推回原始標籤');

SELECT t_assert(
  NOT has_function_privilege('authenticated',
    'reading_option_to_canonical(uuid,uuid,char)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'reading_option_to_display(uuid,uuid,char)', 'EXECUTE'),
  '🛑 F2 兩支換算函式也不能');

SELECT t_assert(
  has_function_privilege('authenticated', 'reading_get_passage(text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'reading_get_passage(text,uuid)', 'EXECUTE'),
  'F3 取題 DROP 重建之後，權限有重新設定（登入者可、anon 不可）');

\echo ''
\echo '全部通過'
