# Security & Architecture Backlog

> **Mainline switched back to GSAT product development on 2026-08-26.**
>
> The security audit is **closed as an activity**, not because everything is fixed but because the
> items that could be fixed without touching another live application have been. What remains is
> recorded here and waits for a deliberate decision — it does not queue itself into the next
> conversation.

---

## 🛑 The interrupt rule

**A new finding may interrupt product development ONLY if it meets one of these three:**

1. It **directly causes a Production data leak**.
2. It **allows an unauthorised admin operation**.
3. It **causes an immediate Production failure**.

**Everything else is recorded here and left alone.** Do not widen scope. Do not start an
investigation because something looks adjacent to a known issue. Notice it, write it down, carry on.

> The bar is deliberately high. Two CRITICAL findings (§9.1, §9.2) are knowingly left open below and
> **do not** meet it, because acting on them without the owning application's maintainer would break
> a live system. "Severe" and "interrupt-worthy" are different questions.

---

## Open items

Source of truth for the findings: `docs/PRODUCTION_SCHEMA_AUDIT.md` §9.

### 🔴 Phase 0.5B-B — blocked on the shared LMS/Writing application

Both need the owning application's maintainer before anything is changed. Acting alone breaks a live
system.

| # | Item | Why it is blocked |
|---|---|---|
| **9.1** | **11 `public` tables with RLS DISABLED, full `anon` CRUD grants, zero policies** — `users`, `assignments`, `assignment_submissions`, `student_tasks`, `courses`, `course_lessons`, `user_course_access`, `learning_progress_stats`, `vocabulary_sessions`, `exam_records`, `exam_types`. `public.users.is_admin` is **world-writable** | Enabling RLS with no policies flips them to deny-all and breaks the owning app. 🛑 A blanket `REVOKE ALL … FROM anon` was **withdrawn** — those anonymous flows have never been analysed |
| **9.2** | **All 8 storage buckets are `public = true`**, including `essays` and `Essays` (student work). `essays_select_policy` grants LIST to `{public}`; insert/update/delete policies have **no owner predicate**, so any authenticated user can overwrite or delete any student's essay file | Flipping `public` to false breaks any hard-coded public URL the writing app relies on. Must first establish how teachers and the AI currently read essays |
| **9.4** | `invite_tokens` and `tokens` readable by `anon` — `"Anyone can validate tokens" USING (is_active = true)`. Every active invite code is enumerable | Possible cross-application caller |
| **9.5** | `claim_pack_with_token(text,text)` accepts `p_site` and **never references it**, so a pack claimed on TOEIC/Kids silently lands as `'gsat'`. Both 1-arg and 2-arg overloads exist | Possible cross-application caller. Also needs a decision on back-fixing rows already mis-tagged |
| **9.8** | `notifications` policy named "Service role can insert" actually applies to `{public}` with `WITH CHECK (true)` | LMS-owned |
| — | **Shared LMS/Writing security model** — the per-table policy design these all depend on | 💬 Conversation with the maintainer |
| — | **Storage bucket cleanup** — the private/public model for all 8 buckets | Same |

### 🟠 Identity

| Item | State |
|---|---|
| **9.6** Five parallel admin authorization mechanisms | Deferred to **Phase 1**. `is_admin()` hard-codes one email; `app_admins`; inline `auth.jwt()->>'email'`; `raw_user_meta_data->>'role'` (**inert — 0 users hold it**); `public.users.is_admin` (RLS off, unenforced) |
| **Identity migration / consolidation** | Still blocked on the identity-root question: do the LMS `student_id` columns reference `auth.users.id` or `public.users.id`? 🛑 **Do not create `user_roles` or any global role table.** ✅ **No longer blocks `/learn`** — `docs/IDENTITY_ARCHITECTURE_CHECKPOINT.md` (2026-08-27) decouples the two by anchoring all new work on `auth.users.id`. The LMS root stays unanswered until the two applications must actually share data |

### 🟡 A2 — remaining `SECURITY DEFINER` hardening

**9.7**: A1 pinned `search_path` on `admin_grant_premium` and `admin_revoke_premium`. **Four remain:**

