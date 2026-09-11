-- =====================================================
-- Rollback: create_writing_pending_digest.sql
--
-- 🔴 先在 gsat-staging 執行並確認，再在 production 執行。
--
-- 把 writing_queue_summary() 還原成自己帶查詢的版本（create_writing_queue_rpcs.sql
-- 裡的那一份），然後刪掉內部函式與排程用的兩支。
--
-- 還原之後：收件匣與徽章照常運作，每日作文提醒不再有資料可讀。
-- =====================================================

CREATE OR REPLACE FUNCTION writing_queue_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_queue_summary：僅限管理員' USING ERRCODE = '42501';
  END IF;

  WITH pending AS (
    SELECT s.id, s.submitted_at, s.student_id, a.status AS analysis_status
      FROM public.writing_submissions s
      LEFT JOIN LATERAL (
        SELECT wa.status FROM public.writing_analyses wa
         WHERE wa.essay_id = s.id ORDER BY wa.analysis_version DESC LIMIT 1
      ) a ON true
     WHERE s.status = 'SUBMITTED'
       AND EXISTS (SELECT 1 FROM public.writing_texts t WHERE t.essay_id = s.id)
       AND NOT EXISTS (SELECT 1 FROM public.writing_teacher_reviews r WHERE r.essay_id = s.id)
  ),
  by_class AS (
    SELECT c.id AS class_id, c.name, count(*)::int AS count
      FROM pending p
      JOIN public.learn_class_members m ON m.student_id = p.student_id
      JOIN public.learn_classes c ON c.id = m.class_id
     WHERE c.status = 'ACTIVE'
     GROUP BY c.id, c.name
  )
  SELECT jsonb_build_object(
    'pending_total', (SELECT count(*) FROM pending),
    'awaiting_analysis', (SELECT count(*) FROM pending
                           WHERE analysis_status IS NULL OR analysis_status = 'FAILED'),
    'queued',    (SELECT count(*) FROM pending WHERE analysis_status = 'QUEUED'),
    'analyzing', (SELECT count(*) FROM pending WHERE analysis_status IN ('ANALYZING', 'ANALYZED')),
    'failed',    (SELECT count(*) FROM pending WHERE analysis_status = 'FAILED'),
    'awaiting_review', (SELECT count(*) FROM pending WHERE analysis_status = 'COMPLETED'),
    'oldest_pending_at', (SELECT min(submitted_at) FROM pending),
    'unclassed', (SELECT count(*) FROM pending p
                   WHERE NOT EXISTS (
                     SELECT 1 FROM public.learn_class_members m
                       JOIN public.learn_classes c ON c.id = m.class_id
                      WHERE m.student_id = p.student_id AND c.status = 'ACTIVE')),
    'by_class', (SELECT coalesce(jsonb_agg(row_to_json(b)::jsonb ORDER BY b.count DESC), '[]'::jsonb)
                   FROM by_class b),
    'worker_busy', EXISTS (
      SELECT 1 FROM public.writing_analyses a
       WHERE a.status IN ('QUEUED', 'ANALYZING', 'ANALYZED')
         AND a.lease_expires_at IS NOT NULL AND a.lease_expires_at > now()),
    'work_waiting', EXISTS (
      SELECT 1 FROM public.writing_analyses a
       WHERE (a.lease_expires_at IS NULL OR a.lease_expires_at <= now())
         AND (a.status IN ('QUEUED', 'ANALYZING')
              OR (a.status = 'ANALYZED'
                  AND coalesce(a.synthesis_status, 'PENDING') IN ('PENDING', 'RUNNING', 'FAILED'))))
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION writing_queue_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_queue_summary() TO authenticated, service_role;

DROP FUNCTION IF EXISTS writing_reminder_push_targets(TEXT[]);
DROP FUNCTION IF EXISTS writing_pending_digest();
DROP FUNCTION IF EXISTS writing_pending_summary_internal();
