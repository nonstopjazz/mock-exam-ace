-- =====================================================
-- 選項亂序（3／5）：作答時把位置換回原始標籤
--
-- 🟢 只要在 production 執行一次。
--
-- ⚠️ 先執行 create_reading_shuffle_1_perm.sql。
--
-- ⚠️ 這是【改寫既有函式】（CREATE OR REPLACE），signature 沒變，不需要 DROP。
--
-- 🛑 reading_attempts 存的是【學生看到的那個字母】，不是題庫的原始標籤。
--    兩個理由：
--      1. 續做時前端直接讀 reading_attempts 還原已答狀態。存原始標籤的話，
--         它會把高亮打在錯的選項上。
--      2. 那才是誠實的紀錄——他當時真的按了那個位置。
--    原始標籤沒有遺失：排列是 (session_id, question_id) 的純函式，
--    任何時候都算得回來。
--
-- 🛑 is_correct 仍然由伺服器比對，而且比對的是換算後的原始標籤。
--
-- 回滾：重新執行 create_reading_student_rpc_2_submit.sql
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
  v_canonical CHAR(1);
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
      'correct_answer',   public.reading_option_to_display(
                            p_session_id, p_question_id, v_key.correct_answer),
      'explanation',      v_key.explanation);
  END IF;

  -- 🛑 比對前先把「學生按下去的位置」換回題庫裡的原始標籤。
  --    少了這一步，整份計分會依排列亂掉——而且每個人亂的方式不一樣，
  --    所以不會有人一眼看出是排列的問題。
  v_canonical := public.reading_option_to_canonical(
                   p_session_id, p_question_id, p_selected_answer);
  v_correct := (v_canonical = v_key.correct_answer);

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
    'correct_answer',   public.reading_option_to_display(
                          p_session_id, p_question_id, v_key.correct_answer),
    'explanation',      v_key.explanation);
END;
$$;

COMMENT ON FUNCTION reading_submit_answer IS
  '作答一題並回傳正誤、正解與解說。送進來的是學生看到的位置，伺服器換算回原始標籤後才比對；回傳的 correct_answer 是【顯示位置】。一題只能答一次。';

REVOKE ALL ON FUNCTION reading_submit_answer(UUID, UUID, CHAR, INTEGER, INTEGER, CHAR)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reading_submit_answer(UUID, UUID, CHAR, INTEGER, INTEGER, CHAR)
  TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname,
       p.prosecdef                                               AS "SECURITY DEFINER",
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname = 'reading_submit_answer';
