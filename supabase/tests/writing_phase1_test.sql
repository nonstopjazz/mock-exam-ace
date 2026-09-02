-- =====================================================
-- 寫作系統 Phase 1 資料層測試
--
-- ⚠️ 這個檔案是 psql 專用（使用 \set / \echo / \ir 等反斜線指令）。
--    不要貼進 Supabase SQL Editor —— 那裡送出的是純 SQL，反斜線指令會回報
--      ERROR: 42601: syntax error at or near "\"
--    要在 Supabase 上執行的是這兩支純 SQL 腳本：
--      supabase/tests/writing_phase1_preflight.sql
--      supabase/tests/writing_phase1_staging_smoke.sql
--
--
-- 這些斷言涵蓋 Phase 1 真正的風險：跨學生的資料隔離、送出後的不可變性、
-- writing_texts 的 append-only 保證，以及 Phase 1 只收文字作文的結構性限制。
-- 快樂路徑通過並不能證明什麼；負面測試才是重點。
--
-- 執行方式（本機臨時資料庫，勿指向正式環境）：
--   createdb essaytest
--   psql -v ON_ERROR_STOP=1 -d essaytest -f supabase/tests/_local_harness.sql
--   psql -v ON_ERROR_STOP=1 -d essaytest -f supabase/migrations/create_writing_submissions.sql
--   psql -v ON_ERROR_STOP=1 -d essaytest -f supabase/migrations/create_writing_texts.sql
--   psql -v ON_ERROR_STOP=1 -d essaytest -f supabase/tests/essay_phase1_test.sql
--
-- 任何一條斷言失敗都會讓整個腳本以非零狀態結束。
-- =====================================================

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

