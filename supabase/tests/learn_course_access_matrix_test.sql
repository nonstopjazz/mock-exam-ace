-- =====================================================
-- 課程開放矩陣：資料層測試
--
-- ⚠️ psql 專用。只在本機臨時資料庫跑（見 run-learn-courses.sh）。
--
-- 🛑 這份測試最重要的三條
--
--   1. direct 與 inherited 必須分開。合成一個「看得到嗎」的布林，
--      畫面就無法解釋「為什麼這個勾勾不掉」，老師會以為壞了。
--
--   2. 開放一門課要【一併】處理功能閘。少了它，老師會遇到
--      「我明明勾了課，學生還是看不到」——那是最難自己想通的狀況。
--
--   3. 收回【不可以】連帶收回功能授權。他可能還有別的課。
-- =====================================================

\set ON_ERROR_STOP on
\set QUIET on

-- t_assert / t_as 由同一個 runner 先前載入的測試建立。這裡重新定義一次，
-- 讓這支檔案也可以單獨執行。
CREATE OR REPLACE FUNCTION t_assert(cond BOOLEAN, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION t_as(p_uid UUID, p_admin BOOLEAN DEFAULT false) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.uid', coalesce(p_uid::text, ''), false);
  PERFORM set_config('request.jwt.claims', '', false);
  PERFORM set_config('app.is_admin', p_admin::text, false);
END $$;

-- ── 佈景 ──────────────────────────────────────────────
\echo ''
\echo '════════ 矩陣：佈景 ════════'

DELETE FROM learn_course_access;
DELETE FROM learn_feature_access;
DELETE FROM learn_class_members;
DELETE FROM learn_classes;
DELETE FROM learn_courses;

\set adm '''11111111-1111-1111-1111-111111111111'''
\set amy '''aa000000-0000-0000-0000-00000000000a'''
\set bob '''aa000000-0000-0000-0000-00000000000b'''
\set cara '''aa000000-0000-0000-0000-00000000000c'''
\set dan '''aa000000-0000-0000-0000-00000000000d'''
\set cls '''cc000000-0000-0000-0000-0000000000c1'''
\set paid '''ee000000-0000-0000-0000-0000000000e1'''
\set freeC '''ee000000-0000-0000-0000-0000000000e2'''
\set draft '''ee000000-0000-0000-0000-0000000000e3'''
\set arch '''ee000000-0000-0000-0000-0000000000e4'''

INSERT INTO auth.users (id, email) VALUES
  (:adm,'admin@t'), (:amy,'amy@t'), (:bob,'bob@t'), (:cara,'cara@t'), (:dan,'dan@t')
ON CONFLICT (id) DO NOTHING;

INSERT INTO learn_classes (id, name, status, created_by)
VALUES (:cls, 'A 班', 'ACTIVE', :adm);

-- Amy / Bob 在籍；Cara 已退出；Dan 不在任何班級（插班／試用的角色）
INSERT INTO learn_class_members (class_id, student_id, left_at, created_by) VALUES
  (:cls, :amy,  NULL,                      :adm),
  (:cls, :bob,  NULL,                      :adm),
  (:cls, :cara, now() - interval '1 day',  :adm);

INSERT INTO learn_courses (id, slug, title, type, access, status, sort_order, created_by) VALUES
  (:paid,  'paid-course',  '需選課的課', 'STANDARD', 'ENROLLED',  'PUBLISHED', 1, :adm),
  (:freeC, 'free-course',  '免費課',     'STANDARD', 'FREE',      'PUBLISHED', 2, :adm),
  (:draft, 'draft-course', '草稿課',     'STANDARD', 'ENROLLED',  'DRAFT',     3, :adm),
  (:arch,  'arch-course',  '已封存課',   'STANDARD', 'ENROLLED',  'ARCHIVED',  4, :adm);

SELECT t_as(:adm, true);

\echo ''
\echo '════════ A. 課程清單 ════════'

SELECT t_assert(
  jsonb_array_length(learn_admin_course_access_matrix() -> 'courses') = 3,
  '🛑 A1 列出 3 門課（草稿照列、ARCHIVED 不列）');
SELECT t_assert(
  EXISTS (SELECT 1 FROM jsonb_array_elements(
            learn_admin_course_access_matrix() -> 'courses') c
           WHERE c ->> 'title' = '草稿課' AND c ->> 'status' = 'DRAFT'),
  '🛑 A2 草稿課在清單裡而且帶 status —— production 目前【全部】是草稿，'
  '只列已發布的話這一頁會是空的，看起來像壞掉');
SELECT t_assert(
  NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
                learn_admin_course_access_matrix() -> 'courses') c
               WHERE c ->> 'title' = '已封存課'),
  'A3 ARCHIVED 的課不列');

