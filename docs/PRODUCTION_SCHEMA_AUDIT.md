# Production Schema Audit — Phase 0.5A

> **Audit date**: 2026-08-23
> **Scope**: Production Supabase discovery for `nonstopjazz/mock-exam-ace`
> **Branch**: `claude/gsat-platform-audit-wiz5rt`
> **Predecessor**: `docs/PLATFORM_AUDIT.md` (Phase 0, repository-only)
> **Evidence**: Round 1 — Q07, Q10, Q15, Q19, Q29 · Round 2 — Q08, Q18, Q20, Q24, Q27, Q28
>
> **Guardrails honoured**: no application code modified, no schema modified, no migration created or
> applied, no RLS altered, no function/trigger altered, no storage policy altered, no table created or
> deleted, no Production data changed, `/exam` untouched, no Teacher/Student/Parent UI built, no
> Learning Activity or Writing tables created. **All Production interaction was READ-ONLY metadata
> inspection. No privilege escalation was attempted and no metadata was mutated.**

---

## 1. Executive Summary

Eleven discovery queries are now analysed. The security picture is settled, the writing model is
**confirmed and reusable**, and the identity model turns out to be **fragmented in a way that
invalidates the previously planned Phase 1 approach**.

### 1.1 The three findings that matter most

> 🔴 **1. Eleven `public` tables run with RLS disabled and full `anon` CRUD grants.**
> Q08 independently confirms the Q29 list. These are LMS/Writing-owned tables — `users`,
> `assignments`, `assignment_submissions`, `student_tasks`, `courses`, `course_lessons`,
> `user_course_access`, `learning_progress_stats`, `vocabulary_sessions`, `exam_records`,
> `exam_types`. **Deferred to Phase 0.5B-B** — remediating them without caller analysis would break
> the other application.

> 🔴 **2. All eight storage buckets are `public = true`** (Q24), including **two** essay buckets
> (`essays` and `Essays`) and two the repository has never heard of (`pack-covers`, `tts`).
> A public bucket serves objects over an unauthenticated URL, which **bypasses object-level SELECT
> policies entirely**. The `essays_select_policy` analysis in the previous revision was therefore
> understating the problem: the bucket flag alone makes every essay file publicly readable.

> 🔴 **3. The identity model has three unlinked anchors.** `public.users` carries app-level `role`
> (default `'student'`) and `is_admin`, but Q18 shows **no foreign key to `auth.users`**.
> `user_profiles` does have one. The LMS tables' `student_id uuid` columns have **no FK to
> `auth.users` either**. So there are at least two candidate identity roots and no enforced link
> between them. **This is why `user_roles` must not be created yet** (§3.4).

### 1.2 Status of every prediction

| # | Finding | Status |
|---|---------|--------|
| 1 | 11 tables: RLS off + full anon grants | 🔴 CRITICAL — **CONFIRMED twice** (Q29, Q08) |
| 2 | All 8 storage buckets public, incl. `essays` + `Essays` | 🔴 CRITICAL — **CONFIRMED, worse than described** |
| 3 | Premium grant/revoke ungated, `EXECUTE` to PUBLIC + anon | 🔴 CRITICAL — CONFIRMED |
| 4 | TTS endpoints: `service_role`, no auth | 🔴 CRITICAL — repository-confirmed |
| 5 | `invite_tokens` anon-enumerable | 🟠 HIGH — CONFIRMED |
| 6 | `claim_pack_with_token` ignores `p_site` | 🟠 HIGH — CONFIRMED |
| 7 | Four parallel admin authorization mechanisms | 🟠 HIGH — CONFIRMED |
| 8 | Cron endpoint open when `CRON_SECRET` unset | 🟠 HIGH — repository-confirmed |
| 9 | **Identity model fragmented — `public.users` has no FK to `auth.users`** | 🟠 HIGH — **NEW (Q18/Q20)** |
| 10 | 6 functions lack pinned `search_path` | 🟡 MEDIUM — CONFIRMED |
| 11 | `site_settings` globally writable | 🟢 **REFUTED** — admin-gated |
| 12 | GSAT exam-domain RLS unsafe | 🟢 **REFUTED** — correct and acceptable |

### 1.3 Writing model — recommendation changed

# ✅ EXISTING WRITING MODEL CONFIRMED — REUSE / ADAPTER DESIGN REQUIRED

`essay_submissions` (86 rows, RLS on, commented 「學生作文提交記錄」) carries `essay_content`,
`essay_title`, `essay_topic`, `essay_topic_detail`, `essay_date`, `highlights jsonb`,
`image_thumbnail_url`, `score_content`, `submission_type`, `teacher_comment`, `student_notes`.
**Do not create a replacement writing table.** Details and the remaining unknowns in §7.

### 1.4 Corrections to my own earlier recommendations

Three, and I want them on the record:

1. **I previously recommended a blanket `REVOKE ALL … FROM anon` across all 11 tables as emergency
   containment. I am withdrawing that as a blanket action.** You are right to push back: those tables
   belong to an application whose anonymous flows I have not analysed, and a blanket revoke could take
   it down. It may still be appropriate **per-table, after confirming no anonymous flow depends on
   that specific table** — but it is not an approved blanket Production change. Rewritten in §13.4.
2. **My `essays` bucket analysis was incomplete.** I described it as a policy problem. Q24 shows the
   bucket itself is `public = true`, which bypasses read policies outright. The fix is bigger than a
   policy edit.
3. **`docs/PLATFORM_AUDIT.md` §7 said assignment/teacher/parent concepts do not exist.** Superseded:
   they exist as live tables *and* as columns (`teacher_feedback`, `parent_feedback`,
   `parent_verified`, `parent_notification_sent`, `visible_to_student`). See §3.3.

---

## 2. Production Database Inventory

### 2.1 ✅ CONFIRMED — the 11 RLS-disabled tables (Q08, corroborating Q29)

Q08 returns exactly the same eleven tables Q29 flagged, from an independent query path:

```
assignment_submissions · assignments · course_lessons · courses
exam_records · exam_types · learning_progress_stats · student_tasks
user_course_access · users · vocabulary_sessions
```

`rls_enabled = false` (Q08) + full `anon`/`authenticated` CRUD grants (Q10) + zero policies (Q07).
**Two independent queries agree.** This is the highest-severity confirmed finding (§9.1).

### 2.2 ✅ CONFIRMED — GSAT exam domain has unused grading infrastructure

Q18 and Q28 surface columns the repository never touches:

| Object | Columns | Repo usage |
|--------|---------|-----------|
| `exam_user_answers` | `graded_by` (FK → `auth.users`), `graded_at`, `grader_feedback`, `essay_question_id` | ❌ **None** — verified by grep |
| `exams` | `created_by` (FK → `auth.users`) | ❌ None |

