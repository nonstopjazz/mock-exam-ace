-- =====================================================
-- Group B 驗證：Publish guard + 學生端 RPC
-- ✍️ 【會寫入】但會自己清乾淨：所有 fixture 的 passage_id 以 ZZ-VERIFY- 開頭，
--    腳本最後一律刪除（ON DELETE CASCADE 會帶走題目、答案、session、作答）。
--    ⚠️ 只在 staging 執行。
--
-- 執行時機：跑完這六支之後
--   create_reading_publish_guard / _2_trigger
--   create_reading_student_rpc_1_fetch / _2_submit / _3_start / _4_finish
--
-- 🛑 這份【不】證明「grant 擋得住真實學生」——那一層由 A-verify.sql 的
--    A3／A4 與本機測試 reading_phase1_test.sql 的 H 段（以 authenticated
--    角色跑完整條路）負責。這份證明的是 RPC 的行為：計分、隔離、一題一次。
--
-- 判讀：最後一張表的「結果」欄【全部】要是 ✅。
-- =====================================================

-- 先清掉上一次可能留下的殘骸（腳本中途出錯時會有）
DELETE FROM reading_passages WHERE passage_id LIKE 'ZZ-VERIFY-%';

CREATE TEMP TABLE zz_b(seq int, 檢查 text, 期望 text, 實際 text);

-- ── 想自己指定要用哪兩個帳號？改這兩行 ──────────────
-- 🛑 production 的使用者是真的學生。不指定的話，腳本會自動挑最早的兩位
--    【is_admin() 回 false】的帳號——管理員本人會被排除，所以挑到的一定是別人。
--    把 uuid 填進去就會改用你指定的那兩位；留 NULL 就是自動挑。
--    腳本會先確認指定的帳號 is_admin() 是 false——管理員讀得到草稿，
--    拿他當學生會讓「草稿對學生不可見」那條假通過。
--
-- 🛑 只想動一個帳號？【只填第一個，第二個留 NULL】。
--    第二個身分會改用【管理員本人】去試著碰第一位的 session。
--    那是更強的測試：reading_submit_answer 沒有 admin 後門，
--    它嚴格比對 student_id = auth.uid()，所以管理員也必須被擋。
--    這樣就不會動到任何其他人的帳號。
CREATE TEMP TABLE zz_b_who(stu1 UUID, stu2 UUID);
INSERT INTO zz_b_who VALUES (
  NULL,   -- ← 第一位學生的 uuid（留 NULL = 自動挑）
  NULL    -- ← 第二位學生的 uuid（留 NULL = 自動挑）
);

DO $$
DECLARE
  v_stu1 UUID; v_stu2 UUID; v_admin UUID; v_row RECORD;
  v_forced1 UUID; v_forced2 UUID; v_second_is_admin BOOLEAN := false;
  v_sess UUID; v_sess2 UUID; v_q UUID; v_r JSONB; v_n INT;
  v_c CONSTANT TEXT[] := ARRAY['SM','MI','SD','CO','CD','VC'];
  i INT;
  v_msg TEXT;
