# `/learn` Identity Spine v1 — Production deployment plan

> **Status:** 🛑 **PROPOSED — awaiting an explicit owner decision. Nothing has been deployed.**
> **Written:** 2026-08-27 · **Evidence:** `docs/learn/IDENTITY_SPINE_STAGING_RESULTS.md`
>
> Staging passed end to end: 26/26 structural, 25/25 behavioural, 6/6 transport, rollback rehearsed
> and the rebuild re-verified.

---

## 1. The recommendation in one line

**Apply the SQL. Do NOT add `learn` to Production's Exposed schemas yet.**

There is no `/learn` frontend. Nothing in the browser needs to reach `learn.*` today, and the one
serious operational hazard found on staging (§2) exists *only* while the schema is exposed. Deferring
that Dashboard step until the frontend actually needs it means:

- the deployment carries **no Data API risk at all**, in either direction;
- the rollback becomes **pure SQL** with no outage window;
- `learn.*` is unreachable from the browser even by an authenticated user, so the tables sit inert
  behind two locked doors instead of one.

The Exposed-schemas step then happens later, on its own, when the first `/learn` screen is built.

---

## 2. Why that matters — the staging finding

At rehearsal step L8-2, with `learn` listed under Exposed schemas but the schema dropped, PostgREST
could not build its schema cache and **the entire Data API returned 503**:

```
GET /rest/v1/user_profiles   ->  503  PGRST002
```

`public.user_profiles` is the live app's own table and does not touch `learn`. On Production that
window is a **full outage of the site's API**.

Two orderings are therefore forced, and they are opposites:

| Direction | Order |
|---|---|
| **Apply** | SQL first, Exposed schemas second |
| **Rollback** | Exposed schemas first, SQL second |

Skipping the Exposed-schemas step entirely, as recommended, removes both hazards for this deployment.

---

## 3. Why this is safe on Production — it is inert

The migration creates three **empty** tables and adds two policies whose predicates read those empty
tables. An `EXISTS` over an empty table is false for everyone. So:

> **Until the first class is created, the two new `user_profiles` policies cannot grant a single row
> to a single person.**

That is not an argument — it is measured, twice, by the same script. `learn-identity-spine-PROD-CHECKS.sql`
takes a **per-user census**: for every real account, how many `user_profiles` rows can that account
actually see. Run before and after, the digest must be **byte-identical**.

| Check | Before | After | Meaning |
|---|---|---|---|
| **C02** sum of rows visible across all users | *baseline* | **must match** | nobody gained visibility |
| **C03** max rows visible to any one user | *baseline* | **must match** | no single account gained a wider view |
| C04 `user_profiles` policy count | *baseline* | baseline **+ 2** | the only intended change |
| C07 `learn` row counts | n/a | `0 / 0 / 0` | the tables are empty, so the policies are inert |

If C02 or C03 moves by even one, the deployment is rolled back and I report — no interpretation, no
"probably fine".

---

## 4. Differences from the staging run

| | Staging | Production |
|---|---|---|
| `auth.users` | 3 + 3 created | **22 real accounts** |
| `public.users` | does not exist | **exists** — so **V18 becomes a real check**, not a vacuous one |
| `user_profiles` baseline | 3 policies | ❓ **must be measured at P1.** V24's expected value is baseline + 2, whatever the baseline is |
| Behavioural test file | run — it creates fixtures | 🛑 **NOT run.** It would write `FIXTURE` rows and fake classes into live data |
| Read-only checks | — | `learn-identity-spine-PROD-CHECKS.sql`, run twice |
| Exposed schemas | added | **not added** (§1) |
| Test accounts | 5 created | **none created** |

---

## 5. Steps

Every step is walked one at a time. I stop and wait after each.

| Step | What | Expect |
|---|---|---|
| **P0** | **Confirm the target is Production.** Read back `auth.users` count and whether `public.users` exists | `22`-ish, `public.users` present. 🛑 If it looks like staging, stop |
| **P1** | Run `learn-identity-spine-PROD-CHECKS.sql` → **baseline**. Also capture `user_profiles` policy names | recorded verbatim, before anything changes |
| **P2** | Apply `learn-identity-spine.sql` | `Success. No rows returned.` |
| **P3** | Run `learn-identity-spine-PROD-CHECKS.sql` again → **compare with P1** | C02, C03 **identical**; C04 = baseline + 2; C07 = `0 / 0 / 0`; C08 = `denied 42501` |
| **P4** | Run `learn-identity-spine-VERIFY.sql` | **26 / 26 PASS**, with **V18 now a real check** reporting `0`, and V24 = baseline + 2 |
| **P5** | Live-site regression, in the browser: log in as a real user, load the pages that read `user_profiles`, confirm nothing changed | normal behaviour |
| **P6** | Record the outcome in this file | — |

**Not in this deployment:** Exposed schemas · any fixture · any test account · any storage bucket ·
any frontend change · `supabase/migrations/` (the file moves there only when `/learn` code lands).

---

## 6. Rollback

Prepared in advance, as A1's was: `docs/learn/learn-identity-spine.rollback.sql`.

Because `learn` is **not** exposed (§1), the mandatory Exposed-schemas pre-step in that file **does
not apply to this deployment** — there is nothing to remove. The rollback is pure SQL, has no API
window, and touches no existing data: it drops the two added policies and the three empty tables, and
leaves the original three `user_profiles` policies exactly as they were. Rehearsed on staging at L8.

🛑 If the Exposed-schemas step is ever performed later, the pre-step at the top of the rollback file
becomes mandatory again from that moment on.

**Trigger to roll back:** any C02/C03 movement at P3, any FAIL at P4, or any regression at P5.

---

## 7. What this does NOT do

It does not start `/learn` feature work, touch `public.users`, resolve the LMS `student_id` root
question, reopen A2 or 9.1 / 9.2, or audit anything. Per the owner's instruction, once the spine is
deployed and verified the identity checkpoint is **CLOSED** and mainline returns to `/learn` product
features.
