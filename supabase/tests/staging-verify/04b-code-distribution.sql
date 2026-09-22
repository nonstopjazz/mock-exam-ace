-- 🛑 這個檔案【整份就是一個步驟】，可以整份貼進 Supabase SQL Editor。
-- 🟢 【唯讀】—— 不會改變任何資料。staging 與 production 都可以安全執行。
--
-- 執行順序見 supabase/tests/staging-verify/README.md
--
-- =====================================================
-- V4b 17 個 code 各有多少筆（唯讀）
-- 應與回填前直接查 JSONB 的分布完全相同
-- =====================================================
SELECT error_code                       AS "error_code",
       count(DISTINCT student_id)::int  AS "學生數",
       count(DISTINCT essay_id)::int    AS "作文數",
       count(*)::int                    AS "findings數",
       is_fallback_code                 AS "低訊號"
  FROM public.writing_error_findings
 GROUP BY error_code, is_fallback_code
 ORDER BY 3 DESC, 4 DESC;


-- =====================================================