\echo ''
\echo '════════ B. 納入哪些學生 ════════'

SELECT t_assert(
  (learn_admin_course_access_matrix() ->> 'student_total')::int = 2,
  'B1 一開始只有在籍的 Amy 與 Bob（Cara 已退出、Dan 沒班級也沒授權）');

-- Dan 拿到個別選課之後就要入列 —— 插班／試用的人不在任何班級裡，不能漏掉
SELECT learn_admin_course_grant_student(:paid, :dan, true);
SELECT t_assert(
  (learn_admin_course_access_matrix() ->> 'student_total')::int = 3,
  '🛑 B2 Dan 有個別選課之後入列（他不在任何班級，但不能漏掉他）');
SELECT t_assert(
  EXISTS (SELECT 1 FROM jsonb_array_elements(
            learn_admin_course_access_matrix() -> 'students') s
           WHERE s ->> 'name' = 'dan'),
  'B3 而且清單裡真的有他');

\echo ''
\echo '════════ 🛑 C. direct 與 inherited 分開 ════════'
-- 🛑 這一組是整張矩陣的關鍵。合成一個布林的話，畫面就無法解釋
--    「為什麼這個勾勾不掉」——老師會以為是 bug。

-- 班級層開放「需選課的課」給 A 班
SELECT learn_admin_course_access_set(:paid, p_class_id => :cls, p_granted => true);

SELECT t_assert(
  (SELECT (s -> 'courses' -> (:paid) ->> 'direct')::boolean = false
     FROM jsonb_array_elements(learn_admin_course_access_matrix() -> 'students') s
    WHERE s ->> 'name' = 'amy'),
  '🛑 C1 Amy 經由班級拿到 → direct 仍然是 false（勾選框不該被打勾）');
SELECT t_assert(
  (SELECT s -> 'courses' -> (:paid) ->> 'via_class' = 'A 班'
     FROM jsonb_array_elements(learn_admin_course_access_matrix() -> 'students') s
    WHERE s ->> 'name' = 'amy'),
  '🛑 C2 而是回傳 via_class = ''A 班'' —— 畫面才講得出「繼承自哪一班」，'
  '只說「繼承」的話老師得自己猜是哪一班');
SELECT t_assert(
  (SELECT (s -> 'courses' -> (:paid) ->> 'direct')::boolean = true
     FROM jsonb_array_elements(learn_admin_course_access_matrix() -> 'students') s
    WHERE s ->> 'name' = 'dan'),
  'C3 Dan 是個別開放 → direct = true');
SELECT t_assert(
  (SELECT s -> 'courses' -> (:paid) -> 'via_class' = 'null'::jsonb
     FROM jsonb_array_elements(learn_admin_course_access_matrix() -> 'students') s
    WHERE s ->> 'name' = 'dan'),
  'C4 Dan 沒有班級來源 → via_class 是 null');

SELECT t_assert(
  (SELECT (s -> 'courses' -> (:freeC) ->> 'free')::boolean = true
     AND (s -> 'courses' -> (:freeC) ->> 'direct')::boolean = false
     FROM jsonb_array_elements(learn_admin_course_access_matrix() -> 'students') s
    WHERE s ->> 'name' = 'bob'),
  '🛑 C5 免費課：free = true 但 direct = false —— 兩者是不同的事，'
  '合成一個布林就分不出「不必選課」與「已經選課」');

\echo ''
\echo '════════ 🛑 D. 開放課程要一併處理功能閘 ════════'

DELETE FROM learn_feature_access;
DELETE FROM learn_course_access;

