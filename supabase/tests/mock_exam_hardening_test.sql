-- =====================================================
-- mock 模考 schema 硬化測試（A–T；U 在 coexistence 測試）
--
-- ⚠️ psql 專用（使用 \echo）。不要貼進 Supabase SQL Editor。
--
-- 執行方式：
--   createdb mockx
--   psql -v ON_ERROR_STOP=1 -d mockx -f supabase/tests/mock_exam_prod_fixture.sql
--   psql -v ON_ERROR_STOP=1 -d mockx -f supabase/migrations/harden_mock_exam_answers.sql
--   psql -v ON_ERROR_STOP=1 -d mockx -f supabase/tests/mock_exam_hardening_test.sql
--
-- 重點放在真正的風險：學生能不能自己給分、未批改會不會被當成零分、
-- 同一題會不會變成多列、翻譯作文會不會被記成「答錯」。
-- 快樂路徑通過並不能證明什麼。
-- =====================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION t_assert(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

CREATE OR REPLACE FUNCTION t_expect_error(stmt text, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE EXCEPTION 'FAIL  % （預期要失敗，但成功了）', label;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL %' THEN RAISE; END IF;
  RAISE NOTICE 'PASS  % （擋下：%）', label, left(SQLERRM, 62);
END $$;

-- ── 佈置（可重複執行）────────────────────────────────
-- 先清掉上一次的測試資料。只刪本測試自己建立的考試，
-- cascade 會一併帶走題目、attempt 與作答。legacy 資料不在此列。
DELETE FROM exams WHERE id = 'e0000000-0000-0000-0000-00000000000f';

-- ── 佈置 ────────────────────────────────────────────
-- 刻意用 draft 考試：證明判分不依賴學生的閱讀權限
INSERT INTO exams (id, title, status)
  VALUES ('e0000000-0000-0000-0000-00000000000f','hardening test','draft');
INSERT INTO question_groups (id, exam_id, title, group_type, group_order)
  VALUES ('60000000-0000-0000-0000-00000000000f','e0000000-0000-0000-0000-00000000000f','cloze','cloze',1);
INSERT INTO group_questions (id, group_id, question_number, correct_answer, score, grammar_large)
  VALUES ('61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-00000000000f',1,'C',2.5,'時態與語態'),
         ('61000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-00000000000f',2,'A',2.5,'時態與語態');
INSERT INTO vocabulary_questions (id, exam_id, question_number, correct_answer, score)
  VALUES ('62000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000000f',1,'B',1.5);
INSERT INTO translation_questions (id, exam_id, question_number, score)
  VALUES ('63000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000000f',1,4);
INSERT INTO essay_questions (id, exam_id, question_number, score)
  VALUES ('64000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000000f',1,20);

INSERT INTO exam_attempts (id, user_id, exam_id, status) VALUES
  ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000000f','in_progress'),
  ('a0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','e0000000-0000-0000-0000-00000000000f','in_progress');

\echo '--- A/B/E/F：客觀題自動判分 ---'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer, time_spent_seconds)
  VALUES ('a0000000-0000-0000-0000-00000000000a','61000000-0000-0000-0000-000000000001','c', 30);
INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer)
  VALUES ('a0000000-0000-0000-0000-00000000000a','61000000-0000-0000-0000-000000000002','B');
INSERT INTO exam_user_answers (attempt_id, vocabulary_question_id, user_answer)
  VALUES ('a0000000-0000-0000-0000-00000000000a','62000000-0000-0000-0000-000000000001','B');
COMMIT;

SELECT t_assert((SELECT grading_status='GRADED' AND is_correct AND score_earned=2.5
                        AND max_score=2.5 AND grading_method='AUTO' AND graded_by IS NULL
                        AND graded_at IS NOT NULL
                 FROM exam_user_answers WHERE group_question_id='61000000-0000-0000-0000-000000000001'),
  'A 客觀題答對：GRADED / true / 滿分 / AUTO（且大小寫不敏感）');

