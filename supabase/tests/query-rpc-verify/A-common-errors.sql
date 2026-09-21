-- 🟢 【唯讀】staging 與 production 都可以安全執行。
-- A4 驗收：前 10 個 code（依學生數排序）
SELECT (r ->> 'error_code')                 AS "error_code",
       (r ->> 'student_count')::int         AS "學生數",
       (r ->> 'essay_count')::int           AS "作文數",
       (r ->> 'occurrence_count')::int      AS "findings數",
       (r ->> 'is_fallback_code')::boolean  AS "低訊號",
       (r ->> 'last_seen_at')::date         AS "最近一次"
  FROM jsonb_array_elements(
         public.writing_admin_error_overview(NULL, NULL, NULL, NULL, NULL, 10) -> 'rows'
       ) WITH ORDINALITY AS x(r, ord)
 ORDER BY x.ord;
