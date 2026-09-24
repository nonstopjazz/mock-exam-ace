-- =====================================================
-- 題目說明改為必填
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- 為什麼
--
--   essay_topic 原本是選填，結果學生幾乎都留空（抽查的那位學生六篇全是 null）。
--   兩個實際後果：
--
--     1. AI 改作文時不知道題目。analyze-writing 把 topic: null 送進模型，
--        它只能就文章本身評，沒辦法判斷有沒有切題。
--     2. 老師端的題目 filter 幾乎沒東西可篩 —— 大部分作文不會出現在
--        任何一個題目底下。
--
-- 🛑 這一支【只加驗證，不改資料，也不加 NOT NULL 約束】。
--    既有的 null 列原封不動 —— 那些作文已經送出、已經批改，
--    回頭去填一個沒有人記得的題目只會製造假資料。
--    加 NOT NULL 會讓 migration 直接失敗（既有列違反約束），
--    而且會讓那些舊列變成不可更新。
--
--    所以是「從現在起必填」，不是「所有作文都有題目」。
--    老師端要能篩出那些舊的，見 WritingGrading 的「未填題目」選項。
--
-- 前端也會擋（送出鈕不給按），但那是體驗，不是保證。
-- 真正的規則在這裡：直接呼叫 RPC 也繞不過去。
--
-- 回滾：supabase/migrations/require_essay_topic.rollback.sql
-- =====================================================


-- ── 文字作文 ─────────────────────────────────────────
-- 與 create_writing_texts.sql 的版本相同，只多了 essay_topic 的檢查。
-- 這支沒有 SET search_path，沿用既有寫法（改它會讓裸表名失效）。
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

  IF p_essay_topic IS NULL OR char_length(btrim(p_essay_topic)) = 0 THEN
    RAISE EXCEPTION '請輸入題目說明' USING ERRCODE = '22023';
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

  -- content 刻意不 trim
  INSERT INTO writing_texts (essay_id, content, provenance, created_by)
  VALUES (v_essay_id, p_content, 'TYPED', v_uid);

  UPDATE writing_submissions
     SET status = 'SUBMITTED', submitted_at = now()
   WHERE id = v_essay_id;

  RETURN v_essay_id;
END;
$$;

COMMENT ON FUNCTION submit_writing_essay IS
  '在單一交易中建立文字作文：草稿 → 正規文字 → 送出。SECURITY INVOKER，RLS 全程生效。題目說明自 2026-09-24 起必填。';


-- ── 圖片作文 ─────────────────────────────────────────
-- 題目在【建立草稿】時就要，因為圖片作文的送出流程沒有再收一次 metadata。
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


-- ── 驗證（唯讀）───────────────────────────────────────
-- 預期：兩支都是 t（函式本體裡有題目檢查）
SELECT p.proname,
       (pg_get_functiondef(p.oid) LIKE '%請輸入題目說明%') AS "有題目檢查"
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('submit_writing_essay', 'create_writing_image_draft')
 ORDER BY p.proname;

-- 既有資料完全沒動，確認一下 null 的數量在執行前後一致：
SELECT count(*) FILTER (WHERE essay_topic IS NULL) AS "題目為空",
       count(*)                                    AS "總數"
  FROM public.writing_submissions;
