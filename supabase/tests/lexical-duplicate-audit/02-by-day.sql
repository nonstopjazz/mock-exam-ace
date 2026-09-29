-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 逐日趨勢。這支的用途不只是看量，更是【驗證這份稽核本身有沒有量對東西】：
--
--   🛑 修正上線之後的日期，數字應該掉到 0。
--      如果修正上線後還在長，那不是連點 —— 是這份稽核的判定條件抓太寬，
--      先別依它清任何資料。
--
-- 對照的是 PR #154 合併後的部署日。
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
         min(occurred_at)                                AS first_at,
         count(*)                                        AS rows_in_burst,
         bool_or(correct IS TRUE) AND bool_or(correct IS FALSE) AS contradictory
  FROM bursts
  GROUP BY student_id, lexical_item_id, exercise_type, session_id, burst_no
  HAVING count(*) > 1
),
daily AS (
  SELECT date_trunc('day', first_at)::date AS "日期",
         count(*)                          AS "受影響組數",
         count(*) FILTER (WHERE contradictory) AS "其中一對一錯",
         sum(rows_in_burst) - count(*)     AS "多出來的列"
  FROM grouped
  GROUP BY 1
),
totals AS (
  SELECT date_trunc('day', occurred_at)::date AS "日期", count(*) AS "當日總作答"
  FROM public.lexical_attempts
  WHERE exercise_type IN ('quick_quiz','fill_blank','synonym_antonym','spelling')
  GROUP BY 1
)
SELECT t."日期",
       t."當日總作答",
       coalesce(d."受影響組數", 0)   AS "受影響組數",
       coalesce(d."其中一對一錯", 0) AS "其中一對一錯",
       coalesce(d."多出來的列", 0)   AS "多出來的列",
       round(100.0 * coalesce(d."多出來的列", 0) / nullif(t."當日總作答", 0), 2) AS "污染率 %"
FROM totals t
LEFT JOIN daily d USING ("日期")
ORDER BY t."日期" DESC
LIMIT 120;
