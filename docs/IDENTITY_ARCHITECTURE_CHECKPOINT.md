# Identity Architecture Checkpoint — `/learn`

> **Written:** 2026-08-27 · **Branch:** `claude/security-architecture-continuation-i3hw1y`
> **Status:** 🟡 **DESIGN ONLY — nothing here has been built, migrated, or deployed.**
>
> This document exists so that `/learn` backend schema work can start without re-opening the
> identity question every time a table is added. It is deliberately **bounded**: it decides the
> identity anchor for *new* work and nothing else. It does **not** reconcile the existing LMS
> identity model, and it does **not** propose a migration.
>
> ✅ **D1 and D2 were both DECIDED by the owner on 2026-08-27** (§9, §10). Everything in this
> document is now settled. The first migration built on it is
> `docs/learn/IDENTITY_SPINE_PLAN.md`.

---

## 0. Scope

### What this checkpoint decides

1. The canonical user identity for all new work.
2. Which profile table `/learn` uses.
3. How student / teacher / parent roles are represented.
4. The class-membership model.
5. Which user id every new table must reference, and under what column name.
6. How `auth.users`, `user_profiles` and `public.users` stay compatible in the meantime.

### What this checkpoint explicitly does NOT do

| Not doing | Why |
|---|---|
| Resolving whether LMS `student_id uuid` points at `auth.users.id` or `public.users.id` | Unanswered since the audit (R05 + a value-overlap check). **§7.4 shows why `/learn` no longer needs the answer.** |
| Creating `user_roles` or any global role table | Still blocked, and §4 makes it unnecessary rather than merely deferred |
| Touching `public.users` | LMS-owned, carries the open CRITICAL 9.1. Quarantined — see §7.3 |
| Adding a trigger on `auth.users` | Existing triggers there were never audited (R07), and `auth.users` is shared with a live application. A trigger is a platform-wide side effect, not a `/learn` change |
| Any backfill, data movement, or FK added to an existing table | Zero-migration posture — see §11 |
| Changing `is_admin()` | Admin authorization convergence (9.6) stays in Phase 1. `/learn` adds **no** new admin mechanism |

---

## 1. The decision, in one table

| Question | Decision |
|---|---|
| Canonical identity | **`auth.users.id` (uuid)** — the Supabase Auth id returned by `auth.uid()` |
| Profile | **Reuse `public.user_profiles`.** No new profile table |
| Roles | **No global role table.** Roles are *relationships*, scoped to a class or to a child |
| Class membership | `learn_class_members (class_id, user_id, role)` with `UNIQUE (class_id, user_id)` |
| Parent | A person-to-person link (`learn_guardian_links`), **not** a class role |
| Admin | Unchanged — existing `is_admin()`. `/learn` introduces no sixth mechanism |
| New-table FK | `REFERENCES auth.users(id)`, always explicit, never nullable-by-accident |
| Column naming | `user_id`, or `teacher_user_id` / `student_user_id` / `guardian_user_id`. 🛑 **Never bare `student_id`** |
| `public.users` | 🛑 Not read, not written, not referenced, not repaired |
| Migration | **None.** Everything is additive and new |

---

## 2. Canonical user identity — `auth.users.id`

**Decision: `auth.users.id` is the identity root for every new object.**

Why this and not `public.users.id`:

| | `auth.users.id` | `public.users.id` |
|---|---|---|
| Issued by | Supabase Auth, at signup | Application code, unknown path |
| Available in RLS | ✅ directly, as `auth.uid()` — **no join** | ❌ requires a join through an unenforced link |
| FK'd by | **19 `public` tables** already | 0 tables |
| Link to the other root | `user_profiles.user_id` → `auth.users(id)` | ❌ **no FK to `auth.users` at all** |
| RLS | Enforced | ❌ **disabled** (finding 9.1) |
| `is_admin` column | — | ❌ **world-writable** (finding 9.1) |
| Row count | 22 | Unknown (R06 never run) |

The deciding property is the second row. Every RLS policy on a table keyed on `auth.users.id` can be
written as a direct comparison against `auth.uid()`. A table keyed on `public.users.id` cannot be
protected by RLS at all without first trusting a link that the database does not enforce — and
`public.users` is the one table an anonymous visitor can currently rewrite at will.

