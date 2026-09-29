-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 對照組：match / flashcard（走 recordEvidenceOnly 的兩種）。
--
-- 🛑 這支【預期會有數字】，而且那些不是 bug。
--    配對遊戲裡短時間連續點錯同一組是真的在發生，那是證據不是重複；
--    這兩種一律 affected_mastery = false，不影響熟練度。
--
-- 它在這裡的作用是當「判定條件有沒有抓太寬」的量尺：
--   把同一套時間窗套到明知會密集重複的兩種題型上，看它抓到多少。
--   如果 01 的四種題型抓到的比例跟這裡差不多，那代表時間窗抓到的
--   是「正常的快速作答」而不是連點 —— 這份稽核就不能用來清資料。
--   四種題型的比例應該明顯【低於】這裡。
WITH scoped AS (
  SELECT a.id, a.student_id, a.lexical_item_id, a.exercise_type, a.session_id,
         a.correct, a.affected_mastery, a.occurred_at
  FROM public.lexical_attempts a
  WHERE a.exercise_type IN ('match','flashcard')
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
  SELECT exercise_type, count(*) AS rows_in_burst
  FROM bursts
  GROUP BY student_id, lexical_item_id, exercise_type, session_id, burst_no, exercise_type
  HAVING count(*) > 1
),
totals AS (
  SELECT exercise_type, count(*) AS total_rows
  FROM public.lexical_attempts
  WHERE exercise_type IN ('match','flashcard')
  GROUP BY exercise_type
)
SELECT t.exercise_type                                   AS "題型（對照組）",
       t.total_rows                                      AS "總作答數",
       coalesce(sum(g.rows_in_burst) - count(g.rows_in_burst), 0)    AS "2 秒內的多餘列",
       round(100.0 * coalesce(sum(g.rows_in_burst) - count(g.rows_in_burst), 0)
             / nullif(t.total_rows, 0), 2)               AS "比例 %（四種題型應明顯低於此）"
FROM totals t
LEFT JOIN grouped g ON g.exercise_type = t.exercise_type
GROUP BY t.exercise_type, t.total_rows
ORDER BY t.exercise_type;
