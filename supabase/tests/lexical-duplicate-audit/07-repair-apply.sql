-- 🔴 【會寫入】這支會改 production 資料。跑之前必須先跑 06 和 08 並確認每一欄。
--
-- 修正連點重複造成的熟練度膨脹。只碰 3 個「學生 × 單字」，用 UUID 寫死。
--
-- ══════════════════════════════════════════════════════════════
-- 🛑 第一版漏了 correct_count，導致舊表三列全被自己的保護擋掉
-- ══════════════════════════════════════════════════════════════
--
--   vocabularyStore 的 updateWordProgress：
--       correctCount: isCorrect ? correctCount + 1 : correctCount
--   而 SRS 的 easy / hard 都送 legacyCorrect = true
--   → 舊表每一次複習都會加一次 correct_count，連點重複的那幾次也加了。
--
--   新表不一樣：record_lexical_attempt 看 p_correct，而 SRS 的 p_correct 是 NULL，
--   所以新表的 correct_count 是 0。
--
--   第一版只加了 `correct_count <= new_reviews` 的保護、卻沒有一併扣 correct_count。
--   舊表三列都是 correct_count = review_count（5 / 6 / 2），
--   於是 5<=2、6<=5、2<=1 全部 false，三列全擋。
--   而測試沒抓到，是因為 fixture 的舊表 correct_count 填了 0 ——
--   那是新表的值，拿去鋪舊表，測試就全過了。
--
-- ══════════════════════════════════════════════════════════════
-- 🛑 為什麼「修改前的數值」寫死，而 06 是現場重算
-- ══════════════════════════════════════════════════════════════
--
--   06 是預覽 → 現場重算才看得到最新狀況。
--   07 是寫入 → 現場重算【會毀資料】：
--     airline 修完是 5/5，但 lexical_attempts 裡的多算次數永遠是 1，
--     再算一次就是 5 − 1 = 4。實測過：第二次跑 airline 變 4/4、
--     interact 變 -1/-1（負的熟練度；新表有 CHECK 會攔，舊表沒有，會直接寫進去）。
--
--   所以 expect_* 是「06 / 08 當時看到、而且人已核可」的數值，寫進 WHERE 當樂觀鎖：
--     • 跑第二次 → 現值 ≠ expect_* → 更新 0 列
--     • 06 之後又有人練習 → 對不上 → 更新 0 列
--
--   ⚠️ 因此這支不可以在沒跑過 06 / 08 的情況下使用，也不可以套用到別的環境
--      或別的時間點 —— expect_* 是那一次快照的值。
--
-- ══════════════════════════════════════════════════════════════
-- 依據（2026-09-30 的 06 / 08 輸出，三列全部「一致」且可反推）
-- ══════════════════════════════════════════════════════════════
--
--   舊表 user_word_progress（mastery / review / correct）
--     interact  5/5/5 → 2/2/2      airline  6/6/6 → 5/5/5      armchair  2/2/2 → 1/1/1
--
--   新表 student_lexical_mastery（mastery / review）
--     interact  5/5 → 2/2          airline  2/2 → 1/1          armchair  2/2 → 1/1
--
--   🛑 airline 兩張表的修改前數值不同不是筆誤 —— 舊表從 2026-02-10 收資料，
--      attempts 是 2026-09-22 才有的。
--
--   🛑 新表若已經在先前那次被改好了，它的樂觀鎖會擋掉（現值已非 expect_*），
--      那是對的，最後的斷言會確認整體狀態正確。
--
-- next_review 不寫死，用 last_review + lexical_compat_review_interval(新熟練度)
-- 重算 —— 間隔表哪天改了，這裡跟著改。
BEGIN;

