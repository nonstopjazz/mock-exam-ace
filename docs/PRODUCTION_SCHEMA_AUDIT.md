# Production Schema Audit — Phase 0.5A

> **Audit date**: 2026-08-23
> **Scope**: Production Supabase discovery for `nonstopjazz/mock-exam-ace`
> **Branch**: `claude/gsat-platform-audit-wiz5rt`
> **Predecessor**: `docs/PLATFORM_AUDIT.md` (Phase 0, repository-only audit)
>
> **Guardrails honoured**: no application code modified, no schema modified, no migration
> created or applied, no RLS altered, no function/trigger altered, no storage policy
> altered, no table created or deleted, no Production data changed, `/exam` untouched, no
> Teacher/Student/Parent UI built, no Learning Activity or Writing tables created.
> **This phase was READ-ONLY. In fact, no Production object was even read — see §0.**

---

## 0. ⛔ BLOCKER: Production Access Is Unavailable

**This is the single most important statement in this document.**

Phase 0.5A cannot be completed as specified, because this session has **no access of any
kind to the Production Supabase project**. Per your instruction — *"If direct read-only
Production access is unavailable, do NOT guess"* — **nothing in this report is presented
as confirmed Production state.**

### 0.1 What was checked, and what was found

| Access path | Result | How verified |
|-------------|--------|--------------|
| `.env` / `.env.local` file | ❌ Does not exist | `ls -la .env*` → only `.env.example` |
| `VITE_SUPABASE_URL` env var | ❌ Not set | `env \| grep -i supabase` → empty |
| `SUPABASE_SERVICE_ROLE_KEY` env var | ❌ Not set | same |
| Postgres connection string | ❌ Not set | same |
| Supabase **project ref** (even the bare id) | ❌ Not discoverable anywhere | `grep -rn "supabase.co"` across whole tree → only `'https://placeholder.supabase.co'` in `src/lib/supabase.ts:13` |
| Project ref in git history | ❌ Not present | `git log --all -S"supabase.co"` → 3 commits, all touching only `.env.example` placeholders (`your-project-id.supabase.co`) |
| Supabase MCP server | ❌ Not connected | `ToolSearch` for supabase/postgres/sql tools → no match |
| Supabase CLI | ❌ Not installed | `command -v supabase` → not found |
| CLI project link | ❌ Absent | no `~/.supabase`, no `supabase/config.toml` |
| `psql` client | ✅ **Available** (PostgreSQL 16.13) | ready to use the moment a connection string exists |

### 0.2 One genuinely good finding falls out of this

**`.env` has never been committed.** Across all 113 commits, the only env-shaped file
ever added is `.env.example`, and it contains placeholders only. No Supabase key, no
service-role key, no VAPID key, and no Google TTS key appears anywhere in the repository
or its history.

📁 *ONLY OBSERVED IN REPOSITORY* — but for a secrets-leak check, the repository **is** the
authoritative source, so this one is effectively settled. It downgrades finding **S10**
from Phase 0 (`.gitignore` missing `.env`) to a purely preventative hygiene item.

### 0.3 What was delivered instead

Rather than guess, this phase delivers:

1. **`docs/discovery/production_discovery.sql`** — a 31-query, strictly read-only
   discovery script covering Tasks 1–7 in full.
2. **`docs/discovery/README.md`** — how to run it and how to return the output.
3. **This document** — every section pre-structured to receive that output, with each
   placeholder naming the exact query (`Q01`…`Q33`) that fills it.
4. **Task 8 completed in full** — server-side security configuration is a *repository*
   inspection, so it required no Production access and is finished below (§9.8, §10).

The discovery script was **executed end-to-end against a throwaway local PostgreSQL
16.13 instance** seeded with a Supabase-shaped fixture (`auth.users`, `auth.identities`,
`storage.buckets`, `storage.objects`, the `anon`/`authenticated`/`service_role` roles,
RLS policies, deliberately overloaded functions, and a decoy writing table). **All 31
active queries ran with zero errors**, Q15 correctly detected both
`claim_pack_with_token` overloads, and Q29 correctly isolated the unaccounted writing
table. The test instance was destroyed; it never touched Production. This means the
script will not waste a round-trip on syntax errors.

### 0.4 Evidence classification used throughout

Every factual claim in this document carries one of three markers. **No inference is
ever presented as confirmed Production state.**

| Marker | Meaning |
|--------|---------|
| ✅ **CONFIRMED IN PRODUCTION** | Verified against live Production metadata. **Currently used ZERO times in this document** — no Production access was available. |
| 📁 **ONLY OBSERVED IN REPOSITORY** | Verified in repository files. Says nothing about whether Production matches. |
| ❓ **INFERRED / NOT YET CONFIRMED** | A hypothesis derived from repository evidence. Requires the named query to confirm or refute. |

---

## 1. Executive Summary

**Phase 0.5A is BLOCKED and Phase 1 must NOT begin.**

| Question | Answer |
|----------|--------|
| Was Production inventoried? | ❌ No — no access (§0) |
| Was any Production object modified? | ❌ **No.** None was even read. |
| Was any non-documentation file changed? | ❌ No |
| Is the Production schema sufficiently understood to design Teacher/Student/Parent/Class? | ❌ **No** (§14) |
| Is the Writing schema sufficiently understood to design integration? | ❌ **No** — zero information exists (§7, §14) |
| Is it safe to begin Phase 1? | ❌ **No** (§14) |

**What this phase did establish:**

1. **Access is the blocker, and it is a small one to clear.** One connection string (or
   one Dashboard paste session) converts this entire document from template to finding.
   `psql` is already installed here.
2. **A validated, safe discovery script now exists** and is proven to run clean.
3. **Task 8 is complete.** Repository-side server security was fully inspected, and it
   confirms all three Phase 0 findings plus surfaces one new one.
4. **NEW FINDING — 19 `SECURITY DEFINER` functions, zero with `SET search_path`.** Not
   present in the Phase 0 audit. This is Supabase's own
   `function_search_path_mutable` lint, and on `SECURITY DEFINER` functions it is a
   recognised privilege-escalation vector. Details in §9.7.
5. **The domain separation you asked for is recorded and respected** (§8). The GSAT mock
   exam domain is labelled RESERVED / DO NOT MODIFY, and no learning-activity or writing
   objects were designed, let alone created.

**The single highest-value action right now** is to run three queries — **Q15, Q07+Q10,
and Q29**. They resolve the CRITICAL security ambiguity, the real access-control picture,
and the writing-app discovery respectively. See `docs/discovery/README.md`.

---

## 2. Production Database Inventory

> **Status: NOT COLLECTED — Production access unavailable (§0).**
> Fill from **Q01** (tables/RLS/size/rows), **Q02** (columns), **Q03** (constraints),
> **Q04** (indexes), **Q05** (views), **Q06** (enums), **Q31** (extensions).

### 2.1 Expected inventory, from repository evidence only

📁 *ONLY OBSERVED IN REPOSITORY.* The Phase 0 audit derived the table list below. **Each
row is a hypothesis about Production, not a statement about it.**