SELECT t_assert((SELECT grading_status='GRADED' AND NOT is_correct AND score_earned=0 AND max_score=2.5
                 FROM exam_user_answers WHERE group_question_id='61000000-0000-0000-0000-000000000002'),
  'B 客觀題答錯：GRADED / false / 0 分，但 max_score 仍記錄');

SELECT t_assert((SELECT max_score=1.5 FROM exam_user_answers
                 WHERE vocabulary_question_id='62000000-0000-0000-0000-000000000001'),
  'F max_score 快照題目配分');

\echo '--- C/D/E：主觀題送出後維持 UNGRADED ---'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
INSERT INTO exam_user_answers (attempt_id, translation_question_id, user_answer)
  VALUES ('a0000000-0000-0000-0000-00000000000a','63000000-0000-0000-0000-000000000001','My translation.');
INSERT INTO exam_user_answers (attempt_id, essay_question_id, user_answer)
  VALUES ('a0000000-0000-0000-0000-00000000000a','64000000-0000-0000-0000-000000000001','My essay body.');
COMMIT;

SELECT t_assert((SELECT grading_status='UNGRADED' AND is_correct IS NULL AND score_earned IS NULL
                        AND max_score IS NULL AND grading_method IS NULL AND graded_at IS NULL
                 FROM exam_user_answers WHERE translation_question_id='63000000-0000-0000-0000-000000000001'),
  'C 翻譯題維持 UNGRADED，所有批改欄位為空');

SELECT t_assert((SELECT grading_status='UNGRADED' AND score_earned IS NULL
                 FROM exam_user_answers WHERE essay_question_id='64000000-0000-0000-0000-000000000001'),
  'D 作文題維持 UNGRADED');

SELECT t_assert((SELECT count(*)=0 FROM exam_user_answers
                 WHERE grading_status='UNGRADED' AND score_earned IS NOT NULL),
  'E 未批改的作答 score_earned 一律為 NULL，絕不是隱含的 0');

\echo '--- G/H：一個 attempt 一道題目只有一列 ---'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer)
  VALUES ('a0000000-0000-0000-0000-00000000000a','61000000-0000-0000-0000-000000000001','A')
  ON CONFLICT (attempt_id, question_id) DO UPDATE SET user_answer = EXCLUDED.user_answer;
INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer)
  VALUES ('a0000000-0000-0000-0000-00000000000a','61000000-0000-0000-0000-000000000001','C')
  ON CONFLICT (attempt_id, question_id) DO UPDATE SET user_answer = EXCLUDED.user_answer;
COMMIT;

SELECT t_assert((SELECT count(*)=1 FROM exam_user_answers
                 WHERE attempt_id='a0000000-0000-0000-0000-00000000000a'
                   AND group_question_id='61000000-0000-0000-0000-000000000001'),
  'G 同一題重複儲存只有一列');
SELECT t_assert((SELECT user_answer='C' AND is_correct
                 FROM exam_user_answers WHERE group_question_id='61000000-0000-0000-0000-000000000001'),
  'G2 改答案會就地重新判分');

SELECT t_assert((SELECT count(DISTINCT question_kind)=4 FROM exam_user_answers
                 WHERE attempt_id='a0000000-0000-0000-0000-00000000000a'),
  'H 四種題目 FK 型別都能正確走同一個唯一鍵');

SELECT t_expect_error(
  format('INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer) VALUES (%L,%L,%L)',
         'a0000000-0000-0000-0000-00000000000a','61000000-0000-0000-0000-000000000001','A'),
  'H2 不帶 ON CONFLICT 的重複插入被唯一約束擋下');

\echo '--- I–M：學生只能寫作答內容 ---'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
UPDATE exam_user_answers SET user_answer='A', time_spent_seconds=99
  WHERE group_question_id='61000000-0000-0000-0000-000000000002';
COMMIT;
SELECT t_assert((SELECT user_answer='A' AND time_spent_seconds=99 AND is_correct
                 FROM exam_user_answers WHERE group_question_id='61000000-0000-0000-0000-000000000002'),
  'I 學生可以修改 user_answer 與 time_spent_seconds（並重新判分）');

