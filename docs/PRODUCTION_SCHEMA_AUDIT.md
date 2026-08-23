# Production Schema Audit — Phase 0.5A

> **Audit date**: 2026-08-23
> **Scope**: Production Supabase discovery for `nonstopjazz/mock-exam-ace`
> **Branch**: `claude/gsat-platform-audit-wiz5rt`
> **Predecessor**: `docs/PLATFORM_AUDIT.md` (Phase 0, repository-only)
> **Evidence round 1**: Q15 (functions), Q07 (RLS policies), Q10 (grants), Q19 + Q29 (unaccounted tables) — supplied 2026-08-23
>
> **Guardrails honoured**: no application code modified, no schema modified, no migration created or
> applied, no RLS altered, no function/trigger altered, no storage policy altered, no table created or
> deleted, no Production data changed, `/exam` untouched, no Teacher/Student/Parent UI built, no
> Learning Activity or Writing tables created. **All Production interaction was READ-ONLY metadata
> inspection.**

---

## 1. Executive Summary

Four Q-queries came back and they change the picture substantially. **Phase 0.5A is now partially
complete**: the security questions are answered, the writing application is located, and three
predictions are settled — one confirmed, two refuted.

### 1.1 The headline

> 🔴 **ELEVEN tables in `public` have Row Level Security DISABLED while `anon` and `authenticated`
> hold full `SELECT, INSERT, UPDATE, DELETE, TRUNCATE` grants.** They include `public.users`,
> `student_tasks` (32 rows), `assignments`, and `assignment_submissions`.
>
> ✅ CONFIRMED IN PRODUCTION (Q29 `rls_enabled=false` + Q10 grants + Q07 shows zero policies).
>
> **Anyone holding the public anon key — which ships in the browser bundle of every deployed site —
> can read, modify, and delete every row in these tables.** No login required.

This is more severe than anything in the previous two audits and it displaces `admin_grant_premium`
as the top priority.

### 1.2 What else landed

| # | Finding | Status |
|---|---------|--------|
| 1 | 11 tables: RLS off + full anon grants (incl. `public.users`) | 🔴 **CRITICAL — CONFIRMED** |
| 2 | `essays` storage bucket: world-readable; any authenticated user can overwrite/delete any file | 🔴 **CRITICAL — CONFIRMED** |
| 3 | `admin_grant_premium` / `admin_revoke_premium`: no authorization check, `EXECUTE` granted to **PUBLIC (incl. anon)** | 🔴 **CRITICAL — CONFIRMED** (worse than predicted) |
| 4 | `invite_tokens` enumerable by anon | 🟠 **HIGH — CONFIRMED** |
| 5 | **The writing application is `essay_submissions` (86 rows, 560 kB) + the `essays` bucket** | ✅ **LOCATED** |
| 6 | **An assignment / course / student-task system already exists in this database** | ✅ **LOCATED — supersedes Phase 0** |
| 7 | `claim_pack_with_token`: premium-checking version is live; **`site` is never written** | ✅ **RESOLVED** |
| 8 | **FOUR** parallel admin authorization mechanisms, not three | 🟠 **HIGH — CONFIRMED, worse** |
| 9 | `site_settings` UPDATE **is** admin-restricted | 🟢 **REFUTED — good news** |
| 10 | `search_path`: Production is **partially hardened** — 6 functions lack it, not 19 | 🟡 **MY EARLIER SCOPE WAS WRONG — corrected in §9.7** |

### 1.3 Corrections to my own prior work

Three statements in earlier documents need correcting, and two matter for planning:

1. **`docs/PLATFORM_AUDIT.md` §7 said assignment management, class, and teacher concepts "do not
   exist."** That was repository-scoped and is now **superseded**: `assignments`,
   `assignment_submissions`, `student_tasks`, `courses`, `course_lessons`, `user_course_access`,
   `user_lesson_progress`, and `learning_progress_stats` all exist in this database. Phase 4 planning
   must start from these, not from a blank sheet.
2. **`PRODUCTION_SCHEMA_AUDIT.md` §9.7 (previous revision) claimed all 19 `SECURITY DEFINER`
   functions lack `SET search_path`.** True of the repository; **false of Production**, which has been
   hardened out-of-band for most functions. Only 6 remain unhardened. Scope corrected in §9.7.
3. **§9.4 predicted `site_settings` might be globally writable.** Production restricts UPDATE to
   `app_admins`. Downgraded to LOW.

### 1.4 Readiness

**Phase 1 still must not begin** — but the blocker has shifted. It is no longer "we don't know";
it is now **"there is confirmed critical exposure that must be closed first"**, plus a materially
larger design surface than assumed (§14).

---

## 2. Production Database Inventory

**Round 1 gave us the table list via Q29 + Q10 + Q07. Q01/Q02/Q03/Q04 were not supplied**, so
columns, constraints and indexes remain unknown. What follows is confirmed *existence* and, where
Q29 reported it, *RLS state and row estimates*.

### 2.1 ✅ CONFIRMED: tables that exist in Production

**GSAT-repo tables (confirmed present via Q07 policies and/or Q10 grants):**
`packs`, `pack_items`, `pack_images`, `pack_item_progress`, `invite_tokens`, `user_pack_claims`,
`user_profiles`, `user_stats`, `user_word_progress`, `level_words`, `premium_memberships`,
`push_subscriptions`, **`app_admins` (exists — Q07/Q10)**, `site_settings`, `exams`,
`vocabulary_questions`, `question_groups`, `group_questions`, `translation_questions`,
`essay_questions`, `exam_attempts`, `exam_user_answers`, `blog_posts`, `blog_categories`,
`blog_likes`, `blog_bookmarks`, `blog_shares`, `blog_page_views`

### 2.2 🔴 CONFIRMED: 22 tables in Production that the GSAT repository never references

Q29. **This is roughly 40% of the database that no repository in scope describes.**

| Table | RLS | Approx rows | Size | Has any RLS policy? (Q07) |
|-------|-----|-------------|------|---------------------------|
| **`users`** | ❌ **false** | — | 80 kB | ❌ none |
| **`assignments`** | ❌ **false** | — | 40 kB | ❌ none |
| **`assignment_submissions`** | ❌ **false** | — | 32 kB | ❌ none |
| **`student_tasks`** | ❌ **false** | **32** | 96 kB | ❌ none |
| **`courses`** | ❌ **false** | — | 32 kB | ❌ none |
| **`course_lessons`** | ❌ **false** | — | 64 kB | ❌ none |
| **`user_course_access`** | ❌ **false** | — | 48 kB | ❌ none |
| **`learning_progress_stats`** | ❌ **false** | — | 32 kB | ❌ none |
| **`vocabulary_sessions`** | ❌ **false** | — | 96 kB | ❌ none |
| **`exam_records`** | ❌ **false** | — | 48 kB | ❌ none |
| **`exam_types`** | ❌ **false** | **9** | 64 kB | ❌ none |
| `essay_submissions` | ✅ true | **86** | **560 kB** | ✅ 3 policies |
| `course_requests` | ✅ true | 17 | 112 kB | ✅ 2 policies |
| `notifications` | ✅ true | 35 | 112 kB | ✅ 3 policies |
| `user_lesson_progress` | ✅ true | 21 | 112 kB | ✅ 2 policies |
| `admin_course_reminders` | ✅ true | 5 | 96 kB | ✅ 1 policy |
| `user_reminder_preferences` | ✅ true | 5 | 80 kB | ✅ 1 policy |
| `tokens` | ✅ true | 3 | 72 kB | ✅ 1 policy |
| `blog_comments` | ✅ true | 0 | 24 kB | ✅ 4 policies |
| `file_download_logs` | ✅ true | 0 | 48 kB | ✅ 2 policies |
| `grammar_tags` | ✅ true | 0 | 32 kB | ✅ 1 policy |
| `reminder_logs` | ✅ true | 0 | 40 kB | ✅ 2 policies |

