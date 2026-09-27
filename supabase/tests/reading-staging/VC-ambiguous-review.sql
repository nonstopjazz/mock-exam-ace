-- =====================================================
-- VC 題：同一個字出現多次的，逐題逐處列出來給人看（唯讀）
--
-- 🟢 只要在 production 執行一次。執行模式：Run without RLS。
--
-- ⚠️ 先執行 backfill_reading_question_target.sql —— 這支只列出【它沒填的】。
--
-- 🛑 這是人工校對的清單，不是自動判斷。
--    每一行是同一個字在文章裡的一次出現，附前後文。你看完決定題目考的是
--    哪一次，把「篇號 → 第幾次」告訴我，我產生 UPDATE。
--
-- 最右邊那欄是【解說裡的英文引文】。它常常就指出是哪一處，但那是推測，
-- 不是資料——所以它只是線索，由你判斷，不由程式判斷。
-- =====================================================

WITH vc AS (
  SELECT q.id, q.passage_id, q.question, k.explanation, p.passage_text,
         (regexp_match(q.question, '[“"'']([A-Za-z][A-Za-z''\- ]{0,40})[”"'']'))[1] AS word
    FROM public.reading_questions q
    JOIN public.reading_passages p ON p.passage_id = q.passage_id
    LEFT JOIN public.reading_question_keys k ON k.question_id = q.id
   WHERE q.construct = 'VC'
     AND q.target_text IS NULL          -- 已經填好的不用再看
),
split AS (
  SELECT vc.*,
         regexp_split_to_array(
           vc.passage_text,
           '(?<![A-Za-z])'
             || regexp_replace(vc.word, '([\.\^\$\*\+\?\(\)\[\]\{\}\|\\])', '\\\1', 'g')
             || '(?![A-Za-z])',
           'i') AS seg
    FROM vc
   WHERE vc.word IS NOT NULL
),
occ AS (
  SELECT s.passage_id, s.word, s.explanation,
         i AS occurrence,
         -- 前後各 70 字，並把目標用【】框起來
         right(s.seg[i], 70) || '【' || s.word || '】' || left(s.seg[i + 1], 70) AS context,
         array_length(s.seg, 1) - 1 AS total
    FROM split s,
         generate_series(1, array_length(s.seg, 1) - 1) AS i
   WHERE array_length(s.seg, 1) - 1 >= 2   -- 只列有歧義的
)
SELECT
  passage_id                                     AS "篇號",
  word                                           AS "考的字",
  occurrence || ' / ' || total                   AS "第幾次",
  regexp_replace(context, '\s+', ' ', 'g')       AS "前後文",
  -- 解說裡的英文引文（線索，不是判斷）
  (regexp_match(explanation, '[“"「]([A-Za-z][^”"」]{3,80})[”"」]'))[1] AS "解說引文（線索）"
FROM occ
ORDER BY passage_id, occurrence;
