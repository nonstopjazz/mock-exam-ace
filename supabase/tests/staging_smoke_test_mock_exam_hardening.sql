-- =====================================================
-- STAGING 冒煙測試：mock 模考 schema 硬化（migration 套用「之後」執行）
--
-- 目標專案：cwymrzcovgobfqxtithn（gsat-staging）
--
-- ✅ 純 SQL，可直接貼進 Supabase SQL Editor（沒有 \ir、\echo、\set）。
-- ✅ 不內嵌、也不自動執行 migration。套用 migration 是獨立的手動步驟。
-- ✅ 所有測試寫入都包在一個 PL/pgSQL 子交易裡，結束前刻意 RAISE 讓它整個
--    回滾 —— 效果等同 BEGIN … ROLLBACK，但 PL/pgSQL 變數不受交易回滾影響，
--    所以判定結果活得下來（真的 BEGIN/ROLLBACK 會把結果一起丟掉）。
-- ✅ 結果累積在暫存表，最後以 SELECT 呈現；SQL Editor 不顯示 RAISE NOTICE。
-- ✅ 不寫入 auth.users —— 借用兩個既有帳號當測試身分，測完全部回滾。
--
-- 執行順序：
--   1. staging_preflight_mock_exam_hardening.sql      → 必須 GO
--   2. supabase/migrations/harden_mock_exam_answers.sql（手動貼上執行）
--   3. 本檔
--   4. staging_coexistence_check.sql（migration 前後各跑一次）
--
-- 重點放在真正的風險：學生能不能自己給分、未批改會不會被當成零分、
-- 同一題會不會變成多列、翻譯作文會不會被記成「答錯」。
-- 快樂路徑通過並不能證明什麼。
-- =====================================================

DROP TABLE IF EXISTS pg_temp.smoke_results;
CREATE TEMP TABLE smoke_results (seq int, id text, result text, detail text);

DO $outer$
DECLARE
  US  constant text := chr(31);   -- 欄位分隔字元，不會出現在錯誤訊息裡
  res text[] := ARRAY[]::text[];

  v_u1 uuid;
  v_u2 uuid;

  -- 固定識別碼：全部隨子交易回滾，不會留在資料庫
  -- 注意：正式環境的 exams.id 與 question_groups.id 是 text，不是 uuid。
  k_exam  constant text := 'hardening-smoke-test';
  k_grp   constant text := 'hardening-smoke-test-g1';
  k_gq1   constant uuid := '71000000-0000-0000-0000-000000000001';
  k_gq2   constant uuid := '71000000-0000-0000-0000-000000000002';
  k_vq1   constant uuid := '72000000-0000-0000-0000-000000000001';
  k_tq1   constant uuid := '73000000-0000-0000-0000-000000000001';
  k_eq1   constant uuid := '74000000-0000-0000-0000-000000000001';
  k_att_a constant uuid := 'b0000000-0000-0000-0000-00000000000a';
  k_att_b constant uuid := 'b0000000-0000-0000-0000-00000000000b';

  v_ok    boolean;
  v_msg   text;
  v_n     bigint;
  v_before timestamptz;
  v_case  text[];
  v_cases text[][];
  i       int;
