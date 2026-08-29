# Vocabulary Architecture — audit and target model

> **Written:** 2026-08-29 · **Status:** 🟡 **AUDIT + DESIGN ONLY.**
> No table, no SQL, no migration, no seed data, no data migration, no frontend change, no Production
> change, no schema exposure.
>
> Everything below about the **current** system is read from the repository — migration files, hooks,
> stores and pages — with file:line references so each claim can be checked. Everything about the
> **target** model is a proposal awaiting an owner decision.

---

## 1. Executive summary

**The system already contains a canonical word table. It is called `level_words`.**

It holds the ~6,600 MOE words with a stable id, and the Level 1–6 learner progress in
`user_word_progress` is already keyed on that id. **That half of the system is canonical-shaped
today and needs no migration.**

The duplication problem lives entirely on the **pack** side:

> `pack_items` stores a word as **free text with no link to any canonical row**, and every progress
> store keys on the **pack item**, not the word. So one word in three packs is three rows, three
> progress records, and three cards in the same review session.

There are also **two different progress systems for pack items**, with different mastery caps and
different time representations, both live.

**The recommendation is therefore not "build a canonical word layer" — it is "finish the one that
exists".** Promote `level_words` to canonical, point `pack_items` at it, and re-key mastery onto the
word. That is additive, and it avoids the outcome the owner is trying to prevent: a second vocabulary
system running alongside the first.

---

## 2. Current architecture — what exists

### 2.1 Three storage clusters

| Cluster | Tables | Written by |
|---|---|---|
| **Level system** | `level_words`, `user_word_progress` (`source='level'`) | client-side SRS in the browser store |
| **Pack system (A)** | `packs`, `pack_items`, `pack_item_progress` | server RPC `update_pack_item_progress` |
| **Pack system (B)** | `user_word_progress` (`source='pack'`, `pack_id`) | the same client-side store |

🛑 **Pack items have two progress stores, not one.** `pack_item_progress` and the `source='pack'`
rows in `user_word_progress` both exist and are both live. This is finding **9.10** in
`docs/BACKLOG.md`, seen from the data side.

### 2.2 `level_words` — the de-facto canonical word table

`supabase/migrations/create_level_words_table.sql`

| | |
|---|---|
| Key | `id text PRIMARY KEY` — the original word id, e.g. `"4448"` |
| Content | `word`, `ipa`, `translation`, `part_of_speech`, `example`, `example_translation`, `synonyms text[]`, `antonyms text[]`, `difficulty`, `category`, `tags text[]`, `extra_notes` |
| **MOE level** | **`level integer NOT NULL`** — 1–6 |
| Audio | `audio_url`, `example_audio_url` |
| RLS | ✅ public SELECT; admin-only write (hard-coded email) |

**This is already a word table with word-level metadata.** Its name says "level words", but nothing
about its shape is level-specific except one integer column.

### 2.3 `packs` / `pack_items` — collections, with copied word text

From `docs/phase-0.5b/STAGING-BOOTSTRAP.sql` (reconstructed from Production; there is no `CREATE`
migration for these in the repo):

```
packs       id uuid · title · description · theme · difficulty · created_by
            is_public · is_active · timestamps
pack_items  id uuid · pack_id uuid → packs(id) ON DELETE CASCADE
            word text NOT NULL · definition · part_of_speech · example_sentence · phonetic
            sort_order integer · audio_url · example_audio_url
```

🛑 **`pack_items` has no reference to `level_words` and no unique constraint on `(pack_id, word)`.**
The word is free text. Two packs containing *abandon* hold two unrelated rows with two different
uuids, two independently editable definitions, and two separately generated audio files.

### 2.4 Learner progress — what each store is keyed on