**Rules that follow:**

- `auth.users` is **read-only from the application's point of view.** `/learn` never writes to it,
  never adds a trigger to it, and never adds a FK *from* it.
- `auth.users` is **never exposed to the client.** It is not in the PostgREST-exposed schema, and
  `/learn` must not add a view or `SECURITY DEFINER` function that returns rows from it. Anything
  the UI needs about a person comes from `user_profiles` (§3).
- `auth.uid()` is the only accepted source of "who is calling" in a policy or a function.
  🛑 Never a `user_id` passed in as a parameter and trusted.

---

## 3. Profile — reuse `public.user_profiles`

**Decision: `/learn` reuses `public.user_profiles`. No new profile table is created.**

It already is what a profile table should be: `user_id uuid NOT NULL REFERENCES auth.users(id) ON
DELETE CASCADE`, `UNIQUE (user_id)`, RLS enabled with self-scoped SELECT / INSERT / UPDATE policies.
It is GSAT-owned (created by `supabase/migrations/create_user_profiles_table.sql`) and is the one
clean identity link in the database.

**Three known gaps, and the decision on each:**

| Gap | Decision |
|---|---|
| **A row is not guaranteed.** It is created on demand by `upsert_user_profile()`, so an `auth.users` row can exist with no profile | ✅ **Accept and design around it.** `/learn` treats the profile as *optional* and falls back to a neutral display label. It must never assume a row exists, and must never `INNER JOIN` through it in a way that silently drops a member from a class roster. A provisioning trigger on `auth.users` is out of scope (§0) |
| **Self-only visibility.** A teacher cannot read a student's `display_name`, so a class roster cannot be rendered | 🛑 **Owner decision D2 — see §10** |
| **No DELETE policy, no admin policy** | ✅ Leave as-is. Deletion is handled by the `ON DELETE CASCADE` from `auth.users`. Adding an admin policy would touch the 9.6 convergence question |

**Extension rule:** `user_profiles` may be extended **additively only** — new **nullable** columns
with no default that changes existing behaviour. 🛑 No renames, no new `NOT NULL`, no type changes,
no altering the existing three policies. If `/learn` needs a field that is meaningless to the
existing GSAT signup flow, it belongs in a `/learn` table keyed on `user_id`, not in `user_profiles`.

---

## 4. Roles — relationship-scoped, not a global role table

**Decision: there is no global role table. A person's role is a property of a *relationship*, not of
the person.**

This is the part of the checkpoint that unblocks the standing 🛑 *"do not create `user_roles` or any
role table."* That block existed for two reasons: a `user_roles` keyed on `auth.users` would be
invisible to any LMS code reading `public.users.role`, and it would become a **fifth** parallel
authorization mechanism on top of the four already catalogued in finding 9.6.

Relationship-scoped roles avoid both, and they are also simply the correct model for the product:

- "Teacher" is not a property of a person. It is a property of *a person and a class*. The same
  account can teach 7A and be a student in a teacher-training class.
- "Student" is likewise per-class.
- "Parent" is not class-scoped at all — a guardian is linked to *a child*, and their access is
  derived from that child's memberships.
- "Admin" is a platform role, already has an owner (`is_admin()`), and is **out of this model
  entirely**.

So there is nothing left for a global role table to hold. It is not deferred; it is unnecessary.

```
 ┌──────────────┐
 │  auth.users  │  ← the only identity root
 └──────┬───────┘
        │ 1:0..1                 1:N                    N:M
        ├────────────► user_profiles      (display_name, grade, school …)
        │
        ├────────────► learn_classes.owner_teacher_user_id
        │
        ├────────────► learn_class_members.user_id      role ∈ {teacher, student}
        │
        ├────────────► learn_guardian_links.guardian_user_id
        └────────────► learn_guardian_links.student_user_id
```

**Derived, never stored:** "is this person a teacher?" is answered by
`EXISTS (SELECT 1 FROM learn_class_members WHERE user_id = auth.uid() AND role = 'teacher')`.
The UI uses that to choose a landing dashboard. 🛑 It must not be cached into a column on
`user_profiles` — that is how a fifth authorization source gets born.

---

