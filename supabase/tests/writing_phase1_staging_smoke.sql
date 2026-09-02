-- =====================================================
-- Phase 1 部署後煙霧測試（資料層 A–H、O）
-- 純 SQL，可直接整段貼進 Supabase SQL Editor 執行
--
-- ⚠️ 這個檔案刻意不使用 psql 的反斜線指令（\echo、\set、\ir），
--    也不依賴 RAISE NOTICE —— Supabase SQL Editor 送出的是純 SQL，
--    而且不會顯示 NOTICE 訊息。結果改用最後一段 SELECT 以表格回傳。
--
-- 執行順序：
--   1. writing_phase1_preflight.sql   （唯讀）
--   2. create_writing_submissions.sql
--   3. create_writing_texts.sql
--   4. 本檔
--
-- 判讀：最後的表格中每一列 result 都應該是 PASS。
--       出現任何 FAIL 就中止，不要往正式環境推。
--
-- 測試資料：所有測試作文的標題都是 __SMOKE_TEST__，腳本結束前會自行刪除。
--       若因為意外中斷而殘留，手動清理：
--         DELETE FROM public.writing_submissions WHERE title = '__SMOKE_TEST__';
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS writing_smoke_results (
  ord INT, step TEXT, result TEXT, detail TEXT
);
TRUNCATE writing_smoke_results;
-- 測試過程會切換到 authenticated / anon，temp table 必須讓它們寫得進去
GRANT ALL ON writing_smoke_results TO authenticated, anon;

DO $outer$
DECLARE
  v_a       UUID;
  v_b       UUID;
  v_essay   UUID;
  v_cnt     INT;
  v_txt     TEXT;
