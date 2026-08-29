# Session Handoff — GSAT Learning Platform

> **Purpose:** allow a fresh Claude Code session, with **no access to the prior conversation**, to
> continue this project safely.
>
> **Written:** 2026-08-23 · **Branch:** `claude/gsat-platform-audit-wiz5rt` · **HEAD:** `02246a5`
>
> 🛑 **READ §2 (Reserved boundaries) AND §18 (DO NOT DO) BEFORE TOUCHING ANYTHING.**

---

## 0. Thirty-second orientation

- The project is at the **end of Phase 0.5B-A1 preparation**. Nothing is deployed.
- 🔒 **A1 scope was FROZEN on 2026-08-25** — nine items + one separate data remediation. Scope of
  record: `docs/PHASE_0_5B_A1_PLAN.md` §0. **No additions without a new owner decision** (§13.2).
- ✅ **Staging is BUILT and S1–S5 all PASS** (2026-08-26). Results:
  `docs/phase-0.5b/STAGING_RESULTS.md`. The hard gate is satisfied.
- ✅ **G4 PASSED** (2026-08-25) and ✅ **G5 PASSED** (2026-08-26). **No deployment gate is open.**
  What remains is an owner decision on Production deployment, which is still unapproved.
- ✅ **A1 IS DEPLOYED TO PRODUCTION (2026-08-26) and verified.** SQL first, then PR #108 merged as
  `5c910c4`. Record: `docs/PHASE_0_5B_A1_PLAN.md` §12. Four CRITICAL/HIGH findings closed.
- ✅ **PHASE 0.5B-A1 IS CLOSED (2026-08-27).** Scheduled cron confirmed on two consecutive days;
  Phase C remediation done with the user's entitlement unchanged.
- **Mainline is now GSAT product development.** Remaining findings live in `docs/BACKLOG.md`,
  which also carries the rule for when a new finding may interrupt product work. 🛑 **Two CRITICAL
  findings (9.1, 9.2) remain open there** — do not treat A1's closure as "the platform is secure".
- ✅ **THE `/learn` IDENTITY SPINE IS LIVE ON PRODUCTION (2026-08-28) and the identity checkpoint is
  CLOSED.** `learn` schema + three tables + 10 policies + two additive `user_profiles` policies.
  Verified 26/26 on Production with a per-user census showing zero visibility change across all 22
  accounts. 🛑 `learn` is **not** in Exposed schemas — `learn.*` is unreachable from the browser
  until that step is deliberately taken. Records: `docs/learn/IDENTITY_SPINE_PRODUCTION_PLAN.md` §8.
- 🔎 **Vocabulary architecture audited (2026-08-29):** `docs/learn/VOCABULARY_ARCHITECTURE.md`.
  Key finding: **`level_words` is already the canonical word table** and Level 1–6 progress is
  already keyed on it — the duplication is entirely on the pack side, where `pack_items.word` is free
  text with no canonical link and every progress key contains `pack_id`. Target model promotes
  `level_words` rather than adding a second vocabulary system. ✅ **Vocabulary v1 architecture was
  frozen on 2026-08-29** (§1.2): headword identity with no sense ontology, one Collection concept,
  mastery on `learner × canonical_word` (`Recognition` / `Production`), one SRS due date per word,
  and safe normalization only. 🛑 **Design only — no migration proposed or approved**, and legacy
  Level 1–6 progress stays untouched. 🔍 One finding must be **verified at runtime before any
  vocabulary migration** (§3.6).
- 📘 **The `/learn` product & competency model is specified (2026-08-29):**
  `docs/learn/LEARNING_DOMAIN_MODEL.md` — Program→Module→Lesson→Activity, Content Assets outside the
  hierarchy, Relationship/Enrollment/Assignment kept separate, and the Domain→Category→Skill→
  Micro-skill competency axis. **Grammar is decided to Skill level — 10 categories, 51 coded skills,
  plus 234 PROVISIONAL Micro-skill candidates; Reading and Listening decided to Skill level with no
  Micro-skill
  — with `docs/learn/grammar-taxonomy/Grammar_Skill_Taxonomy_v1.xlsx` as its detailed source of
  truth; every other taxonomy is PROVISIONAL or BLOCKED — do not complete them.** Design spec only:
  no table, no migration, no seed data. An owner ruling on 2026-08-29 closed four open items
  (direct teacher–student relationship, vocabulary dimensions, tag precedence, asset versioning) and
  settled naming; a Grammar Micro-skill blocker was then withdrawn as a bad export rather than a
  missing decision; **Reading Taxonomy v1 (6 Categories + 25 Skills) and Listening Taxonomy v1
  (4 Categories + 18 Skills) are both frozen as DECIDED v1**, neither with Micro-skills, with exactly
  one Primary Skill per item and Skill codes treated as opaque identifiers that must never be
  parsed. 🛑 **Five blocked decisions remain** in its §15; ✅ none of them blocks the next design
  stage. ⚠️ The deployed spine still cannot
  represent a direct teacher–student relationship, which is now a decided requirement awaiting its
  own deployment.
- 🧭 **The identity model for all new `/learn` work is decided (2026-08-27):**
  `docs/IDENTITY_ARCHITECTURE_CHECKPOINT.md`. Canonical root is **`auth.users.id`**; `user_profiles`
  is reused; roles are **relationship-scoped** (no global role table); `public.users` is
  **quarantined**. Design only — **no migration**. 🛑 **Two owner decisions (D1 namespace, D2 roster
  visibility) are unanswered and block the first `/learn` table.**
- **No application source code has been modified on this branch.** All code changes exist as
  **unapplied patch files** under `docs/phase-0.5b/patches/`. `api/`, `src/`, `supabase/`,
  `.gitignore` and `.env.example` are byte-identical to `main`.
- **The single blocking prerequisite is a staging environment, which does not exist yet.**
- The database is **shared with another live application** (LMS/Writing). That fact drives most of
  the caution in this document.

---

## 1. Project goal and architecture

### 1.1 Goal

An existing GSAT (Taiwanese university entrance exam) English learning site is being extended into a
**Teacher / Student / Parent learning platform**: classes, assignments, completion tracking,
per-skill analytics (vocabulary, listening, reading, speaking, writing), writing submission with AI
feedback and optional teacher feedback, and three dashboards.

**Guiding principle throughout: prefer reuse over replacement; preserve backward compatibility.**

### 1.2 Architecture (current)

Pure frontend SPA + Supabase BaaS. **There is no self-hosted application server.**

```
Browser (React 18 SPA, Vite 5)
  ├── react-router-dom v6      all routes declared in src/App.tsx, no code splitting
  ├── zustand + persist        src/store/vocabularyStore.ts, src/store/examStore.ts
  ├── shadcn/ui + Radix + Tailwind
  └── @supabase/supabase-js    anon key, talks straight to PostgREST
        │                                   │
        │ PostgREST / RPC (RLS-gated)       │ /api/*  Vercel Functions (service_role)
        ▼                                   ▼
   Supabase: Postgres + RLS, Auth      api/generate-pack-audio.ts   (Google TTS)
   Storage × 8 buckets                 api/send-daily-reminders.ts  (Vercel Cron, web-push)
```

- **Deploy:** Vercel. `vercel.json` declares one cron: `/api/send-daily-reminders` at `0 12 * * *`
  UTC (20:00 Asia/Taipei).
