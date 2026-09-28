-- =====================================================
-- 影片課程管理端的資料層測試
--
-- ⚠️ psql 專用，只在本機臨時資料庫跑。
-- 執行方式：bash supabase/tests/run-learn-courses.sh（它會連這支一起跑）
--
-- 🛑 這份最重要的一條：刪掉一支【已經有人看完】的影片會報錯，
--    不是靜靜地連同學生的完成紀錄一起刪。
--    learn_lesson_progress 是 ON DELETE CASCADE——管理員在編輯畫面上
--    按一下「移除」，看起來只是拿掉一列，實際上是把幾十個人的進度清掉，
--    而且循序課的下一個單元會在他們眼前重新鎖上。
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

-- 🛑 learn_course_access_test.sql 會造一個假的 vault。它跑在這支之前，
--    不清掉的話 G2（沒有 Vault 時如實回報）會被前一支的殘留弄假。
--    測試之間不可以互相依賴執行順序。
DROP TABLE IF EXISTS vault.decrypted_secrets;
UPDATE learn_course_config
   SET bunny_library_id = NULL, bunny_token_required = true, bunny_token_ttl_seconds = 14400;

DELETE FROM learn_course_access;
DELETE FROM learn_lesson_progress;
DELETE FROM learn_course_lessons;
DELETE FROM learn_course_sections;
DELETE FROM learn_courses;

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@t'),
  ('22222222-2222-2222-2222-222222222222', 'stu@t')
ON CONFLICT (id) DO NOTHING;

SELECT t_as('11111111-1111-1111-1111-111111111111', true);

\echo ''
\echo '════════ A. 建課與驗證 ════════'

SELECT t_raises(
  $$SELECT learn_admin_course_save('{"slug":"Bad Slug","title":"x"}'::jsonb)$$,
  '22023', 'A1 代號有空白與大寫 → 擋下來');
SELECT t_raises(
  $$SELECT learn_admin_course_save('{"slug":"ok-slug","title":"   "}'::jsonb)$$,
  '22023', 'A2 課名空白 → 擋下來');

SELECT t_assert(
  (learn_admin_course_save(
     '{"slug":"c1","title":"第一門","type":"DRIP","access":"FREE"}'::jsonb) ->> 'slug') = 'c1',
  'A3 建得起來');
SELECT t_assert(
  (SELECT status = 'DRAFT' FROM learn_courses WHERE slug = 'c1'),
  '🛑 A4 沒指定 status 時預設是 DRAFT，不是直接對學生發布');

SELECT t_raises(
  format($$SELECT learn_admin_course_save('{"slug":"c1","title":"撞名"}'::jsonb)$$),
  '23505', 'A5 代號撞到別門課 → 講人話的錯誤');

SELECT t_assert(
  learn_admin_course_save(
     jsonb_build_object('id', (SELECT id FROM learn_courses WHERE slug='c1'),
                        'slug','c1','title','改過的名字')) ->> 'title' = '改過的名字',
  'A6 帶 id 就是修改，不是新建');
SELECT t_assert((SELECT count(*) = 1 FROM learn_courses), 'A7 修改沒有變成第二門課');

\echo ''
\echo '════════ B. 大綱：新增、重排、搬家 ════════'

SELECT learn_admin_course_outline_save(
  (SELECT id FROM learn_courses WHERE slug='c1'),
  '[{"title":"單元 1","lessons":[
       {"title":"A","provider":"YOUTUBE","video_id":"aaaaaaaaaaa","duration_seconds":600},
       {"title":"B","provider":"YOUTUBE","video_id":"bbbbbbbbbbb","duration_seconds":600}]},
    {"title":"單元 2","lessons":[
       {"title":"C","provider":"BUNNY","video_id":"guid-c","duration_seconds":300}]}]'::jsonb);

