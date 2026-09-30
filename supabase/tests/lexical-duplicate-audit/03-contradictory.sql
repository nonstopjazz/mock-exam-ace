-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 判定互相矛盾的明細 —— 同一次作答在資料裡留下兩種不同的判定。
--   客觀題型：一筆對、一筆錯（點了兩個不同選項）
--   SRS：forgot 和 easy 都記了（correct 永遠是 NULL，看的是 self_rating）
--
-- 🛑 最重要的是「可否自動判定」欄，它決定這批清不清得掉：
--   timeout 可判定 → 一筆是倒數歸零自動記的，另一筆才是學生按的，刪前者即可。
--   ⚠️ 無法判定   → 兩筆都是學生點的。【沒有任何欄位能還原他本來要選哪一個】，
--                   時間差只說明哪一下先到，不代表哪個是本意。不要猜。
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
  SELECT student_id, lexical_item_id, exercise_type, session_id, burst_no,
         count(*)         AS rows_in_burst,
         min(occurred_at) AS first_at,
         max(occurred_at) AS last_at,
         bool_or(is_timeout)                        AS has_timeout,
         bool_or(affected_mastery)                  AS touched_mastery,
         array_agg(judgment ORDER BY occurred_at)   AS judgment_seq,
         array_agg(id       ORDER BY occurred_at)   AS row_ids
  FROM bursts
  GROUP BY student_id, lexical_item_id, exercise_type, session_id, burst_no
  HAVING count(*) > 1 AND count(DISTINCT judgment) > 1
)
SELECT g.first_at                                   AS "發生時間",
       coalesce(li.lemma, g.lexical_item_id::text)  AS "單字",
       g.exercise_type                              AS "題型",
       g.rows_in_burst                              AS "筆數",
       extract(milliseconds FROM (g.last_at - g.first_at))::int AS "相隔毫秒",
       g.judgment_seq                               AS "判定順序",
       CASE WHEN g.has_timeout THEN 'timeout 可判定'
            ELSE '⚠️ 無法判定' END                   AS "可否自動判定",
       g.touched_mastery                            AS "有動到熟練度",
       g.student_id                                 AS "學生",
       g.row_ids                                    AS "資料列 id"
FROM grouped g
LEFT JOIN public.lexical_items li ON li.id = g.lexical_item_id
ORDER BY g.first_at DESC
LIMIT 200;