- **⚠️ The repo is connected to Vercel** — committing changes under `api/` is one step from a
  deployment. This is why code changes are held as patches.
- TypeScript is `strict: false`, `strictNullChecks: false`. There are **no tests**.
- `@tanstack/react-query` is installed and its Provider is mounted but **never used**.

### 1.3 Domain separation (owner's explicit instruction)

| Domain | Contents | Status |
|--------|----------|--------|
| **A — GSAT Mock Exam** | `/exam*` routes, `exams` + 5 question tables, `exam_attempts`, `exam_user_answers` | 🛑 **RESERVED** — see §2 |
| **B — Learning Platform** | Future daily learning: teacher/class/student/parent, assignments, vocabulary/listening/reading/speaking/writing analytics | Not yet built; will live under a new `/learn` domain |

**Do not put general learning activities into the mock-exam schema.**

---

## 2. Reserved boundaries — 🛑 DO NOT MODIFY

### 2.1 `/exam` and the GSAT mock exam domain — RESERVED

**Objects:** `exams`, `vocabulary_questions`, `question_groups`, `group_questions`,
`translation_questions`, `essay_questions`, `exam_attempts`, `exam_user_answers`, `exam_statistics`,
storage bucket `exam-images`.

**Routes:** `/exams`, `/exam`, `/exam/result/:attemptId`, `/exam/explanation/:attemptId`,
`/dashboard/result-summary`, `/admin/exams`, `/admin/exams/:examId/questions`.

**Code:** `src/hooks/useExam.ts`, `src/store/examStore.ts`, `src/types/exam.ts`,
`src/data/mock-exam.ts`, `src/data/mock-exam-list.ts`, `src/pages/Exam*.tsx`,
`src/components/exam/**`, `src/pages/admin/ExamAdmin.tsx`,
`src/pages/admin/ExamQuestionsEditor.tsx`.

✅ **Its RLS is confirmed correct** (publication-gated question reads, owner-scoped attempts,
answers chained through `exam_attempts`) and is **explicitly out of scope for Phase 0.5B**.

⚠️ **Naming hazard:** `exam_records` and `exam_types` are **NOT** part of this domain. They belong
to the LMS cluster and have **RLS disabled**. Do not confuse them with `exams` / `exam_attempts`.

### 2.2 Existing Writing / LMS Production models — REUSE, DO NOT DUPLICATE

The Supabase project is **shared with another live application**. ~22 tables in `public` are used by
that app and are **not referenced by this repository at all**.

**Writing (confirmed):** `public.essay_submissions` — **86 rows**, RLS enabled, table comment
「學生作文提交記錄」. Columns include `student_id` (⚠️ `character varying`, **not uuid**, no FK),
`essay_content`, `essay_title`, `essay_topic`, `essay_topic_detail`, `essay_date`,
`submission_type`, `image_thumbnail_url`, `highlights` (**jsonb**), `score_content`,
`teacher_comment`, `student_notes`. Plus storage buckets **`essays` and `Essays`** (two distinct,
case-sensitive buckets).

> **Status: `EXISTING WRITING MODEL CONFIRMED — REUSE / ADAPTER DESIGN REQUIRED`.**
> **Do not create a replacement writing table.** The Phase 5 shape is an *adapter* mapping
> `essay_submissions` onto the GSAT UI types, extended additively (nullable `class_id`,
> `assignment_id`, `source`) **only after the owning app's maintainer agrees**.

Notably, `essay_submissions.highlights` structurally matches the `highlights[{start,end,type,
severity,note,suggestion}]` shape already defined in `src/data/mock-essay.ts`.

**LMS / assignment cluster (confirmed to exist with live data):** `users` (a `public.users`, separate
from `auth.users`), `assignments`, `assignment_submissions`, `student_tasks` (32 rows), `courses`,
`course_lessons`, `user_course_access`, `user_lesson_progress`, `learning_progress_stats`,
`vocabulary_sessions`, `exam_records`, `exam_types`, `course_requests`, `notifications`,
`admin_course_reminders`, `user_reminder_preferences`, `reminder_logs`, `tokens`,
`file_download_logs`, `grammar_tags`, `blog_comments`.

> **Do not design a replacement assignment system.** `docs/PLATFORM_AUDIT.md` §7 originally said
> these concepts did not exist — **that was repository-scoped and is superseded.**

---

## 3. Completed discovery — Phase 0 / 0.5A / 0.5B-A0

### 3.1 Phase 0 — repository audit → `docs/PLATFORM_AUDIT.md` (commit `5086d66`)

Full read of the repo. Key findings still relevant:

- **Two disconnected exam systems.** Admin authoring writes real Supabase tables; the student-facing
  flow runs entirely on `MOCK_EXAM_PAPER` + `localStorage`. `useExamAttempt()` and
  `useUserExamHistory()` (the only code touching `exam_attempts`) are **imported by no page**.
- **Dashboard, essay, gamification, courses are all mock data.**
- **Two divergent SRS systems** — see §4 finding 9.10.
- ~3.7 MB of static vocabulary in `src/data/vocabulary/` still statically imported into the bundle.
- ⚠️ **§7 of that document is superseded** — see §2.2 above.

### 3.2 Phase 0.5A — Production discovery → `docs/PRODUCTION_SCHEMA_AUDIT.md`

Run in two rounds against the live database (read-only metadata only).

- **Round 1** (Q07 RLS policies, Q10 grants, Q15 functions, Q19/Q29 unaccounted tables) — commit `b2aabd3`
- **Round 2** (Q08 RLS-disabled, Q18 FKs, Q20 role columns, Q24 buckets, Q27/Q28 writing) — commit `07c871a`

Scripts: `docs/discovery/production_discovery.sql`, `docs/discovery/production_discovery_round2.sql`,
runbook `docs/discovery/README.md`. **All are read-only `SELECT`s** and deliberately live outside
`supabase/migrations/`.

**Identity model is fragmented — three unlinked anchors:**

```
auth.users ──FK──► user_profiles          (19 public tables FK auth.users)
public.users        role varchar DEFAULT 'student', is_admin boolean   ❌ NO FK to auth.users
???        ──────► assignment_submissions.student_id  uuid   ❌ no FK
                   student_tasks.student_id           uuid   ❌ no FK
                   essay_submissions.student_id       varchar ❌ no FK
```

**Teacher/Student/Parent exist as COLUMNS, not tables:** `teacher_feedback`, `teacher_notes`,
`teacher_comment`, `parent_feedback`, `parent_verified`, `parent_notification_sent`,
`visible_to_student`, `student_notes`. There is **no** `classes`, `teachers`, `parents`, `guardians`
or `user_roles` table.

### 3.3 Phase 0.5B-A0 — read-only verification (commit `2781269`) ✅ CLOSED

| Check | Result |
|-------|--------|
| **R14** premium grant history | 5 rows, all with non-NULL `granted_by`, all from one grantor. One self-grant — the earliest, followed 7s later by grants to others. **No anonymous grants; no evidence of exploitation.** Grantor `0aea72e3-26d5-409e-9992-a59936fd3abd` **confirmed by the owner as their own admin account.** |
| **R15** admin metadata-role | **22 users, zero role claims.** Mechanism 4 (§4 finding 9.6) is currently **inert**. |

**A0 also surfaced finding 9.15** (§4) — visible only from live data.

