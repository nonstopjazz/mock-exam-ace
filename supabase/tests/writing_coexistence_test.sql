-- =====================================================
-- 共存測試：寫作系統的 migration 不得碰到 iLearn 的既有資料表
--
-- ⚠️ 這個檔案是 psql 專用（使用 \set / \echo / \ir 等反斜線指令）。
--    不要貼進 Supabase SQL Editor —— 那裡送出的是純 SQL，反斜線指令會回報
--      ERROR: 42601: syntax error at or near "\"
--    要在 Supabase 上執行的是這兩支純 SQL 腳本：
--      supabase/tests/writing_phase1_preflight.sql
--      supabase/tests/writing_phase1_staging_smoke.sql
--
--
-- 正式環境的 Supabase 專案（ytzspnjmkvrkbztnaomm）是 mock 與 iLearn 共用的。
-- 這份測試建立一張仿 iLearn 的 essay_submissions（含它真正用過的三個
-- 同名 RLS 政策），套用寫作系統的 migration，然後驗證 iLearn 那邊
-- 一個政策、一個 trigger、一個索引都沒有被動到。
--
-- 這是在本機重現過一次真實事故後補上的：舊版命名為 essay_submissions 時，
-- 這份 migration 會「跑完而不報錯」，但 mock 的表根本沒建立，
-- 索引、trigger 與 RLS 政策全部落到 iLearn 的正式表上。
--
-- 執行方式：
--   createdb coexisttest
--   psql -v ON_ERROR_STOP=1 -d coexisttest -f supabase/tests/_local_harness.sql
--   psql -v ON_ERROR_STOP=1 -d coexisttest -f supabase/tests/writing_coexistence_test.sql
-- =====================================================

\set ON_ERROR_STOP on

-- ── 佈置：仿 iLearn 的既有資料表與政策 ──
CREATE TABLE IF NOT EXISTS essay_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  essay_title VARCHAR(255),
  essay_date DATE DEFAULT CURRENT_DATE,
  submission_type VARCHAR(10) DEFAULT 'image',
  status VARCHAR(20) DEFAULT 'submitted',
  teacher_comment TEXT,
  score_content INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE essay_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can view own essays" ON essay_submissions
  FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Students can insert own essays" ON essay_submissions
  FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Students can update own essays" ON essay_submissions
  FOR UPDATE USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Admins can view all essays" ON essay_submissions
  FOR SELECT USING (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid()));

-- 記下套用前的狀態
CREATE TEMP TABLE ilearn_before AS
  SELECT (SELECT count(*) FROM pg_policies WHERE tablename='essay_submissions') AS policies,
         (SELECT count(*) FROM pg_indexes  WHERE tablename='essay_submissions') AS indexes,
         (SELECT count(*) FROM pg_trigger
            WHERE tgrelid='essay_submissions'::regclass AND NOT tgisinternal)   AS triggers,
         (SELECT count(*) FROM information_schema.columns
            WHERE table_name='essay_submissions')                              AS columns,
         (SELECT obj_description('essay_submissions'::regclass))                AS tbl_comment;

\ir ../migrations/create_writing_submissions.sql
\ir ../migrations/create_writing_texts.sql

-- ── 驗證 ──
CREATE OR REPLACE FUNCTION t_assert(cond BOOLEAN, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

SELECT t_assert(
  (SELECT count(*) FROM pg_policies WHERE tablename='essay_submissions')
    = (SELECT policies FROM ilearn_before),
  'C1 iLearn 的 RLS 政策數量未變');

SELECT t_assert(
  NOT EXISTS (SELECT 1 FROM pg_policies
              WHERE tablename='essay_submissions' AND policyname LIKE 'Writing:%'),
  'C2 沒有任何 Writing: 政策被加到 iLearn 的表上');

SELECT t_assert(
  (SELECT count(*) FROM pg_trigger
     WHERE tgrelid='essay_submissions'::regclass AND NOT tgisinternal)
    = (SELECT triggers FROM ilearn_before),
  'C3 iLearn 的表上沒有被掛上新的 trigger');

SELECT t_assert(
  (SELECT count(*) FROM pg_indexes WHERE tablename='essay_submissions')
    = (SELECT indexes FROM ilearn_before),
  'C4 iLearn 的表上沒有被加上新的索引');

SELECT t_assert(
  (SELECT count(*) FROM information_schema.columns WHERE table_name='essay_submissions')
    = (SELECT columns FROM ilearn_before),
  'C5 iLearn 的表沒有被加欄位');

SELECT t_assert(
  (SELECT obj_description('essay_submissions'::regclass)) IS NOT DISTINCT FROM
  (SELECT tbl_comment FROM ilearn_before),
  'C6 iLearn 的表註解沒有被覆蓋');

SELECT t_assert(
  (SELECT count(*) FROM information_schema.columns WHERE table_name='writing_submissions') > 0
  AND (SELECT count(*) FROM information_schema.columns WHERE table_name='writing_texts') > 0,
  'C7 寫作系統的資料表確實有被建立（而不是被 IF NOT EXISTS 略過）');

SELECT t_assert(
  (SELECT count(*) FROM pg_policies WHERE tablename IN ('writing_submissions','writing_texts')) = 8,
  'C8 寫作系統自己的 8 條政策都在自己的表上');

\echo '=== 共存測試全部通過 ==='
