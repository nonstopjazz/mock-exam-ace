# `/learn` Identity Spine v1 — staging results

> **Project:** `gsat-staging` · **Date:** 2026-08-27
> **Migration:** `docs/learn/learn-identity-spine.sql`
> **Result:** ✅ **PASSED** — 26/26 structural, 25/25 behavioural, 6/6 transport, rollback rehearsed
>
> 🛑 **Production has NOT been touched.** This document is the evidence for proposing a Production
> deployment, not a record of one.

---

## 1. The run

| Step | What | Result |
|---|---|---|
| **L0** | Confirm the target is staging, not Production | ✅ `auth_users = 3` (Production holds 22), `learn` absent |
| **L1** | Pre-migration baseline | ✅ `user_profiles` = **3** policies, all `PUBLIC`, RLS on; `learn` does not exist |
| **L2** | Five test actors | ✅ S1/S2 reuse existing accounts; TA, TB, G1 created |
| **L3** | Apply the migration | ✅ `Success. No rows returned.` |
| **L4** | Structural verification | ✅ **26 / 26 PASS** |
| **L5** | Behavioural verification | ✅ **25 / 25 PASS** |
| **L6** | `learn` added to Exposed schemas | ✅ done |
| **L7** | Transport tests through PostgREST | ✅ **6 / 6 PASS** |
| **L8** | Rollback rehearsal | ✅ baseline restored exactly, then rebuilt; **26/26 + 25/25 again**. ⚠️ Found a real defect — §3 |
| **L9** | This record | ✅ |

**L1's baseline is what makes V24 meaningful.** It asserts `user_profiles` ends with exactly 5
policies, which is only a real check because we first measured that it started with 3.

---

## 2. What was proved, and by which layer

Three independent evidence chains. None substitutes for another — a lesson A1 paid for.

| Property | Structural | Behavioural | Transport |
|---|---|---|---|
| `anon` cannot reach `learn.*` | V02, V03, V05, V10 | B03 | **T1** |
| The existing app is unaffected by the new policies | V22, V24 | B04, B15 | T2 |
| A student cannot read a classmate's profile (**D2 point 4**) | V25 | **B10** | **T5** |
| A teacher can read their own students' profiles | V23 | B11 | **T6** |
| A confirmed guardian can; a pending one cannot | — | **B13 / B14** | — |
| No policy recursion | — | **B09** | T4 |
| `authenticated` cannot DELETE | V12 | B19 | — |
| No `SECURITY DEFINER` anywhere (**D2 point 7**) | **V13** | — | — |
| The denormalised owner cannot drift | V15 | B18, B24, B25 | — |

**B09 is the one that could have sunk the design.** Had the denormalisation not removed the policy
cycle, it would have returned `42P17 infinite recursion detected in policy` on real PostgreSQL. It
returned `1`.

**T1 is the one that matters most operationally.** Holding the anon key that ships in every browser
bundle, `learn.*` is refused at the **privilege** layer, before RLS is consulted. That is D1's second
defence line, working.

---

## 3. 🛑 The defect the rollback rehearsal found

**An exposed schema that does not exist takes down the ENTIRE Data API.**

Measured at step **L8-2**, in the window after the rollback dropped `learn` but while `learn` was
still listed under Exposed schemas:

```
GET /rest/v1/user_profiles   ->  503
{"code":"PGRST002","message":"Could not query the database for the schema cache. Retrying."}
```

That request does not touch `learn`. `public.user_profiles` — the live app's own table — returned the
same 503. PostgREST could not build its schema cache **at all**.

| | |
|---|---|
| **Cost if it had happened on Production** | A full outage of the live site's API for the duration of the rollback |
| **Why it was nearly missed** | The rollback file said to remove the Exposed schema *afterwards*. That ordering reads as harmless tidy-up. It is not |
| **Fix** | Now a **mandatory pre-step at the top of the rollback file**, with the measurement quoted inline |
| **Recovery** | Re-create the schema, or remove it from Exposed schemas. Either resolves the mismatch; PostgREST recovers on its own. No data is at risk |
| **Trap** | The instinct during the outage — "the rollback broke it, roll back further" — is exactly wrong. The fix is forward, or in the Dashboard |

This is the entire argument for rehearsing a rollback. A1 shipped without one.

**A second, quieter lesson:** the SQL Editor connects directly to the database and never goes through
PostgREST. Throughout the outage, L4's and L5's 51 checks would all still have passed. Structural and
behavioural verification are blind to this failure by construction — only the transport tests see it.

---

## 4. Defects found before staging (local dry-run)

Four, all in the test harness rather than the design — recorded because two of them are the same
failure mode A1 kept producing: **a check that passes for the wrong reason reads as evidence.**

| # | Defect | Fix |
|---|---|---|
| 1 | `V15`/`V16` compared `confupdtype` (`"char"`) with `\|\|` — *operator is not unique* | explicit `::text` |
| 2 | B16 returned `23505`: the UNIQUE constraint fired **before** RLS, so the test measured the wrong layer | insert a user who is not already a member |
| 3 | B17 returned `23503`: the composite FK rejected the forged owner **before** RLS | split — B17 proves RLS, **B18** proves the FK layer independently |
| 4 | The harness's own `auth.uid()` cast `''::json` before `nullif` → every NULL-identity test failed with `22P02` | corrected to Supabase's real shape. **A harness bug, not a design bug** |

## 5. Defect found during staging

| # | Defect | Fix |
|---|---|---|
| 5 | **V18 aborted the whole verification script.** It used a hard `'public.users'::regclass`, and `public.users` — an LMS table — does not exist on staging at all | `to_regclass`, and the detail column now says **"check is vacuous"** where the table is absent, instead of printing a bare `0` that would read as evidence. ⚠️ On Production `public.users` **does** exist, so V18 is a real check there |

---

## 6. What is in staging now

`learn` schema with three tables and 10 policies · two additive `user_profiles` policies ·
`learn` in Exposed schemas · fixture data: 2 classes (`FIXTURE C1` / `FIXTURE C2`), 2 memberships,
2 guardian links, 5 `user_profiles` rows named `FIXTURE xx`.

🛑 **Staging is retained** until the Production rollback window closes. Teardown is the owner's call.

---

## 7. Next

A **Production deployment plan** — `docs/learn/IDENTITY_SPINE_PRODUCTION_PLAN.md` — for approval.
Nothing goes to Production before an explicit owner decision.