| # | Table | Repository evidence | Production status |
|---|-------|---------------------|-------------------|
| 1 | `packs` | Full DDL in `supabase/schema.sql` (+2 ALTERs) | ❓ NOT YET CONFIRMED — Q01 |
| 2 | `pack_items` | Full DDL + `add_audio_to_pack_items.sql` | ❓ NOT YET CONFIRMED — Q01 |
| 3 | `invite_tokens` | Full DDL in `schema.sql` | ❓ NOT YET CONFIRMED — Q01 |
| 4 | `user_pack_claims` | Full DDL + `add_site_to_user_pack_claims.sql` | ❓ NOT YET CONFIRMED — Q01 |
| 5 | `user_profiles` | `create_user_profiles_table.sql` | ❓ NOT YET CONFIRMED — Q01 |
| 6 | `user_stats` | `create_user_stats_table.sql` | ❓ NOT YET CONFIRMED — Q01 |
| 7 | `user_word_progress` | `create_user_word_progress_table.sql` + `unify_…` | ❓ NOT YET CONFIRMED — Q01 |
| 8 | `level_words` | `create_level_words_table.sql` + ~2.1 MB seed | ❓ NOT YET CONFIRMED — Q01 |
| 9 | `premium_memberships` | `add_premium_memberships.sql` | ❓ NOT YET CONFIRMED — Q01 |
| 10 | `push_subscriptions` | `create_push_subscriptions_table.sql` | ❓ NOT YET CONFIRMED — Q01 |
| 11 | `app_admins` | **No DDL.** Queried at `src/hooks/useAdmin.ts:78` | ❓ May not exist — **Q21** |
| 12 | `site_settings` | **No DDL** (only ALTERs) | ❓ NOT YET CONFIRMED — Q01 |
| 13 | `pack_images` | **No DDL.** Queried in `useUserPacks.ts`, `PacksAdmin.tsx` | ❓ NOT YET CONFIRMED — Q01 |
| 14 | `pack_item_progress` | **No DDL.** Queried in `usePackItemProgress.ts` | ❓ NOT YET CONFIRMED — Q01 |
| 15 | `exams` | **No DDL.** `useExam.ts` | ❓ NOT YET CONFIRMED — Q01 |
| 16 | `vocabulary_questions` | **No DDL.** `useExam.ts` | ❓ NOT YET CONFIRMED — Q01 |
| 17 | `question_groups` | **No DDL.** `useExam.ts` | ❓ NOT YET CONFIRMED — Q01 |
| 18 | `group_questions` | **No DDL.** `useExam.ts` | ❓ NOT YET CONFIRMED — Q01 |
| 19 | `translation_questions` | **No DDL.** `useExam.ts` | ❓ NOT YET CONFIRMED — Q01 |
| 20 | `essay_questions` | **No DDL.** `useExam.ts` | ❓ NOT YET CONFIRMED — Q01 |
| 21 | `exam_attempts` | **No DDL.** `useExam.ts` (dead code path) | ❓ Predicted EMPTY — **Q32** |
| 22 | `exam_user_answers` | **No DDL.** `useExam.ts` (dead code path) | ❓ Predicted EMPTY — **Q32** |
| 23 | `exam_statistics` | **No DDL.** Likely a VIEW | ❓ Table or view? — **Q05** |
| 24–30 | `blog_posts`, `blog_categories`, `blog_likes`, `blog_bookmarks`, `blog_shares`, `blog_page_views`, `blog_post_stats` | **No DDL.** `useBlog.ts` | ❓ NOT YET CONFIRMED — Q01 |

**20 of 30 tables have no DDL in the repository at all.** Their columns, constraints,
indexes and RLS are entirely unknown. This is the core reason Phase 0.5A exists.

### 2.2 Things Q01–Q06 will reveal that the repository cannot

- ❓ Tables that exist in Production but appear **nowhere** in this repository — including
  the entire writing application (see §7).
- ❓ Columns added by hand via the Dashboard and never written into a migration file.
- ❓ Whether the `COALESCE`-based **UNIQUE INDEX** from `unify_word_progress_tracking.sql`
  actually exists. It is an index, not a constraint, so it appears **only in Q04**.
- ❓ Actual row counts — which prove or disprove the Phase 0 prediction that
  `exam_attempts` / `exam_user_answers` are dead (Q32).
- ❓ Whether `exam_statistics` and `blog_post_stats` are views, matviews, or tables (Q05).

---

## 3. Auth / Identity Model