BEGIN
  SELECT id INTO v_u1 FROM auth.users ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_u2 FROM auth.users ORDER BY created_at, id OFFSET 1 LIMIT 1;

  IF v_u1 IS NULL OR v_u2 IS NULL THEN
    INSERT INTO smoke_results VALUES
      (1, 'SETUP', 'STOP', 'auth.users 至少需要兩個帳號才能測跨學生隔離；本測試不建立帳號');
    RETURN;
  END IF;

  -- ═══ 子交易開始：以下所有資料寫入最後都會被回滾 ═══
  BEGIN
    ---------------------------------------------------------------
    -- 佈置：刻意用 draft 考試
    -- 證明自動判分不依賴學生的閱讀權限（RLS 只放行 published）
    ---------------------------------------------------------------
    INSERT INTO exams (id, title, year, status)
      VALUES (k_exam, 'hardening smoke test', 2026, 'draft');
    INSERT INTO question_groups (id, exam_id, title, group_type, group_order, content)
      VALUES (k_grp, k_exam, 'cloze', 'cloze', 1, 'A cloze passage.');
    INSERT INTO group_questions (id, group_id, question_number, correct_answer, score)
      VALUES (k_gq1, k_grp, 1, 'C', 2.5), (k_gq2, k_grp, 2, 'A', 2.5);
    INSERT INTO vocabulary_questions
           (id, exam_id, question_number, question_text,
            option_a, option_b, option_c, option_d, correct_answer, score)
      VALUES (k_vq1, k_exam, 1, 'Choose the best word.',
              'alpha', 'bravo', 'charlie', 'delta', 'B', 1.5);
    INSERT INTO translation_questions
           (id, exam_id, question_number, chinese_text, reference_answer, score)
      VALUES (k_tq1, k_exam, '1', '一個句子。', 'A sentence.', 4);
    INSERT INTO essay_questions (id, exam_id, question_number, prompt, score)
      VALUES (k_eq1, k_exam, '1', 'Write about a journey.', 20);
    INSERT INTO exam_attempts (id, user_id, exam_id, status) VALUES
      (k_att_a, v_u1, k_exam, 'in_progress'),
      (k_att_b, v_u2, k_exam, 'in_progress');

    ---------------------------------------------------------------
    -- A / B / F：客觀題自動判分
    ---------------------------------------------------------------
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);

    INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer, time_spent_seconds)
      VALUES (k_att_a, k_gq1, 'c', 30);
    INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer)
      VALUES (k_att_a, k_gq2, 'B');
    INSERT INTO exam_user_answers (attempt_id, vocabulary_question_id, user_answer)
      VALUES (k_att_a, k_vq1, 'B');

    RESET ROLE;

    SELECT grading_status = 'GRADED' AND is_correct AND score_earned = 2.5
           AND max_score = 2.5 AND grading_method = 'AUTO'
           AND graded_by IS NULL AND graded_at IS NOT NULL
      INTO v_ok FROM exam_user_answers WHERE group_question_id = k_gq1;
    res := res || ('A' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || '客觀題答對：GRADED / true / 滿分 / AUTO（且大小寫不敏感）');

    SELECT grading_status = 'GRADED' AND NOT is_correct AND score_earned = 0 AND max_score = 2.5
      INTO v_ok FROM exam_user_answers WHERE group_question_id = k_gq2;
    res := res || ('B' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || '客觀題答錯：GRADED / false / 0 分，但 max_score 仍記錄');

    SELECT max_score = 1.5 INTO v_ok FROM exam_user_answers WHERE vocabulary_question_id = k_vq1;
    res := res || ('F' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || 'max_score 快照題目配分');

    ---------------------------------------------------------------
    -- C / D / E：主觀題送出後維持 UNGRADED
    ---------------------------------------------------------------
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);
    INSERT INTO exam_user_answers (attempt_id, translation_question_id, user_answer)
      VALUES (k_att_a, k_tq1, 'My translation.');
    INSERT INTO exam_user_answers (attempt_id, essay_question_id, user_answer)
      VALUES (k_att_a, k_eq1, 'My essay body.');
    RESET ROLE;

    SELECT grading_status = 'UNGRADED' AND is_correct IS NULL AND score_earned IS NULL
           AND max_score IS NULL AND grading_method IS NULL AND graded_at IS NULL
      INTO v_ok FROM exam_user_answers WHERE translation_question_id = k_tq1;
    res := res || ('C' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || '翻譯題維持 UNGRADED，所有批改欄位為空');

    SELECT grading_status = 'UNGRADED' AND score_earned IS NULL
      INTO v_ok FROM exam_user_answers WHERE essay_question_id = k_eq1;
    res := res || ('D' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || '作文題維持 UNGRADED');

    SELECT count(*) = 0 INTO v_ok FROM exam_user_answers
      WHERE grading_status = 'UNGRADED' AND score_earned IS NOT NULL;
    res := res || ('E' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || '未批改的作答 score_earned 一律為 NULL，絕不是隱含的 0');

    ---------------------------------------------------------------
    -- G / H：一個 attempt 一道題目只有一列
    ---------------------------------------------------------------
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);
    INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer)
      VALUES (k_att_a, k_gq1, 'A')
      ON CONFLICT (attempt_id, question_id) DO UPDATE SET user_answer = EXCLUDED.user_answer;
    INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer)
      VALUES (k_att_a, k_gq1, 'C')
      ON CONFLICT (attempt_id, question_id) DO UPDATE SET user_answer = EXCLUDED.user_answer;
    RESET ROLE;

    SELECT count(*) = 1 INTO v_ok FROM exam_user_answers
      WHERE attempt_id = k_att_a AND group_question_id = k_gq1;
    res := res || ('G' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || '同一題重複儲存只有一列（onConflict = attempt_id,question_id）');

    SELECT user_answer = 'C' AND is_correct INTO v_ok
      FROM exam_user_answers WHERE group_question_id = k_gq1;
    res := res || ('G2' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || '改答案會就地重新判分');

    SELECT count(DISTINCT question_kind) = 4 INTO v_ok
      FROM exam_user_answers WHERE attempt_id = k_att_a;
    res := res || ('H' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || '四種題目 FK 型別都能正確走同一個唯一鍵');

    BEGIN
      INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer)
        VALUES (k_att_a, k_gq1, 'A');
      v_ok := false; v_msg := '竟然成功了';
    EXCEPTION WHEN unique_violation THEN
      v_ok := position('mock_exam_answers_one_per_question' IN SQLERRM) > 0;
      v_msg := left(SQLERRM, 120);
    WHEN OTHERS THEN
      v_ok := false; v_msg := left(SQLERRM, 120);
    END;
    res := res || ('H2' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || '不帶 ON CONFLICT 的重複插入被唯一約束擋下｜' || v_msg);

    ---------------------------------------------------------------
    -- I：學生可以改自己的作答內容
    ---------------------------------------------------------------
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);
    UPDATE exam_user_answers SET user_answer = 'A', time_spent_seconds = 99
      WHERE group_question_id = k_gq2;
    RESET ROLE;

    SELECT user_answer = 'A' AND time_spent_seconds = 99 AND is_correct INTO v_ok
      FROM exam_user_answers WHERE group_question_id = k_gq2;
    res := res || ('I' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || '學生可以修改 user_answer 與 time_spent_seconds（並重新判分）');

    ---------------------------------------------------------------
    -- J–M4：學生不可寫入任何批改欄位（欄位級權限）
    ---------------------------------------------------------------
    v_cases := ARRAY[
      ARRAY['J',  'is_correct = true',            '學生不可設定 is_correct'],
      ARRAY['K',  'score_earned = 99',           '學生不可設定 score_earned'],
      ARRAY['L',  'grading_method = ''TEACHER''', '學生不可設定 grading_method'],
      ARRAY['M',  'grading_status = ''GRADED''',  '學生不可設定 grading_status'],
      ARRAY['M2', 'max_score = 99',              '學生不可設定 max_score'],
      ARRAY['M3', 'graded_by = NULL',             '學生不可設定 graded_by'],
      ARRAY['M4', 'graded_at = now()',            '學生不可設定 graded_at']
    ];
    FOREACH v_case SLICE 1 IN ARRAY v_cases LOOP
      BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        PERFORM set_config('request.jwt.claims',
          json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);
        EXECUTE 'UPDATE exam_user_answers SET ' || v_case[2];
        v_ok := false; v_msg := '竟然成功了';
      EXCEPTION WHEN insufficient_privilege THEN
        v_ok := true;  v_msg := '欄位級權限擋下';
      WHEN OTHERS THEN
        v_ok := false; v_msg := '被擋下但原因不是欄位級權限：' || left(SQLERRM, 70);
      END;
      RESET ROLE;
      res := res || (v_case[1] || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                     || v_case[3] || '｜' || v_msg);
    END LOOP;

    ---------------------------------------------------------------
    -- N / O：學生不可自行給 attempt 打分或標記已批改
    ---------------------------------------------------------------
    BEGIN
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);
      UPDATE exam_attempts SET total_score = 100 WHERE id = k_att_a;
      v_ok := false; v_msg := '竟然成功了';
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;  v_msg := '欄位級權限擋下';
    WHEN OTHERS THEN
      v_ok := false; v_msg := left(SQLERRM, 90);
    END;
    RESET ROLE;
    res := res || ('N' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || '學生不可寫入 exam_attempts.total_score｜' || v_msg);

    BEGIN
      UPDATE exam_attempts SET status = 'graded' WHERE id = k_att_a;
      v_ok := false; v_msg := '竟然成功了';
    EXCEPTION WHEN OTHERS THEN
      v_ok := true;  v_msg := left(SQLERRM, 90);
    END;
    res := res || ('O' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || '不可自行把 attempt 標記為 graded（trigger，連 owner 也擋）｜' || v_msg);

    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);
    UPDATE exam_attempts SET status = 'submitted', submitted_at = now(), time_spent_seconds = 600
      WHERE id = k_att_a;
    RESET ROLE;
    SELECT status = 'submitted' INTO v_ok FROM exam_attempts WHERE id = k_att_a;
    res := res || ('O2' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || '學生仍然可以正常交卷（in_progress → submitted）');

    BEGIN
      UPDATE exam_attempts SET status = 'in_progress' WHERE id = k_att_a;
      v_ok := false; v_msg := '竟然成功了';
    EXCEPTION WHEN OTHERS THEN
      v_ok := true;  v_msg := left(SQLERRM, 90);
    END;
    res := res || ('O3' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || '已交卷不可退回 in_progress｜' || v_msg);

    ---------------------------------------------------------------
    -- P：跨學生隔離
    ---------------------------------------------------------------
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_u2::text, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_n FROM exam_user_answers WHERE attempt_id = k_att_a;
    RESET ROLE;
    res := res || ('P' || US || CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END || US
                   || '另一位學生讀不到別人的作答（看到 ' || v_n || ' 列）');

    ---------------------------------------------------------------
    -- Q / S / S2 / S3：語意約束（即使繞過 trigger 也擋得住）
    ---------------------------------------------------------------
    PERFORM set_config('app.mock_exam_grading', 'on', true);

    -- 每一項都指名「預期由哪一條約束擋下」。
    -- 只檢查「有被擋下」是不夠的：被別的約束擋下代表這一條其實沒被測到。
    v_cases := ARRAY[
      ARRAY['Q',
        format($f$INSERT INTO exam_user_answers (attempt_id, essay_question_id, user_answer,
                    grading_status, is_correct, score_earned, max_score, grading_method, graded_by, graded_at)
                  VALUES (%L,%L,'x','GRADED', true, 10, 20, 'TEACHER', %L, now())$f$, k_att_b, k_eq1, v_u1),
        '主觀題不可被記成 is_correct=true/false',
        'mock_exam_answers_verdict_objective_only'],
      ARRAY['S',
        format($f$INSERT INTO exam_user_answers (attempt_id, essay_question_id, user_answer,
                    grading_status, score_earned, max_score, grading_method, graded_at)
                  VALUES (%L,%L,'x','GRADED', 30, 20, 'AI', now())$f$, k_att_b, k_eq1),
        'score_earned 不可超過 max_score',
        'mock_exam_answers_score_bounds'],
      ARRAY['S2',
        format($f$INSERT INTO exam_user_answers (attempt_id, essay_question_id, user_answer,
                    grading_status, score_earned, max_score, grading_method, graded_by, graded_at)
                  VALUES (%L,%L,'x','GRADED', 10, 20, 'TEACHER', NULL, now())$f$, k_att_b, k_eq1),
        'TEACHER 批改必須具名',
        'mock_exam_answers_teacher_named'],
      ARRAY['S3',
        format($f$INSERT INTO exam_user_answers (attempt_id, essay_question_id, user_answer,
                    grading_status, score_earned, max_score)
                  VALUES (%L,%L,'x','UNGRADED', 0, 20)$f$, k_att_b, k_eq1),
        'UNGRADED 不可帶著分數（含 0）',
        'mock_exam_answers_ungraded_is_empty'],
      ARRAY['T1',
        format($f$INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer)
                  VALUES (%L,%L,'   ')$f$, k_att_b, k_gq1),
        '空白作答不可成為一列（未作答 = 沒有列）',
        'mock_exam_answers_user_answer_not_blank'],
      ARRAY['T2',
        format($f$INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer)
                  VALUES (%L,%L,NULL)$f$, k_att_b, k_gq1),
        'NULL 作答不可成為一列',
        'user_answer']
    ];
    FOREACH v_case SLICE 1 IN ARRAY v_cases LOOP
      BEGIN
        EXECUTE v_case[2];
        v_ok := false; v_msg := '竟然成功了';
      EXCEPTION WHEN OTHERS THEN
        v_ok := position(v_case[4] IN SQLERRM) > 0;
        v_msg := CASE WHEN v_ok THEN '由 ' || v_case[4] || ' 擋下'
                      ELSE '被擋下，但不是預期的 ' || v_case[4] || '：' || left(SQLERRM, 120) END;
      END;
      res := res || (v_case[1] || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                     || v_case[3] || '｜' || v_msg);
    END LOOP;

    PERFORM set_config('app.mock_exam_grading', 'off', true);

    ---------------------------------------------------------------
    -- R：已批改的客觀題不可缺少對錯判定（暫時關掉 trigger 才測得到）
    ---------------------------------------------------------------
    BEGIN
      ALTER TABLE exam_user_answers DISABLE TRIGGER mock_exam_trg_auto_grade;
      PERFORM set_config('app.mock_exam_grading', 'on', true);
      BEGIN
        EXECUTE format($f$INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer,
                            grading_status, is_correct, score_earned, max_score, grading_method, graded_at)
                          VALUES (%L,%L,'C','GRADED', NULL, 2.5, 2.5, 'AUTO', now())$f$, k_att_b, k_gq1);
        v_ok := false; v_msg := '竟然成功了';
      EXCEPTION WHEN OTHERS THEN
        v_ok := position('mock_exam_answers_objective_graded_has_verdict' IN SQLERRM) > 0;
        v_msg := CASE WHEN v_ok THEN '由 mock_exam_answers_objective_graded_has_verdict 擋下'
                      ELSE left(SQLERRM, 120) END;
      END;
      PERFORM set_config('app.mock_exam_grading', 'off', true);
      ALTER TABLE exam_user_answers ENABLE TRIGGER mock_exam_trg_auto_grade;
    EXCEPTION WHEN OTHERS THEN
      v_ok := false; v_msg := '無法暫停 trigger（需要 table owner 權限）：' || left(SQLERRM, 60);
    END;
    res := res || ('R' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || '已批改的客觀題不可缺少對錯判定｜' || v_msg);

    ---------------------------------------------------------------
    -- T3 / T4：清除作答 = 刪除該列，且交卷後不可再刪
    ---------------------------------------------------------------
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_u2::text, 'role', 'authenticated')::text, true);
    INSERT INTO exam_user_answers (attempt_id, group_question_id, user_answer)
      VALUES (k_att_b, k_gq1, 'A');
    DELETE FROM exam_user_answers WHERE attempt_id = k_att_b;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    res := res || ('T3' || US || CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END || US
                   || '學生可以刪除進行中 attempt 的作答（刪除 ' || v_n || ' 列）');

    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);
    DELETE FROM exam_user_answers WHERE attempt_id = k_att_a;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    res := res || ('T4' || US || CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END || US
                   || '已交卷後不可再刪除作答（影響 ' || v_n || ' 列）');

    ---------------------------------------------------------------
    -- X1 / X2：updated_at 確實被維護（硬化前這欄從來沒被更新過）
    ---------------------------------------------------------------
    SELECT count(*) = 0 INTO v_ok FROM exam_user_answers
      WHERE attempt_id = k_att_a AND updated_at IS NULL;
    res := res || ('X1' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US || 'updated_at 有值');

    -- 注意：整份測試跑在同一個交易裡，而 trigger 用的是 now()（交易開始時間），
    -- 所以無法像多交易的 psql 版那樣驗證「時間戳往前走」。
    -- 這裡改測更關鍵的一件事：呼叫端塞進來的 updated_at 會被 trigger 覆蓋掉。
    UPDATE exam_user_answers SET updated_at = now() - interval '1 day'
      WHERE group_question_id = k_gq2;
    SELECT updated_at, updated_at = now() INTO v_before, v_ok
      FROM exam_user_answers WHERE group_question_id = k_gq2;
    res := res || ('X2' || US || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || US
                   || 'updated_at 由 trigger 維護：呼叫端寫入的舊時間戳被覆蓋為 now()（實得 '
                   || v_before || '）');

    ---------------------------------------------------------------
    -- 刻意讓子交易整個回滾：測試資料一列都不留在 staging
    ---------------------------------------------------------------
    RAISE EXCEPTION '__ROLLBACK_SCENARIO__';

  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM <> '__ROLLBACK_SCENARIO__' THEN
      res := res || ('FATAL' || US || 'FAIL' || US
                     || '測試在中途中斷（前面的結果仍然有效）：' || SQLSTATE || ' ' || left(SQLERRM, 120));
    END IF;
  END;
  -- ═══ 子交易結束：上面所有資料寫入都已回滾 ═══

  FOR i IN 1 .. coalesce(array_length(res, 1), 0) LOOP
    INSERT INTO smoke_results
      VALUES (i, split_part(res[i], US, 1), split_part(res[i], US, 2), split_part(res[i], US, 3));
  END LOOP;
