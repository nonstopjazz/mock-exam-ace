-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 類別內的 round() 把分數墊高了多少。
--
-- ══════════════════════════════════════════════════════════════
-- 🛑 機制
-- ══════════════════════════════════════════════════════════════
--
--   writing_score_20() 每個類別先取 skill 的平均，再 round() 成整數。
--   而 numeric 的 round() 是【四捨五入遠離零】：
--
--       avg(STRONG, STRONG, ADEQUATE, ADEQUATE) = 3.5 → round = 4
--
--   也就是「一半 STRONG、一半 ADEQUATE」的類別，會被算成【完全 STRONG】。
--   而且 .5 永遠往上，不會往下 —— 這個偏差是單向的。
--
--   2026-10-05 那篇 18 分的作文就是這個形狀：
--     STRONG 9 / ADEQUATE 12 / DEVELOPING 2，STRONG 只佔 39%，
--     ADEQUATE 比 STRONG 還多，卻有 3 個類別被算成 4 分。
--
-- 🛑 這【不是】「AI 評太鬆」。50 篇裡有 43 篇的 STRONG 是 0，
--    分數集中在 10–15 —— AI 整體偏嚴。被墊高的是少數混合型的作文。
--
-- 「不做類別內 round」= 直接用原始平均：
--     分數 = 20 × 各類別平均之和 /(4 × 有量到的類別數)
--
-- ⚠️ 去掉 round 不是只會往下。平均 3.4 的類別目前算 3，不 round 算 3.4（偏高）。
--    它消掉的是【.5 單向進位】那個偏差，不是整體打折。差額那欄會如實顯示方向。
WITH per_category AS (
  SELECT a.id AS analysis_id, s.title, s.student_id, a.completed_at,
         c ->> 'code' AS code,
         avg(CASE sk ->> 'state' WHEN 'STRONG' THEN 4 WHEN 'ADEQUATE' THEN 3
                                 WHEN 'DEVELOPING' THEN 2 END) AS raw_avg
  FROM public.writing_analyses a
  JOIN public.writing_submissions s ON s.id = a.essay_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(a.competency_analysis -> 'categories') = 'array'
         THEN a.competency_analysis -> 'categories' ELSE '[]'::jsonb END) c
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c -> 'skills') = 'array' THEN c -> 'skills'
         ELSE '[]'::jsonb END) sk ON true
  WHERE a.status = 'COMPLETED' AND a.competency_analysis IS NOT NULL
  GROUP BY a.id, s.title, s.student_id, a.completed_at, c ->> 'code'
),
agg AS (
  SELECT analysis_id, title, student_id, completed_at,
         count(*)                                   AS measured,
         sum(round(raw_avg))                        AS rounded_sum,
         sum(raw_avg)                               AS raw_sum,
         -- 🛑 剛好落在 .5 的類別數 —— 這些是被單向墊高的那些
         count(*) FILTER (WHERE raw_avg - floor(raw_avg) = 0.5) AS half_cats,
         -- 任何被 round 往上的類別（不只 .5）
         count(*) FILTER (WHERE round(raw_avg) > raw_avg)       AS rounded_up,
         count(*) FILTER (WHERE round(raw_avg) < raw_avg)       AS rounded_down
  FROM per_category WHERE raw_avg IS NOT NULL
  GROUP BY analysis_id, title, student_id, completed_at
)
SELECT title                                                   AS "作文",
       round(20.0 * rounded_sum / (4 * measured))::int          AS "目前",
       round(20.0 * raw_sum     / (4 * measured))::int          AS "不做類別內round",
       round(20.0 * rounded_sum / (4 * measured))::int
         - round(20.0 * raw_sum / (4 * measured))::int          AS "被墊高",
       half_cats                                                AS "🛑剛好.5的類別",
       rounded_up                                               AS "被往上的類別",
       rounded_down                                             AS "被往下的類別",
       round(raw_sum / measured, 2)                             AS "原始平均",
       measured                                                 AS "有量到",
       student_id                                               AS "學生",
       completed_at                                             AS "分析完成"
FROM agg
ORDER BY (round(20.0 * rounded_sum / (4 * measured))::int
          - round(20.0 * raw_sum / (4 * measured))::int) DESC,
         completed_at DESC
LIMIT 60;
