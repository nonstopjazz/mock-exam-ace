-- =====================================================
-- 題目說明改為必填（2／2）：圖片作文
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 require_essay_topic_1_text.sql。順序其實不影響結果
--    （兩支函式互不相依），但分開貼是刻意的，原因見那一支的檔頭。
--
-- 題目在【建立草稿】時就要，因為圖片作文的送出流程沒有再收一次 metadata。
--
-- 回滾：supabase/migrations/require_essay_topic_2_image.rollback.sql
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

  IF p_essay_topic IS NULL OR char_length(btrim(p_essay_topic)) = 0 THEN
    RAISE EXCEPTION '請輸入題目說明' USING ERRCODE = '22023';
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
  '建立一篇圖片作文草稿並回傳 id。草稿本身還不是作文——沒有文字之前送不出去。題目說明自 2026-09-24 起必填。';
