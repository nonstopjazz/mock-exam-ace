-- =====================================================
-- 自動進度追蹤：累計、夾擠、門檻、強制觀看
--
-- ⚠️ psql 專用，只在本機臨時資料庫跑。
-- 執行方式：bash supabase/tests/run-learn-courses.sh
--
-- 🛑 這份最重要的一條：單次回報的增量不能超過真實經過的時間。
--    沒有它，「打開影片、直接送 watched = 3600」就直接完成——
--    那等於自動追蹤完全沒有意義，而且比手動按按鈕更糟：
--    按按鈕至少是誠實的，這個會假裝它量到了什麼。
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

/**
 * 把上次回報的時間往回撥，模擬「真的過了 N 秒」。
 *
 * 🛑 要先關掉 touch 觸發器。它是 BEFORE UPDATE SET updated_at = now()，
 *    直接 UPDATE updated_at 會被它立刻蓋回來——而測試會安靜地變成
 *    「額度永遠只有 30 秒」，看起來像夾擠壞掉，其實是輔助函式沒生效。
 */
CREATE OR REPLACE FUNCTION t_rewind(p_lesson UUID, p_seconds INTEGER) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  ALTER TABLE learn_lesson_progress DISABLE TRIGGER learn_lesson_progress_touch;
  UPDATE learn_lesson_progress SET updated_at = now() - make_interval(secs => p_seconds)
   WHERE lesson_id = p_lesson;
  ALTER TABLE learn_lesson_progress ENABLE TRIGGER learn_lesson_progress_touch;
END $$;

/** 確認輔助函式真的有效——不然底下每一條夾擠測試都是假的 */
DO $$ BEGIN NULL; END $$;

/** 目前累計了幾秒 */
CREATE OR REPLACE FUNCTION t_watched(p_lesson UUID) RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT coalesce(watched_seconds, 0) FROM learn_lesson_progress WHERE lesson_id = p_lesson;
$$;

\echo ''
\echo '════════ 佈景 ════════'

DELETE FROM learn_course_access;
DELETE FROM learn_lesson_progress;
DELETE FROM learn_course_lessons;
DELETE FROM learn_course_sections;
DELETE FROM learn_courses;

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@w'),
  ('22222222-2222-2222-2222-222222222222', 'stu@w')
ON CONFLICT (id) DO NOTHING;

-- 兩門課：一門普通、一門強制觀看的循序課
INSERT INTO learn_courses (id, slug, title, type, access, status, require_watch, created_by) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'normal', '普通課',
   'STANDARD', 'FREE', 'PUBLISHED', false, '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'strict', '強制觀看的循序課',
   'DRIP', 'FREE', 'PUBLISHED', true, '11111111-1111-1111-1111-111111111111');

