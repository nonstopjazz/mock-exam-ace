-- =====================================================
-- 閱讀練習開放控制（2／2）：開始練習
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 這是【改寫既有函式】（CREATE OR REPLACE），不是新建。
--    執行前 reading_start_session 已經存在，這支只是在它前面多一道檢查。
--
-- 🛑 加上 learn_feature_enabled('reading') 之後，【沒有被開放的學生叫不動它】。
--    開放對象在 /admin/feature-access 設定，預設【不對任何人開放】。
--    管理員不受影響——learn_feature_enabled 對管理員一律回 true。
--
-- 回滾：把 create_reading_student_rpc_* 的原版重新執行一次即可（純加檢查）。
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

  -- 🛑 這道閘是【真的】那一道。StudentFeatureGate 只是不渲染頁面，
  --    藏起來的頁面仍然打得到 API——瀏覽器 console 裡一行 supabase.rpc()
  --    就繞過去了。真正決定誰看得到閱讀練習的是這一行。
  --
  --    learn_feature_enabled() 對管理員一律回 true，所以後台預覽不受影響。
  IF coalesce(public.learn_feature_enabled('reading'), false) IS NOT TRUE THEN
    RAISE EXCEPTION '閱讀練習尚未對你開放' USING ERRCODE = '42501';
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