📌 **Planning note:** the reserved GSAT exam schema **already models manual/teacher grading**. It is
unused, but it exists. When Domain B's teacher-feedback design is written, this is prior art worth
reading — while still respecting the reserved-domain boundary (§8).

### 2.3 ⚠️ `essay_questions` is EMPTY

Q27: `essay_questions` has **0 rows**. Earlier audits treated the GSAT essay question bank as
"complete on the authoring side." The table exists and is well-shaped (`prompt`, `prompt_image`,
`essay_type`, `sample_essay`, `writing_tips`, `word_count_requirement`), but **contains no data**.
The real writing content lives in `essay_submissions`, which belongs to the other application.

### 2.4 ❓ Still unknown

Complete column lists for the 11 LMS tables and for `essay_submissions` (R02/R03), all constraints
and indexes (R09), views (R10), triggers (R07), storage object paths (R11), exact row counts (R13),
and whether `authenticated` can `CREATE` in schema `public` (R08).

---

## 3. Auth / Identity Model

### 3.1 ✅ CONFIRMED — the identity graph (Q18)

**19 tables in `public` hold a foreign key to `auth.users`:**
`admin_course_reminders.created_by`, `app_admins.user_id`, `blog_bookmarks`, `blog_comments`,
`blog_likes`, `blog_page_views`, `blog_shares`, `course_requests`, `exam_attempts`,
`exam_user_answers.graded_by`, `exams.created_by`, `invite_tokens.created_by`, `pack_item_progress`,
`packs.created_by`, `premium_memberships` (×2), `push_subscriptions`, `reminder_logs`,
`site_settings.updated_by`, `tokens.created_by`, `user_pack_claims`, **`user_profiles.user_id`**,
`user_reminder_preferences`, `user_stats`, `user_word_progress`.

**Tables with NO foreign key to `auth.users`** — this is the important list:

| Table | Identity column | Type | FK? |
|-------|-----------------|------|-----|
| **`public.users`** | `id` | — | ❌ **None** |
| `essay_submissions` | `student_id` | **`character varying`** | ❌ None (type makes it impossible) |
| `assignment_submissions` | `student_id` | `uuid` | ❌ **None** |
| `student_tasks` | `student_id` | `uuid` | ❌ **None** |
| `learning_progress_stats` | `student_id` | `uuid` | ❌ **None** |
| `vocabulary_sessions` | `student_id` | `uuid` | ❌ **None** |
| `exam_records` | `student_id` | `uuid` | ❌ **None** |

### 3.2 🟠 NEW FINDING — the identity model is fragmented

There are **three identity anchors with no enforced relationship between them**:

```
   auth.users  ──FK──►  user_profiles   (product, grade, school)   ← GSAT app
        │                app_admins, user_stats, user_word_progress,
        └──FK──►         packs, premium_memberships, … (19 tables)

   public.users        role varchar DEFAULT 'student'              ← LMS/Writing app
     ❌ no FK          is_admin boolean DEFAULT false
     ❌ RLS off        email varchar NOT NULL

   ??? ─────►  assignment_submissions.student_id  uuid   ❌ no FK
               student_tasks.student_id           uuid   ❌ no FK
               learning_progress_stats.student_id  uuid   ❌ no FK
               vocabulary_sessions.student_id      uuid   ❌ no FK
               exam_records.student_id             uuid   ❌ no FK
               essay_submissions.student_id        varchar ❌ no FK
```

**What is confirmed (Q18, Q20):**
- `public.users` exists, carries **application-level `role` (default `'student'`) and `is_admin`**,
  and has **no FK to `auth.users`**.
- `user_profiles` **does** have `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`.
- `assignment_submissions.student_id` and `student_tasks.student_id` are **`uuid`**.
- `essay_submissions.student_id` is **`character varying`**.

**What is NOT confirmed:** whether those unconstrained `uuid` columns point at `auth.users.id` or
`public.users.id`. ❓ **R05 (all FKs) plus a value-overlap check would settle it.** Until then, we do
not know which identity root the LMS treats as canonical.

⚠️ **`auth.users.role` also appeared in Q20 — do not confuse it with an application role.** That is
Supabase's internal Postgres role column (normally `'authenticated'`), not a Teacher/Student marker.
Similarly `blog_comments.parent_id` is comment threading, not a guardian link.

### 3.3 ✅ CONFIRMED — Teacher / Student / Parent exist as COLUMNS, not as TABLES

Q19 confirms there is **no `classes`, `teachers`, `parents`, `guardians`, or `user_roles` table**.
But Q20 shows the concepts are already modelled informally:

| Concept | Where it appears |
|---------|------------------|
| **Teacher** | `student_tasks.teacher_feedback`, `student_tasks.graded_by`, `exam_records.teacher_feedback`, `learning_progress_stats.teacher_notes`, `essay_submissions.teacher_comment`, `assignment_submissions.graded_by`/`feedback`, `exam_user_answers.graded_by`/`grader_feedback` |
| **Student** | `student_id` on 6 tables; `student_tasks.student_notes`, `essay_submissions.student_notes`, `student_tasks.visible_to_student` |
| **Parent** | `learning_progress_stats.parent_feedback`, `vocabulary_sessions.parent_verified`, `assignments.parent_notification_sent` |
| **Role** | `public.users.role` (default `'student'`), `public.users.is_admin` |

**Interpretation:** a Teacher/Student/Parent workflow already runs in Production, but the
relationships are expressed as **flags and free-text columns**, not as relational links. There is no
way to answer "which students does this teacher teach?" or "who is this student's guardian?" from the
current schema. That is precisely the gap Domain B is meant to fill — but it must be built *around*
the existing data, not beside it.

### 3.4 🔴 Consequence: DO NOT create `user_roles` yet

The Phase 1 plan in `docs/PLATFORM_AUDIT.md` proposed a `user_roles` table keyed on `auth.users`.
**That plan is now on hold**, for three reasons:

1. **`public.users.role` already exists** and is the LMS's role source. Creating `user_roles` would
   make a **fifth** authorization mechanism (§3.5) rather than converging the four we have.
2. **We do not know which identity root the LMS uses.** A `user_roles` table keyed on `auth.users`
   would be invisible to any code reading `public.users`.
3. **`public.users` has no FK to `auth.users`**, so the two populations may not even be in sync.
   ❓ R06 (row counts) and a value-overlap check are needed.

**Required before Phase 1: an identity reconciliation decision** — either `auth.users` becomes the
single root and `public.users` becomes a profile projection, or the LMS's model is adopted. That is a
product and ownership decision, not a schema detail, and it needs the other application's maintainer.

### 3.5 🟠 CONFIRMED — four parallel admin authorization mechanisms (five with `public.users`)

