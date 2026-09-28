-- =====================================================
-- writing_admin_queue()：把排序補成【全序】
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
--
-- 【問題】
--
--   原本是 ORDER BY submitted_at DESC，沒有次要條件。兩篇 submitted_at
--   完全相同時，PostgreSQL 回傳的先後【不保證】——同一支查詢跑兩次可以
--   得到不同的順序，而且不會有任何徵兆。
--
-- 🛑 為什麼這不只是「清單順序會晃」
--
--   src/hooks/learn/useReviewQueueNav.ts 用這個順序算「下一篇」：
--
--       const index = pending.findIndex(r => r.essay_id === currentEssayId);
--       const next  = index >= 0 ? pending[index + 1] : pending[0];
--
--   它每次進入檢閱頁都重新取一次。順序在兩次取之間換掉的話，老師按
--   「下一篇」會回到剛剛看過的那一篇，而另一篇【永遠輪不到】。
--
--   老師不會發現。他看到的是一份看起來正常的清單，只是有一篇作文
--   從來沒有出現在他的動線上。
--
--
-- 【修法】
--
--   加上 essay_id 當最後的次要排序。它是主鍵，所以 (submitted_at, essay_id)
--   一定是全序——同樣的資料，每次都是同樣的順序。
--
--   ⚠️ essay_id 的大小本身沒有意義（UUID 不是遞增的），它只負責
--      「在 submitted_at 相同時給一個固定的答案」。要有意義的次序，
--      submitted_at 已經在做那件事了。
--
--   🛑 不加 NULLS LAST：writing_submissions 有 CHECK
--      (status = 'SUBMITTED' AND submitted_at IS NOT NULL)，
--      所以這支查的範圍內 submitted_at 不可能是 NULL。加了是死碼。
--
--
-- ⚠️ 除了 ORDER BY 那一行，函式本體與 add_writing_queue_error_codes.sql
--    的版本【逐字相同】。grant 不重下——CREATE OR REPLACE 不改 ACL。
--
-- 回滾：supabase/migrations/fix_writing_queue_order.rollback.sql
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
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_admin_queue：僅限管理員' USING ERRCODE = '42501';
  END IF;

  -- 🛑 essay_id 是次要排序，讓 (submitted_at, essay_id) 成為全序。
  --    少了它，submitted_at 相同的兩篇每次查回來的先後可能不同，
  --    而檢閱動線的「下一篇」就會漏掉其中一篇。
  SELECT coalesce(
           jsonb_agg(row_to_json(q)::jsonb
                     ORDER BY q.submitted_at DESC, q.essay_id DESC),
           '[]'::jsonb)
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
        -- 🛑 NULL 與 [] 是兩件事：
        --      NULL → 這篇沒有已完成的分析
        --      []   → 有已完成的分析，但沒有 findings
        --    而 [] 是「本篇未發現此類錯誤」，不是「這位學生已經學會了」。
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
        -- 只列目前在籍的班（S1 語意）
        SELECT array_agg(c.name ORDER BY c.name) AS names
          FROM public.learn_class_members m
          JOIN public.learn_classes c ON c.id = m.class_id
         WHERE m.student_id = s.student_id
           AND m.left_at IS NULL
           AND c.status = 'ACTIVE'
      ) cls ON true
      LEFT JOIN LATERAL (
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
  '老師收件匣：已送出的作文 + 學生姓名 + 【目前在籍】班級 + 最新一次分析狀態 + 老師檢閱／講評狀態 + 佇列租約 + 該篇的 error code 清單。依 (submitted_at, essay_id) 全序排列。僅限管理員。';


-- ── 驗證（唯讀）───────────────────────────────────────
-- 第一列：函式改到了沒。
-- 第二段：你的資料裡到底有沒有真的中這個問題。
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'writing_admin_queue'
      AND pg_get_functiondef(p.oid) LIKE '%q.essay_id DESC%')  AS "已加上次要排序（應為 1）",
  (SELECT count(*) FROM public.writing_submissions
    WHERE status = 'SUBMITTED')                                AS "收件匣總篇數";

-- 🛑 這一段是重點：submitted_at 完全相同的作文有幾組。
--    回 0 列 = 你的資料沒有中過這個問題，這次是預防。
--    有列   = 那幾篇的先後本來就不固定，老師可能已經漏看過。
SELECT
  submitted_at                                     AS "送出時間",
  count(*)                                         AS "同一時刻幾篇",
  string_agg(id::text, ', ' ORDER BY id)           AS "是哪幾篇"
FROM public.writing_submissions
WHERE status = 'SUBMITTED'
GROUP BY submitted_at
HAVING count(*) > 1
ORDER BY submitted_at DESC;
