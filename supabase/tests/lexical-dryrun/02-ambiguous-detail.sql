-- 🟢 唯讀。仍然無法合併的每一筆，以及為什麼。
--
-- 這一份刻意【不聚合】：數量少到可以逐筆看完，而「為什麼不能合併」
-- 只有看到原始寫法才判斷得出來要不要處理它。
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
SELECT lemma AS "字", pos AS "pack 原始詞性", coalesce(pos_norm, '—') AS "正規化",
       cands AS "題庫候選數",
       CASE WHEN cands > 1   THEN '題庫有多個同名，詞性也救不了'
            WHEN pos IS NULL OR btrim(pos) = '' THEN 'pack 這一筆沒有詞性'
            WHEN pos_norm IS NULL THEN '詞性寫法無法安全對應到單一詞性'
            ELSE '詞性與題庫不符' END AS "不能合併的原因"
  FROM scored
 WHERE NOT (cands = 1 AND pos_norm IS NOT NULL AND pos_hits = 1)
   AND cands > 0
 ORDER BY 5, 1;
