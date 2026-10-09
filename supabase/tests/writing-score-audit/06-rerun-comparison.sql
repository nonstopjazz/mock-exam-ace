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
         a.prompt_version,
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
            a.prompt_version, s.title, s.student_id, a.competency_analysis
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
       -- 🛑 這一欄是 2026-10-09 加 prompt_version 之後才答得出來的。
       --    在那之前「分數沒變」有兩種解讀：新 prompt 判斷如此，
       --    還是根本跑的是舊 prompt。那兩種完全相反，而資料裡分不出來。
       CASE
         -- 🛑 第一列沒有「上一版」可以比。少了這一條，基準列會拿自己去跟
         --    不存在的前一列比，印出「有一版沒有版本標記」這種無意義的話
         --    （2026-10-09 冒煙測試抓到的）。
         WHEN lag(p.analysis_version) OVER (PARTITION BY p.essay_id ORDER BY p.analysis_version)
                IS NULL
           THEN '（基準，沒有上一版可比）'
         WHEN lag(p.prompt_version) OVER (PARTITION BY p.essay_id ORDER BY p.analysis_version)
                IS NULL AND p.prompt_version IS NULL
           THEN '兩版都早於版本追蹤'
         WHEN lag(p.prompt_version) OVER (PARTITION BY p.essay_id ORDER BY p.analysis_version)
                IS NULL OR p.prompt_version IS NULL
           THEN '🛑 有一版沒有版本標記 —— 分不出 prompt 是否相同'
         WHEN p.prompt_version
              = lag(p.prompt_version) OVER (PARTITION BY p.essay_id ORDER BY p.analysis_version)
           THEN '同一版 prompt'
         ELSE '✅ prompt 不同版'
       END                          AS "prompt 比對",
       coalesce(p.prompt_version, '（無標記）') AS "prompt 版本",
       CASE
         WHEN lag(p.score) OVER (PARTITION BY p.essay_id ORDER BY p.analysis_version) IS NULL
           THEN '（基準）'
         WHEN p.n_minimal > 0 AND p.score
              < lag(p.score) OVER (PARTITION BY p.essay_id ORDER BY p.analysis_version)
           THEN '✅ 用到 MINIMAL 而且分數下來了'
         -- 🛑 「分數不動」只有在【確定是不同版 prompt】時才代表
         --    「新 prompt 看了這篇，判斷它沒有那麼糟」。
         --    同一版或分不出來的時候，它什麼都不代表。
         WHEN p.n_minimal = 0 AND p.score
              = lag(p.score) OVER (PARTITION BY p.essay_id ORDER BY p.analysis_version)
              AND p.prompt_version IS DISTINCT FROM
                  lag(p.prompt_version) OVER (PARTITION BY p.essay_id ORDER BY p.analysis_version)
              AND p.prompt_version IS NOT NULL
              AND lag(p.prompt_version) OVER (PARTITION BY p.essay_id ORDER BY p.analysis_version)
                  IS NOT NULL
           THEN '🛑 新 prompt 沒有用 MINIMAL，分數不動 —— 門檻可能太緊'
         WHEN p.n_minimal = 0 AND p.score
              = lag(p.score) OVER (PARTITION BY p.essay_id ORDER BY p.analysis_version)
           THEN '沒用到 MINIMAL，分數不動（看左邊的 prompt 比對再判斷）'
         WHEN p.n_minimal = 0
           THEN '沒用到 MINIMAL，但分數變了 —— 可能是 AI 評級本身的浮動'
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
--
-- 🛑 先看「prompt 比對」那一欄，再看「判讀」。
--
--    2026-10-08 就是在這裡卡住的：「自習室、課後輔導與時間安排」第 2 版
--    完成於 07:44:02，而確定是新 prompt 的那一篇完成於 07:45:44 ——
--    相差 102 秒，而當時【沒有任何欄位】分得出前者用的是哪一版。
--    於是「分數沒變」有兩種完全相反的解讀，兩種都說得通。
--
--    add_writing_analyses_prompt_version.sql 之後，新的分析都會帶指紋，
--    這一欄就直接回答了。舊的分析仍然是「（無標記）」—— 刻意不回填，
--    因為回填就要猜，而猜出來的版本號正是這個欄位要消滅的東西。
