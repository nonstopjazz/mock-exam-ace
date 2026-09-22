-- 🟢 【唯讀】staging 與 production 都可以安全執行。
SELECT set_config('request.jwt.claim.sub',
                  (SELECT id::text FROM auth.users WHERE email = 'nonstopjazz@gmail.com'),
                  false) AS "已取得管理員身分";

-- =====================================================
-- E2  A8 的三項完整性檢查
--
-- 判讀：三列「通過」都必須是 true。
-- =====================================================
WITH q AS (SELECT jsonb_array_elements(public.writing_admin_queue()) AS r)
SELECT '1. 既有欄位沒有消失（class_names 還在）'  AS "檢查項",
       (SELECT count(*) FROM q WHERE q.r ? 'class_names')::text || ' / '
       || (SELECT count(*) FROM q)::text || ' 列有這個欄位'             AS "結果",
       (SELECT count(*) FROM q WHERE q.r ? 'class_names')
         = (SELECT count(*) FROM q)                                      AS "通過"
UNION ALL
SELECT '2. 每一列都有 error_codes 欄位（可能是 null）',
       (SELECT count(*) FROM q WHERE q.r ? 'error_codes')::text || ' / '
       || (SELECT count(*) FROM q)::text || ' 列有這個欄位',
       (SELECT count(*) FROM q WHERE q.r ? 'error_codes')
         = (SELECT count(*) FROM q)
UNION ALL
SELECT '3. error_codes 與 findings 表對得起來',
       (SELECT count(*) FROM q
         WHERE jsonb_typeof(q.r -> 'error_codes') = 'array'
           AND (SELECT count(DISTINCT f.error_code) FROM public.writing_error_findings f
                 WHERE f.essay_id = (q.r ->> 'essay_id')::uuid)
               <> jsonb_array_length(q.r -> 'error_codes'))::text || ' 列不符',
       (SELECT count(*) FROM q
         WHERE jsonb_typeof(q.r -> 'error_codes') = 'array'
           AND (SELECT count(DISTINCT f.error_code) FROM public.writing_error_findings f
                 WHERE f.essay_id = (q.r ->> 'essay_id')::uuid)
               <> jsonb_array_length(q.r -> 'error_codes')) = 0
ORDER BY 1;
