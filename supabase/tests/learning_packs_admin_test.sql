-- =====================================================
-- 主題學習包（第一期）：資料層測試
--
-- ⚠️ psql 專用。只在本機臨時資料庫跑（見 run-learning-packs.sh）。
--
-- 🛑 這份測試最重要的三件事
--
--   1. 同反義字 + 單字集的組合必須擋得住。那個組合【永遠產不出題目】
--      （pack_items 沒有 synonyms 欄位），放進資料庫只會讓學生看到空畫面。
--
--   2. target_count 超過來源數量必須擋住發布。超過的話那個單元
--      【永遠完成不了】，而學生會一直看到未完成。
--
--   3. 未發布的學習包，authenticated 一列都不能直接讀到。
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

-- 🛑 is_admin() 的替身【寫在這裡】，不靠 _local_harness.sql。
--    create_user_profiles_table.sql 會用真版覆蓋掉 harness 的替身，
--    所以「先載哪一份」會決定測試過不過 —— 那種測試不算證明了什麼。
--    這裡最後覆蓋一次，順序就不再影響結果。
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

\set adm '''11111111-1111-1111-1111-111111111111'''
\set stu '''22222222-2222-2222-2222-222222222222'''

INSERT INTO auth.users (id, email) VALUES (:adm,'admin@t'), (:stu,'stu@t')
ON CONFLICT (id) DO NOTHING;

-- 兩篇閱讀：一篇有題目、一篇沒有
INSERT INTO reading_passages (passage_id, title, passage_text, content_source)
VALUES ('p-with-q', '有題目的文章', 'text here', 'FINAL'),
       ('p-no-q',   '沒有題目的文章', 'text here', 'FINAL');

INSERT INTO reading_questions
  (passage_id, construct, question, option_a, option_b, option_c, option_d, display_order)
VALUES ('p-with-q','SM','Q1','A','B','C','D',1),
       ('p-with-q','SD','Q2','A','B','C','D',2),
       ('p-with-q','MI','Q3','A','B','C','D',3);

-- 兩個單字集：一個有字、一個空的
\set pkA '''cc000000-0000-0000-0000-0000000000a1'''
\set pkEmpty '''cc000000-0000-0000-0000-0000000000a2'''
INSERT INTO packs (id, title) VALUES (:pkA, '有字的單字集'), (:pkEmpty, '空的單字集');
INSERT INTO pack_items (pack_id, word) VALUES
  (:pkA,'alpha'), (:pkA,'beta'), (:pkA,'gamma'), (:pkA,'delta'), (:pkA,'epsilon');

SELECT t_as(:adm, true);

\echo ''
\echo '════════ A. 建立學習包 ════════'

\set pack1 `echo _`
SELECT learning_pack_admin_upsert(
  p_slug => 'exam-1-review', p_title => '高一上第一次段考複習包',
  p_summary => '段考前把範圍走一遍', p_grade => '高一',
  p_goals => '["複習第 1-3 課單字","練習主旨題"]'::jsonb,
  p_estimated_minutes => 60) \gset r_
SELECT t_assert((:'r_learning_pack_admin_upsert'::jsonb ->> 'slug') = 'exam-1-review',
  'A1 建立成功並回傳整包');
SELECT t_assert(jsonb_array_length(:'r_learning_pack_admin_upsert'::jsonb -> 'units') = 0,
  'A2 剛建立時沒有單元');
SELECT t_assert((:'r_learning_pack_admin_upsert'::jsonb ->> 'status') = 'DRAFT',
  'A3 預設是草稿');
SELECT t_assert(
  (:'r_learning_pack_admin_upsert'::jsonb -> 'problems' -> 0 ->> 'code') = 'NO_UNITS',
  '🛑 A4 空的包會回報 NO_UNITS —— 空包發布出去學生打開是空白');

