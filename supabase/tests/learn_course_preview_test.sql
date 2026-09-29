-- =====================================================
-- 「以學生身分預覽」
--
-- ⚠️ psql 專用，只在本機臨時資料庫跑。
-- 執行方式：bash supabase/tests/run-learn-courses.sh
--
-- 🛑 這份最重要的兩條：
--    1. 預覽模式下，playback 也要跟著被擋。只有畫面鎖住而 API 照發，
--       那個預覽就是在騙人——管理員會以為驗過了。
--    2. p_as_student 只能【減少】權限。它不可以變成任何人的提權開關。
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
\echo '════════ 佈景：一門循序課，兩個單元 ════════'

DELETE FROM learn_lesson_progress;
DELETE FROM learn_course_access;
DELETE FROM learn_course_lessons;
DELETE FROM learn_course_sections;
DELETE FROM learn_courses;

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@p'),
  ('22222222-2222-2222-2222-222222222222', 'stu@p')
ON CONFLICT (id) DO NOTHING;

INSERT INTO learn_courses (id, slug, title, type, access, status, created_by) VALUES
  ('ffffffff-0000-0000-0000-000000000001', 'drip-pv', '循序課', 'DRIP', 'FREE', 'PUBLISHED',
   '11111111-1111-1111-1111-111111111111'),
  ('ffffffff-0000-0000-0000-000000000002', 'draft-pv', '草稿課', 'DRIP', 'FREE', 'DRAFT',
   '11111111-1111-1111-1111-111111111111');

