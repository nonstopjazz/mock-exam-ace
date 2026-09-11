-- =====================================================
-- writing_admin_queue() 補上收件匣需要的欄位
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_writing_teacher_reviews.sql 與 add_writing_queue_lease.sql 之後執行。
--
-- 這一支從「批改佇列」變成「收件匣」，老師要在同一個畫面上判斷：
--   這是誰的作文、哪個班、AI 跑到哪、我處理過了沒。
-- 現在的版本只回傳 student_id（一串 uuid），畫面上根本顯示不出人名——
-- 老師得一篇一篇點進去才知道是誰的，這正是這次要消滅的那種點擊。
--
-- 新增的欄位：
--   student_name       learn_display_name()：display_name → email 前段 → 未命名學生
--   class_names        這位學生所屬的啟用中班級（可能多個）
--   teacher_reviewed   老師有沒有明確按過「完成檢閱」
--   has_feedback       有沒有寫過講評（與 reviewed 是兩件事，講評是選填的）
--   queue_batch_id     屬於哪一次批次
--   queue_attempts     被重新認領過幾次（診斷「這篇為什麼跑這麼久」）
--   worker_running     現在有沒有 worker 持有它的租約
--
-- 只是加欄位，既有欄位一個都沒動也沒改名，舊的前端不會壞。
--
-- 回滾：supabase/migrations/update_writing_admin_queue.rollback.sql
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'learn_display_name'
  ) THEN
    RAISE EXCEPTION 'writing_admin_queue 需要 learn_display_name()，請先套用 create_learn_classes_tasks.sql';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'writing_teacher_reviews'
  ) THEN
    RAISE EXCEPTION 'writing_admin_queue 需要 writing_teacher_reviews，請先套用 create_writing_teacher_reviews.sql';
  END IF;
END;
$$;


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
        -- ── 這次新增的 ─────────────────────────────────────────
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
        SELECT array_agg(c.name ORDER BY c.name) AS names
          FROM public.learn_class_members m
          JOIN public.learn_classes c ON c.id = m.class_id
         WHERE m.student_id = s.student_id AND c.status = 'ACTIVE'
      ) cls ON true
      WHERE s.status = 'SUBMITTED'
    ) q;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION writing_admin_queue IS
  '老師收件匣：已送出的作文 + 學生姓名 + 班級 + 最新一次分析狀態 + 老師檢閱／講評狀態 + 佇列租約。僅限管理員。';

REVOKE ALL ON FUNCTION writing_admin_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_admin_queue() TO authenticated, service_role;