CREATE TEMP TABLE _t AS SELECT (:'r_learning_pack_admin_upsert'::jsonb ->> 'id')::uuid AS pack_id;

\echo ''
\echo '════════ 🛑 B. 發布閘門 ════════'

DO $$
DECLARE v UUID := (SELECT pack_id FROM _t);
BEGIN
  BEGIN
    PERFORM public.learning_pack_admin_set_status(v, 'PUBLISHED');
    RAISE EXCEPTION 'FAIL  B1 空的包不該發布得了';
  EXCEPTION WHEN sqlstate '22023' THEN
    RAISE NOTICE 'PASS  🛑 B1 空的包發布被擋下（22023）';
  END;
END $$;

\echo ''
\echo '════════ 🛑 C. 同反義字 + 單字集必須擋住 ════════'
-- pack_items 沒有 synonyms / antonyms 欄位，這個組合永遠產不出題目。

DO $$
DECLARE v UUID := (SELECT pack_id FROM _t);
BEGIN
  BEGIN
    PERFORM public.learning_pack_admin_unit_upsert(
      p_pack_id => v, p_title => '同反義字', p_activity_type => 'vocab',
      p_vocab_pack_id => 'cc000000-0000-0000-0000-0000000000a1'::uuid,
      p_vocab_mode => 'synonym_antonym', p_task_kind => 'quiz');
    RAISE EXCEPTION 'FAIL  C1 同反義字 + 單字集不該建立得了';
  EXCEPTION WHEN sqlstate '22023' THEN
    RAISE NOTICE 'PASS  🛑 C1 RPC 擋下並給看得懂的訊息';
  END;
END $$;

-- 繞過 RPC 直接寫表也要擋住
DO $$
DECLARE v UUID := (SELECT pack_id FROM _t);
BEGIN
  BEGIN
    INSERT INTO public.learning_pack_units
      (pack_id, title, activity_type, vocab_pack_id, vocab_mode, task_kind)
    VALUES (v, '偷渡', 'vocab', 'cc000000-0000-0000-0000-0000000000a1'::uuid,
            'synonym_antonym', 'quiz');
    RAISE EXCEPTION 'FAIL  C2 直接寫表也不該成功';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS  🛑 C2 資料表的 CHECK 也擋住（不是只靠 RPC）';
  END;
END $$;

\echo ''
\echo '════════ D. 組裝單元 ════════'

SELECT learning_pack_admin_unit_upsert(
  p_pack_id => (SELECT pack_id FROM _t), p_title => '讀一篇文章',
  p_activity_type => 'reading', p_reading_passage_id => 'p-with-q',
  p_task_kind => 'reading') \gset d1_
SELECT t_assert(jsonb_array_length(:'d1_learning_pack_admin_unit_upsert'::jsonb -> 'units') = 1,
  'D1 加入閱讀單元');
SELECT t_assert(
  (:'d1_learning_pack_admin_unit_upsert'::jsonb -> 'units' -> 0 ->> 'source_title') = '有題目的文章',
  'D2 帶回來源標題');
SELECT t_assert(
  (:'d1_learning_pack_admin_unit_upsert'::jsonb -> 'units' -> 0 ->> 'source_available')::int = 3,
  '🛑 D3 帶回【可用數量】（3 題）—— 在後端算，不讓前端自己查');

SELECT learning_pack_admin_unit_upsert(
  p_pack_id => (SELECT pack_id FROM _t), p_title => '翻卡認識單字',
  p_activity_type => 'vocab', p_vocab_pack_id => 'cc000000-0000-0000-0000-0000000000a1'::uuid,
  p_vocab_mode => 'flashcard', p_task_kind => 'exposure', p_target_count => 5) \gset d2_
SELECT t_assert(jsonb_array_length(:'d2_learning_pack_admin_unit_upsert'::jsonb -> 'units') = 2,
  'D4 加入單字單元');