## 5. Class membership — the model

> ⚠️ **Illustrative DDL. This is design, not a migration file.** It is written for the `learn`
> schema of D1 (§9); under the fallback, each name gains a `learn_` prefix and lives in `public`.

```sql
-- Classes ------------------------------------------------------------------
CREATE TABLE learn_classes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_teacher_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name                  text NOT NULL,
  status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'archived')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Membership ---------------------------------------------------------------
CREATE TABLE learn_class_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id   uuid NOT NULL REFERENCES learn_classes(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('teacher', 'student')),
  status     text NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'removed')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, user_id)
);

-- Guardian link ------------------------------------------------------------
CREATE TABLE learn_guardian_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'active', 'revoked')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  confirmed_at      timestamptz,
  UNIQUE (guardian_user_id, student_user_id),
  CHECK (guardian_user_id <> student_user_id)
);
```

**Design notes:**

- **`text` + `CHECK`, not `ENUM`.** An enum type is shared-schema DDL that is awkward to extend and
  would be another object in a database shared with a live application.
- **`UNIQUE (class_id, user_id)`** — one row per person per class. Changing role means updating the
  row, so a person can never be silently both.
- **`status`, not `DELETE`** — removing a student keeps the row, so their prior work stays
  attributable. This is the same soft-flag lesson as the A1 Phase C remediation.
- **`owner_teacher_user_id` is denormalised onto the class on purpose.** §8 explains why: it is what
  makes the membership policies non-recursive.
- ⚠️ **Refined during the v1 migration (2026-08-27):** the owner is *also* denormalised onto
  `learn.class_members` as `class_owner_teacher_user_id`, tied to the class by a **composite FK with
  `ON UPDATE CASCADE`** so it cannot drift. §8.2 below routes teacher visibility through
  `learn.classes`, which is correct on its own — but once `learn.classes` *also* needs a
  member-visibility policy, the two form a cycle that PostgreSQL rejects. The extra column makes
  `class_members` a leaf and removes the cycle without a `SECURITY DEFINER` helper. See
  `docs/learn/IDENTITY_SPINE_PLAN.md` §3.1.
- **`ON DELETE RESTRICT` on the class owner** — deleting a teacher account must not silently orphan
  or cascade-destroy a class full of student work. `ON DELETE CASCADE` everywhere else.
- **Guardian access is derived, not granted.** A guardian sees a child's data because
  `learn_guardian_links` says so *and* the child is a member of the class in question. There is no
  `role = 'parent'` row anywhere.
- **`status = 'pending'` on the guardian link is load-bearing.** A guardian link grants sight of a
  minor's work; it must be confirmed, never self-asserted. The confirmation flow is product work,
  but the column exists from day one so no code is written against a link that is assumed active.

---

## 6. Which user id new tables reference

**Every new `/learn` table that identifies a person does this, with no exceptions:**

```sql
user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
```

| Rule | |
|---|---|
| **Type** | `uuid`. 🛑 Never `text` / `varchar`. (`essay_submissions.student_id` is `character varying`, which is precisely why its root can never be enforced.) |
| **FK** | Always explicit and always to `auth.users(id)`. A bare `uuid` column holding a user id is forbidden — six existing tables did that and the audit still cannot say what they point at |
| **Name** | `user_id` when the row belongs to whoever it belongs to; `teacher_user_id` / `student_user_id` / `guardian_user_id` when the role matters |
| 🛑 **Forbidden name** | **`student_id`.** Six existing tables use it with no FK and an unresolved root. Reusing the name invites a future reader to assume the two are the same population. The `_user_id` suffix marks "this is the auth root" at a glance |
| **Never** | `public.users.id`, an email address, or a client-supplied id treated as trusted |

---

## 7. Legacy compatibility

### 7.1 `auth.users` — the root, untouched

Unchanged and unwritten. 19 existing tables already FK it, so `/learn` joining the same root means
premium status, word progress, pack claims and `/learn` records line up on one key for free — no
mapping, no backfill. No trigger is added (§0).

### 7.2 `user_profiles` — reused, additive only

