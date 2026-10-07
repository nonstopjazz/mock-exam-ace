-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 追溯影響的總結：改公式會動到幾篇、平均降多少、目前的分數分布。
--
-- 🛑 先看「有分數的篇數」。那就是改公式會【立刻改變顯示】的篇數 ——
--    分數沒有存成欄位，是讀取時算的。
WITH per_category AS (
  SELECT a.id AS analysis_id, c ->> 'code' AS code,
    avg(CASE sk ->> 'state' WHEN 'STRONG' THEN 4 WHEN 'ADEQUATE' THEN 3
                            WHEN 'DEVELOPING' THEN 2 END) AS now_pts,
    avg(CASE sk ->> 'state' WHEN 'STRONG' THEN 4 WHEN 'ADEQUATE' THEN 2
                            WHEN 'DEVELOPING' THEN 1 END) AS a_pts,
    avg(CASE sk ->> 'state' WHEN 'STRONG' THEN 3 WHEN 'ADEQUATE' THEN 2
                            WHEN 'DEVELOPING' THEN 1 END) AS b_pts
  FROM public.writing_analyses a
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(a.competency_analysis -> 'categories') = 'array'
         THEN a.competency_analysis -> 'categories' ELSE '[]'::jsonb END) c
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c -> 'skills') = 'array' THEN c -> 'skills'
         ELSE '[]'::jsonb END) sk ON true
  WHERE a.status = 'COMPLETED' AND a.competency_analysis IS NOT NULL
  GROUP BY a.id, c ->> 'code'
),
scored AS (
  SELECT analysis_id, count(*) AS measured,
         sum(round(now_pts)) AS now_sum, sum(round(a_pts)) AS a_sum,
         sum(round(b_pts)) AS b_sum
  FROM per_category WHERE now_pts IS NOT NULL GROUP BY analysis_id
),
final AS (
  SELECT round(20.0 * now_sum / (4 * measured))::int AS now_s,
         round(20.0 * a_sum   / (4 * measured))::int AS a_s,
         round(20.0 * b_sum   / (4 * measured))::int AS b_s
  FROM scored
),
states AS (
  SELECT count(*) FILTER (WHERE sk ->> 'state' = 'STRONG')     AS n_strong,
         count(*) FILTER (WHERE sk ->> 'state' = 'ADEQUATE')   AS n_adequate,
         count(*) FILTER (WHERE sk ->> 'state' = 'DEVELOPING') AS n_developing,
         count(*) FILTER (WHERE sk ->> 'state' = 'UNMEASURED') AS n_unmeasured
  FROM public.writing_analyses a
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(a.competency_analysis -> 'categories') = 'array'
         THEN a.competency_analysis -> 'categories' ELSE '[]'::jsonb END) c
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c -> 'skills') = 'array' THEN c -> 'skills'
         ELSE '[]'::jsonb END) sk ON true
  WHERE a.status = 'COMPLETED' AND a.competency_analysis IS NOT NULL
)
SELECT '🛑 有分數的篇數（改公式會立刻改變這麼多篇的顯示）' AS "項目",
       (SELECT count(*)::text FROM final) AS "數字"
UNION ALL SELECT '目前平均分數',
       (SELECT round(avg(now_s), 1)::text FROM final)
UNION ALL SELECT '目前最低 / 最高',
       (SELECT min(now_s) || ' / ' || max(now_s) FROM final)
UNION ALL SELECT '只改公式的平均（DEV 1 / ADQ 2 / STR 4）',
       (SELECT round(avg(a_s), 1)::text FROM final)
UNION ALL SELECT '只改公式的平均降幅',
       (SELECT round(avg(now_s - a_s), 1)::text FROM final)
UNION ALL SELECT '🛑 AI 評嚴一級的平均',
       (SELECT round(avg(b_s), 1)::text FROM final)
UNION ALL SELECT '🛑 AI 評嚴一級的平均降幅',
       (SELECT round(avg(now_s - b_s), 1)::text FROM final)
UNION ALL SELECT '　',  '　'
UNION ALL SELECT '── 全部作文的評級分布（判斷 AI 鬆不鬆）──', ''
UNION ALL SELECT 'STRONG',     (SELECT n_strong::text     FROM states)
UNION ALL SELECT 'ADEQUATE',   (SELECT n_adequate::text   FROM states)
UNION ALL SELECT 'DEVELOPING', (SELECT n_developing::text FROM states)
UNION ALL SELECT 'UNMEASURED', (SELECT n_unmeasured::text FROM states)
UNION ALL SELECT '🛑 STRONG 佔比 %（有量到的之中）',
       (SELECT round(100.0 * n_strong / nullif(n_strong + n_adequate + n_developing, 0), 0)::text
          FROM states);