SELECT t_assert(
  NOT (SELECT (s ->> 'has_feature')::boolean
         FROM jsonb_array_elements(learn_admin_course_access_matrix() -> 'students') s
        WHERE s ->> 'name' = 'bob'),
  'D1 對照組：Bob 一開始沒有「影片課程」功能');

SELECT t_assert(
  (learn_admin_course_grant_student(:paid, :bob, true) ->> 'feature_added')::boolean = true,
  '🛑 D2 開放課程時順便授予功能，並回報 feature_added = true —— '
  '畫面要講得出「順便也開放了影片課程功能」');
SELECT t_assert(
  (SELECT (s ->> 'has_feature')::boolean
     FROM jsonb_array_elements(learn_admin_course_access_matrix() -> 'students') s
    WHERE s ->> 'name' = 'bob'),
  'D3 之後 Bob 有功能了');
SELECT t_assert(
  learn_course_visible(:paid),
  'D4 🛑 端對端：切換成 Bob 之後他【真的】看得到那門課')
  FROM (SELECT t_as(:bob, false)) _;
SELECT t_as(:adm, true);

-- 再開放第二門課時不該重複加功能
SELECT t_assert(
  (learn_admin_course_grant_student(:draft, :bob, true) ->> 'feature_added')::boolean = false,
  'D5 第二門課不重複加功能（已經有了）');
SELECT t_assert(
  (SELECT count(*) FROM learn_feature_access
    WHERE feature = 'course' AND student_id = :bob) = 1,
  'D6 功能授權只有一列（冪等）');

-- p_with_feature => false 時不要偷偷加
SELECT t_assert(
  (learn_admin_course_grant_student(:paid, :cara, true, p_with_feature => false)
     ->> 'feature_added')::boolean = false
  AND NOT EXISTS (SELECT 1 FROM learn_feature_access
                   WHERE feature = 'course' AND student_id = :cara),
  'D7 p_with_feature => false 時不碰功能授權');

\echo ''
\echo '════════ 🛑 E. 收回不可以連帶收回功能 ════════'

SELECT t_assert(
  (learn_admin_course_grant_student(:paid, :bob, false) ->> 'granted')::boolean = false,
  'E1 收回「需選課的課」');
SELECT t_assert(
  NOT EXISTS (SELECT 1 FROM learn_course_access
               WHERE course_id = :paid AND student_id = :bob),
  'E2 選課列真的被刪了');
SELECT t_assert(
  EXISTS (SELECT 1 FROM learn_feature_access
           WHERE feature = 'course' AND student_id = :bob),
  '🛑 E3 但功能授權還在 —— Bob 還有「草稿課」，'
  '把功能一起收掉會連帶弄掉那門課的可見性');
SELECT t_assert(
  (SELECT (s -> 'courses' -> (:draft) ->> 'direct')::boolean = true
     FROM jsonb_array_elements(learn_admin_course_access_matrix() -> 'students') s
    WHERE s ->> 'name' = 'bob'),
  'E4 而「草稿課」的 direct 不受影響');

\echo ''
\echo '════════ F. 冪等與壞資料 ════════'

SELECT learn_admin_course_grant_student(:draft, :bob, true);
SELECT learn_admin_course_grant_student(:draft, :bob, true);
SELECT t_assert(
  (SELECT count(*) FROM learn_course_access
    WHERE course_id = :draft AND student_id = :bob) = 1,
  'F1 連按兩次只有一列（ON CONFLICT DO NOTHING）');
SELECT t_assert(
  (SELECT count(*) FROM learn_course_access
    WHERE course_id = :draft AND student_id = :bob) = 1,
  'F2 收回不存在的授權不會爆掉')
  FROM (SELECT learn_admin_course_grant_student(:freeC, :bob, false)) _;

DO $$ BEGIN
  BEGIN
    PERFORM public.learn_admin_course_grant_student(
      'ee000000-0000-0000-0000-0000000000ff'::uuid,
      'aa000000-0000-0000-0000-00000000000b'::uuid, true);
    RAISE EXCEPTION 'FAIL  F3 不存在的課程應該要被擋下';
  EXCEPTION WHEN sqlstate 'P0002' THEN
    RAISE NOTICE 'PASS  F3 不存在的課程 → P0002';
  END;
  BEGIN
    PERFORM public.learn_admin_course_grant_student(
      'ee000000-0000-0000-0000-0000000000e1'::uuid,
      'aa000000-0000-0000-0000-0000000000ff'::uuid, true);
    RAISE EXCEPTION 'FAIL  F4 不存在的學生應該要被擋下';
  EXCEPTION WHEN sqlstate 'P0002' THEN
    RAISE NOTICE 'PASS  F4 不存在的學生 → P0002（不建立指向空氣的授權）';
  END;
