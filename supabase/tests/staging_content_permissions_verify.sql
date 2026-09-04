-- =====================================================
-- STAGING 驗證：內容權限硬化 + 管理員讀取路徑
--
-- 目標專案：cwymrzcovgobfqxtithn（gsat-staging）
--
-- ✅ 純 SQL，可直接貼進 Supabase SQL Editor（沒有 \ir、\echo、\set）。
-- ✅ 所有測試寫入都在一個 PL/pgSQL 子交易裡，結束前刻意 RAISE 讓它整個回滾。
-- ✅ 結果累積在暫存表，最後以 SELECT 呈現。
-- ✅ 全部以真實角色（anon / authenticated / service_role）執行，
--    不透過應用程式碼——「前端沒顯示」不算安全措施。
--
-- 前置條件：bootstrap_is_admin → create_mock_content_admin_read_rpc
--           → harden_mock_exam_content_permissions 都已套用。
--
-- 需要 auth.users 裡有管理員帳號（nonstopjazz@gmail.com）與至少一個其他帳號。
-- 缺少時會在第 1 列回報 SETUP / STOP 並且什麼都不做。
-- =====================================================

DROP TABLE IF EXISTS pg_temp.cv;
CREATE TEMP TABLE cv (seq int, id text, result text, detail text);

DO $outer$
DECLARE
  US  constant text := chr(31);
  res text[] := ARRAY[]::text[];
  v_admin uuid;
  v_stu   uuid;
  v_ok    boolean;
  v_msg   text;
  v_txt   text;
  v_case  text[];
  v_cases text[][];
  i       int;

  k_exam constant text := 'content-verify-tmp';

