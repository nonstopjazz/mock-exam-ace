-- 🟢 【唯讀】A6 驗收（D8 = S-b）
-- 選 ARTICLE 當入列條件，看 findings 最多的那一位學生的【全部】code。
-- 🛑 特別看有沒有只出現一次的 code —— 那是「無門檻」在真實資料上的證據。
-- 🛑 也看 is_selected：ARTICLE 應為 true，其餘 false。
WITH res AS (
  SELECT public.writing_admin_student_errors(
           NULL, NULL, NULL, NULL, ARRAY['WRITE_ERR_ARTICLE'], 1) AS j)
SELECT (r ->> 'student_name')           AS "學生",
       (r ->> 'error_code')             AS "error_code",
       (r ->> 'essay_count')::int       AS "篇數",
       (r ->> 'occurrence_count')::int  AS "findings",
       (r ->> 'last_seen_at')::date     AS "最近",
       (r ->> 'is_selected')::boolean   AS "老師選的",
       (r ->> 'is_fallback_code')::boolean AS "低訊號"
  FROM res, jsonb_array_elements(res.j -> 'rows') WITH ORDINALITY AS x(r, ord)
 ORDER BY x.ord;
