-- 🔴 【會寫入】這支會改 production 資料。跑之前必須先跑 06 並確認每一欄。
--
-- 修正連點重複造成的熟練度膨脹。只碰 3 個「學生 × 單字」，用 UUID 寫死。
--
-- ══════════════════════════════════════════════════════════════
-- 🛑 為什麼這裡把「修改前的數值」寫死，而 06 是現場重算
-- ══════════════════════════════════════════════════════════════
--
--   06 是預覽，現場重算才看得到最新狀況。
--   07 是寫入，現場重算【會出事】：
--
--     airline 修完是 5/5，但 lexical_attempts 裡的多算次數永遠是 1，
--     再算一次就是 5 − 1 = 4。跑第二次就再扣一輪，跑三次扣三輪。
--
--   所以下面的 expect_* 是「06 當時看到、而且人已經核可」的數值，
--   寫進 WHERE 當樂觀鎖：
--
--     • 跑第二次 → 現值已經不等於 expect_* → 更新 0 列，什麼都不會發生
--     • 06 之後有人又練習了 → 對不上 → 更新 0 列
--     • 要改的數值是人看過的，不是腳本當下算出來的
--
--   ⚠️ 所以這支【不可以】在沒跑過 06 的情況下使用，也不可以套用到
--      別的環境或別的時間點 —— expect_* 是那一次快照的值。
--
-- 依據（2026-09-30 的 06 輸出，三列全部「✅ 一致」且可反推）：
--
--   interact  舊表 5/5 → 2/2   新表 5/5 → 2/2   多算 3
--   airline   舊表 6/6 → 5/5   新表 2/2 → 1/1   多算 1
--   armchair  舊表 2/2 → 1/1   新表 2/2 → 1/1   多算 1
--
--   🛑 airline 兩張表的修改前數值不同（舊表 6/6、新表 2/2），那不是筆誤 ——
--      舊表從 2026-02-10 就在收資料，attempts 是 2026-09-22 才有的。
--
-- next_review 不寫死，用 last_review + lexical_compat_review_interval(新熟練度)
-- 重算 —— 間隔表哪天改了，這裡跟著改，不會留下寫死的過期值。
BEGIN;

-- ── 1. 舊表 user_word_progress（學生實際感受到的）────────────────
WITH plan(item_id, student_id, expect_mastery, expect_reviews, new_mastery, new_reviews) AS (
  VALUES
    ('764d93f7-6410-4fbc-870c-ffae445e85cb'::uuid, 'bb34c69e-b7a4-4127-baa6-5a25bf3c6770'::uuid, 5, 5, 2, 2),
    ('45c02f6d-ce48-43f2-9f5a-77c53d0ff07a'::uuid, '0aea72e3-26d5-409e-9992-a59936fd3abd'::uuid, 6, 6, 5, 5),
    ('124da150-81f9-42da-9c0b-8d84bd83c6a0'::uuid, 'dbe40a1f-9594-4f8c-b49f-e874ef1ef292'::uuid, 2, 2, 1, 1)
),
resolved AS (
  -- legacy_level_word_id 由 item 的主鍵解析，不用 lemma（lemma 沒有 UNIQUE，
  -- 而且那是刻意的 —— 同形異義允許並存）。
  SELECT p.*, li.legacy_level_word_id
  FROM plan p
  JOIN public.lexical_items li ON li.id = p.item_id
)
UPDATE public.user_word_progress w
SET mastery_level    = r.new_mastery,
    review_count     = r.new_reviews,
    next_review_time = (extract(epoch FROM
                          to_timestamp(w.last_review_time / 1000.0)
                          + public.lexical_compat_review_interval(r.new_mastery::smallint)
                        ) * 1000)::bigint,
    updated_at       = now()
