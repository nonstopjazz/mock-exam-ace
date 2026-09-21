-- 🟢 【唯讀】A7 驗收：drill-down
-- 取 A6 選出的那位學生，看他 findings 最多的那個 code 的完整紀錄。
-- 🛑 correction 原樣回傳，不截斷 —— 約 15% 是整句改寫，這裡看得到。
WITH picked AS (
  SELECT (r ->> 'student_id')::uuid AS sid, r ->> 'error_code' AS code
    FROM jsonb_array_elements(
           public.writing_admin_student_errors(
             NULL,NULL,NULL,NULL, ARRAY['WRITE_ERR_ARTICLE'], 1) -> 'rows') r
   ORDER BY (r ->> 'occurrence_count')::int DESC
   LIMIT 1)
SELECT (r ->> 'essay_submitted_at')::date AS "日期",
       (r ->> 'essay_topic')              AS "題目",
       (r ->> 'error_code')               AS "code",
       (r ->> 'quote')                    AS "原文",
       (r ->> 'correction')               AS "修正",
       left(r ->> 'reason', 60)           AS "說明",
       length(r ->> 'correction')         AS "修正長度"
  FROM picked p,
       jsonb_array_elements(
         public.writing_admin_error_findings(p.sid, p.code, NULL,NULL,NULL,NULL, 20) -> 'rows'
       ) WITH ORDINALITY AS x(r, ord)
 ORDER BY x.ord;
