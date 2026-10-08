-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 在跑 add_writing_state_minimal.sql 之前【必須】先跑這支。
--
-- 🛑 為什麼：
--    那支 migration 把 writing_score_20() 改成「遇到不認得的 state 就整篇沒有分數」，
--    取代原本的「當成沒量到、排除在分母外」。
--
--    這個改動是為了擋住一個很難發現的失敗：如果 prompt 先上線、migration 還沒跑，
--    新的 MINIMAL 會被排除在分母外 —— 最爛的那幾項不算分，爛作文的分數反而【變高】。
--
--    但它有代價：萬一 production 裡存著第五種 state（例如契約收緊之前寫入的舊資料），
--    那些作文的分數會立刻變成「讀不到」。
--
--    所以先把實際存在的 state 字彙數出來。只有在第 2 列是 0 的時候才可以跑 migration。
WITH s AS (
  SELECT a.id,
         sk ->> 'state' AS state
    FROM public.writing_analyses a
    CROSS JOIN LATERAL jsonb_array_elements(a.competency_analysis -> 'categories') c
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(c -> 'skills') = 'array' THEN c -> 'skills'
           ELSE '[]'::jsonb END) sk
   WHERE a.status = 'COMPLETED'
     AND jsonb_typeof(a.competency_analysis -> 'categories') = 'array'
)
SELECT coalesce(state, '(沒有 state 欄位)') AS "state 值",
       count(*)                            AS "出現次數",
       count(DISTINCT id)                  AS "涉及幾篇",
       CASE WHEN state IN ('STRONG','ADEQUATE','DEVELOPING','MINIMAL','UNMEASURED')
            THEN '✅ 認得'
            ELSE '🛑 不認得 —— migration 會讓這幾篇沒有分數' END AS "判定"
  FROM s
 GROUP BY state

UNION ALL
SELECT '── 不認得的總數（必須是 0 才能跑 migration）──',
       count(*) FILTER (WHERE state IS NULL
                          OR state NOT IN ('STRONG','ADEQUATE','DEVELOPING','MINIMAL','UNMEASURED')),
       count(DISTINCT id) FILTER (WHERE state IS NULL
                          OR state NOT IN ('STRONG','ADEQUATE','DEVELOPING','MINIMAL','UNMEASURED')),
       CASE WHEN count(*) FILTER (WHERE state IS NULL
                          OR state NOT IN ('STRONG','ADEQUATE','DEVELOPING','MINIMAL','UNMEASURED')) = 0
            THEN '✅ 可以跑 migration'
            ELSE '🛑 先不要跑 —— 上面那幾個值要先處理' END
  FROM s
 ORDER BY 2 DESC;
