-- =====================================================
-- writing_admin_queue() 加上 error_codes（Phase 1A / A8）
--
-- 🟢 只要在 production 執行一次。
--    只有 CREATE OR REPLACE FUNCTION，不動任何一列資料，也不改 schema。
--
-- 🔴 必須在 create_writing_error_findings.sql 之後執行。
-- 🔴 這一份是建立在 fix_class_membership_left_at.sql【之後】的版本上
--    —— 也就是 class LATERAL 已經帶 left_at IS NULL 的那一版
--    （PR #128，2026-09-20 已套用到 production）。
--    ⚠️ 如果誤用更早的版本覆蓋，left_at 的修正會被【默默退掉】。
--       執行前請先跑最下方的前置檢查確認。
--
-- 這次只做一件事：多回傳一個 error_codes TEXT[] 欄位。
--   · 既有 30 個欄位【一個都沒動、沒改名、沒改順序】
--   · 排序、篩選條件、授權檢查全部不變
--   · 舊的前端不會壞 —— 多一個欄位而已
--
-- 回滾：supabase/migrations/add_writing_queue_error_codes.rollback.sql
-- =====================================================


-- ── 前置檢查：確認要被覆蓋的是【含 left_at 修正】的版本 ──────────
-- 預期：有left_at修正 = true、有error_codes = false、findings表存在 = true
SELECT (pg_get_functiondef(p.oid) ILIKE '%left_at IS NULL%')  AS "有left_at修正",
       (pg_get_functiondef(p.oid) ILIKE '%error_codes%')      AS "有error_codes",
       (to_regclass('public.writing_error_findings') IS NOT NULL) AS "findings表存在"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'writing_admin_queue';


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
        coalesce(cls.names, ARRAY[]::TEXT[]) AS class_names,
        -- ── A8 新增 ──────────────────────────────────────────
        -- 這一篇目前有效分析的 distinct error code。
        --
        -- 🛑 NULL 與 [] 是兩件事，前端不可以混為一談：
        --      NULL → 這篇【沒有已完成的分析】，所以沒有錯誤資料
        --      []   → 有已完成的分析，但沒有 findings
        --
        --    ⚠️ [] 目前還有第二種可能：分析完成了但 findings 尚未物化。
        --       A9 上線後新分析會即時同步，而 production 的 45 篇已全數回填，
        --       所以這種情況實務上不會發生 —— 但它在型別上仍然存在。
        --       要分辨的話用 supabase/tests/staging-verify/04c-analysis-shape.sql。
        --
        --    🛑 [] 是「本篇未發現此類錯誤」，【不是】「這位學生已經學會了」
        --       （TR-12／TR-13）。UI 文案不可以寫成精熟。
        --
        -- ⚠️ 取的是 writing_error_findings 的內容，而那張表只放【最高 COMPLETED
        --    版次】的 findings。上面的 a LATERAL 取的是【最高版次】（可能是 FAILED）。
        --    兩者刻意不同：錯誤清單應該反映最後一次【成功】的分析，
        --    而佇列狀態應該反映最後一次【嘗試】。
        CASE WHEN EXISTS (SELECT 1 FROM public.writing_analyses wa2
                           WHERE wa2.essay_id = s.id AND wa2.status = 'COMPLETED')
             THEN coalesce(errs.codes, ARRAY[]::TEXT[])
             ELSE NULL
        END AS error_codes
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
      LEFT JOIN LATERAL (
        -- 吃 idx_wef_essay。一篇作文的 findings 是個位到數十筆。
        SELECT array_agg(DISTINCT ef.error_code ORDER BY ef.error_code) AS codes
          FROM public.writing_error_findings ef
         WHERE ef.essay_id = s.id
      ) errs ON true
      WHERE s.status = 'SUBMITTED'
    ) q;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION writing_admin_queue IS
  '老師收件匣：已送出的作文 + 學生姓名 + 【目前在籍】班級 + 最新一次分析狀態 + 老師檢閱／講評狀態 + 佇列租約 + 該篇的 error code 清單。僅限管理員。';

-- grant 不重下：CREATE OR REPLACE 不會改 ACL，重下有機會覆寫掉 production 後來調整過的權限。


-- ── 驗證 ─────────────────────────────────────────────────────────
SELECT (pg_get_functiondef(p.oid) ILIKE '%left_at IS NULL%') AS "left_at修正還在",
       (pg_get_functiondef(p.oid) ILIKE '%error_codes%')     AS "error_codes已加入",
       p.prosecdef                                           AS "SECURITY_DEFINER",
       p.proconfig::text                                     AS "search_path",
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'writing_admin_queue';
-- 預期：left_at修正還在 = true、error_codes已加入 = true、
--       SECURITY_DEFINER = true、search_path 為空字串、anon = false、登入者 = true