| Store | Key | Mastery | Time |
|---|---|---|---|
| `user_word_progress` | `(user_id, word_id, source, COALESCE(pack_id, '000…0'))` — a **unique index**, `create_user_word_progress_table.sql` + `unify_word_progress_tracking.sql` | `mastery_level` **0–6** | `next_review_time BIGINT` (Unix ms) |
| `pack_item_progress` | `(user_id, pack_id, item_id)` — per `docs/PLATFORM_AUDIT.md:174` | `mastery_level` cap **5**, "mastered" ≥ 4 | `next_review_at TIMESTAMPTZ` |

⚠️ **`user_word_progress.word_id` has no foreign key.** `unify_word_progress_tracking.sql` line 6
drops it explicitly:

> `ALTER TABLE user_word_progress DROP CONSTRAINT IF EXISTS user_word_progress_word_id_fkey;`
> `-- pack items 的 ID 不在 level_words 表裡`

So `word_id` means **`level_words.id`** when `source='level'` and **`pack_items.id`** when
`source='pack'`. One column, two populations, no constraint distinguishing them. It is a polymorphic
key without a discriminator that the database enforces.

### 2.5 Review algorithm — two of them

**Client-side** (`src/store/vocabularyStore.ts:7-19, 280-330`) — the Level system and pack system B:

| Mastery | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| Interval | now | 10 min | 1 day | 3 days | 1 week | 2 weeks | 30 days |

Transitions: `forgot` → −2 · `hard` → −1 · `easy`/correct → +1 (cap 6) · wrong → −1.
`DAILY_REVIEW_LIMIT = 20`.

**Server-side** — `update_pack_item_progress(p_pack_id, p_item_id, p_is_correct, p_response)`, called
from `src/hooks/usePackItemProgress.ts:49`. Cap 5, "mastered" at ≥ 4, `TIMESTAMPTZ` scheduling.

🛑 **A word practised through two different screens can be scheduled by two different algorithms.**

### 2.6 Frontend inventory

| Area | Files |
|---|---|
| Store | `src/store/vocabularyStore.ts` (zustand + `persist` → localStorage) |
| Sync | `src/lib/wordProgressSync.ts`, `src/lib/levelWords.ts` |
| Hooks | `src/hooks/useUserPacks.ts` (incl. `useMultiPackItems`), `src/hooks/usePackItemProgress.ts` |
| Practice | `SRSReview` · `Flashcards` · `QuickQuiz` · `SpellingPractice` · `FillBlank` · `MatchGame` · `SynonymAntonym` · `WeakWords` |
| Browse / manage | `VocabularyHub` · `VocabularyCollections` · `VocabularyPackList` · `VocabularyPackDetail` · `VocabularyManagement` |
| Selection | `components/vocabulary/CollectionPackSelector.tsx` (supports **multi-pack**), `VocabularySelector.tsx` |
| Admin | `pages/admin/PacksAdmin.tsx`, `pages/admin/PackItemsAdmin.tsx` |
| Claim | `pages/ClaimPack.tsx`, `claim_pack_with_token` |

---

## 3. Answers to the audit questions

### 3.1 How Level 1–6 is represented today

**`level_words.level integer NOT NULL`, values 1–6.** A plain integer column on the word row.

✅ This is **already** the shape the domain model calls for — a *word level is metadata of the word*
(`LEARNING_DOMAIN_MODEL.md` §7). It is not modelled as a collection, and it should not become one.

Two gaps against the decided naming (§7.1 of that document):

- the column is `level`, and 🛑 a bare `level` is banned; the decided name is **`word_level`**;
- the values are integers 1–6 with **no `BEYOND`**, while the decided value set is
  `MOE_1 … MOE_6, BEYOND`.

### 3.2 `pack_items` identity model

**Identity is `pack_items.id uuid` — a per-pack row.** The word itself is `word text NOT NULL`, with
no canonical reference and no uniqueness constraint. Nothing in the schema knows that two rows are
the same word.

### 3.3 Does the same word in two packs create two records?

**Yes — and it cascades into four separate duplications.**