END $outer$;

-- ─────────────────────────────────────────────
-- 回滾證明：測試資料一列都不該留下
-- ─────────────────────────────────────────────
DO $proof$
DECLARE
  v_t text; v_n bigint; v_total bigint := 0; v_max int;
BEGIN
  SELECT coalesce(max(seq), 0) INTO v_max FROM smoke_results;
  FOREACH v_t IN ARRAY ARRAY[
    'exams','question_groups','group_questions','vocabulary_questions',
    'translation_questions','essay_questions','exam_attempts','exam_user_answers'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
    v_total := v_total + v_n;
  END LOOP;
  INSERT INTO smoke_results VALUES (
    v_max + 1, 'ROLLBACK',
    CASE WHEN v_total = 0 THEN 'PASS' ELSE 'CHECK' END,
    'mock 八張表測試後共 ' || v_total || ' 列'
      || CASE WHEN v_total = 0 THEN '（測試資料已全部回滾）'
              ELSE '（若 staging 本來就有考題內容，這裡不會是 0；請確認沒有 hardening smoke test 這份考卷）' END);
END $proof$;

-- ─────────────────────────────────────────────
-- 總結
-- ─────────────────────────────────────────────
INSERT INTO smoke_results
SELECT coalesce(max(seq), 0) + 1, 'TOTAL',
       CASE WHEN count(*) FILTER (WHERE result = 'FAIL') = 0 THEN 'PASS' ELSE 'FAIL' END,
       count(*) FILTER (WHERE result = 'PASS') || ' 項通過、'
       || count(*) FILTER (WHERE result = 'FAIL') || ' 項失敗'
FROM smoke_results;

SELECT seq, id, result, detail FROM smoke_results ORDER BY seq;
