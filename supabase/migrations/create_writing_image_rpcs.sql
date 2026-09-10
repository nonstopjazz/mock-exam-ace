-- =====================================================
-- Migration: 拍照作文的 RPC（寫作系統 Phase 2）
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_writing_ocr_runs.sql / create_writing_images.sql /
--    relax_writing_image_checks.sql 之後執行。
--
-- 五支函式，兩種身分：
--   學生用（SECURITY INVOKER，RLS 全程生效）
--     create_writing_image_draft   建立圖片作文草稿
--     register_writing_image       登記一頁已上傳的原檔
--     submit_writing_image_essay   校對完成，一次交易送出
--   伺服器用（SECURITY DEFINER，只授權給 service_role）
--     writing_images_cleanup_candidates  列出可刪除的檔案
--     writing_images_mark_deleted        標記已刪除
--
-- 全部釘住 search_path，並且明確 REVOKE FROM anon ——
-- Supabase 的 ALTER DEFAULT PRIVILEGES 會自動授予 anon EXECUTE，
-- 只 REVOKE FROM PUBLIC 是收不掉的。
-- =====================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. create_writing_image_draft —— 建立草稿
--
-- 為什麼要先建草稿才能上傳：Storage 路徑是 {uid}/{essay_id}/{page}.jpg，
-- 沒有 essay_id 就沒有路徑；而路徑裡有 essay_id，清理工作才對得回資料列。
-- ═══════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════
-- 2. register_writing_image —— 登記一頁已上傳的原檔
--
-- 🛑 路徑必須是 {自己的 uid}/{這篇作文的 id}/...
--
-- 這一條把關不是形式。伺服器端的處理程式是用 service-role 去 Storage 取檔的，
-- 那把鑰匙繞過 Storage 的 RLS。若學生能登記別人資料夾裡的路徑，
-- 伺服器就會忠實地把別人的作文抓來辨識，再寫進他自己的作文裡。
-- 因此路徑歸屬要在【寫進資料庫的那一刻】就驗證，不能等到讀取時才檢查。
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION register_writing_image(
  p_essay_id    UUID,
  p_page_number INTEGER,
  p_raw_path    TEXT,
  p_raw_bytes   BIGINT DEFAULT NULL,
  p_raw_mime    TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_expected_prefix TEXT;
  v_image_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  IF p_raw_path IS NULL OR char_length(btrim(p_raw_path)) = 0 THEN
    RAISE EXCEPTION '缺少檔案路徑' USING ERRCODE = '22023';
  END IF;

  v_expected_prefix := v_uid::text || '/' || p_essay_id::text || '/';
  IF position(v_expected_prefix in p_raw_path) <> 1 THEN
    RAISE EXCEPTION '檔案路徑與作文不符' USING ERRCODE = '42501';
  END IF;

  -- essay_id 的歸屬與 DRAFT 狀態由 writing_images 的 INSERT 政策把關（RLS）。
  INSERT INTO public.writing_images (
    essay_id, page_number, raw_path, raw_bytes, raw_mime, raw_uploaded_at, state
  ) VALUES (
    p_essay_id, p_page_number, p_raw_path, p_raw_bytes, p_raw_mime, now(), 'UPLOADED'
  )
  RETURNING id INTO v_image_id;

  RETURN v_image_id;
END;
$$;

COMMENT ON FUNCTION register_writing_image IS
  '登記一頁已上傳到 writing-raw 的原檔。路徑必須位於 {自己的 uid}/{該作文 id}/ 之下，否則拒絕。';


-- ═══════════════════════════════════════════════════════════════
-- 3. submit_writing_image_essay —— 校對完成，送出
--
-- provenance 由【資料庫】比對決定，不由 client 宣稱：
--   送出的文字 = 辨識原文  → OCR
--   送出的文字 ≠ 辨識原文  → OCR_CORRECTED
-- client 說「我沒改」是沒有意義的，它本來就可以說謊。
--
-- 所有頁都必須是 NORMALIZED 才准送出：其中一頁處理失敗就送出，
-- 等於把「缺一頁的作文」當成完整作文交出去，而學生不會知道。
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION submit_writing_image_essay(
  p_essay_id   UUID,
  p_content    TEXT,
  p_ocr_run_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_essay public.writing_submissions%ROWTYPE;
  v_raw_text TEXT;
  v_page_count INTEGER;
  v_bad_pages INTEGER;
  v_provenance TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  IF p_content IS NULL OR char_length(btrim(p_content)) = 0 THEN
    RAISE EXCEPTION '作文內容是空的' USING ERRCODE = '22023';
  END IF;

  -- FOR UPDATE：擋掉「連按兩次送出」造成兩筆文字的競態
  SELECT * INTO v_essay
    FROM public.writing_submissions
   WHERE id = p_essay_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這篇作文' USING ERRCODE = '02000';
  END IF;
  IF v_essay.student_id <> v_uid THEN
    RAISE EXCEPTION '沒有權限' USING ERRCODE = '42501';
  END IF;
  IF v_essay.status <> 'DRAFT' THEN
    RAISE EXCEPTION '這篇作文已經送出，不能再送一次' USING ERRCODE = '55000';
  END IF;
  IF v_essay.submission_type <> 'image' THEN
    RAISE EXCEPTION '這不是拍照作文' USING ERRCODE = '22023';
  END IF;

  -- 頁面狀態：至少一頁，且全部正規化成功
  SELECT count(*), count(*) FILTER (WHERE state <> 'NORMALIZED')
    INTO v_page_count, v_bad_pages
    FROM public.writing_images
   WHERE essay_id = p_essay_id;

  IF v_page_count = 0 THEN
    RAISE EXCEPTION '這篇作文還沒有照片' USING ERRCODE = '22023';
  END IF;
  IF v_bad_pages > 0 THEN
    RAISE EXCEPTION '還有 % 頁沒有處理完成，請先處理完再送出', v_bad_pages USING ERRCODE = '55000';
  END IF;

  -- 辨識紀錄必須屬於這篇作文且成功
  SELECT raw_text INTO v_raw_text
    FROM public.writing_ocr_runs
   WHERE id = p_ocr_run_id
     AND essay_id = p_essay_id
     AND status = 'SUCCEEDED';

  IF v_raw_text IS NULL THEN
    RAISE EXCEPTION '找不到這篇作文成功的辨識紀錄' USING ERRCODE = '22023';
  END IF;

  v_provenance := CASE WHEN p_content = v_raw_text THEN 'OCR' ELSE 'OCR_CORRECTED' END;

  -- content 刻意不 trim：字元位移必須對得上學生真正送出的內容
  INSERT INTO public.writing_texts (essay_id, content, provenance, source_ocr_run_id, created_by)
  VALUES (p_essay_id, p_content, v_provenance, p_ocr_run_id, v_uid);

  UPDATE public.writing_submissions
     SET status = 'SUBMITTED', submitted_at = now()
   WHERE id = p_essay_id;

  RETURN p_essay_id;
END;
$$;

COMMENT ON FUNCTION submit_writing_image_essay IS
  '拍照作文的送出：驗證所有頁都處理完成 → 寫入正規文字（provenance 由資料庫比對決定）→ 標記送出。單一交易。';


-- ═══════════════════════════════════════════════════════════════
-- 4. writing_images_cleanup_candidates —— 可刪除的檔案
--
-- 三種：
--   RAW        已送出、辨識成功、文字落地、封存圖驗證過 → 原檔沒有存在的理由了
--   ARCHIVE    已送出滿 60 天 → 封存圖到期
--   ABANDONED  草稿放置滿 30 天 → 原檔與封存圖一起帶走
--
-- 🛑 前三種條件全部在這裡用 SQL 判斷，不接受任何 client 傳來的「可以刪了」。
--    處理失敗、辨識沒成功、文字沒落地、還沒送出 —— 任一成立就不會出現在候選名單裡。
--    唯一的例外是 ABANDONED：草稿永遠不會滿足上面的條件，不設一條規則就會永遠留著。
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION writing_images_cleanup_candidates(
  p_kind  TEXT,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  image_id       UUID,
  essay_id       UUID,
  storage_bucket TEXT,
  storage_path   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_kind NOT IN ('RAW', 'ARCHIVE', 'ABANDONED') THEN
    RAISE EXCEPTION '未知的清理類型：%', p_kind USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'RAW' THEN
    RETURN QUERY
      SELECT i.id, i.essay_id, 'writing-raw'::TEXT, i.raw_path
        FROM public.writing_images i
        JOIN public.writing_submissions e ON e.id = i.essay_id
       WHERE i.raw_path IS NOT NULL
         AND i.raw_deleted_at IS NULL
         -- 封存圖存在、驗證過、而且還沒被刪掉
         AND i.archive_path IS NOT NULL
         AND i.archive_verified_at IS NOT NULL
         AND i.archive_deleted_at IS NULL
         AND i.state = 'NORMALIZED'
         -- 作文已送出，且過了緩衝期
         AND e.status = 'SUBMITTED'
         AND e.submitted_at < now() - interval '12 hours'
         -- 辨識成功過
         AND EXISTS (
           SELECT 1 FROM public.writing_ocr_runs r
            WHERE r.essay_id = e.id AND r.status = 'SUCCEEDED'
         )
         -- 正式文字已落地
         AND EXISTS (
           SELECT 1 FROM public.writing_texts t WHERE t.essay_id = e.id
         )
       ORDER BY e.submitted_at
       LIMIT p_limit;

  ELSIF p_kind = 'ARCHIVE' THEN
    RETURN QUERY
      SELECT i.id, i.essay_id, 'writing-archive'::TEXT, i.archive_path
        FROM public.writing_images i
        JOIN public.writing_submissions e ON e.id = i.essay_id
       WHERE i.archive_path IS NOT NULL
         AND i.archive_deleted_at IS NULL
         AND e.status = 'SUBMITTED'
         AND e.submitted_at < now() - interval '60 days'
         AND EXISTS (
           SELECT 1 FROM public.writing_texts t WHERE t.essay_id = e.id
         )
       ORDER BY e.submitted_at
       LIMIT p_limit;

  ELSE
    -- ABANDONED：草稿放著沒動滿 30 天。原檔與封存圖都算候選，一列可能回兩筆。
    RETURN QUERY
      SELECT x.image_id, x.essay_id, x.storage_bucket, x.storage_path
        FROM (
          SELECT i.id AS image_id, i.essay_id,
                 'writing-raw'::TEXT AS storage_bucket, i.raw_path AS storage_path,
                 e.updated_at
            FROM public.writing_images i
            JOIN public.writing_submissions e ON e.id = i.essay_id
           WHERE e.status = 'DRAFT'
             AND e.updated_at < now() - interval '30 days'
             AND i.raw_path IS NOT NULL
             AND i.raw_deleted_at IS NULL
          UNION ALL
          SELECT i.id, i.essay_id,
                 'writing-archive'::TEXT, i.archive_path,
                 e.updated_at
            FROM public.writing_images i
            JOIN public.writing_submissions e ON e.id = i.essay_id
           WHERE e.status = 'DRAFT'
             AND e.updated_at < now() - interval '30 days'
             AND i.archive_path IS NOT NULL
             AND i.archive_deleted_at IS NULL
        ) x
       ORDER BY x.updated_at
       LIMIT p_limit;
  END IF;
END;
$$;

COMMENT ON FUNCTION writing_images_cleanup_candidates IS
  '列出可刪除的影像檔（RAW / ARCHIVE / ABANDONED）。所有保存條件都在這支函式裡判斷，client 無法影響結果。';


-- ═══════════════════════════════════════════════════════════════
-- 5. writing_images_mark_deleted —— 標記已刪除
--
-- 呼叫順序固定是：先刪 Storage 的檔案，成功之後才呼叫這一支。
-- 反過來會出現「資料庫說刪了、檔案還躺在 bucket 裡」的孤兒 —— 而且再也沒有人會去找它。
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION writing_images_mark_deleted(
  p_image_ids UUID[],
  p_bucket    TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_bucket = 'writing-raw' THEN
    UPDATE public.writing_images
       SET raw_deleted_at = now()
     WHERE id = ANY(p_image_ids)
       AND raw_deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_bucket = 'writing-archive' THEN
    UPDATE public.writing_images
       SET archive_deleted_at = now()
     WHERE id = ANY(p_image_ids)
       AND archive_deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSE
    RAISE EXCEPTION '未知的 bucket：%', p_bucket USING ERRCODE = '22023';
  END IF;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION writing_images_mark_deleted IS
  '把已從 Storage 刪除的檔案標記起來。只在 Storage 刪除成功之後呼叫。';


-- ═══════════════════════════════════════════════════════════════
-- 授權
-- ═══════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION create_writing_image_draft(TEXT, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_writing_image_draft(TEXT, TEXT, DATE, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION register_writing_image(UUID, INTEGER, TEXT, BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION register_writing_image(UUID, INTEGER, TEXT, BIGINT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION submit_writing_image_essay(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_writing_image_essay(UUID, TEXT, UUID) TO authenticated, service_role;

-- 清理用的兩支是 SECURITY DEFINER：只有伺服器可以呼叫，學生與匿名都不行。
REVOKE ALL ON FUNCTION writing_images_cleanup_candidates(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_images_cleanup_candidates(TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION writing_images_mark_deleted(UUID[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_images_mark_deleted(UUID[], TEXT) TO service_role;
