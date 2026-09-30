-- =====================================================
-- 學生端「已結束的作業」
--
-- 🛑 這份測試最重要的一條是 D1：【看不到別人的歷史】。
--    這支 RPC 是 SECURITY DEFINER，繞過 RLS，過濾條件只有 auth.uid()。
--    哪天有人手滑加了 p_student_id 參數，或把 WHERE 寫鬆了，
--    就等於開了一個「查別人做過什麼作業」的洞，而畫面上不會有任何徵兆。
--
-- 其次是 C 段：封存【不是】刪除。學生的回報與老師的評語要原封不動留著，
-- 否則這個歷史頁只是個空殼。
-- =====================================================

\set ON_ERROR_STOP on
\timing off
-- 查詢結果一律丟掉：這份測試要看的是 PASS / FAIL（走 NOTICE，不受 \o 影響）。
\o /dev/null

CREATE OR REPLACE FUNCTION t_assert(cond BOOLEAN, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label;
  END IF;
END $$;

-- 🛑 create_user_profiles_table.sql 會把 is_admin() 換成查 email 的版本，
--    蓋掉本機替身的 GUC 版。測試要自己換回來，否則所有 admin RPC 都被擋。
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce(current_setting('app.is_admin', true), 'false')::boolean;
$$;

\set adm '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set stu '''11111111-1111-1111-1111-111111111111'''
\set oth '''22222222-2222-2222-2222-222222222222'''

INSERT INTO auth.users (id, email) VALUES
  (:adm, 'admin@example.test'),
  (:stu, 'stu@example.test'),
  (:oth, 'other@example.test')
  ON CONFLICT DO NOTHING;

SELECT set_config('app.is_admin', 'true', false);
SELECT set_config('app.uid', :adm, false);

CREATE TEMP TABLE c AS
SELECT (learn_admin_upsert_class(NULL, '測試班', NULL, NULL) ->> 'id')::uuid AS id;
SELECT learn_admin_add_class_members((SELECT id FROM c), ARRAY[:stu, :oth]::uuid[]);

-- 兩位學生都會拿到的作業（截止日釘死）
CREATE TEMP TABLE t_fixed AS
SELECT (learn_admin_upsert_task(
          NULL, (SELECT id FROM c), 'HOMEWORK', '第一週作業',
          '寫完課本 p.12', 'CUSTOM_DATE', '2026-03-01'::date, NULL, NULL, NULL
        ) -> 'task' ->> 'id')::uuid AS id;

-- 截止日是「下次上課」—— 那是會往前走的值
CREATE TEMP TABLE t_next AS
SELECT (learn_admin_upsert_task(
          NULL, (SELECT id FROM c), 'HOMEWORK', '第二週作業',
          NULL, 'NEXT_CLASS', NULL, NULL, NULL, NULL
        ) -> 'task' ->> 'id')::uuid AS id;

-- 週期任務
CREATE TEMP TABLE t_rec AS
SELECT (learn_admin_upsert_task(
          NULL, (SELECT id FROM c), 'RECURRING', '每天背單字',
          NULL, NULL, NULL, 'DAILY', 5, NULL
        ) -> 'task' ->> 'id')::uuid AS id;

-- 學生的歷史：自己回報 + 老師評語 + 週期紀錄
SELECT set_config('app.is_admin', 'false', false);
SELECT set_config('app.uid', :stu, false);
SELECT learn_student_report_task((SELECT id FROM t_fixed), true);
-- 🛑 p_delta 只看正負，每次固定 +1（見 create_learn_classes_tasks.sql）。
--    傳 3 不會一次加三次，要真的叫三次。
SELECT learn_student_log_recurring((SELECT id FROM t_rec), NULL, 1);
SELECT learn_student_log_recurring((SELECT id FROM t_rec), NULL, 1);
SELECT learn_student_log_recurring((SELECT id FROM t_rec), NULL, 1);

SELECT set_config('app.is_admin', 'true', false);
SELECT set_config('app.uid', :adm, false);
SELECT learn_admin_check_task((SELECT id FROM t_fixed), :stu, 'PARTIAL', 60, '第三題再寫一次');

-- 另一位學生也有紀錄，之後用來確認彼此看不到
SELECT set_config('app.is_admin', 'false', false);
SELECT set_config('app.uid', :oth, false);
SELECT learn_student_report_task((SELECT id FROM t_fixed), true);


\echo '════════ A. 還沒封存時，歷史是空的 ════════'
SELECT set_config('app.uid', :stu, false);

SELECT t_assert(
  (learn_student_task_history() ->> 'total')::int = 0,
  'A1 沒有已封存的任務 → total = 0');

SELECT t_assert(
  jsonb_array_length(learn_student_task_history() -> 'items') = 0,
  'A2 items 是空陣列，不是 null');

SELECT t_assert(
  (learn_student_task_history() ->> 'truncated')::boolean = false,
  'A3 沒有截斷');


\echo '════════ B. 封存之後才進歷史，而且離開待辦 ════════'
SELECT set_config('app.is_admin', 'true', false);
SELECT set_config('app.uid', :adm, false);
SELECT learn_admin_archive_task((SELECT id FROM t_fixed), true);

SELECT set_config('app.is_admin', 'false', false);
SELECT set_config('app.uid', :stu, false);

SELECT t_assert(
  (learn_student_task_history() ->> 'total')::int = 1,
  'B1 封存的那一份進了歷史');

SELECT t_assert(
  NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(learn_student_tasks() -> 'homework') e
     WHERE (e ->> 'task_id')::uuid = (SELECT id FROM t_fixed)),
  '🛑 B2 同一份已經不在待辦裡（不能兩邊都出現）');

SELECT t_assert(
  EXISTS (
    SELECT 1 FROM jsonb_array_elements(learn_student_tasks() -> 'homework') e
     WHERE (e ->> 'task_id')::uuid = (SELECT id FROM t_next)),
  'B3 沒封存的那一份還在待辦裡');


\echo '════════ C. 封存不是刪除：紀錄要原封不動 ════════'
CREATE TEMP TABLE h AS
SELECT e AS item
  FROM jsonb_array_elements(learn_student_task_history() -> 'items') e
 WHERE (e ->> 'task_id')::uuid = (SELECT id FROM t_fixed);

SELECT t_assert((SELECT (item ->> 'student_reported')::boolean FROM h),
  'C1 學生自己回報的完成還在');
SELECT t_assert((SELECT item ->> 'teacher_status' FROM h) = 'PARTIAL',
  'C2 老師的判定還在');
SELECT t_assert((SELECT (item ->> 'teacher_percent')::int FROM h) = 60,
  'C3 老師給的百分比還在');
SELECT t_assert((SELECT item ->> 'teacher_note' FROM h) = '第三題再寫一次',
  '🛑 C4 老師的評語還在（這是學生最想回顧的東西）');
SELECT t_assert((SELECT item ->> 'archived_at' FROM h) IS NOT NULL,
  'C5 有封存時間');
SELECT t_assert((SELECT item ->> 'title' FROM h) = '第一週作業',
  'C6 標題還在');


\echo '════════ D. 🛑 只看得到自己的 ════════'
SELECT t_assert(
  (SELECT count(*) FROM jsonb_array_elements(learn_student_task_history() -> 'items')) = 1,
  'D0 自己只有一筆');

SELECT set_config('app.uid', :oth, false);
CREATE TEMP TABLE h2 AS
SELECT e AS item
  FROM jsonb_array_elements(learn_student_task_history() -> 'items') e;

SELECT t_assert(
  (SELECT (item ->> 'teacher_status') IS NULL FROM h2),
  '🛑 D1 另一位學生看到的是【自己的】評語（NULL），不是別人的 PARTIAL');

SELECT t_assert(
  (SELECT (item ->> 'teacher_note') IS NULL FROM h2),
  '🛑 D2 看不到別人的老師評語');

-- 沒有任何紀錄的第三者：歷史必須是空的
SELECT set_config('app.uid', :adm, false);
SELECT t_assert(
  (learn_student_task_history() ->> 'total')::int = 0,
  '🛑 D3 沒被指派的人看不到任何歷史');


\echo '════════ E. 截止日：只有釘死的那種才回傳 ════════'
SELECT set_config('app.uid', :stu, false);
SELECT t_assert((SELECT item ->> 'due_date' FROM h) = '2026-03-01',
  'E1 CUSTOM_DATE 的日期回傳');
SELECT t_assert((SELECT item ->> 'due_type' FROM h) = 'CUSTOM_DATE',
  'E2 due_type 一併回傳，讓畫面自己決定怎麼顯示');

SELECT set_config('app.is_admin', 'true', false);
SELECT set_config('app.uid', :adm, false);
SELECT learn_admin_archive_task((SELECT id FROM t_next), true);
SELECT set_config('app.is_admin', 'false', false);
SELECT set_config('app.uid', :stu, false);

SELECT t_assert(
  (SELECT e ->> 'due_date' IS NULL
     FROM jsonb_array_elements(learn_student_task_history() -> 'items') e
    WHERE (e ->> 'task_id')::uuid = (SELECT id FROM t_next)),
  '🛑 E3 NEXT_CLASS 不解析成日期——那個值會往前走，算出來是錯的');


\echo '════════ F. 週期任務：累計次數要留著 ════════'
SELECT set_config('app.is_admin', 'true', false);
SELECT set_config('app.uid', :adm, false);
SELECT learn_admin_archive_task((SELECT id FROM t_rec), true);
SELECT set_config('app.is_admin', 'false', false);
SELECT set_config('app.uid', :stu, false);

SELECT t_assert(
  (SELECT (e ->> 'total_logged')::int = 3
     FROM jsonb_array_elements(learn_student_task_history() -> 'items') e
    WHERE (e ->> 'task_id')::uuid = (SELECT id FROM t_rec)),
  'F1 週期任務的累計次數還在');

SELECT t_assert(
  (SELECT (e ->> 'total_logged')::int = 0
     FROM jsonb_array_elements(learn_student_task_history() -> 'items') e
    WHERE (e ->> 'task_id')::uuid = (SELECT id FROM t_fixed)),
  'F2 作業型別沒有 log → 0，不是 null');


\echo '════════ G. 還原之後要離開歷史 ════════'
SELECT set_config('app.is_admin', 'true', false);
SELECT set_config('app.uid', :adm, false);
SELECT learn_admin_archive_task((SELECT id FROM t_fixed), false);
SELECT set_config('app.is_admin', 'false', false);
SELECT set_config('app.uid', :stu, false);

SELECT t_assert(
  NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(learn_student_task_history() -> 'items') e
     WHERE (e ->> 'task_id')::uuid = (SELECT id FROM t_fixed)),
  'G1 還原之後離開歷史');

SELECT t_assert(
  EXISTS (
    SELECT 1 FROM jsonb_array_elements(learn_student_tasks() -> 'homework') e
     WHERE (e ->> 'task_id')::uuid = (SELECT id FROM t_fixed)),
  '🛑 G2 而且回到待辦——歷史與待辦永遠是互補的兩邊');


\echo '════════ H. 🛑 班級封存不該把歷史一起帶走 ════════'
SELECT set_config('app.is_admin', 'true', false);
SELECT set_config('app.uid', :adm, false);
SELECT learn_admin_archive_class((SELECT id FROM c), true);
SELECT set_config('app.is_admin', 'false', false);
SELECT set_config('app.uid', :stu, false);

SELECT t_assert(
  (learn_student_task_history() ->> 'total')::int = 2,
  '🛑 H1 班級封存了，那學期的作業紀錄還在（整個班消失才最該留得住）');

SELECT t_assert(
  jsonb_array_length(learn_student_tasks() -> 'homework') = 0,
  'H2 但待辦是空的——班級結束就沒有要做的事了');


\echo '════════ I. 上限與截斷 ════════'
SELECT t_assert(
  (learn_student_task_history(1) ->> 'truncated')::boolean = true,
  'I1 limit 小於總數 → truncated = true');

SELECT t_assert(
  jsonb_array_length(learn_student_task_history(1) -> 'items') = 1,
  'I2 limit 真的有限制筆數');

SELECT t_assert(
  (learn_student_task_history(1) ->> 'total')::int = 2,
  '🛑 I3 total 是總數，不受 limit 影響（否則畫面會說「共 1 份」）');

SELECT t_assert(
  jsonb_array_length(learn_student_task_history(99999) -> 'items') = 2,
  'I4 過大的 limit 會被夾到上限，不會爆');


\echo '════════ J. 沒登入 ════════'
SELECT set_config('app.uid', '', false);
DO $$
BEGIN
  PERFORM learn_student_task_history();
  RAISE EXCEPTION 'FAIL  🛑 J1 沒登入竟然查得到歷史';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL %' THEN RAISE; END IF;
  RAISE NOTICE 'PASS  🛑 J1 沒登入查不到（擋下：%）', left(SQLERRM, 40);
END $$;

\echo ''
\echo '全部通過'