BEGIN
  ------------------------------------------------------------------
  -- A：資料表與函式存在
  ------------------------------------------------------------------
  INSERT INTO writing_smoke_results VALUES (11, 'A1 writing_submissions 存在',
    CASE WHEN to_regclass('public.writing_submissions') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END, '');
  INSERT INTO writing_smoke_results VALUES (12, 'A2 writing_texts 存在',
    CASE WHEN to_regclass('public.writing_texts') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END, '');
  INSERT INTO writing_smoke_results VALUES (13, 'A3 submit_writing_essay() 存在',
    CASE WHEN to_regprocedure('public.submit_writing_essay(text,text,text,date,text)') IS NOT NULL
         THEN 'PASS' ELSE 'FAIL' END, '');

  ------------------------------------------------------------------
  -- B / C / O：iLearn 既有物件未被碰到
  ------------------------------------------------------------------
  INSERT INTO writing_smoke_results VALUES (21, 'B1 essay_submissions 上沒有 Writing: 政策',
    CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname='public' AND tablename='essay_submissions'
                            AND policyname LIKE 'Writing:%')
         THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN to_regclass('public.essay_submissions') IS NULL
         THEN '此專案沒有 iLearn 的 essay_submissions' ELSE '' END);

  -- 用 catalog join 比對名稱，不用 ::regclass —— 該轉型在表不存在時
  -- 會在規劃階段報錯，OR 的短路救不了它。
  INSERT INTO writing_smoke_results VALUES (22, 'C1 essay_submissions 上沒有寫作系統的 trigger',
    CASE WHEN NOT EXISTS (SELECT 1 FROM pg_trigger t
                          JOIN pg_class c ON c.oid = t.tgrelid
                          JOIN pg_namespace n ON n.oid = c.relnamespace
                          WHERE n.nspname='public' AND c.relname='essay_submissions'
                            AND NOT t.tgisinternal AND t.tgname LIKE '%writing%')
         THEN 'PASS' ELSE 'FAIL' END, '');

  INSERT INTO writing_smoke_results VALUES (23, 'C2 essay_submissions 上沒有寫作系統的索引',
    CASE WHEN NOT EXISTS (SELECT 1 FROM pg_indexes
                          WHERE schemaname='public' AND tablename='essay_submissions'
                            AND indexname LIKE 'idx_writing%')
         THEN 'PASS' ELSE 'FAIL' END, '');

  SELECT count(*) INTO v_cnt FROM pg_policies
   WHERE schemaname='public' AND tablename IN ('writing_submissions','writing_texts');
  INSERT INTO writing_smoke_results VALUES (24, 'O1 寫作系統的 8 條政策都在自己的表上',
    CASE WHEN v_cnt = 8 THEN 'PASS' ELSE 'FAIL' END, '實際 ' || v_cnt || ' 條');

  ------------------------------------------------------------------
  -- 取得兩個測試身分
  ------------------------------------------------------------------
  SELECT id INTO v_a FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_b FROM auth.users ORDER BY created_at OFFSET 1 LIMIT 1;

  IF v_a IS NULL THEN
    INSERT INTO writing_smoke_results VALUES (30, 'D–H 資料路徑測試', 'SKIP',
      'auth.users 沒有任何使用者，無法測試 RLS 與送出流程');
    RETURN;
  END IF;

  ------------------------------------------------------------------
  -- D：submit_writing_essay() 可用
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    v_essay := public.submit_writing_essay(
      '__SMOKE_TEST__', E'第一段。\n\n第二段。', '煙霧測試題目', CURRENT_DATE, '測試備註');
    INSERT INTO writing_smoke_results VALUES (31, 'D1 submit_writing_essay() 送出成功', 'PASS', '');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO writing_smoke_results VALUES (31, 'D1 submit_writing_essay() 送出成功', 'FAIL', SQLERRM);
  END;

  IF v_essay IS NOT NULL THEN
    SELECT count(*) INTO v_cnt FROM public.writing_submissions
     WHERE id = v_essay AND status = 'SUBMITTED' AND submitted_at IS NOT NULL;
    INSERT INTO writing_smoke_results VALUES (32, 'D2 狀態為 SUBMITTED 且有時間戳',
      CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END, '');

    SELECT content INTO v_txt FROM public.writing_texts
     WHERE essay_id = v_essay AND provenance = 'TYPED';
    INSERT INTO writing_smoke_results VALUES (33, 'D3 產生一筆 TYPED 正規文字，且內容未被 trim',
      CASE WHEN v_txt = E'第一段。\n\n第二段。' THEN 'PASS' ELSE 'FAIL' END, '');

    SELECT count(*) INTO v_cnt FROM public.writing_texts
     WHERE essay_id = v_essay AND char_count = char_length(content);
    INSERT INTO writing_smoke_results VALUES (34, 'D4 char_count 由資料庫計算',
      CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END, '');

    ------------------------------------------------------------------
    -- E：學生 A 讀不到學生 B
    ------------------------------------------------------------------
    IF v_b IS NULL THEN
      INSERT INTO writing_smoke_results VALUES (41, 'E 跨學生隔離', 'SKIP',
        'auth.users 只有一位使用者，無法測試跨學生隔離');
    ELSE
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
      SELECT count(*) INTO v_cnt FROM public.writing_submissions WHERE id = v_essay;
      INSERT INTO writing_smoke_results VALUES (41, 'E1 另一位學生讀不到這篇作文',
        CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END, '');
      SELECT count(*) INTO v_cnt FROM public.writing_texts WHERE essay_id = v_essay;
      INSERT INTO writing_smoke_results VALUES (42, 'E2 另一位學生讀不到正規文字',
        CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END, '');
    END IF;

    ------------------------------------------------------------------
    -- F：未登入讀不到
    ------------------------------------------------------------------
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM set_config('request.jwt.claims', '', true);
    BEGIN
      SELECT count(*) INTO v_cnt FROM public.writing_submissions;
      INSERT INTO writing_smoke_results VALUES (51, 'F1 anon 讀不到任何作文',
        CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END, '');
    EXCEPTION WHEN insufficient_privilege THEN
      INSERT INTO writing_smoke_results VALUES (51, 'F1 anon 讀不到任何作文', 'PASS',
        'anon 連 SELECT 權限都沒有（更嚴格）');
    END;
    BEGIN
      SELECT count(*) INTO v_cnt FROM public.writing_texts;
      INSERT INTO writing_smoke_results VALUES (52, 'F2 anon 讀不到任何正規文字',
        CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END, '');
    EXCEPTION WHEN insufficient_privilege THEN
      INSERT INTO writing_smoke_results VALUES (52, 'F2 anon 讀不到任何正規文字', 'PASS',
        'anon 連 SELECT 權限都沒有（更嚴格）');
    END;

    ------------------------------------------------------------------
    -- G：已送出的作文不可修改（RLS 一層、trigger 一層）
    ------------------------------------------------------------------
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

    UPDATE public.writing_submissions SET title = '偷改' WHERE id = v_essay;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    INSERT INTO writing_smoke_results VALUES (61, 'G1 RLS：已送出的作文更新影響 0 列',
      CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END, '影響 ' || v_cnt || ' 列');

    EXECUTE 'RESET ROLE';
    BEGIN
      UPDATE public.writing_submissions SET title = '繞過 RLS' WHERE id = v_essay;
      INSERT INTO writing_smoke_results VALUES (62, 'G2 trigger：繞過 RLS 仍不可修改', 'FAIL',
        '預期要失敗，但成功了');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO writing_smoke_results VALUES (62, 'G2 trigger：繞過 RLS 仍不可修改', 'PASS',
        left(SQLERRM, 80));
    END;

    ------------------------------------------------------------------
    -- H：writing_texts append-only
    ------------------------------------------------------------------
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

    UPDATE public.writing_texts SET content = '改' WHERE essay_id = v_essay;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    INSERT INTO writing_smoke_results VALUES (71, 'H1 RLS：學生 UPDATE writing_texts 影響 0 列',
      CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END, '影響 ' || v_cnt || ' 列');

    EXECUTE 'RESET ROLE';
    BEGIN
      UPDATE public.writing_texts SET content = '繞過 RLS' WHERE essay_id = v_essay;
      INSERT INTO writing_smoke_results VALUES (72, 'H2 trigger：繞過 RLS 仍不可修改', 'FAIL',
        '預期要失敗，但成功了');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO writing_smoke_results VALUES (72, 'H2 trigger：繞過 RLS 仍不可修改', 'PASS',
        left(SQLERRM, 80));
    END;

    ------------------------------------------------------------------
    -- Phase 1 的結構性限制
    ------------------------------------------------------------------
    BEGIN
      INSERT INTO public.writing_texts (essay_id, content, provenance)
      VALUES (v_essay, 'ocr text', 'OCR');
      INSERT INTO writing_smoke_results VALUES (81, 'P1 不可寫入 provenance=OCR', 'FAIL',
        '預期要失敗，但成功了');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO writing_smoke_results VALUES (81, 'P1 不可寫入 provenance=OCR', 'PASS',
        left(SQLERRM, 80));
    END;

    BEGIN
      INSERT INTO public.writing_submissions (student_id, submission_type, title)
      VALUES (v_a, 'image', '__SMOKE_TEST__');
      INSERT INTO writing_smoke_results VALUES (82, 'P2 不可建立 submission_type=image', 'FAIL',
        '預期要失敗，但成功了');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO writing_smoke_results VALUES (82, 'P2 不可建立 submission_type=image', 'PASS',
        left(SQLERRM, 80));
    END;
  END IF;

  ------------------------------------------------------------------
  -- 清理
  ------------------------------------------------------------------
  EXECUTE 'RESET ROLE';
  DELETE FROM public.writing_submissions WHERE title = '__SMOKE_TEST__';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  INSERT INTO writing_smoke_results VALUES (91, '清理：測試作文已刪除', 'PASS',
    '刪除 ' || v_cnt || ' 篇');

  SELECT count(*) INTO v_cnt FROM public.writing_texts WHERE essay_id = v_essay;
  INSERT INTO writing_smoke_results VALUES (92, '清理：正規文字一併 cascade 刪除',
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END, '');

EXCEPTION WHEN OTHERS THEN
  -- 任何沒被個別區塊接住的錯誤：一定要先把角色與測試資料還原
  EXECUTE 'RESET ROLE';
  DELETE FROM public.writing_submissions WHERE title = '__SMOKE_TEST__';
  INSERT INTO writing_smoke_results VALUES (99, '未預期錯誤', 'FAIL', SQLERRM);
END
$outer$;

SELECT step, result, detail
FROM writing_smoke_results
ORDER BY ord;
