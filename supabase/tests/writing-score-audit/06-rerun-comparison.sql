-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 同一篇作文重跑前後的分數對照。
--
-- 🛑 這是你實際會用的那一支：把老師說「頂多 14 分」的那篇重新批改一次，
--    這裡就會出現兩列（舊的 analysis_version 與新的），分數並排。
--
-- 為什麼有得比：writing_analyses 的唯一索引只限制
-- QUEUED / ANALYZING / ANALYZED（同時只能有一次分析在飛行中），
-- COMPLETED 與 FAILED【不受限】—— 所以歷次版本都留著
-- （create_writing_analyses.sql:190）。
--
-- 🛑 只列出有兩次以上 COMPLETED 分析的作文。只跑過一次的作文沒有東西可比，
--    列出來只會讓這張表看起來「大部分都沒有變化」。
WITH per_analysis AS (
  SELECT a.id, a.essay_id, a.analysis_version, a.completed_at, a.model,
         s.title, s.student_id,
         (public.writing_score_20(a.competency_analysis) ->> 'score')::int    AS score,
         (public.writing_score_20(a.competency_analysis) ->> 'measured')::int AS measured,
         count(*) FILTER (WHERE sk ->> 'state' = 'STRONG')     AS n_strong,
         count(*) FILTER (WHERE sk ->> 'state' = 'ADEQUATE')   AS n_adequate,
         count(*) FILTER (WHERE sk ->> 'state' = 'DEVELOPING') AS n_developing,
         count(*) FILTER (WHERE sk ->> 'state' = 'MINIMAL')    AS n_minimal,
         count(*) FILTER (WHERE sk ->> 'state' = 'UNMEASURED') AS n_unmeasured
    FROM public.writing_analyses a
    JOIN public.writing_submissions s ON s.id = a.essay_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(a.competency_analysis -> 'categories') = 'array'
           THEN a.competency_analysis -> 'categories' ELSE '[]'::jsonb END) c
    LEFT JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(c -> 'skills') = 'array' THEN c -> 'skills'
           ELSE '[]'::jsonb END) sk ON true
   WHERE a.status = 'COMPLETED' AND a.competency_analysis IS NOT NULL
   GROUP BY a.id, a.essay_id, a.analysis_version, a.completed_at, a.model,
            s.title, s.student_id, a.competency_analysis
),
multi AS (
  SELECT essay_id FROM per_analysis GROUP BY essay_id HAVING count(*) > 1
)
SELECT p.title                      AS "作文",
       p.analysis_version           AS "第幾次分析",
       p.completed_at               AS "分析完成",
       p.score                      AS "分數",
       -- 🛑 跟【同一篇】上一次分析的差額。這一欄才是重跑的結果。
       p.score - lag(p.score) OVER (PARTITION BY p.essay_id ORDER BY p.analysis_version)
                                    AS "與上次的差",
       p.n_minimal                  AS "MINIMAL",
       p.n_developing               AS "DEVELOPING",
       p.n_adequate                 AS "ADEQUATE",
       p.n_strong                   AS "STRONG",
       p.n_unmeasured               AS "未評量",
       p.measured                   AS "計分面向數",
       CASE
         WHEN lag(p.score) OVER (PARTITION BY p.essay_id ORDER BY p.analysis_version) IS NULL
           THEN '（基準）'
         WHEN p.n_minimal > 0 AND p.score
              < lag(p.score) OVER (PARTITION BY p.essay_id ORDER BY p.analysis_version)
           THEN '✅ 用到 MINIMAL 而且分數下來了'
         WHEN p.n_minimal = 0 AND p.score
              = lag(p.score) OVER (PARTITION BY p.essay_id ORDER BY p.analysis_version)
           THEN '沒用到 MINIMAL，分數不動（這篇不爛，正常）'
         WHEN p.n_minimal = 0
           THEN '沒用到 MINIMAL，但分數變了 —— 是 AI 評級本身的浮動，不是這次改動'
         ELSE ''
       END                          AS "判讀",
       p.model                      AS "模型",
       p.student_id                 AS "學生"
  FROM per_analysis p
  JOIN multi m ON m.essay_id = p.essay_id
 ORDER BY p.title, p.analysis_version;

-- 🛑 「沒用到 MINIMAL，但分數變了」要留意：
--    DeepSeek 對同一篇作文的兩次分析本來就不會完全一致。
--    所以單一篇的差額【證明不了】這次改動的效果 ——
--    要看的是 05 那支的整體分布，以及這一篇的 MINIMAL 欄是不是真的大於 0。