**The first eleven rows are the CRITICAL finding (§9.1).**

### 2.3 ❓ Still unknown after round 1

- Columns, data types, nullability, defaults for **every** table (Q02)
- Primary keys, foreign keys, unique and check constraints (Q03)
- Indexes — including whether the `COALESCE` UNIQUE INDEX exists (Q04)
- **RLS enabled/disabled state for the GSAT tables** (Q01/Q08) — ⚠️ Q07 shows policies exist, but
  **a policy on a table with RLS disabled is inert**. Until Q08 runs, we cannot assert that any GSAT
  table is actually protected.
- Views vs tables for `exam_statistics` / `blog_post_stats` (Q05)
- Triggers, including on `auth.users` (Q17)
- FKs to `auth.users` (Q18)
- Storage buckets and their public flags (Q24)
- Exact row counts (Q32)

---

## 3. Auth / Identity Model

### 3.1 ✅ CONFIRMED

- **`app_admins` exists**, with exactly one policy: `SELECT USING (auth.uid() = user_id)` — a user can
  read only their own row. This is why `site_settings`'s admin check works: the `EXISTS` subquery runs
  under the caller's RLS, so it functions as a self-check.
- **`is_admin()` is a hard-coded email comparison** against `nonstopjazz@gmail.com`, with
  `SET search_path TO 'public'`.
- **A `public.users` table exists** — separate from `auth.users`, with **RLS disabled** and full anon
  grants. Its relationship to `auth.users` is unknown (Q18 needed). It is not referenced by the GSAT
  repository.

### 3.2 🔴 CONFIRMED: FOUR parallel admin authorization mechanisms

My earlier audits said three. Production has four:

| # | Mechanism | Where used | Evidence |
|---|-----------|------------|----------|
| 1 | `is_admin()` → hard-coded email | `packs`, `pack_items`, `pack_images`, `user_pack_claims`, `invite_tokens`, `premium_memberships`, storage `pack-images` | Q07, Q15 |
| 2 | `app_admins` table membership | **`site_settings` UPDATE only** | Q07 |
| 3 | `auth.jwt() ->> 'email' = 'nonstopjazz@gmail.com'` (inline JWT claim) | `blog_posts`, `blog_categories`, storage `blog-images` | Q07 |
| 4 | **`auth.users.raw_user_meta_data ->> 'role' = 'admin'`** 🆕 | `admin_course_reminders`, `reminder_logs` | Q07 |

**Mechanism 4 is new information** and it is the most concerning of the four: it reads a role claim
from user metadata. `raw_user_meta_data` is populated from the `data` field at sign-up and is
**user-supplied on some Supabase auth paths**. ❓ Whether a user can set `role: admin` on themselves in
this project's configuration is **NOT YET CONFIRMED** and needs targeted testing — but it is a
recognised Supabase anti-pattern and should be treated as suspect until proven otherwise.

**Consequence for Phase 1:** the plan to converge everything onto `is_admin()` (reading `user_roles`)
now has **four** call-sites families to absorb, not one. The good news is unchanged: because
`is_admin()`'s signature stays fixed, mechanism 1 converges for free.

### 3.3 ❓ Still unknown

`auth.users` triggers (Q17), FKs to `auth.users` (Q18), the role of `public.users`, `auth.users`
counts (Q22), providers (Q23), and how many users lack a `user_profiles` row.

---

## 4. RLS Audit

### 4.1 🔴 CRITICAL — RLS disabled with full public grants

Q10 shows that **every** table in `public` grants `DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
TRUNCATE, UPDATE` to both `anon` and `authenticated`. That is the Supabase default and is normally
harmless **because RLS is the gate**. For these eleven tables there is no gate:

```
users, assignments, assignment_submissions, student_tasks, courses,
course_lessons, user_course_access, learning_progress_stats,
vocabulary_sessions, exam_records, exam_types
```

`rls_enabled = false` (Q29) + full anon grant (Q10) + zero policies (Q07) = **unrestricted public
read and write**. See §9.1.

### 4.2 🟠 CONFIRMED — `invite_tokens` is enumerable

