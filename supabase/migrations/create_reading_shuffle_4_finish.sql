-- =====================================================
-- 選項亂序（4／5）：結算時把正解換成顯示位置
--
-- 🟢 只要在 production 執行一次。
--
-- ⚠️ 先執行 create_reading_shuffle_1_perm.sql。
-- ⚠️ 這是【改寫既有函式】，signature 沒變，不需要 DROP。
--
-- selected_answer 已經是顯示位置（submit 就是那樣存的），不用換算。
--
-- 回滾：重新執行 create_reading_student_rpc_4_finish.sql
-- =====================================================

CREATE OR REPLACE FUNCTION reading_finish_session(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_session public.reading_sessions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  -- 🛑 SECURITY DEFINER 繞過 RLS，所以擁有權要自己擋。
  SELECT * INTO v_session FROM public.reading_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL OR v_session.student_id <> v_uid THEN
    RAISE EXCEPTION '找不到這次練習' USING ERRCODE = 'P0002';
  END IF;

  -- 重複呼叫不改變已經收尾的時間。學生連點兩次不該讓成績看起來慢了 3 秒。
  IF v_session.status = 'IN_PROGRESS' THEN
    UPDATE public.reading_sessions
       SET status = 'SUBMITTED', submitted_at = now()
     WHERE id = p_session_id
    RETURNING * INTO v_session;
  END IF;

  RETURN jsonb_build_object(
    'session_id',   v_session.id,
    'passage_id',   v_session.passage_id,
    'status',       v_session.status,
    'started_at',   v_session.started_at,
    'submitted_at', v_session.submitted_at,
    'total_seconds',
      round(extract(epoch FROM (v_session.submitted_at - v_session.started_at)))::int,
    'answered', (SELECT count(*)::int FROM public.reading_attempts
                  WHERE session_id = p_session_id),
    'correct',  (SELECT count(*)::int FROM public.reading_attempts
                  WHERE session_id = p_session_id AND is_correct),
    -- 六個 construct 一題一列，依 display_order。
    -- 🛑 沒作答的題目也要在，status = 'SKIPPED'——結算畫面必須看得出
    --    「答錯」與「沒作答」的差別，兩者對學生的意義完全不同。
    'by_construct', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'construct',       q.construct,
               'question_id',     q.id,
               'status',          CASE WHEN a.id IS NULL THEN 'SKIPPED'
                                       WHEN a.is_correct THEN 'CORRECT'
                                       ELSE 'WRONG' END,
               'selected_answer', a.selected_answer,
               -- 🛑 正解要換成【這個學生這次看到的位置】。回原始標籤的話，
               --    結算畫面會指著一個他根本沒看到的選項說「答案是這個」。
               'correct_answer',  public.reading_option_to_display(
                                    p_session_id, q.id, k.correct_answer),
               'explanation',     k.explanation,
               'response_time_ms',    a.response_time_ms,
               'answer_change_count', a.answer_change_count
             ) ORDER BY q.display_order), '[]'::jsonb)
        FROM public.reading_questions q
        LEFT JOIN public.reading_question_keys k ON k.question_id = q.id
        LEFT JOIN public.reading_attempts a
               ON a.question_id = q.id AND a.session_id = p_session_id
       WHERE q.passage_id = v_session.passage_id));
END;
$$;

REVOKE ALL ON FUNCTION reading_finish_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reading_finish_session(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION reading_finish_session IS
  '結束一次閱讀練習並回傳結算。逐題的 selected_answer 與 correct_answer 都是【這個 session 的顯示位置】，不是題庫的原始標籤。';


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname,
       p.prosecdef                                               AS "SECURITY DEFINER",
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname = 'reading_finish_session';
