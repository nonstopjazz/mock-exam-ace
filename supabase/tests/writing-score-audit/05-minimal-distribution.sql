-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 這次改動【唯一】的驗收方式。
--
-- 🛑 為什麼不能像上次那樣先預覽：
--    等距改版只動公式，所以可以拿現有的 competency_analysis 重算，
--    事前逐篇確認 50 篇的新分數。
--    這次改的是【AI 會輸出什麼】—— 現有資料裡沒有任何一筆 MINIMAL，
--    重算不出來。只能上線後重跑作文，再看這支。
--
-- 所以上線後要回來看這支，確認兩件事都成立：
--
--   ① 0–6 真的有人落進去（不然等於沒改）
--   ② MINIMAL 沒有被濫用（不然是整批崩掉，不是變精準）
--
-- 🛑 ② 是真正的風險。production 50 篇裡有 43 篇的 STRONG 是 0 ——
--    AI 本來就偏嚴。在 DEVELOPING 之下再開一格，如果 prompt 的門檻沒守住，
--    那 43 篇會整批滑下去，分數全面崩盤。那不是「變嚴格」，是量表壞了。
--    判讀的門檻寫在檔尾。
WITH per_analysis AS (
  SELECT a.id,
         (public.writing_score_20(a.competency_analysis) ->> 'score')::int AS score,
         count(*) FILTER (WHERE sk ->> 'state' = 'MINIMAL')    AS n_minimal,
         count(*) FILTER (WHERE sk ->> 'state' = 'STRONG')     AS n_strong,
         count(*) FILTER (WHERE sk ->> 'state' <> 'UNMEASURED') AS n_measured
    FROM public.writing_analyses a
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(a.competency_analysis -> 'categories') = 'array'
           THEN a.competency_analysis -> 'categories' ELSE '[]'::jsonb END) c
    LEFT JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(c -> 'skills') = 'array' THEN c -> 'skills'
           ELSE '[]'::jsonb END) sk ON true
   WHERE a.status = 'COMPLETED' AND a.competency_analysis IS NOT NULL
   GROUP BY a.id, a.competency_analysis
),
m(ord, label, n) AS (
  SELECT 1, '總篇數（COMPLETED）', count(*) FROM per_analysis
  UNION ALL SELECT 2, '🛑 ① 有用到 MINIMAL 的篇數（= 一定是新 prompt 跑的）',
    count(*) FILTER (WHERE n_minimal > 0) FROM per_analysis
  UNION ALL SELECT 3, '🛑 ① 分數落在 0–6 的篇數（改動之前這裡必然是 0）',
    count(*) FILTER (WHERE score BETWEEN 0 AND 6) FROM per_analysis
  UNION ALL SELECT 4, '　　7–10',  count(*) FILTER (WHERE score BETWEEN 7 AND 10)  FROM per_analysis
  UNION ALL SELECT 5, '　　11–15', count(*) FILTER (WHERE score BETWEEN 11 AND 15) FROM per_analysis
  UNION ALL SELECT 6, '　　16–20', count(*) FILTER (WHERE score BETWEEN 16 AND 20) FROM per_analysis
  UNION ALL SELECT 7, '　　沒有分數（全部面向都未評量）',
    count(*) FILTER (WHERE score IS NULL) FROM per_analysis
  UNION ALL SELECT 8, '🛑 ② MINIMAL 佔「有量到的 skill」的百分比',
    coalesce(round(100.0 * sum(n_minimal) / nullif(sum(n_measured), 0))::int, 0) FROM per_analysis
  UNION ALL SELECT 9, '🛑 ② 半數以上 skill 被評 MINIMAL 的篇數',
    count(*) FILTER (WHERE n_measured > 0 AND n_minimal::numeric / n_measured > 0.5) FROM per_analysis
  UNION ALL SELECT 10, '對照：STRONG 為 0 的篇數（改動前 50 篇裡有 43 篇）',
    count(*) FILTER (WHERE n_strong = 0) FROM per_analysis
)
SELECT label AS "項目",
       n     AS "數量",
       CASE
         WHEN ord = 3 AND n = 0 THEN '⚠️ 還沒有人落進 0–6 —— 可能還沒重跑過作文，或門檻訂得太嚴'
         WHEN ord = 3           THEN '✅ 0–6 區間真的用到了'
         WHEN ord = 8 AND n > 35 THEN '🛑 太高 —— MINIMAL 被濫用，量表崩了，要回滾 prompt'
         WHEN ord = 8 AND n > 20 THEN '⚠️ 偏高，逐篇看幾個 MINIMAL 的理由站不站得住'
         WHEN ord = 8            THEN '✅ 在合理範圍'
         WHEN ord = 9 AND n > 0  THEN '⚠️ 這幾篇要人工看過 —— 半數以上評最低分是很強的宣稱'
         ELSE ''
       END   AS "判讀"
  FROM m
 ORDER BY ord;

-- 判讀門檻是怎麼來的：
--
--   第 8 列（MINIMAL 佔比）
--     改動之前，DEVELOPING 佔「有量到」的比例大約是六成（43/50 篇零 STRONG）。
--     MINIMAL 的定義是「一處用對的都找不到」，那應該是少數。
--     > 35%  →  已經不是少數，等於把原本的 DEVELOPING 整批重貼標籤 → 回滾 prompt
--     > 20%  →  還不到崩盤，但要抽幾篇看 MINIMAL 的 reason 是否具體
--
--   第 3 列是 0 的時候，先確認是不是根本還沒有作文用新 prompt 重跑過
--   （第 2 列也會是 0）。兩列都是 0 → 還沒有資料，不是門檻太嚴。