SELECT t_assert(
  (:'d2_learning_pack_admin_unit_upsert'::jsonb -> 'units' -> 1 ->> 'sort_order')::int = 1,
  'D5 sort_order 由後端接在最後（不讓前端決定，避免撞號）');

\echo ''
\echo '════════ 🛑 E. 任務型態與模式必須配對 ════════'

DO $$
DECLARE v UUID := (SELECT pack_id FROM _t);
BEGIN
  BEGIN
    INSERT INTO public.learning_pack_units
      (pack_id, title, activity_type, vocab_pack_id, vocab_mode, task_kind)
    VALUES (v, '錯配', 'vocab', 'cc000000-0000-0000-0000-0000000000a1'::uuid,
            'spelling', 'srs');
    RAISE EXCEPTION 'FAIL  E1 srs 任務配 spelling 模式不該成功';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS  🛑 E1 srs 任務只能配 srs 模式（混用會讓完成條件沒有意義）';
  END;
  BEGIN
    INSERT INTO public.learning_pack_units
      (pack_id, title, activity_type, vocab_pack_id, vocab_mode, task_kind)
    VALUES (v, '錯配2', 'vocab', 'cc000000-0000-0000-0000-0000000000a1'::uuid,
            'quick_quiz', 'exposure');
    RAISE EXCEPTION 'FAIL  E2 接觸型配 quick_quiz 不該成功';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS  🛑 E2 接觸型只能配翻卡（只有翻卡做得到「曝光」）';
  END;
  BEGIN
    INSERT INTO public.learning_pack_units
      (pack_id, title, activity_type, reading_passage_id, vocab_pack_id, task_kind)
    VALUES (v, '兩個來源', 'reading', 'p-with-q',
            'cc000000-0000-0000-0000-0000000000a1'::uuid, 'reading');
    RAISE EXCEPTION 'FAIL  E3 同時給兩個來源不該成功';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS  E3 來源恰好一個';
  END;
END $$;

\echo ''
\echo '════════ 🛑 F. target_count 超過來源 ════════'
-- 超過的話那個單元【永遠完成不了】，學生會一直看到未完成。

SELECT learning_pack_admin_unit_upsert(
  p_pack_id => (SELECT pack_id FROM _t), p_title => '太多題',
  p_activity_type => 'vocab', p_vocab_pack_id => 'cc000000-0000-0000-0000-0000000000a1'::uuid,
  p_vocab_mode => 'quick_quiz', p_task_kind => 'quiz', p_target_count => 99) \gset f1_
SELECT t_assert(
  EXISTS (SELECT 1 FROM jsonb_array_elements(:'f1_learning_pack_admin_unit_upsert'::jsonb -> 'problems') x
           WHERE x ->> 'code' = 'TARGET_EXCEEDS_SOURCE'),
  '🛑 F1 回報 TARGET_EXCEEDS_SOURCE（來源只有 5 個，卻要求 99 個）');

DO $$
DECLARE v UUID := (SELECT pack_id FROM _t);
BEGIN
  BEGIN
    PERFORM public.learning_pack_admin_set_status(v, 'PUBLISHED');
    RAISE EXCEPTION 'FAIL  F2 有永遠完成不了的單元不該發布得了';
  EXCEPTION WHEN sqlstate '22023' THEN
    RAISE NOTICE 'PASS  🛑 F2 發布被擋下';
  END;
END $$;

-- 改成合理的數量就可以發布了
SELECT learning_pack_admin_unit_upsert(
  p_pack_id => (SELECT pack_id FROM _t),
  p_unit_id => (:'f1_learning_pack_admin_unit_upsert'::jsonb -> 'units' -> 2 ->> 'id')::uuid,
  p_activity_type => 'vocab', p_vocab_pack_id => 'cc000000-0000-0000-0000-0000000000a1'::uuid,
  p_target_count => 5) \gset f3_
