-- =====================================================
-- VC 題：把人工確認過的 19 題 anchor 填上
--
-- 🟢 只要在 production 執行一次。執行模式：Run without RLS。
--
-- ⚠️ 前置：add_reading_question_target.sql → backfill_reading_question_target.sql
--          （自動填掉 269 題）→ VC-ambiguous-review.sql（列出這 19 題）→ 這支。
--
-- 🛑 這 19 題【全部】是第 1 次出現。看起來就是「挑第一個」，但不是——
--    每一題的理由寫在下面那張表的註解裡，而其中兩題如果標錯是會害到學生的：
--
--      KR0001 settled   第 1、2 次＝塵埃落定；【第 3 次＝(山)沉降回原位】，意思不同
--      KR0189 overlap   第 1、2 次是名詞；【第 3 次是動詞】，詞性不同
--
--    這兩題都由解說自己的英文引文證明是第 1 次，不是推測。
--
-- 🛑 target_text 仍然【在真實資料上推導】（從題幹的引號詞抓），不是我貼上來的。
--    人工決定的只有「第幾次」那個數字。
--
-- 🛑 只碰 target_text IS NULL 的列，可以重複執行。
-- 🛑 KR0225 / KR0297 不在這張表裡——那兩題是文章裡根本沒有那個字，
--    是題目本身壞掉，不是定位失敗，另案處理（KR0297 已下架）。
--
-- 回滾：supabase/migrations/set_reading_question_target_manual.rollback.sql
-- =====================================================

WITH decided(passage_id, occurrence) AS (VALUES
  -- ── 解說引文直接證明的 6 題 ──────────────────────────
  ('KR0001', 1),  -- "every feature has been settled"        🛑 第 3 次是「山沉降」，不同意思
  ('KR0032', 1),  -- "a thin veil that circled the planet"
  ('KR0063', 1),  -- "strikingly elegant"
  ('KR0153', 1),  -- "a slow drift"
  ('KR0190', 1),  -- "only after rain"
  ('KR0227', 1),  -- "utilization—the proportion of available seats…"
  -- ── 第 1 次是文章定義這個字的地方，後面都是回指 ────────
  ('KR0002', 1),  -- a disciplined attention to the world around them
  ('KR0109', 1),  -- a legible category: a refugee…（冒號直接定義）
  ('KR0115', 1),  -- what we might call cultural redundancy（明講）
  ('KR0156', 1),  -- each patch of tarnish, marked years of use
  ('KR0161', 1),  -- an ongoing conversation with the environment
  ('KR0189', 1),  -- a simple overlap: the fields must hold water…  🛑 第 3 次是動詞
  ('KR0266', 1),  -- the hat's real eloquence lay in its choreography
  ('KR0270', 1),  -- a revival has taken root
  ('KR0275', 1),  -- that anachronistic pigment
  ('KR0285', 1),  -- a negotiation with a natural rhythm…
  ('KR0290', 1),  -- they improvise. A student late for class, for example…
  ('KR0311', 1),  -- delicate white curls, slender needles（三次同義同詞性）
  ('KR0315', 1)   -- a motion so slow it is imperceptible in a human lifetime
),
vc AS (
  SELECT
    q.id,
    d.occurrence,
    -- 跟 backfill 用同一條 regex：題幹引號裡的字
    (regexp_match(q.question, '[“"'']([A-Za-z][A-Za-z''\- ]{0,40})[”"'']'))[1] AS word
  FROM public.reading_questions q
  JOIN decided d ON d.passage_id = q.passage_id
 WHERE q.construct = 'VC'
   AND q.target_text IS NULL
)
UPDATE public.reading_questions q
   SET target_text       = v.word,
       target_occurrence = v.occurrence,
       updated_at        = now()
  FROM vc v
 WHERE q.id = v.id
   AND v.word IS NOT NULL;


-- ── 驗證（唯讀）───────────────────────────────────────
-- 🛑 這張表要逐行看過：最右邊是【實際會被標起來的那一段文字】。
--    如果哪一行框錯地方，那就是這次人工判斷錯了，跟我說我改那一行。
WITH t AS (
  SELECT q.passage_id, q.target_text, q.target_occurrence, p.passage_text
    FROM public.reading_questions q
    JOIN public.reading_passages p ON p.passage_id = q.passage_id
   WHERE q.construct = 'VC'
     AND q.passage_id IN ('KR0001','KR0002','KR0032','KR0063','KR0109','KR0115',
                          'KR0153','KR0156','KR0161','KR0189','KR0190','KR0227',
                          'KR0266','KR0270','KR0275','KR0285','KR0290','KR0311','KR0315')
     AND q.target_text IS NOT NULL
),
split AS (
  SELECT t.*,
         regexp_split_to_array(
           t.passage_text,
           '(?<![A-Za-z])'
             || regexp_replace(t.target_text, '([\.\^\$\*\+\?\(\)\[\]\{\}\|\\])', '\\\1', 'g')
             || '(?![A-Za-z])',
           'i') AS seg
    FROM t
)
SELECT
  passage_id                                          AS "篇號",
  target_text                                         AS "標的字",
  target_occurrence || ' / ' || (array_length(seg, 1) - 1)  AS "標第幾次",
  regexp_replace(
    right(seg[target_occurrence], 60)
      || '【' || target_text || '】'
      || left(seg[target_occurrence + 1], 60),
    '\s+', ' ', 'g')                                  AS "實際標到的地方",
  count(*) OVER ()                                    AS "本次共幾題（應為 19）",
  (SELECT count(*) FROM public.reading_questions
    WHERE construct = 'VC' AND target_text IS NOT NULL)     AS "VC 已標總數（應為 288）",
  (SELECT count(*) FROM public.reading_questions
    WHERE construct = 'VC' AND target_text IS NULL)         AS "仍未標（應為 2＝壞掉的那兩題）"
FROM split
ORDER BY passage_id;
