-- 🛑 這個檔案【整份就是一個步驟】，可以整份貼進 Supabase SQL Editor。
-- 🟢 【唯讀】—— 不會改變任何資料。staging 與 production 都可以安全執行。
--
-- 執行順序見 supabase/tests/staging-verify/README.md
--
-- =====================================================
-- V7 老師實際會用的查詢：誰犯過 WRITE_ERR_ARTICLE（唯讀）
-- 這就是 A5 Error → Students 將來要包成 RPC 的核心
-- =====================================================
SELECT f.student_id,
       coalesce(public.learn_display_name(f.student_id), '（查不到姓名）') AS "學生",
       count(DISTINCT f.essay_id)::int AS "幾篇作文出現",
       count(*)::int                   AS "findings總數",
       max(f.essay_submitted_at)::date AS "最近一次",
       min(f.essay_submitted_at)::date AS "最早一次"
  FROM public.writing_error_findings f
 WHERE f.error_code = 'WRITE_ERR_ARTICLE'
 GROUP BY f.student_id
 ORDER BY 4 DESC, 5 DESC;


-- =====================================================
