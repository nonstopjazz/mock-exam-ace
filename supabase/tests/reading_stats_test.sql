-- =====================================================
-- 學生自己的閱讀統計 reading_my_stats()
--
-- 🛑 這裡最重要的一條：emphasis 是 NULL 的【不補 0】。
--    補 0 會把「沒有標權重」變成「這一題完全不考這個能力」——
--    一個憑空捏造出來的結論，而且沒有人會去懷疑它，
--    因為畫面上它看起來就只是一個比較低的百分比。
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
INSERT INTO auth.users (id) VALUES (:stu), (:other);

INSERT INTO reading_passages (passage_id, title, passage_text, content_source, status)
VALUES ('S1','Stats','A passage long enough for statistics.','WRITER','DRAFT');
INSERT INTO reading_questions (passage_id, construct, question, option_a, option_b, option_c, option_d, display_order)
SELECT 'S1', c, 'Q '||c, 'a','b','c','d', ord
  FROM unnest(ARRAY['SM','MI','SD','CO','CD','VC']) WITH ORDINALITY AS t(c, ord);
INSERT INTO reading_question_keys (question_id, correct_answer, explanation)
SELECT id, 'B', '因為 B。' FROM reading_questions WHERE passage_id='S1';

-- micro-skill：
--   alpha  三題都有 emphasis（100 / 100 / 100）
--   beta   一題 emphasis = 50，兩題【NULL】
INSERT INTO reading_question_skills (question_id, skill_code, emphasis)
SELECT id, 'alpha', 100 FROM reading_questions
 WHERE passage_id='S1' AND construct IN ('SM','MI','SD');
INSERT INTO reading_question_skills (question_id, skill_code, emphasis)
SELECT id, 'beta', 50 FROM reading_questions WHERE passage_id='S1' AND construct='CO';
INSERT INTO reading_question_skills (question_id, skill_code, emphasis)
SELECT id, 'beta', NULL FROM reading_questions
 WHERE passage_id='S1' AND construct IN ('CD','VC');

-- 作答：SM 對、MI 對、SD 錯、CO 錯、CD 對、VC 對
INSERT INTO reading_sessions (id, student_id, passage_id, status, submitted_at)
VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', :stu, 'S1', 'SUBMITTED', now());
INSERT INTO reading_attempts (session_id, question_id, student_id, selected_answer, is_correct,
                              response_time_ms, answer_change_count, first_answer)
SELECT 'aaaaaaaa-0000-0000-0000-00000000000a', q.id, :stu,
       CASE WHEN q.construct IN ('SD','CO') THEN 'A' ELSE 'B' END,
       q.construct NOT IN ('SD','CO'),
       CASE q.construct WHEN 'SM' THEN 120000 ELSE 30000 END,
       CASE WHEN q.construct = 'SD' THEN 1 ELSE 0 END,
       CASE WHEN q.construct = 'SD' THEN 'B' ELSE NULL END
  FROM reading_questions q WHERE q.passage_id='S1';

-- 另一位學生也作答，用來確認統計不會把別人的算進來
INSERT INTO reading_sessions (id, student_id, passage_id)
VALUES ('bbbbbbbb-0000-0000-0000-00000000000b', :other, 'S1');
INSERT INTO reading_attempts (session_id, question_id, student_id, selected_answer, is_correct)
SELECT 'bbbbbbbb-0000-0000-0000-00000000000b', q.id, :other, 'A', false
  FROM reading_questions q WHERE q.passage_id='S1';


\echo ''
\echo '════════ T. reading_my_stats ════════'

SELECT set_config('app.uid', '', false) IS NOT NULL;
SELECT t_expect_error($$SELECT reading_my_stats()$$, 'T1 未登入被拒', '請先登入');

SELECT set_config('app.uid', :stu, false) IS NOT NULL;

CREATE TEMP TABLE s AS SELECT reading_my_stats() AS j;

SELECT t_assert((SELECT (j -> 'overall' ->> 'answered')::int FROM s) = 6,
  '🛑 T2 只算自己的六題，沒有把另一位學生的六題算進來');
SELECT t_assert((SELECT (j -> 'overall' ->> 'correct')::int FROM s) = 4, 'T2 答對四題');
SELECT t_assert((SELECT (j -> 'overall' ->> 'passages')::int FROM s) = 1, 'T2 練過一篇');

-- ── micro-skill：NULL 的處理 ────────────────────────
SELECT t_assert(
  (SELECT (e ->> 'graded')::int FROM jsonb_array_elements((SELECT j -> 'by_skill' FROM s)) e
    WHERE e ->> 'skill_code' = 'alpha') = 3,
  'T3 alpha 三題都有 emphasis');
