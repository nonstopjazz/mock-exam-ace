-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 每篇作文的分數，以及 AI 在 23 個 skill 上各給了什麼評級。
--
-- 🛑 這支是【決定要改哪裡】的那一支，先看它。
--
-- 分數不是 AI 直接給的，是 writing_score_20() 從評級換算的：
--     STRONG 4 / ADEQUATE 3 / DEVELOPING 2 / UNMEASURED 排除在分母外
--     分數 = 20 × 總分 /(4 × 有量到的類別數)
--
-- 所以「分數太高」有兩種可能，修法完全不同：
--
--   (a) AI 評太鬆 —— STRONG 給得太浮濫 → 要改 prompt
--   (b) 換算太寬 —— 評級沒問題但數字偏高 → 要改公式
--
-- 判讀方式：看「STRONG 佔比」。
--   STRONG 佔多數 → 是 (a)。而且要注意：只要 AI 還在說 STRONG，
--   任何「保留 STRONG = 4」的新公式都不可能把 18 分壓到 14 分。
--   那種情況下改公式是在替一個錯誤的評級找數字，不是修正。
SELECT
  s.title                                         AS "作文",
  s.student_id                                    AS "學生",
  a.completed_at                                  AS "分析完成",
  (public.writing_score_20(a.competency_analysis) ->> 'score')::int AS "目前分數",
  (public.writing_score_20(a.competency_analysis) ->> 'measured')::int AS "有量到的類別",

  -- ── 23 個 skill 的評級分布 ──
  count(*) FILTER (WHERE sk ->> 'state' = 'STRONG')     AS "STRONG",
  count(*) FILTER (WHERE sk ->> 'state' = 'ADEQUATE')   AS "ADEQUATE",
  count(*) FILTER (WHERE sk ->> 'state' = 'DEVELOPING') AS "DEVELOPING",
  count(*) FILTER (WHERE sk ->> 'state' = 'UNMEASURED') AS "UNMEASURED",

  -- 🛑 這一欄是關鍵。高 → 是 AI 評太鬆，不是公式問題。
  round(100.0 * count(*) FILTER (WHERE sk ->> 'state' = 'STRONG')
        / nullif(count(*) FILTER (WHERE sk ->> 'state' <> 'UNMEASURED'), 0), 0)
                                                  AS "STRONG 佔比 %"
FROM public.writing_analyses a
JOIN public.writing_submissions s ON s.id = a.essay_id
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(a.competency_analysis -> 'categories') = 'array'
       THEN a.competency_analysis -> 'categories' ELSE '[]'::jsonb END) c
LEFT JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(c -> 'skills') = 'array' THEN c -> 'skills'
       ELSE '[]'::jsonb END) sk ON true
WHERE a.status = 'COMPLETED'
  AND a.competency_analysis IS NOT NULL
GROUP BY s.title, s.student_id, a.completed_at, a.competency_analysis
ORDER BY a.completed_at DESC
LIMIT 50;