SELECT t_assert((SELECT count(*) = 2 FROM learn_course_sections), 'B1 兩個章節');
SELECT t_assert((SELECT count(*) = 3 FROM learn_course_lessons), 'B2 三支影片');
SELECT t_assert(
  (SELECT l.position = 2 FROM learn_course_lessons l WHERE l.title = 'B'),
  'B3 position 依陣列順序給');

SELECT t_raises(
  format($$SELECT learn_admin_course_outline_save('%s',
    '[{"title":"x","lessons":[{"title":"沒填編號","provider":"YOUTUBE","video_id":""}]}]'::jsonb)$$,
    (SELECT id FROM learn_courses WHERE slug='c1')),
  '22023', 'B4 影片編號空白 → 擋下來，而且訊息講得出是哪一支');

SELECT t_raises(
  format($$SELECT learn_admin_course_outline_save('%s',
    '[{"title":"x","lessons":[{"title":"來源錯","provider":"VIMEO","video_id":"z"}]}]'::jsonb)$$,
    (SELECT id FROM learn_courses WHERE slug='c1')),
  '22023', 'B5 不認識的影片來源 → 擋下來');

-- 🛑 重排：把單元 2 移到最前面。UNIQUE (course_id, position) 會在寫到一半撞號。
SELECT learn_admin_course_outline_save(
  (SELECT id FROM learn_courses WHERE slug='c1'),
  (SELECT jsonb_build_array(
     jsonb_build_object('id', s2.id, 'title', '單元 2', 'lessons', jsonb_build_array(
       jsonb_build_object('id', (SELECT id FROM learn_course_lessons WHERE title='C'),
                          'title','C','provider','BUNNY','video_id','guid-c','duration_seconds',300))),
     jsonb_build_object('id', s1.id, 'title', '單元 1', 'lessons', jsonb_build_array(
       jsonb_build_object('id', (SELECT id FROM learn_course_lessons WHERE title='A'),
                          'title','A','provider','YOUTUBE','video_id','aaaaaaaaaaa','duration_seconds',600),
       jsonb_build_object('id', (SELECT id FROM learn_course_lessons WHERE title='B'),
                          'title','B','provider','YOUTUBE','video_id','bbbbbbbbbbb','duration_seconds',600))))
     FROM (SELECT id FROM learn_course_sections WHERE title='單元 1') s1,
          (SELECT id FROM learn_course_sections WHERE title='單元 2') s2));

SELECT t_assert(
  (SELECT position = 1 FROM learn_course_sections WHERE title = '單元 2'),
  '🛑 B6 章節對調成功——position 先推高再重排，不會在寫到一半撞 UNIQUE');
SELECT t_assert(
  (SELECT position = 2 FROM learn_course_sections WHERE title = '單元 1'), 'B7 另一邊也對');
SELECT t_assert((SELECT count(*) = 3 FROM learn_course_lessons), 'B8 重排沒有弄丟影片');

-- 把 C 搬到單元 1
SELECT learn_admin_course_outline_save(
  (SELECT id FROM learn_courses WHERE slug='c1'),
  (SELECT jsonb_build_array(
     jsonb_build_object('id', s1.id, 'title', '單元 1', 'lessons', jsonb_build_array(
       jsonb_build_object('id', (SELECT id FROM learn_course_lessons WHERE title='A'),
                          'title','A','provider','YOUTUBE','video_id','aaaaaaaaaaa','duration_seconds',600),
       jsonb_build_object('id', (SELECT id FROM learn_course_lessons WHERE title='B'),
                          'title','B','provider','YOUTUBE','video_id','bbbbbbbbbbb','duration_seconds',600),
       jsonb_build_object('id', (SELECT id FROM learn_course_lessons WHERE title='C'),
                          'title','C','provider','BUNNY','video_id','guid-c','duration_seconds',300))),
     jsonb_build_object('id', s2.id, 'title', '單元 2', 'lessons', '[]'::jsonb))
     FROM (SELECT id FROM learn_course_sections WHERE title='單元 1') s1,
          (SELECT id FROM learn_course_sections WHERE title='單元 2') s2));