Covered in §3. Existing GSAT behaviour is unaffected: the three current policies are not modified,
and `upsert_user_profile()` / `get_user_profile()` keep working exactly as they do now. The only
possible change is the additive roster-read policy of D2 (§10), which grants nothing that is not
already scoped to a class the caller belongs to.

### 7.3 `public.users` — quarantined

🛑 **`/learn` behaves as though this table does not exist.** Not read, not written, not referenced by
a FK, not joined, and **not repaired**.

Repairing it is tempting and wrong for this checkpoint: adding a FK to `auth.users`, or enabling RLS,
is a change to a table owned by a live application whose access patterns have never been analysed —
it is exactly the 9.1 work that is blocked pending that application's maintainer. Depending on it is
worse: its `is_admin` column is world-writable today.

If `/learn` ever needs a fact that only `public.users` holds, that is a **conversation with the
owning application's maintainer**, not a join.

### 7.4 The LMS `student_id` question stays open — and stops blocking

The audit could not determine whether LMS `student_id uuid` columns point at `auth.users.id` or
`public.users.id`, and that unknown has been blocking identity work since.

**This checkpoint decouples the two rather than answering it.** `/learn` anchors on `auth.users`, and
the standing rule already forbids `/learn` from depending on the shared LMS/Writing tables. So the
LMS root can remain unknown indefinitely without blocking a single `/learn` table. The question
returns only if and when the two applications must actually share data.

**If that day comes, the shape is already decided:** an explicit mapping table, never an assumed
equality.

```sql
-- Design only. Build ONLY when a real cross-application requirement exists.
CREATE TABLE learn_external_identity_map (
  learn_user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_source      text NOT NULL,   -- e.g. 'lms', 'writing'
  external_student_id  text NOT NULL,   -- text: the LMS's own is varchar
  confirmed_at         timestamptz,
  PRIMARY KEY (external_source, external_student_id)
);
```

Even if the ids turn out to be identical values, the map is what makes that a **verified claim**
instead of an assumption embedded in a join.

---

## 8. The RLS pattern for `/learn`

Every new table: **RLS ON, with its policies written in the same migration.** Never RLS-on-no-policy
(deny-all, breaks silently), never RLS-off.

### 8.1 The base pattern — a direct `auth.uid()` comparison

```sql
ALTER TABLE learn_class_members ENABLE ROW LEVEL SECURITY;

-- A member sees their own membership row.
CREATE POLICY learn_class_members_select_self
  ON learn_class_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
```

Note `TO authenticated` on every policy. A policy with no role clause applies to `public`, which
includes `anon` — that is the exact defect behind finding 9.8.

### 8.2 The recursion trap, and why the class owner is denormalised

The natural next policy is "a teacher of the class sees every member of that class". Written the
obvious way it reads `learn_class_members` from inside a policy **on** `learn_class_members`, which
Postgres rejects as infinite recursion.

**Resolution for the single-teacher case (the default): route through `learn_classes` instead.**

```sql
CREATE POLICY learn_class_members_select_by_owner
  ON learn_class_members FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM learn_classes c
    WHERE c.id = learn_class_members.class_id
      AND c.owner_teacher_user_id = auth.uid()
  ));
```

This is why `owner_teacher_user_id` sits on the class (§5). The policy references a *different*
table, so there is no recursion and no `SECURITY DEFINER` function.

### 8.3 The two justified `SECURITY DEFINER` cases

The standing rule is *avoid unless genuinely required*. Two cases in `/learn` qualify, and only two:

| # | Case | Why nothing else works |
|---|---|---|
| 1 | **Multi-teacher classes**, if the product ever needs co-teachers | The owner-column trick only covers one teacher. A co-teacher check must read `learn_class_members` from a policy on `learn_class_members` |
| 2 | **Class invite redemption** | The caller must be able to redeem a token without being able to *read* the invite table — otherwise every active invite becomes enumerable, which is finding 9.4 all over again |

Guard rails, mandatory for both:

```sql
CREATE FUNCTION learn_redeem_class_invite(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''          -- pinned, empty; every object below fully qualified
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;
  -- ... fully-qualified public./learn. references only ...
END;
$$;

REVOKE ALL     ON FUNCTION learn_redeem_class_invite(text) FROM PUBLIC;
REVOKE ALL     ON FUNCTION learn_redeem_class_invite(text) FROM anon;
GRANT  EXECUTE ON FUNCTION learn_redeem_class_invite(text) TO authenticated;
```

