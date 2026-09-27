-- =====================================================
-- 任務封存／還原
--
-- 🛑 這份測試最重要的一條是【封存不可以碰到歷史】。
--    learn_task_assignees.task_id 是 ON DELETE CASCADE——
--    哪天有人把封存做成刪除，所有學生的完成紀錄會一起消失，
--    而且畫面上不會有任何徵兆，因為那些紀錄本來就不在老師眼前。
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

-- 🛑 create_user_profiles_table.sql 會把 is_admin() 換成查 email 的版本，
--    蓋掉本機替身的 GUC 版。測試要自己把它換回來，否則所有 admin RPC 都被擋。
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce(current_setting('app.is_admin', true), 'false')::boolean;
$$;

\set adm '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set stu '''11111111-1111-1111-1111-111111111111'''
INSERT INTO auth.users (id, email) VALUES
  (:adm, 'admin@example.test'), (:stu, 'stu@example.test')
  ON CONFLICT DO NOTHING;

SELECT set_config('app.is_admin', 'true', false);
SELECT set_config('app.uid', :adm, false);

CREATE TEMP TABLE c AS
SELECT (learn_admin_upsert_class(NULL, '測試班', NULL, NULL) ->> 'id')::uuid AS id;
SELECT learn_admin_add_class_members((SELECT id FROM c), ARRAY[:stu]::uuid[]);

CREATE TEMP TABLE t AS
SELECT (learn_admin_upsert_task(
          NULL, (SELECT id FROM c), 'HOMEWORK', '第一週作業',
          '寫完課本 p.12', 'NONE', NULL, NULL, NULL, NULL) -> 'task' ->> 'id')::uuid AS id;

-- 學生回報完成 → 這就是不可以消失的歷史
SELECT learn_admin_check_task((SELECT id FROM t), :stu, 'DONE', NULL, '寫得不錯');

\echo '════════ A. 封存 ════════'

SELECT t_assert(
  (SELECT count(*)::int FROM jsonb_array_elements(
     learn_admin_class_detail((SELECT id FROM c)) -> 'tasks')) = 1,
  'A1 封存前，班級頁看得到這個任務');

SELECT learn_admin_archive_task((SELECT id FROM t), true);

SELECT t_assert(
  (SELECT count(*)::int FROM jsonb_array_elements(
     learn_admin_class_detail((SELECT id FROM c)) -> 'tasks')) = 0,
  '🛑 A2 封存後【預設看不到】——封存的意義就是不要再出現在眼前');

SELECT t_assert(
  (SELECT count(*)::int FROM jsonb_array_elements(
     learn_admin_class_detail((SELECT id FROM c), true) -> 'tasks')) = 1,
  '🛑 A3 但 p_include_archived = true 時看得到——否則封存等於單向消失');

SELECT t_assert(
  (SELECT e ->> 'archived_at' IS NOT NULL
     FROM jsonb_array_elements(
       learn_admin_class_detail((SELECT id FROM c), true) -> 'tasks') e),
  'A4 帶得出封存時間，畫面才顯示得了「什麼時候封存的」');

\echo '════════ B. 歷史不可以消失 ════════'

SELECT t_assert(
  (SELECT count(*)::int FROM learn_task_assignees WHERE task_id = (SELECT id FROM t)) = 1,
  '🛑 B1 封存之後指派紀錄還在');

SELECT t_assert(
  (SELECT teacher_status = 'DONE' AND teacher_note = '寫得不錯'
     FROM learn_task_assignees WHERE task_id = (SELECT id FROM t)),
  '🛑 B2 老師批改的結果一個字都沒變');

SELECT t_assert(
  (SELECT count(*)::int FROM learn_tasks WHERE id = (SELECT id FROM t)) = 1,
  'B3 任務本身還在，只是狀態變了');

\echo '════════ C. 學生端 ════════'

SELECT set_config('app.is_admin', 'false', false);
SELECT set_config('app.uid', :stu, false);

SELECT t_assert(
  (SELECT count(*)::int FROM jsonb_array_elements(learn_student_tasks() -> 'homework')) = 0,
  '🛑 C1 封存後學生的待辦裡沒有它');

\echo '════════ D. 還原 ════════'

SELECT set_config('app.is_admin', 'true', false);
SELECT set_config('app.uid', :adm, false);

CREATE TEMP TABLE archived_at_before AS
SELECT archived_at FROM learn_tasks WHERE id = (SELECT id FROM t);

-- 重複封存不更新時間：老師點兩次不該讓它看起來是剛剛才封存的
SELECT pg_sleep(0.05);
SELECT learn_admin_archive_task((SELECT id FROM t), true);
SELECT t_assert(
  (SELECT archived_at FROM learn_tasks WHERE id = (SELECT id FROM t))
    = (SELECT archived_at FROM archived_at_before),
  'D1 重複封存不會把時間往後推');

SELECT learn_admin_archive_task((SELECT id FROM t), false);

SELECT t_assert(
  (SELECT status = 'ACTIVE' AND archived_at IS NULL
     FROM learn_tasks WHERE id = (SELECT id FROM t)),
  '🛑 D2 還原之後 archived_at 要清掉——留著就會顯示一個已經不成立的日期');

SELECT t_assert(
  (SELECT count(*)::int FROM jsonb_array_elements(
     learn_admin_class_detail((SELECT id FROM c)) -> 'tasks')) = 1,
  'D3 還原之後又回到班級頁');

SELECT t_assert(
  (SELECT teacher_status = 'DONE' FROM learn_task_assignees WHERE task_id = (SELECT id FROM t)),
  '🛑 D4 繞了一圈，批改結果仍然完好');

\echo '════════ E. 權限 ════════'

SELECT set_config('app.is_admin', 'false', false);
DO $$
BEGIN
  PERFORM learn_admin_archive_task((SELECT id FROM t), true);
  RAISE EXCEPTION 'FAIL  🛑 E1 非管理員竟然封存得了';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL %' THEN RAISE; END IF;
  RAISE NOTICE 'PASS  🛑 E1 非管理員封存不了（擋下：%）', left(SQLERRM, 40);
END $$;

\echo ''
\echo '全部通過'
