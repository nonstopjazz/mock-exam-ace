-- 回滾 add_writing_queue_error_codes.sql
--
-- 🟢 只要在 production 執行一次。不動任何一列資料。
--
-- 把 writing_admin_queue() 換回【沒有 error_codes、但仍然帶 left_at 修正】的版本。
-- 下面這段是從 fix_class_membership_left_at.sql【逐字取回】的，不是手打重建
-- —— 所以回滾不會順手把 left_at 的修正也退掉。
--
-- ⚠️ 跑之前確認沒有前端還在讀 error_codes 欄位。
--    Phase 1A 的 UI 尚未實作，所以 2026-09-21 當下沒有讀取端。

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
  -- is_admin() 對未登入者回傳 NULL，不是 false。
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_admin_queue：僅限管理員' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(q)::jsonb ORDER BY q.submitted_at DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        s.id            AS essay_id,
        s.student_id,
        public.learn_display_name(s.student_id) AS student_name,
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
        (a.status = 'COMPLETED') AS report_ready,
        a.queue_batch_id,
        coalesce(a.queue_attempts, 0) AS queue_attempts,
        (a.lease_expires_at IS NOT NULL AND a.lease_expires_at > now()) AS worker_running,
        (r.essay_id IS NOT NULL) AS teacher_reviewed,
        r.reviewed_at AS teacher_reviewed_at,
        (f.essay_id IS NOT NULL) AS has_feedback,
        coalesce(cls.names, ARRAY[]::TEXT[]) AS class_names
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
      LEFT JOIN public.writing_teacher_reviews r ON r.essay_id = s.id
      LEFT JOIN public.writing_teacher_feedback f ON f.essay_id = s.id
      LEFT JOIN LATERAL (
        -- 一個學生可能同時在多個班，所以是陣列不是單一值。
        -- ⚠️ 只列【目前在籍】的班：退出之後，他過去的作文不再歸在那個班底下。
        --    這是 S1 語意。老師若要找退出學生的舊作文，用學生姓名找，不要用班級篩選。
        SELECT array_agg(c.name ORDER BY c.name) AS names
          FROM public.learn_class_members m
          JOIN public.learn_classes c ON c.id = m.class_id
         WHERE m.student_id = s.student_id
           AND m.left_at IS NULL                          -- ← S1：目前在籍
           AND c.status = 'ACTIVE'
      ) cls ON true
      WHERE s.status = 'SUBMITTED'
    ) q;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION writing_admin_queue IS
  '老師收件匣：已送出的作文 + 學生姓名 + 【目前在籍】班級 + 最新一次分析狀態 + 老師檢閱／講評狀態 + 佇列租約。僅限管理員。';

-- 驗證：預期 有error_codes = false、left_at修正還在 = true
SELECT (pg_get_functiondef(p.oid) ILIKE '%error_codes%')     AS "有error_codes",
       (pg_get_functiondef(p.oid) ILIKE '%left_at IS NULL%') AS "left_at修正還在"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'writing_admin_queue';
