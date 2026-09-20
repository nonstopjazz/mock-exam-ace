-- 回滾 fix_class_membership_left_at.sql
--
-- 🟢 只要在 production 執行一次。不動任何一列資料。
--
-- 把四支函式換回【沒有 left_at IS NULL】的舊定義，也就是回到
-- 「已退出班級的學生仍然被當成該班成員」的行為。
--
-- 🛑 請注意這代表什麼：learn_feature_enabled() 會【重新開放】已退出學生
--    透過原班級取得的功能權限。這不只是顯示回退，是權限回退。
--    只有在正向那份造成了預期外的影響、而且你確認要接受這個權限行為時才跑。
--
-- 這四段是直接從原始 migration 逐字取回的，不是手打重建：
--   learn_feature_enabled / learn_admin_feature_access
--     ← create_learn_feature_access.sql
--   writing_pending_summary_internal
--     ← create_writing_pending_digest.sql
--   writing_admin_queue
--     ← update_writing_admin_queue.sql
--
-- security / search_path 原封不動；grant 不重下（CREATE OR REPLACE 不會改 ACL）。


-- =====================================================
-- 1/4  learn_feature_enabled(TEXT)
-- =====================================================
CREATE OR REPLACE FUNCTION learn_feature_enabled(p_feature TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF coalesce(public.is_admin(), false) IS TRUE THEN
    RETURN true;
  END IF;
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.learn_feature_access a
     WHERE a.feature = p_feature
       AND a.student_id = v_uid
  ) OR EXISTS (
    SELECT 1
      FROM public.learn_feature_access a
      JOIN public.learn_class_members m ON m.class_id = a.class_id
      JOIN public.learn_classes c       ON c.id = a.class_id
     WHERE a.feature = p_feature
       AND m.student_id = v_uid
       AND c.status = 'ACTIVE'
  );
END;
$$;

COMMENT ON FUNCTION learn_feature_enabled IS
  '目前登入者能不能用某個功能。管理員永遠 true；其餘看個別授權或所屬啟用中班級的授權。只回傳布林，不透露任何名冊資訊。';


-- =====================================================
-- 2/4  learn_admin_feature_access(TEXT)
-- =====================================================
CREATE OR REPLACE FUNCTION learn_admin_feature_access(p_feature TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_feature_access');

  SELECT jsonb_build_object(
    'feature', p_feature,
    'classes', (
      SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.name), '[]'::jsonb)
        FROM (
          SELECT c.id AS class_id,
                 c.name,
                 (SELECT count(*) FROM public.learn_class_members m WHERE m.class_id = c.id)::int
                   AS member_count,
                 EXISTS (SELECT 1 FROM public.learn_feature_access a
                          WHERE a.feature = p_feature AND a.class_id = c.id) AS granted
            FROM public.learn_classes c
           WHERE c.status = 'ACTIVE'
        ) x
    ),
    'students', (
      SELECT coalesce(jsonb_agg(row_to_json(y)::jsonb ORDER BY y.name), '[]'::jsonb)
        FROM (
          SELECT a.student_id,
                 public.learn_display_name(a.student_id) AS name,
                 a.granted_at,
                 a.note
            FROM public.learn_feature_access a
           WHERE a.feature = p_feature AND a.student_id IS NOT NULL
        ) y
    ),
    -- 去重：班級與個別授權重疊的人只算一次
    'reach', (
      SELECT count(*)::int FROM (
        SELECT a.student_id AS uid
          FROM public.learn_feature_access a
         WHERE a.feature = p_feature AND a.student_id IS NOT NULL
        UNION
        SELECT m.student_id
          FROM public.learn_feature_access a
          JOIN public.learn_class_members m ON m.class_id = a.class_id
          JOIN public.learn_classes c       ON c.id = a.class_id
         WHERE a.feature = p_feature AND c.status = 'ACTIVE'
      ) u
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION learn_admin_feature_access IS
  '某功能的開放狀況：啟用中班級（含是否授權）、個別授權學生、去重後的實際觸及人數。僅限管理員。';


-- =====================================================
-- 3/4  writing_pending_summary_internal()
-- =====================================================
CREATE OR REPLACE FUNCTION writing_pending_summary_internal()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH pending AS (
    SELECT s.id, s.submitted_at, s.student_id, a.status AS analysis_status
      FROM public.writing_submissions s
      LEFT JOIN LATERAL (
        SELECT wa.status
          FROM public.writing_analyses wa
         WHERE wa.essay_id = s.id
         ORDER BY wa.analysis_version DESC
         LIMIT 1
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
         AND a.lease_expires_at IS NOT NULL
         AND a.lease_expires_at > now()),
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

COMMENT ON FUNCTION writing_pending_summary_internal IS
  '「待老師處理」的唯一定義。不做授權檢查，因此不給任何角色 EXECUTE——只有 writing_queue_summary() 與 writing_pending_digest() 這兩個帶守門的包裝叫得動它。';


-- =====================================================
-- 4/4  writing_admin_queue()
-- =====================================================
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

-- 驗證：跑完應該四支都是「已經有left_at = false」
SELECT p.proname AS "函式",
       (pg_get_functiondef(p.oid) ILIKE '%left_at IS NULL%') AS "已經有left_at"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('writing_admin_queue', 'writing_pending_summary_internal',
                     'learn_feature_enabled', 'learn_admin_feature_access')
 ORDER BY p.proname;
