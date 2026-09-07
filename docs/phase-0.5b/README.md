# Phase 0.5B-A1 — Prepared Changes (NOT DEPLOYED)

> 🛑 **Nothing in this folder has been applied to Production.** These are prepared artefacts for
> review. No Production object was modified while producing them.

Covers **A1-1**, **A1-2** and **A1-6** — the three items that touch `admin_grant_premium` and
`admin_revoke_premium`. A1-3 (TTS) and A1-4 (cron) are separate app-code changes, not yet drafted.

| File | Purpose | Changes data? |
|------|---------|---------------|
| `A1-premium-functions.sql` | The change: admin authorization, EXECUTE tightening, duplicate/revoke fix | ❌ No |
| `A1-premium-functions.rollback.sql` | Restores the exact pre-change definitions and grants | ❌ No |
| `A1-verification.sql` | Structural, data-invariant and behavioural checks | Section C only, staging |
| `DATA-REMEDIATION-duplicate-membership.sql` | 🛑 Approval-gated cleanup of the one existing duplicate | ✅ **Yes — 1 row** |

### Why these live in `docs/` and not `supabase/migrations/`

`supabase/migrations/` is the apply location, and its files have historically been pasted straight
into the SQL Editor. Putting an unapproved change there risks it being run by accident. Move it at
deploy time.

---

## 1. Caller analysis (constraint 4)

You asked for this before choosing an approach. It is what makes Option A viable.

### 1.1 `admin_revoke_premium` — callers in this repository

**Exactly one.** `src/pages/admin/UsersAdmin.tsx:158`, reached from line 548:

```tsx
onClick={() => handleRevokePremium(user.id, premiumCache[user.id]!.id)}
```

Three observations decide the design:

1. **The button is labelled 「收回 Premium」 and sits on a user row.** Its intent is *per-user*.
2. **`premiumCache[user.id]` is the newest active membership** for that user
   (`fetchPremiumStatuses`, lines 106–110, keeps the row with the latest `granted_at`). The id is
   passed as a *handle to the user*, not as a deliberate choice of which row to revoke.
3. **After a successful revoke the UI sets `premiumCache[userId] = null`** (line 552) — it already
   assumes the user is now entirely non-Premium.

> **Conclusion: the UI already has per-user semantics. The RPC's per-row behaviour is the bug, not a
> contract anyone depends on.** Redefining the function to revoke the user's Premium makes it agree
> with what its only caller already believes.

Today's user-visible symptom: the badge clears optimistically, then **reappears on the next refresh**
because `is_premium_member()` still sees the other row.

### 1.2 `admin_grant_premium` — callers in this repository

**Exactly one**, `UsersAdmin.tsx:140`. It reads **only `rpcError`** and ignores the returned JSON
entirely — so the return shape can be enriched freely without breaking anything.

Its duration options are `3months` / `6months` / `1year` / `forever`, which confirms **renewal is a
real workflow**. That is why a naïve "skip if already active" would be wrong (§2.2).

### 1.3 Callers outside this repository

**Cannot be proven absent**, and I will not claim otherwise. `EXECUTE` is currently granted to
PUBLIC, so anything holding any key can call these. What can be said:

| Evidence | Points to |
|----------|-----------|
| `premium_memberships.user_id` and `.granted_by` both FK → `auth.users` | GSAT-owned |
| The LMS/Writing app's identity root is `public.users`, which has **no** FK to `auth.users` | Not the LMS's table |
| `premium_memberships` is **not** among the 22 unaccounted tables | GSAT-owned |
| `is_premium_member()` is called only by `claim_pack_with_token()` — GSAT | GSAT-only consumer |
| Premium gates `packs.is_premium`, a GSAT vocabulary-pack concept | GSAT-only concept |

**Assessment: very likely GSAT-exclusive.** To close the gap before deploying, run:

```sql
-- Requires pg_stat_statements. Read-only.
SELECT calls, query
FROM pg_stat_statements
WHERE query ILIKE '%admin_revoke_premium%'
   OR query ILIKE '%admin_grant_premium%'
   OR query ILIKE '%premium_memberships%'
ORDER BY calls DESC;
```

If unavailable, the Supabase Dashboard's API logs filtered on `rpc/admin_revoke_premium` over a
30-day window answers the same question.

**Residual risk if an unknown caller does exist:** it would be one that deliberately revokes a single
membership while leaving another active — i.e. one that *relies on the bug*. Given both current rows
are permanent and identical, no such behaviour is plausible here.