SELECT t_assert(
  (SELECT s.title = '單元 1' FROM learn_course_lessons l
     JOIN learn_course_sections s ON s.id = l.section_id WHERE l.title = 'C'),
  'B9 影片可以搬到別的章節');

\echo ''
\echo '════════ C. 🛑 刪影片不可以吃掉學生進度 ════════'

-- 學生看完 A
INSERT INTO learn_lesson_progress (student_id, lesson_id, completed_at)
VALUES ('22222222-2222-2222-2222-222222222222',
        (SELECT id FROM learn_course_lessons WHERE title='A'), now());

SELECT t_raises(
  format($$SELECT learn_admin_course_outline_save('%s',
    (SELECT jsonb_build_array(jsonb_build_object('id', s.id, 'title','單元 1','lessons','[]'::jsonb))
       FROM learn_course_sections s WHERE s.title='單元 1'))$$,
    (SELECT id FROM learn_courses WHERE slug='c1')),
  '23503', '🛑 C1 要刪一支已經有人看完的影片 → 報錯');

SELECT t_assert((SELECT count(*) = 3 FROM learn_course_lessons),
  '🛑 C2 報錯之後【一支都沒被刪掉】——檢查在任何刪除之前就做完了');
SELECT t_assert(
  (SELECT count(*) = 1 FROM learn_lesson_progress),
  '🛑 C3 學生的完成紀錄也還在');

-- 沒人看過的 B 可以刪
SELECT learn_admin_course_outline_save(
  (SELECT id FROM learn_courses WHERE slug='c1'),
  (SELECT jsonb_build_array(jsonb_build_object('id', s.id, 'title','單元 1','lessons',
     jsonb_build_array(
       jsonb_build_object('id', (SELECT id FROM learn_course_lessons WHERE title='A'),
                          'title','A','provider','YOUTUBE','video_id','aaaaaaaaaaa','duration_seconds',600),
       jsonb_build_object('id', (SELECT id FROM learn_course_lessons WHERE title='C'),
                          'title','C','provider','BUNNY','video_id','guid-c','duration_seconds',300))))
     FROM learn_course_sections s WHERE s.title='單元 1'));

SELECT t_assert((SELECT count(*) = 0 FROM learn_course_lessons WHERE title='B'),
  'C4 沒人看過的影片刪得掉');
SELECT t_assert((SELECT count(*) = 1 FROM learn_lesson_progress), 'C5 A 的紀錄沒被波及');
SELECT t_assert((SELECT count(*) = 1 FROM learn_course_sections),
  'C6 空的單元 2 沒送來就被刪掉了');

\echo ''
\echo '════════ D. 管理端看得到 video_id，學生端看不到 ════════'

SELECT t_assert(
  learn_admin_course_get((SELECT id FROM learn_courses WHERE slug='c1'))::text LIKE '%guid-c%',
  'D1 管理端【看得到】video_id（要編輯它）');

SELECT t_assert(
  learn_course_detail((SELECT id FROM learn_courses WHERE slug='c1'))::text NOT LIKE '%guid-c%',
  '🛑 D2 學生端那支仍然看不到——兩支不要混用');

SELECT t_assert(
  (learn_admin_course_get((SELECT id FROM learn_courses WHERE slug='c1'))
    -> 'sections' -> 0 -> 'lessons' -> 0 ->> 'completed_by')::int = 1,
  'D3 管理端看得到每支影片幾個人看完了（刪之前看得到代價）');

\echo ''
\echo '════════ E. 權限：非管理員一律擋下 ════════'

SELECT t_as('22222222-2222-2222-2222-222222222222', false);

SELECT t_raises($$SELECT learn_admin_course_save('{"slug":"hack","title":"x"}'::jsonb)$$,
  '42501', 'E1 學生不能建課');
