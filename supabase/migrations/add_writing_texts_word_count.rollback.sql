-- =====================================================
-- Rollback: add_writing_texts_word_count.sql
--
-- 順序很重要：先把兩支函式換回不讀 word_count 的版本，再刪欄位。
-- 反過來做的話，欄位刪掉而函式還在 SELECT 它，中間那段時間任何呼叫都會炸。
--
-- ⚠️ 回滾前請先把前端退回顯示 char_count 的版本，否則畫面上的字數會變成空白。
-- ⚠️ DROP COLUMN 同樣會重寫整張表。
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
        (SELECT t.char_count
           FROM public.writing_texts t
          WHERE t.essay_id = s.id
          ORDER BY t.created_at DESC
          LIMIT 1) AS char_count,

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
        SELECT wt.char_count
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


ALTER TABLE writing_texts DROP COLUMN IF EXISTS word_count;
