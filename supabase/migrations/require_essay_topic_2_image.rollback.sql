-- =====================================================
-- 回滾 require_essay_topic_2_image.sql —— 圖片作文的題目恢復為選填
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 前端仍然會把題目當必填（按了會跳「請先填題目說明」）。要完整回到選填，
--    src/components/learn/writing/PhotoEssayComposer.tsx 也要一起還原。
-- =====================================================

CREATE OR REPLACE FUNCTION create_writing_image_draft(
  p_title         TEXT,
  p_essay_topic   TEXT DEFAULT NULL,
  p_essay_date    DATE DEFAULT NULL,
  p_student_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_essay_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  IF p_title IS NULL OR char_length(btrim(p_title)) = 0 THEN
    RAISE EXCEPTION '請輸入作文標題' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.writing_submissions (
    student_id, submission_type, title, essay_topic, essay_date, student_notes, status
  ) VALUES (
    v_uid,
    'image',
    btrim(p_title),
    nullif(btrim(coalesce(p_essay_topic, '')), ''),
    coalesce(p_essay_date, CURRENT_DATE),
    nullif(btrim(coalesce(p_student_notes, '')), ''),
    'DRAFT'
  )
  RETURNING id INTO v_essay_id;

  RETURN v_essay_id;
END;
$$;

COMMENT ON FUNCTION create_writing_image_draft IS
  '建立一篇圖片作文草稿並回傳 id。草稿本身還不是作文——沒有文字之前送不出去。';