- `claim_pack_with_token(text,text)` — ⚠️ `%ROWTYPE` resolves at compile time, so under `search_path = ''` it needs `public.invite_tokens%rowtype`, `public.packs%rowtype`, `public.user_pack_claims%rowtype`, and `public.is_premium_member(...)` qualified
- `get_all_word_progress`
- `is_premium_member`
- `upsert_word_progress(8-arg)`

🛑 **Inventory each individually. Do not bulk-edit.** Extension objects, temp tables and deliberate late binding each change the right answer.

Also in A2: **9.9** `upsert_word_progress` 6-arg overload is broken — its `ON CONFLICT (user_id, word_id)` targets a dropped constraint. Latent: the live path uses the 8-arg version.

### 🟢 §9.13 — the three sub-items A1-5 did not close

§9.13 is a **bundle of six**. A1-5 closed three (token RNG, dev panel, `.gitignore`).

| Sub-item | Severity | Note |
|---|---|---|
| `/dashboard/result-summary` ungated | 🟡 **MEDIUM** | Sits in the **reserved `/exam` domain** — needs explicit owner approval to touch |
| 9 legacy admin routes gated only by `!IS_PRODUCTION` | 🟢 LOW | Same reserved-domain consideration |
| Unauthenticated blog analytics inserts | 🟢 LOW | ⚠️ **Never in A1 scope and not on any other deferred list.** This one has no home yet |

### 🟡 Product / analytics, not security

| Item | Note |
|---|---|
| **9.10** Divergent SRS semantics | Level words: client-computed, mastery cap 6, `next_review_time BIGINT`. Pack items: server-computed, cap 5, mastered ≥ 4, `next_review_at TIMESTAMPTZ`. Both track pack items. Phase 3 — analytics will force the question |
| Cron targeting | Targets purely on `user_stats.last_study_date != today` and never consults `user_word_progress`, so a fully caught-up student still gets a 「回來複習」 nudge. Owner-confirmed as a later product improvement |
| `assignments` / `assignment_submissions` / `student_tasks` redesign | 0.5B-B / Phase 4. 🛑 These exist with live data — **do not design a replacement** |

---

## Closed — do not reopen

| Finding | Closed by | Date |
|---|---|---|
| **9.3** premium functions: no authorization, `EXECUTE` to PUBLIC + `anon` | A1-1 / A1-2 | 2026-08-26 |
| **9.11** TTS endpoint: `service_role`, no authentication | A1-3a | 2026-08-26 |
| **9.12** cron endpoint open when `CRON_SECRET` unset | A1-4 | 2026-08-26 |
| **9.15** premium revocation silently fails | A1-6 (code) + Phase C (data) | 2026-08-26 / 2026-08-27 |
| §9.13 token RNG · dev panel · `.gitignore` | A1-5a / 5c / 5b | 2026-08-26 |
| Pre-existing large-pack TTS timeout | A1-3b | 2026-08-26 |

Full record: `docs/PHASE_0_5B_A1_PLAN.md` §12 · `docs/phase-0.5b/STAGING_RESULTS.md`

---

## Standing rules for all new `/learn` work

These are not backlog items. They are constraints on everything built from here.

| Rule | |
|---|---|
| **New tables** | **RLS ON by default**, with policies written at the same time. Never a table with RLS enabled and no policies, and never one with RLS off |
| **New storage buckets** | **Private by default.** Serve through signed URLs, never `getPublicUrl` on private data |
| **Identity** | 🛑 **Do not introduce another users/identity table.** There are already too many |
| **`SECURITY DEFINER`** | Avoid unless genuinely required. If used: pin `search_path`, and `REVOKE` down to the minimum `EXECUTE` |
| **Shared LMS/Writing tables and public buckets** | 🛑 **Do not depend on them** without explicit owner approval — they carry the open 9.1 / 9.2 problems |
| **Helper functions in `public`** | 🆕 PostgreSQL grants `EXECUTE` to `PUBLIC` on every new function and Supabase does not revoke it. A one-off helper must be **dropped when done**, or created with an explicit `REVOKE`. Two verification helpers were left callable by `anon` during the Production run and dropped at P6 — same shape as 9.3 |
| **`user_profiles` is optional** | 22 Production accounts, **5 profile rows**. Never `INNER JOIN` through it in a way that drops a class member from a roster |

