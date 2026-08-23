-- =====================================================================
--  A1-3 — PACK SIZE SURVEY  (READ-ONLY, Production-safe)
--
--  Purpose: set TTS_MAX_ITEMS_PER_REQUEST from REAL pack sizes rather
--  than a guessed number, per the owner's instruction that a security
--  cap must not break the normal admin workflow.
--
--  Every statement is a SELECT against public.packs / public.pack_items.
--  Nothing is modified. No PII is returned.
-- =====================================================================


-- ===== [P01] Every pack: item count and synthesis workload =====
-- syntheses_needed    = the work a NORMAL (non-force) run must do.
-- syntheses_if_forced = the full regeneration cost.
SELECT
  'P01' AS qid,
  p.id            AS pack_id,
  p.title,
  p.is_active,
  count(pi.id)                                                         AS items,
  count(pi.id) FILTER (WHERE pi.example_sentence IS NOT NULL)          AS items_with_example,
  count(pi.id) FILTER (WHERE pi.audio_url IS NULL)                     AS missing_word_audio,
  count(pi.id) FILTER (WHERE pi.example_sentence IS NOT NULL
                         AND pi.example_audio_url IS NULL)             AS missing_example_audio,
  count(pi.id) FILTER (WHERE pi.audio_url IS NULL)
    + count(pi.id) FILTER (WHERE pi.example_sentence IS NOT NULL
                            AND pi.example_audio_url IS NULL)          AS syntheses_needed,
  count(pi.id)
    + count(pi.id) FILTER (WHERE pi.example_sentence IS NOT NULL)      AS syntheses_if_forced
FROM public.packs p
LEFT JOIN public.pack_items pi ON pi.pack_id = p.id
GROUP BY p.id, p.title, p.is_active
ORDER BY items DESC;


-- ===== [P02] The headline numbers =====
-- These are what you actually need in order to choose the limit.
SELECT
  'P02' AS qid,
  count(*)                                            AS pack_count,
  max(items)                                          AS largest_pack_items,
  round(avg(items))                                   AS avg_pack_items,
  percentile_disc(0.95) WITHIN GROUP (ORDER BY items) AS p95_pack_items,
  max(syntheses_if_forced)                            AS worst_case_syntheses
FROM (
  SELECT
    p.id,
    count(pi.id) AS items,
    count(pi.id) + count(pi.id) FILTER (WHERE pi.example_sentence IS NOT NULL)
      AS syntheses_if_forced
  FROM public.packs p
  LEFT JOIN public.pack_items pi ON pi.pack_id = p.id
  GROUP BY p.id
) s;


-- ===== [P03] Packs that CANNOT complete in one 60s invocation today =====
-- Rough model: 5-way concurrency, ~0.5s per synthesis round trip, and
-- ~10s reserved for fetch + Storage uploads + DB updates:
--     capacity ~= (60 - 10) * 5 / 0.5  ~=  500 syntheses   (optimistic)
-- Treat 250 as the realistic ceiling — uploads and pack_items updates are
-- serialised inside each task and Google TTS latency is variable.
--
-- Any pack listed here ALREADY fails or nearly fails today. That is why
-- the admin UI carries a 504 "try a smaller pack" message.
SELECT
  'P03' AS qid,
  p.id AS pack_id,
  p.title,
  count(pi.id) AS items,
  count(pi.id) + count(pi.id) FILTER (WHERE pi.example_sentence IS NOT NULL)
    AS syntheses_if_forced,
  'exceeds realistic single-invocation budget' AS note
FROM public.packs p
LEFT JOIN public.pack_items pi ON pi.pack_id = p.id
GROUP BY p.id, p.title
HAVING count(pi.id) + count(pi.id) FILTER (WHERE pi.example_sentence IS NOT NULL) > 250
ORDER BY 5 DESC;


-- =====================================================================
--  HOW TO CHOOSE TTS_MAX_ITEMS_PER_REQUEST
--
--  With chunking in place this value is a TIMEOUT bound, not a cap on
--  what an admin may do. The UI loops until the pack is finished, so a
--  1000-item pack still completes end to end — it takes 10 requests
--  instead of one impossible request.
--
--  Rule of thumb:
--      limit  ~=  200 / (1 + fraction_of_items_that_have_an_example)
--
--  because each item costs 1 synthesis, or 2 when it has an example.
--
--      every item has an example  ->  ~100 items per request
--      no item has an example     ->  ~200 items per request
--
--  The default of 100 is deliberately conservative and safe for every
--  pack shape observed so far. Raise it only after timing a real run.
--
--  Do NOT raise it beyond what a real pack completes in under ~45s.
--  Exceeding maxDuration produces a 504 mid-pack. With chunking the
--  already-processed slices are still saved, so a retry resumes cheaply,
--  but it is still a failed request.
-- =====================================================================


-- ===== [P04] After deploying: confirm the chosen limit is safe =====
-- Time ONE chunk against your LARGEST pack, on staging:
--
--   time curl -s -X POST "$BASE/api/generate-pack-audio" \
--     -H 'Content-Type: application/json' \
--     -H "Authorization: Bearer $ADMIN_JWT" \
--     -d '{"pack_id":"<LARGEST_PACK_ID>","offset":0}'
--
--   Target: comfortably under 45s. If it approaches 50s, LOWER the limit.
--
-- Then confirm the chunk actually persisted its slice:
--
--   SELECT count(*) FILTER (WHERE audio_url IS NOT NULL) AS with_audio,
--          count(*) AS total
--   FROM public.pack_items WHERE pack_id = '<LARGEST_PACK_ID>';
-- =====================================================================