-- helper: 斷言
CREATE OR REPLACE FUNCTION t_assert(cond BOOLEAN, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

-- helper: 斷言某段 SQL 會爆
CREATE OR REPLACE FUNCTION t_expect_error(stmt TEXT, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE EXCEPTION 'FAIL  % （預期要失敗，但成功了）', label;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL %' THEN RAISE; END IF;
  RAISE NOTICE 'PASS  % （擋下：%）', label, left(SQLERRM, 60);
END $$;

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a@test'),
  ('22222222-2222-2222-2222-222222222222', 'b@test');

\echo '--- T1..T4 學生 A 送出作文 ---'
SET ROLE authenticated;
SET app.uid = '11111111-1111-1111-1111-111111111111';
SET app.is_admin = 'false';

SELECT set_config('app.essay_id', submit_writing_essay(
  '  我最難忘的旅行  ',
  E'  第一段開頭有空白。\n\n第二段。結尾也有空白  ',
  '  請寫一篇遊記  ', '2026-08-01', '  想請老師看結尾  '
)::text, false);

SELECT t_assert((SELECT count(*) = 1 FROM writing_submissions
  WHERE status='SUBMITTED' AND submitted_at IS NOT NULL
    AND title='我最難忘的旅行' AND essay_topic='請寫一篇遊記'
    AND student_notes='想請老師看結尾' AND essay_date='2026-08-01'),
  'T1 送出後為 SUBMITTED，標題／題目／備註已 trim');

SELECT t_assert((SELECT count(*) = 1 FROM writing_texts WHERE provenance='TYPED'),
  'T2 產生一筆 TYPED 正規文字');

SELECT t_assert((SELECT content = E'  第一段開頭有空白。\n\n第二段。結尾也有空白  ' FROM writing_texts),
  'T3 content 未被 trim（字元位移必須對得上學生實際寫下的內容）');

SELECT t_assert((SELECT char_count = char_length(content) FROM writing_texts),
  'T4 char_count 由資料庫計算');

\echo '--- T5..T7 RLS 隔離 ---'
SET app.uid = '22222222-2222-2222-2222-222222222222';
SELECT t_assert((SELECT count(*) = 0 FROM writing_submissions), 'T5 學生 B 讀不到 A 的作文');
SELECT t_assert((SELECT count(*) = 0 FROM writing_texts), 'T6 學生 B 讀不到 A 的正規文字');

SET app.uid = '';
SELECT t_assert((SELECT count(*) = 0 FROM writing_submissions), 'T7 未登入讀不到任何作文');

\echo '--- T8..T9 已送出的作文不可修改 ---'
SET app.uid = '11111111-1111-1111-1111-111111111111';
SELECT t_assert((SELECT count(*) = 1 FROM writing_submissions), 'T8 學生 A 讀得到自己的作文');

WITH u AS (UPDATE writing_submissions SET title='偷改' RETURNING 1)
SELECT t_assert((SELECT count(*) FROM u) = 0, 'T9 RLS：已送出的作文更新影響 0 列');

RESET ROLE;
SELECT t_expect_error(
  $$UPDATE writing_submissions SET title='繞過 RLS 偷改'$$,
  'T10 trigger：即使繞過 RLS，已送出的作文仍不可修改');

\echo '--- T11..T13 writing_texts append-only ---'
SET ROLE authenticated;
-- RLS 沒有 UPDATE 政策時，UPDATE 不會報錯，而是影響 0 列。
-- 兩層防護要分開驗：這一層驗「學生碰不到任何一列」，T12 驗「真的碰到時 trigger 會擋」。
WITH u AS (UPDATE writing_texts SET content='改內容' RETURNING 1)
SELECT t_assert((SELECT count(*) FROM u) = 0, 'T11 RLS：學生 UPDATE writing_texts 影響 0 列');
RESET ROLE;
SELECT t_expect_error(
  $$UPDATE writing_texts SET content='繞過 RLS 改內容'$$,
  'T12 trigger：繞過 RLS 也不可 UPDATE writing_texts');

\echo '--- T13..T16 Phase 1 的結構性限制 ---'
SELECT t_expect_error(
  $$INSERT INTO writing_texts (essay_id, content, provenance)
    VALUES (current_setting('app.essay_id')::uuid, 'ocr text', 'OCR')$$,
  'T13 Phase 1 不可寫入 provenance=OCR');

SELECT t_expect_error(
  $$INSERT INTO writing_submissions (student_id, submission_type, title)
    VALUES ('11111111-1111-1111-1111-111111111111','image','圖片作文')$$,
  'T14 Phase 1 不可建立 submission_type=image');

SELECT t_expect_error(
  $$INSERT INTO writing_submissions (student_id, title, status)
    VALUES ('11111111-1111-1111-1111-111111111111','缺時間戳','SUBMITTED')$$,
  'T15 SUBMITTED 必須有 submitted_at');

SELECT t_expect_error(
  $$INSERT INTO writing_submissions (student_id, title) VALUES ('11111111-1111-1111-1111-111111111111','   ')$$,
  'T16 標題不可為空白');

\echo '--- T17..T18 RPC 輸入驗證 ---'
SET ROLE authenticated;
SET app.uid = '11111111-1111-1111-1111-111111111111';
SELECT t_expect_error($$SELECT submit_writing_essay('  ', '有內容')$$, 'T17 空標題被擋');
SELECT t_expect_error($$SELECT submit_writing_essay('有標題', '   ')$$, 'T18 空內容被擋');
SET app.uid = '';
SELECT t_expect_error($$SELECT submit_writing_essay('標題','內容')$$, 'T19 未登入不可送出');

\echo '--- T20 管理員可讀全部 ---'
SET app.uid = '22222222-2222-2222-2222-222222222222';
SET app.is_admin = 'true';
SELECT t_assert((SELECT count(*) = 1 FROM writing_submissions), 'T20 管理員讀得到別人的作文');
SELECT t_assert((SELECT count(*) = 1 FROM writing_texts), 'T20b 管理員讀得到別人的正規文字');
SET app.is_admin = 'false';

\echo '--- T21 連帶刪除（append-only trigger 不可擋住 cascade）---'
RESET ROLE;
DELETE FROM writing_submissions WHERE id = current_setting('app.essay_id')::uuid;
SELECT t_assert((SELECT count(*) = 0 FROM writing_texts), 'T21 刪除作文時 writing_texts 一併被 cascade 刪除');

\echo '--- T22 草稿可改可刪 ---'
SET ROLE authenticated;
SET app.uid = '11111111-1111-1111-1111-111111111111';
INSERT INTO writing_submissions (student_id, title) VALUES ('11111111-1111-1111-1111-111111111111','草稿一');
WITH u AS (UPDATE writing_submissions SET title='草稿改名' WHERE status='DRAFT' RETURNING 1)
SELECT t_assert((SELECT count(*) FROM u) = 1, 'T22 草稿可以修改');
WITH d AS (DELETE FROM writing_submissions WHERE status='DRAFT' RETURNING 1)
SELECT t_assert((SELECT count(*) FROM d) = 1, 'T23 草稿可以刪除');
RESET ROLE;

\echo '=== 全部通過 ==='