**The identity model for all `/learn` work is decided:** `docs/IDENTITY_ARCHITECTURE_CHECKPOINT.md`.

**The `/learn` product & competency model is specified:** `docs/learn/LEARNING_DOMAIN_MODEL.md`
(2026-08-29, revised the same day after an owner ruling on eight open items). 🛑 Its §15 carries
**five** BLOCKED decisions and marks every taxonomy except Grammar as PROVISIONAL. **Do not complete a
taxonomy, seed skill data, or build an entity whose governing decision is still blocked.**

Standing rules that now bind all `/learn` work:

| Rule | |
|---|---|
| **Naming** | `word_level` (`MOE_1`…`MOE_6`, `BEYOND`) · `difficulty` · `cefr_level` · `grade`. 🛑 **Never a bare `level`** |
| **Evidence** | Derives from **question / assessable-item** tags. 🛑 An Activity's skill tag never converts its responses into evidence wholesale |
| **Rubrics** | 🛑 A Speaking/Writing rubric grammar score is **not** Grammar Domain mastery. Only evidence resolvable to a specific Skill updates that Skill |
| **Asset versions** | 🛑 A content version that has produced evidence is **immutable**; changes fork a new version and responses point at the exact version answered |
| **Access** | 🛑 A teaching relationship grants **no** Program access. Enrollment is the only source |

**Grammar taxonomy source of truth:** `docs/learn/grammar-taxonomy/Grammar_Skill_Taxonomy_v1.xlsx`
— 10 Categories · **51 Skills with stable codes** (`GRAM_G7_REL_PRON` …) · **234 Micro-skill
candidates** covering all 51 Skills, plus source-material provenance and the binding tagging rules
OD-01…OD-05. The Markdown records structure and principles only; the spreadsheet wins on detail.
🟡 Micro-skills are **PROVISIONAL / CANDIDATE** — usable for tagging, 🛑 not DECIDED, and do not
invent additions.

⚠️ **Known spec ↔ schema gap (§14.1) — now a DECIDED requirement, not an open question.** The owner
ruled on 2026-08-29 that the direct teacher–student relationship is **first-class and independent of
Class**, but the deployed Identity Spine can only express membership through `learn.classes`. A
direct student with no class is invisible to their teacher under the D2 `user_profiles` policy.

**Resolution shape:** a `teacher_student_relationships` table plus a second additive `user_profiles`
SELECT policy scoped to a confirmed direct relationship — the existing guardian policy is the exact
precedent. 🛑 Needs its own owner approval and the same staged staging→Production process the spine
used. Blocks Student Home and any one-to-one flow until then.

✅ **Both owner decisions are DECIDED (2026-08-27):**

| | Decision | Outcome |
|---|---|---|
| **D1** | Namespace | A dedicated **`learn` schema**. `anon` gets no access to it; `authenticated` gets `USAGE` + `SELECT/INSERT/UPDATE` and **no `DELETE`**; schema privilege is a second layer, never a substitute for RLS |
| **D2** | Profile visibility | Additive `SELECT` policies on `user_profiles`, **narrowed**: class owner and confirmed guardian only. 🛑 A student gets nothing from merely sharing a class |

✅ **The identity spine is DEPLOYED to Production (2026-08-28) and the checkpoint is CLOSED.**
`learn` schema · `learn.classes` / `class_members` / `guardian_links` · 10 policies · two additive
`user_profiles` policies. Staging 26/26 + 25/25 + 6/6 with a rehearsed rollback; Production 26/26
with a per-user census showing no visibility change across all 22 accounts.

🛑 **`learn` is NOT in Production's Exposed schemas** — deliberate. `learn.*` cannot be reached from
the browser until that step is taken, and taking it makes the rollback file's Exposed-schemas
pre-step mandatory (an exposed-but-missing schema 503s the **entire** Data API — measured on
staging).

Records: `docs/learn/IDENTITY_SPINE_STAGING_RESULTS.md` · `docs/learn/IDENTITY_SPINE_PRODUCTION_PLAN.md`
