-- 🟢 唯讀。同義／反義關係會建立多少、解不開多少。
--
-- 🛑 關鍵：關係解析發生在 pack 匯入【之後】（順序 6 → 7 → 8）。
--    所以候選池不是只有 level_words —— 每一筆沒合併成功的 pack item
--    都會多一個同 lemma 的項目，讓原本「唯一命中」變成 ambiguous。
--    只數 level_words 的版本會高估「可建立」的數量。
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
  SELECT side, lemma,
         CASE
           WHEN t = '' THEN NULL
           WHEN t ~ '[,/]' THEN NULL
           WHEN t IN ('n.','n','noun')              THEN 'NOUN'
           WHEN t IN ('v.','v','verb')              THEN 'VERB'
           WHEN t IN ('adj.','adj','adjective')     THEN 'ADJ'
           WHEN t IN ('adv.','adv','adverb')        THEN 'ADV'
           WHEN t IN ('prep.','prep','preposition') THEN 'PREP'
           WHEN t IN ('conj.','conj','conjunction') THEN 'CONJ'
           WHEN t IN ('pron.','pron','pronoun')     THEN 'PRON'
           WHEN t = 'noun phrase'      THEN CASE WHEN multiword THEN 'NOUN' ELSE NULL END
           WHEN t = 'verb phrase'      THEN CASE WHEN multiword THEN 'VERB' ELSE NULL END
           WHEN t = 'adjective phrase' THEN CASE WHEN multiword THEN 'ADJ'  ELSE NULL END
           ELSE NULL
         END AS pos_norm
    FROM (SELECT side, lemma,
                 regexp_replace(lower(btrim(coalesce(pos, ''))), '\s+', ' ', 'g') AS t,
                 (lemma LIKE '% %') AS multiword
            FROM src) x
),
lw AS (SELECT * FROM norm WHERE side = 'lw'),
pi AS (SELECT * FROM norm WHERE side = 'pi'),
-- 沒合併成功的 pack item 會各自新增一個 canonical 項目
pack_new AS (
  SELECT pi.lemma
    FROM pi
   WHERE NOT (
     (SELECT count(*) FROM lw WHERE lw.lemma = pi.lemma) = 1
     AND pi.pos_norm IS NOT NULL
     AND (SELECT count(*) FROM lw WHERE lw.lemma = pi.lemma
             AND lw.pos_norm IS NOT NULL AND lw.pos_norm = pi.pos_norm) = 1
   )
),
-- migration 跑完之後，每個 lemma 實際會有幾個 canonical 項目
pool AS (
  SELECT lemma, count(*)::int AS n
    FROM (SELECT lemma FROM lw UNION ALL SELECT lemma FROM pack_new) a
   GROUP BY lemma
),
edges AS (
  SELECT lower(regexp_replace(btrim(w.word), '\s+', ' ', 'g')) AS src,
         'synonym' AS kind,
         lower(regexp_replace(btrim(s), '\s+', ' ', 'g')) AS tgt
    FROM public.level_words w, unnest(coalesce(w.synonyms, '{}')) AS s
   WHERE btrim(coalesce(w.word, '')) <> '' AND btrim(coalesce(s, '')) <> ''
   UNION ALL
  SELECT lower(regexp_replace(btrim(w.word), '\s+', ' ', 'g')),
         'antonym',
         lower(regexp_replace(btrim(a), '\s+', ' ', 'g'))
    FROM public.level_words w, unnest(coalesce(w.antonyms, '{}')) AS a
   WHERE btrim(coalesce(w.word, '')) <> '' AND btrim(coalesce(a, '')) <> ''
)
SELECT e.kind AS "關係",
       CASE WHEN e.tgt = e.src        THEN '自我參照（略過）'
            WHEN coalesce(p.n, 0) = 1 THEN '可建立'
            WHEN coalesce(p.n, 0) = 0 THEN 'no_match（未解決）'
            ELSE 'ambiguous_match（未解決）' END AS "預測",
       count(*)::int AS "筆數"
  FROM edges e LEFT JOIN pool p ON p.lemma = e.tgt
 GROUP BY 1, 2 ORDER BY 1, 3 DESC;