**Scale context:** `auth.users` holds **22 users**. This is a small production system.

---

## 4. Confirmed Production security findings

Source of truth: `docs/PRODUCTION_SCHEMA_AUDIT.md` §9–§10. All ✅ CONFIRMED unless noted.

| # | Finding | Severity | Phase | Breaks other app? |
|---|---------|----------|-------|-------------------|
| **9.1** | **11 `public` tables with RLS DISABLED + full `anon` CRUD grants + zero policies**: `users`, `assignments`, `assignment_submissions`, `student_tasks`, `courses`, `course_lessons`, `user_course_access`, `learning_progress_stats`, `vocabulary_sessions`, `exam_records`, `exam_types`. Confirmed twice (Q08 + Q29). **`public.users.is_admin` is world-writable** — an app-takeover primitive if the LMS trusts it. | 🔴 CRITICAL | **0.5B-B** | ⚠️ **Yes** |
| **9.2** | **All 8 storage buckets are `public = true`** (`blog-images`, `essays`, `Essays`, `exam-images`, `pack-audio`, `pack-covers`, `pack-images`, `tts`). A public bucket serves objects over an unauthenticated URL, **bypassing object-level SELECT policies**. `essays_select_policy` also grants LIST to `{public}`, and the insert/update/delete policies have **no owner predicate** — any authenticated user can overwrite or delete any student's essay file. | 🔴 CRITICAL | **0.5B-B** | ⚠️ **Yes** |
| **9.3** | `admin_grant_premium` / `admin_revoke_premium` are `SECURITY DEFINER` with **no authorization check**, and `EXECUTE` is granted to **PUBLIC including `anon`**. Any caller, even unauthenticated, can grant or revoke Premium for any user. | 🔴 CRITICAL | **A1-1 / A1-2** | ✅ No |
| **9.11** | TTS endpoint runs as `service_role` with **no auth check of any kind** — only an HTTP-method check. | 🔴 CRITICAL | **A1-3a** | ✅ No |
| **9.12** | Cron endpoint guard was `if (cronSecret && …)` — skipped entirely when unset. | 🟠 HIGH | **A1-4** | ✅ No — **see §8, exposure already closed** |
| **9.15** | **Premium revocation silently fails.** `admin_grant_premium` INSERTs unconditionally so a user can hold several active memberships; `admin_revoke_premium` deactivates **one row by id** while `is_premium_member` tests `EXISTS` over all. User `36258aeb-f26d-406e-a8ed-25595a736614` currently holds **two** active permanent rows. | 🟠 HIGH | **A1-6** | ✅ No |
| **9.4** | `invite_tokens` **and** `tokens` readable by `anon` — `"Anyone can validate tokens" USING (is_active = true)`. Every active invite code is enumerable. | 🟠 HIGH | **0.5B-B** | ⚠️ Possibly |
| **9.5** | `claim_pack_with_token(text,text)` accepts `p_site` and **never references it**. `site` always falls back to the column default `'gsat'`, so a pack claimed on TOEIC/Kids disappears from that site's UI. Both 1-arg and 2-arg overloads exist. | 🟠 HIGH | **0.5B-B** | ⚠️ Possibly |
| **9.6** | **Five parallel admin authorization mechanisms:** (1) `is_admin()` → hard-coded email `nonstopjazz@gmail.com`; (2) `app_admins` table (used **only** by `site_settings` UPDATE); (3) inline `auth.jwt()->>'email'` (blog + blog-images); (4) `raw_user_meta_data->>'role'='admin'` (`admin_course_reminders`, `reminder_logs`) — **confirmed inert, 0 users hold the claim**; (5) `public.users.is_admin` (LMS, RLS off so unenforced). | 🟠 HIGH | Phase 1 | ⚠️ Yes |
| **9.7** | **6 `SECURITY DEFINER` functions lack a pinned `search_path`**: `admin_grant_premium`, `admin_revoke_premium`, `claim_pack_with_token(text,text)`, `get_all_word_progress`, `is_premium_member`, `upsert_word_progress(8-arg)`. The other 12 already carry `SET search_path TO 'public'`. | 🟡 MEDIUM | A1 (2 of 6) → **A2 (4 remaining)** | ✅ No |
| **9.8** | `notifications` policy named "Service role can insert" actually applies to `{public}` with `WITH CHECK (true)`. | 🟡 MEDIUM | 0.5B-B | ⚠️ Possibly |
| **9.9** | `upsert_word_progress` **6-arg overload is broken** — its `ON CONFLICT (user_id, word_id)` targets a constraint dropped by `unify_word_progress_tracking.sql`. Live path uses the 8-arg version, so it is latent. | 🟡 MEDIUM | A2 optional | ✅ No |
| **9.10** | **Divergent SRS semantics.** Level words: client-computed, mastery cap **6**, `next_review_time BIGINT` (Unix ms). Pack items: server-computed (`update_pack_item_progress`), cap **5**, "mastered" ≥ 4, `next_review_at TIMESTAMPTZ`. Both track pack items. | 🟡 MEDIUM | Phase 3 | ✅ No |

**Refuted (good news):** `site_settings` UPDATE **is** admin-gated via `app_admins`; the GSAT
exam-domain RLS is correct.

---

## 5. Current A1 scope and status

Master plan: **`docs/PHASE_0_5B_A1_PLAN.md`**. Everything below is **prepared, NOT deployed.**

| Item | What | Artefact | Status |
|------|------|----------|--------|
| **A1-1** | `admin_grant_premium`: add `is_admin()` gate; idempotent (extend-in-place, never a second active row); `SET search_path = ''`; `REVOKE EXECUTE FROM PUBLIC, anon` | `docs/phase-0.5b/A1-premium-functions.sql` | ✅ Prepared + locally verified |
| **A1-2** | `admin_revoke_premium`: same gate/grants; **signature kept**, membership id resolves the user, revokes **all** their active rows | same file | ✅ Prepared + locally verified |
| **A1-3a** | **Security.** JWT auth + `is_admin()` evaluated as the caller. Students → `403`. | `patches/A1-3a-security-api.patch`, `patches/A1-3a-security-ui.patch` | ✅ Prepared, applies to clean tree |
| **A1-3b** | **Reliability.** Chunking/cursor + UI loop; fixes the pre-existing large-pack timeout. | `patches/A1-3b-reliability-api.patch`, `patches/A1-3b-reliability-ui.patch` | ✅ Prepared, **requires A1-3a first** |
| **A1-4** | Cron fail-closed + constant-time secret comparison. **GET stays allowed.** | `patches/A1-4-cron.patch` | ✅ Prepared. **Exposure already closed by env var — see §8** |
| **A1-5a** | `crypto.getRandomValues()` + rejection sampling for invite tokens. Alphabet/length unchanged → existing tokens stay valid. | `patches/A1-5a-secure-token-rng.patch` | ✅ Prepared |
| **A1-5b** | `.gitignore` `.env` protection **+ full `.env.example` inventory (15 variables)** | `patches/A1-5b-gitignore-env.patch`, `patches/A1-5b-env-example.patch` | ✅ **Prepared and COMPLETE** (commit `02246a5`) |
| **A1-5c** | Dev tools: Production off; **local + Vercel Preview on** via `VITE_ENABLE_DEV_TOOLS` | `patches/A1-5c-devtools-env-gate.patch` | ✅ Prepared |
| **A1-6** | Premium revocation fix (folded into the same two functions as A1-1/A1-2) | `docs/phase-0.5b/A1-premium-functions.sql` | ✅ Prepared + locally verified |
| **Data** | Deactivate the one duplicate membership row `93fa86e3-…` | `docs/phase-0.5b/DATA-REMEDIATION-duplicate-membership.sql` | ✅ Approved, **separate deployment**, awaiting A1 |