Three A1 lessons are baked into that block and are **not optional**:

1. **`search_path = ''` with every object fully qualified.** `%ROWTYPE` resolves at compile time, so
   it too must be written `public.learn_classes%rowtype`.
2. **Test the identity gate for a NULL caller explicitly.** A1's `IF NOT public.is_admin()` skipped
   its own UNAUTHORIZED branch because `is_admin()` returns **NULL**, not false, when `auth.uid()`
   is NULL — and PL/pgSQL treats a NULL `IF` condition as false. Any three-valued check must be
   written `IS NOT TRUE`, and there must be a test that calls with no identity at all.
3. **Verify the `REVOKE` actually applied.** During A1 the grants block silently failed to apply
   **twice** — on staging and again on Production — while every functional signal looked correct.
   The application gate and the `EXECUTE` grant are two independent layers and each needs its own
   `has_function_privilege` check.

### 8.4 Invites — `/learn` gets its own, and does not reuse `invite_tokens`

`invite_tokens` and `tokens` are readable by `anon` (finding 9.4, open) and possibly have a
cross-application caller. `learn_class_invites` therefore stores a **hash** of the token, never the
token itself, has **no** `anon` policy at all, and is reachable only through the
`SECURITY DEFINER` function above.

### 8.5 Storage

Any `/learn` bucket is created **private**, served through short-lived signed URLs, with object
policies carrying an owner predicate. 🛑 The `essays` / `Essays` buckets are **not** to be reused —
they are public, and their insert/update/delete policies have no owner predicate (finding 9.2, open).

---

## 9. ✅ D1 — DECIDED: a dedicated `learn` schema

**Owner decision, 2026-08-27: approved.** A dedicated `learn` schema; **not** `public` with a
`learn_` prefix. With these conditions, all of which the v1 migration implements and verifies:

| Condition | Where it is enforced | Check |
|---|---|---|
| `anon` gets no general access to `learn` | `REVOKE ALL ON SCHEMA learn FROM PUBLIC`; no grant to `anon` | V02, V03, V05, V10 · B03 |
| `authenticated` gets only what it needs | `USAGE` + `SELECT/INSERT/UPDATE`; **no `DELETE`** | V04, V11, V12 · B19 |
| Every table still RLS ON | policies written in the same migration | V07, V08 |
| Schema privilege is **not** a substitute for RLS | both layers tested separately | V07–V12 · B01–B25 |

The reasoning that led there:

| | `learn` schema **(recommended)** | `public` + `learn_` prefix |
|---|---|---|
| Ownership | Structural. "Everything in `learn` follows the new rules" is checkable in one query | Convention only — a prefix nobody is forced to honour |
| Second defence layer | `REVOKE ALL ON SCHEMA learn FROM anon` sits **underneath** RLS. Two independent layers, as A1 required | RLS only |
| R08 (open: can `authenticated` create objects in `public`?) | Sidestepped — `REVOKE CREATE ON SCHEMA learn FROM PUBLIC` from day one | Inherits whatever `public` currently allows |
| Collision with the shared application | Impossible | Possible — that application's future tables are not under our control |
| Setup cost | **One Dashboard change** — add `learn` to *Exposed schemas* in API settings | None |
| Client cost | `supabase.schema('learn').from(...)` / `.rpc(...)` — supported by supabase-js v2 | None |
| Risk | Low, but it is a project-level API setting change | None |

The whole shape of this audit came from `public` being an undifferentiated namespace shared by two
applications with no ownership marker. A separate schema fixes that structurally, for one Dashboard
setting.

The Exposed-schemas Dashboard step is **L6** of the staging plan and is walked on its own, per the
standing working rule.

---

## 10. ✅ D2 — DECIDED: Option A, narrowed

A class roster needs `user_profiles.display_name` for people other than the caller. Today
`user_profiles` is self-only, so a roster renders as a list of uuids.

