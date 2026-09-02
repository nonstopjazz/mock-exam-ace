-- =====================================================
-- Phase 1 部署後煙霧測試（資料層 A–H、O）
--
-- 整段包在 BEGIN … ROLLBACK 裡：驗證完之後資料庫回到原狀，
-- 不會留下任何測試作文或測試使用者。
--
-- 執行順序：
--   1. writing_phase1_preflight.sql      （唯讀，確認可以套用）
--   2. create_writing_submissions.sql
--   3. create_writing_texts.sql
--   4. 本檔
--
-- 判讀：出現任何 FAIL 或 ERROR 就中止，不要往正式環境推。
-- 全部通過時最後一行會顯示「=== 煙霧測試全部通過（已 ROLLBACK）===」。
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.t_assert(cond BOOLEAN, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.t_expect_error(stmt TEXT, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE EXCEPTION 'FAIL  % （預期要失敗，但成功了）', label;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL %' THEN RAISE; END IF;
  RAISE NOTICE 'PASS  % （擋下：%）', label, left(SQLERRM, 70);
END $$;

-- ── 準備兩個測試身分（優先沿用既有使用者，避免碰 auth 的 trigger）──
CREATE TEMP TABLE t_ids (slot INT PRIMARY KEY, uid UUID) ON COMMIT DROP;
-- 測試中會切換到 authenticated / anon 角色，temp table 必須開放讀取
GRANT SELECT ON t_ids TO authenticated, anon;

DO $$
DECLARE n INT;
BEGIN
  INSERT INTO t_ids (slot, uid)
  SELECT row_number() OVER (ORDER BY created_at), id
  FROM (SELECT id, created_at FROM auth.users ORDER BY created_at LIMIT 2) s;

  SELECT count(*) INTO n FROM t_ids;
  IF n < 2 THEN
    RAISE NOTICE '既有使用者不足兩位（%），建立臨時使用者（結束時會 rollback）', n;
    INSERT INTO auth.users (id, email)
    SELECT gen_random_uuid(), 'smoke' || g || '@example.invalid'
    FROM generate_series(n + 1, 2) g;
    DELETE FROM t_ids;
    INSERT INTO t_ids (slot, uid)
    SELECT row_number() OVER (ORDER BY created_at DESC), id
    FROM (SELECT id, created_at FROM auth.users ORDER BY created_at DESC LIMIT 2) s;
  END IF;
END $$;

\echo '--- A：資料表存在 ---'
SELECT pg_temp.t_assert(to_regclass('public.writing_submissions') IS NOT NULL, 'A1 writing_submissions 存在');
SELECT pg_temp.t_assert(to_regclass('public.writing_texts') IS NOT NULL,       'A2 writing_texts 存在');
SELECT pg_temp.t_assert(
  to_regprocedure('public.submit_writing_essay(text,text,text,date,text)') IS NOT NULL,
  'A3 submit_writing_essay() 存在');

\echo '--- B/C/O：iLearn 既有物件未被碰到 ---'
SELECT pg_temp.t_assert(
  NOT EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname='public' AND tablename='essay_submissions'
                AND policyname LIKE 'Writing:%'),
  'B1 essay_submissions 上沒有任何 Writing: 政策');
-- 用 catalog join 比對名稱，不用 ::regclass —— 那個轉型在表不存在時會在
-- 規劃階段就報錯，OR 的短路救不了它。
SELECT pg_temp.t_assert(
  NOT EXISTS (SELECT 1
              FROM pg_trigger t
              JOIN pg_class c ON c.oid = t.tgrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relname = 'essay_submissions'
                AND NOT t.tgisinternal AND t.tgname LIKE '%writing%'),
  'C1 essay_submissions 上沒有寫作系統的 trigger');
SELECT pg_temp.t_assert(
  NOT EXISTS (SELECT 1 FROM pg_indexes
              WHERE schemaname='public' AND tablename='essay_submissions'
                AND indexname LIKE 'idx_writing%'),
  'C2 essay_submissions 上沒有寫作系統的索引');
SELECT pg_temp.t_assert(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname='public' AND tablename IN ('writing_submissions','writing_texts')) = 8,
  'O1 寫作系統的 8 條政策都在自己的表上');

\echo '--- D：submit_writing_essay() 可用 ---'
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT uid FROM t_ids WHERE slot=1), 'role','authenticated')::text, true);

