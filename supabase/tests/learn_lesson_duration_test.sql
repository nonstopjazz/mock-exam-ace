-- =====================================================
-- 影片長度自動補：權限、範圍、不覆蓋
--
-- ⚠️ psql 專用，只在本機臨時資料庫跑。
-- 執行方式：bash supabase/tests/run-learn-courses.sh
--
-- 🛑 這份最重要的一條：學生不能寫這個欄位。
--    duration_seconds 決定觀看完成門檻（duration × 90%）。學生若能把它
--    設成 1 秒，每一支影片都會在開始播的瞬間完成，循序課的解鎖整個失效。
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

CREATE OR REPLACE FUNCTION t_raises(p_sql TEXT, p_state TEXT, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE v_got TEXT;
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'FAIL  % —— 應該要報錯，但沒有', label;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_got = RETURNED_SQLSTATE;
    IF v_got = 'P0001' AND SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    IF v_got = p_state THEN RAISE NOTICE 'PASS  % (%)', label, v_got;
    ELSE RAISE EXCEPTION 'FAIL  % —— 預期 %，實際 % (%)', label, p_state, v_got, SQLERRM;
    END IF;
  END;
END $$;

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce(current_setting('app.is_admin', true), 'false')::boolean;
$$;

CREATE OR REPLACE FUNCTION t_as(p_uid UUID, p_admin BOOLEAN DEFAULT false) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.uid', coalesce(p_uid::text, ''), false);
  PERFORM set_config('request.jwt.claims', '', false);
  PERFORM set_config('app.is_admin', p_admin::text, false);
END $$;

\echo ''
\echo '════════ 佈景 ════════'

DELETE FROM learn_lesson_progress;
DELETE FROM learn_course_lessons;
DELETE FROM learn_course_sections;
DELETE FROM learn_courses;

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@d'),
  ('22222222-2222-2222-2222-222222222222', 'stu@d')
ON CONFLICT (id) DO NOTHING;

INSERT INTO learn_courses (id, slug, title, status, access, created_by) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'dur', '長度測試', 'PUBLISHED', 'FREE',
   '11111111-1111-1111-1111-111111111111');
INSERT INTO learn_course_sections (id, course_id, position, title) VALUES
  ('88880000-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 1, 'S1');
INSERT INTO learn_course_lessons
  (id, section_id, position, title, provider, video_id, duration_seconds) VALUES
  ('99990000-0000-0000-0000-000000000001', '88880000-0000-0000-0000-000000000001', 1,
   '還沒填長度', 'BUNNY', 'guid-1', 0),
  ('99990000-0000-0000-0000-000000000002', '88880000-0000-0000-0000-000000000001', 2,
   '已經填過', 'BUNNY', 'guid-2', 1234);

\echo ''
\echo '════════ A. 🛑 權限 ════════'

SELECT t_as('22222222-2222-2222-2222-222222222222', false);
SELECT t_raises(
  $$SELECT learn_admin_lesson_duration_set('99990000-0000-0000-0000-000000000001', 600)$$,
  '42501',
  '🛑 A1 學生不能寫影片長度——寫得動就能把門檻設成 1 秒，讓每支影片瞬間完成');

SELECT t_as(NULL, false);
SELECT t_raises(
  $$SELECT learn_admin_lesson_duration_set('99990000-0000-0000-0000-000000000001', 600)$$,
  '42501', 'A2 未登入也不行');

SELECT t_assert(
  (SELECT duration_seconds = 0 FROM learn_course_lessons
    WHERE id = '99990000-0000-0000-0000-000000000001'),
  '🛑 A3 被擋下來之後欄位確實沒有被改到');

\echo ''
\echo '════════ B. 正常寫入 ════════'

SELECT t_as('11111111-1111-1111-1111-111111111111', true);

SELECT t_assert(
  (learn_admin_lesson_duration_set('99990000-0000-0000-0000-000000000001', 930)
    ->> 'updated')::boolean,
  'B1 原本是 0 → 寫得進去');
SELECT t_assert(
  (SELECT duration_seconds = 930 FROM learn_course_lessons
    WHERE id = '99990000-0000-0000-0000-000000000001'),
  'B2 值真的進去了');

SELECT t_assert(
  NOT (learn_admin_lesson_duration_set('99990000-0000-0000-0000-000000000001', 5)
        ->> 'updated')::boolean,
  '🛑 B3 已經有值就不動——管理員手動調過的數字不該被下一次預覽悄悄改掉');
SELECT t_assert(
  (SELECT duration_seconds = 930 FROM learn_course_lessons
    WHERE id = '99990000-0000-0000-0000-000000000001'),
  'B4 而且真的沒被改');

SELECT t_assert(
  (learn_admin_lesson_duration_set('99990000-0000-0000-0000-000000000002', 99)
    ->> 'duration_seconds')::int = 1234,
  'B5 沒寫入時回傳的是目前的值，不是送進去的那個');

\echo ''
\echo '════════ C. 不合理的值 ════════'

DELETE FROM learn_course_lessons WHERE id = '99990000-0000-0000-0000-000000000003';
INSERT INTO learn_course_lessons
  (id, section_id, position, title, provider, video_id, duration_seconds) VALUES
  ('99990000-0000-0000-0000-000000000003', '88880000-0000-0000-0000-000000000001', 3,
   '邊界用', 'YOUTUBE', 'yt-3', 0);

SELECT t_raises(
  $$SELECT learn_admin_lesson_duration_set('99990000-0000-0000-0000-000000000003', 0)$$,
  '22023', 'C1 0 秒不合理');
SELECT t_raises(
  $$SELECT learn_admin_lesson_duration_set('99990000-0000-0000-0000-000000000003', -5)$$,
  '22023', 'C2 負數不合理');
SELECT t_raises(
  $$SELECT learn_admin_lesson_duration_set('99990000-0000-0000-0000-000000000003', 90000)$$,
  '22023', '🛑 C3 超過 24 小時 → 那不是課程影片，是壞掉的回報');
SELECT t_raises(
  $$SELECT learn_admin_lesson_duration_set('99990000-0000-0000-0000-000000000003', NULL)$$,
  '22023', 'C4 NULL 也擋下來');

SELECT t_assert(
  (learn_admin_lesson_duration_set('99990000-0000-0000-0000-000000000003', 86400)
    ->> 'updated')::boolean,
  'C5 剛好 24 小時可以');

SELECT t_raises(
  $$SELECT learn_admin_lesson_duration_set('00000000-0000-0000-0000-000000000000', 100)$$,
  'P0002', 'C6 影片不存在');

\echo ''
\echo '════════ D. 補了長度之後門檻跟著對 ════════'

SELECT t_assert(
  (SELECT ceil(duration_seconds * learn_watch_complete_ratio())::int = 837
     FROM learn_course_lessons WHERE id = '99990000-0000-0000-0000-000000000001'),
  'D1 930 秒 → 門檻 837 秒（90%）');

SELECT t_assert(
  (learn_course_detail('eeeeeeee-0000-0000-0000-000000000001')
    -> 'sections' -> 0 -> 'lessons' -> 0 ->> 'threshold_seconds')::int = 837,
  '🛑 D2 大綱帶出來的門檻也跟著更新——不然畫面會說「再看 0 秒」');

\echo ''
\echo '全部通過'
