-- 🟢 唯讀。pack_items 會被分成哪幾類（含詞性正規化）
--
-- 判定邏輯與 migrate_pack_items_to_lexical.sql + lexical_normalise_pos() 一致：
--   三條安全條件一條都沒放寬 —— lemma 相同、唯一候選、兩邊詞性都認得出來且相同。
WITH src AS (
  SELECT 'lw' AS side,
         lower(regexp_replace(btrim(w.word), '\s+', ' ', 'g')) AS lemma,
         w.part_of_speech AS pos
    FROM public.level_words w WHERE btrim(coalesce(w.word, '')) <> ''
   UNION ALL
  SELECT 'pi',
         lower(regexp_replace(btrim(p.word), '\s+', ' ', 'g')),
         p.part_of_speech
    FROM public.pack_items p WHERE btrim(coalesce(p.word, '')) <> ''
),
norm AS (
  SELECT side, lemma, pos,
         CASE
           WHEN t = '' THEN NULL
           WHEN t ~ '[,/]' THEN NULL
           WHEN t IN ('n.','n','noun')                 THEN 'NOUN'
           WHEN t IN ('v.','v','verb')                 THEN 'VERB'
           WHEN t IN ('adj.','adj','adjective')        THEN 'ADJ'
           WHEN t IN ('adv.','adv','adverb')           THEN 'ADV'
           WHEN t IN ('prep.','prep','preposition')    THEN 'PREP'
           WHEN t IN ('conj.','conj','conjunction')    THEN 'CONJ'
           WHEN t IN ('pron.','pron','pronoun')        THEN 'PRON'
           WHEN t = 'noun phrase'      THEN CASE WHEN multiword THEN 'NOUN' ELSE NULL END
           WHEN t = 'verb phrase'      THEN CASE WHEN multiword THEN 'VERB' ELSE NULL END
           WHEN t = 'adjective phrase' THEN CASE WHEN multiword THEN 'ADJ'  ELSE NULL END
           ELSE NULL
         END AS pos_norm
    FROM (SELECT side, lemma, pos,
                 regexp_replace(lower(btrim(coalesce(pos, ''))), '\s+', ' ', 'g') AS t,
                 (lemma LIKE '% %') AS multiword
            FROM src) x
),
lw AS (SELECT * FROM norm WHERE side = 'lw'),
pi AS (SELECT * FROM norm WHERE side = 'pi'),
scored AS (
  SELECT pi.lemma, pi.pos, pi.pos_norm,
         (SELECT count(*) FROM lw WHERE lw.lemma = pi.lemma) AS cands,
         (SELECT count(*) FROM lw WHERE lw.lemma = pi.lemma
             AND lw.pos_norm IS NOT NULL AND lw.pos_norm = pi.pos_norm) AS pos_hits
    FROM pi
)
SELECT CASE WHEN cands = 1 AND pos_norm IS NOT NULL AND pos_hits = 1 THEN 'exact_safe_match'
            WHEN cands = 0 THEN 'new_item_created'
            ELSE 'ambiguous_match' END AS "預測分類",
       count(*)::int AS "筆數"
  FROM scored GROUP BY 1
 UNION ALL
-- 空字串的 word 在上面的 CTE 就被濾掉了，但 migration 會把它記成
-- manual_review_required（不建立任何 canonical 項目），所以這裡補回來。
SELECT 'manual_review_required', count(*)::int
  FROM public.pack_items WHERE btrim(coalesce(word, '')) = ''
 HAVING count(*) > 0
 ORDER BY 2 DESC;