SELECT t_assert(
  jsonb_array_length(:'f3_learning_pack_admin_unit_upsert'::jsonb -> 'problems') = 0,
  'F3 改成 5 個之後沒有問題了');

\echo ''
\echo '════════ G. 發布與下架 ════════'

SELECT learning_pack_admin_set_status((SELECT pack_id FROM _t), 'PUBLISHED') \gset g1_
SELECT t_assert((:'g1_learning_pack_admin_set_status'::jsonb ->> 'status') = 'PUBLISHED',
  'G1 就緒之後可以發布');

-- 🛑 下架永遠要做得到，即使內容有問題
SELECT learning_pack_admin_unit_upsert(
  p_pack_id => (SELECT pack_id FROM _t), p_title => '壞掉的單元',
  p_activity_type => 'reading', p_reading_passage_id => 'p-no-q',
  p_task_kind => 'reading') \gset g2_
SELECT t_assert(
  EXISTS (SELECT 1 FROM jsonb_array_elements(:'g2_learning_pack_admin_unit_upsert'::jsonb -> 'problems') x
           WHERE x ->> 'code' = 'READING_NO_QUESTIONS'),
  'G2 沒有題目的文章會被回報');
SELECT learning_pack_admin_set_status((SELECT pack_id FROM _t), 'DRAFT') \gset g3_
SELECT t_assert((:'g3_learning_pack_admin_set_status'::jsonb ->> 'status') = 'DRAFT',
  '🛑 G3 即使有問題也退得回草稿 —— 下架不該因為檢查不過而做不到');

\echo ''
\echo '════════ H. 重新排序 ════════'

DO $$
DECLARE
  v UUID := (SELECT pack_id FROM _t);
  ids UUID[];
BEGIN
  SELECT array_agg(id ORDER BY sort_order) INTO ids
    FROM public.learning_pack_units WHERE pack_id = v;

  -- 顛倒
  PERFORM public.learning_pack_admin_reorder(v, ARRAY(SELECT unnest(ids) ORDER BY 1 DESC));

  BEGIN
    PERFORM public.learning_pack_admin_reorder(v, ids[1:2]);
    RAISE EXCEPTION 'FAIL  H2 少送單元不該成功';
  EXCEPTION WHEN sqlstate '22023' THEN
    RAISE NOTICE 'PASS  🛑 H2 少送單元被擋下（畫面可能不是最新的）';
  END;
END $$;
SELECT t_assert(true, 'H1 整份順序送得出去');

\echo ''
\echo '════════ 🛑 I. 權限 ════════'

SELECT t_as(:stu, false);
DO $$ BEGIN
  BEGIN
    PERFORM public.learning_pack_admin_list();
    RAISE EXCEPTION 'FAIL  I1 非管理員不該讀得到清單';
  EXCEPTION WHEN sqlstate '42501' THEN RAISE NOTICE 'PASS  I1 非管理員讀清單 → 42501';
  END;
  BEGIN
    PERFORM public.learning_pack_admin_upsert(p_slug => 'x', p_title => 'x');
    RAISE EXCEPTION 'FAIL  I2 非管理員不該建立得了';
  EXCEPTION WHEN sqlstate '42501' THEN RAISE NOTICE 'PASS  I2 非管理員建立 → 42501';
  END;
END $$;
SELECT t_as(:adm, true);