| Layer | What duplicates |
|---|---|
| Content | Two `pack_items` rows: two uuids, two definitions, two example sentences, two audio files |
| Progress A | Two `pack_item_progress` rows — the key contains `pack_id` **and** `item_id` |
| Progress B | Two `user_word_progress` rows — the unique index contains `COALESCE(pack_id, …)` |
| Review queue | Two cards in the same session — see §3.5 |

### 3.4 What learner progress is bound to

**Never to the word.** Always to `(pack_item, pack)` or to `(word_id, source, pack)`.

The one exception is the Level system: with `source='level'` and `pack_id IS NULL`, `word_id` **is**
`level_words.id`, so the ~6,600-word Level progress is *already* keyed on a canonical word id. ✅ That
is the part that does not need migrating.

### 3.5 The review queue does not de-duplicate

`src/hooks/useUserPacks.ts:396-465` — `useMultiPackItems` selects
`.in('pack_id', authorizedPackIds)` and calls `setItems(itemsData)` with **no grouping by word**.
`src/pages/practice/SRSReview.tsx:156` then maps items 1:1 into cards.

> **Selecting three packs that share a word puts that word in the session three times.** This is
> exactly the behaviour the owner's requirement 5 forbids, and it is a queue-construction issue as
> much as a schema one.

### 3.6 ⚠️ A read/write key mismatch in the client store

Reported because it bears directly on whether existing pack progress is trustworthy.

- `src/lib/wordProgressSync.ts:23-24` — when **loading**, pack rows are placed in the map under a
  **namespaced** key: `` `pack:${item.pack_id}:${item.word_id}` ``.
- Every **writer** passes the bare item id — e.g. `src/pages/practice/SRSReview.tsx:191`
  `updateWordProgress(currentCard.id, …, 'pack', currentCard.pack_id)`; the same pattern in
  `Flashcards:155`, `QuickQuiz:196/213`, `SpellingPractice:101`, `FillBlank:129`, `MatchGame:122`,
  `SynonymAntonym:131`.
- `vocabularyStore.ts:280-330` stores under `state.wordProgress[wordId]` — the bare key.

So loaded pack progress lands under one key shape and written pack progress under another. On the
face of the code, **a pack word's synced progress would not be seen by the screen that writes it**,
and a fresh row would be created on the bare key each session.

🛑 **This is inferred from reading the code, not from a runtime trace.** It should be verified before
anyone relies on it — but it matters here because *if* it is real, some existing pack progress may
already be less meaningful than it appears, which changes how much care a future re-key owes it.

This does **not** meet the interrupt rule in `docs/BACKLOG.md` (no data leak, no unauthorised admin
operation, no Production outage). Recorded, not acted on.

### 3.7 Can Topic vocabulary reuse the pack infrastructure?

**Yes, and it should.** `packs` already carries `theme`, `difficulty`, `is_public`, `is_active`, an
owner, an entitlement path (`user_pack_claims` + `claim_pack_with_token`), admin screens and a
detail page. A topic pack is a pack.

🛑 **What it must not do is join the *current* pack model unchanged** — that would multiply the
duplication described in §3.3 across a new content type. The order matters: canonical linkage first,
then topic packs, or the problem grows before it is fixed.

---

## 4. A · What can be kept

**Most of it.** This is an evolution, not a rebuild.

| Keep | As what |
|---|---|
| **`level_words`** | The **canonical word** table — it already is one |
| **`user_word_progress`** | The **learner × word mastery** store, re-keyed |
| **`packs`** | The **Vocabulary Collection** entity, with a type discriminator |
| **`pack_items`** | **Collection membership + collection-specific enrichment** — see §7 |
| `user_pack_claims`, `claim_pack_with_token` | Entitlement. Unchanged |
| The 7 practice screens, the store, the selectors, admin screens | Unchanged in shape; they change what they key on |
| RLS patterns on `user_word_progress`, `pack_item_progress` | ✅ Already the owner-scoped template the audit endorsed (`PRODUCTION_SCHEMA_AUDIT.md:596`) |
| Audio fields, TTS pipeline | Move to the canonical word; keep collection-level overrides |

