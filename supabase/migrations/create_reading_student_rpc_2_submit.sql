-- =====================================================
-- Six-Way Reading（7／7）：作答並取得結果
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_reading_sessions.sql 與 create_reading_student_rpc_1_fetch.sql。
--
-- 這支是答案安全的【另一半】：學生讀不到 reading_question_keys，
-- 所以正誤與解說只能由伺服器在收到答案之後回傳。
--
-- 🛑 is_correct 由這裡比對，不接受參數傳入。
--    讓前端送 is_correct 等於把計分權交給瀏覽器。
--
-- 🛑 一題只能作答一次（UNIQUE (session_id, question_id)）。
--    再送同一題不會重新計分，會原樣回傳第一次的結果。
--
--    為什麼重要：submit-then-reveal 的設計天生可以被反覆試答窮舉。
--    一次限制把窮舉的成本從「同一個 session 裡試四次」
--    推高到「每試一次就要開一個新 session」，而每個 session 都留下紀錄。
--    這不是密碼學等級的防護，但它把作弊從「免費」變成「留痕跡」。
--    見 docs/reading/phase1-data-layer.md 的威脅分析。
--
-- 回滾：supabase/migrations/create_reading_student_rpc_2_submit.rollback.sql
-- =====================================================

CREATE OR REPLACE FUNCTION reading_submit_answer(
  p_session_id          UUID,
  p_question_id         UUID,
  p_selected_answer     CHAR(1),
  p_response_time_ms    INTEGER DEFAULT NULL,
  p_answer_change_count INTEGER DEFAULT 0,
  p_first_answer        CHAR(1) DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_session public.reading_sessions%ROWTYPE;
  v_key     public.reading_question_keys%ROWTYPE;
  v_passage TEXT;
  v_correct BOOLEAN;
  v_existing public.reading_attempts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  IF p_selected_answer NOT IN ('A','B','C','D') THEN
    RAISE EXCEPTION '答案必須是 A / B / C / D' USING ERRCODE = '22023';
  END IF;

  -- 🛑 session 必須是自己的。這一條是整支函式最重要的授權檢查——
  --    SECURITY DEFINER 繞過了 RLS，所以這裡要自己擋。
  SELECT * INTO v_session FROM public.reading_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL OR v_session.student_id <> v_uid THEN
    RAISE EXCEPTION '找不到這次練習' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION '這次練習已經結束了' USING ERRCODE = '22023';
  END IF;

  -- 題目必須屬於這個 session 的文章。否則學生可以用自己的 session
  -- 去問別篇文章的答案。
  SELECT q.passage_id INTO v_passage
    FROM public.reading_questions q WHERE q.id = p_question_id;
  IF v_passage IS NULL OR v_passage <> v_session.passage_id THEN
    RAISE EXCEPTION '這一題不屬於這次練習' USING ERRCODE = '22023';
  END IF;

  -- 已經答過就原樣回傳，不重新計分。
  SELECT * INTO v_existing FROM public.reading_attempts
   WHERE session_id = p_session_id AND question_id = p_question_id;

  SELECT * INTO v_key FROM public.reading_question_keys WHERE question_id = p_question_id;
  IF v_key.question_id IS NULL THEN
    RAISE EXCEPTION '這一題還沒有答案，不能作答' USING ERRCODE = 'P0002';
  END IF;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'already_answered', true,
      'selected_answer',  v_existing.selected_answer,
      'is_correct',       v_existing.is_correct,
      'correct_answer',   v_key.correct_answer,
      'explanation',      v_key.explanation);
  END IF;

  v_correct := (p_selected_answer = v_key.correct_answer);

  INSERT INTO public.reading_attempts (
    session_id, question_id, student_id, selected_answer, is_correct,
    response_time_ms, answer_change_count, first_answer
  ) VALUES (
    p_session_id, p_question_id, v_uid, p_selected_answer, v_correct,
    p_response_time_ms, greatest(coalesce(p_answer_change_count, 0), 0),
    coalesce(p_first_answer, p_selected_answer)
  );

  RETURN jsonb_build_object(
    'already_answered', false,
    'selected_answer',  p_selected_answer,
    'is_correct',       v_correct,
    'correct_answer',   v_key.correct_answer,
    'explanation',      v_key.explanation);
END;
$$;

COMMENT ON FUNCTION reading_submit_answer IS
  '作答一題並回傳正誤、正解與解說。is_correct 由伺服器比對，不接受前端傳入。一題只能答一次，重送回傳第一次的結果。';

REVOKE ALL ON FUNCTION reading_submit_answer(UUID, UUID, CHAR, INTEGER, INTEGER, CHAR)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reading_submit_answer(UUID, UUID, CHAR, INTEGER, INTEGER, CHAR)
  TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname,
       p.prosecdef                                               AS "SECURITY DEFINER",
       array_to_string(p.proconfig, ',')                         AS "設定",
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'reading_%'
 ORDER BY p.proname;