| # | Mechanism | Used by |
|---|-----------|---------|
| 1 | `is_admin()` → hard-coded email | `packs`, `pack_items`, `pack_images`, `user_pack_claims`, `invite_tokens`, `premium_memberships`, storage `pack-images` |
| 2 | `app_admins` membership | **`site_settings` UPDATE only** |
| 3 | `auth.jwt() ->> 'email' = '…'` inline | `blog_posts`, `blog_categories`, storage `blog-images` |
| 4 | `raw_user_meta_data ->> 'role' = 'admin'` | `admin_course_reminders`, `reminder_logs` |
| 5 | **`public.users.is_admin` / `public.users.role`** 🆕 | The LMS/Writing application (RLS disabled, so not enforced in-database) |

Mechanism 4 remains the one to test (R15/B11) — it derives authority from user metadata.
Mechanism 5 is enforced **only in application code**, because `public.users` has RLS off.

---

## 4. RLS Audit

### 4.1 🔴 Eleven tables with no enforcement (Q08 + Q10 + Q07)

See §2.1 and §9.1. **Deferred to Phase 0.5B-B.**

### 4.2 🟠 `invite_tokens` and `tokens` enumerable by anon

Unchanged from round 1. `Anyone can validate tokens USING (is_active = true)` applies to `{public}`
and `anon` holds `SELECT`. A redundant second policy cannot narrow it (both PERMISSIVE, therefore
OR'd). **Deferred to Phase 0.5B-B** — `tokens.created_by` has an FK to `auth.users` (Q18) and the
table is not referenced by this repository, so a caller may exist in the other application.

### 4.3 🟢 REFUTED — `site_settings` is adequately protected

`SELECT USING (true)` (needed pre-login by `PhaseContext`) and
`UPDATE USING (EXISTS(SELECT 1 FROM app_admins WHERE user_id = auth.uid()))`. No INSERT/DELETE policy
→ deny-by-default, and Q08 confirms `site_settings` is **not** in the RLS-disabled list, so RLS is on
and the policies are live.

### 4.4 🟢 REFUTED — GSAT exam-domain RLS is correct

Q08 confirms none of `exams`, `vocabulary_questions`, `question_groups`, `group_questions`,
`translation_questions`, `essay_questions`, `exam_attempts`, `exam_user_answers` appear in the
RLS-disabled list. Combined with the Q07 policies (publication-gated question reads, owner-scoped
attempts, answers chained through `exam_attempts`), **the reserved domain's RLS is acceptable and is
explicitly out of scope for Phase 0.5B.**

### 4.5 Residual policy observations

`notifications` "Service role can insert" applies to `{public}` with `WITH CHECK (true)` (§9.8);
`blog_page_views` / `blog_shares` accept unauthenticated inserts (LOW).

---

## 5. PostgreSQL Functions / RPC Audit

Unchanged from round 1 and still confirmed:

- **`claim_pack_with_token`** — the premium-checking 2-arg version is live; it accepts `p_site` and
  **never references it**, so `site` always falls back to the column default `'gsat'` (§9.5). Both
  arities exist.
- **`admin_grant_premium` / `admin_revoke_premium`** — no authorization branch; `EXECUTE` granted to
  PUBLIC **and** `anon` (§9.3).
- **Six functions lack a pinned `search_path`** (§9.7): `admin_grant_premium`,
  `admin_revoke_premium`, `claim_pack_with_token(text,text)`, `get_all_word_progress`,
  `is_premium_member`, `upsert_word_progress(8-arg)`.
- **`upsert_word_progress` 6-arg overload is broken** — its `ON CONFLICT (user_id, word_id)` targets a
  constraint that was dropped (§9.9).
- **SRS semantics diverge** between the client-side level system (mastery cap 6) and the server-side
  pack system (cap 5, mastered ≥ 4) (§9.10).

---

## 6. Storage Audit

### 6.1 🔴 CONFIRMED — every bucket is public (Q24)

| Bucket | `is_public` | Size limit | MIME allow-list | In repo? |
|--------|-------------|------------|-----------------|----------|
| `blog-images` | ✅ **true** | none | none | ✅ yes |
| **`essays`** | ✅ **true** | none | none | ❌ no — writing app |
| **`Essays`** | ✅ **true** | 50 MB | `image/jpeg`, `image/png`, `image/heic` | ❌ no — writing app |
| `exam-images` | ✅ **true** | none | none | ✅ yes |
| `pack-audio` | ✅ **true** | none | none | ✅ yes |
| **`pack-covers`** | ✅ **true** | none | none | ❌ **no — unknown owner** |
| `pack-images` | ✅ **true** | none | none | ✅ yes |
| **`tts`** | ✅ **true** | 15 MB | none | ❌ **no — unknown owner** |

**Three things this changes:**

1. **A `public = true` bucket serves objects over an unauthenticated URL
   (`/storage/v1/object/public/<bucket>/<path>`), bypassing object-level SELECT policies.** My previous
   revision framed the `essays` exposure as a policy defect. It is worse: even if
   `essays_select_policy` were tightened, the bucket flag alone would keep every file publicly
   readable to anyone with (or guessing) the path. And because `essays_select_policy` also grants
   `{public}` LIST, paths do not even need guessing.
2. **There are TWO essay buckets** — `essays` and `Essays`. Postgres/Storage bucket ids are
   case-sensitive, so these are genuinely distinct. `Essays` (50 MB, image MIME types) is clearly the
   **photo-upload** bucket, matching `essay_submissions.image_thumbnail_url`. `essays` has no limits
   at all. ❓ Whether both are in active use is unknown — **R11 (object counts per bucket) settles it**,
   and it matters because a fix must cover both.
3. **`pack-covers` and `tts` are unaccounted for.** Neither appears anywhere in this repository
   (verified by grep). `pack-covers` overlaps `pack-images` semantically; `tts` overlaps `pack-audio`.
   ❓ Owner unknown — possibly abandoned, possibly the other app's.

**Only `pack-images` and `blog-images` have write policies** (`is_admin()` and the inline-email check).
`essays` has the four unrestricted policies. `Essays`, `exam-images`, `pack-audio`, `pack-covers` and
`tts` have **no policies at all** — with public buckets, reads work anyway and writes are closed to
normal clients, which is why the `service_role` TTS path (§9.11) works.

**All of this is deferred to Phase 0.5B-B**: `essays`/`Essays` are the writing application's, and
flipping `public` to false will break any hard-coded public URL that application relies on.

---

## 7. Existing Writing Application

# ✅ EXISTING WRITING MODEL CONFIRMED — REUSE / ADAPTER DESIGN REQUIRED

### 7.1 Confirmed shape (Q27, Q28, Q20)

`public.essay_submissions` — **86 rows**, RLS **enabled**, table comment 「學生作文提交記錄」
("student essay submission records").

| Column | Type | Role |
|--------|------|------|
| `student_id` | **`character varying`** | Author — ⚠️ **not uuid, no FK** |
| `essay_content` | `text` | The essay body |
| `essay_title` | `character varying` | Title |
| `essay_topic` | `text` | Topic |
| `essay_topic_detail` | `text` | Extended prompt/topic detail |
| `essay_date` | `date` | Submission date |
| `submission_type` | `character varying` | Likely `text` vs `image` |
| `image_thumbnail_url` | `text` | Photo submission → the `Essays` bucket |
| `highlights` | **`jsonb`** | Inline annotations |
| `score_content` | `integer` | A content score |
| `teacher_comment` | `text` | Optional teacher feedback |
| `student_notes` | `text` | Student's own notes |

**RLS (Q07):** students can `SELECT` / `INSERT` / `UPDATE` their own rows via
`(auth.uid())::text = (student_id)::text`. **No DELETE policy. No teacher or admin read policy.**

### 7.2 What this means for reuse

**Strongly positive.** The writing model this platform needs already exists, with real data:

- `highlights jsonb` **structurally matches** the `highlights[{start, end, type, severity, note,
  suggestion}]` shape already defined in this repo's `src/data/mock-essay.ts`. The GSAT UI's feedback
  renderer may be adaptable with little change.
- `teacher_comment` means **optional teacher writing feedback is already modelled**.
- `image_thumbnail_url` + the `Essays` bucket means **photo submission is already solved**.
- `submission_type` suggests typed-vs-photo is already a first-class distinction.

**Therefore: do not create a replacement writing table.** The correct Phase 5 shape is an
**adapter**: map `essay_submissions` to the GSAT UI's types, and extend additively (nullable
`class_id`, `assignment_id`, `source`) only after the owning application's maintainer agrees.

