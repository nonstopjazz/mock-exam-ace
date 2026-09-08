-- =====================================================
-- Migration: 字數 = 單字數，不是字元數
--
-- 問題：writing_texts.char_count 是 char_length(content)，也就是【字元數】，
-- 但整個前端把它標成「字」。一篇 273 個英文單字的作文因此顯示成「1782 字」。
-- 學測作文的門檻是以單字數計（120 字左右），顯示字元數不只是標錯單位，
-- 而是會讓學生誤判自己的篇幅。
--
-- 修法：在資料庫算一次單字數，所有讀取路徑共用同一個定義。
--
-- 為什麼是 generated column 而不是在各支 RPC 各算一次：
--   目前有五個地方顯示這個數字（學生列表卡、學生作文頁、老師佇列、
--   老師批改頁、撰寫頁的即時計數）。若每個地方各自定義「什麼算一個字」，
--   同一篇作文在不同畫面會出現不同的數字 —— 那正是這次要修掉的那種錯。
--
-- 單字的定義：以空白切分（與 Word 的計法一致到個位數）。
--   · 連字號詞（well-known）算一個字，Word 也是
--   · 破折號沒有前後空白時（information—study）算一個字，這一點與 Word 相同
--   · 中文不適用 —— 這個系統的作文是英文，中文字之間沒有空白，
--     若之後要收中文作文，這個欄位要另外處理，不要沿用
--
-- ⚠️ ADD COLUMN ... GENERATED ALWAYS AS ... STORED 會重寫整張表。
--    writing_texts 目前資料量很小（正式站數十列），實際上是瞬間完成；
--    但它會短暫取得 ACCESS EXCLUSIVE 鎖，請不要在學生正在送作文時執行。
--
-- 本檔不建表、不改 RLS、不改任何既有欄位。
-- =====================================================

ALTER TABLE writing_texts
  ADD COLUMN IF NOT EXISTS word_count INTEGER
  GENERATED ALWAYS AS (
    -- btrim 不帶第二個參數只會去掉【空格】，換行與 tab 會留下來，
    -- 切分後就多出一個空字串，字數平白多一。所以要明確列出空白字元。
    CASE WHEN btrim(content, E' \t\r\n\f\v') = '' THEN 0
         ELSE array_length(
                regexp_split_to_array(btrim(content, E' \t\r\n\f\v'), '[[:space:]]+'), 1)
    END
  ) STORED;

COMMENT ON COLUMN writing_texts.word_count IS
  '以空白切分的單字數。英文作文的「字數」指的是這個；char_count 是字元數，兩者不可混用。';


-- =====================================================
-- 讀取路徑補上 word_count（兩支都是 CREATE OR REPLACE，
-- 簽章與既有欄位完全不變，只多回一個欄位）
-- =====================================================

CREATE OR REPLACE FUNCTION writing_student_essay_cards()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_rows JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'writing_student_essay_cards：需要登入' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(
           jsonb_agg(row_to_json(c)::jsonb ORDER BY c.essay_date DESC, c.created_at DESC),
           '[]'::jsonb
         )
    INTO v_rows
    FROM (
      SELECT
        s.id AS essay_id,
        s.title,
        s.essay_topic,
        s.essay_date,
        s.submission_type,
        s.status,
        s.submitted_at,
        s.created_at,

        -- writing_texts 是 append-only，最新的一列才是目前的文字
        cur.char_count,
        cur.word_count,

        a.status AS analysis_status,
        -- 沒有分析列時是 false，不是 NULL —— 讓 client 端不必處理三態
        coalesce(a.status = 'COMPLETED', false) AS report_ready,

        -- 綜合層欄位一律以 COMPLETED 為閘門，與 writing_student_analysis() 相同。
        -- 半完成的報告寧可不顯示，也不給學生一個會變動的等第。
        CASE WHEN a.status = 'COMPLETED'
             THEN a.overall_evaluation ->> 'level' END AS overall_level,
        CASE WHEN a.status = 'COMPLETED'
             THEN a.overall_evaluation ->> 'headline' END AS overall_headline,

        EXISTS (
          SELECT 1 FROM public.writing_teacher_feedback f
           WHERE f.essay_id = s.id
        ) AS has_teacher_feedback

      FROM public.writing_submissions s
      -- 目前的文字：writing_texts 是 append-only，最新一列才算數
      LEFT JOIN LATERAL (
        SELECT wt.char_count, wt.word_count
          FROM public.writing_texts wt
         WHERE wt.essay_id = s.id
         ORDER BY wt.created_at DESC
         LIMIT 1
      ) cur ON true
      -- 最新一次分析。重新分析會插入新列（analysis_version+1），舊列保留，
      -- 列表只看最新的那一次。
      LEFT JOIN LATERAL (
        SELECT an.status, an.overall_evaluation
          FROM public.writing_analyses an
         WHERE an.essay_id = s.id
         ORDER BY an.analysis_version DESC
         LIMIT 1
      ) a ON true
     WHERE s.student_id = v_uid
    ) c;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION writing_student_essay_cards IS
  '學生自己的作文列表（卡片版）。過濾條件只有 auth.uid()，不接受 student_id 參數。批改結果經策展：等第與 headline 只在 COMPLETED 時提供，永不回傳 provider / model / error_detail / validation_issues。';

REVOKE ALL ON FUNCTION writing_student_essay_cards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_student_essay_cards() TO authenticated, service_role;


CREATE OR REPLACE FUNCTION writing_admin_queue()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- is_admin() 對未登入者回傳 NULL，不是 false。IF NOT is_admin() 不會成立，
  -- 因此一律用 coalesce(...) IS NOT TRUE。
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_admin_queue：僅限管理員' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(q)::jsonb ORDER BY q.submitted_at DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        s.id            AS essay_id,
        s.student_id,
        s.title,
        s.essay_topic,
        s.essay_date,
        s.status        AS submission_status,
        s.submitted_at,
        t.char_count,
        t.word_count,
        a.id            AS analysis_id,
        a.status        AS analysis_status,
        a.analysis_version,
        a.requested_at  AS analysis_requested_at,
        a.completed_at  AS analysis_completed_at,
        a.failed_pass,
        a.error_detail,
        a.attempt_count,
        a.synthesis_status,
        a.synthesis_error_detail,
        a.synthesis_attempt_count,
        (a.status = 'COMPLETED') AS report_ready
      FROM public.writing_submissions s
      LEFT JOIN LATERAL (
        SELECT wt.char_count, wt.word_count
          FROM public.writing_texts wt
         WHERE wt.essay_id = s.id
         ORDER BY wt.created_at DESC
         LIMIT 1
      ) t ON true
      LEFT JOIN LATERAL (
        SELECT wa.*
          FROM public.writing_analyses wa
         WHERE wa.essay_id = s.id
         ORDER BY wa.analysis_version DESC
         LIMIT 1
      ) a ON true
      WHERE s.status = 'SUBMITTED'
    ) q;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION writing_admin_queue IS
  '老師批改佇列：已送出的作文 + 最新一次分析狀態。僅限管理員。';

REVOKE ALL ON FUNCTION writing_admin_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_admin_queue() TO authenticated, service_role;