| Option | Assessment |
|---|---|
| **A — an additive `SELECT` policy on `user_profiles`** scoped to "the caller shares an active class with this user, or is their confirmed guardian" **(recommended)** | Purely additive: the three existing policies are untouched, existing GSAT behaviour is unchanged, and it is enforced *in the database*. Needs the §8.2 non-recursive form |
| B — a `SECURITY DEFINER` roster function | Adds a third `SECURITY DEFINER` function for something a policy expresses directly. Contradicts the standing "avoid unless required" rule |
| C — duplicate `display_name` onto `learn_class_members` | Cheapest to write and the worst outcome: a second copy of profile data that drifts, and the beginning of a second identity store |

**Owner decision, 2026-08-27: Option A approved, with the predicate narrowed.** 🛑 The
"shares an active class" condition of the original recommendation was **rejected as too wide.** What
is granted:

| # | Rule | Implementation | Check |
|---|---|---|---|
| 1 | The existing self policy is **not modified** | untouched by the migration | V22 · B15 |
| 2 | A **class owner** may read the profiles of the active members of an active class they own | `user_profiles_select_by_class_owner` | V23 · B11, B22, B23 |
| 3 | A **confirmed guardian** may read their linked child's profile | `user_profiles_select_by_guardian`, `status = 'active'` only | V23 · B13, B14 |
| 4 | 🛑 A student gets **nothing** from merely sharing a class | no such predicate exists anywhere | V25 · **B10** |
| 5 | No pre-opening for a future need | v1 grants only rules 2 and 3 | — |
| 6 | `display_name` is **not** copied onto `class_members` | option C stays rejected | V06 |
| 7 | No `SECURITY DEFINER` unless RLS structurally cannot express it — otherwise **STOP and report** | ✅ **not triggered.** The spine contains zero functions; §3.1 of the spine plan shows how the recursion was removed structurally instead | **V13** |

Rule 2 is scoped to an **active** class, exactly as worded. Consequence worth knowing: archiving a
class also removes the teacher's view of its members' names (B23). If teachers later need to review
archived rosters, that is a narrowly-scoped follow-up policy — not something to pre-open now.

---

## 11. Migration posture — there is none

Nothing in this checkpoint moves data.

| | |
|---|---|
| New tables | Created empty |
| Existing tables | Untouched, except the possible additive policy of D2 |
| Backfill | None. There is no legacy `/learn` data to migrate |
| FKs added to existing tables | **None** |
| Rollback | `DROP` the new objects. Because nothing existing is modified, rollback cannot damage current behaviour |

That property is the point of doing this checkpoint before the schema rather than after: the identity
decision costs nothing to reverse today, and would cost a data migration to reverse later.

---

## 12. Compliance with the standing `/learn` rules

| Standing rule (`docs/BACKLOG.md`) | Where this design satisfies it |
|---|---|
| New tables: **RLS ON by default**, policies written at the same time | §8.1 — plus `TO authenticated` on every policy |
| New storage buckets: **private by default** | §8.5 |
| 🛑 **Do not introduce another users/identity table** | §2 (one root), §3 (reuse `user_profiles`), §4 (no role table), §10 option C rejected for exactly this reason |
| **`SECURITY DEFINER`**: avoid; if used, pin `search_path` and minimise `EXECUTE` | §8.2 avoids it structurally; §8.3 names the only two exceptions and their mandatory guard rails |
| 🛑 **Do not depend on the shared LMS/Writing tables or public buckets** | §7.3 (`public.users` quarantined), §7.4 (LMS root decoupled), §8.4 (own invites, not `invite_tokens`), §8.5 (own private bucket, not `essays`) |

---

## 13. Next step

D1 and D2 are answered, so the first migration exists: **`docs/learn/IDENTITY_SPINE_PLAN.md`** —
`learn.classes`, `learn.class_members`, `learn.guardian_links`, their policies, and the two D2
policies. It is dry-run clean locally (26/26 structural, 25/25 behavioural, rollback verified) and
awaits staging execution. Production is a separate, later approval.

🛑 **This checkpoint closes once the identity spine passes staging verification. It does not reopen
for adjacent findings** — those go to `docs/BACKLOG.md` under the interrupt rule. After it closes,
mainline returns to `/learn` product feature development: no A2, no shared LMS/Writing security, no
9.1 / 9.2, no bucket audit, no identity migration, unless the owner approves it separately.