BEGIN
  SELECT id INTO v_admin FROM auth.users WHERE email = 'nonstopjazz@gmail.com';
  SELECT id INTO v_stu   FROM auth.users
   WHERE email IS DISTINCT FROM 'nonstopjazz@gmail.com' ORDER BY created_at, id LIMIT 1;

  IF v_admin IS NULL OR v_stu IS NULL THEN
    INSERT INTO cv VALUES (1, 'SETUP', 'STOP',
      'auth.users 需要管理員帳號 nonstopjazz@gmail.com 與至少一個其他帳號；本檔不建立帳號');
    RETURN;
  END IF;

  BEGIN
    ---------------------------------------------------------------
    -- 佈置：一份 published 考卷，含各題型與教師欄位
    ---------------------------------------------------------------
    INSERT INTO exams (id, title, year, status, notes)
      VALUES (k_exam, 'content verify', 2026, 'published', '教師備註不該外流');
    INSERT INTO question_groups (id, exam_id, group_type, group_order, content, content_translation)
      VALUES (k_exam || '-g1', k_exam, 'cloze', 1, 'A passage.', '這段的中譯');
    INSERT INTO group_questions (group_id, question_number, question_text,
                                 option_a, option_b, option_c, option_d,
                                 correct_answer, explanation, grammar_large)
      VALUES (k_exam || '-g1', 1, 'blank 1', 'a','b','c','d', 'C', '因為 C', '時態與語態');
    INSERT INTO vocabulary_questions (exam_id, question_number, question_text,
                                      option_a, option_b, option_c, option_d,
                                      correct_answer, explanation)
      VALUES (k_exam, 1, 'vocab q', 'a','b','c','d', 'B', '因為 B');
    INSERT INTO translation_questions (exam_id, question_number, chinese_text,
                                       reference_answer, scoring_criteria)
      VALUES (k_exam, '1', '中文句', 'THE REFERENCE ANSWER', '逐項給分');
    INSERT INTO essay_questions (exam_id, question_number, prompt,
                                 sample_essay, scoring_criteria, writing_tips)
      VALUES (k_exam, '1', 'Write.', 'SAMPLE ESSAY', '評分標準', '寫作提示');

    ---------------------------------------------------------------
    -- A. anon 什麼都拿不到
    ---------------------------------------------------------------
    v_cases := ARRAY[
      ARRAY['A1', 'SELECT count(*) FROM exams',                'anon 讀不到 exams'],
      ARRAY['A2', 'SELECT count(*) FROM vocabulary_questions', 'anon 讀不到題目'],
      ARRAY['A3', 'INSERT INTO exams (id,title,year) VALUES (''anon-evil'',''x'',2026)', 'anon 不可 INSERT'],
      ARRAY['A4', 'TRUNCATE vocabulary_questions',             'anon 不可 TRUNCATE'],
      ARRAY['A5', 'SELECT mock_content_admin_fetch_exam(''' || k_exam || ''')', 'anon 不可呼叫 admin RPC']
    ];
    FOREACH v_case SLICE 1 IN ARRAY v_cases LOOP
      BEGIN
        EXECUTE 'SET LOCAL ROLE anon';
        PERFORM set_config('request.jwt.claims', '', true);
        EXECUTE v_case[2];
        v_ok := false; v_msg := '竟然成功了';
      EXCEPTION WHEN insufficient_privilege THEN
        v_ok := true;  v_msg := left(SQLERRM, 70);
      WHEN OTHERS THEN
        v_ok := false; v_msg := '被擋，但不是權限錯誤：' || left(SQLERRM, 60);
      END;
      RESET ROLE;
      res := res || (v_case[1] || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                     || v_case[3] || '｜' || v_msg);
    END LOOP;

    ---------------------------------------------------------------
    -- B. 學生讀得到題目，讀不到答案鍵
    ---------------------------------------------------------------
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_stu::text, 'role', 'authenticated')::text, true);
    SELECT question_text INTO v_txt FROM vocabulary_questions WHERE exam_id = k_exam;
    RESET ROLE;
    res := res || ('B1' || US || CASE WHEN v_txt = 'vocab q' THEN 'PASS' ELSE 'FAIL' END || US
                   || '學生讀得到 published 題目本文');

    v_cases := ARRAY[
      ARRAY['B2', 'SELECT correct_answer FROM vocabulary_questions',      '學生讀不到單字題答案鍵'],
      ARRAY['B3', 'SELECT correct_answer FROM group_questions',           '學生讀不到題組答案鍵'],
      ARRAY['B4', 'SELECT reference_answer FROM translation_questions',   '學生讀不到翻譯參考答案'],
      ARRAY['B5', 'SELECT scoring_criteria FROM translation_questions',   '學生讀不到翻譯給分標準'],
      ARRAY['B6', 'SELECT sample_essay FROM essay_questions',             '學生讀不到作文範文'],
      ARRAY['B7', 'SELECT scoring_criteria FROM essay_questions',         '學生讀不到作文評分標準'],
      ARRAY['B8', 'SELECT writing_tips FROM essay_questions',             '學生讀不到寫作提示'],
      ARRAY['B9', 'SELECT explanation FROM vocabulary_questions',         '學生讀不到詳解'],
      ARRAY['B10','SELECT grammar_large FROM group_questions',            '學生讀不到 grammar 標籤'],
      ARRAY['B11','SELECT content_translation FROM question_groups',      '學生讀不到題組中譯'],
      ARRAY['B12','SELECT notes FROM exams',                              '學生讀不到 exams.notes'],
      ARRAY['B13','SELECT * FROM vocabulary_questions',                   'SELECT * 直接被擋'],
      ARRAY['B14','TRUNCATE essay_questions',                             '學生不可 TRUNCATE'],
      ARRAY['B15','SELECT mock_content_admin_fetch_exam(''' || k_exam || ''')', '學生不可呼叫 admin RPC']
    ];
    FOREACH v_case SLICE 1 IN ARRAY v_cases LOOP
      BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        PERFORM set_config('request.jwt.claims',
          json_build_object('sub', v_stu::text, 'role', 'authenticated')::text, true);
        EXECUTE v_case[2];
        v_ok := false; v_msg := '竟然成功了';
      EXCEPTION WHEN insufficient_privilege THEN
        v_ok := true;  v_msg := left(SQLERRM, 70);
      WHEN OTHERS THEN
        v_ok := false; v_msg := '被擋，但不是權限錯誤：' || left(SQLERRM, 60);
      END;
      RESET ROLE;
      res := res || (v_case[1] || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                     || v_case[3] || '｜' || v_msg);
    END LOOP;

    -- 學生寫入：不報錯但影響 0 列
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_stu::text, 'role', 'authenticated')::text, true);
    UPDATE vocabulary_questions SET question_text = 'hacked' WHERE exam_id = k_exam;
    GET DIAGNOSTICS i = ROW_COUNT;
    RESET ROLE;
    res := res || ('B16' || US || CASE WHEN i = 0 THEN 'PASS' ELSE 'FAIL' END || US
                   || '學生 UPDATE 題目影響 ' || i || ' 列（預期 0）');

    ---------------------------------------------------------------
    -- C. 管理員：RPC 拿得到完整內容，直接查表仍受欄位限制
    ---------------------------------------------------------------
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    SELECT coalesce(mock_content_admin_fetch_exam(k_exam)
             ->'vocabulary_questions'->0->>'correct_answer', '(空)') INTO v_txt;
    RESET ROLE;
    res := res || ('C1' || US || CASE WHEN v_txt = 'B' THEN 'PASS' ELSE 'FAIL' END || US
                   || 'admin 透過 RPC 取得 correct_answer（實得 ' || v_txt || '）');

    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    SELECT coalesce(mock_content_admin_fetch_exam(k_exam)
             ->'essay_questions'->0->>'sample_essay', '(空)') INTO v_txt;
    RESET ROLE;
    res := res || ('C2' || US || CASE WHEN v_txt = 'SAMPLE ESSAY' THEN 'PASS' ELSE 'FAIL' END || US
                   || 'admin 透過 RPC 取得 sample_essay');

    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    SELECT coalesce(mock_content_admin_fetch_exam(k_exam)->>'notes', '(空)') INTO v_txt;
    RESET ROLE;
    res := res || ('C3' || US || CASE WHEN v_txt = '教師備註不該外流' THEN 'PASS' ELSE 'FAIL' END || US
                   || 'admin 透過 RPC 取得 exams.notes');

    -- admin 建立 draft 後可以立刻讀回（設計階段漏掉、由測試抓出來的那條路徑）
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    INSERT INTO exams (id, title, year, status, notes)
      VALUES (k_exam || '-d', 'admin draft', 2026, 'draft', '草稿備註');
    GET DIAGNOSTICS i = ROW_COUNT;
    SELECT coalesce(mock_content_admin_fetch_exam(k_exam || '-d')->>'notes', '(空)') INTO v_txt;
    RESET ROLE;
    res := res || ('C4' || US || CASE WHEN i = 1 AND v_txt = '草稿備註' THEN 'PASS' ELSE 'FAIL' END || US
                   || 'admin 建立 draft 後可以立刻讀回（含 notes）');

    -- admin 改答案鍵
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    UPDATE group_questions SET correct_answer = 'A' WHERE group_id = k_exam || '-g1';
    GET DIAGNOSTICS i = ROW_COUNT;
    SELECT coalesce(mock_content_admin_fetch_exam(k_exam)
             ->'question_groups'->0->'group_questions'->0->>'correct_answer', '(空)') INTO v_txt;
    RESET ROLE;
    res := res || ('C5' || US || CASE WHEN i = 1 AND v_txt = 'A' THEN 'PASS' ELSE 'FAIL' END || US
                   || 'admin 可以修改答案鍵並立刻讀回');

    -- admin 直接查表仍受欄位級限制（證明 RPC 不是把欄位權限放寬）
    BEGIN
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SELECT correct_answer FROM vocabulary_questions';
      v_ok := false; v_msg := '竟然成功了';
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true; v_msg := left(SQLERRM, 60);
    WHEN OTHERS THEN
      v_ok := false; v_msg := left(SQLERRM, 60);
    END;
    RESET ROLE;
    res := res || ('C6' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || 'admin 直接查表仍讀不到答案鍵（欄位級權限沒有被 RPC 放寬）｜' || v_msg);

    ---------------------------------------------------------------
    -- D. service_role 不受影響
    ---------------------------------------------------------------
    EXECUTE 'SET LOCAL ROLE service_role';
    SELECT correct_answer INTO v_txt FROM vocabulary_questions WHERE exam_id = k_exam;
    RESET ROLE;
    res := res || ('D1' || US || CASE WHEN v_txt = 'B' THEN 'PASS' ELSE 'FAIL' END || US
                   || 'service_role 仍讀得到答案鍵');

    ---------------------------------------------------------------
    -- 刻意回滾
    ---------------------------------------------------------------
    RAISE EXCEPTION '__ROLLBACK_SCENARIO__';

  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM <> '__ROLLBACK_SCENARIO__' THEN
      res := res || ('FATAL' || US || 'FAIL' || US
                     || '測試中途中斷（前面結果仍有效）：' || SQLSTATE || ' ' || left(SQLERRM, 120));
    END IF;
  END;

  FOR i IN 1 .. coalesce(array_length(res, 1), 0) LOOP
    INSERT INTO cv VALUES (i, split_part(res[i], US, 1), split_part(res[i], US, 2), split_part(res[i], US, 3));
  END LOOP;
END $outer$;

-- 靜態授權矩陣
INSERT INTO cv
SELECT coalesce((SELECT max(seq) FROM cv), 0) + 1, 'M1',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'anon 在六張內容表上的表級授權 = ' || count(*) || '（預期 0）'
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'anon'
  AND table_name IN ('exams','question_groups','group_questions',
                     'vocabulary_questions','translation_questions','essay_questions');

INSERT INTO cv
SELECT coalesce((SELECT max(seq) FROM cv), 0) + 1, 'M2',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'authenticated 的 TRUNCATE/REFERENCES/TRIGGER = ' || count(*) || '（預期 0）'
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'authenticated'
  AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')
  AND table_name IN ('exams','question_groups','group_questions',
                     'vocabulary_questions','translation_questions','essay_questions');

INSERT INTO cv
SELECT coalesce((SELECT max(seq) FROM cv), 0) + 1, 'M3',
       CASE WHEN count(*) = 24 THEN 'PASS' ELSE 'FAIL' END,
       'mock_content_ 政策 ' || count(*) || ' 條（預期 24）'
FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'mock\_content\_%';

INSERT INTO cv
SELECT coalesce((SELECT max(seq) FROM cv), 0) + 1, 'M4',
       CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END,
       'mock_content_admin_ RPC ' || count(*) || ' 個，且都是 SECURITY DEFINER + 鎖定 search_path'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'mock\_content\_admin\_%'
  AND p.prosecdef AND coalesce(array_to_string(p.proconfig, ','), '') = 'search_path=""';

-- 回滾證明
DO $proof$
DECLARE v_t text; v_n bigint; v_total bigint := 0;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['exams','question_groups','group_questions',
      'vocabulary_questions','translation_questions','essay_questions'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
    v_total := v_total + v_n;
  END LOOP;
  INSERT INTO cv VALUES ((SELECT max(seq) FROM cv) + 1, 'ROLLBACK',
    CASE WHEN v_total = 0 THEN 'PASS' ELSE 'CHECK' END,
    '六張內容表測試後共 ' || v_total || ' 列'
    || CASE WHEN v_total = 0 THEN '（測試資料已全部回滾）'
            ELSE '（若 staging 已有考題內容，這裡不會是 0；請確認沒有 content-verify-tmp 這份考卷）' END);
END $proof$;

INSERT INTO cv
SELECT coalesce((SELECT max(seq) FROM cv), 0) + 1, 'TOTAL',
       CASE WHEN count(*) FILTER (WHERE result = 'FAIL') = 0 THEN 'PASS' ELSE 'FAIL' END,
       count(*) FILTER (WHERE result = 'PASS') || ' 項通過、'
       || count(*) FILTER (WHERE result = 'FAIL') || ' 項失敗'
FROM cv;

SELECT seq, id, result, detail FROM cv ORDER BY seq;
