-- 🛑 這個檔案【整份就是一個步驟】，可以整份貼進 Supabase SQL Editor。
-- 🛑 只在 gsat-staging 執行，不要在 production。
--
-- 執行順序見 supabase/tests/staging-verify/README.md
--
-- =====================================================
-- V6 三個特別驗證（唯讀）
-- 判讀：「通過」全部是 true
-- =====================================================
WITH latest AS (
  SELECT DISTINCT ON (a.essay_id) a.essay_id, a.error_analysis
    FROM public.writing_analyses a WHERE a.status='COMPLETED'
   ORDER BY a.essay_id, a.analysis_version DESC),
src_dup AS (   -- JSONB 裡「同一篇 + 同 code」出現多次的組合
  SELECT l.essay_id, f ->> 'code' AS code, count(*) AS n
    FROM latest l
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(l.error_analysis -> 'findings')='array'
           THEN l.error_analysis -> 'findings' ELSE '[]'::jsonb END) f
   GROUP BY 1,2 HAVING count(*) > 1),
tbl_dup AS (
  SELECT essay_id, error_code AS code, count(*) AS n
    FROM public.writing_error_findings GROUP BY 1,2 HAVING count(*) > 1)
SELECT '6a 同一篇同 code 多筆：JSONB 的組合數' AS "檢查項",
       (SELECT count(*) FROM src_dup)::text    AS "值",
       true                                    AS "通過"
UNION ALL SELECT '6a 同一篇同 code 多筆：表裡的組合數',
       (SELECT count(*) FROM tbl_dup)::text,
       (SELECT count(*) FROM src_dup) = (SELECT count(*) FROM tbl_dup)
UNION ALL SELECT '6a 每一組的筆數都完全相同（沒有被去重）',
       (SELECT count(*) FROM src_dup s FULL JOIN tbl_dup t
          ON t.essay_id=s.essay_id AND t.code=s.code
        WHERE s.n IS DISTINCT FROM t.n)::text || ' 組不符',
       (SELECT count(*) FROM src_dup s FULL JOIN tbl_dup t
          ON t.essay_id=s.essay_id AND t.code=s.code
        WHERE s.n IS DISTINCT FROM t.n) = 0
-- 6b：production 2026-09-20 量到的是 0 —— 這個情境還沒發生過。
--     staging 若也是 0，代表【這一項在真實資料上無從驗證】，
--     由本機測試的 S1 / S17 以構造資料涵蓋（那兩條是決定性的）。
--     若 > 0，則下一列必須 > 0：那些作文的 findings 必須還在。
UNION ALL SELECT '6b 存在「較新 FAILED 蓋過較舊 COMPLETED」的作文數',
       (SELECT count(DISTINCT a.essay_id) FROM public.writing_analyses a
         WHERE a.status <> 'COMPLETED'
           AND EXISTS (SELECT 1 FROM public.writing_analyses b
                        WHERE b.essay_id=a.essay_id AND b.status='COMPLETED'
                          AND b.analysis_version < a.analysis_version))::text,
       true
UNION ALL SELECT '6b 這些作文的 findings 仍然在（沒被清掉）',
       (SELECT count(*) FROM public.writing_error_findings f
         WHERE EXISTS (SELECT 1 FROM public.writing_analyses a
                        WHERE a.essay_id=f.essay_id AND a.status <> 'COMPLETED'
                          AND EXISTS (SELECT 1 FROM public.writing_analyses b
                                       WHERE b.essay_id=a.essay_id AND b.status='COMPLETED'
                                         AND b.analysis_version < a.analysis_version)))::text
       || ' 筆',
       true
UNION ALL SELECT '6c 表裡沒有重複的 (essay_id, finding_index)',
       (SELECT count(*) FROM (SELECT essay_id, finding_index FROM public.writing_error_findings
                               GROUP BY 1,2 HAVING count(*) > 1) d)::text || ' 組',
       (SELECT count(*) FROM (SELECT essay_id, finding_index FROM public.writing_error_findings
                               GROUP BY 1,2 HAVING count(*) > 1) d) = 0
ORDER BY 1;


-- =====================================================