### 5.1 Local verification already performed

Against a **throwaway local PostgreSQL 16.13** seeded with the *real* production duplicate:

```
BEFORE (current production function bodies):
  revoke → {"success": true}          is_premium_member = true    ← the bug reproduced
AFTER  (A1 functions):
  revoke → {"revoked_count": 2}       is_premium_member = false   ← fixed
```

Also passing: non-admin refused (`UNAUTHORIZED`); re-grant shorter → `already_active` with exactly 1
active row; longer → `extended`; 3-month over permanent → `already_active` (**never silently
shortens**); revoke idempotent; unknown id → `MEMBERSHIP_NOT_FOUND`; `anon` EXECUTE `false` /
`authenticated` `true`; rollback faithful.

**Patch separability, verified behaviourally:** A1-3a applies alone → A1-3b applies on top →
**reversing A1-3b leaves the `is_admin()` gate and `FORBIDDEN` path intact.**

**`.gitignore` verified behaviourally:** with the patch applied, `git check-ignore` reports `.env`,
`.env.local`, `.env.production` as ignored while `.env.example` stays tracked.

**All patched TypeScript parse-checks to the same error-code set as the originals.**

⚠️ **Local testing is not staging.** It proves SQL validity and logic; it does **not** exercise real
RLS, real JWTs, the real `is_admin()`, or Vercel's runtime.

---

## 6. Decisions already approved by the owner

Do **not** relitigate these.

| # | Decision |
|---|----------|
| 1 | **A0 formally closed.** Grantor `0aea72e3…` is the owner's legitimate admin account; the 5 premium grants are legitimate. |
| 2 | **`SET search_path = ''` stays in A1-1/A1-2.** Since both bodies are fully rewritten anyway, the hardening lands here. **A2 therefore has 4 functions, not 6.** |
| 3 | **Duplicate premium cleanup approved** — but as an **independent deployment**, not bundled with the A1 migration. Order: deploy A1 → verify grant/extend/revoke/unauthorized → confirm Production healthy → *then* run the targeted cleanup → verify `is_premium_member()` and active-row count. **No data deletion**; targeted `UPDATE` with rollback retained. |
| 4 | **A1-3 must be split** into A1-3a (security) and A1-3b (reliability) with **separate rollback and verification paths**. Do not recombine them. |
| 5 | **`TTS_MAX_ITEMS_PER_REQUEST = 100`** approved as the default. |
| 6 | **TTS is admin-only by product semantics** — not merely a security tightening. |
| 7 | **Edge Function not deleted**; classified repository-only (§9). |
| 8 | **A1-5a, A1-5b approved.** **A1-5c approved with the amended design**: disabled in Production, **allowed in local dev and Vercel Preview**. Do not remove Preview capability. |
| 9 | **`.env.example` full inventory approved** — names, safe placeholders, one-line purpose, scope, server-only vs client-exposed. **No real secrets, keys, URLs or production values.** |
| 10 | **`SUPABASE_ANON_KEY` and `VITE_SUPABASE_ANON_KEY` must stay separate names**, even though the value is normally identical — the name is what tells you whether a value is bundled into client JS. **No fallback between them.** |
| 11 | **Staging is a hard gate** for any A1 Production deployment. |
| 12 | **Production changes are not approved** until staging verification is complete. |

---

## 7. Explicitly deferred / out of scope

🛑 **Do not touch any of these in A1.**

| Item | Where it goes | Why deferred |
|------|---------------|--------------|
| RLS/grants for the 11 RLS-disabled LMS tables (§4 9.1) | **0.5B-B** | Enabling RLS with zero policies flips them to deny-all and breaks the owning app |
| `public.users` security | 0.5B-B | Same |
| `essays` / `Essays` bucket security (§4 9.2) | 0.5B-B | Flipping `public` to false breaks any hard-coded public URL the writing app relies on |
| `assignments` / `student_tasks` redesign | 0.5B-B / Phase 4 | Owner unknown; live data |
| Identity consolidation, `user_roles` | **Pre-Phase-1 decision** | See §14 |
| `claim_pack_with_token` site bug (§4 9.5) | 0.5B-B | Possible cross-application caller |
| `/exam` and the mock exam domain | Reserved | §2.1 |
| §4 9.8 `notifications` INSERT policy | 0.5B-B | LMS-owned |
| §4 9.9 broken `upsert_word_progress` overload | A2 optional | DB object, not app code |
| §4 9.10 SRS divergence | Phase 3 | Analytics forces the question |
| Cron targeting improvement | Later product/analytics work | §8.3 |
| `/dashboard/result-summary` ungated; 9 legacy admin routes | Opt-in only | Both sit in reserved Domain A |

### ⚠️ A withdrawn recommendation

An earlier revision proposed a **blanket `REVOKE ALL … FROM anon`** across all 11 RLS-disabled
tables as emergency containment. **That was withdrawn.** Those tables belong to an application whose
anonymous flows have not been analysed. A per-table revoke *may* suit targeted containment **only
after** confirming no anonymous flow depends on that specific table. **It is not an approved blanket
Production change.**

---

## 8. Production changes already made manually (outside this branch)

**These were done by the owner directly in Vercel — they are NOT in git.**

| # | Change | Status |
|---|--------|--------|
| 1 | `CRON_SECRET` created in **Vercel Production** | ✅ Done — **do not change, rotate or delete it** |
| 2 | Current Production deployment **redeployed** | ✅ Done |
| 3 | **Manual Vercel Cron Run succeeded** | ✅ Done |
| 4 | **A real device received the notification** | ✅ Done |
| 5 | **Scheduled (automatic) cron invocation** | ⏳ **STILL NEEDS VERIFICATION** |

### 8.1 🔑 Why #1 matters more than it looks

The existing guard is `if (cronSecret && …)`. **Setting the variable activated it.** So
**finding 9.12's exposure is CLOSED in Production as of that redeploy — before any code change.**
`patches/A1-4-cron.patch` is now purely defense-in-depth (making a missing secret a `503` rather than
an open door).

### 8.2 ⚠️ The distinction the next session must not blur

> **A manual cron run succeeding does NOT prove the scheduled cron will succeed.**

A manual run means *you* supplied the `Authorization: Bearer $CRON_SECRET` header. The scheduled path
depends on **Vercel automatically attaching that header** to its own invocation. Those are different
mechanisms and only the second is still unverified.

**Therefore:** items 3 and 4 satisfy gates *4b* (workflow functions) and *4c* (device receives), but
gate **4 (the scheduler authenticates) is still open.**

🛑 **Do not deploy `A1-4-cron.patch` until a real *scheduled* run is confirmed `200`.** If Vercel is
not attaching the header, the fail-closed patch returns 401 and **the daily flashcard reminder stops
firing silently** — nobody watches a cron that simply does nothing.

**How to verify:** Vercel → Project → **Cron Jobs** → last run status/timestamp. Expect `200` at
~12:00 UTC. `401` ⇒ header not attached, do not proceed. `503` ⇒ variable not set on that environment.