**Nothing needs to be thrown away.** No new user-facing concept is introduced by this change.

---

## 5. B · What causes duplicate progress for one word

Five mechanisms, in dependency order. Fixing the first two makes the rest tractable.

| # | Mechanism | Where |
|---|---|---|
| **1** | `pack_items.word` is **free text with no canonical FK** | schema |
| **2** | Progress unique key **includes `pack_id`** | `unify_word_progress_tracking.sql:20-22` |
| **3** | `pack_item_progress` is keyed `(user_id, pack_id, item_id)` | second progress store |
| **4** | The **`source` column** splits `'level'` from `'pack'`, so the same word learned both ways is two rows | `unify_word_progress_tracking.sql:10` |
| **5** | The **queue does not de-duplicate** by word | `useUserPacks.ts:438-451`, `SRSReview.tsx:156` |

⚠️ **#4 is the subtlest.** A MOE Level 4 word that also appears in a topic pack produces one
`source='level'` row and one `source='pack'` row for the same learner and the same English word —
even though `level_words` holds a perfectly good canonical id for it.

---

## 6. C · Is a canonical word layer really needed?

**Yes — but it should be *promoted*, not *built*.**

The requirement is unavoidable: mastery must attach to *learner × word*, and today nothing in the
schema can answer "is this the same word?" across packs. Without it, every one of the five mechanisms
in §5 stays.

But the honest finding is that **`level_words` already provides it**:

| Property a canonical table needs | `level_words` today |
|---|---|
| Stable id per word | ✅ `id text PRIMARY KEY` |
| Word-level metadata | ✅ ipa, POS, translation, synonyms, antonyms, audio |
| MOE level as an attribute | ✅ `level integer` |
| Learner progress already keyed on it | ✅ for `source='level'` |
| Referenced by collections | ❌ **missing** |
| Covers pack-only words | ❌ **missing** |

Only the last two are absent. So the work is: **make collections point at it, and give every
pack-only word a canonical row.**

> 🛑 **Creating a new `canonical_word` table beside `level_words` would be the second vocabulary
> system the owner asked to avoid.** The name `level_words` is misleading for its new role, but a
> rename is a breaking change across hooks, RPCs and RLS policies for zero behavioural gain. **Keep
> the table, treat the name as legacy, and document the role.** A renamed view can front it later if
> the name genuinely bothers anyone.

---

## 7. D + E · Target model, and how to get there without breaking Level 1–6

### 7.1 Candidate entities

> 🛑 **Names and responsibilities only. No SQL, no columns, no migration.** Nothing here is approved.
> Any future table follows the standing rules: RLS ON with policies written at the same time,
> `TO authenticated`, `*_user_id uuid REFERENCES auth.users(id)`, no second identity store.

| Entity | Responsibility | Relationships | Origin |
|---|---|---|---|
| **`canonical_word`** | One row per word. Word-level metadata: `word_level` (MOE_1…MOE_6 / BEYOND), IPA, POS, base translation, audio | referenced by everything below | **= today's `level_words`, promoted** |
| **`vocabulary_collection`** | A named set of words: MOE level, topic, lesson, or a learner's own list. Carries a **type** discriminator | has many `collection_word` | **= today's `packs`, plus type** |
| **`collection_word`** | **Membership + collection-specific enrichment**: target sense, example sentence, teaching note, collocation, `sort_order` | `collection` ↔ `canonical_word` | **= today's `pack_items`, re-pointed** |
| **`learner_word_mastery`** | What this learner can do with this word. v1 dimensions: **Recognition**, **Production** | learner ↔ `canonical_word` | **= today's `user_word_progress`, re-keyed** |
| **`practice_event`** | One immutable observation: what was practised, which `practice_type`, correct or not, when | learner ↔ `canonical_word`, optionally ↔ `collection` | 🆕 new |

