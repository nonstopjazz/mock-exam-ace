-- =====================================================
-- STAGING 共存驗證：mock 硬化 migration 不得碰到 iLearn 的既有物件
--
-- 目標專案：cwymrzcovgobfqxtithn（gsat-staging）
--
-- ✅ 純 SQL，可直接貼進 Supabase SQL Editor（沒有 \ir、\echo、\set）。
-- ✅ 不內嵌、也不自動執行 migration。套用 migration 是獨立的手動步驟。
-- ✅ 結果累積在暫存表，最後以 SELECT 呈現。
--
-- ⚠️ 同一份檔案要跑「兩次」：
--
--   第 1 次（migration 之前）→ 建立基準快照 public.mock_exam_coexist_baseline
--   ── 手動貼上並執行 supabase/migrations/harden_mock_exam_answers.sql ──
--   第 2 次（migration 之後）→ 逐項比對，然後自動刪除基準表
--
-- 為什麼不用暫存表存基準：Supabase SQL Editor 每次執行都是新連線，
-- 暫存表活不過兩次執行，所以基準必須落在一張真正的表上（用完就刪）。
--
-- 為什麼要做這件事：正式專案由 mock 與 iLearn 共用同一個資料庫。
-- 寫作系統當初就是因為同名，差點在共用資料庫裡「跑完不報錯卻做錯事」。
-- 「migration 沒有報錯」不等於「migration 做了對的事」。
--
-- 本檔對 exam_records / exam_types 只讀不寫。
-- =====================================================

DROP TABLE IF EXISTS pg_temp.coexist_results;
CREATE TEMP TABLE coexist_results (seq int, id text, result text, detail text);

DO $outer$
DECLARE
  US    constant text := chr(31);
  res   text[] := ARRAY[]::text[];
  phase text;
  i     int;

  -- 目前狀態
  c_record_rows   text; c_type_rows text; c_record_total text;
  c_policies      text; c_indexes   text; c_triggers     text; c_columns text;
  c_policy_names  text; c_index_names text; c_trigger_names text;
  c_constraint_hash text; c_fn_hash text; c_grants text;

  b_val text;
  v_n   bigint;

  -- 逐項比對用
  v_keys text[] := ARRAY[
    'record_rows','type_rows','record_total','columns','policies','indexes','triggers',
    'policy_names','index_names','trigger_names','constraint_hash','legacy_fn_hash','grants'];
  v_labels text[] := ARRAY[
    'U1 exam_records 列數未變',
    'U2 exam_types 列數未變',
    'U3 exam_records 資料未變（total_score 合計）',
    'U4 legacy 表沒有被加或減欄位',
    'U5 legacy RLS 政策數未變',
    'U6 legacy 索引數未變',
    'U7 legacy trigger 數未變',
    'U8 legacy 政策名稱完全相同',
    'U9 legacy 索引名稱完全相同',
    'U10 legacy trigger 名稱完全相同',
    'U11 legacy 約束定義完全相同',
    'U12 legacy 函式 calculate_total_score() 原始碼未被取代',
    'U13 legacy 表的授權未被 REVOKE 波及'];
  v_now text[];