BEGIN
  -- 🛑 【不要猜】誰是管理員。is_admin() 的判準是各環境自己的事——
  --    production 用某個 email，gsat-staging 用另一個。我原本在腳本裡
  --    寫死 production 的 email，於是 staging 的管理員被當成「學生」，
  --    B3（草稿對學生不可見）就紅了——腳本錯，不是 schema 錯。
  --
  --    正確做法：切換成那個身分，【問 is_admin() 本人】。
  --    這樣同一份腳本在任何環境都對，也不必維護一份 email 清單。
  SELECT stu1, stu2 INTO v_forced1, v_forced2 FROM zz_b_who;

  -- 只指定第一位 → 第二個身分用管理員（見檔頭說明）
  IF v_forced1 IS NOT NULL AND v_forced2 IS NULL THEN
    FOR v_row IN SELECT id FROM auth.users ORDER BY created_at LIMIT 1000 LOOP
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_row.id)::text, true);
      IF coalesce(public.is_admin(), false) THEN v_forced2 := v_row.id; EXIT; END IF;
    END LOOP;
    PERFORM set_config('request.jwt.claims', '', true);
    v_second_is_admin := true;
    IF v_forced2 IS NULL THEN
      INSERT INTO zz_b VALUES (0, '🛑 前置：只指定一個帳號時需要管理員當第二個身分',
        '找得到管理員', '找不到');
      RETURN;
    END IF;
  END IF;

  IF v_forced1 IS NOT NULL AND v_forced2 IS NOT NULL THEN
    -- 指定的帳號也要通過檢查：管理員讀得到草稿，拿他當學生會讓 B3 假通過。
    FOR v_row IN SELECT unnest(ARRAY[v_forced1, v_forced2]) AS id LOOP
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_row.id)::text, true);
      IF coalesce(public.is_admin(), false) AND NOT (v_second_is_admin AND v_row.id = v_forced2) THEN
        INSERT INTO zz_b VALUES (0, '🛑 前置：你指定的帳號是管理員',
          'is_admin() 要是 false', v_row.id::text || ' 的 is_admin() 是 true');
        PERFORM set_config('request.jwt.claims', '', true);
        RETURN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_row.id) THEN
        INSERT INTO zz_b VALUES (0, '🛑 前置：你指定的帳號不存在',
          '存在', v_row.id::text);
        PERFORM set_config('request.jwt.claims', '', true);
        RETURN;
      END IF;
    END LOOP;
    v_stu1 := v_forced1;
    v_stu2 := v_forced2;
    PERFORM set_config('request.jwt.claims', '', true);
  END IF;

  FOR v_row IN SELECT id FROM auth.users ORDER BY created_at LIMIT 1000 LOOP
    EXIT WHEN v_stu1 IS NOT NULL AND v_stu2 IS NOT NULL;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_row.id)::text, true);
    IF coalesce(public.is_admin(), false) THEN
      IF v_admin IS NULL THEN v_admin := v_row.id; END IF;
    ELSIF v_stu1 IS NULL THEN v_stu1 := v_row.id;
    ELSIF v_stu2 IS NULL THEN v_stu2 := v_row.id;
    END IF;
    EXIT WHEN v_stu1 IS NOT NULL AND v_stu2 IS NOT NULL AND v_admin IS NOT NULL;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);

  IF v_stu1 IS NULL OR v_stu2 IS NULL THEN
    INSERT INTO zz_b VALUES (0, '🛑 前置：需要兩位【非管理員】使用者',
      '兩位', coalesce(v_stu1::text,'無') || ' / ' || coalesce(v_stu2::text,'無'));
    RETURN;
  END IF;

  -- ── fixture ────────────────────────────────────────
  INSERT INTO reading_passages (passage_id, title, passage_text, content_source, cefr_level, status)
  VALUES ('ZZ-VERIFY-FULL','驗證用（可刪）','Every year the industry produces many things.','WRITER','B2','DRAFT'),
         ('ZZ-VERIFY-PART','驗證用（可刪）','Another passage for the partial case.','WRITER','B2','DRAFT');

  FOR i IN 1..6 LOOP
    INSERT INTO reading_questions (passage_id, construct, question, option_a, option_b, option_c, option_d, display_order)
    VALUES ('ZZ-VERIFY-FULL', v_c[i], 'Q '||v_c[i], 'opt A','opt B','opt C','opt D', i);
    INSERT INTO reading_question_keys (question_id, correct_answer, explanation)
    SELECT id, 'B', '解說：正解是 B。' FROM reading_questions
     WHERE passage_id='ZZ-VERIFY-FULL' AND construct=v_c[i];
  END LOOP;

  FOR i IN 1..3 LOOP
    INSERT INTO reading_questions (passage_id, construct, question, option_a, option_b, option_c, option_d, display_order)
    VALUES ('ZZ-VERIFY-PART', v_c[i], 'Q '||v_c[i], 'a','b','c','d', i);
    INSERT INTO reading_question_keys (question_id, correct_answer, explanation)
    SELECT id, 'A', '解說。' FROM reading_questions
     WHERE passage_id='ZZ-VERIFY-PART' AND construct=v_c[i];
  END LOOP;

  -- ── B1 DRAFT 可以不完整 ─────────────────────────────
  INSERT INTO zz_b VALUES (1, 'B1 只有三題的文章入得了庫（DRAFT 允許不完整）',
    '1 列', (SELECT count(*) FROM reading_passages WHERE passage_id='ZZ-VERIFY-PART')::text || ' 列');
  INSERT INTO zz_b VALUES (2, 'B1 但它不 publish-ready', 'false',
    (reading_publish_readiness('ZZ-VERIFY-PART') ->> 'ready'));

  -- ── B2 上架必須六題完整 ─────────────────────────────
  BEGIN
    UPDATE reading_passages SET status='PUBLISHED' WHERE passage_id='ZZ-VERIFY-PART';
    INSERT INTO zz_b VALUES (3, '🛑 B2 三題的文章上不了架', '被 trigger 擋下', '🛑 竟然上架成功');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO zz_b VALUES (3, '🛑 B2 三題的文章上不了架', '被 trigger 擋下',
      CASE WHEN SQLERRM LIKE '%缺少%' THEN '被 trigger 擋下'
           ELSE '🛑 擋下了但理由不對：' || left(SQLERRM,40) END);
  END;

  UPDATE reading_passages SET status='PUBLISHED' WHERE passage_id='ZZ-VERIFY-FULL';
  INSERT INTO zz_b VALUES (4, 'B2 六題完整的文章上得了架', 'PUBLISHED',
    (SELECT status FROM reading_passages WHERE passage_id='ZZ-VERIFY-FULL'));

  -- ── 從這裡開始用學生 1 的身分 ───────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stu1)::text, true);

  -- ── B3 取題不含答案 ─────────────────────────────────
  v_r := reading_get_passage('ZZ-VERIFY-FULL');
  INSERT INTO zz_b VALUES (5, '🛑 B3 取題回傳不含 correct_answer', '不含',
    CASE WHEN v_r::text LIKE '%correct_answer%' THEN '🛑 含有' ELSE '不含' END);
  INSERT INTO zz_b VALUES (6, '🛑 B3 取題回傳不含 explanation', '不含',
    CASE WHEN v_r::text LIKE '%explanation%' OR v_r::text LIKE '%解說%'
         THEN '🛑 含有' ELSE '不含' END);
  INSERT INTO zz_b VALUES (7, 'B3 六題都回來了', '6 題',
    jsonb_array_length(v_r -> 'questions')::text || ' 題');

  BEGIN
    PERFORM reading_get_passage('ZZ-VERIFY-PART');
    INSERT INTO zz_b VALUES (8, '🛑 B3 沒上架的文章讀不到', '被擋下', '🛑 讀得到');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO zz_b VALUES (8, '🛑 B3 沒上架的文章讀不到', '被擋下',
      CASE WHEN SQLERRM LIKE '%找不到這篇文章%' THEN '被擋下'
           ELSE '🛑 理由不對：' || left(SQLERRM,40) END);
  END;

  -- ── B4 開始練習 ─────────────────────────────────────
  v_sess := (reading_start_session('ZZ-VERIFY-FULL') ->> 'session_id')::uuid;
  INSERT INTO zz_b VALUES (9, '🛑 B4 學生拿得到 session_id（真實路徑走得通）',
    '拿到', CASE WHEN v_sess IS NULL THEN '🛑 沒拿到' ELSE '拿到' END);
  INSERT INTO zz_b VALUES (10, '🛑 B4 再叫一次回到同一個 session', '同一個',
    CASE WHEN (reading_start_session('ZZ-VERIFY-FULL') ->> 'session_id')::uuid = v_sess
         THEN '同一個' ELSE '🛑 開了新的' END);
  INSERT INTO zz_b VALUES (11, 'B4 資料庫裡只有一列 session', '1 列',
    (SELECT count(*) FROM reading_sessions WHERE passage_id='ZZ-VERIFY-FULL')::text || ' 列');

  -- ── B5 伺服器端計分 ─────────────────────────────────
  SELECT id INTO v_q FROM reading_questions
   WHERE passage_id='ZZ-VERIFY-FULL' AND construct='SM';
  v_r := reading_submit_answer(v_sess, v_q, 'B');
  INSERT INTO zz_b VALUES (12, '🛑 B5 答對由伺服器判定為 true', 'true', (v_r ->> 'is_correct'));
  INSERT INTO zz_b VALUES (13, 'B5 作答之後才拿得到正解', 'B', (v_r ->> 'correct_answer'));

  SELECT id INTO v_q FROM reading_questions
   WHERE passage_id='ZZ-VERIFY-FULL' AND construct='MI';
  INSERT INTO zz_b VALUES (14, '🛑 B5 答錯由伺服器判定為 false', 'false',
    (reading_submit_answer(v_sess, v_q, 'A') ->> 'is_correct'));

  -- ── B6 一題只能一次 ─────────────────────────────────
  INSERT INTO zz_b VALUES (15, '🛑 B6 重送同一題改送正解，仍回傳第一次的結果', 'false',
    (reading_submit_answer(v_sess, v_q, 'B') ->> 'is_correct'));
  INSERT INTO zz_b VALUES (16, '🛑 B6 而且沒有多出一筆紀錄', '2 筆',
    (SELECT count(*) FROM reading_attempts WHERE session_id=v_sess)::text || ' 筆');

  -- ── B7 跨學生隔離 ───────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stu2)::text, true);
  BEGIN
    PERFORM reading_submit_answer(v_sess, v_q, 'B');
    INSERT INTO zz_b VALUES (17,
      CASE WHEN v_second_is_admin
           THEN '🛑 B7 連【管理員】拿學生的 session 作答都被擋（沒有 admin 後門）'
           ELSE '🛑 B7 拿別人的 session_id 作答' END, '被擋下', '🛑 竟然成功了');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO zz_b VALUES (17, '🛑 B7 拿別人的 session_id 作答', '被擋下',
      CASE WHEN SQLERRM LIKE '%找不到這次練習%' THEN '被擋下'
           ELSE '🛑 理由不對：' || left(SQLERRM,40) END);
  END;
  BEGIN
    PERFORM reading_finish_session(v_sess);
    INSERT INTO zz_b VALUES (18, CASE WHEN v_second_is_admin THEN '🛑 B7 管理員也結算不了學生的 session'
           ELSE '🛑 B7 結算別人的 session' END, '被擋下', '🛑 竟然成功了');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO zz_b VALUES (18, CASE WHEN v_second_is_admin THEN '🛑 B7 管理員也結算不了學生的 session'
           ELSE '🛑 B7 結算別人的 session' END, '被擋下',
      CASE WHEN SQLERRM LIKE '%找不到這次練習%' THEN '被擋下'
           ELSE '🛑 理由不對：' || left(SQLERRM,40) END);
  END;

  -- 學生 2 開自己的 session：兩人互不影響
  v_sess2 := (reading_start_session('ZZ-VERIFY-FULL') ->> 'session_id')::uuid;
  INSERT INTO zz_b VALUES (19,
    CASE WHEN v_second_is_admin THEN 'B7 管理員開得了自己的 session（與學生的是兩個）'
         ELSE 'B7 第二位學生開得了自己的 session' END, '不同的 session',
    CASE WHEN v_sess2 IS NOT NULL AND v_sess2 <> v_sess THEN '不同的 session'
         ELSE '🛑 拿到同一個或沒拿到' END);

  -- ── B8 結算 ─────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stu1)::text, true);
  v_r := reading_finish_session(v_sess);
  INSERT INTO zz_b VALUES (20, '🛑 B8 session 收得掉', 'SUBMITTED', (v_r ->> 'status'));
  INSERT INTO zz_b VALUES (21, 'B8 結算的作答數由伺服器統計', '2', (v_r ->> 'answered'));
  INSERT INTO zz_b VALUES (22, 'B8 結算的答對數由伺服器統計', '1', (v_r ->> 'correct'));
  INSERT INTO zz_b VALUES (23, 'B8 六個 construct 都在結算裡', '6',
    jsonb_array_length(v_r -> 'by_construct')::text);
  SELECT count(*) INTO v_n FROM jsonb_array_elements(v_r -> 'by_construct') e
   WHERE e ->> 'status' = 'SKIPPED';
  INSERT INTO zz_b VALUES (24, '🛑 B8 沒作答的四題標成 SKIPPED，不是 WRONG', '4', v_n::text);

  BEGIN
    PERFORM reading_submit_answer(v_sess,
      (SELECT id FROM reading_questions WHERE passage_id='ZZ-VERIFY-FULL' AND construct='SD'), 'B');
    INSERT INTO zz_b VALUES (25, 'B8 收掉之後不能再作答', '被擋下', '🛑 竟然成功了');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO zz_b VALUES (25, 'B8 收掉之後不能再作答', '被擋下',
      CASE WHEN SQLERRM LIKE '%已經結束%' THEN '被擋下'
           ELSE '🛑 理由不對：' || left(SQLERRM,40) END);
  END;

  PERFORM set_config('request.jwt.claims', '', true);
EXCEPTION WHEN OTHERS THEN
  v_msg := SQLERRM;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO zz_b VALUES (99, '🛑 腳本本身出錯了', '不該出錯', left(v_msg, 120));
END $$;

-- fixture 清乾淨（CASCADE 帶走題目／答案／session／作答）
DELETE FROM reading_passages WHERE passage_id LIKE 'ZZ-VERIFY-%';

SELECT 檢查, 期望, 實際,
       CASE WHEN 期望 = 實際 THEN '✅' ELSE '🛑 FAIL' END AS 結果,
       (SELECT count(*) FROM reading_passages WHERE passage_id LIKE 'ZZ-VERIFY-%') AS 殘留fixture
  FROM zz_b ORDER BY (CASE WHEN 期望 = 實際 THEN 1 ELSE 0 END), seq;
