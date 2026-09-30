-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 熟練度被多算到什麼程度 —— 依 學生 × 單字 列出【涵蓋所有題型】。
--
-- 🛑 刪 lexical_attempts 的列不會把熟練度退回去。熟練度在別的表，
--    而且【有兩張】，連點當時兩張都被推了兩次：
--
--      student_lexical_mastery  ← Lexical Model 的新表，由 record_lexical_attempt() 維護
--      user_word_progress       ← 舊表，由 updateWordProgress() 維護
--
-- 🛑 學生實際看到的複習佇列讀的是【舊表】。
--    getDueWords() 走 vocabularyStore.wordProgress，也就是 user_word_progress，
--    不是 student_lexical_mastery。所以「下次複習被推多遠」要看
--    「舊表下次複習」那一欄，新表的數字只是平行紀錄。
--
-- 🛑 兩張表的數字【可以差很多】，那不一定是 bug。
--    user_word_progress 從 2026-02-10 就在收資料，
--    lexical_attempts 是 2026-09-22 才有的 —— 舊表帶著七個月的歷史，
--    這份稽核看不到。所以：
--
--      「多算幾次」可信      ← 那是從 lexical_attempts 數出來的，是實際發生的重複
--      「正確的熟練度是多少」不能單從 attempts 推 ← 缺了上線前的歷史
--
--    真的要算正確值，先看 mastery_level 是否等於 review_count：
--    相等就代表每一步都是 +1（easy），因為從 0 起算 n 步最多只能到 n。
--    這種情況下正確熟練度 = review_count − 多算次數，是唯一解。
--    不相等（混了 hard / forgot）就得用 lexical_compat_next_mastery() 重放，
--    而重放需要上線前的紀錄 —— 那些不在 lexical_attempts 裡。
--
-- 間隔對照（lexical_compat_review_interval）：
--    0→立刻  1→10 分鐘  2→1 天  3→3 天  4→7 天  5→14 天  6→30 天
--    所以熟練度多算 3 級 = 本來 1 天後該複習，被推到 14 天後。
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
         count(*) FILTER (WHERE affected_mastery) AS mastery_rows,
         count(DISTINCT judgment) > 1             AS contradictory
  FROM bursts
  GROUP BY student_id, lexical_item_id, exercise_type, session_id, burst_no
  HAVING count(*) > 1
),
per_pair AS (
  SELECT student_id, lexical_item_id,
         sum(greatest(mastery_rows - 1, 0))    AS extra_mastery,
         count(*) FILTER (WHERE contradictory) AS contradictory_bursts,
         string_agg(DISTINCT exercise_type, ', ') AS types
  FROM grouped GROUP BY student_id, lexical_item_id
)
SELECT coalesce(li.lemma, p.lexical_item_id::text) AS "單字",
       p.types                                     AS "題型",
       p.student_id                                AS "學生",
       p.extra_mastery                             AS "熟練度多算次數",
       p.contradictory_bursts                      AS "判定矛盾組數",
       -- 舊表：學生實際感受到的
       w.mastery_level                             AS "舊表熟練度",
       -- 🛑 這是扣掉多算之後的【複習次數】，不是熟練度。
       --    只有在該字每一次都評 easy 時，熟練度才剛好等於這個數字
       --    （easy = +1）。有 hard / forgot 混在裡面時，正確的熟練度
       --    要用 lexical_compat_next_mastery() 重放才算得出來。
       greatest(w.review_count - p.extra_mastery, 0) AS "扣掉多算後的複習次數",
       w.review_count                              AS "舊表複習次數",
       to_timestamp(w.next_review_time / 1000.0)   AS "舊表下次複習",
       -- 新表：平行紀錄，不驅動畫面
       m.mastery_level                             AS "新表熟練度",
       m.review_count                              AS "新表複習次數"
FROM per_pair p
LEFT JOIN public.lexical_items li ON li.id = p.lexical_item_id
LEFT JOIN public.student_lexical_mastery m
       ON m.student_id = p.student_id AND m.lexical_item_id = p.lexical_item_id
LEFT JOIN public.user_word_progress w
       ON w.user_id = p.student_id AND w.word_id = li.legacy_level_word_id
WHERE p.extra_mastery > 0
ORDER BY p.extra_mastery DESC, p.contradictory_bursts DESC
LIMIT 200;
