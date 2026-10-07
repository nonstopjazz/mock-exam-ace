-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 連點造成的重複作答：總覽。【涵蓋所有題型】。
--
-- 判定一組「連點」：同學生 + 同單字 + 同題型 + 同 session + 相鄰兩筆 <= 2 秒。
--
-- 🛑 不用 correct 分組。「快速點兩個不同選項」留下的就是一對一錯，
--    那是最該抓的一類；用 correct 分組會整個漏掉。
--
-- 🛑 判定用 judgment = coalesce(correct, self_rating)，不是只看 correct。
--    SRS 的 correct 永遠是 NULL，它真正的證據在 self_rating。
--    只看 correct 的話，SRS 的「forgot + easy 連點」會被當成無衝突放行。
--
-- 🛑 分類用每一列自己記的 affected_mastery，不用題型清單。
--    match 配對成功、flashcard 的 Mark as Known 都會動熟練度；
--    用「哪些題型是證據」這種假設去分類會分錯。
--
-- 🛑 判定矛盾【只看會算分的那些列】。
--    配對遊戲先點錯、一秒內再點對，會留下 false（證據，不算分）
--    + true（成功，算分）。判定確實不同，但那是正常玩法，不是連點 ——
--    2026-10-07 的 production 資料就有兩組，相隔 995ms 與 1474ms，
--    那是人點兩下的速度，連點是幾十毫秒。
--    第一版把它算成矛盾，等於每天都在對正常玩法發警報。
--    真正的矛盾是【兩筆都會算分卻互相打架】：timeout + 真實作答、
--    點了兩個不同選項、SRS 的 forgot + easy。
WITH scoped AS (
  SELECT a.id, a.student_id, a.lexical_item_id, a.exercise_type, a.session_id,
         a.affected_mastery, a.occurred_at,
         coalesce(a.correct::text, a.self_rating) AS judgment,
         (a.metadata ->> 'event') = 'timeout'     AS is_timeout
  FROM public.lexical_attempts a
),
marked AS (
  SELECT s.*,
         CASE WHEN s.occurred_at - lag(s.occurred_at) OVER w <= interval '2 seconds'
              THEN 0 ELSE 1 END AS is_new_burst
  FROM scoped s
  WINDOW w AS (PARTITION BY s.student_id, s.lexical_item_id, s.exercise_type, s.session_id
               ORDER BY s.occurred_at)
),
bursts AS (
  SELECT m.*,
         sum(m.is_new_burst) OVER (PARTITION BY m.student_id, m.lexical_item_id,
                                                m.exercise_type, m.session_id
                                   ORDER BY m.occurred_at
                                   ROWS UNBOUNDED PRECEDING) AS burst_no
  FROM marked m
),
grouped AS (
  SELECT student_id, lexical_item_id, exercise_type, burst_no,
         count(*)                                 AS rows_in_burst,
         count(*) FILTER (WHERE affected_mastery) AS mastery_rows,
         -- 只在會算分的列之間看矛盾
         count(DISTINCT judgment) FILTER (WHERE affected_mastery) > 1 AS contradictory,
         -- 判定不同，但不是在會算分的列之間 → 配對的「先錯後對」，正常
         (count(DISTINCT judgment) > 1
          AND count(DISTINCT judgment) FILTER (WHERE affected_mastery) <= 1) AS benign_mix,
         bool_or(is_timeout)                      AS has_timeout
  FROM bursts
  GROUP BY student_id, lexical_item_id, exercise_type, session_id, burst_no
  HAVING count(*) > 1
)
SELECT '受影響的作答組數（每組 = 一次該只記一筆的作答）' AS "項目",
       count(*)::text AS "數字"
FROM grouped
UNION ALL SELECT '　其中會動熟練度的（🛑 真的影響到學生看到什麼）',
       count(*) FILTER (WHERE mastery_rows > 1)::text FROM grouped
UNION ALL SELECT '　🛑 其中判定互相矛盾（兩筆都算分卻打架）',
       count(*) FILTER (WHERE contradictory)::text FROM grouped
UNION ALL SELECT '　其中「先錯後對」（配對的正常玩法，不是 bug）',
       count(*) FILTER (WHERE benign_mix)::text FROM grouped
UNION ALL SELECT '　　其中含倒數計時歸零（timeout + 真實作答）',
       count(*) FILTER (WHERE contradictory AND has_timeout)::text FROM grouped
UNION ALL SELECT '　其中純重複（判定一致）',
       count(*) FILTER (WHERE NOT contradictory AND NOT benign_mix)::text FROM grouped
UNION ALL SELECT '2 秒內的叢發列數（含正常的證據列，僅供參考）',
       coalesce(sum(rows_in_burst) - count(*), 0)::text FROM grouped
UNION ALL SELECT '熟練度被多算的次數（affected_mastery 的多餘列）',
       coalesce(sum(greatest(mastery_rows - 1, 0)), 0)::text FROM grouped
UNION ALL SELECT '受影響的學生數',
       (SELECT count(DISTINCT student_id)::text FROM grouped)
UNION ALL SELECT '受影響的單字數',
       (SELECT count(DISTINCT lexical_item_id)::text FROM grouped);