-- 🛑 未發布的包不可以透過一般權限直接讀到
SELECT t_assert(
  NOT has_table_privilege('authenticated', 'public.learning_packs', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.learning_pack_units', 'SELECT'),
  '🛑 I3 authenticated 對兩張表都沒有 SELECT（未發布的包不可外流）');
SELECT t_assert(
  NOT has_function_privilege('authenticated', 'learning_pack_readiness(uuid)', 'EXECUTE'),
  'I4 內部的 readiness 函式不給 authenticated');

\echo ''
\echo '════════ J. 教材下拉選單 ════════'

SELECT learning_pack_admin_sources() \gset j_
SELECT t_assert(
  jsonb_array_length(:'j_learning_pack_admin_sources'::jsonb -> 'passages') = 2
  AND jsonb_array_length(:'j_learning_pack_admin_sources'::jsonb -> 'vocab_packs') = 2,
  '🛑 J1 空的來源也要列出來 —— 濾掉的話老師會找不到剛建立的單字集，以為系統壞了');
SELECT t_assert(
  (SELECT (x ->> 'item_count')::int FROM jsonb_array_elements(
     :'j_learning_pack_admin_sources'::jsonb -> 'vocab_packs') x
    WHERE x ->> 'title' = '空的單字集') = 0,
  'J2 而且標示數量為 0');

\echo ''
\echo '════════ K. 清空欄位（p_clear）════════'

-- 先填上兩個「NULL 代表不改」清不掉的欄位
SELECT learning_pack_admin_upsert(
  p_pack_id => (SELECT pack_id FROM _t),
  p_estimated_minutes => 45,
  p_open_at => '2026-01-01T00:00:00Z'::timestamptz) \gset k0_
SELECT t_assert(
  (:'k0_learning_pack_admin_upsert'::jsonb ->> 'estimated_minutes')::int = 45
  AND (:'k0_learning_pack_admin_upsert'::jsonb ->> 'open_at') IS NOT NULL,
  'K1 先填得上預計時間與開放時間');

-- 不送 p_clear 時，NULL 仍然是「不要改」
SELECT learning_pack_admin_upsert(
  p_pack_id => (SELECT pack_id FROM _t), p_summary => '改了簡介') \gset k1_
SELECT t_assert(
  (:'k1_learning_pack_admin_upsert'::jsonb ->> 'estimated_minutes')::int = 45,
  '🛑 K2 只送簡介時，沒送的欄位不會被清掉（NULL = 不改，這是 p_clear 存在的前提）');

-- 點名清空
SELECT learning_pack_admin_upsert(
  p_pack_id => (SELECT pack_id FROM _t),
  p_clear => ARRAY['estimated_minutes', 'open_at']) \gset k2_
SELECT t_assert(
  (:'k2_learning_pack_admin_upsert'::jsonb -> 'estimated_minutes') = 'null'::jsonb
  AND (:'k2_learning_pack_admin_upsert'::jsonb -> 'open_at') = 'null'::jsonb,
  '🛑 K3 p_clear 清得掉 INTEGER 與 TIMESTAMPTZ —— 送 NULL 做不到這件事');
SELECT t_assert(
  (:'k2_learning_pack_admin_upsert'::jsonb ->> 'summary') = '改了簡介',
  'K4 清空只動點名的欄位，沒點名的不受影響');

-- 🛑 白名單：NOT NULL 的欄位不可以被清，而且要在到達 UPDATE 之前就擋下來
DO $$
DECLARE v UUID := (SELECT pack_id FROM _t);
BEGIN
  BEGIN
    PERFORM public.learning_pack_admin_upsert(p_pack_id => v, p_clear => ARRAY['title']);
    RAISE EXCEPTION 'FAIL  K5 title 不該清得掉';
  EXCEPTION WHEN sqlstate '22023' THEN
    RAISE NOTICE 'PASS  🛑 K5 清空 NOT NULL 欄位 → 22023（不是看不懂的 not-null violation）';
  END;
  BEGIN
    PERFORM public.learning_pack_admin_upsert(p_pack_id => v, p_clear => ARRAY['created_by']);
    RAISE EXCEPTION 'FAIL  K6 不在白名單的欄位不該清得掉';
  EXCEPTION WHEN sqlstate '22023' THEN
    RAISE NOTICE 'PASS  🛑 K6 白名單擋得住沒列出來的欄位（否則 p_clear 就是個可以寫任何欄位的洞）';
  END;
END $$;

\echo ''
\echo '學習包測試全部通過。'
