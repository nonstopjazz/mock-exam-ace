-- =====================================================
-- Six-Way Reading 學生端（4／4）：結束一次練習並取得結算
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_reading_student_rpc_3_start.sql。
--
-- 🛑 沒有這支，reading_sessions 的 status 永遠停在 IN_PROGRESS——
--    CHECK 約束要求 SUBMITTED 必須有 submitted_at，而學生沒有 UPDATE 權限，
--    所以那個狀態轉換【在真實路徑上不存在】。一張永遠關不掉的 session 表
--    會讓「這篇練過了沒」這個最基本的問題答不出來。
--
-- 🛑 結算【在伺服器端算】。六個 construct 的對錯、總分、花了多久，
--    全部從 reading_attempts 重新統計，不接受前端傳入任何數字。
--
-- 🛑 這支【會】回傳正解與解說——因為它是結束之後才叫的。
--    安全性不靠這支：reading_question_keys 對 authenticated 沒有任何權限，
--    學生就算直接查表也讀不到。這支只是把已經結束的那一次講清楚。
--
-- 回滾：supabase/migrations/create_reading_student_rpc_4_finish.rollback.sql
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
               'correct_answer',  k.correct_answer,
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
  '結束一次閱讀練習並回傳結算：總分、六個 construct 的對錯、作答時間。全部由伺服器統計。重複呼叫不改變 submitted_at。';