**Deprecate:** `pack_item_progress` — its role is absorbed by `learner_word_mastery` plus
`practice_event`. 🛑 Deprecate means *stop writing, keep reading, remove later*, never a silent drop.

### 7.2 The two rules that make it work

**Mastery is keyed on `(learner, canonical_word, mastery_type)` — never on a collection.**
A word learned in a lesson pack and revised from MOE Level 4 is one mastery record. This is the
requirement, stated as a key.

**Enrichment is keyed on `(collection, canonical_word)`.**
Which satisfies the owner's requirement 6 without touching mastery: the same word may carry a
different target sense, example, note and order in every collection it appears in. **Enrichment
varies; mastery does not.**

### 7.3 Practice Type stays out of the mastery key

`practice_type` — meaning recognition · recall · spelling · typing · cloze · collocation ·
word formation · contextual usage — belongs on **`practice_event`**, describing *how an observation
was produced*.

🛑 It must **not** appear in the `learner_word_mastery` key. Doing so would recreate the duplication
the whole exercise removes, one axis over. v1 mastery dimensions are **Recognition** and
**Production**, and nothing else (`LEARNING_DOMAIN_MODEL.md` §7.2).

The open question is the **mapping** from practice type to mastery dimension — does a spelling
success evidence Production? That is part of the **BLOCKED** mastery algorithm and 🛑 must not be
invented here.

### 7.4 Unified SRS

Scheduling attaches to **`(learner, canonical_word)`**, so one word has one due date no matter how
many collections contain it. Queue building becomes: resolve the selected collections to a **set of
canonical words**, then schedule — de-duplication falls out of the key instead of needing a pass.

⚠️ Two scale questions must be settled first, and both are part of the blocked mastery work:

- **cap 6 (client) vs cap 5 (server)** — which survives, and how existing values map
- **`next_review_time BIGINT` vs `next_review_at TIMESTAMPTZ`** — one representation

### 7.5 Sequencing — additive throughout

Each stage is reversible on its own and leaves the product working.

| Stage | What | Why it is safe |
|---|---|---|
| **0** | Confirm the §3.6 key mismatch is real, and measure how many `pack_items` words already exist in `level_words` | Read-only. Sizes the whole problem before anything moves |
| **1** | Add a nullable canonical reference to `pack_items`; **backfill nothing automatically** | Column is unused; nothing reads it |
| **2** | Match and backfill under review, leaving unmatched rows null | Reversible; §8.1 says why this cannot be fully automatic |
| **3** | Create canonical rows for pack-only words | Additive; grows `level_words` with rows whose `word_level` is `BEYOND` or unset |
| **4** | Write mastery to the canonical key **as well as** the existing keys (dual-write) | Old readers keep working; new data accumulates |
| **5** | Switch readers and the queue to the canonical key | Behaviour changes here — a real release |
| **6** | Stop writing the legacy keys; retire `pack_item_progress` | Only after 5 has been stable |

> **Level 1–6 progress is never touched by stages 1–4.** `source='level'` rows are already keyed on
> `level_words.id`, which *is* the canonical id. The ~6,600-word history and its SRS schedule carry
> over unchanged — the migration is entirely about the pack side.

### 7.6 Topic vocabulary

**A topic pack is a `vocabulary_collection` with `type = 'topic'`.** It reuses packs, claims, admin
screens and the detail page as they are.

🛑 **Do not build a `topic_words` table, a topic-specific progress store, or a parallel review
screen.** The whole point of the type discriminator is that MOE levels, topics, lessons and personal
lists differ by **type and enrichment**, not by machinery.

⚠️ **Ordering matters:** topic packs should land **after** the canonical link exists (stage 1–3). A
topic pack added before it inherits the duplication and enlarges the eventual backfill.

---

## 8. Migration risks — described, not executed

> 🛑 No migration is proposed, scheduled, or approved. This is the risk register a future proposal
> must answer.

### 8.1 🔴 Word matching is not a safe automatic join

`pack_items.word` is free text. Matching it to `level_words.word` is **not** a clean equality:

