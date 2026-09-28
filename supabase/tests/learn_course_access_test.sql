-- =====================================================
-- 影片課程：權限、解鎖與影片位址的資料層測試
--
-- ⚠️ psql 專用。不要貼進 Supabase SQL Editor。
-- ⚠️ 只在本機臨時資料庫跑。
--
-- 執行方式（前置 migration 見 scripts/verify-learn-courses.sh）：
--   psql -v ON_ERROR_STOP=1 -d crs -f supabase/tests/learn_course_access_test.sql
--
--
-- 🛑 這份測試最重要的兩條
--
--   1. video_id 不可以出現在大綱的回傳裡。前端把它藏起來不算數——
--      鎖住的單元只要 video_id 送出去了，鎖就是裝飾。
--
--   2. 「鎖住」在 learn_course_detail 與 learn_course_playback 必須一致。
--      畫面顯示鎖著、API 照發，是比完全不鎖更糟的狀態：你會以為它有在擋。
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

/** 斷言某段 SQL 會丟出指定的 SQLSTATE */
CREATE OR REPLACE FUNCTION t_raises(p_sql TEXT, p_state TEXT, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE v_got TEXT;
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'FAIL  % —— 應該要報錯，但沒有', label;
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_got = RETURNED_SQLSTATE;
      IF v_got = 'P0001' AND SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
      IF v_got = p_state THEN RAISE NOTICE 'PASS  % (%)', label, v_got;
      ELSE RAISE EXCEPTION 'FAIL  % —— 預期 %，實際 % (%)', label, p_state, v_got, SQLERRM;
      END IF;
  END;
END $$;

-- 🛑 is_admin() 的替身【寫在這裡】，不靠 _local_harness.sql。
--    create_user_profiles_table.sql 會用真版覆蓋掉 harness 的替身，
--    所以「先載哪一份」會決定測試過不過——那種測試不算證明了什麼。
--    這裡最後覆蓋一次，順序就不再影響結果。
--
--    ⚠️ learn_feature_enabled() 刻意【不】替身：A2 / A9 驗的就是閘門本身，
--       用永遠回 true 的替身會讓那兩條假通過。
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce(current_setting('app.is_admin', true), 'false')::boolean;
$$;

/** 切換身分 */
CREATE OR REPLACE FUNCTION t_as(p_uid UUID, p_admin BOOLEAN DEFAULT false) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.uid', coalesce(p_uid::text, ''), false);
  PERFORM set_config('request.jwt.claims', '', false);
  PERFORM set_config('app.is_admin', p_admin::text, false);
END $$;

-- ── 佈景 ──────────────────────────────────────────────
\echo ''
\echo '════════ 佈景 ════════'

-- 🛑 先把上一輪造的假 Vault 清掉。不清的話 D2（沒金鑰要報錯）第二次跑
--    就會通不過——而「只有在全新資料庫上才會過」的測試證明不了任何事。
DROP TABLE IF EXISTS vault.decrypted_secrets;
UPDATE learn_course_config
   SET bunny_library_id = NULL, bunny_token_required = true, bunny_token_ttl_seconds = 14400;

DELETE FROM learn_course_access;
DELETE FROM learn_lesson_progress;
DELETE FROM learn_course_lessons;
DELETE FROM learn_course_sections;
DELETE FROM learn_courses;
DELETE FROM learn_feature_access;
DELETE FROM learn_class_members;
DELETE FROM learn_classes;

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@t'),
  ('22222222-2222-2222-2222-222222222222', 'enrolled@t'),
  ('33333333-3333-3333-3333-333333333333', 'nofeature@t'),
  ('44444444-4444-4444-4444-444444444444', 'byclass@t'),
  ('55555555-5555-5555-5555-555555555555', 'left@t'),
  ('66666666-6666-6666-6666-666666666666', 'featureonly@t')
ON CONFLICT (id) DO NOTHING;

INSERT INTO learn_classes (id, name, status, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'A 班', 'ACTIVE',
   '11111111-1111-1111-1111-111111111111');

INSERT INTO learn_class_members (class_id, student_id, left_at, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444',
   NULL, '11111111-1111-1111-1111-111111111111'),
  -- 🛑 已退出。A7 就是在驗這個人看不到。
  ('aaaaaaaa-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
   now() - interval '1 day', '11111111-1111-1111-1111-111111111111');

-- 課程功能開給：enrolled / byclass / left / featureonly，不開給 nofeature
INSERT INTO learn_feature_access (feature, student_id, granted_by) VALUES
  ('course', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111'),
  ('course', '55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111'),
  ('course', '66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111');
INSERT INTO learn_feature_access (feature, class_id, granted_by) VALUES
  ('course', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');

-- 三門課：需選課的週次課、免費課、循序解鎖課
INSERT INTO learn_courses (id, slug, title, type, access, status, created_by) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'paid-standard', '需選課的週次課',
   'STANDARD', 'ENROLLED', 'PUBLISHED', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000002', 'free-course', '免費課',
   'STANDARD', 'FREE', 'PUBLISHED', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000003', 'drip-course', '循序解鎖課',
   'DRIP', 'ENROLLED', 'PUBLISHED', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000004', 'draft-course', '還沒發布的課',
   'STANDARD', 'FREE', 'DRAFT', '11111111-1111-1111-1111-111111111111');

INSERT INTO learn_course_sections (id, course_id, position, title) VALUES
  ('55550000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 1, '第 1 週'),
  ('55550000-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 1, '單元 1'),
  ('55550000-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003', 2, '單元 2'),
  ('55550000-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000002', 1, '第 1 週');

INSERT INTO learn_course_lessons
  (id, section_id, position, title, provider, video_id, duration_seconds, is_preview) VALUES
  ('11110000-0000-0000-0000-000000000001', '55550000-0000-0000-0000-000000000001', 1,
   '週次課第一支', 'BUNNY', 'bunny-secret-guid-1', 900, false),
  ('11110000-0000-0000-0000-000000000002', '55550000-0000-0000-0000-000000000002', 1,
   '單元 1 第一支', 'YOUTUBE', 'ytvid000001', 600, false),
  ('11110000-0000-0000-0000-000000000003', '55550000-0000-0000-0000-000000000002', 2,
   '單元 1 第二支', 'YOUTUBE', 'ytvid000002', 600, false),
  ('11110000-0000-0000-0000-000000000004', '55550000-0000-0000-0000-000000000003', 1,
   '單元 2 第一支', 'YOUTUBE', 'ytvid000003', 600, false),
  -- 🛑 放在【鎖住的】單元 2 裡的試看片。C7 在驗它照樣播得動。
  ('11110000-0000-0000-0000-000000000005', '55550000-0000-0000-0000-000000000003', 2,
   '單元 2 的試看片', 'YOUTUBE', 'ytpreview01', 120, true),
  ('11110000-0000-0000-0000-000000000006', '55550000-0000-0000-0000-000000000004', 1,
   '免費課第一支', 'YOUTUBE', 'ytfree00001', 300, false);

-- enrolled 個別選了週次課與循序課；byclass 整班拿到週次課
INSERT INTO learn_course_access (course_id, student_id, granted_by) VALUES
  ('cccccccc-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111');
INSERT INTO learn_course_access (course_id, class_id, granted_by) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111');


\echo ''
\echo '════════ A. 權限三層 ════════'

SELECT t_as(NULL);
SELECT t_raises('SELECT learn_course_list()', '28000', 'A1 沒登入叫清單 → 28000');

SELECT t_as('33333333-3333-3333-3333-333333333333');
SELECT t_assert(jsonb_array_length(learn_course_list()) = 0,
  'A2 沒有課程功能 → 清單是空的');

SELECT t_as('22222222-2222-2222-2222-222222222222');
SELECT t_assert(NOT learn_course_visible('cccccccc-0000-0000-0000-000000000004'),
  'A3 草稿課，學生看不到');

SELECT t_as('66666666-6666-6666-6666-666666666666');
SELECT t_assert(NOT learn_course_visible('cccccccc-0000-0000-0000-000000000001'),
  'A4 有功能但沒選課 → 看不到需選課的那門');

SELECT t_as('22222222-2222-2222-2222-222222222222');
SELECT t_assert(learn_course_visible('cccccccc-0000-0000-0000-000000000001'),
  'A5 個別選課 → 看得到');

SELECT t_as('44444444-4444-4444-4444-444444444444');
SELECT t_assert(learn_course_visible('cccccccc-0000-0000-0000-000000000001'),
  'A6 整班授權 → 看得到');

SELECT t_as('55555555-5555-5555-5555-555555555555');
SELECT t_assert(NOT learn_course_visible('cccccccc-0000-0000-0000-000000000001'),
  '🛑 A7 已退出班級（left_at 有值）→ 看不到那班的課');

SELECT t_as('66666666-6666-6666-6666-666666666666');
SELECT t_assert(learn_course_visible('cccccccc-0000-0000-0000-000000000002'),
  'A8 免費課，有功能就看得到，不必選課');

SELECT t_as('33333333-3333-3333-3333-333333333333');
SELECT t_assert(NOT learn_course_visible('cccccccc-0000-0000-0000-000000000002'),
  '🛑 A9 免費課【不等於】公開——沒有課程功能的人還是看不到');

SELECT t_as('11111111-1111-1111-1111-111111111111', true);
SELECT t_assert(learn_course_visible('cccccccc-0000-0000-0000-000000000004'),
  'A10 管理員看得到草稿');
SELECT t_assert(jsonb_array_length(learn_course_list()) = 4,
  'A11 管理員的清單含草稿，共 4 門');

SELECT t_as('22222222-2222-2222-2222-222222222222');
SELECT t_assert(jsonb_array_length(learn_course_list()) = 3,
  'A12 enrolled 看得到 3 門（週次 + 循序 + 免費），看不到草稿');


\echo ''
\echo '════════ B. video_id 不可以外流 ════════'

SELECT t_as('22222222-2222-2222-2222-222222222222');

SELECT t_assert(
  learn_course_detail('cccccccc-0000-0000-0000-000000000001')::text
    NOT LIKE '%bunny-secret-guid-1%',
  '🛑 B1 大綱的回傳裡沒有 video_id');

SELECT t_assert(
  learn_course_list()::text NOT LIKE '%ytvid%'
  AND learn_course_list()::text NOT LIKE '%bunny-secret%',
  '🛑 B2 清單的回傳裡沒有 video_id');

-- 鎖住的單元更不能漏
SELECT t_assert(
  learn_course_detail('cccccccc-0000-0000-0000-000000000003')::text
    NOT LIKE '%ytvid000003%',
  '🛑 B3 鎖住單元的 video_id 也不在大綱裡');

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM 1 FROM public.learn_course_lessons LIMIT 1;
  RESET ROLE;
  RAISE EXCEPTION 'FAIL  🛑 B4 authenticated 竟然直接讀得到 learn_course_lessons';
EXCEPTION WHEN insufficient_privilege THEN
  RESET ROLE;
  RAISE NOTICE 'PASS  🛑 B4 authenticated 直接 select learn_course_lessons → 被拒';
END $$;

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM public.learn_bunny_token_key();
  RESET ROLE;
  RAISE EXCEPTION 'FAIL  🛑 B5 authenticated 竟然叫得動 learn_bunny_token_key()';
EXCEPTION WHEN insufficient_privilege THEN
  RESET ROLE;
  RAISE NOTICE 'PASS  🛑 B5 authenticated 叫 learn_bunny_token_key() → 被拒';
END $$;


\echo ''
\echo '════════ C. 播放要再驗一次，而且跟大綱一致 ════════'

SELECT t_as('66666666-6666-6666-6666-666666666666');
SELECT t_raises(
  $$SELECT learn_course_playback('11110000-0000-0000-0000-000000000001')$$,
  'P0002', 'C1 沒選課的人叫 playback → P0002（與「不存在」同一個錯誤）');

SELECT t_as('22222222-2222-2222-2222-222222222222');
SELECT t_assert(
  learn_course_playback('11110000-0000-0000-0000-000000000002') ->> 'embed_url'
    LIKE 'https://www.youtube-nocookie.com/embed/ytvid000001%',
  'C2 選了課 → 拿得到 YouTube 的 embed_url，而且是 nocookie');

SELECT t_raises(
  $$SELECT learn_course_playback('11110000-0000-0000-0000-000000000004')$$,
  '42501', '🛑 C3 循序課第 2 段沒解鎖 → playback 報 42501，不是只有畫面鎖著');

-- 大綱說的鎖，跟 playback 的行為要一致
SELECT t_assert(
  (learn_course_detail('cccccccc-0000-0000-0000-000000000003')
     -> 'sections' -> 1 ->> 'locked')::boolean,
  '🛑 C4 大綱也說第 2 段是鎖的（兩邊同一套規則）');

-- 把單元 1 兩支都標完成
SELECT learn_lesson_progress_set('11110000-0000-0000-0000-000000000002', 600, true);
SELECT learn_lesson_progress_set('11110000-0000-0000-0000-000000000003', 600, true);

SELECT t_assert(
  NOT (learn_course_detail('cccccccc-0000-0000-0000-000000000003')
        -> 'sections' -> 1 ->> 'locked')::boolean,
  'C5 單元 1 全部看完 → 大綱說第 2 段解開了');
SELECT t_assert(
  learn_course_playback('11110000-0000-0000-0000-000000000004') ->> 'embed_url' IS NOT NULL,
  'C6 而且 playback 也真的發得出來');

SELECT t_as('22222222-2222-2222-2222-222222222222');
DELETE FROM learn_lesson_progress WHERE student_id = '22222222-2222-2222-2222-222222222222';
SELECT t_assert(
  learn_course_playback('11110000-0000-0000-0000-000000000005') ->> 'embed_url' IS NOT NULL,
  '🛑 C7 試看片在【鎖住的】單元裡也播得動（明確的設計決定，不是漏洞）');

SELECT t_as('66666666-6666-6666-6666-666666666666');
SELECT t_assert(
  learn_course_playback('11110000-0000-0000-0000-000000000005') ->> 'embed_url' IS NOT NULL,
  'C8 沒選課的人也播得動試看片');

SELECT t_as('33333333-3333-3333-3333-333333333333');
SELECT t_raises(
  $$SELECT learn_course_playback('11110000-0000-0000-0000-000000000005')$$,
  'P0002', '🛑 C9 但沒有課程功能的人連試看片都不行');


\echo ''
\echo '════════ D. Bunny 簽章 ════════'

SELECT t_as('22222222-2222-2222-2222-222222222222');

UPDATE learn_course_config SET bunny_library_id = NULL;
SELECT t_raises(
  $$SELECT learn_course_playback('11110000-0000-0000-0000-000000000001')$$,
  '22023', 'D1 沒設定 Library ID → 報錯');

UPDATE learn_course_config SET bunny_library_id = '12345', bunny_token_required = true;
SELECT t_raises(
  $$SELECT learn_course_playback('11110000-0000-0000-0000-000000000001')$$,
  '22023', '🛑 D2 有 Library、沒金鑰、required=true → 報錯，【不】偷偷發沒簽章的網址');

UPDATE learn_course_config SET bunny_token_required = false;
SELECT t_assert(
  learn_course_playback('11110000-0000-0000-0000-000000000001') ->> 'embed_url'
    = 'https://iframe.mediadelivery.net/embed/12345/bunny-secret-guid-1',
  'D3 required=false 時才會發沒簽章的網址（明確關掉才會發生）');

-- 造一個假的 Vault
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.decrypted_secrets (name TEXT PRIMARY KEY, decrypted_secret TEXT);
INSERT INTO vault.decrypted_secrets VALUES ('BUNNY_TOKEN_AUTH_KEY', 'test-key-abc')
  ON CONFLICT (name) DO UPDATE SET decrypted_secret = EXCLUDED.decrypted_secret;

UPDATE learn_course_config SET bunny_token_required = true, bunny_token_ttl_seconds = 3600;

-- 🛑 逐字比對 token：sha256_hex(key || videoId || expires)。
--    自己算一次跟函式算的比，而不是只檢查「有 token 這個參數」。
DO $$
DECLARE
  v_url TEXT;
  v_exp TEXT;
  v_tok TEXT;
  v_want TEXT;
BEGIN
  v_url := public.learn_course_playback('11110000-0000-0000-0000-000000000001') ->> 'embed_url';
  v_tok := (regexp_match(v_url, 'token=([0-9a-f]{64})'))[1];
  v_exp := (regexp_match(v_url, 'expires=([0-9]+)'))[1];
  v_want := encode(sha256(('test-key-abc' || 'bunny-secret-guid-1' || v_exp)::bytea), 'hex');
  PERFORM t_assert(v_tok = v_want,
    '🛑 D4 token 逐字等於 sha256_hex(key ‖ videoId ‖ expires)');
  PERFORM t_assert(v_exp::bigint BETWEEN extract(epoch FROM now())::bigint + 3500
                                     AND extract(epoch FROM now())::bigint + 3700,
    'D5 expires 跟著 ttl 走（3600 秒）');
  PERFORM t_assert(v_url LIKE 'https://iframe.mediadelivery.net/embed/12345/%',
    'D6 網址帶的是設定的 Library ID');
END $$;

SELECT t_assert(
  (learn_course_playback('11110000-0000-0000-0000-000000000001') ->> 'expires_at') IS NOT NULL,
  'D7 Bunny 會回 expires_at，前端才知道什麼時候要重新要一次');
SELECT t_as('22222222-2222-2222-2222-222222222222');
INSERT INTO learn_course_access (course_id, student_id, granted_by) VALUES
  ('cccccccc-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111') ON CONFLICT DO NOTHING;
SELECT t_assert(
  (learn_course_playback('11110000-0000-0000-0000-000000000005') ->> 'expires_at') IS NULL,
  'D8 YouTube 沒有 expires_at（它不簽章）');


\echo ''
\echo '════════ E. 進度 ════════'

SELECT t_as('22222222-2222-2222-2222-222222222222');
DELETE FROM learn_lesson_progress WHERE student_id = '22222222-2222-2222-2222-222222222222';

SELECT learn_lesson_progress_set('11110000-0000-0000-0000-000000000002', 300, false);
SELECT t_assert(
  (SELECT last_position_seconds = 300 AND completed_at IS NULL
     FROM learn_lesson_progress
    WHERE student_id = '22222222-2222-2222-2222-222222222222'
      AND lesson_id = '11110000-0000-0000-0000-000000000002'),
  'E1 只回報位置，不會被當成看完');

SELECT learn_lesson_progress_set('11110000-0000-0000-0000-000000000002', 600, true);
SELECT t_assert(
  (SELECT completed_at IS NOT NULL FROM learn_lesson_progress
    WHERE student_id = '22222222-2222-2222-2222-222222222222'
      AND lesson_id = '11110000-0000-0000-0000-000000000002'),
  'E2 標記完成');

SELECT learn_lesson_progress_set('11110000-0000-0000-0000-000000000002', 10, false);
SELECT t_assert(
  (SELECT completed_at IS NOT NULL FROM learn_lesson_progress
    WHERE student_id = '22222222-2222-2222-2222-222222222222'
      AND lesson_id = '11110000-0000-0000-0000-000000000002'),
  '🛑 E3 完成之後再回報 completed=false【不會】把它清掉');

SELECT learn_lesson_progress_set('11110000-0000-0000-0000-000000000002', 999999, false);
SELECT t_assert(
  (SELECT last_position_seconds = 600 FROM learn_lesson_progress
    WHERE student_id = '22222222-2222-2222-2222-222222222222'
      AND lesson_id = '11110000-0000-0000-0000-000000000002'),
  'E4 位置被夾在影片長度以內');

SELECT learn_lesson_progress_set('11110000-0000-0000-0000-000000000002', -5, false);
SELECT t_assert(
  (SELECT last_position_seconds = 0 FROM learn_lesson_progress
    WHERE student_id = '22222222-2222-2222-2222-222222222222'
      AND lesson_id = '11110000-0000-0000-0000-000000000002'),
  'E5 負數也被夾住（不會違反 CHECK 而爆掉）');

SELECT t_as('33333333-3333-3333-3333-333333333333');
SELECT t_raises(
  $$SELECT learn_lesson_progress_set('11110000-0000-0000-0000-000000000001', 10, true)$$,
  'P0002', '🛑 E6 看不到那門課的人，連回報進度都不行');


\echo ''
\echo '════════ F. 授權設定沒有被改壞 ════════'

SELECT t_assert(
  (SELECT count(*) = 0 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('learn_courses','learn_course_sections','learn_course_lessons',
                        'learn_course_access','learn_lesson_progress','learn_course_config')
      AND roles::text LIKE '%authenticated%'),
  '🛑 F1 六張表對 authenticated 一條 policy 都沒有');

SELECT t_assert(
  (SELECT count(*) = 0 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN ('learn_bunny_token_key','learn_bunny_embed_url')
      AND grantee IN ('authenticated','anon','PUBLIC')),
  '🛑 F2 金鑰相關的兩支函式沒有授權給外部角色');

SELECT t_assert(
  (SELECT count(*) = 7 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=""']
      AND p.proname IN ('learn_course_visible','learn_course_list','learn_course_detail',
                        'learn_lesson_progress_set','learn_bunny_token_key',
                        'learn_bunny_embed_url','learn_course_playback')),
  'F3 七支函式都是 SECURITY DEFINER 且鎖了 search_path');

\echo ''
\echo '全部通過'
