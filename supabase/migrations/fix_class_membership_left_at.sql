-- =====================================================
-- 「目前在籍」的判準補回 left_at IS NULL
--
-- 🟢 只要在 production 執行一次。
--    （這份只 CREATE OR REPLACE FUNCTION，不動任何一列資料，
--      也不建表、不改 schema。staging 可以跑，但不是必要。）
--
-- 🔴 執行前請先跑檔案最下方【第 0 段：前置檢查】，確認 production 上這四支
--    函式的定義真的就是這份要取代的版本。上一次事故就是因為我用 repo 的
--    推測代替了資料庫的事實。
--
--
-- 問題
--
--   learn_class_members.left_at 是【軟移除】。learn_admin_remove_class_member()
--   不刪列，只寫 left_at = now()；重新加入則把它清回 NULL（不新增第二列）。
--   所以「目前在籍」的唯一判準是 left_at IS NULL。
--
--   擁有這張表的模組（create_learn_classes_tasks.sql）5 個查詢點全部都帶這個條件，
--   兩個部分索引也都是 WHERE left_at IS NULL 建的。但模組外的四支函式都漏了。
--
--   2026-09-20 production 實測：已退出 1 人、在籍 21 人、總計 22 人。
--   ⚠️ 所以這【不是潛在 bug，是現在就在發生的錯誤】。
--
--
-- 🔴 其中一項是權限問題，不只是顯示問題
--
--   learn_feature_enabled() 決定「這個人能不能用這個功能」。漏掉 left_at
--   代表【學生退出班級之後，仍然因為那個班而保有功能權限】。
--   其他三支只是數字和名單不準。
--
--
-- 語意選擇：S1 = 目前在籍
--
--   學生退出「高二A」之後，他過去在該班時期寫的作文，
--   【不再】被目前該班的篩選視為該班成員。
--
--   另一個選項 S2（依作文送出時間回推當時班籍）語意更正確，但在現有 schema
--   下做不對：重新加入時 joined_at 會被重設為 now()，更早的區間判斷會被破壞。
--   真要做 S2，得先把 learn_class_members 改成保留多段 membership 區間，
--   那是另一個題目。這次不處理歷史班籍 snapshot。
--
--
-- 改了哪些查詢點（共 6 處，分布在 4 支函式）
--
--   writing_admin_queue()                 1 處  class_names 的 LATERAL
--   writing_pending_summary_internal()    2 處  by_class 的 JOIN、unclassed 的 NOT EXISTS
--   learn_feature_enabled()               1 處  班級授權的 EXISTS        ← 權限
--   learn_admin_feature_access()          2 處  member_count、reach 的 UNION 分支
--
--   ⚠️ 你指定的是 writing_pending_digest()，但它只是一層包裝：
--      真正的查詢在 writing_pending_summary_internal() 裡。digest 本身沒有
--      任何 membership 查詢，所以這份【不動 digest】，改的是它委派的那一支。
--      連帶 writing_queue_summary()（老師端）也會跟著修正——這是刻意的，
--      這兩支共用同一個定義就是為了讓數字永遠對得起來。
--
--
-- security / search_path / grant 全部原封不動
--
--   四支都維持 SECURITY DEFINER + SET search_path = ''。
--   CREATE OR REPLACE 不會改變既有的 grant，所以這份【不重下 GRANT】——
--   重下反而有機會覆寫掉 production 上後來調整過的權限。
--
-- 回滾：supabase/migrations/fix_class_membership_left_at.rollback.sql
-- =====================================================