INSERT INTO learn_course_sections (id, course_id, position, title) VALUES
  ('aaaa0000-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 1, '單元 1'),
  ('aaaa0000-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000001', 2, '單元 2'),
  ('aaaa0000-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000002', 1, '草稿單元 1');

INSERT INTO learn_course_lessons
  (id, section_id, position, title, provider, video_id, duration_seconds) VALUES
  ('bbbb0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001', 1,
   'U1 影片', 'YOUTUBE', 'yt-u1', 600),
  ('bbbb0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000002', 1,
   'U2 影片', 'YOUTUBE', 'yt-u2', 600),
  ('bbbb0000-0000-0000-0000-000000000003', 'aaaa0000-0000-0000-0000-000000000003', 1,
   '草稿影片', 'YOUTUBE', 'yt-d1', 600);

\echo ''
\echo '════════ A. 管理員的預設視角（豁免解鎖）════════'

SELECT t_as('11111111-1111-1111-1111-111111111111', true);

SELECT t_assert(
  NOT (learn_course_detail('ffffffff-0000-0000-0000-000000000001')
        -> 'sections' -> 1 ->> 'locked')::boolean,
  'A1 管理員預設看到單元 2 是開的（要能預覽整門課）');
SELECT t_assert(
  learn_course_playback('bbbb0000-0000-0000-0000-000000000002') ->> 'embed_url' IS NOT NULL,
  'A2 而且真的播得動');
SELECT t_assert(
  (learn_course_detail('ffffffff-0000-0000-0000-000000000001')
    -> 'course' ->> 'viewer_is_admin')::boolean,
  '🛑 A3 回傳裡說得出「你是管理員」——少了它，畫面沒辦法告訴人這是特權視角');
SELECT t_assert(
  NOT (learn_course_detail('ffffffff-0000-0000-0000-000000000001')
        -> 'course' ->> 'previewing_as_student')::boolean,
  'A4 預設不是預覽模式');

\echo ''
\echo '════════ B. 🛑 預覽模式：畫面與 API 一起鎖 ════════'

SELECT t_assert(
  (learn_course_detail('ffffffff-0000-0000-0000-000000000001', true)
    -> 'sections' -> 1 ->> 'locked')::boolean,
  'B1 預覽模式下單元 2 是鎖的');
SELECT t_assert(
  (learn_course_detail('ffffffff-0000-0000-0000-000000000001', true)
    -> 'course' ->> 'previewing_as_student')::boolean,
  'B2 回傳裡說得出現在在預覽模式');

SELECT t_raises(
  $$SELECT learn_course_playback('bbbb0000-0000-0000-0000-000000000002', true)$$,
  '42501',
  '🛑 B3 預覽模式下 playback 也被擋——只有畫面鎖住而 API 照發，那個預覽是在騙人');

SELECT t_assert(
  NOT (learn_course_detail('ffffffff-0000-0000-0000-000000000001', true)
        -> 'sections' -> 0 ->> 'locked')::boolean,
  'B4 第一個單元本來就不該鎖');
SELECT t_assert(
  learn_course_playback('bbbb0000-0000-0000-0000-000000000001', true) ->> 'embed_url' IS NOT NULL,
  'B5 第一個單元在預覽模式下播得動');

-- 看完單元 1 之後，預覽模式也該解開。
-- 🛑 不能用 learn_lesson_progress_set 一次送 600——它的增量夾擠（一次最多
--    加真實經過的時間）會讓這裡只加到 60 秒，測試就會因為【錯的理由】失敗。
--    這一份要驗的是預覽，不是夾擠，所以直接把完成寫進去。
INSERT INTO learn_lesson_progress (student_id, lesson_id, watched_seconds, completed_at)
VALUES ('11111111-1111-1111-1111-111111111111',
        'bbbb0000-0000-0000-0000-000000000001', 600, now())
ON CONFLICT (student_id, lesson_id) DO UPDATE
  SET watched_seconds = 600, completed_at = now();
SELECT t_assert(
  NOT (learn_course_detail('ffffffff-0000-0000-0000-000000000001', true)
        -> 'sections' -> 1 ->> 'locked')::boolean,
  'B6 看完單元 1 之後，預覽模式下單元 2 也解開了');

\echo ''
\echo '════════ C. 🛑 只能減少權限，不能提權 ════════'

SELECT t_as('22222222-2222-2222-2222-222222222222', false);
DELETE FROM learn_lesson_progress WHERE student_id = '22222222-2222-2222-2222-222222222222';

SELECT t_assert(
  (learn_course_detail('ffffffff-0000-0000-0000-000000000001', false)
    -> 'sections' -> 1 ->> 'locked')::boolean,
  '🛑 C1 學生傳 false（假裝自己不是在預覽）也【不會】解開鎖');
SELECT t_raises(
  $$SELECT learn_course_playback('bbbb0000-0000-0000-0000-000000000002', false)$$,
  '42501', '🛑 C2 學生傳 false 也拿不到鎖住單元的影片');
SELECT t_assert(
  NOT (learn_course_detail('ffffffff-0000-0000-0000-000000000001')
        -> 'course' ->> 'viewer_is_admin')::boolean,
  'C3 學生的 viewer_is_admin 是 false');
SELECT t_assert(
  NOT (learn_course_detail('ffffffff-0000-0000-0000-000000000001', true)
        -> 'course' ->> 'previewing_as_student')::boolean,
  '🛑 C4 學生傳 true 不會被標成「預覽中」——那是管理員才有的狀態');

SELECT t_raises(
  $$SELECT learn_course_detail('ffffffff-0000-0000-0000-000000000002')$$,
  'P0002', 'C5 學生看不到草稿課');

\echo ''
\echo '════════ D. 🛑 預覽模式不影響草稿的可見性 ════════'

SELECT t_as('11111111-1111-1111-1111-111111111111', true);

SELECT t_assert(
  learn_course_detail('ffffffff-0000-0000-0000-000000000002', true)
    -> 'course' ->> 'slug' = 'draft-pv',
  '🛑 D1 預覽模式下草稿課【仍然看得到】——還沒發布正是最需要預覽的時候');
SELECT t_assert(
  learn_course_playback('bbbb0000-0000-0000-0000-000000000003', true) ->> 'embed_url' IS NOT NULL,
  'D2 草稿課的影片在預覽模式下也播得動');

\echo ''
\echo '════════ E. video_id 仍然不外流 ════════'

SELECT t_assert(
  learn_course_detail('ffffffff-0000-0000-0000-000000000001', true)::text NOT LIKE '%yt-u2%',
  '🛑 E1 預覽模式的回傳裡沒有 video_id');
SELECT t_assert(
  learn_course_detail('ffffffff-0000-0000-0000-000000000001')::text NOT LIKE '%yt-u1%',
  'E2 一般模式也沒有');

\echo ''
\echo '全部通過'