DO $$
DECLARE
  v_cases text[][] := ARRAY[
    ARRAY['is_correct = true',            'J 學生不可設定 is_correct'],
    ARRAY['score_earned = 999',           'K 學生不可設定 score_earned'],
    ARRAY['grading_method = ''TEACHER''', 'L 學生不可設定 grading_method'],
    ARRAY['grading_status = ''GRADED''',  'M 學生不可設定 grading_status'],
    ARRAY['max_score = 999',              'M2 學生不可設定 max_score'],
    ARRAY['graded_by = ''aaaaaaaa-0000-0000-0000-000000000001''', 'M3 學生不可設定 graded_by'],
    ARRAY['graded_at = now()',            'M4 學生不可設定 graded_at']
  ];
  v_case text[];
BEGIN
  FOREACH v_case SLICE 1 IN ARRAY v_cases LOOP
    BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
      EXECUTE 'UPDATE exam_user_answers SET ' || v_case[1];
      RESET ROLE;
      RAISE EXCEPTION 'FAIL  % （預期要失敗，但成功了）', v_case[2];
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'PASS  % （欄位級權限擋下）', v_case[2];
    END;
  END LOOP;
END $$;

\echo '--- N/O：學生不可自行給 attempt 打分或標記已批改 ---'
DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
    UPDATE exam_attempts SET total_score = 100 WHERE id='a0000000-0000-0000-0000-00000000000a';
    RESET ROLE;
    RAISE EXCEPTION 'FAIL  N 學生竟能寫入 total_score';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE; RAISE NOTICE 'PASS  N 學生不可寫入 exam_attempts.total_score（欄位級權限）';
  END;
END $$;

SELECT t_expect_error(
  $$UPDATE exam_attempts SET status='graded' WHERE id='a0000000-0000-0000-0000-00000000000a'$$,
  'O 不可自行把 attempt 標記為 graded（trigger，連 superuser 也擋）');

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
UPDATE exam_attempts SET status='submitted', submitted_at=now(), time_spent_seconds=600
  WHERE id='a0000000-0000-0000-0000-00000000000a';
COMMIT;
SELECT t_assert((SELECT status='submitted' FROM exam_attempts WHERE id='a0000000-0000-0000-0000-00000000000a'),
  'O2 學生仍然可以正常交卷（in_progress → submitted）');

SELECT t_expect_error(
  $$UPDATE exam_attempts SET status='in_progress' WHERE id='a0000000-0000-0000-0000-00000000000a'$$,
  'O3 已交卷不可退回 in_progress');

\echo '--- P：跨學生隔離 ---'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
CREATE TEMP TABLE t_iso ON COMMIT DROP AS
  SELECT count(*) AS n FROM exam_user_answers WHERE attempt_id='a0000000-0000-0000-0000-00000000000a';
SELECT t_assert((SELECT n=0 FROM t_iso), 'P 另一位學生讀不到別人的作答');
COMMIT;

\echo '--- Q/R/S：語意約束（繞過 trigger 也擋得住）---'
SELECT set_config('app.mock_exam_grading','on', false);
SELECT t_expect_error(
  format($$INSERT INTO exam_user_answers (attempt_id, essay_question_id, user_answer,
             grading_status, is_correct, score_earned, max_score, grading_method, graded_at)
           VALUES (%L,%L,'x','GRADED', true, 10, 20, 'TEACHER', now())$$,
         'a0000000-0000-0000-0000-00000000000b','64000000-0000-0000-0000-000000000001'),
  'Q 主觀題不可被記成 is_correct=true/false');

SELECT t_expect_error(
  format($$INSERT INTO exam_user_answers (attempt_id, essay_question_id, user_answer,
             grading_status, score_earned, max_score, grading_method, graded_at)
           VALUES (%L,%L,'x','GRADED', 30, 20, 'AI', now())$$,
         'a0000000-0000-0000-0000-00000000000b','64000000-0000-0000-0000-000000000001'),
  'S score_earned 不可超過 max_score');

