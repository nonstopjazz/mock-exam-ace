-- 🛑 這個檔案【整份就是一個步驟】，可以整份貼進 Supabase SQL Editor。
-- 🟢 【唯讀】—— 不會改變任何資料。staging 與 production 都可以安全執行。
--
-- 執行順序見 supabase/tests/staging-verify/README.md
--
-- =====================================================
-- V9 效能（唯讀）
-- 判讀：看 Execution Time，以及有沒有吃到 idx_wef_code_time
-- =====================================================
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT f.student_id,
       count(DISTINCT f.essay_id)::int AS essay_count,
       count(*)::int                   AS occurrence_count,
       max(f.essay_submitted_at)       AS last_seen_at
  FROM public.writing_error_findings f
 WHERE f.error_code = 'WRITE_ERR_ARTICLE'
   AND f.essay_submitted_at >= now() - interval '30 days'
 GROUP BY f.student_id
 ORDER BY occurrence_count DESC;
