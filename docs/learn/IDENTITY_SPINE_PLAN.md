# `/learn` Identity Spine — migration v1 plan

> **Written:** 2026-08-27 · **Branch:** `claude/security-architecture-continuation-i3hw1y`
> **Owner decisions applied:** D1 = dedicated `learn` schema · D2 = additive `user_profiles`
> SELECT policies, narrowed
>
> 🛑 **NOT APPLIED ANYWHERE.** Staging first. Production only after the owner approves a separate
> Production deployment plan.
>
> ✅ **Locally dry-run against a Supabase-shaped PostgreSQL 16.13:** migration applies (twice —
> idempotent), **26/26 structural checks PASS**, **25/25 behavioural checks PASS**, rollback restores
> the baseline exactly. See §4.

---

## 1. Frozen scope

Exactly what the owner listed, and nothing else:

`learn` schema · schema privileges · `learn.classes` · `learn.class_members` ·
`learn.guardian_links` · constraints / FKs / indexes · RLS ON · minimum policies ·
the D2 additive `user_profiles` SELECT policies · verification SQL.

**Files:**

| File | Purpose |
|---|---|
| `docs/learn/learn-identity-spine.sql` | The migration. Idempotent |
| `docs/learn/learn-identity-spine.rollback.sql` | Exact reversal. No `CASCADE` anywhere |
| `docs/learn/learn-identity-spine-VERIFY.sql` | 26 structural checks, one result set |
| `docs/learn/learn-identity-spine-BEHAVIOUR.sql` | 25 behavioural checks, one result set |

🛑 They live under `docs/`, not `supabase/migrations/`, so committing them cannot trigger a Vercel
deployment or be mistaken for an applied migration. They move to `supabase/migrations/` only when the
owner approves Production.

---

## 2. Database objects

### 2.1 CREATED

| Object | Kind | Notes |
|---|---|---|
| `learn` | schema | `REVOKE ALL FROM PUBLIC`; `USAGE` to `authenticated` + `service_role` only. **`anon` gets nothing** |
| `learn.classes` | table | `id`, `owner_teacher_user_id` → `auth.users` **ON DELETE RESTRICT**, `name`, `status ∈ (active, archived)`, timestamps |
| `learn.class_members` | table | `class_id`, `class_owner_teacher_user_id`, `user_id` → `auth.users` **CASCADE**, `role ∈ (teacher, student)`, `status ∈ (active, removed)` |
| `learn.guardian_links` | table | `guardian_user_id`, `student_user_id` (both → `auth.users` CASCADE), `status ∈ (pending, active, revoked)`, `confirmed_at` |
| `classes_id_owner_key` | UNIQUE | `(id, owner_teacher_user_id)` — the composite-FK target |
| `class_members_class_fk` | FK | `(class_id, class_owner_teacher_user_id)` → `classes(id, owner_teacher_user_id)` **ON UPDATE CASCADE ON DELETE CASCADE** |
| `class_members_class_user_key` | UNIQUE | `(class_id, user_id)` — one row per person per class |
| `guardian_links_pair_key` | UNIQUE | `(guardian_user_id, student_user_id)` |
| `guardian_links_not_self` | CHECK | a person cannot be their own guardian |
| 6 indexes | index | `idx_classes_owner`, `idx_class_members_user`, `idx_class_members_owner`, `idx_class_members_class_owner`, `idx_guardian_links_student`, `idx_guardian_links_guardian` |
| 10 policies | policy | 3 on `classes`, 3 on `class_members`, 4 on `guardian_links` — **all `TO authenticated`** |
| 6 table grants | privilege | `SELECT, INSERT, UPDATE` to `authenticated` on all three. 🛑 **No `DELETE`, to anyone but `service_role`** |

### 2.2 MODIFIED

| Object | Change |
|---|---|
| `public.user_profiles` | **Two policies ADDED**, `TO authenticated`: `user_profiles_select_by_class_owner`, `user_profiles_select_by_guardian`. Nothing else — no column, no grant, no change to the existing three policies |

### 2.3 EXPLICITLY NOT TOUCHED

