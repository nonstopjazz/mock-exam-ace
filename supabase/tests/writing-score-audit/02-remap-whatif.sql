-- 🟢 【唯讀】staging 與 production 都可以安全執行。什麼都不會改。
--
-- 「如果改換算公式，每篇會變幾分」——逐篇對照。
--
-- 🛑 分數沒有存成欄位，是每次讀取時從 competency_analysis 算的
--    （create_writing_score_20.sql:142）。所以改公式會【追溯套用到所有舊作文】：
--    昨天看到 18 分的學生，今天會看到新的數字，而且沒有任何說明。
--    這支就是在動手之前先把那個影響量出來。
--
-- 候選公式（滿分都仍是 20，差別在低分段壓多重）：
--
--   現行       DEV 2 / ADQ 3 / STR 4    → 下限 10，全 ADEQUATE 15，全 STRONG 20
--   只改公式   DEV 1 / ADQ 2 / STR 4    → 下限 5，全 ADEQUATE 10，全 STRONG【仍是 20】
--   AI嚴一級   把每個評級降一級後套現行公式（STRONG→3、ADEQUATE→2、DEVELOPING→1）
--
-- 🛑 兩條路的差別就是這份稽核的結論：
--
--    「只改公式」保留 STRONG = 4，所以【幾乎全 STRONG 的作文幾乎不會降】。
--     想把那篇 18 分壓到 14 分，改公式做不到 —— 那是在替一個過寬的評級
--     找一個比較小的數字，不是修正。
--
--    「AI 評嚴一級」才會真的動：一篇 4 個 STRONG + 1 個 ADEQUATE 的作文
--     會從 19 掉到 14。那對應的是改 prompt。
--
-- 🛑 小數不要用。公式在每個類別先 round() 再加總，ADEQUATE = 2.5 會被
--    四捨成 3，等於沒改 —— 這是測試抓出來的，不是推論。
WITH per_category AS (
  SELECT
    a.id         AS analysis_id,
    s.title,
    s.student_id,
    a.completed_at,
    c ->> 'code' AS code,
    avg(CASE sk ->> 'state' WHEN 'STRONG' THEN 4 WHEN 'ADEQUATE' THEN 3
                            WHEN 'DEVELOPING' THEN 2 END)       AS now_pts,
    -- 候選A：只改公式。🛑 必須是整數 —— 公式每個類別先 round() 再加總，
    -- 2.5 會被四捨成 3，等於沒改。這是測試抓出來的。
    avg(CASE sk ->> 'state' WHEN 'STRONG' THEN 4 WHEN 'ADEQUATE' THEN 2
                            WHEN 'DEVELOPING' THEN 1 END)       AS a_pts,
    -- 候選B：不改公式，模擬【AI 評嚴一級】——
    -- STRONG→ADEQUATE(3)、ADEQUATE→DEVELOPING(2)、DEVELOPING→再低一級(1)。
    -- 這才是對應「AI 評太鬆」的那條路：改 prompt 之後的分數大概長這樣。
    avg(CASE sk ->> 'state' WHEN 'STRONG' THEN 3 WHEN 'ADEQUATE' THEN 2
                            WHEN 'DEVELOPING' THEN 1 END)       AS b_pts,
    -- 🛑 等距：1 / 2 / 3，而且【不做類別內 round】。
    --    「只改公式」的 1/2/4 間距不等 —— ADEQUATE→STRONG 的差距是
    --    DEVELOPING→ADEQUATE 的兩倍，所以 STRONG 多的作文被不成比例獎勵，
    --    結果底部一群掉 5 分、頂端幾乎不動，中間空掉。
    --    等距之後滿分仍是 20（avg 3 ÷ 3 × 20），下限變成 6.7。
    avg(CASE sk ->> 'state' WHEN 'STRONG' THEN 3 WHEN 'ADEQUATE' THEN 2
                            WHEN 'DEVELOPING' THEN 1 END)       AS e_pts
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
-- 與 writing_score_20() 一致：UNMEASURED 的類別（avg 為 NULL）排除在分母外，
-- 每個類別先 round 再加總。
scored AS (
  SELECT analysis_id, title, student_id, completed_at,
         count(*)                            AS measured,
         sum(round(now_pts))                 AS now_sum,
         sum(round(a_pts))                   AS a_sum,
         sum(round(b_pts))                   AS b_sum,
         -- 等距那一欄刻意【不】round —— 去掉 .5 單向進位的偏差
         sum(e_pts)                          AS e_sum
  FROM per_category
  WHERE now_pts IS NOT NULL
  GROUP BY analysis_id, title, student_id, completed_at
)
SELECT title                                            AS "作文",
       student_id                                       AS "學生",
       measured                                         AS "有量到的類別",
       round(20.0 * now_sum / (4 * measured))::int      AS "目前",
       round(20.0 * a_sum   / (4 * measured))::int      AS "只改公式",
       round(20.0 * b_sum   / (4 * measured))::int      AS "AI嚴一級",
       round(20.0 * e_sum   / (3 * measured))::int      AS "🛑等距無round",
       round(20.0 * now_sum / (4 * measured))::int
         - round(20.0 * a_sum / (4 * measured))::int    AS "改公式降幅",
       round(20.0 * now_sum / (4 * measured))::int
         - round(20.0 * b_sum / (4 * measured))::int    AS "嚴一級降幅",
       round(20.0 * now_sum / (4 * measured))::int
         - round(20.0 * e_sum / (3 * measured))::int    AS "等距降幅",
       completed_at                                     AS "分析完成"
FROM scored
ORDER BY completed_at DESC
LIMIT 50;
