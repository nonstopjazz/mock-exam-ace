-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 「一對一錯」的明細 —— 同一題在資料裡同時有一筆對、一筆錯。
--
-- 🛑 這支最重要的一欄是「可否自動判定」，它決定這批資料清不清得掉：
--
--   timeout 可判定  → 其中一筆是計時歸零自動記的（metadata.event = 'timeout'），
--                     另一筆才是學生真的按下去的。刪 timeout 那筆即可。
--   ⚠️ 無法判定    → 兩筆都是學生點的，只是點了兩個不同選項。
--                     【沒有任何欄位能還原學生本來要選哪一個】。
--                     這類不要猜，見 README「清不掉的那一類」。
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
  SELECT student_id, lexical_item_id, exercise_type, session_id, burst_no,
         count(*)         AS rows_in_burst,
         min(occurred_at) AS first_at,
         max(occurred_at) AS last_at,
         bool_or(is_timeout) AS has_timeout,
         array_agg(correct ORDER BY occurred_at) AS correct_seq,
         array_agg(id      ORDER BY occurred_at) AS row_ids
  FROM bursts
  GROUP BY student_id, lexical_item_id, exercise_type, session_id, burst_no
  HAVING count(*) > 1
     AND bool_or(correct IS TRUE) AND bool_or(correct IS FALSE)
)
SELECT g.first_at                                   AS "發生時間",
       coalesce(li.lemma, g.lexical_item_id::text)  AS "單字",
       g.exercise_type                              AS "題型",
       g.rows_in_burst                              AS "筆數",
       extract(milliseconds FROM (g.last_at - g.first_at))::int AS "相隔毫秒",
       g.correct_seq                                AS "對錯順序",
       CASE WHEN g.has_timeout THEN 'timeout 可判定'
            ELSE '⚠️ 無法判定' END                   AS "可否自動判定",
       g.student_id                                 AS "學生",
       g.row_ids                                    AS "資料列 id"
FROM grouped g
LEFT JOIN public.lexical_items li ON li.id = g.lexical_item_id
ORDER BY g.first_at DESC
LIMIT 200;
