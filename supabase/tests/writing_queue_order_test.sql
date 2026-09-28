-- =====================================================
-- writing_admin_queue() 的排序是不是全序
--
-- ⚠️ psql 專用，只在本機臨時資料庫跑。
-- 執行方式：
--   createdb wqorder
--   psql -v ON_ERROR_STOP=1 -d wqorder -f supabase/tests/writing_queue_order_test.sql
--
-- 這支自己建最小 schema，不需要 baseline migration。
--
-- 🛑 它先證明【修正前確實會亂】。沒有那一段，這份測試只是在證明
--    「新版跟自己一致」——那不成立任何事情。
--
-- 為什麼這件事會咬到人：
--   useReviewQueueNav 用這個順序算「下一篇」，而且每次進檢閱頁都重取。
--   順序在兩次取之間變了，老師按「下一篇」會回到剛看過的那一篇，
--   另一篇則永遠輪不到——而畫面上完全看不出異常。
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

-- ── 最小 schema ──────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY, email TEXT);

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.is_admin', true), 'true')::boolean;
$$;
CREATE OR REPLACE FUNCTION learn_display_name(p UUID) RETURNS TEXT
LANGUAGE sql STABLE AS $$ SELECT '學生' $$;

CREATE TABLE writing_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID,
  title TEXT, essay_topic TEXT, essay_date DATE,
  status TEXT NOT NULL,
  submitted_at TIMESTAMPTZ,
  touched INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE writing_texts (essay_id UUID, char_count INT, word_count INT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE writing_analyses (
  id UUID DEFAULT gen_random_uuid(), essay_id UUID, status TEXT,
  analysis_version INT, requested_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  failed_pass TEXT, error_detail TEXT, attempt_count INT,
  synthesis_status TEXT, synthesis_error_detail TEXT, synthesis_attempt_count INT,
  queue_batch_id UUID, queue_attempts INT, lease_expires_at TIMESTAMPTZ);
CREATE TABLE writing_teacher_reviews (essay_id UUID, reviewed_at TIMESTAMPTZ);
CREATE TABLE writing_teacher_feedback (essay_id UUID);
CREATE TABLE writing_error_findings (essay_id UUID, error_code TEXT);
CREATE TABLE learn_classes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, status TEXT);
CREATE TABLE learn_class_members (class_id UUID, student_id UUID, left_at TIMESTAMPTZ);

-- ── 兩個版本：修正前與修正後 ──────────────────────────
-- 只有 ORDER BY 那一行不同，其餘逐字相同。
CREATE OR REPLACE FUNCTION q_before() RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE v JSONB;
BEGIN
  SELECT coalesce(jsonb_agg(row_to_json(q)::jsonb ORDER BY q.submitted_at DESC), '[]'::jsonb)
    INTO v
    FROM (SELECT s.id AS essay_id, s.title, s.submitted_at
            FROM writing_submissions s WHERE s.status = 'SUBMITTED') q;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION q_after() RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE v JSONB;
BEGIN
  SELECT coalesce(jsonb_agg(row_to_json(q)::jsonb
                            ORDER BY q.submitted_at DESC, q.essay_id DESC), '[]'::jsonb)
    INTO v
    FROM (SELECT s.id AS essay_id, s.title, s.submitted_at
            FROM writing_submissions s WHERE s.status = 'SUBMITTED') q;
  RETURN v;
END $$;

/** 把回傳的順序壓成 "A,B,C" 方便比對 */
CREATE OR REPLACE FUNCTION titles(p JSONB) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT string_agg(e ->> 'title', ',') FROM jsonb_array_elements(p) WITH ORDINALITY t(e, i);
$$;

\echo ''
\echo '════════ 佈景：三篇 submitted_at 完全相同 ════════'

INSERT INTO writing_submissions (id, title, status, submitted_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'A', 'SUBMITTED', '2026-09-01 10:00:00+08'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'B', 'SUBMITTED', '2026-09-01 10:00:00+08'),
  ('cccccccc-0000-0000-0000-000000000003', 'C', 'SUBMITTED', '2026-09-01 10:00:00+08');
-- 一篇比較晚，用來確認主要排序沒有被次要排序蓋掉
INSERT INTO writing_submissions (id, title, status, submitted_at) VALUES
  ('00000000-0000-0000-0000-00000000000f', 'LATER', 'SUBMITTED', '2026-09-02 10:00:00+08');

\echo ''
\echo '════════ A. 🛑 先證明修正前確實會亂 ════════'

DO $$
DECLARE
  v1 TEXT; v2 TEXT; v3 TEXT;
BEGIN
  v1 := titles(q_before());
  -- 更新一列。這在批改流程裡是常態——改狀態、trigger 動 updated_at 都算。
  -- 非 HOT 的 UPDATE 會把那一列搬到 heap 尾端，seq scan 的回傳順序就變了。
  UPDATE writing_submissions SET touched = touched + 1
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  v2 := titles(q_before());
  UPDATE writing_submissions SET touched = touched + 1
   WHERE id = 'cccccccc-0000-0000-0000-000000000003';
  v3 := titles(q_before());

  RAISE NOTICE '      修正前三次的順序：% / % / %', v1, v2, v3;
  PERFORM t_assert(NOT (v1 = v2 AND v2 = v3),
    '🛑 A1 修正前：動過資料之後順序【真的會變】（否則這份測試證明不了任何事）');
END $$;

\echo ''
\echo '════════ B. 修正後是全序 ════════'

DO $$
DECLARE v1 TEXT; v2 TEXT; v3 TEXT;
BEGIN
  v1 := titles(q_after());
  UPDATE writing_submissions SET touched = touched + 1
   WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
  v2 := titles(q_after());
  UPDATE writing_submissions SET touched = touched + 1
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  v3 := titles(q_after());

  RAISE NOTICE '      修正後三次的順序：% / % / %', v1, v2, v3;
  PERFORM t_assert(v1 = v2 AND v2 = v3, '🛑 B1 修正後：動過資料順序也不變');
  PERFORM t_assert(v1 = 'LATER,C,B,A',
    'B2 順序就是 (submitted_at DESC, essay_id DESC)');
END $$;

SELECT t_assert(titles(q_after()) LIKE 'LATER,%',
  '🛑 B3 次要排序沒有蓋掉主要排序——最晚送出的仍然排第一');

\echo ''
\echo '════════ C. 邊界 ════════'

DO $$
BEGIN
  DELETE FROM writing_submissions;
  PERFORM t_assert(q_after() = '[]'::jsonb, 'C1 沒有作文時回空陣列，不是 null');

  INSERT INTO writing_submissions (id, title, status, submitted_at) VALUES
    ('11111111-0000-0000-0000-000000000001', 'ONLY', 'SUBMITTED', now());
  PERFORM t_assert(titles(q_after()) = 'ONLY', 'C2 只有一篇');

  INSERT INTO writing_submissions (id, title, status, submitted_at) VALUES
    ('22222222-0000-0000-0000-000000000002', 'DRAFT', 'DRAFT', NULL);
  PERFORM t_assert(titles(q_after()) = 'ONLY',
    '🛑 C3 草稿不在收件匣裡（它的 submitted_at 是 NULL，混進來會排到最前面）');
END $$;

\echo ''
\echo '全部通過'
