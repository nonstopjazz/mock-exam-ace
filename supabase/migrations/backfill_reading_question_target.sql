-- =====================================================
-- 填上 VC 題的 anchor（只填能唯一定位的）
--
-- 🟢 只要在 production 執行一次。
--
-- ⚠️ 先執行 add_reading_question_target.sql。
--
-- 【做法】題幹長這樣：
--     The word "settled" in the passage is closest in meaning to _____.
--   引號裡那個字就是要標的目標。這支把它抓出來，數它在 passage_text 裡
--   出現幾次，【只有剛好出現一次】才填。
--
-- 🛑 出現兩次以上的【不填】，留給人工逐題確認。
--    自動挑第一個正是這次要消滅的行為——猜對了沒人知道，猜錯了學生
--    會對著錯的字想半天，而且畫面上看起來理直氣壯。
--
-- 🛑 這支是【在真實資料上推導】，不是把我本機算出來的答案貼上來。
--    本機那份 payload 跟 production 之間只要有一個字不同，貼上來的
--    位置就會錯，而且不會有任何東西報錯。
--
-- 🛑 可以重複執行。只碰 target_text IS NULL 的列，已經人工確認過的不動。
--
-- 回滾：supabase/migrations/backfill_reading_question_target.rollback.sql
-- =====================================================

WITH vc AS (
  SELECT
    q.id,
    q.passage_id,
    p.passage_text,
    -- 題幹引號裡的字。四種引號都認：" “ ” 以及單引號
    (regexp_match(q.question, '[“"'']([A-Za-z][A-Za-z''\- ]{0,40})[”"'']'))[1] AS word
  FROM public.reading_questions q
  JOIN public.reading_passages p ON p.passage_id = q.passage_id
 WHERE q.construct = 'VC'
   AND q.target_text IS NULL
),
counted AS (
  SELECT
    vc.id,
    vc.word,
    -- 大小寫不分，但要卡住詞界：settled 不可以在 unsettled 裡面算一次
    (SELECT count(*) FROM regexp_matches(
       vc.passage_text,
       '(?<![A-Za-z])' || regexp_replace(vc.word, '([\.\^\$\*\+\?\(\)\[\]\{\}\|\\])', '\\\1', 'g')
         || '(?![A-Za-z])',
       'gi')) AS hits
  FROM vc
 WHERE vc.word IS NOT NULL
)
UPDATE public.reading_questions q
   SET target_text       = c.word,
       target_occurrence = 1,
       updated_at        = now()
  FROM counted c
 WHERE q.id = c.id
   AND c.hits = 1;


-- ── 結果（唯讀）───────────────────────────────────────
-- 🛑 這張表要看完。它會告訴你哪幾題【沒有】被填，以及為什麼。
WITH vc AS (
  SELECT q.id, q.passage_id, q.question, q.target_text, p.passage_text,
         (regexp_match(q.question, '[“"'']([A-Za-z][A-Za-z''\- ]{0,40})[”"'']'))[1] AS word
    FROM public.reading_questions q
    JOIN public.reading_passages p ON p.passage_id = q.passage_id
   WHERE q.construct = 'VC'
),
counted AS (
  SELECT vc.*,
         CASE WHEN vc.word IS NULL THEN NULL ELSE (
           SELECT count(*) FROM regexp_matches(
             vc.passage_text,
             '(?<![A-Za-z])' || regexp_replace(vc.word, '([\.\^\$\*\+\?\(\)\[\]\{\}\|\\])', '\\\1', 'g')
               || '(?![A-Za-z])', 'gi')) END AS hits
    FROM vc
)
SELECT
  CASE
    WHEN word IS NULL       THEN '題幹沒有引號詞'
    WHEN hits = 1           THEN '✅ 已自動填上（唯一）'
    WHEN hits = 0           THEN '🛑 文章裡找不到這個字（題目本身有問題）'
    ELSE                         '⚠️ 出現 ' || hits || ' 次，等人工確認'
  END                                   AS "狀態",
  count(*)                              AS "題數",
  string_agg(passage_id, ', ' ORDER BY passage_id)
    FILTER (WHERE hits IS DISTINCT FROM 1)  AS "是哪幾篇"
  FROM counted
 GROUP BY 1
 ORDER BY 1;