### 8.3 Deferred product observation (not a bug to fix in A1)

The cron targets purely on `user_stats.last_study_date != today` and **never consults
`user_word_progress`**, so a student who is fully caught up still receives a 「回來複習」 nudge, and
the copy never mentions how many words are actually waiting. **Owner-confirmed as a later
product/analytics improvement — explicitly not an A1 fix.**

---

## 9. Supabase Edge Function finding

**Owner checked the Supabase Dashboard:**

- ❌ **No deployed Edge Functions visible in the project.**
- ✅ `GOOGLE_TTS_API_KEY` **does exist** under Edge Function Secrets.

> **Classification: `REPOSITORY-ONLY / NOT CONFIRMED DEPLOYED IN PRODUCTION`.**

A secret with no function to run it is inert.

| Decision | Status |
|----------|--------|
| Production patch required for A1? | ❌ **No** |
| Delete `supabase/functions/generate-pack-audio/`? | ❌ **Not yet** |
| Rotate/delete `GOOGLE_TTS_API_KEY`? | ❌ **No — leave unchanged in A1** |
| Actively used TTS path | ✅ `PackItemsAdmin` → **Vercel API** |

`patches/OPTIONAL-A1-3-edge-repo-only.patch` is retained as **repository hygiene, not an A1
deliverable**: if anyone ever deploys that file as-is it would go live **unauthenticated** with
`Access-Control-Allow-Origin: *`.

⚠️ "Not visible in the Dashboard" is strong but not absolute. **If traffic ever appears on
`/functions/v1/generate-pack-audio`, treat that as evidence of deployment and apply the patch
immediately.**

---

## 10. TTS decisions

| Decision | Detail |
|----------|--------|
| **Actual Production path** | `src/pages/admin/PackItemsAdmin.tsx:247` → `POST /api/generate-pack-audio` (Vercel). **The only caller.** |
| **Product semantics** | Admin content-authoring tool for pronunciation audio. **Not** a student-facing TTS service. Students → `403`. |
| **Largest pack** | **214 items** |
| **`TTS_MAX_ITEMS_PER_REQUEST`** | Default **100** → 214 items completes in **3 chunks** |
| **Split** | A1-3a (security) and A1-3b (reliability) must remain **independently rollbackable** |

### 10.1 Why chunking, not a cap — the reasoning that must not be re-derived wrongly

An earlier revision proposed a hard cap of `MAX_TTS_CALLS_PER_REQUEST = 400`. **That was withdrawn as
solving the wrong problem:**

```
maxDuration                       60 s   (api/generate-pack-audio.ts)
Each item                         up to 2 syntheses
5-way concurrency, ~0.5 s each  → ~250 syntheses realistic ceiling
Largest pack 214 items          → up to 428 syntheses  ≈ 1.7× over budget
```

A 400-cap would **never fire** — the function times out first. And this is not hypothetical: the UI
**already ships a 504 handler** (`PackItemsAdmin.tsx:257`) saying
「處理超時，請嘗試較小的單字包或稍後重試」. **Large packs already fail in Production today.**

So A1-3b fixes a **pre-existing production defect**. The endpoint processes one slice and returns
`next_offset` / `has_more`; the UI loops with progress toasts. A caller may request a *smaller*
`limit`, never a larger one (server clamps).

### 10.2 Rate limiting — deliberately not implemented

The **admin gate closes the abuse vector**. What remains is accidental cost blowup, addressed by:
`force` requiring `confirm_force`, the per-request chunk bound, and structured logging
(`admin=<uuid> pack=<id> offset=… limit=… force=…`).

A true rate limiter needs **shared state, which serverless lacks** — it would mean a `tts_jobs` table
(schema change) or Upstash (new infra). Both out of hotfix scope. **The highest-value residual control
is a GCP quota cap on the Text-to-Speech API** (a cap, not merely a budget alert).

Pack sizing survey (read-only): `docs/phase-0.5b/A1-3-pack-size-survey.sql`.

---

## 11. A1-5 decisions

| Item | Decision |
|------|----------|
| **5a** | ✅ **Approved.** `crypto.getRandomValues()` + rejection sampling. Alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` and length **unchanged** → **every existing token stays valid**. ⚠️ Does **not** fix §4 9.4 (the enumeration policy), which stays in 0.5B-B. |
| **5b** | ✅ **Approved.** `.gitignore` gains `.env`, `.env.*`, `!.env.example`. Plus the **full `.env.example` inventory**. |
| **5c** | ✅ **Approved with the amended design** — see below. |

### 11.1 A1-5c — the approved design

| Environment | Dev tools | Mechanism |
|-------------|-----------|-----------|
| **Local development** | ✅ available | `import.meta.env.DEV` |
| **Vercel Preview** | ✅ **available — do not remove** | `VITE_ENABLE_DEV_TOOLS === 'true'` (**Preview scope only**) |
| **Production** | ❌ **no activation path exists** | neither condition holds |

Inside permitted environments `?devmode=true` + `localStorage` continue to work **exactly as today**.
An explicit opt-in variable is used rather than sniffing `VERCEL_ENV` because Vite only exposes
`VITE_`-prefixed variables to client code, and because enabling dev tooling should be a visible,
intentional configuration act.

### 11.2 `.env.example` — 15 variables, all documented

A full inventory of `process.env.*`, `import.meta.env.*` and `Deno.env.get()` was run. **15 distinct
variables are documented**, made up of:

- **12** currently referenced in `api/`, `src/` and `supabase/functions/`, and
- **3** introduced by the A1 patches and not yet present in source — `SUPABASE_ANON_KEY` (A1-3a),
  `TTS_MAX_ITEMS_PER_REQUEST` (A1-3b), `VITE_ENABLE_DEV_TOOLS` (A1-5c).

**Zero variables are used in source but undocumented** — coverage is complete. `DEV` / `PROD` are
Vite built-ins: excluded from the count and from the file's settable entries, with a note saying so.

**Server-only (no `VITE_` prefix):** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
`GOOGLE_TTS_API_KEY`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`,
`SUPABASE_URL`, `TTS_MAX_ITEMS_PER_REQUEST`