SELECT t_raises(
  format($$SELECT learn_admin_course_get('%s')$$, (SELECT id FROM learn_courses WHERE slug='c1')),
  '42501', '🛑 E2 學生不能用管理端那支讀 video_id');
SELECT t_raises(
  format($$SELECT learn_admin_course_outline_save('%s','[]'::jsonb)$$,
    (SELECT id FROM learn_courses WHERE slug='c1')),
  '42501', '🛑 E3 學生不能改大綱（不然可以把整門課清空）');
SELECT t_raises(
  format($$SELECT learn_admin_course_access_set('%s', NULL, '22222222-2222-2222-2222-222222222222', true)$$,
    (SELECT id FROM learn_courses WHERE slug='c1')),
  '42501', '🛑 E4 學生不能給自己選課');
SELECT t_raises($$SELECT learn_admin_course_config()$$, '42501', 'E5 學生看不到 Bunny 設定');

\echo ''
\echo '════════ F. 選課授權 ════════'

SELECT t_as('11111111-1111-1111-1111-111111111111', true);

SELECT t_assert(
  (learn_admin_course_access_set(
     (SELECT id FROM learn_courses WHERE slug='c1'),
     NULL, '22222222-2222-2222-2222-222222222222', true) ->> 'reach')::int = 1,
  'F1 個別授權，reach = 1');

SELECT t_assert(
  (learn_admin_course_access_set(
     (SELECT id FROM learn_courses WHERE slug='c1'),
     NULL, '22222222-2222-2222-2222-222222222222', true) ->> 'reach')::int = 1,
  '🛑 F2 重複授權是冪等的——管理員連按兩下不該變成錯誤或第二列');

SELECT t_assert(
  (learn_admin_course_access_set(
     (SELECT id FROM learn_courses WHERE slug='c1'),
     NULL, '22222222-2222-2222-2222-222222222222', false) ->> 'reach')::int = 0,
  'F3 收得回來');
SELECT t_assert((SELECT count(*) = 1 FROM learn_lesson_progress),
  '🛑 F4 收回授權【不會】刪掉學生已有的觀看進度');

SELECT t_raises(
  format($$SELECT learn_admin_course_access_set('%s', NULL, NULL, true)$$,
    (SELECT id FROM learn_courses WHERE slug='c1')),
  '22023', 'F5 沒指定對象 → 擋下來');

\echo ''
\echo '════════ G. Bunny 設定 ════════'

SELECT t_assert(
  (learn_admin_course_config() ->> 'bunny_lesson_count')::int = 1,
  'G1 算得出有幾支 Bunny 影片在等設定');

SELECT t_assert(
  (learn_admin_course_config() ->> 'vault_key_present')::boolean = false,
  'G2 沒有 Vault 時如實回報');

SELECT t_assert(
  learn_admin_course_config()::text NOT LIKE '%decrypted%'
  AND (learn_admin_course_config() -> 'bunny_token_auth_key') IS NULL,
  '🛑 G3 設定的回傳裡【沒有】金鑰本身，只有一個布林');

SELECT t_assert(
  (learn_admin_course_config_set('99999', 7200, NULL) ->> 'bunny_library_id') = '99999',
  'G4 改得動 Library ID');
SELECT t_assert(
  (learn_admin_course_config() ->> 'bunny_token_ttl_seconds')::int = 7200, 'G5 TTL 也改得動');

SELECT t_raises($$SELECT learn_admin_course_config_set(NULL, 10, NULL)$$,
  '22023', 'G6 TTL 太短 → 擋下來');
SELECT t_raises($$SELECT learn_admin_course_config_set(NULL, 999999, NULL)$$,
  '22023', 'G7 TTL 太長 → 擋下來');

SELECT t_assert(
  (learn_admin_course_config_set(NULL, NULL, NULL) ->> 'bunny_library_id') = '99999',
  '🛑 G8 全部傳 NULL 不會把設定清空（NULL 是「不改」，不是「設成空」）');

\echo ''
\echo '全部通過'