SELECT t_expect_error(
  format($$INSERT INTO exam_user_answers (attempt_id, essay_question_id, user_answer,
             grading_status, score_earned, max_score, grading_method, graded_by, graded_at)
           VALUES (%L,%L,'x','GRADED', 10, 20, 'TEACHER', NULL, now())$$,
         'a0000000-0000-0000-0000-00000000000b','64000000-0000-0000-0000-000000000001'),
  'S2 TEACHER 批改必須具名');

SELECT t_expect_error(
  format($$INSERT INTO exam_user_answers (attempt_id, essay_question_id, user_answer,
             grading_status, score_earned)
           VALUES (%L,%L,'x','UNGRADED', 0)$$,
         'a0000000-0000-0000-0000-00000000000b','64000000-0000-0000-0000-000000000001'),
  'S3 UNGRADED 不可帶著分數（含 0）');
SELECT set_config('app.mock_exam_grading','off', false);

ALTER TABLE exam_user_answers DISABLE TRIGGER mock_exam_trg_auto_grade;
SELECT t_expect_error(
  format($$INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer,
             grading_status, is_correct, score_earned, max_score, grading_method, graded_at)
           VALUES (%L,%L,'C','GRADED', NULL, 2.5, 2.5, 'AUTO', now())$$,
         'a0000000-0000-0000-0000-00000000000b','61000000-0000-0000-0000-000000000001'),
  'R 已批改的客觀題不可缺少對錯判定');
ALTER TABLE exam_user_answers ENABLE TRIGGER mock_exam_trg_auto_grade;

SELECT t_expect_error(
  format($$INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer) VALUES (%L,%L,'   ')$$,
         'a0000000-0000-0000-0000-00000000000b','61000000-0000-0000-0000-000000000001'),
  'T1 空白作答不可成為一列（未作答 = 沒有列）');
SELECT t_expect_error(
  format($$INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer) VALUES (%L,%L,NULL)$$,
         'a0000000-0000-0000-0000-00000000000b','61000000-0000-0000-0000-000000000001'),
  'T2 NULL 作答不可成為一列');

\echo '--- T：清除作答 = 刪除該列 ---'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer)
  VALUES ('a0000000-0000-0000-0000-00000000000b','61000000-0000-0000-0000-000000000001','A');
DELETE FROM exam_user_answers WHERE attempt_id='a0000000-0000-0000-0000-00000000000b';
COMMIT;
SELECT t_assert((SELECT count(*)=0 FROM exam_user_answers WHERE attempt_id='a0000000-0000-0000-0000-00000000000b'),
  'T3 學生可以刪除進行中 attempt 的作答');

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
CREATE TEMP TABLE t_del ON COMMIT DROP AS
  WITH d AS (DELETE FROM exam_user_answers
             WHERE attempt_id='a0000000-0000-0000-0000-00000000000a' RETURNING 1)
  SELECT count(*) AS n FROM d;
SELECT t_assert((SELECT n=0 FROM t_del), 'T4 已交卷後不可再刪除作答（影響 0 列）');
COMMIT;

\echo '--- updated_at 確實被維護 ---'
SELECT t_assert((SELECT count(*)=0 FROM exam_user_answers WHERE updated_at IS NULL),
  'X1 updated_at 有值');
-- 用 GUC 保存基準值：temp table 的 ON COMMIT DROP 撐不過交易邊界
SELECT set_config('app.t_before',
  (SELECT updated_at::text FROM exam_user_answers
   WHERE group_question_id='61000000-0000-0000-0000-000000000002'), false);
SELECT pg_sleep(0.05);
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
UPDATE exam_user_answers SET time_spent_seconds = 123 WHERE group_question_id='61000000-0000-0000-0000-000000000002';
COMMIT;
SELECT t_assert((SELECT updated_at > current_setting('app.t_before')::timestamptz
                 FROM exam_user_answers WHERE group_question_id='61000000-0000-0000-0000-000000000002'),
  'X2 updated_at 會隨修改前進（不再是永遠不變的假時間戳）');

\echo '=== 硬化測試全部通過 ==='