**Client-exposed (Vite, bundled into browser JS):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_APP_PRODUCT`, `VITE_VAPID_PUBLIC_KEY`, `VITE_SITE_ID`, `VITE_ENABLE_DEV_TOOLS`

### 11.3 ⚠️ The anon-key naming rule — and a defect it caught

`SUPABASE_ANON_KEY` (server) and `VITE_SUPABASE_ANON_KEY` (browser) are **two different variables**
even though the value is normally the same key.

An earlier A1-3a draft contained:

```ts
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;   // ← WRONG
```

That fallback **defeats the property that makes the naming useful** — with it, you can no longer tell
from a name whether a value reaches the client. **It has been removed.** The patch now reads
`process.env.SUPABASE_ANON_KEY` and nothing else.

🛑 **Do not re-add a fallback between these two names.**

**Consequence:** `SUPABASE_ANON_KEY` **must be set in Vercel before A1-3a deploys**, or the endpoint
returns `500 Supabase credentials not configured`. It fails closed (correct direction) but would look
like a broken deploy.

---

## 12. Staging — the hard gate

Plan: **`docs/phase-0.5b/STAGING_PLAN.md`**. **No staging environment exists today.**

**Why it is a hard gate:** every A1 item changes either a `SECURITY DEFINER` function's authorization,
a function's `EXECUTE` grants, or a privileged serverless endpoint — in a database **shared with
another live application**. Local testing proves SQL validity and logic; it cannot exercise real RLS,
real JWTs, the real `is_admin()`, or Vercel's runtime.

**Shape:** a second Supabase project (free tier) + a Vercel Preview deployment on this branch.

**Must prove exactly four things:** S1 Supabase RPC behaviour + `EXECUTE` grants · S2 `authenticated`
vs `anon` · S3 the TTS caller path · S4 the cron secret path.

**No production PII.** Schema subset + synthetic fixtures: three `@example.test` users
(RFC 2606 reserved TLD), a 3-item pack, one fake push subscription, and a **deliberately reproduced
duplicate membership**.

⚠️ **Triple-check `SUPABASE_SERVICE_ROLE_KEY` on Preview is the *staging* key.** A production
service-role key in a preview environment would let staging tests write to Production with RLS
bypassed — the worst mistake available in this plan.

**Baseline run is mandatory:** reproduce §4 9.15 and the TTS bypass on staging **before** fixing them.
If staging cannot reproduce them it is not modelling Production faithfully and a green run afterwards
proves nothing.

**Staging cannot prove:** Vercel's cron scheduler attaching the header (Preview deployments do not run
crons — hence §8.2), or real push delivery.

**Effort:** ~4 hours. Keep the project for 0.5B-B and Phase 1.

---

## 13. Exact next action after this handoff

| # | Step | Status |
|---|------|--------|
| 1 | ~~Finish `.env.example` inventory~~ | ✅ **ALREADY DONE** — commit `02246a5`, all 15 variables. See §13.1. |
| 2 | **Freeze A1 scope** | ✅ **DONE 2026-08-25** — recorded in `docs/PHASE_0_5B_A1_PLAN.md` §0 |
| 3 | **Create staging** per `docs/phase-0.5b/STAGING_PLAN.md` | ✅ **DONE 2026-08-26** |
| 4 | **Validate A1 in staging** (S1–S5 + baseline run) | ✅ **DONE — all pass.** `docs/phase-0.5b/STAGING_RESULTS.md` |
| 5 | **Only then** consider Production deployment | ✅ **DONE 2026-08-26** — owner-approved, deployed, verified. `PHASE_0_5B_A1_PLAN.md` §12 |

### 13.1 ⚠️ Correction to the step list

The handoff request listed *"finish `.env.example` inventory"* as the next action. **That work is
already complete** and committed in `02246a5`:

- Full repository inventory run (`process.env.*`, `import.meta.env.*`, `Deno.env.get()`)
- **15 variables documented** (12 used in source today + 3 introduced by A1 patches) with name, safe
  placeholder, one-line purpose, scope, and server-only vs client-exposed. **Nothing used in source is
  undocumented.**
- Verified: no real project URL, no key-shaped string, no production-specific value
- `.gitignore` behaviour verified with `git check-ignore`

**A fresh session should not redo it.** Verify by opening
`docs/phase-0.5b/patches/A1-5b-env-example.patch`.

**Update 2026-08-25:** step 2 is now also complete. **The real next action is step 3 — create
staging.**

### 13.2 ✅ A1 scope is frozen — 2026-08-25

**A1 is exactly: A1-1, A1-2, A1-3a, A1-3b, A1-4, A1-5a, A1-5b, A1-5c, A1-6**, plus the
separately-deployed premium duplicate data remediation. Nothing from §7 has crept in.

🛑 **No additional finding may be added to A1 without a new explicit owner decision** — however
severe, however small, however adjacent. Discovering a problem is not authorisation to fix it: record
it in the audit or the deferred list and leave it there.

**Scope of record:** `docs/PHASE_0_5B_A1_PLAN.md` §0 (with §0.1 no-additions and §0.2 deferred).
Patch editing is finished; the next move is staging.

---

## 14. Remaining discovery needed after A1

| # | Question | How | Blocks |
|---|----------|-----|--------|
| 1 | **Identity root** — do the LMS `student_id uuid` columns reference `auth.users.id` or `public.users.id`? | R05 (all FKs) + a value-overlap check + **a conversation with the LMS maintainer** | **Phase 1.** `user_roles` must NOT be designed before this is settled |
| 2 | **Owner of the 22 unaccounted tables**, and which of their flows are anonymous | 💬 Conversation | §4 9.1 remediation; all of 0.5B-B; Phase 4 |
| 3 | **Shared LMS/Writing security** — per-table policy model | With the maintainer | 0.5B-B |
| 4 | **`essays` / `Essays` bucket use** — which is live, path convention, and **how teachers/AI currently read essays** (there is no teacher RLS policy, so reads must go via `service_role` or the public bucket URL) | R11 + 💬 | §4 9.2 fix correctness; Phase 5 |
| 5 | **`essay_submissions` full column list** — rubric breadth, where AI feedback lives (`highlights` jsonb is the candidate) | R02 | Phase 5 adapter |
| 6 | **`claim_pack_with_token` site bug** — reconcile the two overloads; decide whether to back-fix rows already mis-tagged `'gsat'` | 0.5B-B | §4 9.5 |
| 7 | **A2: the 4 remaining `SECURITY DEFINER` functions** — `claim_pack_with_token(text,text)`, `get_all_word_progress`, `is_premium_member`, `upsert_word_progress(8-arg)`. Prefer `SET search_path = ''` with schema qualification; **inventory each, do not bulk-edit** | A2 | — |
| 8 | Can `authenticated` `CREATE` in schema `public`? | R08 | Sets the true severity of §4 9.7 |
| 9 | `auth.users` triggers — is there already a profile auto-provisioning trigger? | R07 | Phase 1 |

**Round-2 discovery queries R01–R16 are already written** in
`docs/discovery/production_discovery_round2.sql` (read-only, validated).

### 14.1 ⚠️ A2 `search_path` caveat

For `claim_pack_with_token(text,text)`, `%ROWTYPE` declarations resolve **at compile time**, so with
`search_path = ''` they must be written `public.invite_tokens%rowtype`, `public.packs%rowtype`,
`public.user_pack_claims%rowtype`, and `public.is_premium_member(...)` must be qualified. `now()` and
`json_build_object()` are `pg_catalog` and need no change.

Three cases where an explicit list beats `''`: extension objects outside `pg_catalog` (Supabase often
uses an `extensions` schema); functions using temp tables (need `pg_temp`); deliberate late binding
(an anti-pattern here). **Re-verify per function — that is why bulk-editing is wrong.**

---

## 15. Rollback / deployment ordering constraints

### 15.1 A1-3a ↔ A1-3b

| State | Result |
|-------|--------|
| 3a API patched, UI not | Admin UI gets **403** — generation broken |
| 3a UI patched, API not | Safe — the extra header is ignored |
| **3b API patched, UI not** | ⚠️ **Silently processes only the first 100 items and looks like success** |
| 3b UI patched, API not | Degrades safely — old API returns no `has_more`, loop exits after one pass |

**Therefore:** 3a → deploy UI first or together, **roll back API first**.
**3b → deploy API and UI together.**
If both are deployed and you need to roll back 3a, **roll back 3b first**.

### 15.2 A1-4 cron

- 🛑 **Do not deploy the patch before a real *scheduled* run is confirmed `200`** (§8.2).
- **Safe rollback = revert the code, KEEP the secret.** Deleting `CRON_SECRET` would restore the
  fully-open behaviour — the opposite of a rollback.
- **GET must stay allowed.** Vercel Cron invokes with GET. *(An earlier revision wrongly recommended
  rejecting GET; that was corrected.)*

### 15.3 Premium functions (A1-1/A1-2/A1-6)

- Rollback file reproduces the **exact** pre-change definitions **and grants** —
  `docs/phase-0.5b/A1-premium-functions.rollback.sql`.
- ⚠️ **Applying that rollback reinstates §4 9.3 and 9.15.**
- It changes **no data** — memberships granted/revoked while A1 was live stay as they are.
- `SUPABASE_ANON_KEY` must exist in Vercel **before** A1-3a deploys (§11.3).

### 15.4 Data remediation

Runs **after** A1 is deployed and verified, as its own step. `is_active` is a soft flag → the row and
all metadata survive; rollback is a single `UPDATE`. ⚠️ Re-run the pre-flight before any rollback: if
a revoke happened in between, both rows will be inactive and reactivating one would wrongly re-grant
Premium.

### 15.5 Environment variables required before deploy

| Variable | Environment | Note |
|----------|-------------|------|
| `SUPABASE_ANON_KEY` | Production + Preview | 🛑 **Required by A1-3a — no fallback** |
| `VITE_ENABLE_DEV_TOOLS=true` | **Preview only** | Never Production |
| `TTS_MAX_ITEMS_PER_REQUEST` | Optional | Default 100; set `2` on staging to exercise chunking |
| `CRON_SECRET` | Production | ✅ Already set — **do not change** |

---

## 16. Documentation and patch index

### 16.1 Documents

| File | Contents |
|------|----------|
| `docs/CURRENT_PLATFORM_HANDOFF.md` | **This file** |
| `docs/PLATFORM_AUDIT.md` | Phase 0 repository audit. ⚠️ §7 superseded (§2.2) |
| `docs/PRODUCTION_SCHEMA_AUDIT.md` | **Phase 0.5A — the security source of truth.** §9 findings, §10 repo-vs-prod, §13 phase plan, §14 readiness |
| `docs/PHASE_0_5B_A1_PLAN.md` | **A1 master plan** — scope, deliverables, deployment order, verification checklist |
| `docs/phase-0.5b/README.md` | A1-1/A1-2/A1-6 caller analysis + option comparison |
| `docs/phase-0.5b/A1-3-TTS.md` | TTS: split rationale, auth design, chunking, per-patch rollback + verification |
| `docs/phase-0.5b/A1-4-CRON.md` | Cron: scheduler flow, secret placement, deployment order, flashcard workflow verification |
| `docs/phase-0.5b/A1-5-SCOPE-PROPOSAL.md` | A1-5 scope, approvals, `.env.example` inventory notes |
| `docs/phase-0.5b/STAGING_PLAN.md` | Minimum viable staging (the hard gate) |
| `docs/discovery/README.md` | Discovery runbook + query map |

### 16.2 SQL (all outside `supabase/migrations/` on purpose)

| File | Type |
|------|------|
| `docs/phase-0.5b/A1-premium-functions.sql` | **The A1-1/A1-2/A1-6 change.** Not applied |
| `docs/phase-0.5b/A1-premium-functions.rollback.sql` | Exact pre-change definitions + grants |
| `docs/phase-0.5b/A1-verification.sql` | §A structural, §B data invariants (both Production-safe), §C behavioural (**staging only**) |
| `docs/phase-0.5b/DATA-REMEDIATION-duplicate-membership.sql` | Approved, separate deployment |
| `docs/phase-0.5b/A1-3-pack-size-survey.sql` | Read-only pack sizing |
| `docs/discovery/production_discovery.sql` | Round 1, 31 active read-only queries (Q01–Q31). Q32–Q33 exist but are **commented out** — optional appendix, not part of the 31 |
| `docs/discovery/production_discovery_round2.sql` | Round 2, 16 read-only queries (R01–R16) |

### 16.3 Patches — **none are applied**

| Patch | Target | Applies to clean tree? |
|-------|--------|------------------------|
| `A1-3a-security-api.patch` | `api/generate-pack-audio.ts` | ✅ |
| `A1-3a-security-ui.patch` | `src/pages/admin/PackItemsAdmin.tsx` | ✅ |
| `A1-3b-reliability-api.patch` | `api/generate-pack-audio.ts` | ❌ **needs A1-3a first** |
| `A1-3b-reliability-ui.patch` | `src/pages/admin/PackItemsAdmin.tsx` | ❌ **needs A1-3a first** |
| `A1-4-cron.patch` | `api/send-daily-reminders.ts` | ✅ |
| `A1-5a-secure-token-rng.patch` | `src/pages/admin/TokensAdmin.tsx` | ✅ |
| `A1-5b-gitignore-env.patch` | `.gitignore` | ✅ |
| `A1-5b-env-example.patch` | `.env.example` | ✅ |
| `A1-5c-devtools-env-gate.patch` | `src/components/dev/DevPhaseSwitcher.tsx` | ✅ |
| `OPTIONAL-A1-3-edge-repo-only.patch` | `supabase/functions/generate-pack-audio/index.ts` | ✅ — **not an A1 deliverable** (§9) |

Verify at any time with `git apply --check <patch>`.

---

## 17. Git state

| | |
|---|---|
| **Branch** | `claude/gsat-platform-audit-wiz5rt` |
| **HEAD when this was written** | `02246a5ff7c2163eb7d0e3e9637fa84e781f420a` — the commit that adds *this file* sits directly on top of it, so the current `HEAD` is one commit further along. Confirm with `git log --oneline -1`. |
| **Base (merge-base with `main`)** | `6e7c0a91643d8b3d3115f81938060adb39c70719` |
| **Working tree** | Clean |
| **Source modified** | **None** — `api/`, `src/`, `supabase/`, `.gitignore`, `.env.example` identical to `main` |

**Every commit on this branch is documentation-only** (newest first):

| Commit | Subject |
|--------|---------|
| *(this commit)* | session handoff — `docs/CURRENT_PLATFORM_HANDOFF.md`; corrects the `.env.example` count to 15 |
| `02246a5` | full env inventory for `.env.example`; fix anon-key conflation in A1-3a |
| `32ecd5d` | split A1-3 into security/reliability; A1-5 approved; cron exposure closed |
| `3be05a7` | A1 revised for product semantics — TTS chunking replaces the cap |
| `0a2860b` | Phase 0.5B-A1 complete plan — TTS, cron, staging |
| `5ad4956` | Phase 0.5B-A1 premium function fix — prepared, tested |
| `2781269` | Phase 0.5B-A0 complete — no exploitation found, one new HIGH finding |
| `07c871a` | Phase 0.5A round 2 — identity fragmentation confirmed, writing model reusable |
| `b2aabd3` | Phase 0.5A round 1 analysis — four CRITICAL findings confirmed |
| `543b9ec` | Phase 0.5A production discovery — blocked on access, tooling delivered |
| `5086d66` | `PLATFORM_AUDIT.md` |

---

## 18. 🛑 DO NOT DO

Approaches already rejected, corrected, or explicitly out of bounds.

| # | Do not | Why |
|---|--------|-----|
| 1 | **Do not modify `api/`, `src/`, `supabase/`, `.gitignore` or `.env.example`** on this branch | The repo is Vercel-connected; keeping source identical to `main` guarantees pushing cannot alter deployed behaviour. Changes live as patches. |
| 2 | **Do not create files in `supabase/migrations/`** | That directory is the apply location and its files have historically been pasted into the SQL Editor. Prepared SQL lives in `docs/phase-0.5b/`. |
| 3 | **Do not deploy anything to Production** | Not approved. Staging is a hard gate. |
| 4 | **Do not run a blanket `REVOKE ALL … FROM anon`** on the 11 RLS-disabled tables | Withdrawn recommendation (§7). Would likely break the other live application. |
| 5 | **Do not `ENABLE ROW LEVEL SECURITY` on those tables without policies** | Flips them to deny-all and breaks the owning app. |
| 6 | **Do not create `user_roles` or any role table** | `public.users.role` already exists. Creating another makes a **sixth** authorization mechanism. Blocked on the identity-root decision (§14 #1). |
| 7 | **Do not create a replacement writing/essay table** | `essay_submissions` exists with 86 real rows. Reuse/adapter only (§2.2). |
| 8 | **Do not design a replacement assignment system** | `assignments` / `assignment_submissions` / `student_tasks` exist with live data. |
| 9 | **Do not recombine A1-3a and A1-3b** | Owner requires separate review, rollback and verification paths. |
| 10 | **Do not reintroduce `MAX_TTS_CALLS_PER_REQUEST` as a hard cap** | Withdrawn: at `maxDuration: 60` the function times out (~250 syntheses) long before a 400-cap fires. Chunking is the approved design (§10.1). |
| 11 | **Do not add a fallback between `SUPABASE_ANON_KEY` and `VITE_SUPABASE_ANON_KEY`** | Defeats the naming convention that signals which values are bundled into client JS (§11.3). |
| 12 | **Do not make the cron endpoint reject `GET`** | Vercel Cron invokes with GET. An earlier revision wrongly recommended this; it would break the daily reminder. |
| 13 | **Do not deploy `A1-4-cron.patch` before a real *scheduled* run returns `200`** | A manual run does not prove Vercel attaches the header (§8.2). |
| 14 | **Do not change, rotate or delete `CRON_SECRET`** | Already set correctly in Production; rotating adds risk for no gain. |
| 15 | **Do not delete or rotate `GOOGLE_TTS_API_KEY`**, and do not delete the Edge Function | Owner's decision; classification pending (§9). |
| 16 | **Do not touch `/exam`, the mock exam schema, or `essay_questions`** | Reserved (§2.1). |
| 17 | **Do not flip `essays` / `Essays` buckets to private** without knowing how the writing app reads them | Would break AI/teacher grading (§14 #4). |
| 18 | **Do not modify the existing duplicate membership row** as part of A1 | Approved only as a separate, later, targeted step (§6 #3). |
| 19 | **Do not copy production student PII into staging** | Synthetic `@example.test` fixtures only (§12). |
| 20 | **Do not put a production `SUPABASE_SERVICE_ROLE_KEY` in the Preview environment** | Staging tests would write to Production with RLS bypassed. |
| 21 | **Do not bulk-edit the A2 `search_path` functions** | Each needs individual schema-qualification analysis (§14.1). |
| 22 | **Do not redo the `.env.example` inventory** | Complete in `02246a5` (§13.1). |
| 23 | **Do not present repository evidence as Production-confirmed** | The audit uses explicit markers: ✅ CONFIRMED IN PRODUCTION / 📁 ONLY OBSERVED IN REPOSITORY / ❓ INFERRED. Preserve that discipline. |

---

## 19. ⚠️ Uncertainties the next session must RE-CHECK, not guess

| # | Uncertainty | How to resolve | Do not assume |
|---|-------------|----------------|---------------|
| 1 | ~~Has the scheduled (automatic) cron run succeeded?~~ | — | ✅ **ANSWERED — G4 PASSED 2026-08-25 ~20:13 Asia/Taipei.** The `0 12 * * *` schedule fired automatically with no manual Run and a real device received the reminder. A1-4 is no longer gate-blocked. 🛑 The schedule, targeting, handler behaviour and secret must still **not** be changed |
| 2 | ~~Is `SUPABASE_ANON_KEY` set in Vercel?~~ | — | ✅ **ANSWERED — G5 PASSED 2026-08-26.** Set on Production and Preview, each with its own project's anon key, verified by decoding the JWT `ref` claim. No redeploy was triggered: current Production code does not read it. 🛑 Still **no fallback** to `VITE_SUPABASE_ANON_KEY` — do not add one |
| 3 | ~~Does staging exist yet?~~ | — | ✅ **Built and run 2026-08-26.** Supabase `gsat-staging` (ref `cwymrzcovgobfqxtithn`) + a Preview deployment of the throwaway branch `claude/a1-staging-validation`. 🛑 That branch carries the patched source: **never merge it** |
| 4 | **Has any A1 item been deployed since this handoff?** | `git log` on `main`; Vercel deployments; re-run `docs/phase-0.5b/A1-verification.sql` §A | That Production still matches §4 |
| 5 | **Is the duplicate membership still present?** | `DATA-REMEDIATION-…sql` **Step 1 pre-flight** | That `36258aeb…` still has exactly 2 active rows |
| 6 | **Are the 11 tables still RLS-disabled?** | R01 in `production_discovery_round2.sql` | That nothing changed |
| 7 | **Is the Edge Function still undeployed?** | Supabase Dashboard → Edge Functions + invocation logs | "Not visible" is strong but not absolute (§9) |
| 8 | **Exact `essay_submissions` columns** | R02 | That §2.2's list is complete — Q28 was a **keyword filter**, so sibling columns such as `score_grammar` may exist and were not matched |
| 9 | **Which identity root the LMS uses** | R05 + value overlap + 💬 | Either answer (§14 #1) |
| 10 | **Whether any external caller invokes the premium RPCs or `claim_pack_with_token`** | `pg_stat_statements` query in `docs/phase-0.5b/README.md` §1.3, or Supabase API logs | That GSAT is the only caller — likely, but `EXECUTE` is granted to PUBLIC so it cannot be proven from the schema |
| 11 | **Whether `raw_user_meta_data.role` is self-assignable** | Not tested — R15 only showed 0 users hold it | That inert means safe; it is a latent trapdoor |
| 12 | **Largest pack size (214) still current** | `A1-3-pack-size-survey.sql` P02 | Packs may have grown |

### 19.1 On the local verification

The A1 SQL was tested against a **throwaway local PostgreSQL 16.13** with stub `auth.uid()`,
`is_admin()` and `is_premium_member()`. That proves **SQL validity and logic**. It does **not** prove
behaviour under real RLS, real JWTs, the real hard-coded-email `is_admin()`, or PostgREST. **Staging
must re-verify.**

### 19.2 On `is_admin()`

`is_admin()` is currently a **hard-coded email comparison** against `nonstopjazz@gmail.com`. A1 reuses
it deliberately — so A1 makes the premium functions and the TTS endpoint **as strong as the rest of
the system, not stronger**. Real convergence is Phase 1 and is blocked on the identity-root decision.

⚠️ On staging `is_admin()` must be pointed at a synthetic admin (`STAGING_PLAN.md` §3.3). **That
staging-only edit must never be copied back to Production.**
