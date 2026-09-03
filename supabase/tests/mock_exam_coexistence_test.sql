-- =====================================================
-- 共存測試：mock 考試硬化 migration 不得碰到 iLearn 的既有物件
--
-- ⚠️ psql 專用（使用 \ir、\echo）。不要貼進 Supabase SQL Editor。
--
-- 正式專案由 mock 與 iLearn 共用。iLearn 有一套「老師手動輸入成績」的
-- 功能（exam_records / exam_types），裡面有真實資料，完全不在本次範圍內。
-- 本測試在套用 migration 前後對照 legacy 物件的每一項，證明它們沒被動到。
--
-- 這不是形式：寫作系統當初就是因為同名而差點在共用資料庫裡
-- 「跑完不報錯卻做錯事」。同一個資料庫，同一類風險。
--
-- 執行方式：
--   createdb coexistx
--   psql -v ON_ERROR_STOP=1 -d coexistx -f supabase/tests/mock_exam_prod_fixture.sql
--   psql -v ON_ERROR_STOP=1 -d coexistx -f supabase/tests/mock_exam_coexistence_test.sql
-- =====================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION t_assert(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

-- ── 套用前：把 legacy 的狀態完整拍下來 ──
CREATE TEMP TABLE legacy_before AS
SELECT
  (SELECT count(*) FROM exam_records)                                              AS record_rows,
  (SELECT count(*) FROM exam_types)                                                AS type_rows,
  (SELECT coalesce(sum(total_score), 0) FROM exam_records)                          AS record_total,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND tablename IN ('exam_records','exam_types'))      AS policies,
  (SELECT count(*) FROM pg_indexes
     WHERE schemaname='public' AND tablename IN ('exam_records','exam_types'))      AS indexes,
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND NOT t.tgisinternal
       AND c.relname IN ('exam_records','exam_types'))                              AS triggers,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name IN ('exam_records','exam_types'))   AS columns,
  (SELECT md5(string_agg(pg_get_constraintdef(c.oid), '|' ORDER BY c.conname))
     FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
     JOIN pg_namespace n ON n.oid=t.relnamespace
     WHERE n.nspname='public' AND t.relname IN ('exam_records','exam_types'))       AS constraint_hash,
  (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p
     JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='calculate_total_score')                AS legacy_fn_hash,
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name IN ('exam_records','exam_types'))   AS grants;

\ir ../migrations/harden_mock_exam_answers.sql

-- ── 套用後：逐項比對 ──
\echo '--- legacy iLearn 物件是否被動到 ---'

SELECT t_assert((SELECT count(*) FROM exam_records) = (SELECT record_rows FROM legacy_before),
  'U1 exam_records 列數未變');
SELECT t_assert((SELECT coalesce(sum(total_score),0) FROM exam_records) = (SELECT record_total FROM legacy_before),
  'U2 exam_records 資料未變');
SELECT t_assert((SELECT count(*) FROM exam_types) = (SELECT type_rows FROM legacy_before),
  'U3 exam_types 列數未變');
SELECT t_assert((SELECT count(*) FROM information_schema.columns
                 WHERE table_schema='public' AND table_name IN ('exam_records','exam_types'))
                = (SELECT columns FROM legacy_before),
  'U4 legacy 表沒有被加或減欄位');
SELECT t_assert((SELECT count(*) FROM pg_policies
                 WHERE schemaname='public' AND tablename IN ('exam_records','exam_types'))
                = (SELECT policies FROM legacy_before),
  'U5 legacy RLS 政策數未變');
SELECT t_assert((SELECT count(*) FROM pg_indexes
                 WHERE schemaname='public' AND tablename IN ('exam_records','exam_types'))
                = (SELECT indexes FROM legacy_before),
  'U6 legacy 索引數未變');
SELECT t_assert((SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                 JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND NOT t.tgisinternal
                   AND c.relname IN ('exam_records','exam_types'))
                = (SELECT triggers FROM legacy_before),
  'U7 legacy trigger 數未變');
SELECT t_assert((SELECT md5(string_agg(pg_get_constraintdef(c.oid), '|' ORDER BY c.conname))
                 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
                 JOIN pg_namespace n ON n.oid=t.relnamespace
                 WHERE n.nspname='public' AND t.relname IN ('exam_records','exam_types'))
                IS NOT DISTINCT FROM (SELECT constraint_hash FROM legacy_before),
  'U8 legacy 約束定義完全相同');
SELECT t_assert((SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p
                 JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='calculate_total_score')
                IS NOT DISTINCT FROM (SELECT legacy_fn_hash FROM legacy_before),
  'U9 legacy 函式 calculate_total_score() 原始碼未被取代');
SELECT t_assert((SELECT count(*) FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name IN ('exam_records','exam_types'))
                = (SELECT grants FROM legacy_before),
  'U10 legacy 表的授權未被 REVOKE 波及');

\echo '--- legacy 表上沒有出現任何 mock_exam_ 物件 ---'
SELECT t_assert(NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal
      AND c.relname IN ('exam_records','exam_types') AND t.tgname LIKE 'mock_exam%'),
  'U11 legacy 表上沒有 mock_exam_ trigger');
SELECT t_assert(NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname IN ('exam_records','exam_types')
      AND c.conname LIKE 'mock_exam%'),
  'U12 legacy 表上沒有 mock_exam_ 約束');

\echo '--- mock 這邊確實硬化完成 ---'
SELECT t_assert(EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='exam_user_answers'
                          AND column_name='grading_status'),
  'U13 mock 的硬化確實有套用（不是被 IF NOT EXISTS 靜默略過）');
SELECT t_assert((SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
                 JOIN pg_namespace n ON n.oid=t.relnamespace
                 WHERE n.nspname='public' AND t.relname='exam_user_answers'
                   AND c.conname LIKE 'mock_exam%') = 11,
  'U14 mock 的 11 條新約束都在自己的表上');
SELECT t_assert(NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                            WHERE n.nspname='public' AND p.proname='auto_grade_choice_answer'),
  'U15 舊的判分函式已移除，不會留下兩套判分邏輯');

\echo '=== 共存測試全部通過 ==='
