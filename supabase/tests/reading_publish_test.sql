-- =====================================================
-- 閱讀：開放控制 + 上架
--
-- 本機臨時資料庫專用。依序建庫 → 套 migration → 跑這支。
--
-- 🛑 這裡最重要的兩條：
--    · 沒被開放的學生【連 RPC 都叫不動】，不是只有頁面被藏起來
--    · 上架的完整性由 trigger 擋，set_status 不自己判斷——
--      自己判斷一次就有兩份定義，而畫面與 trigger 遲早會說不同的話
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

-- p_expect：期望的錯誤訊息片段。授權類一律要帶——「擋下了」與
-- 「擋下的是對的理由」是兩件事。
CREATE OR REPLACE FUNCTION t_expect_error(stmt TEXT, label TEXT,
                                          p_expect TEXT DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE EXCEPTION 'FAIL  % （預期要失敗，但成功了）', label;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL %' THEN RAISE; END IF;
  IF p_expect IS NOT NULL AND position(p_expect IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FAIL  % （擋下了，但理由不對：預期含「%」，實際「%」）',
      label, p_expect, left(SQLERRM, 80);
  END IF;
  RAISE NOTICE 'PASS  % （擋下：%）', label, left(SQLERRM, 44);
END $$;

-- 🛑 這份測試要套 create_user_profiles_table.sql（learn_* 需要它），
--    而那支會把 is_admin() 換成【用 email 判定】的正式版。
--    測試的假帳號沒有 email，於是「管理員」永遠不成立。
--    所以這裡把 is_admin() 換回讀 GUC 的版本——測試要自己掌握身分，
--    不該取決於資料庫裡剛好是哪一版 is_admin()。
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce(current_setting('app.is_admin', true), 'false')::boolean;
$$;

\set adm '''aaaaaaaa-0000-0000-0000-0000000000aa'''
\set stu '''11111111-1111-1111-1111-111111111111'''
\set stu2 '''22222222-2222-2222-2222-222222222222'''
INSERT INTO auth.users (id) VALUES (:adm), (:stu), (:stu2);

-- 一篇六題完整、一篇只有三題
INSERT INTO reading_passages (passage_id, title, passage_text, content_source, status)
VALUES ('FULL','Full','Every year the industry produces many things.','WRITER','DRAFT'),
       ('PART','Part','Another passage text that is long enough.','WRITER','DRAFT');

INSERT INTO reading_questions (passage_id, construct, question, option_a, option_b, option_c, option_d, display_order)
SELECT 'FULL', c, 'Q '||c, 'a','b','c','d', ord
  FROM unnest(ARRAY['SM','MI','SD','CO','CD','VC']) WITH ORDINALITY AS t(c, ord);
INSERT INTO reading_questions (passage_id, construct, question, option_a, option_b, option_c, option_d, display_order)
SELECT 'PART', c, 'Q '||c, 'a','b','c','d', ord
  FROM unnest(ARRAY['SM','MI','SD']) WITH ORDINALITY AS t(c, ord);
INSERT INTO reading_question_keys (question_id, correct_answer, explanation)
SELECT id, 'B', '因為 B。' FROM reading_questions;


\echo ''
\echo '════════ P. 開放控制 ════════'

SELECT set_config('app.is_admin', 'false', false) IS NOT NULL;
SELECT set_config('app.uid', :stu, false) IS NOT NULL;

-- 先把 FULL 上架（用管理員身分），否則學生本來就讀不到
SELECT set_config('app.is_admin', 'true', false) IS NOT NULL;
UPDATE reading_passages SET status='PUBLISHED' WHERE passage_id='FULL';
SELECT set_config('app.is_admin', 'false', false) IS NOT NULL;

SELECT t_expect_error($$SELECT reading_get_passage('FULL')$$,
  '🛑 P1 沒被開放的學生【取不到題】（不是只有頁面被藏起來）', '尚未對你開放');
SELECT t_expect_error($$SELECT reading_start_session('FULL')$$,
  '🛑 P1 也開不了練習', '尚未對你開放');

-- 開放給這一位
INSERT INTO learn_feature_access (feature, student_id, granted_by)
VALUES ('reading', :stu, :adm);

SELECT t_assert(jsonb_array_length(reading_get_passage('FULL') -> 'questions') = 6,
  'P2 開放之後取得到題目');
SELECT t_assert((reading_start_session('FULL') ->> 'session_id') IS NOT NULL,
  'P2 也開得了練習');

-- 🛑 開放是逐人的，不是整批
SELECT set_config('app.uid', :stu2, false) IS NOT NULL;
SELECT t_expect_error($$SELECT reading_get_passage('FULL')$$,
  '🛑 P3 沒被開放的【另一位】學生仍然取不到——開放是逐人的', '尚未對你開放');

-- 管理員不受開放清單影響
SELECT set_config('app.is_admin', 'true', false) IS NOT NULL;
SELECT set_config('app.uid', :adm, false) IS NOT NULL;
SELECT t_assert(jsonb_array_length(reading_get_passage('FULL') -> 'questions') = 6,
  'P4 管理員不必被加進開放清單（learn_feature_enabled 對管理員一律 true）');


\echo ''
\echo '════════ Q. 後台清單 ════════'

SELECT set_config('app.is_admin', 'false', false) IS NOT NULL;
SELECT t_expect_error($$SELECT reading_admin_passage_list()$$,
  '🛑 Q1 非管理員叫不動後台清單', '僅限管理員');

SELECT set_config('app.is_admin', 'true', false) IS NOT NULL;
SELECT t_assert(jsonb_array_length(reading_admin_passage_list()) = 2,
  'Q2 兩篇都列出來（含草稿）');
SELECT t_assert(
  (SELECT (e ->> 'ready')::boolean FROM jsonb_array_elements(reading_admin_passage_list()) e
    WHERE e ->> 'passage_id' = 'FULL'),
  'Q3 六題的那篇 ready = true');
SELECT t_assert(
  NOT (SELECT (e ->> 'ready')::boolean FROM jsonb_array_elements(reading_admin_passage_list()) e
        WHERE e ->> 'passage_id' = 'PART'),
  'Q3 三題的那篇 ready = false');
SELECT t_assert(
  (SELECT e -> 'missing' FROM jsonb_array_elements(reading_admin_passage_list()) e
    WHERE e ->> 'passage_id' = 'PART') @> '["CO","CD","VC"]'::jsonb,
  '🛑 Q4 而且講明缺哪幾個 construct——只說「不能上架」等於要管理員自己去猜');
SELECT t_assert(
  (SELECT (e ->> 'question_count')::int FROM jsonb_array_elements(reading_admin_passage_list()) e
    WHERE e ->> 'passage_id' = 'PART') = 3,
  'Q5 題數正確');


\echo ''
\echo '════════ R. 改狀態 ════════'

SELECT set_config('app.is_admin', 'false', false) IS NOT NULL;
SELECT t_expect_error($$SELECT reading_admin_set_status(ARRAY['FULL'], 'PUBLISHED')$$,
  '🛑 R1 非管理員改不了狀態', '僅限管理員');

SELECT set_config('app.is_admin', 'true', false) IS NOT NULL;
SELECT t_expect_error($$SELECT reading_admin_set_status(ARRAY['FULL'], 'HIDDEN')$$,
  'R2 不合法的狀態被擋', '只能是 DRAFT');

UPDATE reading_passages SET status='DRAFT' WHERE passage_id='FULL';

-- 🛑 一篇壞的不影響其他篇
CREATE TEMP TABLE r AS
SELECT reading_admin_set_status(ARRAY['FULL','PART','NOPE'], 'PUBLISHED') AS j;

SELECT t_assert((SELECT (j ->> 'updated')::int FROM r) = 1,
  '🛑 R3 三篇裡只有完整的那一篇上架成功');
SELECT t_assert((SELECT (j ->> 'failed')::int FROM r) = 2, 'R3 另外兩篇失敗');
SELECT t_assert((SELECT status FROM reading_passages WHERE passage_id='FULL') = 'PUBLISHED',
  '🛑 R4 而且【真的上架了】，不是只在回傳裡說成功');
SELECT t_assert((SELECT status FROM reading_passages WHERE passage_id='PART') = 'DRAFT',
  'R4 不完整的那篇維持草稿');
SELECT t_assert(
  (SELECT (e ->> 'reason') FROM jsonb_array_elements((SELECT j -> 'results' FROM r)) e
    WHERE e ->> 'passage_id' = 'PART') LIKE '%缺少%',
  '🛑 R5 失敗原因照實傳回 trigger 講的話（缺哪幾個 construct），沒有被改寫成「上架失敗」');
SELECT t_assert(
  (SELECT (e ->> 'reason') FROM jsonb_array_elements((SELECT j -> 'results' FROM r)) e
    WHERE e ->> 'passage_id' = 'NOPE') = '找不到這篇文章',
  'R5 不存在的 passage_id 講清楚是找不到，不是格式錯');

-- 下架與封存
SELECT t_assert((reading_admin_set_status(ARRAY['FULL'], 'DRAFT') ->> 'updated')::int = 1,
  'R6 下架回草稿');
SELECT t_assert((SELECT status FROM reading_passages WHERE passage_id='FULL') = 'DRAFT',
  'R6 狀態真的變回 DRAFT');
SELECT t_assert((reading_admin_set_status(ARRAY['FULL'], 'ARCHIVED') ->> 'updated')::int = 1,
  'R7 封存不需要六題完整（只有上架要）');

SELECT t_assert((reading_admin_set_status(NULL, 'PUBLISHED') ->> 'updated')::int = 0,
  'R8 空清單不做事，也不報錯');


\echo ''
\echo '════════ S. 函式安全設定 ════════'

SELECT t_assert(
  (SELECT bool_and(p.prosecdef) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'reading_admin_%'),
  'S1 兩支後台函式都是 SECURITY DEFINER');
SELECT t_assert(
  -- Postgres 把空的 search_path 渲染成 search_path=""（一對引號），
  -- 不是 search_path=。兩種都接受，但【只接受空的】——
  -- search_path=public 也是「有設定」，卻完全不提供保護。
  (SELECT bool_and(array_to_string(p.proconfig,',') IN ('search_path=', 'search_path=""'))
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'reading_admin_%'),
  '🛑 S2 而且 search_path 都釘死了（提權的函式不釘死等於把提權交出去）');
SELECT t_assert(
  NOT (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname LIKE 'reading_admin_%'),
  'S3 anon 兩支都叫不動');

\echo ''
\echo '全部通過。'