`public.users` (not read, written, joined, FK'd or repaired) · `auth.users` (no trigger, no write) ·
`is_admin()` · every LMS/Writing table · every storage bucket · `supabase/migrations/` ·
`api/` · `src/` · anything in the reserved `/exam` domain.

**No table, function, or grant outside the list in 2.1 and 2.2 is created or altered.**

---

## 3. Two design points settled while building this

### 3.1 The denormalised class owner — and why it is a security object, not an optimisation

`learn.class_members` carries `class_owner_teacher_user_id`, a copy of its class's owner.

It exists because the two policies the product needs form a cycle:

```
teacher sees the members of their class   →  policy on class_members must read classes
student sees the class they belong to     →  policy on classes must read class_members
```

PostgreSQL rejects that as *infinite recursion detected in policy*. The usual escape is a
`SECURITY DEFINER` helper — which the standing rules tell us to avoid. The copied column removes the
need for one: every `class_members` policy becomes a **direct comparison against `auth.uid()`**, so
`class_members` is a leaf, and the policy graph is `user_profiles → classes → class_members → ∅`,
provably acyclic.

**The copy cannot drift**, because it is not maintained by application code or a trigger. The
composite FK is the *only* link to `learn.classes`, so `class_id` and the owner are validated
**together**, and `ON UPDATE CASCADE` rewrites every member row when a class changes hands.
Behavioural checks B18, B24 and B25 prove both halves.

### 3.2 `TO authenticated` on the `user_profiles` policies is load-bearing

`anon` has no `USAGE` on schema `learn`. If the two new policies applied to `PUBLIC` — which is what
a policy with no role clause does — then an **anonymous** read of `user_profiles` would evaluate a
predicate touching `learn.*` and raise `42501` instead of returning zero rows. That is a behaviour
change to the existing GSAT app, introduced by a policy that was supposed to be purely additive.

`TO authenticated` means the expression is never evaluated for `anon` at all. **B04 is the test that
proves it**, and it was the reason to write that test.

### 3.3 D2 point 7 — no `SECURITY DEFINER` was needed

The owner's instruction was to STOP and report if RLS could not express the narrowed model without a
`SECURITY DEFINER` function. **It can.** The whole spine contains zero functions —
structural check **V13** asserts that schema `learn` holds no function of any kind, so a future one
cannot be added quietly.

---

## 4. Local dry-run — already done

Run against PostgreSQL 16.13 with a Supabase-shaped baseline: `auth.users`, the real
`auth.uid()` definition, the `anon` / `authenticated` / `service_role` roles, `public.user_profiles`
exactly as `supabase/migrations/create_user_profiles_table.sql` leaves it, and a stub `public.users`
that the spine must never touch.

| Step | Result |
|---|---|
| `learn-identity-spine.sql` applied | ✅ clean |
| Applied a **second** time | ✅ clean — idempotent |
| `learn-identity-spine-VERIFY.sql` | ✅ **26 / 26 PASS** |
| `learn-identity-spine-BEHAVIOUR.sql` | ✅ **25 / 25 PASS** |
| `learn-identity-spine.rollback.sql` | ✅ schema gone; `user_profiles` back to exactly its 3 original policies |

**Four defects the dry-run caught before staging ever saw them** — the reason this step exists:

| # | Defect | Fix |
|---|---|---|
| 1 | `V15`/`V16` compared `confupdtype` (`"char"`) with `||` — *operator is not unique* | explicit `::text` casts |
| 2 | B16 returned `23505`, not `42501` — the UNIQUE constraint fired **before** RLS, so the test was measuring the wrong layer | insert a user who is not already a member |
| 3 | B17 returned `23503` — the composite FK rejected the forged owner **before** RLS | split into two tests: B17 proves RLS, **B18** proves the FK layer independently |
| 4 | The harness's own `auth.uid()` cast `''::json` before `nullif`, so every NULL-identity test failed with `22P02` | corrected to Supabase's real shape (`nullif` first). ⚠️ **A harness bug, not a design bug** — worth recording, because it briefly looked like a real NULL-identity failure |

Defects 2 and 3 are the A1 lesson repeating: *a check that passes for the wrong reason reads as
evidence.* Both tests were green-adjacent and both were measuring a constraint layer rather than the
policy layer they claimed to test.

---

## 5. Verification plan

Three independent layers. All three are required; none substitutes for another.

### 5.1 Structural — `learn-identity-spine-VERIFY.sql` (26 checks, one grid)

Catalog assertions: schema exists · **`anon` has no USAGE and no CREATE** · `authenticated` has USAGE
· PUBLIC has nothing · exactly 3 tables · RLS on every one · no RLS-with-zero-policies · **every
policy is `TO authenticated` only** · **`anon` holds no privilege on any `learn` table** ·
`authenticated` holds SELECT/INSERT/UPDATE but **no DELETE** · **no function in `learn`** · **no
default privileges on `learn`** (a future table fails closed) · the composite FK with `ON UPDATE
CASCADE` · the owner FK with `ON DELETE RESTRICT` · exactly 4 FKs to `auth.users` · **zero FKs to
`public.users`** · **no column named `student_id`** · every `*_user_id` is `uuid` · the 3 UNIQUE
constraints · the 3 original `user_profiles` policies intact · the 2 new ones present and
`authenticated`-only · `user_profiles` has exactly 5 policies · the 6 indexes.

> ⚠️ **One check needs a baseline first.** V24 asserts `user_profiles` ends with **5** policies —
> correct only if it currently has the **3** from the migration file. Step **L1** captures that count
> on staging before anything is applied. If staging shows a different number, V24's expected value is
> adjusted and the difference is recorded, not silently absorbed.

### 5.2 Behavioural — `learn-identity-spine-BEHAVIOUR.sql` (25 checks, one grid)

Actually assumes each identity and reads through RLS.

| Boundary | Checks |
|---|---|
| **NULL identity** | B01, B02 — 0 rows, **no error** |
| **anon** | B03 denied on `learn.*` at the privilege layer · **B04** `user_profiles` still returns 0 rows, not an error |
| **teacher** | B05 own class only · B06 both members · B11 both student profiles |
| **other teacher** | B07 no members · B12 no profile · B17 cannot add a member (RLS) · B18 cannot forge the owner column (FK) |
| **student** | B08 own membership row only · **B09 can see their class — the anti-recursion proof** · **B10 CANNOT read a classmate's profile (D2 point 4)** · B15 self profile still readable · B16 cannot add a member |
| **guardian** | **B13** confirmed link → can read · **B14** pending link → nothing · **B20** cannot self-activate · B21 the student can activate |
| **derived state** | B22 removing a member revokes the teacher's view · B23 archiving the class revokes it · B24/B25 owner transfer cascades and reverts |
| **grants** | B19 `authenticated` cannot DELETE |

Every mutating test reverts itself.

### 5.3 Transport — through PostgREST, from a browser

SQL alone cannot prove this, and A1 proved why it matters: the privilege layer and the RLS layer are
independent, and a grants block silently failed to apply **twice** while every functional signal
looked correct.

| # | With | Expect |
|---|---|---|
| T1 | staging **anon** key → `GET /rest/v1/classes` with `Accept-Profile: learn` | **`42501` / permission denied** |
| T2 | staging anon key → `GET /rest/v1/user_profiles` | 200, `[]` — **not an error** |
| T3 | logged-in **teacher A** → `learn.classes` | their class |
| T4 | logged-in **student S1** → `learn.class_members` | exactly 1 row |
| T5 | logged-in **student S1** → `user_profiles?user_id=eq.<S2>` | `[]` |
| T6 | logged-in **teacher A** → `user_profiles?user_id=eq.<S1>` | 1 row |

---

## 6. Staging execution plan

🛑 Production is not touched at any point below. Dashboard steps are marked **[DASHBOARD]** and are
walked **one at a time** — I stop and wait after each.

| Step | What | Who |
|---|---|---|
| **L0** | **Confirm the target is staging, not Production.** Read back the project ref from the SQL Editor and compare it to `gsat-staging`. 🛑 Nothing else runs until this matches | me → you confirm |
| **L1** | **Capture the pre-migration baseline**: `user_profiles` policy count and names, whether schema `learn` already exists, and the current Auth user list | you run 1 query, paste the result |
| **L2** | **Decide the five test actors.** From L1's user list, either map the five slots to existing staging users, or create the missing ones — **[DASHBOARD]**, one user at a time. I then edit `public._learn_actors` to match | you |
| **L3** | Apply `learn-identity-spine.sql` in the staging SQL Editor | you paste, I read the result |
| **L4** | Run `learn-identity-spine-VERIFY.sql` → expect **26 / 26 PASS** | you paste the grid |
| **L5** | Run `learn-identity-spine-BEHAVIOUR.sql` → expect **25 / 25 PASS** | you paste the grid |
| **L6** | **[DASHBOARD]** Project Settings → API → **Exposed schemas**: add `learn`. One step, on its own | you |
| **L7** | Transport tests T1–T6 from the browser against staging | you paste results |
| **L8** | **Rollback rehearsal**: run the rollback, confirm the baseline from L1 is restored exactly, then re-apply and re-run V + B. ⚠️ A1 never rehearsed its rollback; this one will be rehearsed before Production is even proposed | you |
| **L9** | Record everything in `docs/learn/IDENTITY_SPINE_STAGING_RESULTS.md` | me |

**Stop conditions.** Any FAIL in L4, L5 or L7 stops the run. I diagnose and report; I do not
re-run hoping for a different answer, and I do not adjust an expected value to match an actual one
without saying so explicitly and explaining why the original expectation was wrong.

**If a `SECURITY DEFINER` function turns out to be unavoidable** — it was not in the dry-run — I stop
and report, per D2 point 7. I do not add one on my own judgement.

---

## 7. Deliberately NOT in v1

Class invites and self-service join (needs the finding 9.4 lesson applied — hashed token, no `anon`
read) · any storage bucket (no product need at this stage) · any `SECURITY DEFINER` function · any
global role table · `updated_at` triggers · assignment / progress / analytics tables · any `/learn`
frontend route.

---

## 8. Production

**Not yet.** After staging passes end to end, I produce a **separate Production deployment plan** for
approval. It will follow the A1 shape that worked: SQL first, one step at a time, an explicit
rollback prepared in advance, and both verification layers re-run against Production afterwards —
including the grant checks, because that is exactly where A1's silent failure hid.