INSERT INTO learn_course_sections (id, course_id, position, title) VALUES
  ('66660000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 1, '第 1 週'),
  ('66660000-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002', 1, '單元 1'),
  ('66660000-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000002', 2, '單元 2');

-- 1000 秒的影片：門檻是 900
INSERT INTO learn_course_lessons
  (id, section_id, position, title, provider, video_id, duration_seconds) VALUES
  ('77770000-0000-0000-0000-000000000001', '66660000-0000-0000-0000-000000000001', 1,
   '普通課的影片', 'YOUTUBE', 'yt000000001', 1000),
  ('77770000-0000-0000-0000-000000000002', '66660000-0000-0000-0000-000000000002', 1,
   '強制課單元 1', 'YOUTUBE', 'yt000000002', 1000),
  ('77770000-0000-0000-0000-000000000003', '66660000-0000-0000-0000-000000000003', 1,
   '強制課單元 2', 'YOUTUBE', 'yt000000003', 1000);

SELECT t_as('22222222-2222-2222-2222-222222222222');

\echo ''
\echo '════════ A. 累計與夾擠 ════════'

SELECT learn_lesson_progress_set('77770000-0000-0000-0000-000000000001', 30, NULL, 30);
SELECT t_assert(t_watched('77770000-0000-0000-0000-000000000001') = 30, 'A1 第一次回報記下來了');

-- 🛑 先證明 t_rewind 真的有效。它沒效的話，底下每一條夾擠測試都會
--    因為【錯的理由】通過或失敗，而那比沒有測試更糟。
SELECT t_rewind('77770000-0000-0000-0000-000000000001', 500);
SELECT t_assert(
  (SELECT extract(epoch FROM (now() - updated_at))::int BETWEEN 400 AND 600
     FROM learn_lesson_progress WHERE lesson_id = '77770000-0000-0000-0000-000000000001'),
  '🛑 A1b t_rewind 真的把 updated_at 撥回去了（觸發器沒把它蓋掉）');

SELECT t_rewind('77770000-0000-0000-0000-000000000001', 40);
SELECT learn_lesson_progress_set('77770000-0000-0000-0000-000000000001', 70, NULL, 70);
SELECT t_assert(t_watched('77770000-0000-0000-0000-000000000001') = 70, 'A2 正常播放累加得上去');

-- 🛑 直接送 3600。距上次回報只過了 0 秒，額度是 0 + 30。
SELECT learn_lesson_progress_set('77770000-0000-0000-0000-000000000001', 999, NULL, 3600);
SELECT t_assert(t_watched('77770000-0000-0000-0000-000000000001') <= 100,
  '🛑 A3 一次送 3600 秒 → 被夾成最多 +30，不會直接跳到完成');
SELECT t_assert(NOT (SELECT completed_at IS NOT NULL FROM learn_lesson_progress
                      WHERE lesson_id = '77770000-0000-0000-0000-000000000001'),
  '🛑 A4 所以也沒有因此被判定完成');

-- 回報比目前小的數字（換裝置、重新整理後從頭播）
SELECT learn_lesson_progress_set('77770000-0000-0000-0000-000000000001', 5, NULL, 5);
SELECT t_assert(t_watched('77770000-0000-0000-0000-000000000001') >= 70,
  '🛑 A5 只增不減——換裝置從頭播不會把累計歸零');

\echo ''
\echo '════════ B. 門檻 ════════'

-- 1000 秒的影片，門檻 900。撥回 2000 秒讓額度夠。
SELECT t_rewind('77770000-0000-0000-0000-000000000001', 2000);
SELECT learn_lesson_progress_set('77770000-0000-0000-0000-000000000001', 890, NULL, 890);
SELECT t_assert(NOT (SELECT completed_at IS NOT NULL FROM learn_lesson_progress
                      WHERE lesson_id = '77770000-0000-0000-0000-000000000001'),
  'B1 看了 890 / 1000（89%）還不算完成');

SELECT t_rewind('77770000-0000-0000-0000-000000000001', 2000);
SELECT learn_lesson_progress_set('77770000-0000-0000-0000-000000000001', 900, NULL, 900);
SELECT t_assert((SELECT completed_at IS NOT NULL FROM learn_lesson_progress
                  WHERE lesson_id = '77770000-0000-0000-0000-000000000001'),
  'B2 到 900（90%）自動完成，不用按任何東西');

SELECT t_assert(t_watched('77770000-0000-0000-0000-000000000001') <= 1000,
  'B3 累計不會超過影片長度');

SELECT t_rewind('77770000-0000-0000-0000-000000000001', 2000);
SELECT learn_lesson_progress_set('77770000-0000-0000-0000-000000000001', 0, false, 0);
SELECT t_assert((SELECT completed_at IS NOT NULL FROM learn_lesson_progress
                  WHERE lesson_id = '77770000-0000-0000-0000-000000000001'),
  '🛑 B4 完成之後再回報不會被清掉');

\echo ''
\echo '════════ C. require_watch ════════'

-- 普通課（require_watch = false）：自己按有效
DELETE FROM learn_lesson_progress;
SELECT learn_lesson_progress_set('77770000-0000-0000-0000-000000000001', 10, true, 10);
SELECT t_assert((SELECT completed_at IS NOT NULL FROM learn_lesson_progress
                  WHERE lesson_id = '77770000-0000-0000-0000-000000000001'),
  'C1 沒有強制觀看時，學生自己按「標記為完成」有效');

-- 強制課：自己按無效
SELECT learn_lesson_progress_set('77770000-0000-0000-0000-000000000002', 10, true, 10);
SELECT t_assert(NOT (SELECT completed_at IS NOT NULL FROM learn_lesson_progress
                      WHERE lesson_id = '77770000-0000-0000-0000-000000000002'),
  '🛑 C2 require_watch = true 時，自己按【沒有用】');

-- 但看到門檻仍然完成
SELECT t_rewind('77770000-0000-0000-0000-000000000002', 2000);
SELECT learn_lesson_progress_set('77770000-0000-0000-0000-000000000002', 900, NULL, 900);
SELECT t_assert((SELECT completed_at IS NOT NULL FROM learn_lesson_progress
                  WHERE lesson_id = '77770000-0000-0000-0000-000000000002'),
  'C3 真的看到門檻就完成');

\echo ''
\echo '════════ D. 循序解鎖真的跟著走 ════════'

SELECT t_assert(
  NOT (learn_course_detail('dddddddd-0000-0000-0000-000000000002')
        -> 'sections' -> 1 ->> 'locked')::boolean,
  'D1 單元 1 看完了，單元 2 解開');

SELECT t_assert(
  learn_course_playback('77770000-0000-0000-0000-000000000003') ->> 'embed_url' IS NOT NULL,
  'D2 而且 playback 真的發得出來');

-- 把完成拿掉，單元 2 應該重新鎖上
UPDATE learn_lesson_progress SET completed_at = NULL, watched_seconds = 100
 WHERE lesson_id = '77770000-0000-0000-0000-000000000002';
SELECT t_assert(
  (learn_course_detail('dddddddd-0000-0000-0000-000000000002')
    -> 'sections' -> 1 ->> 'locked')::boolean,
  'D3 沒看完就鎖回去');

\echo ''
\echo '════════ E. 大綱要帶得出進度 ════════'

SELECT t_assert(
  (learn_course_detail('dddddddd-0000-0000-0000-000000000002')
    -> 'sections' -> 0 -> 'lessons' -> 0 ->> 'threshold_seconds')::int = 900,
  'E1 帶得出門檻秒數（畫面才說得出「再看 N 秒」）');

SELECT t_assert(
  (learn_course_detail('dddddddd-0000-0000-0000-000000000002')
    -> 'sections' -> 0 -> 'lessons' -> 0 ->> 'watched_seconds')::int = 100,
  'E2 帶得出已看秒數');

SELECT t_assert(
  (learn_course_detail('dddddddd-0000-0000-0000-000000000002')
    -> 'course' ->> 'require_watch')::boolean,
  'E3 帶得出這門課有沒有強制觀看（畫面據此決定顯不顯示按鈕）');

SELECT t_assert(
  learn_course_detail('dddddddd-0000-0000-0000-000000000002')::text NOT LIKE '%yt000000%',
  '🛑 E4 加了這些欄位之後，video_id 仍然【沒有】外流');

\echo ''
\echo '════════ F. 權限沒有被這次改動弄鬆 ════════'

SELECT t_as(NULL);
DO $$ BEGIN
  BEGIN
    PERFORM learn_lesson_progress_set('77770000-0000-0000-0000-000000000001', 1, NULL, 1);
    RAISE EXCEPTION 'FAIL  F1 未登入竟然回報得了進度';
  EXCEPTION WHEN sqlstate '28000' THEN RAISE NOTICE 'PASS  F1 未登入回報進度 → 28000';
  END;
END $$;

SELECT t_assert(
  (SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'learn_lesson_progress_set'),
  '🛑 F2 progress_set 只有一個版本——多一個 overload 會讓 rpc() 回 not unique');

SELECT t_assert(
  (SELECT count(*) = 0 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND routine_name = 'learn_lesson_progress_set'
      AND grantee IN ('anon', 'PUBLIC')),
  'F3 沒有授權給 anon');

\echo ''
\echo '全部通過'
