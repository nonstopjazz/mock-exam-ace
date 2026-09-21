-- 🟢 【唯讀】A5 驗收：誰犯過 WRITE_ERR_ARTICLE
-- 🛑 特別看清單尾端 —— 1 篇 / 1 finding 的學生必須在裡面
SELECT (r ->> 'student_name')            AS "學生",
       (r ->> 'essay_count')::int        AS "幾篇作文",
       (r ->> 'occurrence_count')::int   AS "findings數",
       (r ->> 'first_seen_at')::date     AS "最早",
       (r ->> 'last_seen_at')::date      AS "最近",
       (r -> 'matched_codes')            AS "中的code"
  FROM jsonb_array_elements(
         public.writing_admin_error_students(
           NULL, NULL, NULL, NULL, ARRAY['WRITE_ERR_ARTICLE'], 200) -> 'rows'
       ) WITH ORDINALITY AS x(r, ord)
 ORDER BY x.ord;