SELECT set_config('smoke.essay_id',
  public.submit_writing_essay(
    '煙霧測試作文', E'第一段。\n\n第二段。', '煙霧測試題目', CURRENT_DATE, '測試備註'
  )::text, true);

SELECT pg_temp.t_assert(
  (SELECT count(*) FROM writing_submissions
   WHERE id = current_setting('smoke.essay_id')::uuid
     AND status='SUBMITTED' AND submitted_at IS NOT NULL) = 1,
  'D1 送出後狀態為 SUBMITTED');
SELECT pg_temp.t_assert(
  (SELECT count(*) FROM writing_texts
   WHERE essay_id = current_setting('smoke.essay_id')::uuid AND provenance='TYPED') = 1,
  'D2 產生一筆 TYPED 正規文字');
SELECT pg_temp.t_assert(
  (SELECT content = E'第一段。\n\n第二段。' FROM writing_texts
   WHERE essay_id = current_setting('smoke.essay_id')::uuid),
  'D3 content 未被 trim');
SELECT pg_temp.t_assert(
  (SELECT char_count = char_length(content) FROM writing_texts
   WHERE essay_id = current_setting('smoke.essay_id')::uuid),
  'D4 char_count 由資料庫計算');

\echo '--- E：學生 A 讀不到學生 B ---'
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT uid FROM t_ids WHERE slot=2), 'role','authenticated')::text, true);
SELECT pg_temp.t_assert(
  (SELECT count(*) FROM writing_submissions WHERE id = current_setting('smoke.essay_id')::uuid) = 0,
  'E1 另一位學生讀不到這篇作文');
SELECT pg_temp.t_assert(
  (SELECT count(*) FROM writing_texts WHERE essay_id = current_setting('smoke.essay_id')::uuid) = 0,
  'E2 另一位學生讀不到正規文字');

\echo '--- F：未登入讀不到 ---'
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true);
SELECT pg_temp.t_assert((SELECT count(*) FROM writing_submissions) = 0, 'F1 anon 讀不到任何作文');
SELECT pg_temp.t_assert((SELECT count(*) FROM writing_texts) = 0,       'F2 anon 讀不到任何正規文字');

\echo '--- G：已送出的作文不可修改 ---'
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT uid FROM t_ids WHERE slot=1), 'role','authenticated')::text, true);
WITH u AS (UPDATE writing_submissions SET title='偷改'
           WHERE id = current_setting('smoke.essay_id')::uuid RETURNING 1)
SELECT pg_temp.t_assert((SELECT count(*) FROM u) = 0, 'G1 RLS：已送出的作文更新影響 0 列');
RESET ROLE;
SELECT pg_temp.t_expect_error(
  format('UPDATE writing_submissions SET title=''繞過 RLS'' WHERE id=%L',
         current_setting('smoke.essay_id')),
  'G2 trigger：繞過 RLS 仍不可修改已送出的作文');

\echo '--- H：writing_texts append-only ---'
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT uid FROM t_ids WHERE slot=1), 'role','authenticated')::text, true);
WITH u AS (UPDATE writing_texts SET content='改'
           WHERE essay_id = current_setting('smoke.essay_id')::uuid RETURNING 1)
SELECT pg_temp.t_assert((SELECT count(*) FROM u) = 0, 'H1 RLS：學生 UPDATE writing_texts 影響 0 列');
RESET ROLE;
SELECT pg_temp.t_expect_error(
  format('UPDATE writing_texts SET content=''繞過 RLS'' WHERE essay_id=%L',
         current_setting('smoke.essay_id')),
  'H2 trigger：繞過 RLS 仍不可修改 writing_texts');

\echo '--- Phase 1 結構性限制 ---'
SELECT pg_temp.t_expect_error(
  format('INSERT INTO writing_texts (essay_id, content, provenance) VALUES (%L, ''ocr'', ''OCR'')',
         current_setting('smoke.essay_id')),
  'P1 不可寫入 provenance=OCR');
SELECT pg_temp.t_expect_error(
  format('INSERT INTO writing_submissions (student_id, submission_type, title) VALUES (%L, ''image'', ''圖片'')',
         (SELECT uid FROM t_ids WHERE slot=1)),
  'P2 不可建立 submission_type=image');

\echo '=== 煙霧測試全部通過（即將 ROLLBACK，不留任何資料）==='
ROLLBACK;