SELECT t_assert(
  (SELECT (e ->> 'accuracy')::numeric FROM jsonb_array_elements((SELECT j -> 'by_skill' FROM s)) e
    WHERE e ->> 'skill_code' = 'alpha') = 0.667,
  'T3 alpha 加權正確率 2/3');

SELECT t_assert(
  (SELECT (e ->> 'graded')::int FROM jsonb_array_elements((SELECT j -> 'by_skill' FROM s)) e
    WHERE e ->> 'skill_code' = 'beta') = 1,
  '🛑 T4 beta 只有【一題】進加權——另外兩題的 emphasis 是 NULL');
SELECT t_assert(
  (SELECT (e ->> 'ungraded')::int FROM jsonb_array_elements((SELECT j -> 'by_skill' FROM s)) e
    WHERE e ->> 'skill_code' = 'beta') = 2,
  '🛑 T4 而且那兩題【被數出來】，不是安靜消失');
-- 唯一進加權的那題（CO）答錯 → 0%。補 0 的話會變成 1/3 之類的數字。
SELECT t_assert(
  (SELECT (e ->> 'accuracy')::numeric FROM jsonb_array_elements((SELECT j -> 'by_skill' FROM s)) e
    WHERE e ->> 'skill_code' = 'beta') = 0,
  '🛑 T5 beta 的正確率只看有 emphasis 的那一題——NULL 沒有被當成 0 分算進分母');
SELECT t_assert(
  NOT (SELECT (e ->> 'enough')::boolean FROM jsonb_array_elements((SELECT j -> 'by_skill' FROM s)) e
        WHERE e ->> 'skill_code' = 'beta'),
  '🛑 T6 beta 題數不夠（1 < 3），標成「還量不出來」而不是「0%」');
SELECT t_assert(
  (SELECT (e ->> 'enough')::boolean FROM jsonb_array_elements((SELECT j -> 'by_skill' FROM s)) e
    WHERE e ->> 'skill_code' = 'alpha'),
  'T6 alpha 三題達到門檻');
SELECT t_assert((SELECT (j -> 'overall' ->> 'min_questions_for_skill')::int FROM s) = 3,
  'T6 門檻由伺服器回報，畫面不自己訂一套');

-- ── 六大能力 ────────────────────────────────────────
SELECT t_assert(
  jsonb_array_length((SELECT j -> 'by_construct' FROM s)) = 6, 'T7 六個 construct 都在');
SELECT t_assert(
  (SELECT (e ->> 'median_ms')::numeric FROM jsonb_array_elements((SELECT j -> 'by_construct' FROM s)) e
    WHERE e ->> 'construct' = 'SM') = 120000,
  'T7 作答時間有算出來');
SELECT t_assert(
  (SELECT (e ->> 'changed_away_from_correct')::int
     FROM jsonb_array_elements((SELECT j -> 'by_construct' FROM s)) e
    WHERE e ->> 'construct' = 'SD') = 1,
  '🛑 T8 抓得到「本來選對卻改錯」——只看最後答案完全看不到這件事');
SELECT t_assert(
  (SELECT sum((e ->> 'changed_away_from_correct')::int)
     FROM jsonb_array_elements((SELECT j -> 'by_construct' FROM s)) e
    WHERE e ->> 'construct' <> 'SD') = 0,
  'T8 沒改過的不會被誤算');

-- ── 最近練習 ────────────────────────────────────────
SELECT t_assert(jsonb_array_length((SELECT j -> 'recent' FROM s)) = 1,
  '🛑 T9 最近練習只有自己的那一次');
SELECT t_assert(
  (SELECT (e ->> 'correct')::int FROM jsonb_array_elements((SELECT j -> 'recent' FROM s)) e) = 4,
  'T9 那一次答對四題');

-- ── 沒練過的人 ──────────────────────────────────────
SELECT set_config('app.uid', '33333333-3333-3333-3333-333333333333', false) IS NOT NULL;
INSERT INTO auth.users (id) VALUES ('33333333-3333-3333-3333-333333333333');
SELECT t_assert((reading_my_stats() -> 'overall' ->> 'answered')::int = 0,
  'T10 沒練過的人拿到 0，不是錯誤');
SELECT t_assert((reading_my_stats() -> 'by_skill') = '[]'::jsonb,
  '🛑 T10 而且 by_skill 是空陣列，不是 null——畫面不必為了這個寫特例');

-- ── 安全 ────────────────────────────────────────────
SELECT t_assert(
  (SELECT bool_and(pg_get_function_arguments(p.oid) NOT LIKE '%student%')
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='reading_my_stats'),
  '🛑 T11 沒有 student_id 參數——有的話任何學生都能看別人的成績');
SELECT t_assert(
  (SELECT (j)::text NOT LIKE '%correct_answer%' FROM s),
  'T11 回傳不含正解');

\echo ''
\echo '全部通過。'
