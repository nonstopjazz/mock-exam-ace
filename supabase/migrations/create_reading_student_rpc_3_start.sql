-- =====================================================
-- Six-Way Reading 學生端（3／4）：開始一次練習
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_reading_sessions.sql。
--
-- 🛑 這支補的是一個【真實路徑上的缺口】：
--
--    reading_sessions 對 authenticated 只有 GRANT SELECT，沒有 INSERT——
--    這是對的（學生自己寫 session 就能偽造 passage_id）。但在這支之前，
--    也沒有任何 SECURITY DEFINER 函式會建立 session，
--    於是學生【永遠拿不到 session_id】，reading_submit_answer 叫不起來。
--
--    本機測試沒抓到，因為測試用 superuser 直接 INSERT session，
--    繞過了 grant。一個只有測試走得通的路徑不是路徑。
--
-- 🛑 同一位學生同一篇只會有一個進行中的 session。
--    重新整理、開第二個分頁、網路斷線重連——都必須回到同一個 session，
--    否則同一篇會產生兩組互相矛盾的作答紀錄。
--    靠的是 reading_sessions_one_active 這個 partial unique index，
--    不是靠「先查再寫」——那中間有 race。
--
-- 回滾：supabase/migrations/create_reading_student_rpc_3_start.rollback.sql
-- =====================================================

CREATE OR REPLACE FUNCTION reading_start_session(p_passage_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_admin   BOOLEAN := coalesce(public.is_admin(), false);
  v_status  TEXT;
  v_id      UUID;
  v_resumed BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  SELECT status INTO v_status
    FROM public.reading_passages WHERE passage_id = p_passage_id;

  -- 🛑 與 reading_get_passage 用同一個錯誤訊息。
  --    分開講會讓人用這支去探測「哪些 passage_id 存在但還沒上架」。
  IF v_status IS NULL OR (v_status <> 'PUBLISHED' AND NOT v_admin) THEN
    RAISE EXCEPTION '找不到這篇文章' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.reading_sessions (student_id, passage_id)
  VALUES (v_uid, p_passage_id)
  ON CONFLICT (student_id, passage_id) WHERE status = 'IN_PROGRESS'
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- 已經有一個進行中的——回到它，不開新的。
    v_resumed := true;
    SELECT id INTO v_id FROM public.reading_sessions
     WHERE student_id = v_uid AND passage_id = p_passage_id
       AND status = 'IN_PROGRESS';
  END IF;

  RETURN jsonb_build_object(
    'session_id', v_id,
    'passage_id', p_passage_id,
    'resumed',    v_resumed,
    -- 續做時前端要知道哪幾題已經答過了。🛑 只回 question_id，不回正誤——
    -- 正誤屬於作答結果，該由 reading_submit_answer 那一次往返給。
    'answered_question_ids', (
      SELECT coalesce(jsonb_agg(a.question_id), '[]'::jsonb)
        FROM public.reading_attempts a WHERE a.session_id = v_id));
END;
$$;

REVOKE ALL ON FUNCTION reading_start_session(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reading_start_session(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION reading_start_session IS
  '開始（或接續）一次閱讀練習，回傳 session_id。同一位學生同一篇只會有一個進行中的 session。🛑 回傳不含任何題目內容或答案——取題請用 reading_get_passage。';