-- ── 1. 舊表 user_word_progress（學生實際感受到的）────────────────
WITH plan(item_id, student_id,
          expect_mastery, expect_reviews, expect_correct,
          new_mastery, new_reviews, new_correct) AS (
  VALUES
    ('764d93f7-6410-4fbc-870c-ffae445e85cb'::uuid, 'bb34c69e-b7a4-4127-baa6-5a25bf3c6770'::uuid, 5, 5, 5, 2, 2, 2),
    ('45c02f6d-ce48-43f2-9f5a-77c53d0ff07a'::uuid, '0aea72e3-26d5-409e-9992-a59936fd3abd'::uuid, 6, 6, 6, 5, 5, 5),
    ('124da150-81f9-42da-9c0b-8d84bd83c6a0'::uuid, 'dbe40a1f-9594-4f8c-b49f-e874ef1ef292'::uuid, 2, 2, 2, 1, 1, 1)
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
    -- 🛑 連點那幾次也加過 correct_count，要一起扣回來
    correct_count    = r.new_correct,
    next_review_time = (extract(epoch FROM
                          to_timestamp(w.last_review_time / 1000.0)
                          + public.lexical_compat_review_interval(r.new_mastery::smallint)
                        ) * 1000)::bigint,
    updated_at       = now()
FROM resolved r
WHERE w.user_id = r.student_id
  AND w.word_id = r.legacy_level_word_id
  -- 樂觀鎖：三個數值都必須還是核可時看到的那一組
  AND w.mastery_level = r.expect_mastery
  AND w.review_count  = r.expect_reviews
  AND w.correct_count = r.expect_correct
  AND w.last_review_time IS NOT NULL;

-- ── 2. 新表 student_lexical_mastery（平行紀錄，保持一致）──────────
-- 新表的 correct_count 本來就是 0（SRS 的 p_correct 是 NULL），不需要動。
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

-- ── 3. 🛑 原子性：整體沒到目標狀態就全部回滾 ─────────────────────
--
-- 第一版沒有這一段，結果第一次在 production 跑的時候
-- 舊表匹配 0 列、新表匹配 3 列，然後就這樣 COMMIT 了 —— 兩張表變得不一致。
-- 「一半成功」比「完全失敗」難處理，所以現在寧可整批退回。
DO $$
DECLARE v_bad INT;
BEGIN
  SELECT count(*) INTO v_bad
  FROM (VALUES
    ('764d93f7-6410-4fbc-870c-ffae445e85cb'::uuid, 'bb34c69e-b7a4-4127-baa6-5a25bf3c6770'::uuid, 2, 2, 2, 2),
    ('45c02f6d-ce48-43f2-9f5a-77c53d0ff07a'::uuid, '0aea72e3-26d5-409e-9992-a59936fd3abd'::uuid, 5, 5, 1, 1),
    ('124da150-81f9-42da-9c0b-8d84bd83c6a0'::uuid, 'dbe40a1f-9594-4f8c-b49f-e874ef1ef292'::uuid, 1, 1, 1, 1)
  ) AS e(item_id, student_id, want_old_m, want_old_r, want_new_m, want_new_r)
  JOIN public.lexical_items li ON li.id = e.item_id
  LEFT JOIN public.user_word_progress w
         ON w.user_id = e.student_id AND w.word_id = li.legacy_level_word_id
  LEFT JOIN public.student_lexical_mastery m
         ON m.student_id = e.student_id AND m.lexical_item_id = e.item_id
  WHERE w.mastery_level IS DISTINCT FROM e.want_old_m
     OR w.review_count  IS DISTINCT FROM e.want_old_r
     OR m.mastery_level IS DISTINCT FROM e.want_new_m
     OR m.review_count  IS DISTINCT FROM e.want_new_r;

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      '🛑 有 % 列沒到目標狀態，整批回滾（沒有任何資料被改）。先跑 08 看現況。', v_bad;
  END IF;
END $$;

COMMIT;

-- ── 4. 驗收：三列都該是「✅ 已修正」──────────────────────────────
--
-- 跑到這裡代表第 3 段的斷言過了，所以這裡應該全綠。
-- 若上面 RAISE 了，整批已回滾，這一段不會執行。
WITH expected(item_id, student_id, want_old_mastery, want_new_mastery) AS (
  VALUES
    ('764d93f7-6410-4fbc-870c-ffae445e85cb'::uuid, 'bb34c69e-b7a4-4127-baa6-5a25bf3c6770'::uuid, 2, 2),
    ('45c02f6d-ce48-43f2-9f5a-77c53d0ff07a'::uuid, '0aea72e3-26d5-409e-9992-a59936fd3abd'::uuid, 5, 1),
    ('124da150-81f9-42da-9c0b-8d84bd83c6a0'::uuid, 'dbe40a1f-9594-4f8c-b49f-e874ef1ef292'::uuid, 1, 1)
)
SELECT li.lemma                                  AS "單字",
       w.mastery_level                           AS "舊表熟練度",
       w.review_count                            AS "舊表複習",
       w.correct_count                           AS "舊表答對",
       to_timestamp(w.next_review_time / 1000.0) AS "舊表下次複習",
       CASE WHEN to_timestamp(w.next_review_time / 1000.0) <= now()
            THEN '已到期，現在就在複習佇列裡' ELSE '' END AS "狀態",
       m.mastery_level                           AS "新表熟練度",
       m.next_review_at                          AS "新表下次複習",
       CASE WHEN w.mastery_level = e.want_old_mastery
             AND m.mastery_level = e.want_new_mastery
            THEN '✅ 已修正' ELSE '🛑 狀態不符' END AS "結果"
FROM expected e
JOIN public.lexical_items li ON li.id = e.item_id
LEFT JOIN public.user_word_progress w
       ON w.user_id = e.student_id AND w.word_id = li.legacy_level_word_id
LEFT JOIN public.student_lexical_mastery m
       ON m.student_id = e.student_id AND m.lexical_item_id = e.item_id
ORDER BY li.lemma;