| Hazard | Example |
|---|---|
| Case and whitespace | `"Abandon"`, `" abandon"` |
| Inflected vs base form | `"abandoned"` in a pack, `"abandon"` canonical |
| Multi-word entries | `"give up"`, `"in spite of"` |
| **Homographs** | `lead` (verb) vs `lead` (metal) — one spelling, two words |
| **Sense divergence** | The pack's definition may target a different sense from the canonical row |

🛑 **A silent fuzzy backfill would merge distinct words and split identical ones**, and mastery is
attached to the result. Stage 2 must be reviewed, with unmatched rows left null rather than guessed.

**Homographs are the deeper question:** is `canonical_word` one row per *spelling* or per *sense*?
Per spelling is simpler and matches `level_words` today; per sense is more correct and much more
work. 🛑 **An owner decision, not settled here.**

### 8.2 🟠 Merging duplicate progress needs a stated rule

When two rows for the same learner and word collapse into one, something must decide the survivor:
highest mastery? most recent? most reviews? A wrong rule silently rewrites a student's history.

🛑 It is also **part of the blocked mastery algorithm**, so this cannot be settled before that is.

### 8.3 🟠 Scale and time-representation mismatch

Cap 6 vs cap 5, and `BIGINT` Unix ms vs `TIMESTAMPTZ`. Any mapping changes what a stored number
means. Blocked with the mastery algorithm.

### 8.4 🟡 The client store persists to localStorage

`vocabularyStore` uses zustand `persist`. Browsers hold word progress under the **current** key
shape, including whatever §3.6 has been producing. A re-key needs a client-side migration or a
deliberate reset, or stale local state will fight the server after release.

### 8.5 🟡 Anonymous and logged-out learners

`VocabularyHub` shows a 「本裝置」 badge when not signed in — progress exists **only** in
localStorage for those users. Any canonical re-key must decide what happens to it, including at the
moment such a learner signs up.

### 8.6 🟡 Adjacent open findings that touch this area

Listed so a future proposal does not trip over them. 🛑 **Not to be acted on here.**

| Finding | Relevance |
|---|---|
| **9.10** divergent SRS semantics | The two algorithms this document describes. §7.4 depends on resolving it |
| **9.9** broken `upsert_word_progress` 6-arg overload | Its `ON CONFLICT` targets a dropped constraint. Latent — the live path uses 8 args |
| **9.7** unpinned `search_path` | `get_all_word_progress`, `upsert_word_progress`, `is_premium_member`, `claim_pack_with_token` are all in this area (A2) |
| **9.5** `claim_pack_with_token` ignores `p_site` | Pack entitlement; adjacent to collections |
| **9.4** `invite_tokens` readable by `anon` | The pack claim path |

### 8.7 🟡 Naming debt this change should settle

- `level_words` will be the canonical table under a level-specific name (§6)
- `level integer` should become **`word_level`** with `MOE_1…MOE_6 / BEYOND` (§3.1, and
  `LEARNING_DOMAIN_MODEL.md` §7.1 bans a bare `level`)
- `user_word_progress.word_id` is polymorphic today; after the re-key it means canonical word only,
  and the `source` column loses its purpose

---

## 9. Open decisions this audit cannot make

| # | Decision | Blocks |
|---|---|---|
| 1 | **Canonical word = one per spelling, or one per sense?** (§8.1) | the whole canonical layer |
| 2 | **Mastery algorithm** — scale, merge rule, decay, thresholds (already BLOCKED) | stages 4–6 |
| 3 | **practice_type → mastery dimension mapping** (§7.3) | evidence generation |
| 4 | Whether `level_words` is renamed, fronted by a view, or left as-is (§6) | naming only |
| 5 | What happens to anonymous localStorage progress (§8.5) | stage 5 |

---

## 10. This round produced no code

No table, no SQL, no migration, no seed data, no data migration, no frontend change, no Production
change, no schema exposure. This document only.
