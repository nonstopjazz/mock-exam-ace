-- =====================================================
-- Rollback: create_writing_cost_guardrails.sql
--
-- 🔴 先在 gsat-staging 執行並確認，再在 production 執行。
--
-- 把 writing_enqueue_analysis_batch() 還原成沒有每日上限的版本
-- （create_writing_queue_rpcs.sql 裡的那一份），並刪掉估算與上限的四支函式。
--
-- ⚠️ 還原之後【每日花費就沒有上界了】，單批 50 篇的限制仍然在。
--    前端的估算對話框會拿不到資料，會安靜地只顯示篇數。
-- =====================================================

CREATE OR REPLACE FUNCTION writing_enqueue_analysis_batch(
  p_essay_ids UUID[],
  p_force BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch UUID := gen_random_uuid();
  v_ids UUID[];
  v_id UUID;
  v_analysis UUID;
  v_items JSONB := '[]'::jsonb;
  v_enqueued INTEGER := 0;
  v_latest RECORD;
  v_outcome TEXT;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_enqueue_analysis_batch：僅限管理員' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(DISTINCT x) INTO v_ids
    FROM unnest(coalesce(p_essay_ids, ARRAY[]::UUID[])) AS x
   WHERE x IS NOT NULL;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION '沒有選取任何作文' USING ERRCODE = '22023';
  END IF;

  IF array_length(v_ids, 1) > 50 THEN
    RAISE EXCEPTION '一次最多排入 50 篇，這次是 % 篇', array_length(v_ids, 1)
      USING ERRCODE = '22023';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    v_outcome := NULL;
    v_analysis := NULL;

    IF NOT EXISTS (
      SELECT 1 FROM public.writing_submissions s
       WHERE s.id = v_id AND s.status = 'SUBMITTED'
    ) THEN
      v_outcome := 'NOT_SUBMITTED';
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.writing_texts t WHERE t.essay_id = v_id
    ) THEN
      v_outcome := 'NO_TEXT';
    ELSE
      SELECT a.id, a.status INTO v_latest
        FROM public.writing_analyses a
       WHERE a.essay_id = v_id
       ORDER BY a.analysis_version DESC
       LIMIT 1;

      IF FOUND AND v_latest.status = 'COMPLETED' AND NOT coalesce(p_force, false) THEN
        v_outcome := 'SKIPPED_COMPLETED';
      ELSIF FOUND AND v_latest.status IN ('QUEUED', 'ANALYZING', 'ANALYZED') THEN
        v_analysis := v_latest.id;
        UPDATE public.writing_analyses SET queue_batch_id = v_batch WHERE id = v_analysis;
        v_outcome := 'ALREADY_ACTIVE';
      ELSE
        v_analysis := public.writing_enqueue_analysis(v_id);
        UPDATE public.writing_analyses SET queue_batch_id = v_batch WHERE id = v_analysis;
        v_outcome := 'ENQUEUED';
        v_enqueued := v_enqueued + 1;
      END IF;
    END IF;

    v_items := v_items || jsonb_build_object(
      'essay_id', v_id, 'analysis_id', v_analysis, 'result', v_outcome);
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id', v_batch,
    'requested', array_length(v_ids, 1),
    'enqueued', v_enqueued,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION writing_enqueue_analysis_batch(UUID[], BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_enqueue_analysis_batch(UUID[], BOOLEAN) TO authenticated, service_role;

DROP FUNCTION IF EXISTS writing_analysis_cost_estimate(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS writing_daily_analysis_used();
DROP FUNCTION IF EXISTS writing_daily_analysis_cap();
DROP FUNCTION IF EXISTS writing_analysis_usage(UUID);