END $$;

\echo ''
\echo '════════ G. 姓名搜尋與上限 ════════'

SELECT t_assert(
  (learn_admin_course_access_matrix(p_query => 'amy') ->> 'student_total')::int = 1,
  'G1 姓名搜尋 amy → 1 位');
SELECT t_assert(
  (learn_admin_course_access_matrix(p_query => 'AMY') ->> 'student_total')::int = 1,
  'G2 不分大小寫');
SELECT t_assert(
  (learn_admin_course_access_matrix(p_query => '%') ->> 'student_total')::int = 0,
  '🛑 G3 輸入 % 不會比對到全部（沒跳脫的話會回全部）');
SELECT t_assert(
  (learn_admin_course_access_matrix(p_query => 'a_y') ->> 'student_total')::int = 0,
  '🛑 G4 輸入 a_y 不會當成萬用字元（沒跳脫會比對到 amy）');
SELECT t_assert(
  (learn_admin_course_access_matrix(p_query => '   ') ->> 'student_total')::int > 1,
  'G5 只有空白＝沒有搜尋條件，不是「找不到人」');
SELECT t_assert(
  (learn_admin_course_access_matrix(p_limit => 1) ->> 'truncated')::boolean = true
  AND jsonb_array_length(
        learn_admin_course_access_matrix(p_limit => 1) -> 'students') = 1,
  '🛑 G6 上限會截斷【而且回報 truncated】——'
  '不講的話老師會以為某個學生不存在');
SELECT t_assert(
  (learn_admin_course_access_matrix(p_class_id => :cls) ->> 'student_total')::int = 2,
  'G7 班級篩選只留在籍的 Amy 與 Bob');

-- 🛑 班級下拉選單的來源必須【不受】姓名搜尋與上限影響。
--    從 students[].classes 反推的話，篩完剛好沒人的班級會從選單裡消失 ——
--    而那正是你想切過去看的班。
SELECT t_assert(
  jsonb_array_length(learn_admin_course_access_matrix() -> 'classes') = 1
  AND jsonb_array_length(
        learn_admin_course_access_matrix(p_query => 'zzz') -> 'classes') = 1,
  '🛑 G8 班級清單不受姓名搜尋影響（搜不到人時選單仍然在）');
SELECT t_assert(
  (SELECT (c ->> 'member_count')::int
     FROM jsonb_array_elements(learn_admin_course_access_matrix() -> 'classes') c
    WHERE c ->> 'name' = 'A 班') = 2,
  'G9 班級的 member_count 只算在籍（Cara 已退出不算）');

\echo ''
\echo '════════ H. 授權 ════════'

SELECT t_as(:bob, false);
DO $$ BEGIN
  BEGIN
    PERFORM public.learn_admin_course_access_matrix();
    RAISE EXCEPTION 'FAIL  H1 非管理員應該被擋下';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'PASS  H1 非管理員讀矩陣 → 42501';
  END;
  BEGIN
    PERFORM public.learn_admin_course_grant_student(
      'ee000000-0000-0000-0000-0000000000e1'::uuid,
      'aa000000-0000-0000-0000-00000000000a'::uuid, true);
    RAISE EXCEPTION 'FAIL  H2 非管理員不該開放得了課程';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'PASS  H2 非管理員開放課程 → 42501';
  END;
END $$;
SELECT t_as(:adm, true);

SELECT t_assert(
  NOT has_function_privilege('anon', 'learn_admin_course_access_matrix(text,uuid,integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
        'learn_admin_course_grant_student(uuid,uuid,boolean,boolean,text)', 'EXECUTE'),
  'H3 anon 兩支都叫不動');

\echo ''
\echo '矩陣測試全部通過。'
