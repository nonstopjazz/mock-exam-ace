-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 連點造成的重複作答：總覽。
--
-- 判定一組「連點」的條件（四個條件同時成立才算）：
--   同一位學生、同一個字、同一種題型、同一場 session，
--   而且相鄰兩筆的間隔 <= 2 秒。
--
-- 🛑 刻意【不】用 correct 分組。
--    「快速點兩個不同選項」留下的就是一對一錯，那是最需要被抓出來的一類；
--    用 correct 分組會把它整個漏掉（那也正是前端去重擋不住它的原因）。
--
-- 🛑 只看四個有閂鎖的作答模式。
--    match / flashcard 走 recordEvidenceOnly，短時間內重複是真的在發生、
--    而且不影響熟練度，那些不是重複紀錄 —— 它們在 05 當對照組。
--
-- 2 秒是刻意放寬的（連點實際相隔幾十毫秒）。學生不可能在 2 秒內
-- 對同一場、同一個字、同一種題型真的作答兩次。
WITH scoped AS (
  SELECT a.id, a.student_id, a.lexical_item_id, a.exercise_type, a.session_id,
         a.correct, a.affected_mastery, a.occurred_at,
         (a.metadata ->> 'event') = 'timeout' AS is_timeout
  FROM public.lexical_attempts a
  WHERE a.exercise_type IN ('quick_quiz','fill_blank','synonym_antonym','spelling')
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
         count(*)                                        AS rows_in_burst,
         count(*) FILTER (WHERE affected_mastery)        AS mastery_rows,
         bool_or(correct IS TRUE) AND bool_or(correct IS FALSE) AS contradictory,
         bool_or(is_timeout)                             AS has_timeout
  FROM bursts
  GROUP BY student_id, lexical_item_id, exercise_type, session_id, burst_no
  HAVING count(*) > 1
)
SELECT '受影響的作答組數（每組 = 一次該只記一筆的作答）' AS "項目",
       count(*)::text AS "數字"
FROM grouped
UNION ALL SELECT '　其中「一對一錯」（🛑 最嚴重：同一題同時有對與錯）',
       count(*) FILTER (WHERE contradictory)::text FROM grouped
UNION ALL SELECT '　　其中含倒數計時歸零（timeout + 真實作答）',
       count(*) FILTER (WHERE contradictory AND has_timeout)::text FROM grouped
UNION ALL SELECT '　其中「純重複」（同一顆連點，對錯一致）',
       count(*) FILTER (WHERE NOT contradictory)::text FROM grouped
UNION ALL SELECT '多出來的資料列（總列數 − 應有的組數）',
       coalesce(sum(rows_in_burst) - count(*), 0)::text FROM grouped
UNION ALL SELECT '熟練度被多算的次數（affected_mastery 的多餘列）',
       coalesce(sum(greatest(mastery_rows - 1, 0)), 0)::text FROM grouped
UNION ALL SELECT '受影響的學生數',
       (SELECT count(DISTINCT student_id)::text FROM grouped)
UNION ALL SELECT '受影響的單字數',
       (SELECT count(DISTINCT lexical_item_id)::text FROM grouped);
