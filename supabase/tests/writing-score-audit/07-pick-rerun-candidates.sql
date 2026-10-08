-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 挑哪幾篇值得重跑，來驗收 MINIMAL 有沒有效。
--
-- 🛑 為什麼需要這一支：
--    直覺會想重跑「老師覺得給太高」的那篇。那是錯的樣本 ——
--    那篇是【高分】作文，而 MINIMAL 改的是量表的【底部】。
--    好作文不會被評出 MINIMAL，重跑它什麼都不會變，
--    然後我們會以為改動沒生效，實際上是挑錯了。
--
--    （而且「給太高」那件事等距改版已經處理掉了：那篇 18 → 15。）
--
-- 要重跑的是現在卡在 7–10 分那一群 —— 底部擠在一起、分辨不出好壞的那些。
-- 這支把它們排在最前面，附上評級組成，讓你認得出是哪幾篇。
--
-- 🛑 最後的判斷是你的，不是這支查詢的。
--    「建議」欄只會說哪幾篇【位置對】；哪幾篇真的爛只有老師知道。
--    挑 2–3 篇你自己看過、確定寫得差的，重跑它們。
--    每一次重跑都是真的 DeepSeek 費用，所以不要整批重跑。
WITH latest AS (
  -- 🛑 只取每篇最新的那一版。不然已經重跑過的作文會出現兩列，
  --    看起來像有兩篇作文。
  SELECT DISTINCT ON (a.essay_id)
         a.id, a.essay_id, a.analysis_version, a.completed_at, a.competency_analysis
    FROM public.writing_analyses a
   WHERE a.status = 'COMPLETED' AND a.competency_analysis IS NOT NULL
   ORDER BY a.essay_id, a.analysis_version DESC
),
scored AS (
  SELECT l.essay_id, l.analysis_version, l.completed_at,
         s.title, s.student_id,
         (public.writing_score_20(l.competency_analysis) ->> 'score')::int    AS score,
         (public.writing_score_20(l.competency_analysis) ->> 'measured')::int AS measured,
         count(*) FILTER (WHERE sk ->> 'state' = 'STRONG')     AS n_strong,
         count(*) FILTER (WHERE sk ->> 'state' = 'ADEQUATE')   AS n_adequate,
         count(*) FILTER (WHERE sk ->> 'state' = 'DEVELOPING') AS n_developing,
         count(*) FILTER (WHERE sk ->> 'state' = 'MINIMAL')    AS n_minimal,
         count(*) FILTER (WHERE sk ->> 'state' = 'UNMEASURED') AS n_unmeasured
    FROM latest l
    JOIN public.writing_submissions s ON s.id = l.essay_id
    CROSS JOIN LATERAL jsonb_array_elements(l.competency_analysis -> 'categories') c
    LEFT JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(c -> 'skills') = 'array' THEN c -> 'skills'
           ELSE '[]'::jsonb END) sk ON true
   GROUP BY l.essay_id, l.analysis_version, l.completed_at,
            s.title, s.student_id, l.competency_analysis
)
SELECT title                AS "作文",
       score                AS "目前分數",
       CASE
         WHEN n_minimal > 0
           THEN '✅ 已經重跑過了（有 MINIMAL），看 06 的對照'
         WHEN score IS NULL
           THEN '—— 沒有分數，不適合當樣本'
         WHEN score BETWEEN 7 AND 10
           THEN '🛑 位置最對 —— 底部擠在一起的就是這一群'
         WHEN score BETWEEN 11 AND 13
           THEN '可以，但沒那麼典型'
         ELSE '不適合 —— 分數偏高，不會評出 MINIMAL'
       END                  AS "建議",
       n_developing         AS "DEVELOPING",
       n_adequate           AS "ADEQUATE",
       n_strong             AS "STRONG",
       n_minimal            AS "MINIMAL",
       n_unmeasured         AS "未評量",
       measured             AS "計分面向數",
       analysis_version     AS "已分析幾次",
       completed_at         AS "分析完成",
       student_id           AS "學生",
       essay_id             AS "作文 id"
  FROM scored
 -- 分數低的排前面；NULL 排最後（它們不是樣本）
 ORDER BY score NULLS LAST, n_developing DESC
 LIMIT 40;

-- 怎麼用：
--   1. 看「建議」是 🛑 的那幾列，從標題認出是哪幾篇
--   2. 挑 2–3 篇你自己確定寫得差的
--   3. 進 /admin/writing/<作文 id>，按「重新批改」
--   4. 跑 06 看那幾篇的新舊並排，跑 05 看整體有沒有崩
--
-- 🛑 一篇證明不了什麼：DeepSeek 對同一篇的兩次分析本來就會浮動。
--    要看的是「MINIMAL 欄真的 > 0」，而不只是「分數變低了」。
