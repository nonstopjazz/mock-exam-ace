-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 依題型的組成與重複率。
--
-- 🛑 先看這支再下任何結論。
--    如果稽核的主結果是 0，要先確認它涵蓋的列數 ≈ 總列數。
--    第一版的稽核只看四種題型，實際上只涵蓋了全表的 2% —— 主結果那個 0
--    完全沒有意義，因為量最大的 srs 根本不在裡面。
--
-- 「只留證據」欄是量尺：那些是 recordEvidenceOnly 寫的
-- （配對誤點、翻卡曝光），本來就會密集重複、且不動熟練度。
-- 會動熟練度的題型，重複率應該明顯低於它。
WITH scoped AS (
  SELECT a.id, a.student_id, a.lexical_item_id, a.exercise_type, a.session_id,
         a.affected_mastery, a.occurred_at,
         coalesce(a.correct::text, a.self_rating) AS judgment
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
  SELECT exercise_type,
         count(*)                                 AS rows_in_burst,
         count(*) FILTER (WHERE affected_mastery) AS mastery_rows,
         count(DISTINCT judgment) > 1             AS contradictory
  FROM bursts
  GROUP BY student_id, lexical_item_id, exercise_type, session_id, burst_no
  HAVING count(*) > 1
),
per_type AS (
  SELECT exercise_type,
         sum(rows_in_burst) - count(*)                  AS extra_rows,
         sum(greatest(mastery_rows - 1, 0))             AS extra_mastery,
         count(*) FILTER (WHERE contradictory)          AS contradictory_bursts
  FROM grouped GROUP BY exercise_type
),
totals AS (
  SELECT exercise_type,
         count(*)                                       AS total_rows,
         count(*) FILTER (WHERE affected_mastery)       AS mastery_rows,
         count(*) FILTER (WHERE NOT affected_mastery)   AS evidence_rows
  FROM public.lexical_attempts GROUP BY exercise_type
)
SELECT t.exercise_type                         AS "題型",
       t.total_rows                            AS "總列數",
       t.mastery_rows                          AS "會動熟練度",
       t.evidence_rows                         AS "只留證據",
       coalesce(p.extra_rows, 0)               AS "多出來的列",
       coalesce(p.contradictory_bursts, 0)     AS "判定矛盾組數",
       coalesce(p.extra_mastery, 0)            AS "熟練度多算",
       round(100.0 * coalesce(p.extra_rows, 0) / nullif(t.total_rows, 0), 2) AS "重複率 %"
FROM totals t
LEFT JOIN per_type p ON p.exercise_type = t.exercise_type
UNION ALL
SELECT '── 合計 ──',
       sum(t.total_rows), sum(t.mastery_rows), sum(t.evidence_rows),
       coalesce(sum(p.extra_rows), 0), coalesce(sum(p.contradictory_bursts), 0),
       coalesce(sum(p.extra_mastery), 0),
       round(100.0 * coalesce(sum(p.extra_rows), 0) / nullif(sum(t.total_rows), 0), 2)
FROM totals t LEFT JOIN per_type p ON p.exercise_type = t.exercise_type
ORDER BY 2 DESC NULLS LAST;
