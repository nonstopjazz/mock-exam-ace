-- 🟢 【唯讀】staging 與 production 都可以安全執行。沒有 UPDATE，只把 before / after 列出來。
--
-- 連點重複造成的熟練度膨脹：修正預覽。
--
-- 🛑 先跑這支，確認每一欄都對，再跑 07。07 才會真的寫。
--
-- ── 輸入只有學生 id，單字由資料自己定位 ─────────────────────
--
--   🛑 刻意【不】用 lemma 當鍵。lexical_items.lemma 沒有 UNIQUE，
--      而且那是刻意的（同形異義允許並存，合併是人工決定）。
--      拿 lemma 去比對，可能指到另一個同形的項目 —— 改資料時就是改錯東西。
--
--   所以這支只吃學生 id，然後從 lexical_attempts 自己找出「這位學生
--      哪個單字有連點」，item 的 UUID 由資料決定。07 用那個 UUID 當鍵。
--
-- ── 為什麼正確值是唯一解 ──────────────────────────────────
--
--   升降規則是 easy +1 / hard −1 / forgot −2，從 0 起算。
--   n 次複習最多只能到熟練度 n，所以【熟練度 = 複習次數】就代表
--   每一次都是 easy —— 沒有別的組合可能。正確值 = 現值 − 多算次數。
--
--   🛑 熟練度 ≠ 複習次數的列會被標成「不可反推」而【不給】建議值。
--      那種要重放，而重放需要 lexical_attempts 看不到的上線前歷史
--      （舊表 2026-02-10 起，attempts 2026-09-22 起）。
--
-- ── 多算次數現場重算 ──────────────────────────────────────
--
--   資料是活的，稽核跑完之後這些學生可能又練習了。
--   「當初觀測」是 2026-09-30 那次的值，寫在這裡當對照 ——
--   對不上就代表分析過期，不要拿它去改資料，重跑 01 / 04。
WITH target(student_id, observed_extra) AS (
  VALUES
    ('bb34c69e-b7a4-4127-baa6-5a25bf3c6770'::uuid, 3),
    ('0aea72e3-26d5-409e-9992-a59936fd3abd'::uuid, 1),
    ('dbe40a1f-9594-4f8c-b49f-e874ef1ef292'::uuid, 1)
),
-- 以下分群邏輯與 01 / 04 一致，範圍縮到這三位學生。
scoped AS (
  SELECT a.student_id, a.lexical_item_id, a.exercise_type, a.session_id,
         a.affected_mastery, a.occurred_at
  FROM public.lexical_attempts a
  JOIN target t ON t.student_id = a.student_id
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
  SELECT student_id, lexical_item_id,
         count(*) FILTER (WHERE affected_mastery) AS mastery_rows
  FROM bursts
  GROUP BY student_id, lexical_item_id, exercise_type, session_id, burst_no
  HAVING count(*) > 1
),
live AS (
  SELECT student_id, lexical_item_id,
         sum(greatest(mastery_rows - 1, 0))::int AS extra_now
  FROM grouped
  GROUP BY student_id, lexical_item_id
  HAVING sum(greatest(mastery_rows - 1, 0)) > 0
),
calc AS (
  SELECT li.lemma, l.student_id, l.lexical_item_id, li.legacy_level_word_id,
         t.observed_extra, l.extra_now,
         w.mastery_level AS old_mastery, w.review_count AS old_reviews,
         w.next_review_time AS old_next_ms, w.last_review_time AS old_last_ms,
         m.mastery_level AS new_mastery, m.review_count AS new_reviews,
         -- 唯一解成立的條件（兩張表各自判斷）
         (w.mastery_level IS NOT NULL AND w.mastery_level = w.review_count
          AND w.review_count > l.extra_now AND w.last_review_time IS NOT NULL) AS old_ok,
         (m.mastery_level IS NOT NULL AND m.mastery_level = m.review_count
          AND m.review_count > l.extra_now)                                    AS new_ok
  FROM live l
  JOIN target t ON t.student_id = l.student_id
  LEFT JOIN public.lexical_items li ON li.id = l.lexical_item_id
  LEFT JOIN public.user_word_progress w
         ON w.user_id = l.student_id AND w.word_id = li.legacy_level_word_id
  LEFT JOIN public.student_lexical_mastery m
         ON m.student_id = l.student_id AND m.lexical_item_id = l.lexical_item_id
)
SELECT
  lemma                                                   AS "單字",
  CASE WHEN extra_now = observed_extra THEN '✅ 一致'
       ELSE '🛑 不一致：分析已過期，重跑 01/04' END        AS "多算次數對照",
  extra_now                                               AS "多算",

  old_mastery                                             AS "舊表熟練度",
  CASE WHEN old_ok THEN (old_mastery - extra_now)::text
       ELSE '🛑 不可反推' END                              AS "→應為",
  old_reviews                                             AS "舊表複習",
  CASE WHEN old_ok THEN (old_reviews - extra_now)::text
       ELSE '🛑 不可反推' END                              AS "→應為2",
  to_timestamp(old_next_ms / 1000.0)                      AS "舊表下次複習",
  CASE WHEN old_ok THEN
    (to_timestamp(old_last_ms / 1000.0)
     + public.lexical_compat_review_interval((old_mastery - extra_now)::smallint))::text
       ELSE '🛑 不可反推' END                              AS "→應為3",
  CASE WHEN old_ok AND to_timestamp(old_last_ms / 1000.0)
         + public.lexical_compat_review_interval((old_mastery - extra_now)::smallint) <= now()
       THEN '修完立刻可複習' ELSE '' END                    AS "備註",

  new_mastery                                             AS "新表熟練度",
  CASE WHEN new_ok THEN (new_mastery - extra_now)::text
       ELSE '🛑 不可反推' END                              AS "→應為4",
  new_reviews                                             AS "新表複習",

  student_id                                              AS "學生",
  lexical_item_id                                         AS "單字 id（07 用這個當鍵）"
FROM calc
ORDER BY extra_now DESC, lemma;
