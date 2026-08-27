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
| **Identity migration / consolidation** | Blocked on the identity-root question: do the LMS `student_id` columns reference `auth.users.id` or `public.users.id`? 🛑 **Do not create `user_roles` or any new role table before that is settled.** See the identity architecture checkpoint |

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
