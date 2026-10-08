-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 等距改版的驗收：新舊分數逐篇對照，並確認類別內沒有再 round。
--
-- 🛑 「新（重算）」必須等於學生實際看到的分數。
--    這一欄是在查詢裡照新公式重算的；它跟 writing_score_20() 對不上，
--    就代表兩邊有一邊寫錯了 —— 而學生看到的是函式那一邊。
--
-- 🛑 「舊公式」是改版前的算法（DEV 2 / ADQ 3 / STR 4，類別內 round），
--    留著是為了看這次改動實際動了多少，不是還在用的東西。
--
-- 🛑 含 MINIMAL 的作文，「舊公式」與「降幅」會是空的 —— 不是壞了。
--    舊公式那套賦值裡沒有 MINIMAL 這個狀態，拿它來對照等於憑空造一個
--    「如果當時就有這個狀態」的數字。那種數字看起來有意義，其實沒有。
--    要看 MINIMAL 帶來的效果請用 05-minimal-distribution.sql。
--
-- 改版的兩個理由（詳見 change_writing_score_20_even_spacing.sql）：
--   • 2/3/4 讓下限卡在 10 分，整個下半部量表用不到（等距後是 7）
--   • 類別內的 round() 單向墊高：avg(STRONG, ADEQUATE) = 2.5 在舊公式是
--     avg(4,3) = 3.5 → round 4，把「一半 STRONG」算成【完全 STRONG】
WITH per_category AS (
  SELECT a.id AS analysis_id, s.title, s.student_id, a.completed_at,
         a.competency_analysis,
         c ->> 'code' AS code,
         -- 現行：等距，不 round。MINIMAL = 0 要算進分母（不是略過）
         avg(CASE sk ->> 'state' WHEN 'STRONG' THEN 3 WHEN 'ADEQUATE' THEN 2
                                 WHEN 'DEVELOPING' THEN 1
                                 WHEN 'MINIMAL' THEN 0 END) AS new_avg,
         -- 舊：2/3/4，類別內 round
         avg(CASE sk ->> 'state' WHEN 'STRONG' THEN 4 WHEN 'ADEQUATE' THEN 3
                                 WHEN 'DEVELOPING' THEN 2 END) AS old_avg,
         -- 這個類別有沒有 MINIMAL —— 有的話舊公式不可比
         count(*) FILTER (WHERE sk ->> 'state' = 'MINIMAL') > 0 AS has_minimal
  FROM public.writing_analyses a
  JOIN public.writing_submissions s ON s.id = a.essay_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(a.competency_analysis -> 'categories') = 'array'
         THEN a.competency_analysis -> 'categories' ELSE '[]'::jsonb END) c
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c -> 'skills') = 'array' THEN c -> 'skills'
         ELSE '[]'::jsonb END) sk ON true
  WHERE a.status = 'COMPLETED' AND a.competency_analysis IS NOT NULL
  GROUP BY a.id, s.title, s.student_id, a.completed_at, a.competency_analysis, c ->> 'code'
),
agg AS (
  SELECT analysis_id, title, student_id, completed_at, competency_analysis,
         count(*)              AS measured,
         sum(new_avg)          AS new_sum,
         sum(round(old_avg))   AS old_sum,
         -- 舊公式被 round 往上推的類別數（.5 永遠往上）
         count(*) FILTER (WHERE round(old_avg) > old_avg) AS old_rounded_up,
         bool_or(has_minimal)  AS any_minimal
  FROM per_category WHERE new_avg IS NOT NULL
  GROUP BY analysis_id, title, student_id, completed_at, competency_analysis
)
SELECT title                                                AS "作文",
       (public.writing_score_20(competency_analysis) ->> 'score')::int AS "學生看到的",
       round(20.0 * new_sum / (3 * measured))::int           AS "新（重算）",
       -- 🛑 含 MINIMAL 時舊公式不可比，留空而不是算一個假的數字
       CASE WHEN NOT any_minimal
            THEN round(20.0 * old_sum / (4 * measured))::int END AS "舊公式",
       CASE WHEN NOT any_minimal
            THEN round(20.0 * old_sum / (4 * measured))::int
                 - round(20.0 * new_sum / (3 * measured))::int END AS "降幅",
       old_rounded_up                                       AS "舊公式被墊高的類別",
       CASE WHEN (public.writing_score_20(competency_analysis) ->> 'score')::int
                 = round(20.0 * new_sum / (3 * measured))::int
            THEN '✅ 相符'
            ELSE '🛑 不符 —— 函式與重算有一邊寫錯了' END     AS "驗收",
       round(new_sum / measured, 2)                          AS "新原始平均",
       measured                                              AS "有量到",
       student_id                                            AS "學生",
       completed_at                                          AS "分析完成"
FROM agg
ORDER BY completed_at DESC
LIMIT 60;
