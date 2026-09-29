-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 熟練度被多算到什麼程度 —— 依「學生 × 單字」列出。
--
-- 為什麼要看這個：重複的那一列如果 affected_mastery = true，
-- 它就已經推過一次 student_lexical_mastery 的 review_count / mastery_level。
-- 刪掉 lexical_attempts 的列【不會】把熟練度退回去 —— 那是另一張表。
-- 所以這支的數字才是「真正影響到學生看到什麼」的部分。
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
         count(*) FILTER (WHERE affected_mastery) AS mastery_rows,
         bool_or(correct IS TRUE) AND bool_or(correct IS FALSE) AS contradictory
  FROM bursts
  GROUP BY student_id, lexical_item_id, exercise_type, session_id, burst_no
  HAVING count(*) > 1
),
per_pair AS (
  SELECT student_id, lexical_item_id,
         sum(greatest(mastery_rows - 1, 0)) AS extra_mastery,
         count(*) FILTER (WHERE contradictory) AS contradictory_bursts
  FROM grouped
  GROUP BY student_id, lexical_item_id
)
SELECT coalesce(li.lemma, p.lexical_item_id::text) AS "單字",
       p.student_id                                AS "學生",
       p.extra_mastery                             AS "熟練度多算次數",
       p.contradictory_bursts                      AS "一對一錯組數",
       m.mastery_level                             AS "目前熟練度",
       m.review_count                              AS "目前複習次數",
       m.correct_count                             AS "目前答對次數"
FROM per_pair p
LEFT JOIN public.lexical_items li ON li.id = p.lexical_item_id
LEFT JOIN public.student_lexical_mastery m
       ON m.student_id = p.student_id AND m.lexical_item_id = p.lexical_item_id
WHERE p.extra_mastery > 0
ORDER BY p.extra_mastery DESC, p.contradictory_bursts DESC
LIMIT 200;