### 7.3 The three unknowns that block adapter design

1. ❓ **The full column list.** Q28's filter matched on keywords; `score_content` only surfaced
   because it contains "content". **Sibling columns like `score_grammar` or `score_organization`
   would not have matched and may well exist.** Whether the rubric is one score or five is
   undetermined. **R02 settles it.**
2. ❓ **Where AI feedback lives.** No column matched `%ai_%`, `%rubric%`, or `%feedback%` — but
   `highlights jsonb` is the obvious candidate for AI output. Its internal shape is unknown.
3. ❓ **How teachers and the AI grader read essays today.** There is no teacher RLS policy, so reads
   must come via `service_role` or via the public bucket URL. This determines whether tightening
   §9.2 breaks grading — which is exactly why it sits in Phase 0.5B-B.

### 7.4 `student_id` type mismatch — a real integration cost

`essay_submissions.student_id` is `character varying` while `assignment_submissions.student_id` and
`student_tasks.student_id` are `uuid`. **Even within the other application, the student key is not
consistently typed.** Any cross-domain join (e.g. "show this student's essays alongside their
assignments") needs a cast, and casts silently defeat indexes. This is a design constraint to
surface early rather than discover during Phase 5.

---

## 8. GSAT Mock Exam Domain

# ⚠️ RESERVED / DO NOT MODIFY DURING LEARNING PLATFORM DEVELOPMENT

Reserved: `exams`, `vocabulary_questions`, `question_groups`, `group_questions`,
`translation_questions`, `essay_questions`, `exam_attempts`, `exam_user_answers`, `exam_statistics`,
the `exam-images` bucket, and all `/exam*` routes and code.

**✅ Its RLS is confirmed correct (§4.4) and is explicitly NOT part of Phase 0.5B.**

Two notes for later, neither actionable now:

- The domain **already has unused grading columns** (`graded_by`, `graded_at`, `grader_feedback`) —
  prior art for Domain B's teacher feedback (§2.2).
- ⚠️ **`exam_records` and `exam_types` are NOT part of this domain.** They belong to the LMS cluster
  and have RLS **disabled**. The naming collision is a genuine hazard — do not confuse them with
  `exams` / `exam_attempts`.

---

## 9. Confirmed Security Findings

### 9.1 Eleven tables: RLS disabled with full public read/write — **CRITICAL** ✅ CONFIRMED ×2

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 None — these tables do not appear in this repository. |
| **Production reality** | ✅ **CONFIRMED by two independent queries.** Q08 and Q29 both return the same eleven tables with `rls_enabled = false`. Q10: `anon` and `authenticated` hold `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`. Q07: zero policies. |
| **Impact** | The anon key ships in every deployed browser bundle. Anyone can read, modify, delete or truncate `public.users` (which holds `email`, `role`, `is_admin`), `student_tasks` (32 rows, `student_notes`, `teacher_feedback`), `assignments`, `assignment_submissions` (`content`, `feedback`), `learning_progress_stats` (`parent_feedback`, `teacher_notes`), `vocabulary_sessions`, `courses`, `course_lessons`, `user_course_access`, `exam_records` (`teacher_feedback`), `exam_types`. **`public.users.is_admin` being world-writable means anyone can set `is_admin = true` on any row** — if the LMS trusts that column, that is full application admin takeover. Student PII and teacher/parent commentary are exposed; minors are plausibly involved. |
| **Affected objects** | The 11 tables; `anon` and `authenticated` roles |
| **Recommended remediation** | ⚠️ **Deferred to Phase 0.5B-B.** Enabling RLS with zero policies flips them to deny-all and would break the owning application. Per-table `REVOKE … FROM anon` may be appropriate as targeted containment **only after confirming no anonymous flow depends on that specific table** — see §13.4 for the corrected position. Correct sequence: identify the owning application → author policies with its maintainer → enable RLS and policies together → verify. |

### 9.2 All storage buckets public; `essays` + `Essays` expose student work — **CRITICAL** ✅ CONFIRMED

| Field | Detail |
|-------|--------|
| **Repository expectation** | 📁 The repository knows 4 buckets and nothing about their public flags. |
| **Production reality** | ✅ **CONFIRMED (Q24).** All 8 buckets are `public = true`, including both `essays` and `Essays`. Additionally (Q07) `essays_select_policy` grants LIST to `{public}`, and the insert/update/delete policies grant `{authenticated}` access with **no owner predicate**. |
| **Impact** | Every essay file is downloadable by anyone over an unauthenticated URL, and listable by anyone. Any authenticated user can overwrite or delete any other student's file. `essay_submissions` holds 86 real submissions with `image_thumbnail_url` pointing into these buckets. `exam-images`, `pack-audio`, `pack-covers` and `tts` are also world-readable — lower impact (teaching content, not student work), but `exam-images` means unpublished exam artwork is reachable by URL. |
| **Affected objects** | Buckets `essays`, `Essays`, `blog-images`, `exam-images`, `pack-audio`, `pack-covers`, `pack-images`, `tts`; the four `essays_*` policies |
| **Recommended remediation** | ⚠️ **Deferred to Phase 0.5B-B.** A correct fix flips `public` to false **and** adds an ownership predicate (conventionally `(storage.foldername(name))[1] = auth.uid()::text`) **and** migrates any hard-coded public URLs to signed URLs. Every one of those steps can break the writing application. Must cover **both** `essays` and `Essays`. Run **R11** first to learn the path convention and which bucket is actually in use. |

### 9.3 `admin_grant_premium` / `admin_revoke_premium` — no authorization, `EXECUTE` to PUBLIC — **CRITICAL** ✅ CONFIRMED

Unchanged from round 1. Neither function contains an authorization branch; `admin_revoke_premium`
does not even call `auth.uid()`. `execute_acl` = `{=X/postgres, …, anon=X/postgres,
authenticated=X/postgres, …}` — the leading `=X` grants EXECUTE to PUBLIC, and `anon` is explicit.
**Any caller, including an unauthenticated one, can grant or revoke Premium for any user.**
Anonymous grants land with `granted_by = NULL`, which is the audit signature (R14).

✅ **Safe to fix in Phase 0.5B-A1** — `premium_memberships` is GSAT-owned (both FKs point at
`auth.users`, and it is written only by these two functions). No LMS dependency.

### 9.4 `invite_tokens` / `tokens` enumerable by anon — **HIGH** ✅ CONFIRMED
Deferred to **0.5B-B** — possible cross-application callers (§4.2).

### 9.5 `claim_pack_with_token` silently ignores `p_site` — **HIGH** ✅ CONFIRMED
Deferred to **0.5B-B** per your instruction. Live effect: every claim writes `site = 'gsat'`, so packs
claimed on TOEIC/Kids vanish from those sites' UI. `user_pack_claims` has 23 rows (Q27) — small
enough that a data correction is tractable once the function is canonicalised.

### 9.6 Four (now five) parallel admin authorization mechanisms — **HIGH** ✅ CONFIRMED
§3.5. Mechanism 5 (`public.users.is_admin`) is newly confirmed and is world-writable (§9.1).
Convergence is a Phase 1 task, blocked on the identity reconciliation decision (§3.4).

### 9.7 Six `SECURITY DEFINER` functions lack a pinned `search_path` — **MEDIUM** ✅ CONFIRMED
Scope corrected in round 1: Production is partially hardened (12 of 18 pinned). The six unpinned are
listed in §5. ✅ **Safe to fix in Phase 0.5B-A2.** Severity depends on whether `authenticated` can
create objects in `public` — ❓ **R08** settles it and may raise this to HIGH.

### 9.8 `notifications` INSERT policy applies to everyone — **MEDIUM** ✅ CONFIRMED
Policy named "Service role can insert notifications" but `roles = {public}`, `WITH CHECK (true)`.
`notifications` is not referenced by this repository → **defer to 0.5B-B**.

### 9.9 Broken `upsert_word_progress` 6-arg overload — **MEDIUM** ✅ CONFIRMED
GSAT-owned. Low urgency (live path uses 8 args). Can ride along with A2 or wait.

### 9.10 Divergent SRS semantics — **MEDIUM** ✅ CONFIRMED
Defer to Phase 3.

### 9.11 TTS endpoints: `service_role`, no authentication — **CRITICAL** 📁 repository-confirmed
✅ **Safe to fix in 0.5B-A1** — pure GSAT application code, no LMS dependency.

### 9.12 Cron endpoint open when `CRON_SECRET` unset — **HIGH** 📁 repository-confirmed
✅ **Safe to fix in 0.5B-A1**, provided the secret is configured *before* switching to fail-closed.

### 9.13 Lower-severity (unchanged)
`/dashboard/result-summary` ungated (MEDIUM); `Math.random()` tokens (MEDIUM); unauthenticated blog
analytics inserts (LOW); dev panel via `?devmode=true` (LOW); legacy admin routes (LOW); `.gitignore`
omits `.env`, though no secret was ever committed (INFORMATIONAL).

---

## 10. Updated Severity Ranking

| Rank | Finding | Severity | Phase | Blocks other app? |
|------|---------|----------|-------|-------------------|
| 1 | §9.1 — 11 tables, RLS off, full anon CRUD (incl. world-writable `public.users.is_admin`) | 🔴 CRITICAL | **0.5B-B** | ⚠️ **Yes** |
| 2 | §9.2 — all buckets public; `essays`/`Essays` expose student work | 🔴 CRITICAL | **0.5B-B** | ⚠️ **Yes** |
| 3 | §9.3 — premium grant/revoke ungated, EXECUTE to PUBLIC/anon | 🔴 CRITICAL | **0.5B-A1** | ✅ No |
| 4 | §9.11 — TTS endpoints, `service_role`, no auth | 🔴 CRITICAL | **0.5B-A1** | ✅ No |
| 5 | §9.12 — cron endpoint open if secret unset | 🟠 HIGH | **0.5B-A1** | ✅ No |
| 6 | §3.2 — fragmented identity model | 🟠 HIGH | **Pre-Phase-1** | ⚠️ Yes (decision) |
| 7 | §9.4 — `invite_tokens`/`tokens` enumerable | 🟠 HIGH | **0.5B-B** | ⚠️ Possibly |
| 8 | §9.5 — `claim_pack_with_token` ignores `p_site` | 🟠 HIGH | **0.5B-B** | ⚠️ Possibly |
| 9 | §9.6 — four/five admin mechanisms | 🟠 HIGH | Phase 1 | ⚠️ Yes |
| 10 | §9.7 — six functions unpinned `search_path` | 🟡 MEDIUM | **0.5B-A2** | ✅ No |
| 11 | §9.8 — `notifications` INSERT open | 🟡 MEDIUM | 0.5B-B | ⚠️ Possibly |
| 12 | §9.9 — broken `upsert_word_progress` overload | 🟡 MEDIUM | 0.5B-A2 (optional) | ✅ No |
| 13 | §9.10 — divergent SRS semantics | 🟡 MEDIUM | Phase 3 | ✅ No |
| 14 | §9.13 — assorted | 🟡/🟢 | 0.5B-A1 tail | ✅ No |

**The two highest-severity findings are both in the deferred bucket.** That is uncomfortable but
correct: acting on them without caller analysis risks taking down a live application serving real
students.

---

## 11. Objects Safe to Reuse

**Frontend** — unchanged (48 shadcn components, `AuthContext`, `RequireAdmin` pattern, `PhaseGate`,
`useAudioPlayer`, chart integration, `BatchUploadDialog`, push infrastructure, `BlockNoteEditor`).

**Database:**

| Asset | Verdict |
|-------|---------|
| `essay_submissions` | ✅ **Confirmed reuse target** — adapter design, no replacement table (§7) |
| `Essays` bucket (photo submissions) | ✅ Reuse after §9.2 remediation |
| GSAT exam-domain RLS | ✅ Correct — reserved, but a good pattern to imitate |
| `exam_user_answers.graded_by` / `grader_feedback` | ✅ Prior art for teacher feedback (unused) |
| Owner-scoped policies on `user_*`, `pack_item_progress`, `push_subscriptions` | ✅ Template for new tables |
| `invite_tokens` **pattern** | ✅ Right model for class invite codes — build a **new** table |
| `premium_memberships` **pattern** | ✅ Template for teacher licensing |
| `user_profiles` (FK to `auth.users`) | ✅ The one clean identity link that exists |

**Must NOT be reused or replaced until ownership + schema are understood:** `assignments`,
`assignment_submissions`, `student_tasks`, `courses`, `course_lessons`, `user_course_access`,
`user_lesson_progress`, `learning_progress_stats`, `vocabulary_sessions`, `exam_records`,
`exam_types`, `public.users`.

---

## 12. Objects Requiring Further Investigation

| Priority | Object | Unknown | Blocks |
|----------|--------|---------|--------|
| 🔴 P0 | Owning application of the 22 unaccounted tables | Who writes them; which anonymous flows exist | §9.1 remediation; Phase 1 & 4 |
| 🔴 P0 | `essay_submissions` full columns | Rubric breadth; where AI feedback lives | Phase 5 adapter |
| 🔴 P0 | Identity reconciliation | Does LMS `student_id uuid` point at `auth.users` or `public.users`? | Phase 1 (§3.4) |
| 🔴 P0 | How teachers/AI read essays today | No teacher RLS policy exists | §9.2 fix correctness |
| 🟠 P1 | `essays` vs `Essays` — which is live | Object counts, path convention | §9.2 fix scope |
| 🟠 P1 | `pack-covers`, `tts` bucket owners | Unreferenced by this repo | Cleanup / §9.2 scope |
| 🟠 P1 | `raw_user_meta_data.role` self-assignability | Untested | §9.6 severity |
| 🟠 P1 | Can `authenticated` `CREATE` in `public`? | R08 | §9.7 severity |
| 🟠 P1 | `auth.users` triggers | R07 | Phase 1 profile provisioning |
| 🟡 P2 | Full columns/constraints/indexes for LMS tables | R03/R09 | Domain B design |
| 🟡 P2 | `CRON_SECRET`, Edge Function `verify_jwt` | Vercel/Supabase config | §9.11, §9.12 |

---

## 13. Phase 0.5B — Revised Plan

> **PROPOSED ONLY — NOTHING BELOW HAS BEEN EXECUTED. No Production object was modified.**

Restructured per your instruction into **A0 / A1 / A2** (safe, GSAT-owned) and **B** (shared,
deferred).

### 13.1 Phase 0.5B-A0 — Read-only final verification

**No writes. No privilege escalation. No metadata mutation.** Exactly two checks:

| Item | Purpose | Query |
|------|---------|-------|
| **B9 / R14** | Audit premium grant history for grants that look anonymous (`granted_by IS NULL`) or self-granted — i.e. whether §9.3 has already been exploited | §15 below |
| **B11 / R15** | Inspect the admin metadata-role situation: how many accounts carry `raw_user_meta_data->>'role'`, and what values | §15 below |

⚠️ **R15 is an observation, not a test.** It counts role claims. It does **not** attempt to set one,
and no metadata may be mutated to probe self-assignability. If the counts look wrong (e.g. an
`'admin'` claim on an account that should not have one), escalate that as a finding for the owner to
investigate through their own account records — do not attempt to reproduce it.

**Exit criterion:** both result sets reviewed; §9.3 and §9.6 severities finalised.

### 13.2 Phase 0.5B-A1 — Safe critical hotfixes

Scope limited to fixes whose compatibility does **not** depend on the LMS/Writing application.

| # | Item | Finding | Compatibility basis |
|---|------|---------|---------------------|
| **A1-1** | **Protect `admin_grant_premium`** — add internal authoritative admin authorization; `REVOKE EXECUTE FROM PUBLIC, anon`; grant only the minimum role(s) | §9.3 | `premium_memberships` is GSAT-owned: both FKs target `auth.users`, and the table is written only by these two functions. Unreferenced by the LMS. |
| **A1-2** | **Protect `admin_revoke_premium`** — same three requirements | §9.3 | as above |
| **A1-3** | **Secure the privileged TTS endpoints** — require a caller JWT, assert admin, rate-limit per pack, drop wildcard CORS, and consolidate the two duplicate implementations | §9.11 | Pure GSAT application code (`api/generate-pack-audio.ts`, `supabase/functions/generate-pack-audio/`) |
| **A1-4** | **Secure the cron endpoint** — **configure `CRON_SECRET` first**, verify the scheduled run still succeeds, and only then switch the guard to fail-closed and reject `GET` | §9.12 | Pure GSAT application code |
| **A1-5** | *(tail)* `crypto.getRandomValues()` for tokens; add `.env` to `.gitignore`; gate the dev panel on `import.meta.env.DEV` | §9.13 | Local app code |

**On "minimum required role(s)" for A1-1/A1-2.** `src/pages/admin/UsersAdmin.tsx` calls both RPCs
from the browser with the signed-in user's JWT, i.e. as `authenticated`. So the minimum that
preserves the admin UI is:

```
REVOKE ALL ON FUNCTION public.admin_grant_premium(uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_premium(uuid, timestamptz, text) TO authenticated;
```

with `is_admin()` as the authoritative in-function gate. Granting to `service_role` **only** would be
stricter, but requires routing admin actions through a server endpoint — a larger change that breaks
the current UI, so it belongs in Phase 1, not a hotfix.

⚠️ **Honest limitation:** `is_admin()` is currently a hard-coded email comparison (§3.5). Using it
makes these two functions **as strong as the rest of the GSAT system, not stronger**. That is the
correct hotfix scope — real convergence is Phase 1 and is blocked on §3.4.

**Constraints:** signatures unchanged; no new tables or columns; no data migration; staging first
(⚠️ **no staging project exists** — creating one belongs in this phase).

### 13.3 Phase 0.5B-A2 — `SECURITY DEFINER` hardening

For the six functions still lacking a pinned `search_path`. **Inventory each; do not bulk-edit.**

| # | Function | Objects to schema-qualify | Recommended |
|---|----------|---------------------------|-------------|
| 1 | `admin_grant_premium(uuid, timestamptz, text)` | `public.premium_memberships` | `SET search_path = ''` |
| 2 | `admin_revoke_premium(uuid)` | `public.premium_memberships` | `SET search_path = ''` |
| 3 | `is_premium_member(uuid)` | `public.premium_memberships` | `SET search_path = ''` |
| 4 | `get_all_word_progress()` | `public.user_word_progress` (`auth.uid()` is already qualified) | `SET search_path = ''` |
| 5 | `upsert_word_progress(text, int, bigint, int, int, bigint, text, uuid)` | `public.user_word_progress`; the `ON CONFLICT` expression's `::uuid` cast resolves via `pg_catalog`, which is always implicitly searched | `SET search_path = ''` |
| 6 | `claim_pack_with_token(text, text)` | ⚠️ **Most care needed.** `%ROWTYPE` declarations resolve at compile time: `public.invite_tokens%rowtype`, `public.packs%rowtype`, `public.user_pack_claims%rowtype`. Also qualify `public.is_premium_member(…)` and the three tables in the DML. `now()` and `json_build_object()` are `pg_catalog`, so no change | `SET search_path = ''` |

**Why `''` rather than `public`.** With an empty `search_path`, *nothing* is resolved implicitly
except `pg_catalog`, so a malicious schema earlier on the caller's path cannot shadow a table,
operator, or function that the definer's body relies on. `SET search_path = public` still trusts
whatever `public` happens to contain at call time — and `public` is a schema the database's other
application also writes to. For `SECURITY DEFINER` functions the empty setting is the stronger
guarantee, and it is what the PostgreSQL documentation recommends.

**When `public` (or another explicit list) is preferred instead** — three legitimate cases:

1. **Extension-provided objects outside `pg_catalog`.** Supabase installs many extensions into an
   `extensions` schema (and historically into `public`). If a function body relies on, say, a
   `pgcrypto` function or a `citext` operator, an empty `search_path` breaks it. The fix is an
   explicit list such as `SET search_path = pg_catalog, extensions`, **not** a fallback to bare
   `public`. **None of the six functions above appear to use extension objects**, but this must be
   re-verified per function before applying — that is exactly why bulk-editing is wrong.
2. **Bodies using temporary tables.** `pg_temp` is not implicitly searched when `search_path` is
   empty; such a function needs `SET search_path = pg_catalog, pg_temp`. None of the six do.
3. **Deliberate late binding across schemas** — a function intended to resolve against the caller's
   schema. This is an anti-pattern in `SECURITY DEFINER` and does not apply here.

**Note on the other 12 functions.** They already carry `SET search_path TO 'public'`, which is
weaker than `''` but far better than nothing. Migrating them is **out of scope for A2** — a separate,
lower-priority pass, so this phase stays small and reviewable. A2 will therefore leave the codebase
with two conventions temporarily; that is a deliberate trade, and it should be recorded so the
inconsistency is not mistaken for an oversight.

**Constraints:** preserve signatures and behaviour exactly; verify each function's callers still work;
one function per change so a regression is trivially bisectable.

*(Optional ride-along: §9.9 — drop the broken 6-arg `upsert_word_progress` overload, after confirming
no cross-application caller.)*

### 13.4 Phase 0.5B-B — Shared LMS / Writing security — **DO NOT EXECUTE YET**

Everything here can break the other application.

| # | Item | Finding |
|---|------|---------|
| B-1 | RLS/grant remediation for the 11 RLS-disabled LMS tables | §9.1 |
| B-2 | `public.users` security (incl. world-writable `is_admin`) | §9.1, §3.2 |
| B-3 | `assignments` | §9.1 |
| B-4 | `assignment_submissions` | §9.1 |
| B-5 | `student_tasks` | §9.1 |
| B-6 | `learning_progress_stats` | §9.1 |
| B-7 | `courses` | §9.1 |
| B-8 | `course_lessons` | §9.1 |
| B-9 | `user_course_access` | §9.1 |
| B-10 | `vocabulary_sessions` | §9.1 |
| B-11 | `exam_records` | §9.1 |
| B-12 | `exam_types` | §9.1 |
| B-13 | `essays` / `Essays` bucket security (both buckets; public flag + policies + URL migration) | §9.2 |
| B-14 | Invite-token redesign **if** existing callers depend on direct `SELECT` | §9.4 |
| B-15 | `claim_pack_with_token` canonicalization + the `site` bug | §9.5 |
| B-16 | `notifications` INSERT policy | §9.8 |

#### ⚠️ Correction on emergency containment

My previous revision recommended a blanket `REVOKE ALL … FROM anon` across all 11 tables as an
immediate containment step. **I am withdrawing that as a blanket recommendation.** The tables belong
to an application whose anonymous flows have not been analysed; a blanket revoke could break it.

The accurate position:

- A per-table `REVOKE … FROM anon` **may** be appropriate as emergency containment **for a specific
  table**, and **only after** confirming that no anonymous application flow reads or writes it.
- `public.users` is the strongest candidate for that treatment, because a world-writable `is_admin`
  column is an application-takeover primitive — but even there, confirm first that no anonymous
  sign-up or lookup path touches it.
- **It is not an approved blanket Production change**, and nothing should be executed until
  caller/dependency analysis is complete.

#### Prerequisites before any B item

1. Identify the owning application and its maintainer.
2. Caller/dependency analysis per table: which flows are anonymous, which authenticated?
3. For B-13: determine how teachers and the AI grader currently read essays.
4. A staging environment.
5. Agreement with the maintainer on the policy model.

---

## 14. Phase 1 Readiness Assessment

### Q1 — Is the Production schema sufficiently understood to design Teacher / Student / Parent / Class?

# ❌ NO — and round 2 revealed why in a way that changes the plan

1. 🔴 **The identity model is fragmented** (§3.2). Three anchors, no enforced links. Designing a
   `classes` or `user_roles` table before deciding which root is canonical would bake in the ambiguity.
2. 🔴 **`public.users.role` and `is_admin` already exist.** Adding `user_roles` now creates a fifth
   authorization mechanism instead of converging the existing four.
3. ✅ **Genuinely clear:** no `classes`, `teachers`, `parents`, `guardians`, or `user_roles` table
   exists (Q19). Those can be designed fresh — **once** the identity root is settled.
4. ⚠️ **Teacher/Parent/Student semantics already exist as columns** (§3.3). New relational tables must
   be reconciled with `teacher_feedback`, `parent_verified`, `parent_notification_sent` and
   `visible_to_student`, not layered obliviously on top.

### Q2 — Is the Writing schema sufficiently understood to design integration?

# 🟡 ALMOST — the model is confirmed, three details are missing

`essay_submissions` is confirmed as the reuse target with real data and a shape that maps well onto
the existing GSAT UI (§7.2). Outstanding: the full column list (rubric breadth), where AI feedback
lives, and how teachers/AI currently read. **A single R02 run plus one conversation likely closes
this** — the closest any workstream is to ready.

### Q3 — Are there unresolved blockers?

| # | Blocker | Clears when |
|---|---------|-------------|
| ~~BL-1~~ | ~~No Production access~~ | ✅ **CLEARED** |
| **BL-2** | Four CRITICAL findings live (§9.1, §9.2, §9.3, §9.11) | A1 clears two; B clears two |
| **BL-3** | Ownership of the 22 unaccounted tables unknown | Conversation with the maintainer |
| **BL-4** | 🆕 **Identity reconciliation decision not made** (§3.4) | Product + ownership decision |
| **BL-5** | `essay_submissions` column shape (rubric, AI feedback) | R02 |
| **BL-6** | No staging environment | 0.5B-A1 |

### Q4 — Is it safe to begin Phase 1?

# ❌ NO — DO NOT BEGIN PHASE 1

The reason has sharpened again. It is no longer "we're blind" (round 1) — it is **"the identity
foundation Phase 1 was going to build on does not exist in the form we assumed."** Phase 1's central
move was `user_roles` keyed on `auth.users`. Production has `public.users.role` with no link to
`auth.users`. Building `user_roles` now would add a fifth authorization mechanism to a system that
already has four too many.

**Path to readiness:**

```
1. 0.5B-A0        R14 + R15 — read-only, finalises two severities
2. 0.5B-A1        premium functions, TTS, cron; create staging
3. 0.5B-A2        pin search_path on the six functions
4. Conversation   who owns the 22 tables? how are essays read?
                  which student_id root is canonical?
5. Round 3        R02, R03, R05, R06, R07, R08, R11, R13
6. Identity decision  ← the real Phase 1 gate
7. 0.5B-B         shared remediation, with the maintainer
8. → Phase 1
```

Steps 1–3 are safe, self-contained, and remove two CRITICAL findings. **Step 4 is a conversation and
unblocks more than any query.**

---

## 15. Exact R14 and R15 Queries to Run Next (Phase 0.5B-A0)

Both are **read-only**. Neither mutates data or metadata. Neither attempts privilege escalation.
Also present in `docs/discovery/production_discovery_round2.sql`.

```sql
-- ===== [R14] / B9 — audit premium grant history for signs of exploitation =====
-- Finding 9.3: admin_grant_premium has no authorization check and EXECUTE is
-- granted to PUBLIC including anon. An anonymous grant records granted_by = NULL,
-- because auth.uid() returns NULL for an unauthenticated caller.
-- Returns ids, flags and timestamps only. No PII.
SELECT
  'R14' AS qid,
  id,
  user_id,
  granted_by,
  is_active,
  granted_at,
  expires_at,
  notes,
  (granted_by IS NULL)   AS granted_anonymously_or_unattributed,
  (granted_by = user_id) AS self_granted
FROM public.premium_memberships
ORDER BY granted_at DESC;
```

**How to read it:** `granted_by IS NULL` means the grant was made by an unauthenticated caller **or**
predates the `granted_by` column — check `granted_at` against the column's introduction before
concluding. `self_granted = true` means the grantee granted it to themselves, which for a
non-administrator is a strong exploitation signal.

```sql
-- ===== [R15] / B11 — inspect the admin metadata-role situation =====
-- Finding 9.6 mechanism 4: admin_course_reminders and reminder_logs authorize on
-- auth.users.raw_user_meta_data ->> 'role' = 'admin'.
-- This COUNTS role claims. It does not modify metadata and does not attempt to
-- set a claim. Returns aggregate counts only. No emails, no metadata bodies.
SELECT
  'R15' AS qid,
  COALESCE(raw_user_meta_data ->> 'role', '(no role claim)') AS role_claim,
  count(*) AS user_count
FROM auth.users
GROUP BY COALESCE(raw_user_meta_data ->> 'role', '(no role claim)')
ORDER BY user_count DESC;
```

**How to read it:** an `'admin'` count of 0 means mechanism 4 currently grants nothing and the two
policies using it are effectively closed. A non-zero count needs reconciling against the list of
people who *should* be administrators. If an unexpected account holds the claim, treat it as a
finding for the account owner to investigate through their own records — **do not attempt to
reproduce the self-assignment**.

Optionally, run alongside for context (also read-only, no PII):

```sql
-- ===== [R06] identity volumes — sizes the reconciliation problem =====
SELECT 'R06' AS qid, 'auth.users'    AS source, count(*) AS row_count FROM auth.users
UNION ALL SELECT 'R06', 'public.users',   count(*) FROM public.users
UNION ALL SELECT 'R06', 'user_profiles',  count(*) FROM public.user_profiles
UNION ALL SELECT 'R06', 'app_admins',     count(*) FROM public.app_admins;
```

---

## 16. Remaining Discovery Needed Before Phase 1

| # | Item | How | Unblocks |
|---|------|-----|----------|
| 1 | **Owner of the 22 unaccounted tables + their anonymous flows** | 💬 Conversation | §9.1, all of 0.5B-B, Phase 4 |
| 2 | **Which identity root LMS `student_id uuid` points at** | R05 + value-overlap check + 💬 | §3.4, Phase 1 |
| 3 | **`essay_submissions` full columns** | R02 | Phase 5 adapter |
| 4 | **How teachers / AI read essays today** | 💬 + code review of the other app | §9.2 fix |
| 5 | `essays` vs `Essays` — which is live, path convention | R11 | §9.2 fix scope |
| 6 | Full columns of the 11 LMS tables | R03 | Domain B design |
| 7 | Triggers (esp. on `auth.users`) | R07 | Phase 1 provisioning |
| 8 | Can `authenticated` `CREATE` in `public`? | R08 | §9.7 severity |
| 9 | Constraints + indexes | R09 | Detailed design |
| 10 | Exact row counts | R13 | §9.1 blast radius |
| 11 | `auth.users` vs `public.users` volumes | R06 | §3.4 |
| 12 | `pack-covers` / `tts` bucket owners | R11 + 💬 | Cleanup |
| 13 | `CRON_SECRET` set? Edge Function `verify_jwt`? | Vercel / Supabase config | A1-3, A1-4 |

**Items 1, 2 and 4 are conversations, not queries. They unblock more than the remaining ten combined.**

---

## Appendix A — Deliverables

| File | Status |
|------|--------|
| `docs/PRODUCTION_SCHEMA_AUDIT.md` | ✅ Updated with rounds 1 + 2 |
| `docs/discovery/production_discovery.sql` | ✅ Round 1 (validated) |
| `docs/discovery/production_discovery_round2.sql` | ✅ Round 2 (validated) — contains R14/R15 |
| `docs/discovery/README.md` | ✅ Runbook |
| `docs/PLATFORM_AUDIT.md` | Unchanged — superseded claims listed in §1.4 |

## Appendix B — Guardrail Compliance

| Guardrail | Status |
|-----------|--------|
| DO NOT modify Production | ✅ Read-only metadata inspection only |
| DO NOT attempt privilege escalation | ✅ None attempted |
| DO NOT mutate metadata | ✅ None mutated |
| DO NOT modify application code | ✅ Zero source files touched |
| DO NOT create or apply migrations | ✅ `supabase/migrations/` untouched; discovery SQL is `SELECT`-only and lives in `docs/discovery/` |
| DO NOT create or delete tables | ✅ None |
| DO NOT refactor `/exam` or change mock exam behaviour | ✅ Untouched; reserved in §8 |
| DO NOT build Teacher / Student / Parent UI | ✅ None |
| DO NOT create Learning Activity or Writing tables | ✅ None — writing recommendation is explicitly reuse/adapter |
| DO NOT propose `user_roles` yet | ✅ Withdrawn; §3.4 documents why |
| Only documentation files added/modified | ✅ All under `docs/` |