---

## 2. Design (constraints 1, 2, 3)

### 2.1 `admin_revoke_premium` — signature kept, semantics corrected

Signature stays `(p_membership_id uuid) -> json`. The id now resolves the **user**, and every active
membership for that user is deactivated.

**Guarantee (constraint 3):** the `UPDATE` targets `is_active = true`, a strict superset of what
`is_premium_member()` inspects (`is_active AND (expires_at IS NULL OR expires_at > now())`).
So after `success`, `is_premium_member()` is necessarily `false`. The success-but-still-premium
outcome becomes structurally impossible.

Two small behaviour changes, both improvements:
- `revoked_count` is returned, so verification is possible.
- An unknown membership id now returns `MEMBERSHIP_NOT_FOUND` instead of silently reporting success.

Revoking a user with nothing active returns `success: true, revoked_count: 0` — revoke is idempotent,
and the postcondition already holds.

### 2.2 `admin_grant_premium` — idempotent, with extension

Pure "skip if active" would satisfy constraint 2 but **break renewals**: an admin renewing a user
whose Premium expires next week would get silent no-op. So:

| Situation | Action | `action` |
|-----------|--------|----------|
| No effective membership | `INSERT` | `granted` |
| Effective membership, new grant extends coverage | `UPDATE` in place | `extended` |
| Effective membership, new grant same or shorter | **no write** | `already_active` |

"Extends" = new expiry is `NULL` (permanent), or the existing expiry is non-NULL and the new one is
later.

**A grant never silently shortens coverage.** Granting 3 months to someone holding a permanent
membership returns `already_active` and writes nothing — the admin can see that and revoke-then-grant
if a downgrade was truly intended. Silently shortening a paid entitlement is the worse failure.

**At most one active row per user is maintained by construction**, satisfying constraint 2 without a
schema constraint.

### 2.3 Backward compatibility (constraint 1)

| Surface | Change |
|---------|--------|
| `admin_grant_premium` signature | ✅ unchanged |
| `admin_revoke_premium` signature | ✅ unchanged |
| Return shape | ✅ superset of `{success: true}`; the only caller reads just `rpcError` |
| **`UsersAdmin.tsx`** | ✅ **no change required** |
| `usePremium.ts` | ✅ untouched |
| `is_premium_member` / `claim_pack_with_token` | ✅ untouched |
| Table schema | ✅ untouched — no columns, constraints or indexes |
| Data | ✅ untouched (remediation is separate and gated) |

> **There is no code diff for A1-1 / A1-2 / A1-6.** The whole change is two `CREATE OR REPLACE`
> statements plus grant adjustments. That is the strongest argument for Option A.

---

## 3. Option comparison (constraint 5)

Constraint 5 asked for the alternative only if Option A cannot safely work. **It can**, so Option B is
recorded for completeness, not proposed.

| | **Option A — keep signature (RECOMMENDED)** | Option B — new revoke-by-user RPC |
|---|---|---|
| Signature | `admin_revoke_premium(p_membership_id)` unchanged | New `admin_revoke_premium_for_user(p_user_id)` |
| UI change | **None** | `handleRevokePremium` must pass `user.id` |
| New objects | None | One new function to grant, document, secure |
| Old function | Corrected in place | Must be deprecated, or left as a live footgun |
| Semantic honesty | Slightly indirect — takes a membership id, acts per user | Names exactly what it does |
| Risk if an unknown caller relies on single-row revoke | Behaviour changes for it | Old behaviour preserved |
| Rollback | One `CREATE OR REPLACE` | Function drop + UI revert |

**Recommendation: Option A.** The UI's intent is already per-user (§1.1), so Option A removes a
mismatch rather than introducing one, and needs no application change. Option B's only real advantage
is naming — worth doing during Phase 1's broader admin rework, not in a hotfix.

**Choose Option B instead if** the `pg_stat_statements` check reveals an external caller that
genuinely depends on single-row revoke. In that case, say so and I will draft it.

---

## 4. Verification performed (local, throwaway Postgres)

Executed against a disposable PostgreSQL 16.13 instance seeded with the **real production duplicate**
(user `36258aeb…`, ids `93fa86e3…` / `7c3dbb79…`, both permanent, 11s apart) and stub
`auth.uid()` / `is_admin()` / `is_premium_member()` matching the production bodies. The instance was
destroyed afterwards and never touched Production.