> **Status: NOT COLLECTED.** Fill from **Q18** (FKs to `auth.users` — the identity graph),
> **Q19**/**Q20** (any pre-existing role/class/teacher concept), **Q21** (`app_admins`),
> **Q22** (volumes, no PII), **Q23** (providers), **Q17** (triggers on `auth.users`).

### 3.1 Repository-derived model

📁 *ONLY OBSERVED IN REPOSITORY:*

- `auth.users` is the single identity root. Three sign-in paths in
  `src/contexts/AuthContext.tsx`: Google OAuth, email+password, password reset.
- `user_profiles` is linked **1:1 by `user_id` with a UNIQUE constraint**, and is created
  **lazily** via `upsert_user_profile()` — there is **no `on auth.users` trigger** in any
  repository file.
- Tables with an FK to `auth.users(id)` per repository DDL: `packs.created_by`,
  `invite_tokens.created_by`, `user_pack_claims.user_id`, `user_profiles.user_id`,
  `user_stats.user_id`, `user_word_progress.user_id`, `premium_memberships.user_id`,
  `premium_memberships.granted_by`, `push_subscriptions.user_id`.

### 3.2 Open questions only Production can answer

| Question | Query | Why it matters for Phase 1 |
|----------|-------|----------------------------|
| Is there **any** trigger on `auth.users`? | **Q17** | If one already auto-creates profiles, Phase 1 item C1 is already done — or would conflict. |
| How many `auth.users` lack a `user_profiles` row? | Q22 + Q32 | Sizes the backfill. |
| Do `teacher` / `class` / `parent` / `role` tables already exist? | **Q19**, **Q20** | The writing app may already have introduced a role concept we must reuse, not duplicate. |
| Does `app_admins` actually exist? | **Q21** | `useAdmin.ts` queries it. If absent, **every admin UI check currently fails closed** and only the hard-coded email path works. |
| Which auth providers are really in use? | Q23 | Affects Parent onboarding design. |

> ❓ **INFERRED / NOT YET CONFIRMED:** Phase 0 concluded that Teacher / Class / Parent
> concepts do not exist. That conclusion was drawn from *repository* grep only. Because
> the writing application shares this database and is **not** in this repository, it may
> already have introduced role-like structures. **Q19/Q20 must confirm this before any
> Phase 1 schema is designed.** This is a real risk of designing a duplicate role system.

---

## 4. RLS Audit

> **Status: NOT COLLECTED.** Fill from **Q07** (all policies), **Q08** (RLS disabled),
> **Q09** (RLS on, no policies), **Q10** (grants), **Q11**, **Q12**.

### 4.1 Method note — why Q07 alone is not enough

**A policy is only half of the access-control picture.** In Supabase, PostgREST connects
as `anon` or `authenticated`. If that role holds **no `GRANT`** on a table, the table is
unreachable regardless of policy. If it holds a `GRANT` and RLS is **disabled**, every row
is readable regardless of intent.

**Therefore §4 must be completed by reading Q07 and Q10 *together*.** Any analysis that
quotes policies without grants is incomplete. Q08 and Q09 catch the two dangerous
edge cases.

### 4.2 Policies to scrutinise, and what to look for

📁 *ONLY OBSERVED IN REPOSITORY* — the following are repository policy texts. Q07 must
confirm whether Production matches.

| Table | Repository policy | What to check in Q07/Q10 |
|-------|-------------------|--------------------------|
| **`invite_tokens`** | `"Anyone can validate tokens" FOR SELECT USING (is_active = true)` | ⚠️ If this exists in Production **and** `anon`/`authenticated` hold SELECT (Q10), **every active invite code is enumerable by anyone**. |
| **`site_settings`** | **No DDL at all** | ⚠️ Unknown. If UPDATE is not admin-restricted, any user can change `current_phase` and unlock every gated feature globally. |
| **`app_admins`** | **No DDL at all** | ⚠️ If readable by `authenticated`, the admin roster is public. If not readable, `useAdmin.ts` fails closed. |
| **`level_words`** | SELECT `USING (true)`; INSERT/UPDATE/DELETE gated by **hard-coded email** | Broad `true` read is likely intentional (public content). Confirm write gating. |
| `premium_memberships` | SELECT own + `USING (is_admin())`. **No INSERT/UPDATE policy** | Writes happen only via `SECURITY DEFINER` functions — which is exactly why §9.1/§9.2 matter. |
| `packs` | INSERT `WITH CHECK (auth.uid() = created_by)` | Any authenticated user can create packs. Confirm this is intended. |
| `user_profiles` | SELECT/INSERT/UPDATE own. **No DELETE policy** | Confirm; affects data-deletion rights. |
| `user_word_progress`, `user_stats`, `push_subscriptions`, `user_pack_claims` | own-row `auth.uid() = user_id` | Standard. Confirm no drift. |
| **All exam tables** | **No DDL at all** | ⚠️ Completely unknown. `exam_attempts` holds per-student scores — if RLS is missing, students could read each other's results the moment §8's mock exam flow is connected. |
| **All blog tables** | **No DDL at all** | Unknown. |

### 4.3 Flag criteria to apply to Q07 output

When the output arrives, flag any policy that:
- grants `anon` access unexpectedly;
- lets `authenticated` see rows belonging to other users (missing `auth.uid() = user_id`);
- lets a non-admin modify admin or premium state;
- lets a non-admin modify global configuration (`site_settings`);
- uses a bare `true` in `USING` or `WITH CHECK` on non-public data;
- is `PERMISSIVE` where `RESTRICTIVE` was intended (a permissive policy **widens** access
  — multiple permissive policies are OR'd together).

---

## 5. PostgreSQL Functions / RPC Audit

> **Status: NOT COLLECTED.** Fill from **Q13** (signatures/security/search_path/ACL),
> **Q14** (full source), **Q15** (targeted five), **Q16** (EXECUTE grants).

### 5.1 `claim_pack_with_token` — the decisive question

**Q15 settles this definitively.** Repository state, per Phase 0:

📁 *ONLY OBSERVED IN REPOSITORY* — **two conflicting definitions of the same 2-argument
signature exist:**

| Source file | Checks premium? | Writes `site`? | Checks `site` on duplicate? |
|-------------|-----------------|----------------|-----------------------------|
| `add_site_to_user_pack_claims.sql` | ❌ No | ✅ Yes | ✅ Yes |
| `add_premium_memberships.sql` | ✅ Yes (`is_premium_member`) | ❌ **No** | ❌ No |

Both are `CREATE OR REPLACE FUNCTION claim_pack_with_token(text, text)`. **The later one
wins, and repository filenames carry no timestamps, so the repository literally cannot
tell you which.**

Additionally, a **1-argument** overload exists (`schema.sql`,
`update_claim_pack_function.sql`). If both arities are live, calling with only `p_token`
raises `function is not unique`. The client always passes both arguments
(`ClaimPack.tsx:64-67`), so this is latent rather than active.

**When Q15 output is available, state explicitly:**

1. Which behaviour Production currently has → *pending*
2. Whether it checks premium eligibility → *pending* (`body_mentions_premium_check`)
3. Whether it writes `site` → *pending* (`body_mentions_site` + full definition)
4. Whether repository migration history can reproduce the live function → *pending*
   (compare `full_definition` byte-for-byte against both repo variants; **Q30** tells you
   whether an authoritative migration order ever existed)

**Consequence either way:** if the site version is live, the premium paywall on claiming
is silently absent. If the premium version is live, `site` is never written on INSERT and
multi-site claiming is broken. ❓ *INFERRED / NOT YET CONFIRMED* — one of these two
defects is almost certainly live, but **which one is unknown.**

### 5.2 Functions to inventory

📁 *ONLY OBSERVED IN REPOSITORY* — 19 `SECURITY DEFINER` declarations across 8 files.
Repository-side authorization posture:

| Function | Internal authorization check (repo) | Production |
|----------|------------------------------------|------------|
| `admin_grant_premium` | ❌ **NONE** | ❓ Q15 |
| `admin_revoke_premium` | ❌ **NONE** | ❓ Q15 |
| `is_admin` | Hard-coded email comparison | ❓ Q15 |
| `admin_get_all_users` | ✅ calls `is_admin()` | ❓ Q15 |
| `admin_get_user_stats` | ✅ calls `is_admin()` | ❓ Q15 |
| `claim_pack_with_token` | `auth.uid()` null-check only | ❓ Q15 |
| `is_premium_member` | n/a (pure query) | ❓ Q15 |
| `upsert_user_profile`, `get_user_profile`, `update_user_streak`, `get_user_stats`, `upsert_word_progress`, `get_all_word_progress` | `auth.uid()` null-check | ❓ Q15 |
| `generate_short_token` | INVOKER; unused by client | ❓ Q15 |
| **`update_pack_item_progress`**, **`get_pack_statistics`**, **`get_weak_words`** | **No DDL in repo — body entirely unknown** | ❓ **Q14** |

Three RPCs are called by the client but have **no definition anywhere in the repository**.
Q14 is the only way to see them.

### 5.3 `search_path` — new finding

📁 *ONLY OBSERVED IN REPOSITORY, verified:* `grep -rn "search_path" supabase/` returns
**zero matches**. All 19 `SECURITY DEFINER` declarations lack `SET search_path`.
See §9.7 for the full finding. **Q13's `proconfig_search_path` column confirms whether
Production matches.**

---

## 6. Storage Audit

> **Status: NOT COLLECTED.** Fill from **Q24** (buckets), **Q25** (`storage.objects`
> policies), **Q26** (object counts + path conventions).

📁 *ONLY OBSERVED IN REPOSITORY* — four buckets are referenced in code:

| Bucket | Purpose (inferred) | Written by | Path convention (from code) |
|--------|--------------------|-----------|------------------------------|
| `pack-images` | Vocabulary pack covers | `PacksAdmin.tsx` — **browser, anon key** | `<pack_id>/<filename>` |
| `pack-audio` | TTS word + example mp3 | `api/generate-pack-audio.ts` + Edge Function — **`service_role`** | `<pack_id>/<item_id>_word.mp3`, `…_example.mp3` |
| `blog-images` | Blog post images | `useBlog.ts` — **browser, anon key** | *(see `useBlog.ts:395`)* |
| `exam-images` | Question/passage images | `ExamQuestionsEditor.tsx` — **browser, anon key** | *(see `ExamQuestionsEditor.tsx:55`)* |

**Open questions (Q24/Q25/Q26):**

- ❓ Is each bucket **public or private**? Three are written from the browser with the anon
  key, so their `storage.objects` policies are the only write control.
- ❓ Are there buckets **not referenced by this repository** — e.g. for essay image
  uploads or student submissions belonging to the writing app? **Q24 is the only way to
  find out**, and it directly feeds §7.
- ❓ Are there `file_size_limit` / `allowed_mime_types` constraints? Unbounded
  browser-side upload to a public bucket is a cost and abuse vector.
- ❓ Do any policies allow `anon` INSERT/DELETE?

> **Task 5 specifically asks about writing uploads, essay images, audio, student
> submissions and avatars.** Of these, only `pack-audio` is accounted for.
> 📁 Note: avatars are **not** in Storage at all — `useAvatar.ts` serves static files from
> `public/avatars/*.webp` and stores the chosen id in `localStorage`. Essay images and
> student submissions have **no repository-side storage path whatsoever** — if they
> exist, they belong to the writing app and will surface in Q24.

---

## 7. Existing Writing Application Discovery

> **Status: NOT COLLECTED — and this is the most consequential gap in the audit.**
> Fill from **Q27** (writing-shaped table names), **Q28** (writing-shaped columns),
> **Q29** (tables not referenced by the GSAT repo), plus **Q24** (buckets) and **Q14**
> (functions).

### 7.1 Current knowledge: effectively zero

The writing application **shares this Postgres database but has no presence in this
repository**. Consequently:

> ❓ **INFERRED / NOT YET CONFIRMED.** This audit currently knows **nothing** about the
> writing application's schema. Not one table name, column, function, policy, trigger or
> bucket is confirmed. Any statement to the contrary would be fabrication.

### 7.2 What the GSAT side *does* have (for contrast)

📁 *ONLY OBSERVED IN REPOSITORY:*

| Concept | GSAT-side status |
|---------|------------------|
| Writing prompts | ✅ `essay_questions` table exists (prompt, `essay_type`, `word_count_requirement`, `scoring_criteria`, `sample_essay`, `writing_tips`, `error_type_tags[]`, `topic_tags[]`, `score`) |
| Student essay text | ❌ **No table anywhere** |
| Uploaded essay images | ❌ None (only `prompt_image` on the *question*) |
| AI grading | ❌ Mock only — `Essay.tsx` `setTimeout(2000)` → `MOCK_GRADING_RESPONSE` |
| Rubric scores | 🟡 **Type shape exists** in `src/data/mock-essay.ts`: `overall_score`, `level`, `summary`, `rubric{TaskResponse, Coherence, LexicalResource, Grammar, Creativity}`, `strengths[]`, `weaknesses[]`, `highlights[{start,end,type,severity,note,suggestion}]`, `suggestions{sentence_fixes[], paragraph_comments[], top_advice[]}` — but **never persisted** |
| Teacher feedback | ❌ None |
| Revisions | ❌ None |
| Writing history | ❌ None |

**So the GSAT side has the题目 and the presentation shape, and none of the persistence.**
That is the ideal position for reuse — but only once Q27–Q29 reveal what already exists.

### 7.3 Triage template — complete once Q27/Q28/Q29 return

For **each** discovered writing-related object, answer the four questions Task 6 requires:

| Object | 1. What it appears to do | 2. Can GSAT reuse it? | 3. Missing info before deciding | 4. Would adding a source/activity reference later suffice? |
|--------|--------------------------|-----------------------|----------------------------------|------------------------------------------------------------|
| *(pending Q27/Q28/Q29)* | | | | |

**Concept-coverage checklist to fill in:**

| Concept | Equivalent found in Production? | Object name | Reuse verdict |
|---------|--------------------------------|-------------|---------------|
| writing submissions | ❓ pending | | |
| essay text | ❓ pending | | |
| uploaded essay images | ❓ pending (also **Q24**) | | |
| AI grading | ❓ pending | | |
| rubric scores | ❓ pending | | |
| AI feedback | ❓ pending | | |
| teacher feedback | ❓ pending | | |
| revisions | ❓ pending | | |
| writing prompts | ❓ pending — does it use `essay_questions`, or its own? | | |
| writing history | ❓ pending | | |

**Critical question for Q28:** does the writing app's user column reference the **same
`auth.users`**? Q18 answers this. If yes, integration is mostly additive. If it maintains
a separate identity table, integration is materially harder and Phase 5 grows.

### 7.4 Standing constraint

**No replacement tables are to be created.** Per your guardrails and the Phase 0
principle *prefer reuse over replacement*, the working assumption remains: extend the
writing app's existing schema with **nullable, additive** references (e.g. a
`source`/`activity` reference, `class_id`, `assignment_id`) rather than build a parallel
essay store. ❓ Whether that is sufficient **cannot be judged until Q27–Q29 return.**

---

## 8. GSAT Mock Exam Domain

# ⚠️ RESERVED / DO NOT MODIFY DURING LEARNING PLATFORM DEVELOPMENT

This domain is an **incomplete but reserved** full GSAT mock-examination system. It is
explicitly **out of scope** for the Learning Platform work and must not be refactored,
repurposed, or extended to carry general learning activities.

### 8.1 Objects belonging to this reserved domain

📁 *ONLY OBSERVED IN REPOSITORY:*

**Database objects — RESERVED:**
`exams`, `vocabulary_questions`, `question_groups`, `group_questions`,
`translation_questions`, `essay_questions`, `exam_attempts`, `exam_user_answers`,
`exam_statistics`

**Storage — RESERVED:** `exam-images`

**Routes — RESERVED:** `/exams`, `/exam`, `/exam/result/:attemptId`,
`/exam/explanation/:attemptId`, `/dashboard/result-summary`,
`/admin/exams`, `/admin/exams/:examId/questions`

**Code — RESERVED:** `src/hooks/useExam.ts`, `src/store/examStore.ts`,
`src/types/exam.ts`, `src/data/mock-exam.ts`, `src/data/mock-exam-list.ts`,
`src/pages/Exam*.tsx`, `src/components/exam/**`,
`src/pages/admin/ExamAdmin.tsx`, `src/pages/admin/ExamQuestionsEditor.tsx`

### 8.2 Known state of this domain (from Phase 0)

📁 The admin authoring side writes real Supabase tables. The student-facing side runs
entirely on `MOCK_EXAM_PAPER` + `localStorage`. `useExamAttempt()` and
`useUserExamHistory()` — the only code that touches `exam_attempts` /
`exam_user_answers` — are imported by **no page**.

❓ *INFERRED / NOT YET CONFIRMED:* `exam_attempts` and `exam_user_answers` are therefore
predicted to be **empty**. **Q32 confirms.** This matters because it determines whether
this reserved domain holds real student data that needs protecting today, or none at all.

### 8.3 Boundary rules going forward

1. ❌ Do **not** put general learning activities (daily vocabulary, listening, reading,
   speaking, writing practice) into `exams` / `exam_attempts` / `exam_user_answers`.
2. ✅ Daily learning activity belongs to the future `/learn` domain with its **own**
   tables, per your Domain B definition.
3. ❌ Do **not** refactor `/exam`, `useExam.ts`, `examStore.ts`, or mock exam behaviour.
4. ⚠️ **One exception requiring your decision:** if Q07 shows `exam_attempts` has missing
   or unsafe RLS, that is a *security* fix to a reserved domain. It changes no behaviour
   and creates no tables. It is proposed in §13 as **opt-in only** — it will not be
   actioned without your explicit approval, precisely because this domain is reserved.
5. 🔗 `essay_questions` sits at the **boundary** between Domain A and the future writing
   integration. Treat it as reserved until §7 discovery says otherwise.

---

## 9. Confirmed Security Findings

> ⚠️ **NAMING CAVEAT:** this section is titled "Confirmed" per the required report
> structure, but **no finding here is confirmed in Production.** Every entry is
> 📁 repository-verified with a ❓ Production status pending. Severities are
> **provisional** and assume the repository reflects Production.

Format per Task 9: repository expectation → production reality → impact → affected
objects → recommended remediation.

---

### 9.1 `admin_grant_premium` has no authorization check — **CRITICAL (provisional)**

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 `add_premium_memberships.sql` defines `admin_grant_premium(p_user_id uuid, p_expires_at timestamptz, p_notes text)` as `SECURITY DEFINER`. Its body reads `auth.uid()` **only to record `granted_by`** — it never calls `is_admin()` or any other check. Verified: the function body contains no authorization branch. |
| **Production reality** | ❓ **NOT YET CONFIRMED — Q15** (`body_mentions_is_admin`) and **Q16** (is `EXECUTE` granted to `authenticated`?) |
| **Impact** | If Production matches, **any authenticated user can grant themselves permanent Premium** with a single `supabase.rpc('admin_grant_premium', { p_user_id: <own uid> })`. `premium_memberships` has no INSERT policy, so this function is the only gate — and it has none. Direct revenue loss; paywalled "精華" packs bypassed. |
| **Affected objects** | `public.admin_grant_premium`, `public.premium_memberships`, `public.claim_pack_with_token` (premium branch), `src/pages/admin/UsersAdmin.tsx:140` |
| **Recommended remediation** | `CREATE OR REPLACE` with an `IF NOT is_admin() THEN RETURN json_build_object('success',false,'error','UNAUTHORIZED'); END IF;` guard — **signature unchanged**, so no caller breaks. Then `REVOKE EXECUTE … FROM anon, authenticated` and grant only to `service_role` if the admin UI can route through it. Audit existing rows via **Q33** for self-grants (`granted_by = user_id` or `granted_by IS NULL`). **Phase 0.5B — do not action now.** |

---

### 9.2 `admin_revoke_premium` has no authorization check — **CRITICAL (provisional)**

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 Same file. `admin_revoke_premium(p_membership_id uuid)` is `SECURITY DEFINER` and its body is an unconditional `UPDATE premium_memberships SET is_active = false WHERE id = p_membership_id`. It does not even read `auth.uid()`. |
| **Production reality** | ❓ **NOT YET CONFIRMED — Q15, Q16** |
| **Impact** | If Production matches, **any authenticated user can revoke any other user's Premium** by guessing/enumerating a membership id. Denial of paid service against arbitrary customers. Note `premium_memberships` SELECT is own-row + admin, which limits *discovery* of ids — but the write itself is ungated. |
| **Affected objects** | `public.admin_revoke_premium`, `public.premium_memberships`, `src/pages/admin/UsersAdmin.tsx:158` |
| **Recommended remediation** | Identical pattern to §9.1. **Phase 0.5B.** |

---

### 9.3 `invite_tokens` may be world-enumerable — **HIGH (provisional)**

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 `supabase/schema.sql`: `CREATE POLICY "Anyone can validate tokens" ON invite_tokens FOR SELECT USING (is_active = true);` — no `auth.uid()` restriction, no single-row constraint. |
| **Production reality** | ❓ **NOT YET CONFIRMED — Q07** (does the policy exist?) **plus Q10** (do `anon`/`authenticated` hold SELECT?). **Both are required** — the policy is inert without the grant. |
| **Impact** | If both hold, anyone with the public anon key — including logged-out visitors — can `SELECT *` every active invite token, including codes for premium packs. Complete bypass of the invite-distribution model. |
| **Affected objects** | `public.invite_tokens`, `src/pages/ClaimPack.tsx`, `src/pages/admin/TokensAdmin.tsx` |
| **Recommended remediation** | Drop the blanket-read policy; keep an owner-scoped SELECT for `TokensAdmin`. Token validation already runs through the `SECURITY DEFINER` `claim_pack_with_token`, so no client needs blanket read. ⚠️ Verify in Q07/Q10 that no other application (**the writing app shares this DB**) depends on it. **Phase 0.5B.** |

---

### 9.4 `site_settings` write access unknown — **HIGH (provisional)**

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 **No DDL exists for this table** — only `ALTER TABLE` statements in `add_current_phase_to_site_settings.sql`. Its RLS is entirely unknown. `src/hooks/useSiteSettings.ts` performs a direct client-side `UPDATE site_settings SET current_phase = …` with the anon key. |
| **Production reality** | ❓ **NOT YET CONFIRMED — Q07 + Q10 + Q08** (is RLS even enabled?) |
| **Impact** | If UPDATE is not admin-restricted, **any authenticated user can change the site's `current_phase` globally**, unlocking every `PhaseGate`-protected feature (exams, dashboard, essay) for **all users** — or setting phase to 0 and disabling the product for everyone. It also controls `navigation_tabs` for the whole site. This is global-configuration tampering. |
| **Affected objects** | `public.site_settings`, `src/contexts/PhaseContext.tsx`, `src/hooks/useSiteSettings.ts`, `src/pages/admin/SiteSettings.tsx`, every `PhaseGate` route |
| **Recommended remediation** | Confirm first. If unrestricted: keep public SELECT (`PhaseContext` needs it pre-auth) and restrict INSERT/UPDATE/DELETE to `is_admin()`. **Phase 0.5B.** |

---

### 9.5 `claim_pack_with_token` — conflicting definitions, live version unknown — **HIGH (provisional)**

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 Two different bodies share the signature `(text, text)`; a third 1-arg overload also exists. Full analysis in §5.1. |
| **Production reality** | ❓ **NOT YET CONFIRMED — Q15** (which body is live, and are both arities present?) and **Q30** (does an authoritative migration order exist?) |
| **Impact** | Exactly one of two defects is live: **(a)** premium paywall silently absent on pack claiming, or **(b)** `site` never written, breaking multi-site claims and the `UNIQUE(user_id, pack_id, site)` semantics. Additionally, if both arities exist, a future 1-arg call raises `function is not unique`. |
| **Affected objects** | `public.claim_pack_with_token` (both arities), `public.user_pack_claims`, `public.premium_memberships`, `src/pages/ClaimPack.tsx:64` |
| **Recommended remediation** | Determine live version via Q15, then `CREATE OR REPLACE` a single reconciled 2-arg body containing **both** the premium check and the site logic; consider dropping the 1-arg overload **only after** confirming the writing app does not call it. **Phase 0.5B.** |

---

### 9.6 Three divergent admin authorization systems — **HIGH (provisional)**

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 Three independent mechanisms: **(1)** `app_admins` table — queried by `src/hooks/useAdmin.ts:78`, **no DDL in repo**; **(2)** `is_admin()` — hard-coded `email = 'nonstopjazz@gmail.com'`; **(3)** inline hard-coded email in three `level_words` RLS policies. |
| **Production reality** | ❓ **NOT YET CONFIRMED — Q21** (does `app_admins` exist?), **Q15** (`is_admin` body), **Q07** (`level_words` policies) |
| **Impact** | These are **genuinely different authorization systems**, and Task 7F asks precisely this. Adding a user to `app_admins` unlocks only the frontend UI — it grants **no** SQL-layer authority. Conversely the hard-coded email holds full SQL authority regardless of `app_admins`. Consequences: (a) no real second administrator can exist; (b) if `app_admins` does not exist in Production, `useAdmin` fails closed and **all** admin UI is inaccessible except by that email; (c) single point of failure tied to one personal Google account; (d) an operator who "removes" an admin from `app_admins` has not actually revoked anything. |
| **Affected objects** | `public.app_admins`, `public.is_admin`, `public.level_words` policies, `public.admin_get_all_users`, `public.admin_get_user_stats`, `premium_memberships` admin policy, `src/hooks/useAdmin.ts`, `src/components/auth/RequireAdmin.tsx` |
| **Recommended remediation** | Phase 1 C3–C7: single `user_roles` source; `CREATE OR REPLACE FUNCTION is_admin()` reading it with **signature unchanged** so all 8 call sites and RLS policies inherit it for free; migrate `app_admins` rows in; replace inline email policies with `is_admin()`. **Design in Phase 1, after 0.5B.** |

---

### 9.7 🆕 All `SECURITY DEFINER` functions lack `SET search_path` — **HIGH (provisional)**

**This finding is new in Phase 0.5A and does not appear in `PLATFORM_AUDIT.md`.**

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 **Verified:** `grep -rn "search_path" supabase/` returns **zero matches** across all migrations and `schema.sql`. Meanwhile 19 `SECURITY DEFINER` declarations exist across 8 files (`add_premium_memberships.sql` ×5, `create_user_profiles_table.sql` ×5, `create_user_stats_table.sql` ×2, `create_user_word_progress_table.sql` ×2, `unify_word_progress_tracking.sql` ×2, `add_site_to_user_pack_claims.sql` ×1, `update_claim_pack_function.sql` ×1, `schema.sql` ×1). |
| **Production reality** | ❓ **NOT YET CONFIRMED — Q13** `proconfig_search_path` column (`(none)` = unhardened). |
| **Impact** | A `SECURITY DEFINER` function executes with the **owner's** privileges (typically `postgres`). With a mutable `search_path`, unqualified references inside the body (`user_pack_claims`, `packs`, `auth.users`, and operators) resolve against the **caller's** `search_path`. A user who can create objects in a schema that precedes the intended one can shadow a table or operator and have it executed with owner privileges. This is the classic `SECURITY DEFINER` escalation pattern, and Supabase's own linter flags it as `function_search_path_mutable`. Exploitability depends on whether `authenticated` can create objects in any schema on the `search_path` — ❓ **Q12** and the `public` schema `CREATE` grant determine this, so severity may drop to MEDIUM once confirmed. |
| **Affected objects** | All 19 `SECURITY DEFINER` functions, notably `is_admin`, `admin_grant_premium`, `admin_revoke_premium`, `claim_pack_with_token`, `upsert_user_profile`, `upsert_word_progress` |
| **Recommended remediation** | Append `SET search_path = public, pg_temp` to each `SECURITY DEFINER` function via `CREATE OR REPLACE` (or `ALTER FUNCTION … SET search_path`). **Signatures unchanged; behaviour unchanged; zero callers affected** — this is one of the cheapest high-value hardening steps available. Also verify `REVOKE CREATE ON SCHEMA public FROM PUBLIC`. **Phase 0.5B.** |

---

### 9.8 TTS endpoints execute with `service_role` and no authentication — **CRITICAL (repository-confirmed)**

**Task 8. This is repository-side configuration and required no Production access — the
repository *is* authoritative for deployed application code.**

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 **Verified in full.** Two independent implementations of the same feature: <br>**(a)** `api/generate-pack-audio.ts` (Vercel Function) — reads `SUPABASE_SERVICE_ROLE_KEY`, creates a service-role client, and the handler's only gate is `if (req.method !== 'POST')`. **No JWT check, no session check, no admin check, no shared secret.** <br>**(b)** `supabase/functions/generate-pack-audio/index.ts` (Edge Function) — same logic, `service_role` client, `Access-Control-Allow-Origin: *`, and **no authorization check whatsoever**. There is **no `supabase/config.toml`**, so its deployed `verify_jwt` setting is unknown. ⚠️ Even if `verify_jwt = true`, that only requires *some* valid JWT — **any logged-in user still passes**, because the function performs no admin check of its own. |
| **Production reality** | ❓ Deployment state NOT CONFIRMED (is the Vercel route live? is the Edge Function deployed? what is its `verify_jwt`?). The **code** is confirmed. |
| **Impact** | An unauthenticated `POST {pack_id, force: true}` can: (1) burn unbounded **Google Cloud TTS** quota — a direct, uncapped billing attack, amplified by `force: true` which re-synthesises every item and by the Vercel version's 5-way concurrency; (2) overwrite arbitrary objects in the `pack-audio` bucket (`upsert: true`); (3) issue `service_role` `UPDATE`s against `pack_items`, **bypassing RLS entirely**. |
| **Affected objects** | `api/generate-pack-audio.ts`, `supabase/functions/generate-pack-audio/index.ts`, `pack-audio` bucket, `public.pack_items`, Google Cloud TTS billing |
| **Recommended remediation** | Require a caller JWT, resolve it to a user, and assert `is_admin()` before any work. Add per-pack rate limiting and drop the wildcard CORS on the Edge Function. Then **delete one of the two implementations** — maintaining two divergent copies of a privileged endpoint is itself a risk. **Phase 0.5B.** |

---

### 9.9 Daily-reminder cron endpoint is unauthenticated when `CRON_SECRET` is unset — **HIGH (repository-confirmed)**

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 **Verified.** `api/send-daily-reminders.ts`: <br>`const cronSecret = process.env.CRON_SECRET;`<br>`if (cronSecret && req.headers['authorization'] !== \`Bearer ${cronSecret}\`) { return 401 }`<br>The guard is conditional on the secret existing. **If `CRON_SECRET` is unset, verification is skipped entirely** and the endpoint is fully open. It also accepts **both `GET` and `POST`**, so a plain browser request triggers it. The handler then uses `SUPABASE_SERVICE_ROLE_KEY`. |
| **Production reality** | ❓ Is `CRON_SECRET` actually set in the Vercel project? **NOT CONFIRMED** — cannot read Vercel env from here. |
| **Impact** | If unset: anyone can repeatedly trigger a **push notification broadcast to every subscribed user**, at will. Notification spam, user churn, and possible push-provider throttling. The handler also reads `push_subscriptions` and `user_stats` with `service_role`, bypassing RLS, and deletes subscription rows on 410/404. |
| **Affected objects** | `api/send-daily-reminders.ts`, `vercel.json` cron (`0 12 * * *`), `public.push_subscriptions`, `public.user_stats` |
| **Recommended remediation** | Fail closed: `if (!cronSecret \|\| req.headers.authorization !== …) return 401`. Restrict to Vercel's cron invocation. Verify `CRON_SECRET` is set in Production. **Phase 0.5B.** |

---

### 9.10 Unprotected result-summary route — **MEDIUM (repository-confirmed)**

📁 `src/App.tsx` registers `/dashboard/result-summary` with **no** `ProtectedRoute`,
`RequireAdmin`, or `PhaseGate` — the only internal page with no gate. Today it renders
inline mock data, so present impact is low. It becomes a data-leak the moment it is
connected to real results. **Remediation:** wrap in `ProtectedRoute` + `PhaseGate(2)`.
Note: this route is in the **reserved** Domain A (§8), so treat as opt-in.

---

### 9.11 Invite tokens generated with `Math.random()` — **MEDIUM (repository-confirmed)**

📁 `src/pages/admin/TokensAdmin.tsx:91` builds tokens with `Math.random()`, which is not
cryptographically secure and is predictable given enough samples. The SQL helper
`generate_short_token()` exists but is unused — and its parameter is named `length`,
shadowing the built-in `length()` it calls internally (❓ whether that actually errors is
unconfirmed; **Q14** shows the live body). Combined with §9.3, predictable *and*
enumerable tokens compound. **Remediation:** use `crypto.getRandomValues()`, or a
server-side generator with a fixed `search_path`.

---

### 9.12 Dev-mode panel reachable in Production — **LOW (repository-confirmed)**

📁 `src/components/dev/DevPhaseSwitcher.tsx` documents itself as *"completely removed in
production builds"*, but `isDevModeEnabled()` explicitly supports `?devmode=true`, which
persists `dev_mode_enabled` to `localStorage`. Impact is limited — it only simulates phase
visually and does not alter routing or server authorization. **Remediation:** guard on
`import.meta.env.DEV` alone.

---

### 9.13 Nine legacy admin routes gated only by `!IS_PRODUCTION` — **LOW / INFORMATIONAL**

📁 `src/App.tsx` renders 9 legacy `/admin/*` routes without `RequireAdmin`, relying solely
on the build-time `IS_PRODUCTION` flag. Correct in production builds; a hazard in any
preview/staging deploy built with `build:dev`. **Remediation:** wrap in `RequireAdmin`
regardless of build mode.

---

### 9.14 `.gitignore` omits `.env` — **INFORMATIONAL (downgraded)**

📁 `.gitignore` covers `*.local` but not `.env`. **However, verification confirms no
`.env` has ever been committed** (§0.2) and no secret appears anywhere in history. Purely
preventative. **Remediation:** add `.env` and `.env*.local`.

---

### 9.15 Findings summary

| # | Finding | Provisional severity | Evidence basis | Confirming query |
|---|---------|---------------------|----------------|------------------|
| 9.1 | `admin_grant_premium` unauthenticated | **CRITICAL** | 📁 repo | Q15, Q16 |
| 9.2 | `admin_revoke_premium` unauthenticated | **CRITICAL** | 📁 repo | Q15, Q16 |
| 9.8 | TTS endpoints: `service_role`, no auth | **CRITICAL** | 📁 repo (confirmed) | deployment check |
| 9.3 | `invite_tokens` enumerable | **HIGH** | 📁 repo | Q07 + Q10 |
| 9.4 | `site_settings` global config writable | **HIGH** | ❓ unknown DDL | Q07 + Q10 + Q08 |
| 9.5 | `claim_pack_with_token` ambiguous | **HIGH** | 📁 repo conflict | Q15, Q30 |
| 9.6 | Three admin authorization systems | **HIGH** | 📁 repo | Q21, Q15, Q07 |
| 9.7 | 🆕 No `SET search_path` on 19 DEFINER fns | **HIGH** | 📁 repo (confirmed) | Q13, Q12 |
| 9.9 | Cron endpoint open if secret unset | **HIGH** | 📁 repo (confirmed) | Vercel env check |
| 9.10 | Unprotected result-summary route | MEDIUM | 📁 repo (confirmed) | — |
| 9.11 | `Math.random()` tokens | MEDIUM | 📁 repo (confirmed) | Q14 |
| 9.12 | Dev panel in Production | LOW | 📁 repo (confirmed) | — |
| 9.13 | Legacy admin routes | LOW | 📁 repo (confirmed) | — |
| 9.14 | `.gitignore` omits `.env` | INFORMATIONAL | 📁 repo (confirmed) | — |

**Three CRITICAL and six HIGH findings are outstanding.** Six are fully confirmed from the
repository; the rest await Production confirmation.

---

## 10. Repository vs Production Discrepancies

> **Status: NOT COMPARABLE — no Production side to compare against.**

The comparison table below lists **every discrepancy the discovery output must be checked
for.** It is the primary work item when Q01–Q31 output arrives.

| # | Repository state | Discrepancy to test | Query |
|---|------------------|---------------------|-------|
| 1 | 20 tables referenced in code with **no DDL** | Do they exist? Same columns? RLS? | Q01, Q02, Q07 |
| 2 | 3 RPCs called with **no DDL** (`update_pack_item_progress`, `get_pack_statistics`, `get_weak_words`) | Do they exist? What do they do? Are they `SECURITY DEFINER`? | Q14, Q13 |
| 3 | `claim_pack_with_token`: 2 conflicting bodies + 2 arities | Which is live? Both arities present? | **Q15**, Q30 |
| 4 | `app_admins` queried but no DDL | Does it exist at all? | **Q21** |
| 5 | Migration files have **no timestamps** | Did CLI migration tracking ever exist? | **Q30** |
| 6 | Zero `SET search_path` in repo | Does Production match, or was it hardened out-of-band? | **Q13** |
| 7 | `unify_word_progress_tracking.sql` creates a `COALESCE` UNIQUE **INDEX** | Does it exist? (constraints view will miss it) | **Q04** |
| 8 | `exam_statistics`, `blog_post_stats` assumed views | Views, matviews, or tables? | Q05 |
| 9 | No `auth.users` trigger anywhere | Does one exist in Production? | **Q17** |
| 10 | 4 storage buckets referenced | Do more exist (writing/essay/submissions)? Public? | **Q24**, Q25 |
| 11 | Writing app entirely absent from repo | What does it actually own? | **Q27, Q28, Q29** |
| 12 | No teacher/class/parent/role concepts | Has the writing app already added any? | **Q19, Q20** |
| 13 | Phase 0 predicts `exam_attempts` is empty | Confirm | Q32 |
| 14 | RLS policy texts for 10 tables | Do Production policies match the repo verbatim? | **Q07** |
| 15 | Grants never specified anywhere in repo | What do `anon`/`authenticated` actually hold? | **Q10** |

> ⚠️ **Item 15 deserves emphasis:** the repository contains **no `GRANT` statement at
> all**. Every table's real exposure to `anon` therefore depends on Supabase defaults and
> out-of-band Dashboard changes that are **completely invisible from this repository**.
> Q10 is not optional.

---

## 11. Objects Safe to Reuse

> **Status: PROVISIONAL — cannot be finalised without Production confirmation.**

Phase 0 identified reusable assets. Re-classified here by **confirmation risk**:

### 11.1 Safe to reuse now — frontend only, no Production dependency

📁 These live entirely in the repository, so repository evidence is sufficient:

| Asset | Reuse for |
|-------|-----------|
| `src/components/ui/*` (48 shadcn components) | All three role dashboards |
| `AuthContext`, `ProtectedRoute`, `useAuthAction`, `Login.tsx` | Shared login across roles |
| `RequireAdmin` pattern | Template for `RequireRole` |
| `PhaseGate` / `LockedPage` / `features.ts` | Gradual rollout of `/learn` |
| `useSiteIdentifier`, `config/product.ts` | Per-site role enablement |
| `useAudioPlayer` | Listening activities |
| `chart.js` + `react-chartjs-2` integration | Dashboard charts |
| `BatchUploadDialog.tsx` + `generate-exam-template.ts` | Class roster / student import |
| `usePushSubscription` + `sw.js` | Assignment-due reminders |
| `BlockNoteEditor.tsx` | Teacher feedback authoring |

### 11.2 Conditionally reusable — pending Production confirmation

| Asset | Condition | Query |
|-------|-----------|-------|
| `level_words` (~2.1 MB corpus) | Exists with expected shape | Q01, Q02 |
| `user_word_progress` (vocabulary analytics fact source) | Schema + RLS confirmed | Q01, Q07 |
| `invite_tokens` **pattern** (issue → claim → bind) — ideal model for **class invite codes** | Reuse the *pattern* in a new table; do **not** overload the existing one | Q07 |
| `premium_memberships` **pattern** (grant/expiry/revoke/notes) | Template for teacher licensing | — |
| `site_settings` (per-site JSONB + phase) | RLS confirmed safe first (§9.4) | Q07, Q10 |
| `packs` / `pack_items` / `user_pack_claims` | Confirmed | Q01–Q03 |

### 11.3 Reserved — do NOT reuse for the Learning Platform

Per §8: `exams`, `vocabulary_questions`, `question_groups`, `group_questions`,
`translation_questions`, `essay_questions`, `exam_attempts`, `exam_user_answers`,
`exam_statistics`, `exam-images`. Daily learning activity gets its own `/learn` tables.

### 11.4 Cannot be assessed at all

**Everything belonging to the writing application.** Zero information (§7).

---

## 12. Objects Requiring Further Investigation

| Priority | Object | Unknown | Blocks |
|----------|--------|---------|--------|
| 🔴 P0 | **Writing app schema (all objects)** | Everything | Phase 5; Phase 1 table naming |
| 🔴 P0 | `claim_pack_with_token` | Which body is live | §9.5 remediation |
| 🔴 P0 | `admin_grant_premium` / `admin_revoke_premium` | Live authorization state | §9.1/§9.2 |
| 🔴 P0 | Grants to `anon` / `authenticated` (all tables) | Never specified in repo | Entire RLS assessment |
| 🔴 P0 | `site_settings` RLS | No DDL exists | §9.4 |
| 🟠 P1 | `app_admins` | Existence, shape, RLS | §9.6; Phase 1 role design |
| 🟠 P1 | `exam_attempts` / `exam_user_answers` RLS | No DDL | §8.3 rule 4 |
| 🟠 P1 | `update_pack_item_progress`, `get_pack_statistics`, `get_weak_words` | Bodies unknown | SRS unification (Phase 3) |
| 🟠 P1 | Storage bucket public flags + policies | Unknown | §9 completeness; writing uploads |
| 🟠 P1 | `auth.users` triggers | Existence | Phase 1 C1 |
| 🟠 P1 | Role/class/teacher tables from writing app | Existence | Phase 1 — duplicate-design risk |
| 🟡 P2 | `exam_statistics`, `blog_post_stats` | View or table | Analytics design |
| 🟡 P2 | Blog tables RLS | No DDL | Ongoing exposure |
| 🟡 P2 | `CRON_SECRET` in Vercel | Set or not | §9.9 |
| 🟡 P2 | Edge Function `verify_jwt` + deployment | Unknown | §9.8 |
| 🟡 P2 | Actual row counts | Unknown | Dead-table confirmation |

---

## 13. Phase 0.5B — Security Stabilization Proposal

> **PROPOSED ONLY — NOT EXECUTED.** No item below has been actioned.
> **Every item is gated on Phase 0.5A discovery output first.**

### 13.1 Sequencing

```
Phase 0.5A (this)  →  run discovery  →  complete this document
                              ↓
                      Phase 0.5B  (security stabilization)
                              ↓
                      Phase 1    (identity & roles)
```

**Phase 0.5B must not start before the discovery output is analysed**, because three of
its items (B3, B4, B5) depend on facts only Production can supply.

### 13.2 Proposed work items

| # | Item | Finding | Type | Gate | Risk |
|---|------|---------|------|------|------|
| **B1** | Add `is_admin()` guard to `admin_grant_premium` | §9.1 | `CREATE OR REPLACE`, signature unchanged | Q15 confirms | 🟢 None — no caller breaks |
| **B2** | Add `is_admin()` guard to `admin_revoke_premium` | §9.2 | same | Q15 confirms | 🟢 None |
| **B3** | Add admin JWT verification to both TTS endpoints | §9.8 | App code | none — confirmed | 🟡 Anonymous callers blocked (intended) |
| **B4** | Fail-closed `CRON_SECRET`; reject GET | §9.9 | App code | verify env set first | 🟡 Cron breaks if secret unset — **set it first** |
| **B5** | `SET search_path = public, pg_temp` on all 19 DEFINER functions | §9.7 | `ALTER FUNCTION` | Q13 confirms | 🟢 None — behaviour identical |
| **B6** | Restrict `invite_tokens` SELECT to owner | §9.3 | Policy replace | Q07+Q10; **confirm writing app unaffected** | 🟠 Could break an unknown consumer |
| **B7** | Restrict `site_settings` writes to `is_admin()` | §9.4 | Policy add | Q07+Q10 | 🟠 Could break admin UI if it relies on anon write |
| **B8** | Reconcile `claim_pack_with_token` into one body | §9.5 | `CREATE OR REPLACE` | **Q15 mandatory** | 🟠 Behaviour change — restores whichever guarantee is currently missing |
| **B9** | Audit `premium_memberships` for self-grants | §9.1 | Read-only query (Q33) | — | 🟢 None |
| **B10** | `crypto.getRandomValues()` for tokens | §9.11 | App code | — | 🟢 None |
| **B11** | Add `.env` to `.gitignore` | §9.14 | Config | — | 🟢 None |
| **B12** | Gate dev panel on `import.meta.env.DEV` only | §9.12 | App code | — | 🟢 None |
| **B13** | *(opt-in)* Wrap `/dashboard/result-summary`; wrap 9 legacy admin routes | §9.10, §9.13 | App code | ⚠️ **Touches reserved Domain A — needs your approval** | 🟢 None |
| **B14** | *(opt-in)* Add RLS to `exam_attempts` / `exam_user_answers` if missing | §8.3 r4 | Policy add | Q07; ⚠️ **reserved domain — needs approval** | 🟢 None if tables empty (Q32) |

### 13.3 Suggested order

1. **B11, B12, B10, B9** — zero-risk, no gate.
2. **B5** — highest value-to-risk ratio in the entire list; behaviour-identical hardening.
3. **B1, B2** — CRITICAL; needs only Q15.
4. **B3, B4** — CRITICAL/HIGH; app-code only, already confirmed. Set `CRON_SECRET` before B4.
5. **B8** — needs Q15 and a deliberate decision on which guarantee to restore.
6. **B6, B7** — needs Q07+Q10 **and** confirmation the writing app is unaffected.
7. **B13, B14** — only with your explicit approval (reserved domain).

### 13.4 Phase 0.5B guardrails

- No new tables. No new columns. No data migration.
- No `DROP` except the possible redundant `claim_pack_with_token` overload — **only** after
  confirming no cross-application caller.
- **No function signature changes** — that is what keeps every existing caller and RLS
  policy working.
- Every change verified in a staging project first. ⚠️ **No staging project currently
  exists** — creating one should be part of 0.5B.
- No `/exam` refactor. No mock exam behaviour change. No Teacher/Student/Parent UI.

---

## 14. Phase 1 Readiness Assessment

### Q1 — Is the Production schema sufficiently understood to design Teacher / Student / Parent / Class?

# ❌ NO

**Reasons:**
1. **No Production object has been inspected.** The entire model is repository inference.
2. **20 of ~30 tables have no DDL** in the repository — columns, constraints and RLS unknown.
3. **The grant layer is completely unknown.** No `GRANT` appears anywhere in the repo, so
   real exposure to `anon`/`authenticated` is unmeasured (Q10).
4. **`app_admins` may not exist.** Phase 1 plans to migrate it into `user_roles` — you
   cannot migrate a table you cannot confirm.
5. 🔴 **Duplicate-design risk:** the writing app shares this database and **may already
   have introduced role/class/teacher structures**. Designing `user_roles` before running
   Q19/Q20 risks building a second, conflicting role system — the exact opposite of
   *prefer reuse over replacement*.

### Q2 — Is the Writing schema sufficiently understood to design integration?

# ❌ NO — ZERO INFORMATION

Not one writing-app table, column, function, policy, trigger or bucket is known.
§7 is an empty template. Any Phase 5 design today would be pure fabrication.

### Q3 — Are there unresolved blockers?

# ✅ YES — SIX

| # | Blocker | Clears when |
|---|---------|-------------|
| **BL-1** | **No Production access** (§0) | Connection string or Dashboard output supplied |
| **BL-2** | Writing app schema entirely unknown (§7) | Q27, Q28, Q29 |
| **BL-3** | Three CRITICAL security findings unremediated (§9.1, §9.2, §9.8) | Phase 0.5B |
| **BL-4** | `claim_pack_with_token` live version unknown (§9.5) | Q15 |
| **BL-5** | Grant + RLS layer unmeasured (§4, §10 item 15) | Q07 + Q10 |
| **BL-6** | **No staging environment exists** | Created in Phase 0.5B |

**BL-1 is the root blocker — clearing it unblocks BL-2, BL-4 and BL-5 immediately.**

### Q4 — Is it safe to begin Phase 1?

# ❌ NO — DO NOT BEGIN PHASE 1

**Rationale:**

1. **Correctness** — Phase 1's central move is rewriting `is_admin()` to read `user_roles`.
   Doing that against an unverified schema, unverified grants, and an unconfirmed
   `app_admins` risks locking every administrator out of a live system.
2. **Security ordering** — introducing a role system on top of three unremediated CRITICAL
   findings means building authorization on a foundation that currently lets any
   authenticated user grant themselves Premium.
3. **Shared-database blast radius** — this database serves another production application.
   Schema work without a Production inventory can break an app we cannot even see.
4. **Reuse principle** — you asked to prefer reuse over replacement. Honouring that
   *requires* knowing what exists. Right now we do not.

**The path to readiness is short and well-defined:**

```
1. Supply Production access            ← unblocks everything (one connection string)
2. Run docs/discovery/production_discovery.sql   (validated; ~5 min)
3. Complete this document from the output        (fills §2–§7, §10)
4. Execute Phase 0.5B security stabilization     (§13)
5. Create a staging project
6. → Phase 1 becomes safe to begin
```

Steps 1–3 are likely a single working session. **Do not skip step 4.**

---

## Appendix A — Deliverables

| File | Purpose | Status |
|------|---------|--------|
| `docs/PRODUCTION_SCHEMA_AUDIT.md` | This report | ✅ Created (template pending Production data) |
| `docs/discovery/production_discovery.sql` | 31-query read-only discovery script | ✅ Created, **validated against local PostgreSQL 16.13, zero errors** |
| `docs/discovery/README.md` | Runbook: how to run and return output | ✅ Created |
| `docs/PLATFORM_AUDIT.md` | Phase 0 repository audit | Unchanged |

## Appendix B — Guardrail Compliance

| Guardrail | Status |
|-----------|--------|
| DO NOT modify application code | ✅ Zero source files touched |
| DO NOT modify Supabase schema | ✅ No connection was ever made |
| DO NOT create migrations | ✅ `supabase/migrations/` untouched; the SQL script lives in `docs/discovery/` and contains only `SELECT`s |
| DO NOT apply migrations | ✅ None applied |
| DO NOT alter RLS / functions / triggers / storage policies | ✅ None altered |
| DO NOT create or delete tables | ✅ None (the local fixture was a throwaway container-local Postgres, since destroyed) |
| DO NOT change production data | ✅ No Production connection was made |
| DO NOT refactor `/exam` / modify mock exam behaviour | ✅ Untouched; formally reserved in §8 |
| DO NOT build Teacher / Student / Parent UI | ✅ None built |
| DO NOT create Learning Activity tables | ✅ None |
| DO NOT create Writing tables | ✅ None |
| READ-ONLY discovery only | ✅ Enforced |
| SQL not placed in migration directory | ✅ `docs/discovery/` |
| Only documentation files added/modified | ✅ 3 files, all under `docs/` |