BEGIN
  ---------------------------------------------------------------
  -- 蒐集目前的 legacy 指紋（唯讀）
  ---------------------------------------------------------------
  IF to_regclass('public.exam_records') IS NULL THEN
    c_record_rows := 'NO_TABLE'; c_record_total := 'NO_TABLE';
  ELSE
    EXECUTE 'SELECT count(*) FROM public.exam_records' INTO v_n;
    c_record_rows := v_n::text;
    EXECUTE 'SELECT coalesce(sum(total_score), 0)::text FROM public.exam_records' INTO c_record_total;
  END IF;

  IF to_regclass('public.exam_types') IS NULL THEN
    c_type_rows := 'NO_TABLE';
  ELSE
    EXECUTE 'SELECT count(*) FROM public.exam_types' INTO v_n;
    c_type_rows := v_n::text;
  END IF;

  SELECT count(*)::text INTO c_columns FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name IN ('exam_records','exam_types');

  SELECT count(*)::text, coalesce(string_agg(tablename || '.' || policyname, '|' ORDER BY tablename, policyname), '')
    INTO c_policies, c_policy_names
    FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('exam_records','exam_types');

  SELECT count(*)::text, coalesce(string_agg(indexname, '|' ORDER BY indexname), '')
    INTO c_indexes, c_index_names
    FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('exam_records','exam_types');

  SELECT count(*)::text, coalesce(string_agg(t.tgname, '|' ORDER BY t.tgname), '')
    INTO c_triggers, c_trigger_names
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND NOT t.tgisinternal
     AND c.relname IN ('exam_records','exam_types');

  SELECT coalesce(md5(string_agg(pg_get_constraintdef(c.oid), '|' ORDER BY c.conname)), 'NONE')
    INTO c_constraint_hash
    FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public' AND t.relname IN ('exam_records','exam_types');

  SELECT coalesce(md5(string_agg(pg_get_functiondef(p.oid), '|' ORDER BY p.oid)), 'NONE')
    INTO c_fn_hash
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'calculate_total_score';

  SELECT count(*)::text INTO c_grants FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name IN ('exam_records','exam_types');

  v_now := ARRAY[c_record_rows, c_type_rows, c_record_total, c_columns, c_policies,
                 c_indexes, c_triggers, c_policy_names, c_index_names, c_trigger_names,
                 c_constraint_hash, c_fn_hash, c_grants];

  ---------------------------------------------------------------
  -- 判斷這是第 1 次（拍照）還是第 2 次（比對）
  ---------------------------------------------------------------
  IF to_regclass('public.mock_exam_coexist_baseline') IS NULL THEN
    phase := 'BASELINE';

    CREATE TABLE public.mock_exam_coexist_baseline (k text, v text);

    FOR i IN 1 .. array_length(v_keys, 1) LOOP
      INSERT INTO public.mock_exam_coexist_baseline VALUES (v_keys[i], v_now[i]);
      res := res || ('snapshot' || US || 'INFO' || US || v_keys[i] || ' = ' || left(v_now[i], 120));
    END LOOP;

    res := res || ('PRE1' || US
      || CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema = 'public' AND table_name = 'exam_user_answers'
                             AND column_name = 'grading_status')
              THEN 'FAIL' ELSE 'PASS' END || US
      || '拍照時 migration 尚未套用（grading_status 應該還不存在）');

    res := res || ('NEXT' || US || 'INFO' || US
      || '基準已存入 public.mock_exam_coexist_baseline。'
      || '接著手動執行 supabase/migrations/harden_mock_exam_answers.sql，然後再跑一次本檔。');

  ELSE
    phase := 'VERIFY';

    ---------------------------------------------------------------
    -- U1–U13：legacy 的每一項都必須逐字相同
    ---------------------------------------------------------------
    FOR i IN 1 .. array_length(v_keys, 1) LOOP
      SELECT v INTO b_val FROM public.mock_exam_coexist_baseline WHERE k = v_keys[i];
      res := res || (v_labels[i] || US
        || CASE WHEN b_val IS NOT DISTINCT FROM v_now[i] THEN 'PASS' ELSE 'FAIL' END || US
        || CASE WHEN b_val IS NOT DISTINCT FROM v_now[i]
                THEN '前後相同：' || left(coalesce(v_now[i], 'NULL'), 90)
                ELSE '前 = ' || left(coalesce(b_val, 'NULL'), 60)
                     || '｜後 = ' || left(coalesce(v_now[i], 'NULL'), 60) END);
    END LOOP;

    ---------------------------------------------------------------
    -- U14 / U15：legacy 表上不該冒出任何 mock_exam_ 物件
    ---------------------------------------------------------------
    SELECT count(*) INTO v_n
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND NOT t.tgisinternal
       AND c.relname IN ('exam_records','exam_types') AND t.tgname LIKE 'mock\_exam\_%';
    res := res || ('U14' || US || CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END || US
                   || 'legacy 表上沒有 mock_exam_ trigger（找到 ' || v_n || ' 個）');

    SELECT count(*) INTO v_n
      FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public' AND t.relname IN ('exam_records','exam_types')
       AND c.conname LIKE 'mock\_exam\_%';
    res := res || ('U15' || US || CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END || US
                   || 'legacy 表上沒有 mock_exam_ 約束（找到 ' || v_n || ' 個）');

    ---------------------------------------------------------------
    -- U16–U18：mock 這邊確實硬化完成
    -- 「legacy 沒被動到」如果是因為 migration 根本沒生效，那不算通過。
    ---------------------------------------------------------------
    res := res || ('U16' || US
      || CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema = 'public' AND table_name = 'exam_user_answers'
                             AND column_name = 'grading_status')
              THEN 'PASS' ELSE 'FAIL' END || US
      || 'mock 的硬化確實有套用（不是被 IF NOT EXISTS 靜默略過）');

    SELECT count(*) INTO v_n
      FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public' AND t.relname = 'exam_user_answers'
       AND c.conname LIKE 'mock\_exam\_%';
    res := res || ('U17' || US || CASE WHEN v_n = 11 THEN 'PASS' ELSE 'FAIL' END || US
                   || 'mock 的 11 條新約束都在自己的表上（實得 ' || v_n || '）');

    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'auto_grade_choice_answer';
    res := res || ('U18' || US || CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END || US
                   || '舊的判分函式已移除，不會留下兩套判分邏輯');

    ---------------------------------------------------------------
    -- 用完就刪，不在 staging 留下自己的殘骸
    ---------------------------------------------------------------
    DROP TABLE public.mock_exam_coexist_baseline;
    res := res || ('CLEANUP' || US || 'INFO' || US || '已刪除 public.mock_exam_coexist_baseline');
  END IF;

  FOR i IN 1 .. coalesce(array_length(res, 1), 0) LOOP
    INSERT INTO coexist_results
      VALUES (i, split_part(res[i], US, 1), split_part(res[i], US, 2), split_part(res[i], US, 3));
  END LOOP;

  INSERT INTO coexist_results
  SELECT coalesce(max(seq), 0) + 1, 'PHASE', phase,
         CASE WHEN phase = 'BASELINE'
              THEN '這是第 1 次執行（拍照）。套用 migration 後請再跑一次本檔。'
              ELSE '這是第 2 次執行（比對）。' END
  FROM coexist_results;
END $outer$;

INSERT INTO coexist_results
SELECT coalesce(max(seq), 0) + 1, 'TOTAL',
       CASE WHEN count(*) FILTER (WHERE result = 'FAIL') = 0 THEN 'PASS' ELSE 'FAIL' END,
       count(*) FILTER (WHERE result = 'PASS') || ' 項通過、'
       || count(*) FILTER (WHERE result = 'FAIL') || ' 項失敗'
FROM coexist_results;

SELECT seq, id, result, detail FROM coexist_results ORDER BY seq;