**Baseline — bug reproduced against the *current* production definitions:**

```
revoke via UI-style single id -> {"success" : true}
is_premium_member AFTER revoke = true     <-- reports success, user still Premium
```

**After applying `A1-premium-functions.sql`:**

| Test | Result |
|------|--------|
| T0 non-admin grant | `{"success": false, "error": "UNAUTHORIZED"}` ✅ |
| T0 non-admin revoke | `{"success": false, "error": "UNAUTHORIZED"}` ✅ |
| T1 first grant (3mo) | `granted` ✅ |
| T2 re-grant shorter (1mo) | `already_active`, still **1** active row ✅ |
| T3 grant 1yr | `extended` ✅ |
| T4 grant forever | `extended` ✅ |
| T4b grant 3mo over permanent | `already_active` — no silent shortening ✅ |
| Active rows after T1–T4b | **exactly 1**, permanent ✅ |
| **T5 revoke the real duplicate via one id** | `revoked_count: 2` → active rows **0**, `is_premium_member` **false** ✅ |
| T6 revoke again | `success: true, revoked_count: 0` ✅ |
| T7 unknown id | `MEMBERSHIP_NOT_FOUND` ✅ |
| V03 `anon` EXECUTE | `false` on both ✅ |
| V03 `authenticated` EXECUTE | `true` on both ✅ |
| Rollback applies cleanly | old ungated behaviour and `anon` EXECUTE restored, `proconfig` back to none ✅ |

Local testing is not staging. It proves the SQL is syntactically valid and the logic sound; it does
not exercise real RLS, real JWTs, or the real `is_admin()`.

---

## 5. ⚠️ One decision needed: `search_path` crosses the A1/A2 line

Both functions are also on the **A2** list (finding 9.7). Since A1 rewrites both bodies in full,
`SET search_path = ''` is included here rather than rewriting the same two functions again in A2. All
references are schema-qualified (`public.is_admin()`, `public.premium_memberships`); `auth.uid()`,
`now()` and `json_build_object()` need no change.

**This crosses the phase boundary you drew.** Two options:

- **Keep it** (recommended) — one rewrite instead of two, and A2 drops from 6 functions to 4.
- **Strip it** — delete the two `SET search_path = ''` lines and the `public.` qualification, and
  handle both in A2 as originally scoped.

Say which you prefer; stripping it is a two-minute edit.

---

## 6. Deployment runbook — **NOT YET AUTHORISED**

1. **Create a staging project** — none exists today. This is a prerequisite, not a nicety.
2. Run `pg_stat_statements` / API-log caller check (§1.3).
3. Restore a production snapshot to staging.
4. Apply `A1-premium-functions.sql` to staging.
5. Run `A1-verification.sql` Sections A, B, then C.
6. Run Section D (manual UI smoke test) against staging.
7. Get explicit approval to deploy.
8. Apply to Production during a low-traffic window.
9. Run Sections A and B against Production (both read-only).
10. Manually confirm grant + revoke in `/admin/users`.
11. **Separately**, seek approval for `DATA-REMEDIATION-duplicate-membership.sql`.

**Rollback trigger:** any V01–V03 failure, or the admin UI failing to grant or revoke.
Run `A1-premium-functions.rollback.sql` and note that doing so reinstates finding 9.3.

---

## 7. Constraint compliance

| Your constraint | How it is met |
|-----------------|---------------|
| 1. Backward-compatible, minimal change | Both signatures unchanged; **zero application code changes**; no schema change |
| 2. `admin_grant_premium` must not create multiple simultaneously-active memberships; idempotent when one exists | Extend-in-place or no-op; never a second `INSERT`. Verified by T2/T4b (1 active row) |
| 3. `admin_revoke_premium` must truly cancel all effective Premium; no success-but-still-true | Revokes every `is_active` row for the user — a superset of `is_premium_member()`'s predicate. Verified by T5 |
| 4. Prefer keeping the existing signature; caller analysis first | Caller analysis in §1 **preceded** the design and showed the UI already has per-user intent. Signature kept |
| 5. Only propose revoke-by-user + UI change if A is unsafe | Option A is safe; Option B recorded in §3 as an alternative, not proposed |
| 6. Do not touch existing duplicate data | `A1-premium-functions.sql` changes **no data**. Cleanup is a separate, gated file with SQL, impact and rollback |
| 7. Prepare only — no Production deploy | Nothing applied. Artefacts sit in `docs/`, not `supabase/migrations/` |
