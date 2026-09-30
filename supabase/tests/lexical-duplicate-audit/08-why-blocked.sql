-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 07 的每一道條件，逐列攤開實際值。
--
-- 為什麼需要這一支：第一版 07 在 production 跑的時候舊表三列全被擋掉，
-- 而驗收只回報「沒改到」，沒說是哪一道條件。debug 只能靠猜 ——
-- 那是 07 的設計缺陷，這支就是補上那個缺口。
--
-- 🛑 correct_count 是第一版踩到的那一欄，而它從來沒被任何查詢顯示過，
--    所以問題藏在看不到的地方：
--      舊表 updateWordProgress → correctCount: isCorrect ? +1 : 不變，
--                                而 SRS 的 easy / hard 送 legacyCorrect = true → 會加
--      新表 record_lexical_attempt → 看 p_correct，SRS 是 NULL → 不會加
WITH plan(item_id, student_id,
          exp_old_m, exp_old_r, exp_old_c,   -- 舊表：07 預期的修改前值
          fix_old_m, fix_old_r,              -- 舊表：修正後應為
          exp_new_m, exp_new_r,              -- 新表：07 預期的修改前值
          fix_new_m, fix_new_r) AS (          -- 新表：修正後應為
  VALUES
    ('764d93f7-6410-4fbc-870c-ffae445e85cb'::uuid, 'bb34c69e-b7a4-4127-baa6-5a25bf3c6770'::uuid,
     5, 5, 5,  2, 2,   5, 5,  2, 2),
    ('45c02f6d-ce48-43f2-9f5a-77c53d0ff07a'::uuid, '0aea72e3-26d5-409e-9992-a59936fd3abd'::uuid,
     6, 6, 6,  5, 5,   2, 2,  1, 1),
    ('124da150-81f9-42da-9c0b-8d84bd83c6a0'::uuid, 'dbe40a1f-9594-4f8c-b49f-e874ef1ef292'::uuid,
     2, 2, 2,  1, 1,   2, 2,  1, 1)
)
SELECT li.lemma AS "單字",

       -- ── 舊表：學生實際感受到的 ──
       w.mastery_level                   AS "舊·熟練度",
       w.review_count                    AS "舊·複習",
       w.correct_count                   AS "舊·答對",
       (w.last_review_time IS NOT NULL)  AS "舊·有last",
       CASE
         WHEN w.user_id IS NULL
           THEN '🛑 舊表找不到這一列（legacy_level_word_id 對不上）'
         WHEN w.mastery_level = p.fix_old_m AND w.review_count = p.fix_old_r
           THEN '✅ 已經是修正後的值'
         WHEN w.mastery_level <> p.exp_old_m THEN '🛑 熟練度 ≠ ' || p.exp_old_m
         WHEN w.review_count  <> p.exp_old_r THEN '🛑 複習次數 ≠ ' || p.exp_old_r
         WHEN w.correct_count <> p.exp_old_c
           THEN '🛑 答對次數 ≠ ' || p.exp_old_c || '（第一版就是被這裡擋的）'
         WHEN w.last_review_time IS NULL     THEN '🛑 沒有 last_review_time'
         ELSE '✅ 條件全過，07 會改這一列'
       END                               AS "舊表：07 會怎樣",

       -- ── 新表：平行紀錄 ──
       m.mastery_level                   AS "新·熟練度",
       m.review_count                    AS "新·複習",
       m.correct_count                   AS "新·答對",
       CASE
         WHEN m.student_id IS NULL           THEN '🛑 新表找不到這一列'
         WHEN m.mastery_level = p.fix_new_m AND m.review_count = p.fix_new_r
           THEN '✅ 已經是修正後的值（先前那次已改）'
         WHEN m.mastery_level <> p.exp_new_m THEN '🛑 熟練度 ≠ ' || p.exp_new_m
         WHEN m.review_count  <> p.exp_new_r THEN '🛑 複習次數 ≠ ' || p.exp_new_r
         WHEN m.last_review_at IS NULL       THEN '🛑 沒有 last_review_at'
         ELSE '✅ 條件全過，07 會改這一列'
       END                               AS "新表：07 會怎樣"

FROM plan p
JOIN public.lexical_items li ON li.id = p.item_id
LEFT JOIN public.user_word_progress w
       ON w.user_id = p.student_id AND w.word_id = li.legacy_level_word_id
LEFT JOIN public.student_lexical_mastery m
       ON m.student_id = p.student_id AND m.lexical_item_id = p.item_id
ORDER BY li.lemma;
