-- =====================================================
-- 回滾 require_essay_topic.sql —— 題目說明恢復為選填
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- 只是把兩支函式還原成 create_writing_texts.sql 與 create_writing_image_rpcs.sql
-- 裡的版本（拿掉題目檢查）。沒有資料要還原 —— 那一支本來就沒改任何資料。
--
-- ⚠️ 前端仍然會把題目當必填（送出鈕不給按）。要完整回到選填，
--    前端那兩處也要一起還原，否則只是「資料庫不擋、但學生還是不能留空」。
-- =====================================================

CREATE OR REPLACE FUNCTION submit_writing_essay(
  p_title         TEXT,
  p_content       TEXT,
  p_essay_topic   TEXT DEFAULT NULL,
  p_essay_date    DATE DEFAULT NULL,
  p_student_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
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

  IF p_content IS NULL OR char_length(btrim(p_content)) = 0 THEN
    RAISE EXCEPTION '請輸入作文內容' USING ERRCODE = '22023';
  END IF;

  INSERT INTO writing_submissions (
    student_id, submission_type, title, essay_topic, essay_date, student_notes, status
  ) VALUES (
    v_uid,
    'text',
    btrim(p_title),
    nullif(btrim(coalesce(p_essay_topic, '')), ''),
    coalesce(p_essay_date, CURRENT_DATE),
    nullif(btrim(coalesce(p_student_notes, '')), ''),
    'DRAFT'
  )
  RETURNING id INTO v_essay_id;

  INSERT INTO writing_texts (essay_id, content, provenance, created_by)
  VALUES (v_essay_id, p_content, 'TYPED', v_uid);

  UPDATE writing_submissions
     SET status = 'SUBMITTED', submitted_at = now()
   WHERE id = v_essay_id;

  RETURN v_essay_id;
END;
$$;

COMMENT ON FUNCTION submit_writing_essay IS
  '在單一交易中建立文字作文：草稿 → 正規文字 → 送出。SECURITY INVOKER，RLS 全程生效。';


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


-- 驗證：兩支都應該是 f（題目檢查已移除）
SELECT p.proname,
       (pg_get_functiondef(p.oid) LIKE '%請輸入題目說明%') AS "有題目檢查"
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('submit_writing_essay', 'create_writing_image_draft')
 ORDER BY p.proname;