Two overlapping `SELECT` policies exist, both `PERMISSIVE` (therefore OR'd):

| Policy | USING |
|--------|-------|
| `Anyone can validate tokens` | `(is_active = true)` |
| `Logged in users can lookup active tokens` | `(auth.uid() IS NOT NULL) AND is_active AND not-expired AND not-exhausted` |

The first requires no authentication. With `anon` holding `SELECT` (Q10), **any visitor can list every
active invite token**, including codes for `is_premium` packs. The second policy is redundant — it can
never grant access the first doesn't already grant. See §9.4.

**The same pattern exists on the separate `tokens` table**: `Anyone can read active tokens
USING (is_active = true)`, 3 rows.

### 4.3 🟢 REFUTED — `site_settings` is adequately protected

```
Anyone can read site settings   SELECT  USING (true)
Admins can update site settings UPDATE  USING (EXISTS(SELECT 1 FROM app_admins WHERE user_id = auth.uid()))
```

My earlier HIGH finding predicted possible global-config tampering. **Production restricts UPDATE to
`app_admins` membership.** Public SELECT is correct — `PhaseContext` reads phase before login.

Two residual notes: there is **no INSERT and no DELETE policy** (deny-by-default *if* RLS is enabled —
⚠️ **needs Q08 to confirm**), and this is the sole consumer of mechanism 2 in §3.2.

### 4.4 ✅ Confirmed-sound policies

`user_profiles`, `user_stats`, `user_word_progress`, `pack_item_progress`, `push_subscriptions`,
`user_pack_claims`, `blog_bookmarks`, `blog_likes`, `course_requests`, `notifications`,
`user_lesson_progress`, `user_reminder_preferences` all correctly scope to `auth.uid() = user_id`.

The GSAT exam tables are correctly gated on publication status:
`exams` → `status = 'published'`; `vocabulary_questions` / `question_groups` / `group_questions` /
`translation_questions` / `essay_questions` → `EXISTS(... exams.status = 'published')`.
`exam_attempts` and `exam_user_answers` correctly scope to the owning user, with
`exam_user_answers` chaining through `exam_attempts`. **This is a good design** — it means §8's
reserved domain is safe to connect later without an RLS rewrite. ⚠️ Subject to Q08 confirming RLS is on.

### 4.5 ⚠️ Observations worth noting

- `blog_page_views` and `blog_shares` allow `INSERT WITH CHECK (true)` from anyone — acceptable for
  analytics beacons, but unbounded (spam/inflation vector, LOW).
- `notifications` has `Service role can insert notifications INSERT WITH CHECK (true)` applying to
  role `{public}` — **the policy name says service-role but the policy applies to everyone**. Any user
  can insert arbitrary notifications for any user. MEDIUM (§9.8).
- `user_lesson_progress` has an `ALL` policy plus a redundant `SELECT` policy.
- Every policy in the database applies to `{public}` rather than `{authenticated}`, except the four
  `essays` storage policies. Not a vulnerability by itself (the `auth.uid()` test does the work), but
  it means `anon` evaluates every policy, so any policy lacking an `auth.uid()` test is anon-exposed.

---

## 5. PostgreSQL Functions / RPC Audit

### 5.1 ✅ RESOLVED — `claim_pack_with_token`: which version is live

**Both overloads exist in Production** (Q15), confirming the C2 ambiguity is real.

| Signature | `search_path` | Premium check | Writes `site`? |
|-----------|---------------|---------------|----------------|
| `(p_token text)` | `public` | ❌ No | ❌ No |
| `(p_token text, p_site text DEFAULT NULL)` | ❌ **none** | ✅ **Yes** — `is_premium_member()` | ❌ **No** |

**Answering Task 3's four required questions definitively:**

1. **Which behaviour does Production have?** The **`add_premium_memberships.sql` version won.**
2. **Does it check premium eligibility?** ✅ **Yes** — `IF v_pack_record.is_premium AND NOT
   is_premium_member(v_user_id) THEN RETURN 'PREMIUM_REQUIRED'`.
3. **Does it write `site`?** ❌ **No.** The INSERT is
   `insert into user_pack_claims (user_id, pack_id, claimed_via_token)` — `site` is absent, and the
   duplicate check is `WHERE user_id AND pack_id` with **no site predicate**. The `p_site` parameter
   is **accepted and then never referenced anywhere in the body.**
4. **Can repository migration history reproduce the live function?** ✅ **Yes** — the live 2-arg body
   matches `add_premium_memberships.sql` verbatim. So `add_premium_memberships.sql` was applied
   *after* `add_site_to_user_pack_claims.sql`, consistent with alphabetical filename ordering.

**Live consequence — this is the confirmed defect (my hypothesis (b)):**
`user_pack_claims.site` always falls back to its column `DEFAULT 'gsat'` regardless of which site the
user claimed from. Because `useUserPacks.ts` filters with `.eq('site', currentSite)`, **a pack claimed
from the TOEIC or Kids site is written as `'gsat'` and then becomes invisible to the very site the
user claimed it on.** Multi-site pack claiming is broken in Production today.

### 5.2 🔴 CONFIRMED — the two premium functions are worse than predicted

```sql
CREATE OR REPLACE FUNCTION public.admin_grant_premium(p_user_id uuid, p_expires_at ..., p_notes ...)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER      -- ← no SET search_path
AS $function$
DECLARE v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();                          -- ← recorded only, never checked
  INSERT INTO premium_memberships (user_id, expires_at, granted_by, notes)
  VALUES (p_user_id, p_expires_at, v_admin_id, p_notes);
  RETURN json_build_object('success', true);
END; $function$
```

`admin_revoke_premium` is worse still — it does not even call `auth.uid()`:

```sql
BEGIN
  UPDATE premium_memberships SET is_active = false WHERE id = p_membership_id;
  RETURN json_build_object('success', true);
END;
```

**And the `execute_acl` for both is:**
```
{=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
```

The leading `=X/postgres` grants `EXECUTE` to **PUBLIC**. Combined with an explicit `anon=X`, this
means **an unauthenticated caller can invoke both functions.** For `admin_grant_premium` called
anonymously, `auth.uid()` returns NULL, so the row is inserted with `granted_by = NULL` — the grant
still succeeds. See §9.3.

### 5.3 ✅ CONFIRMED — the three previously-unknown RPCs

All three exist, all `SECURITY DEFINER` with `SET search_path TO 'public'`:

- **`update_pack_item_progress`** — server-side SRS. Intervals `[0, 10, 1440, 4320, 10080, 20160]`
  minutes, mastery capped at **`LEAST(5, …)`**.
- **`get_pack_statistics`** — "mastered" defined as **`mastery_level >= 4`**.
- **`get_weak_words`** — weak = `mastery_level IS NULL OR < 3 OR accuracy < 0.6`.

🔴 **This confirms and sharpens Phase 0 finding C3 (two divergent SRS systems):**

| | Level words (`user_word_progress`) | Pack items (`pack_item_progress`) |
|---|---|---|
| Where SRS is computed | **Client** (`vocabularyStore.ts`) | **Server** (`update_pack_item_progress`) |
| Mastery cap | **6** | **5** |
| "Mastered" threshold | 4 *or* 5 (inconsistent in client) | **4** |
| Time column | `next_review_time BIGINT` (Unix ms) | `next_review_at TIMESTAMPTZ` |

Both systems track pack items. The numbers do not line up, so pack progress reads differently
depending on which path wrote it.

### 5.4 🔴 NEW — `upsert_word_progress` has a broken 6-arg overload

Both overloads exist:

- **6-arg** (`p_word_id … p_last_review_time`) — `ON CONFLICT (user_id, word_id)`
- **8-arg** (`… p_source, p_pack_id`) — `ON CONFLICT (user_id, word_id, source, COALESCE(pack_id, …))`

`unify_word_progress_tracking.sql` **dropped** the `user_id, word_id` unique constraint and replaced it
with the `COALESCE` expression index. **The 6-arg overload's conflict target therefore no longer
exists**, so any call to it fails at runtime with *"there is no unique or exclusion constraint matching
the ON CONFLICT specification"*.

`wordProgressSync.ts` always passes 8 arguments, so the live path is safe. But the broken overload is
a live landmine: any future 6-argument call — or a `p_source`/`p_pack_id` omission — errors out. See
§9.9.

### 5.5 ✅ Function `search_path` status — my earlier scope was wrong

Production is **partially hardened**, contradicting the repository. Of the 18 function rows returned:

**Hardened (`SET search_path TO 'public'`) — 12:** `admin_get_all_users`, `admin_get_user_stats`,
`claim_pack_with_token(text)`, `generate_short_token`, `get_pack_statistics`, `get_user_profile`,
`get_user_stats`, `get_weak_words`, `is_admin`, `update_pack_item_progress`, `update_user_streak`,
`upsert_user_profile`, `upsert_word_progress(6-arg)`

**NOT hardened — 6:**
`admin_grant_premium`, `admin_revoke_premium`, `claim_pack_with_token(text,text)`,
`get_all_word_progress`, `is_premium_member`, `upsert_word_progress(8-arg)`

Note the unhappy overlap: **the two ungated admin functions and the live 2-arg claim function are all
in the unhardened set.** Corrected finding in §9.7.

---

## 6. Storage Audit

**Q24/Q25/Q26 were not supplied, but Q07 returned the `storage.objects` policies** — which is the part
that matters most, and it contains a critical finding.

### 6.1 🔴 CONFIRMED — the `essays` bucket is effectively public and mutable by anyone logged in

| Policy | Role | Command | Expression |
|--------|------|---------|------------|
| `essays_select_policy` | **`{public}`** | SELECT | `bucket_id = 'essays'` |
| `essays_insert_policy` | `{authenticated}` | INSERT | `bucket_id = 'essays'` |
| `essays_update_policy` | `{authenticated}` | UPDATE | `bucket_id = 'essays'` |
| `essays_delete_policy` | `{authenticated}` | DELETE | `bucket_id = 'essays'` |

**There is no owner predicate on any of them.** Not `owner = auth.uid()`, not a
`storage.foldername(name)[1] = auth.uid()::text` path check — nothing but the bucket name.

Consequences, all confirmed:
- **Any visitor, logged in or not, can list and download every file in `essays`.**
- **Any authenticated user can overwrite or delete any other student's essay file.**

Given `essay_submissions` holds 86 rows / 560 kB of real student work (§7), this is student-work
exposure and a destructive-write path. See §9.2.

Contrast with the correctly-written pack-image policies in the same table, which do carry a predicate:
`(bucket_id = 'pack-images') AND is_admin()`.

### 6.2 ✅ Confirmed buckets (from policy evidence)

`blog-images` (public read; admin write via mechanism 3), `pack-images` (authenticated read; admin
write via `is_admin()`), **`essays`** (§6.1).

❓ **`pack-audio` and `exam-images` have NO policies in Q07.** Either they are public buckets (bypassing
`storage.objects` RLS for reads) or they are write-only via `service_role`. **Q24 is required** to
determine their `public` flag.

---

## 7. Existing Writing Application Discovery

### 7.1 ✅ LOCATED

| Object | Evidence | Detail |
|--------|----------|--------|
| **`essay_submissions`** | Q29, Q07 | **86 rows, 560 kB**, RLS enabled, 3 policies |
| **`essays` storage bucket** | Q07 | 4 policies, all missing owner checks (§6.1) |

**RLS policies on `essay_submissions`:**

```
Students can view own essays    SELECT  USING      ((auth.uid())::text = (student_id)::text)
Students can insert own essays  INSERT  WITH CHECK ((auth.uid())::text = (student_id)::text)
Students can update own essays  UPDATE  USING/CHECK((auth.uid())::text = (student_id)::text)
```

**Three things this tells us:**

1. **`student_id` is cast to `text` on both sides** — strongly suggesting the column is `TEXT` or
   `VARCHAR`, **not `UUID`**. ❓ Needs Q02. If so, there is no FK to `auth.users` and referential
   integrity is absent — which matters a lot for Phase 5 integration.
2. **There is no DELETE policy** — students cannot delete submissions (deny-by-default). Possibly
   deliberate.
3. 🔴 **There is no teacher/admin read policy.** Nobody except the authoring student can read an essay
   through RLS today. **Any teacher-facing or AI-grading read path must therefore be running through
   `service_role`** (an Edge Function or server), or reading files directly from the world-readable
   `essays` bucket (§6.1). This is a central open question for Phase 5.

### 7.2 Concept coverage — updated

| Concept | Found? | Where | Notes |
|---------|--------|-------|-------|
| writing submissions | ✅ **Yes** | `essay_submissions` (86 rows) | Column shape unknown |
| essay text | ❓ Probable | `essay_submissions` | Needs Q02 |
| uploaded essay images | ✅ **Yes** | `essays` bucket | 🔴 world-readable |
| AI grading | ❓ Unknown | possibly a column on `essay_submissions` | Needs Q02/Q28 |
| rubric scores | ❓ Unknown | " | Needs Q02/Q28 |
| AI feedback | ❓ Unknown | " | Needs Q02/Q28 |
| teacher feedback | ❓ Unknown — **no teacher read policy exists** | — | Needs Q02 |
| revisions | ❓ Unknown | — | Needs Q02 |
| writing prompts | ❓ **Unresolved** | `essay_questions` (GSAT) vs something else | Needs Q02/Q03 |
| writing history | ❓ Unknown | — | Needs Q02 |

### 7.3 Reuse triage

| Object | 1. What it does | 2. Can GSAT reuse it? | 3. Missing info | 4. Would a later source/activity reference suffice? |
|--------|-----------------|-----------------------|-----------------|------------------------------------------------------|
| `essay_submissions` | Stores student essay submissions | **Very likely yes — this is exactly the table Phase 0 said was missing** | Columns (Q02); is `student_id` text or uuid; where AI feedback lives; whether it FKs `essay_questions` | ✅ **Probably.** Adding nullable `source`, `class_id`, `assignment_id`, `teacher_feedback` looks viable — **pending Q02** |
| `essays` bucket | Essay image/file uploads | Yes, once §9.2 is fixed | Public flag, path convention, size limits (Q24/Q26) | ✅ Yes — path convention can encode ownership |

**Standing constraint upheld: no replacement writing tables are proposed.** `essay_submissions` is the
reuse target. The remaining decision rests entirely on Q02/Q28.

### 7.4 🆕 A second unaccounted system: assignments / courses / student tasks

Q19 and Q29 surfaced a coherent cluster that is **not** the writing app and **not** the GSAT repo:

```
users · assignments · assignment_submissions · student_tasks (32 rows)
courses · course_lessons · user_course_access · user_lesson_progress (21 rows)
learning_progress_stats · vocabulary_sessions · exam_records · exam_types (9 rows)
course_requests (17) · admin_course_reminders (5) · user_reminder_preferences (5)
reminder_logs · notifications (35) · file_download_logs · grammar_tags · tokens (3)
```

This is **an assignment-and-course delivery system that already exists**, with live data. It directly
overlaps the Domain B feature list (assignment management, completion tracking, course progress,
vocabulary sessions, learning analytics).

> ❓ **NOT YET CONFIRMED:** whether this belongs to the writing app, an earlier version of this
> product, or a third application. **This must be answered before any Phase 1 or Phase 4 schema is
> designed** — otherwise we will build a second assignment system alongside a live one.

---

## 8. GSAT Mock Exam Domain

# ⚠️ RESERVED / DO NOT MODIFY DURING LEARNING PLATFORM DEVELOPMENT

Unchanged from the previous revision. Reserved objects: `exams`, `vocabulary_questions`,
`question_groups`, `group_questions`, `translation_questions`, `essay_questions`, `exam_attempts`,
`exam_user_answers`, `exam_statistics`, `exam-images`, and all `/exam*` routes and code.

### 8.1 ✅ Good news confirmed in round 1

The reserved domain's RLS is **well designed**: publication-gated reads on question tables, owner-scoped
`exam_attempts`, and `exam_user_answers` correctly chained through `exam_attempts`. **Rule 4 of §8.3 —
the opt-in RLS repair — is no longer needed.** ⚠️ Conditional on Q08 confirming RLS is enabled.

### 8.2 ⚠️ Boundary clarification made necessary by §7.4

`exam_records` and `exam_types` are **NOT** part of this reserved domain — they belong to the
unaccounted cluster and have **RLS disabled** (§9.1). Do not confuse them with `exams` /
`exam_attempts`. The naming collision is a real hazard for anyone working in this database.

---

## 9. Confirmed Security Findings

Findings are now genuinely **CONFIRMED IN PRODUCTION** unless marked otherwise.

---

### 9.1 Eleven tables: RLS disabled with full public read/write — **CRITICAL** ✅ CONFIRMED

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 None of these tables appear in the repository at all. No expectation existed. |
| **Production reality** | ✅ **CONFIRMED.** Q29: `rls_enabled = false` for `users`, `assignments`, `assignment_submissions`, `student_tasks`, `courses`, `course_lessons`, `user_course_access`, `learning_progress_stats`, `vocabulary_sessions`, `exam_records`, `exam_types`. Q10: `anon` and `authenticated` both hold `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`. Q07: **zero policies** on any of them. |
| **Impact** | **Unauthenticated total compromise of these tables.** The anon key ships in the browser bundle of every deployed site. Anyone can `SELECT *` from `public.users` (identity data), `student_tasks` (32 rows of live student work), `assignments`, `assignment_submissions`, and `learning_progress_stats` — and can equally `UPDATE`, `DELETE` or `TRUNCATE` them. If any of these hold student PII, this is a reportable personal-data exposure, and minors are plausibly involved. |
| **Affected objects** | The 11 tables above; `anon` and `authenticated` roles |
| **Recommended remediation** | ⚠️ **Do not simply `ENABLE ROW LEVEL SECURITY`** — with zero policies that switches the tables to deny-all and will break whichever application owns them. Correct order: **(1)** identify the owning application (§7.4); **(2)** with its maintainer, author policies mirroring the ownership model already used on `essay_submissions`/`user_lesson_progress`; **(3)** enable RLS and policies together in one transaction; **(4)** verify the owning app still works. If ownership cannot be established quickly, an emergency stop-gap is `REVOKE ALL ON <table> FROM anon;` — this closes anonymous access while leaving `authenticated` paths intact, and is far less likely to break a logged-in application. **Phase 0.5B item B0 — highest priority.** |

---

### 9.2 `essays` storage bucket — world-readable, any-user-writable — **CRITICAL** ✅ CONFIRMED

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 The repository does not know this bucket exists. |
| **Production reality** | ✅ **CONFIRMED (Q07, `storage.objects`).** `essays_select_policy` applies to `{public}` with `USING (bucket_id = 'essays')`. The insert/update/delete policies apply to `{authenticated}` with the same bucket-only predicate. **No policy contains an owner or path-ownership check.** |
| **Impact** | Any visitor can enumerate and download **every** essay file. Any authenticated user can overwrite or delete **any** other student's file. Paired with `essay_submissions` (86 real submissions), this is student-work exposure plus a destructive-write path. It may also be how teacher/AI read access is currently achieved (§7.1), so a naive fix could break grading. |
| **Affected objects** | `storage.objects` policies `essays_select_policy`, `essays_insert_policy`, `essays_update_policy`, `essays_delete_policy`; `essays` bucket; `public.essay_submissions` |
| **Recommended remediation** | Add an ownership predicate — conventionally `(storage.foldername(name))[1] = auth.uid()::text` — to insert/update/delete, and restrict select to owner plus an explicit teacher/admin path. **Before changing anything, confirm how the grading pipeline reads these files** (Q24 for the bucket's `public` flag, plus the writing app's server code). If the bucket itself is marked public, object policies are bypassed for reads and the bucket flag must change too. **Phase 0.5B — coordinate with the writing app's maintainer.** |

---

### 9.3 `admin_grant_premium` / `admin_revoke_premium` — no authorization, `EXECUTE` to PUBLIC — **CRITICAL** ✅ CONFIRMED

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 Predicted: `SECURITY DEFINER` with no `is_admin()` check; assumed reachable by authenticated users. |
| **Production reality** | ✅ **CONFIRMED, and worse than predicted.** Q15 full bodies contain no authorization branch — `admin_grant_premium` reads `auth.uid()` only to populate `granted_by`; `admin_revoke_premium` does not call it at all. `execute_acl` is `{=X/postgres, …, anon=X/postgres, authenticated=X/postgres, …}` — the leading `=X` grants EXECUTE to **PUBLIC**, and `anon` is granted explicitly. Neither function sets `search_path`. |
| **Impact** | **Any user — including an unauthenticated one — can grant permanent Premium to any user id**, or revoke any membership by id. Anonymous grants land with `granted_by = NULL`, which is also the audit signature to hunt for. Direct revenue loss and denial of paid service. |
| **Affected objects** | `public.admin_grant_premium`, `public.admin_revoke_premium`, `public.premium_memberships`, `public.claim_pack_with_token(text,text)` (premium branch), `src/pages/admin/UsersAdmin.tsx:140,158` |
| **Recommended remediation** | `CREATE OR REPLACE` both with an `IF NOT is_admin() THEN RETURN … 'UNAUTHORIZED'` guard **and** `SET search_path = public, pg_temp` — signatures unchanged, so `UsersAdmin.tsx` keeps working. Then `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC, anon;`. Finally audit `premium_memberships` for `granted_by IS NULL` or `granted_by = user_id` (optional query Q33). **Phase 0.5B — B1/B2.** |

---

### 9.4 `invite_tokens` (and `tokens`) enumerable by anon — **HIGH** ✅ CONFIRMED

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 `schema.sql` policy `"Anyone can validate tokens" USING (is_active = true)`. |
| **Production reality** | ✅ **CONFIRMED (Q07 + Q10).** The policy exists verbatim, applies to `{public}`, and `anon` holds `SELECT`. A second, redundant policy (`Logged in users can lookup active tokens`) is also PERMISSIVE and therefore cannot narrow it. The separate `tokens` table (3 rows) carries the identical pattern. |
| **Impact** | Any visitor can list every active invite token, including codes gating `is_premium` packs — bypassing the invite distribution model entirely. |
| **Affected objects** | `public.invite_tokens`, `public.tokens`, `src/pages/ClaimPack.tsx`, `src/pages/admin/TokensAdmin.tsx` |
| **Recommended remediation** | Drop `Anyone can validate tokens` and the redundant logged-in policy. Retain `Users can view own tokens` (owner) and `Admin full access` for `TokensAdmin`. Token validation already runs entirely inside the `SECURITY DEFINER` `claim_pack_with_token`, so no client needs blanket read. ⚠️ Confirm the writing app does not read `invite_tokens`/`tokens`. **Phase 0.5B — B6.** |

---

### 9.5 `claim_pack_with_token` silently ignores `p_site` — **HIGH** ✅ CONFIRMED (functional defect)

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 Two conflicting definitions; the live one unknown. |
| **Production reality** | ✅ **RESOLVED (Q15).** The premium-checking version is live. `p_site` is accepted and **never referenced**; the INSERT omits `site`; the duplicate check omits `site`. Both the 1-arg and 2-arg overloads exist. |
| **Impact** | Every claim writes `site` as the column default `'gsat'`. `useUserPacks.ts` filters `.eq('site', currentSite)`, so **a pack claimed on the TOEIC or Kids site immediately disappears from that site's UI**. Multi-site claiming is broken in Production now. The `UNIQUE(user_id, pack_id, site)` constraint is also never exercised as designed. Latent second issue: with both overloads present, a future 1-argument call raises `function is not unique`. |
| **Affected objects** | `public.claim_pack_with_token` (both arities), `public.user_pack_claims`, `src/pages/ClaimPack.tsx:64`, `src/hooks/useUserPacks.ts` |
| **Recommended remediation** | `CREATE OR REPLACE` the 2-arg version merging **both** guarantees: keep the premium check, restore `AND site = p_site` in the duplicate check, and add `site` to the INSERT. Add `SET search_path`. Consider dropping the 1-arg overload **only after** confirming no cross-application caller. ⚠️ Note this is a **behaviour change** — existing rows are already mis-tagged `'gsat'` and would need a separate, deliberate data-correction decision. **Phase 0.5B — B8.** |

---

### 9.6 Four parallel admin authorization systems — **HIGH** ✅ CONFIRMED

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 Three mechanisms predicted. |
| **Production reality** | ✅ **CONFIRMED — there are four** (§3.2). The fourth, `raw_user_meta_data ->> 'role' = 'admin'` on `admin_course_reminders` and `reminder_logs`, was not visible from the repository. |
| **Impact** | Adding a user to `app_admins` grants **only** `site_settings` UPDATE — nothing else. `is_admin()` remains a single hard-coded personal email, so no genuine second administrator can exist. Revoking admin requires touching four unrelated places, and it is easy to believe access was removed when it was not. **Additionally, mechanism 4 derives authority from user metadata**, which on some Supabase sign-up paths is user-influenced. ❓ Whether a user can self-assign `role: admin` in this project is **NOT YET CONFIRMED** and warrants targeted testing — if it is possible, mechanism 4 becomes CRITICAL. |
| **Affected objects** | `public.is_admin`, `public.app_admins`, `level_words` policies, `blog_posts`/`blog_categories` policies, `admin_course_reminders`/`reminder_logs` policies, `storage.objects` blog-image policies, `src/hooks/useAdmin.ts` |
| **Recommended remediation** | Phase 1: single `user_roles` source; `CREATE OR REPLACE FUNCTION is_admin()` reading it with **signature unchanged**, which converges mechanism 1 for free; then migrate mechanisms 2–4 onto `is_admin()`. **Test mechanism 4's self-assignability during Phase 0.5B.** |

---

### 9.7 Six `SECURITY DEFINER` functions lack `SET search_path` — **MEDIUM** ✅ CONFIRMED *(scope corrected)*

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 I previously reported **19 functions, zero hardened**, based on `grep -rn "search_path" supabase/` returning nothing. |
| **Production reality** | ✅ **CONFIRMED but narrower — my repository-derived scope was wrong.** Production has been hardened out-of-band: 12 of 18 functions carry `SET search_path TO 'public'`. **Six do not**: `admin_grant_premium`, `admin_revoke_premium`, `claim_pack_with_token(text,text)`, `get_all_word_progress`, `is_premium_member`, `upsert_word_progress(8-arg)`. |
| **Impact** | Classic `SECURITY DEFINER` escalation: unqualified identifiers resolve against the caller's `search_path`, so an attacker able to create objects in an earlier schema could shadow a table or operator and have it run with the owner's privileges. Exploitability depends on whether `authenticated` can create objects in any schema on the path — ❓ needs Q12 and the `public` schema `CREATE` grant, which is why this sits at MEDIUM rather than HIGH. The unhappy detail: the unhardened set contains precisely the two ungated admin functions and the live claim function. |
| **Affected objects** | The six functions above |
| **Recommended remediation** | `ALTER FUNCTION … SET search_path = public, pg_temp` on all six — behaviour-identical, no caller affected, and it folds naturally into the B1/B2/B8 rewrites. Also verify `REVOKE CREATE ON SCHEMA public FROM PUBLIC`. **Phase 0.5B — B5.** |

---

### 9.8 `notifications` insert policy applies to everyone — **MEDIUM** ✅ CONFIRMED

Q07: `Service role can insert notifications` — `roles = {public}`, `INSERT WITH CHECK (true)`. The name
claims service-role scope; the policy grants it to all, `anon` included. Any user can insert arbitrary
notifications addressed to any user. Read and update are correctly owner-scoped.
**Remediation:** restrict to `{service_role}`, or add `WITH CHECK (auth.uid() = user_id)`.

---

### 9.9 Broken `upsert_word_progress` 6-arg overload — **MEDIUM** ✅ CONFIRMED

Q15 shows both overloads. The 6-arg body's `ON CONFLICT (user_id, word_id)` targets a constraint that
`unify_word_progress_tracking.sql` dropped, so **any call to it fails at runtime**. The client always
passes 8 arguments, so the live path is unaffected — but it is a landmine for future callers and a
source of confusing errors. **Remediation:** `DROP FUNCTION public.upsert_word_progress(text, integer, bigint, integer, integer, bigint)`
after confirming no cross-application caller.

---

### 9.10 Divergent SRS semantics between the two progress systems — **MEDIUM** ✅ CONFIRMED

§5.3. Mastery caps (5 vs 6), "mastered" thresholds (4 vs 4-or-5), and time representations
(`TIMESTAMPTZ` vs Unix-ms `BIGINT`) all differ, while both systems track pack items.
**Remediation:** not a Phase 0.5B item — defer to Phase 3, where analytics forces the question.

---

### 9.11 TTS endpoints: `service_role`, no authentication — **CRITICAL** 📁 repository-confirmed

Unchanged from the previous revision. `api/generate-pack-audio.ts` and
`supabase/functions/generate-pack-audio/index.ts` both instantiate a `service_role` client with no
auth guard whatsoever; the Edge Function additionally sets `Access-Control-Allow-Origin: *`. Even if
`verify_jwt` is on, it only requires *some* valid JWT — no admin check exists in either body.
❓ Deployment state (is the route live? is the function deployed?) remains unconfirmed.
**Remediation:** require a caller JWT, assert `is_admin()`, rate-limit per pack, drop wildcard CORS,
and delete one of the two duplicate implementations. **Phase 0.5B — B3.**

---

### 9.12 Cron endpoint open when `CRON_SECRET` is unset — **HIGH** 📁 repository-confirmed

Unchanged. `api/send-daily-reminders.ts` guards with `if (cronSecret && …)`, so an unset secret skips
verification entirely; it also accepts `GET`. ❓ Whether `CRON_SECRET` is set in Vercel is unconfirmed.
**Remediation:** fail closed (`if (!cronSecret || …) return 401`), reject `GET`. **Phase 0.5B — B4.**

---

### 9.13 Lower-severity items (unchanged)

| # | Finding | Severity | Basis |
|---|---------|----------|-------|
| a | `/dashboard/result-summary` has no route gate | MEDIUM | 📁 repo |
| b | Invite tokens generated with `Math.random()` | MEDIUM | 📁 repo |
| c | `blog_page_views` / `blog_shares` accept unauthenticated inserts | LOW | ✅ Q07 |
| d | Dev-mode panel reachable in Production via `?devmode=true` | LOW | 📁 repo |
| e | Nine legacy admin routes gated only by `!IS_PRODUCTION` | LOW | 📁 repo |
| f | `.gitignore` omits `.env` (no secret ever committed) | INFORMATIONAL | 📁 repo |
| g | `site_settings` has no INSERT/DELETE policy | INFORMATIONAL | ✅ Q07 |

---

### 9.14 Findings summary

| # | Finding | Severity | Evidence |
|---|---------|----------|----------|
| 9.1 | 11 tables: RLS off + full anon grants | 🔴 **CRITICAL** | ✅ CONFIRMED |
| 9.2 | `essays` bucket world-readable / any-user-writable | 🔴 **CRITICAL** | ✅ CONFIRMED |
| 9.3 | Premium grant/revoke ungated, EXECUTE to PUBLIC | 🔴 **CRITICAL** | ✅ CONFIRMED |
| 9.11 | TTS endpoints `service_role`, no auth | 🔴 **CRITICAL** | 📁 repo |
| 9.4 | `invite_tokens` / `tokens` enumerable by anon | 🟠 HIGH | ✅ CONFIRMED |
| 9.5 | `claim_pack_with_token` ignores `p_site` | 🟠 HIGH | ✅ CONFIRMED |
| 9.6 | Four admin authorization systems | 🟠 HIGH | ✅ CONFIRMED |
| 9.12 | Cron endpoint open if secret unset | 🟠 HIGH | 📁 repo |
| 9.7 | 6 functions lack `search_path` | 🟡 MEDIUM | ✅ CONFIRMED |
| 9.8 | `notifications` insert open to all | 🟡 MEDIUM | ✅ CONFIRMED |
| 9.9 | Broken `upsert_word_progress` overload | 🟡 MEDIUM | ✅ CONFIRMED |
| 9.10 | Divergent SRS semantics | 🟡 MEDIUM | ✅ CONFIRMED |
| 9.13a–b | Route gate, weak token RNG | 🟡 MEDIUM | 📁 repo |
| 9.13c–g | Assorted | 🟢 LOW / INFO | mixed |

**Four CRITICAL and four HIGH findings outstanding.**

---

## 10. Repository vs Production Discrepancies

| # | Repository | Production | Verdict |
|---|-----------|------------|---------|
| 1 | 30 tables known | **~52 tables** — 22 unaccounted | 🔴 Repo describes ~60% of the database |
| 2 | `app_admins` unverifiable | ✅ Exists, one self-read SELECT policy | Resolved |
| 3 | `claim_pack_with_token` ambiguous | ✅ Premium version live; `p_site` ignored | Resolved (§9.5) |
| 4 | 3 RPCs undefined | ✅ All exist, all hardened | Resolved (§5.3) |
| 5 | Zero `search_path` anywhere | 12 of 18 hardened | **Production ahead of repo** |
| 6 | `site_settings` RLS unknown | ✅ UPDATE gated on `app_admins` | **Better than feared** |
| 7 | 3 admin mechanisms | **4** | Worse |
| 8 | No `GRANT` statements | Full CRUD to `anon`+`authenticated` on every `public` table | Confirmed — RLS is the only gate |
| 9 | 1 `upsert_word_progress` | **2 overloads**, one broken | New (§9.9) |
| 10 | No teacher/class/assignment concepts | **`assignments`, `assignment_submissions`, `student_tasks`, `courses`… exist with live data** | 🔴 **Phase 0 §7 superseded** |
| 11 | Writing app unknown | ✅ `essay_submissions` (86 rows) + `essays` bucket | Located (§7) |
| 12 | 4 storage buckets | ≥3 confirmed by policy; `essays` is new; `pack-audio`/`exam-images` have no policies | Partially resolved |

---

## 11. Objects Safe to Reuse

**Unchanged for frontend assets** (48 shadcn components, `AuthContext`, `RequireAdmin` pattern,
`PhaseGate`, `useAudioPlayer`, chart integration, `BatchUploadDialog`, push infrastructure,
`BlockNoteEditor`).

**Now confirmed reusable at the database layer:**

| Asset | Status |
|-------|--------|
| `essay_submissions` | ✅ **The Phase 5 reuse target.** Fix §9.2 first; then Q02 decides whether nullable additive columns suffice |
| GSAT exam-domain RLS | ✅ Well-designed — reserved, but a good pattern to imitate |
| Owner-scoped policies on `user_*`, `pack_item_progress`, `push_subscriptions` | ✅ Correct; use as the template for new tables |
| `invite_tokens` **pattern** (issue → claim → bind) | ✅ Still the right model for class invite codes — build a **new** table, don't overload the existing one |
| `premium_memberships` **pattern** (grant/expiry/revoke/notes) | ✅ Good template for teacher licensing |

**Must NOT be reused until ownership is established (§7.4):** `assignments`,
`assignment_submissions`, `student_tasks`, `courses`, `course_lessons`, `user_course_access`,
`user_lesson_progress`, `learning_progress_stats`, `vocabulary_sessions`, `users`.
They may be exactly what Domain B needs — or a dead prototype. **Do not build on them, and do not
duplicate them, until we know.**

---

## 12. Objects Requiring Further Investigation

| Priority | Object | Unknown | Blocks |
|----------|--------|---------|--------|
| 🔴 P0 | **Owner of the 22 unaccounted tables** | Which app writes them | §9.1 remediation; all of Phase 1/4 |
| 🔴 P0 | `essay_submissions` **columns** | AI feedback, rubric, teacher fields, `student_id` type | Phase 5 |
| 🔴 P0 | **RLS enabled/disabled for GSAT tables** | Q08 not yet run | Whether §4.4's "sound" policies are actually enforced |
| 🔴 P0 | How teachers/AI currently read essays | No teacher RLS policy exists | §9.2 fix could break grading |
| 🟠 P1 | Can a user self-assign `raw_user_meta_data.role = 'admin'`? | Untested | §9.6 severity |
| 🟠 P1 | `public.users` ↔ `auth.users` relationship | Q18 | Identity design |
| 🟠 P1 | `essays` / `pack-audio` / `exam-images` bucket public flags | Q24 | §9.2 fix correctness |
| 🟠 P1 | `auth.users` triggers | Q17 | Phase 1 profile auto-creation |
| 🟡 P2 | All columns/constraints/indexes | Q02/Q03/Q04 | Detailed design |
| 🟡 P2 | `CRON_SECRET`, Edge Function `verify_jwt` | Vercel/Supabase config | §9.11, §9.12 |

---

## 13. Phase 0.5B — Security Stabilization Proposal

> **PROPOSED ONLY — NOT EXECUTED.** No item below has been actioned.

### 13.1 Revised priority

The ordering has changed. **B0 is new and outranks everything.**

| # | Item | Finding | Gate | Risk |
|---|------|---------|------|------|
| **B0** | **Close the 11 RLS-disabled tables.** Establish ownership first; if that stalls, emergency `REVOKE ALL … FROM anon` | 9.1 | Ownership, or accept the revoke | 🔴 Enabling RLS blind **will** break the owning app — revoke-from-anon is the safer first move |
| **B0b** | **Fix `essays` bucket policies** — add ownership predicate | 9.2 | Confirm grading read path first | 🔴 Could break AI/teacher grading |
| **B1** | `is_admin()` guard + `search_path` on `admin_grant_premium` | 9.3 | none — confirmed | 🟢 None |
| **B2** | Same for `admin_revoke_premium` | 9.3 | none | 🟢 None |
| **B2b** | `REVOKE EXECUTE … FROM PUBLIC, anon` on both | 9.3 | none | 🟢 None |
| **B3** | Admin JWT verification on both TTS endpoints | 9.11 | none | 🟡 Blocks anonymous callers (intended) |
| **B4** | Fail-closed `CRON_SECRET`; reject `GET` | 9.12 | **Set the secret first** | 🟡 Cron breaks if unset |
| **B5** | `SET search_path` on the 6 unhardened functions | 9.7 | none | 🟢 None |
| **B6** | Restrict `invite_tokens` + `tokens` SELECT to owner/admin | 9.4 | Confirm no cross-app reader | 🟠 Could break an unknown consumer |
| **B7** | Restrict `notifications` INSERT | 9.8 | none | 🟢 Low |
| **B8** | Reconcile `claim_pack_with_token` (premium **+** site) | 9.5 | Decide on back-fixing mis-tagged rows | 🟠 Behaviour change |
| **B9** | Audit `premium_memberships` for `granted_by IS NULL` | 9.3 | none | 🟢 Read-only |
| **B10** | Drop broken 6-arg `upsert_word_progress` | 9.9 | Confirm no caller | 🟢 Low |
| **B11** | Test whether `raw_user_meta_data.role` is self-assignable | 9.6 | none | 🟢 Read-only test |
| **B12** | `crypto.getRandomValues()` tokens; `.gitignore` `.env`; dev-panel gate | 9.13 | none | 🟢 None |
| **B13** | *(opt-in)* Gate `/dashboard/result-summary`, legacy admin routes | 9.13a/e | ⚠️ reserved domain — needs approval | 🟢 None |
| ~~B14~~ | ~~Add RLS to `exam_attempts`~~ | — | **No longer needed** — already correct (§8.1) | — |

### 13.2 Suggested execution order

1. **B11, B9** — read-only intelligence, zero risk, informs B0 and §9.6 severity.
2. **B0 emergency revoke** — if ownership can't be established within a day, `REVOKE ALL … FROM anon`
   on the 11 tables. Closes anonymous access immediately with minimal breakage risk.
3. **B1, B2, B2b, B5** — the premium-function fixes and `search_path`. Confirmed, no gates, no callers
   affected.
4. **B3, B4, B12** — app-code only. Set `CRON_SECRET` before B4.
5. **B0 proper + B0b** — once ownership and the grading read path are known.
6. **B6, B7, B8, B10** — policy and function reconciliation.
7. **B13** — only with explicit approval (reserved domain).

### 13.3 Guardrails

No new tables, no new columns, no data migration. No signature changes. Staging first —
⚠️ **no staging project exists**; creating one is part of 0.5B. No `/exam` refactor, no mock-exam
behaviour change, no Teacher/Student/Parent UI.

---

## 14. Phase 1 Readiness Assessment

### Q1 — Is the Production schema sufficiently understood to design Teacher / Student / Parent / Class?

# ❌ NO — but the gap is now specific rather than total

Round 1 resolved the security and function questions. What blocks design is narrower and sharper:

1. 🔴 **An assignment / course / student-task system already exists** with live data (§7.4) and we do
   not know who owns it. Designing `classes` / `assignments` now risks building a **second** system
   beside a running one — the precise outcome "prefer reuse over replacement" exists to prevent.
2. 🔴 **`public.users` exists with RLS disabled** and its relationship to `auth.users` is unknown.
   Any identity design must account for it.
3. ❓ **Q19 found no `classes`, `teachers`, `parents` or `guardians` table** — so those genuinely do not
   exist and Phase 1 can design them freshly. `assignments` and `student_tasks` are the collision risk,
   not the class model.
4. ❓ Columns and FKs remain unknown across the board (Q02/Q03).

### Q2 — Is the Writing schema sufficiently understood to design integration?

# ❌ NO — but it is located, which is the hard part

`essay_submissions` (86 rows) and the `essays` bucket are found. Missing: the column list, whether
`student_id` is text or uuid, where AI feedback and rubric scores live, and **how teachers or the AI
grader read essays given that no teacher RLS policy exists**. **Q02 and Q28 on `essay_submissions`
would likely close this in a single query.**

### Q3 — Are there unresolved blockers?

# ✅ YES — FIVE (one cleared, two new)

| # | Blocker | Clears when |
|---|---------|-------------|
| ~~BL-1~~ | ~~No Production access~~ | ✅ **CLEARED** |
| **BL-2** | **Four CRITICAL findings live in Production** (§9.1, §9.2, §9.3, §9.11) | Phase 0.5B |
| **BL-3** | 🆕 **Ownership of the 22 unaccounted tables unknown** | Ask the writing-app maintainer |
| **BL-4** | `essay_submissions` column shape unknown | Q02 / Q28 |
| **BL-5** | RLS enabled-state for GSAT tables unverified | Q08 |
| **BL-6** | No staging environment | Phase 0.5B |

### Q4 — Is it safe to begin Phase 1?

# ❌ NO — DO NOT BEGIN PHASE 1

The reasoning has changed shape. It is no longer "we're working blind." It is:

1. **There is confirmed, live, unauthenticated read/write exposure** on eleven tables and one storage
   bucket, including student work. Building new features on top of that is the wrong order of
   operations.
2. **A live assignment system may already exist.** Phase 1 and Phase 4 designs could duplicate it.
   One conversation with the writing-app maintainer likely resolves this.
3. **The `is_admin()` convergence plan still holds and is now better understood** — but it must absorb
   four mechanisms, one of which (`raw_user_meta_data.role`) may itself be a privilege-escalation path
   that needs testing first.

**Revised path to readiness:**

```
1. B11 + B9              read-only tests: metadata-role self-assignment, premium grant audit
2. B0 emergency revoke   close anonymous access to the 11 exposed tables
3. Ask the writing-app maintainer: who owns the 22 tables? how are essays read?
4. Run round 2 discovery (Q01, Q02, Q03, Q08, Q17, Q18, Q24, Q27, Q28, Q30)
5. Complete Phase 0.5B
6. Create a staging project
7. → Phase 1 becomes safe to begin
```

Steps 1–2 are hours, not days, and materially reduce live risk. **Step 3 is a conversation, not an
engineering task, and it unblocks more design work than any query.**

---

## Appendix A — Deliverables

| File | Status |
|------|--------|
| `docs/PRODUCTION_SCHEMA_AUDIT.md` | ✅ Updated with round-1 confirmed findings |
| `docs/discovery/production_discovery.sql` | ✅ Round 1 (validated) |
| `docs/discovery/production_discovery_round2.sql` | ✅ **New** — targeted follow-up for the remaining gaps |
| `docs/discovery/README.md` | ✅ Updated |
| `docs/PLATFORM_AUDIT.md` | Unchanged — see §1.3 for superseded claims |

## Appendix B — Guardrail Compliance

| Guardrail | Status |
|-----------|--------|
| DO NOT modify application code | ✅ Zero source files touched |
| DO NOT modify Supabase schema / RLS / functions / triggers / storage policies | ✅ Read-only metadata inspection only |
| DO NOT create or apply migrations | ✅ `supabase/migrations/` untouched; discovery SQL lives in `docs/discovery/` and is `SELECT`-only |
| DO NOT create or delete tables | ✅ None |
| DO NOT change production data | ✅ None |
| DO NOT refactor `/exam` / change mock exam behaviour | ✅ Untouched; reserved in §8 |
| DO NOT build Teacher / Student / Parent UI | ✅ None |
| DO NOT create Learning Activity or Writing tables | ✅ None |
| Only documentation files added/modified | ✅ All under `docs/` |