-- =====================================================
-- 第 0 段：前置檢查
--
-- 預期六個都是 false（= 現在漏掉了，這份有事要做）。
-- 如果已經有 true，代表 production 的定義跟 repo 不一致，【先停下來查清楚】。
-- =====================================================
SELECT p.proname AS "函式",
       (pg_get_functiondef(p.oid) ILIKE '%left_at IS NULL%') AS "已經有left_at",
       (pg_get_functiondef(p.oid) ILIKE '%learn_class_members%') AS "有查membership"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('writing_admin_queue', 'writing_pending_summary_internal',
                     'writing_pending_digest', 'writing_queue_summary',
                     'learn_feature_enabled', 'learn_admin_feature_access')
 ORDER BY p.proname;


-- =====================================================
-- 1/4  learn_feature_enabled(TEXT)   🔴 這一支是權限
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
       AND m.left_at IS NULL          -- ← 退出班級就失去該班帶來的權限
       AND c.status = 'ACTIVE'
  );
END;
$$;

COMMENT ON FUNCTION learn_feature_enabled IS
  '目前登入者能不能用某個功能。管理員永遠 true；其餘看個別授權或【目前在籍】的啟用中班級的授權。只回傳布林，不透露任何名冊資訊。';


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
                 (SELECT count(*) FROM public.learn_class_members m
                   WHERE m.class_id = c.id
                     AND m.left_at IS NULL)::int          -- ← 在籍人數
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
         WHERE a.feature = p_feature
           AND m.left_at IS NULL                          -- ← 與上面那支一致
           AND c.status = 'ACTIVE'
      ) u
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION learn_admin_feature_access IS
  '某功能的開放狀況：啟用中班級（含是否授權、【在籍】人數）、個別授權學生、去重後的實際觸及人數。僅限管理員。';


-- =====================================================
-- 3/4  writing_pending_summary_internal()
--      （writing_pending_digest() 與 writing_queue_summary() 都委派給它）
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
       AND m.left_at IS NULL                              -- ← 只算在籍
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
    -- unclassed 必須跟 by_class 用同一個判準，否則兩個數字會互相矛盾：
    -- 退出班級的學生會既不算在任何班裡、也不算「沒有班級」。
    'unclassed', (SELECT count(*) FROM pending p
                   WHERE NOT EXISTS (
                     SELECT 1 FROM public.learn_class_members m
                       JOIN public.learn_classes c ON c.id = m.class_id
                      WHERE m.student_id = p.student_id
                        AND m.left_at IS NULL                -- ← 與 by_class 一致
                        AND c.status = 'ACTIVE')),
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
  '「待老師處理」的唯一定義。班級歸屬只算【目前在籍】。不做授權檢查，因此不給任何角色 EXECUTE——只有 writing_queue_summary() 與 writing_pending_digest() 這兩個帶守門的包裝叫得動它。';


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


-- =====================================================
-- 驗證：跑完應該六支全部是「已經有left_at = true」
--       （writing_pending_digest 與 writing_queue_summary 是包裝，
--         它們自己沒有 membership 查詢，所以「有查membership」會是 false，
--         「已經有left_at」也會是 false——這是對的，不是漏改。）
-- =====================================================
SELECT p.proname AS "函式",
       (pg_get_functiondef(p.oid) ILIKE '%left_at IS NULL%') AS "已經有left_at",
       (pg_get_functiondef(p.oid) ILIKE '%learn_class_members%') AS "有查membership"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('writing_admin_queue', 'writing_pending_summary_internal',
                     'writing_pending_digest', 'writing_queue_summary',
                     'learn_feature_enabled', 'learn_admin_feature_access')
 ORDER BY p.proname;

-- grant 沒有被動到的佐證（CREATE OR REPLACE 不會重設 ACL，這裡只是留一份紀錄）
SELECT p.proname AS "函式",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行",
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS "anon可執行",
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS "service_role可執行",
       p.prosecdef                                               AS "SECURITY_DEFINER",
       p.proconfig                                               AS "search_path"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('writing_admin_queue', 'writing_pending_summary_internal',
                     'writing_pending_digest', 'writing_queue_summary',
                     'learn_feature_enabled', 'learn_admin_feature_access')
 ORDER BY p.proname;