FROM resolved r
WHERE w.user_id = r.student_id
  AND w.word_id = r.legacy_level_word_id
  -- 樂觀鎖：現值必須還是 06 看到的那一組
  AND w.mastery_level = r.expect_mastery
  AND w.review_count  = r.expect_reviews
  AND w.last_review_time IS NOT NULL
  -- 不讓 correct_count 變得比 review_count 還大
  AND w.correct_count <= r.new_reviews;

-- ── 2. 新表 student_lexical_mastery（平行紀錄，保持一致）──────────
WITH plan(item_id, student_id, expect_mastery, expect_reviews, new_mastery, new_reviews) AS (
  VALUES
    ('764d93f7-6410-4fbc-870c-ffae445e85cb'::uuid, 'bb34c69e-b7a4-4127-baa6-5a25bf3c6770'::uuid, 5, 5, 2, 2),
    ('45c02f6d-ce48-43f2-9f5a-77c53d0ff07a'::uuid, '0aea72e3-26d5-409e-9992-a59936fd3abd'::uuid, 2, 2, 1, 1),
    ('124da150-81f9-42da-9c0b-8d84bd83c6a0'::uuid, 'dbe40a1f-9594-4f8c-b49f-e874ef1ef292'::uuid, 2, 2, 1, 1)
)
UPDATE public.student_lexical_mastery m
SET mastery_level  = p.new_mastery,
    review_count   = p.new_reviews,
    next_review_at = m.last_review_at
                     + public.lexical_compat_review_interval(p.new_mastery::smallint),
    updated_at     = now()
FROM plan p
WHERE m.student_id      = p.student_id
  AND m.lexical_item_id = p.item_id
  AND m.mastery_level   = p.expect_mastery
  AND m.review_count    = p.expect_reviews
  AND m.last_review_at IS NOT NULL
  AND m.correct_count  <= p.new_reviews;

COMMIT;

-- ── 3. 驗收：三列都該是「✅ 已修正」──────────────────────────────
--
-- 🛑 出現「沒改到」不代表壞了 —— 那是樂觀鎖擋下來的，資料沒被動過。
--    重跑 06 看現況（最可能是 06 之後那位學生又練習了）。
WITH expected(item_id, student_id, want_old_mastery, want_new_mastery) AS (
  VALUES
    ('764d93f7-6410-4fbc-870c-ffae445e85cb'::uuid, 'bb34c69e-b7a4-4127-baa6-5a25bf3c6770'::uuid, 2, 2),
    ('45c02f6d-ce48-43f2-9f5a-77c53d0ff07a'::uuid, '0aea72e3-26d5-409e-9992-a59936fd3abd'::uuid, 5, 1),
    ('124da150-81f9-42da-9c0b-8d84bd83c6a0'::uuid, 'dbe40a1f-9594-4f8c-b49f-e874ef1ef292'::uuid, 1, 1)
)
SELECT li.lemma                                  AS "單字",
       w.mastery_level                           AS "舊表熟練度",
       w.review_count                            AS "舊表複習",
       to_timestamp(w.next_review_time / 1000.0) AS "舊表下次複習",
       CASE WHEN to_timestamp(w.next_review_time / 1000.0) <= now()
            THEN '已到期，現在就在複習佇列裡' ELSE '' END AS "狀態",
       m.mastery_level                           AS "新表熟練度",
       m.next_review_at                          AS "新表下次複習",
       CASE WHEN w.mastery_level = e.want_old_mastery
             AND m.mastery_level = e.want_new_mastery
            THEN '✅ 已修正'
            ELSE '🛑 沒改到 —— 樂觀鎖擋下了，資料沒動，重跑 06' END AS "結果"
FROM expected e
JOIN public.lexical_items li ON li.id = e.item_id
LEFT JOIN public.user_word_progress w
       ON w.user_id = e.student_id AND w.word_id = li.legacy_level_word_id
LEFT JOIN public.student_lexical_mastery m
       ON m.student_id = e.student_id AND m.lexical_item_id = e.item_id
ORDER BY li.lemma;
