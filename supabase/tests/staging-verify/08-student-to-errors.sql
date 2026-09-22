-- 🛑 這個檔案【整份就是一個步驟】，可以整份貼進 Supabase SQL Editor。
-- 🟢 【唯讀】—— 不會改變任何資料。staging 與 production 都可以安全執行。
--
-- 執行順序見 supabase/tests/staging-verify/README.md
--
-- =====================================================
-- V8 Student → Errors：出現最多錯誤的那一位，列出他全部的 code（唯讀）
-- 這就是 A6 將來要包成 RPC 的核心
-- 🔴 重點：只出現一次的 code 也必須在列表裡
-- =====================================================
WITH top_student AS (
  SELECT student_id FROM public.writing_error_findings
   GROUP BY student_id ORDER BY count(*) DESC LIMIT 1)
SELECT coalesce(public.learn_display_name(f.student_id), '（查不到姓名）') AS "學生",
       f.error_code                     AS "error_code",
       count(DISTINCT f.essay_id)::int  AS "篇數",
       count(*)::int                    AS "findings",
       max(f.essay_submitted_at)::date  AS "最近一次",
       f.is_fallback_code               AS "低訊號"
  FROM public.writing_error_findings f
  JOIN top_student t ON t.student_id = f.student_id
 GROUP BY f.student_id, f.error_code, f.is_fallback_code
 ORDER BY 4 DESC, 3 DESC;


-- =====================================================
