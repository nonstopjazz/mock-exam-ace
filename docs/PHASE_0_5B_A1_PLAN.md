# Phase 0.5B-A1 — Safe Critical Hotfixes

> 🛑 **NOTHING IN THIS PLAN HAS BEEN DEPLOYED. PRODUCTION IS UNMODIFIED.**
> No application code, no SQL migration, and no Supabase object was changed while preparing it.
> The source tree is untouched: the code changes ship as **patch files**, not as edits.

| | |
|---|---|
| **Prepared** | 2026-08-23 |
| **Branch** | `claude/gsat-platform-audit-wiz5rt` |
| **Predecessors** | `docs/PLATFORM_AUDIT.md` (Phase 0) · `docs/PRODUCTION_SCHEMA_AUDIT.md` (Phase 0.5A) |
| **Phase 0.5B-A0** | ✅ Closed — R14/R15 run; no exploitation found; grantor `0aea72e3…` confirmed as the owner's admin account |

---

## 1. Scope

**In scope** — fixes whose compatibility does **not** depend on the LMS/Writing application:

| Item | Finding | Severity | Artefact |
|------|---------|----------|----------|
| **A1-1** | §9.3 — `admin_grant_premium` has no authorization; `EXECUTE` granted to PUBLIC + anon | 🔴 CRITICAL | `phase-0.5b/A1-premium-functions.sql` |
| **A1-2** | §9.3 — same for `admin_revoke_premium` | 🔴 CRITICAL | same file |
| **A1-3** | §9.11 — TTS endpoints run as `service_role` with no auth | 🔴 CRITICAL | `phase-0.5b/A1-3-TTS.md` + 3 patches |
| **A1-4** | §9.12 — cron endpoint open when `CRON_SECRET` unset | 🟠 HIGH | `phase-0.5b/A1-4-CRON.md` + 1 patch |
| **A1-6** | §9.15 — premium revocation silently fails | 🟠 HIGH | `phase-0.5b/A1-premium-functions.sql` |
| **A1-5** | §9.13 — token RNG, `.gitignore`, dev panel | 🟢 LOW | *not drafted — say the word* |
| **Data** | §9.15 — the one existing duplicate membership | — | `phase-0.5b/DATA-REMEDIATION-duplicate-membership.sql` ✅ approved, **separate deployment** |

**Explicitly OUT of scope this round** (your instruction, and correct — every one of these can break
the other application):

❌ RLS/grants for the 11 shared LMS tables · ❌ `public.users` · ❌ `essays` / `Essays` buckets ·
❌ `assignments` / `student_tasks` redesign · ❌ identity consolidation · ❌ `claim_pack_with_token`
`site` bug · ❌ `/exam` and the GSAT mock-exam domain

**A2 is now 4 functions, not 6** — `admin_grant_premium` and `admin_revoke_premium` get
`SET search_path = ''` here (approved), since A1 rewrites both bodies in full anyway. Remaining for
A2: `claim_pack_with_token(text,text)`, `get_all_word_progress`, `is_premium_member`,
`upsert_word_progress(8-arg)`.

---

## 2. Deliverables

```
docs/
├── PHASE_0_5B_A1_PLAN.md                        ← this file
└── phase-0.5b/
    ├── README.md                                caller analysis + option comparison (A1-1/2/6)
    ├── A1-premium-functions.sql                 ★ SQL — A1-1, A1-2, A1-6
    ├── A1-premium-functions.rollback.sql          exact pre-change definitions
    ├── A1-verification.sql                        structural + data + behavioural checks
    ├── DATA-REMEDIATION-duplicate-membership.sql  ✅ approved, deploys separately
    ├── A1-3-TTS.md                              ★ caller flow, auth design, rate limits, verification
    ├── A1-4-CRON.md                             ★ scheduler flow, secret placement, order, verification
    ├── STAGING_PLAN.md                          ★ minimum viable staging (hard gate)
    └── patches/
        ├── A1-3-tts-api.patch                   api/generate-pack-audio.ts
        ├── A1-3-tts-ui.patch                    src/pages/admin/PackItemsAdmin.tsx
        ├── A1-3-tts-edge.patch                  supabase/functions/generate-pack-audio/index.ts
        └── A1-4-cron.patch                      api/send-daily-reminders.ts
```

### 2.1 Why the code changes are patches, not edits

Two reasons, and the second is the important one:

1. You asked for A1 to be **prepared, not deployed**. An unapplied patch cannot be deployed by
   accident.
2. **This repository is connected to Vercel.** Committing changes to `api/` is a step away from a
   deployment. Keeping `api/`, `src/` and `supabase/functions/` byte-identical to Production
   guarantees that pushing this branch cannot alter any deployed behaviour.

Apply them when you are ready:

```bash
git apply docs/phase-0.5b/patches/A1-3-tts-api.patch
git apply docs/phase-0.5b/patches/A1-3-tts-ui.patch
git apply docs/phase-0.5b/patches/A1-3-tts-edge.patch
git apply docs/phase-0.5b/patches/A1-4-cron.patch
```

All four are **dry-run verified** — `git apply --check` passes against the current tree.

---

## 3. A1-1 / A1-2 / A1-6 — premium functions (SQL)

Full rationale in `phase-0.5b/README.md`. Summary:

**Caller analysis came first**, as you required. `admin_revoke_premium` has exactly one caller —
`UsersAdmin.tsx:158`, reached from line 548 behind a button labelled 「收回 Premium」 on a *user* row,
passing the newest active membership id, and clearing that user's whole cache entry on success.
**The UI already has per-user semantics; the RPC's per-row behaviour is the bug, not a contract.**
So the signature is kept and the id is treated as a handle to the user.

| Function | Change | Signature |
|----------|--------|-----------|
| `admin_grant_premium` | `is_admin()` gate · extend-in-place or no-op, never a second active row · `SET search_path = ''` | ✅ unchanged |
| `admin_revoke_premium` | `is_admin()` gate · revoke **all** active rows for the resolved user · `MEMBERSHIP_NOT_FOUND` for unknown ids · `SET search_path = ''` | ✅ unchanged |
| grants | `REVOKE … FROM PUBLIC, anon` · `GRANT … TO authenticated, service_role` | — |

**Zero application code changes.** The whole change is two `CREATE OR REPLACE` statements plus grant
adjustments.

**Guarantee (your constraint 3):** revoke deactivates every `is_active` row for the user — a strict
superset of what `is_premium_member()` inspects — so success-but-still-premium becomes structurally
impossible.

**Grant never silently shortens coverage** (3-month grant over a permanent membership returns
`already_active`, writes nothing). This preserves the renewal workflow the UI actually has.

### 3.1 Verified against a throwaway Postgres

Seeded with the **real production duplicate** (`36258aeb…`). Bug reproduced against the current
definitions, then fixed:

```
BEFORE:  revoke → {"success": true}          is_premium_member = true   ← the bug
AFTER:   revoke → {"revoked_count": 2}       is_premium_member = false  ← fixed
```

T0 (non-admin refused) · T2 (`already_active`, 1 row) · T3/T4 (`extended`) · T4b (no silent
shortening) · T6 (idempotent revoke) · T7 (`MEMBERSHIP_NOT_FOUND`) · `anon` EXECUTE false /
`authenticated` true · rollback faithful. All pass.

---

## 4. A1-3 — TTS · summary

Full detail in `phase-0.5b/A1-3-TTS.md`.

**Current flow:** `PackItemsAdmin` → `fetch('/api/generate-pack-audio')` with **no `Authorization`
header** → handler whose only gate is `req.method !== 'POST'` → `service_role` client → Google TTS →
Storage upsert → `pack_items` UPDATE.

**Today an unauthenticated `POST` can** burn unbounded Google TTS quota (`force: true` re-synthesises
everything), overwrite `pack-audio` objects, and write `pack_items` with RLS bypassed.

**Design:** validate the caller's JWT, then evaluate **`is_admin()` as that user** — reusing the
schema's authoritative gate rather than adding a fifth admin mechanism. Requires
`SUPABASE_ANON_KEY` server-side (the publishable key — not a new secret).

**Rate limiting, honestly:** the admin gate closes the *abuse* vector; what remains is accidental
cost blowup. In scope: a 400-synthesis per-request cap (413), `force` requiring `confirm_force`, and
structured logging of `admin_id`/`pack_id`. **A real rate limiter needs shared state** — a
`tts_jobs` table (schema change) or Upstash (new infra), both out of hotfix scope. The practical
ceiling meanwhile is a **GCP quota cap** on the Text-to-Speech API, which is worth setting regardless.

**Open question:** the Edge Function has **no caller in this repository**. Patch it, delete it, or
leave it? I recommend **deleting** it if genuinely unused — one less privileged surface. The patch
exists in case something outside this repo calls it.

**Ordering:** UI-patched/API-unpatched is safe; API-patched/UI-unpatched breaks the admin UI with
403. Deploy UI first or together; roll back API first.

---

## 5. A1-4 — Cron · summary

Full detail in `phase-0.5b/A1-4-CRON.md`.

### ⚠️ Correction to my earlier advice

I previously said the fix should *"fail closed and **reject GET**"*. **Vercel Cron invokes with
`GET`** — rejecting it would have broken the daily reminder outright. The patch keeps GET.

**The defect:** `if (cronSecret && authorization !== …)`. With `CRON_SECRET` unset the guard is
skipped and anyone — including a browser visit, since GET is allowed — triggers a push broadcast to
every subscriber using `service_role`.

### 🔑 The key insight

> **Setting `CRON_SECRET` is itself the fix.** The moment the variable exists, the *existing* guard
> becomes active. The exposure closes with an environment-variable change plus a redeploy — no code
> needed.

The patch is defense in depth: it makes a missing secret a `503` rather than an open door, so the
endpoint can never silently revert to open.

**Where:** Vercel → Settings → Environment Variables → `CRON_SECRET` (Production; Preview with a
*different* value). Generate with `openssl rand -hex 32`.

**How the scheduler carries it:** Vercel attaches `Authorization: Bearer $CRON_SECRET` automatically
when the variable exists. No `vercel.json` change.

**Deployment order — the one place order really matters:**

```
1. Generate secret
2. Set CRON_SECRET in Vercel (Production)
3. Redeploy                          ← exposure closes HERE
4. ✅ HARD GATE: verify a real scheduled run still returns 200
5. Deploy the fail-closed patch
6. Verify again
```

> 🛑 **Never do step 5 before step 4.** If Vercel is not attaching the header, the patched endpoint
> 401s and the daily reminder stops firing — silently, because nobody watches a cron that does nothing.

**Safe rollback: revert the code, KEEP the secret.** Deleting the variable would restore the fully
open behaviour.

### 5.1 Check this first

Look at Vercel → Environment Variables and see whether `CRON_SECRET` exists.

| Finding | Meaning |
|---------|---------|
| Not set | 🔴 You are exposed right now. Steps 2–3 today. |
| Set | ✅ Already protected; the patch is defense-in-depth and can move at a normal pace. |

*(There is a curl probe for this in `A1-4-CRON.md` §7.3, but it triggers a real broadcast if you are
exposed. Reading the settings page is strictly better.)*

---

## 6. Staging — hard gate

`phase-0.5b/STAGING_PLAN.md`. **No staging environment exists today**, so every A1 Production
deployment is blocked on creating one.

**Shape:** a second Supabase project (free tier) + a Vercel Preview deployment on this branch.

**Proves exactly four things:** Supabase RPC/grants · `authenticated` vs `anon` · the TTS caller
path · the cron secret path.

**No production PII.** Schema subset + synthetic fixtures: three `@example.test` users, a 3-item
pack, one fake push subscription, and a deliberately reproduced duplicate membership. No student
records, essays, or real emails are copied.

**~4 hours.** Keep the project for 0.5B-B and Phase 1.

Two things it deliberately cannot prove — stated so a green run is not over-read:
- **Vercel's cron scheduler attaching the header** (preview deployments don't run crons) — which is
  exactly why A1-4 step 4 verifies a real scheduled run on Production.
- **Real push delivery** — the synthetic endpoint cannot receive.

> The plan includes a **baseline run**: reproduce both bugs on staging *before* fixing them. If
> staging cannot reproduce them, it is not modelling Production faithfully and a green run afterwards
> proves nothing.

---

## 7. Recommended deployment order

Nothing below is authorised yet.

| # | Step | Gate |
|---|------|------|
| 0 | **Check whether `CRON_SECRET` is set** (§5.1) | If unset, this is your most urgent item |
| 1 | Build staging per `STAGING_PLAN.md` | 🛑 **HARD GATE for everything below** |
| 2 | Baseline on staging — reproduce §9.15 and the TTS bypass | Proves staging is faithful |
| 3 | Apply A1 SQL + 4 patches to staging | — |
| 4 | Run S1–S4 acceptance in full | 🛑 All must pass |
| 5 | **A1-4 steps 1–4**: set `CRON_SECRET` on Production, redeploy, verify a real scheduled run | 🛑 Before any fail-closed deploy |
| 6 | Deploy **A1-1/A1-2/A1-6 SQL** to Production | Verification §A + §B (read-only) |
| 7 | Verify grant / extend / revoke / unauthorized in `/admin/users` | 🛑 Your stated gate |
| 8 | Deploy **A1-3 + A1-4 patches** to Production (one Vercel deploy) | Run TTS §6.1/§6.2 and Cron §7.1 |
| 9 | Confirm Production healthy — one scheduled cron run, one TTS generation | — |
| 10 | **Separately**, run the approved data remediation | Pre-flight → targeted UPDATE → post-check |
| 11 | Verify `is_premium_member()` and active row count | 🛑 Your stated gate |

Steps 6→7→10→11 are exactly the sequence you specified: fix functions → verify → confirm healthy →
then cleanup → then verify again.

---

## 8. Rollback summary

| Item | Method | Reinstates |
|------|--------|-----------|
| A1-1/2/6 SQL | `A1-premium-functions.rollback.sql` (exact pre-change bodies + grants) | §9.3 and §9.15 |
| A1-3 TTS | `git apply -R` the 3 patches, or Vercel instant rollback | §9.11 |
| A1-4 Cron | `git apply -R` the patch — **keep `CRON_SECRET` set** | §9.12 only if the secret is also removed |
| Data remediation | single `UPDATE … SET is_active = true` on one row | the duplicate |

No rollback deletes data. `is_active` is a soft flag throughout.

---

## 9. Verification checklist

Print this and tick it.

### Pre-deployment
- [ ] `CRON_SECRET` presence checked in Vercel (§5.1)
- [ ] Staging project created; schema + fixtures loaded
- [ ] Preview env vars set — **service-role key confirmed to be staging's**
- [ ] Baseline: §9.15 reproduced on staging (revoke → still premium)
- [ ] Baseline: TTS bypass reproduced on staging (unauthenticated POST → 200)

### Staging acceptance
- [ ] S1-1 V01–V03: admin check present; `anon` EXECUTE false; `authenticated` true
- [ ] S1-2 T1–T4b: `granted` → `already_active` → `extended` → `extended` → `already_active`; **1 active row**
- [ ] S1-3 T5: `revoked_count: 2`; active rows 0; `is_premium_member` false
- [ ] S1-4 T7: `MEMBERSHIP_NOT_FOUND`
- [ ] S2-1 anon RPC → denied at the grant layer
- [ ] S2-2 non-admin RPC → `UNAUTHORIZED` from `is_admin()`
- [ ] S2-3 admin RPC → success
- [ ] S3-1 TTS U1–U5 → 401/401/401/**403**/405
- [ ] S3-2 `pack_items.audio_url` unchanged after the unauthorized attempts
- [ ] S3-3/4 admin generation → 200; force gating → 400 then 200
- [ ] S3-5 `[generate-pack-audio] admin=…` present on every 200
- [ ] S4-1 cron M1–M3, M5 → 401/401/401/405
- [ ] S4-2/3 M4 with correct secret → 200
- [ ] S4-4 secret removed → **503** + `CRON_SECRET is not configured` in the log
- [ ] S4-5 secret restored → 200

### Production
- [ ] `CRON_SECRET` set; redeployed
- [ ] 🛑 **Real scheduled cron run returns 200** *(before any fail-closed deploy)*
- [ ] A1 SQL deployed; verification §A + §B pass
- [ ] `/admin/users`: grant → badge appears
- [ ] `/admin/users`: grant again → still one row (V04)
- [ ] `/admin/users`: revoke → badge clears **and stays cleared after refresh**
- [ ] TTS + cron patches deployed
- [ ] Unauthenticated TTS POST → 401
- [ ] Unauthenticated cron GET → 401
- [ ] Admin TTS generation succeeds
- [ ] One scheduled cron run succeeds post-patch
- [ ] Notification actually received on a real device

### Data remediation *(separate deployment)*
- [ ] Pre-flight: 2 rows, both active, both permanent
- [ ] Pre-flight scan: exactly 1 user with duplicates
- [ ] `UPDATE 1`; in-transaction check: 1 active row, `is_premium` **true**
- [ ] Committed
- [ ] Post-check: `is_premium_member` **true**, active rows **1**
- [ ] Post-scan: **0** users with duplicates

---

## 10. Open questions

1. **Edge Function** — patch, delete, or leave? (§4) I recommend deleting if unused; check the
   Supabase Dashboard for whether it is even deployed.
2. **`CRON_SECRET`** — is it set? (§5.1) Determines whether A1-4 is urgent or routine.
3. **A1-5** (token RNG, `.gitignore`, dev panel) — want it drafted this round?
4. **`MAX_TTS_CALLS_PER_REQUEST = 400`** — tune to your largest legitimate pack. What is it?
5. **GCP quota cap** on the Text-to-Speech API — worth setting regardless of this work.

---

## 11. Compliance

| Requirement | Status |
|-------------|--------|
| Production unmodified | ✅ No Supabase object, no deployment, no data changed |
| Application code unmodified | ✅ `api/`, `src/`, `supabase/functions/` byte-identical; changes are unapplied patches |
| `supabase/migrations/` untouched | ✅ SQL lives in `docs/phase-0.5b/` |
| A1 limited to non-LMS-dependent fixes | ✅ Every item justified as GSAT-owned |
| `SET search_path = ''` kept in A1-1/A1-2 | ✅ Approved; A2 reduced to 4 functions |
| Data remediation separate from A1 | ✅ Own file, own deployment step, own rollback |
| No data deleted | ✅ Soft-flag `UPDATE` only |
| Staging as hard gate | ✅ §6, §7 step 1 |
| No student PII in staging | ✅ Synthetic `@example.test` fixtures only |
| Deferred items untouched | ✅ 11 LMS tables, `public.users`, essays buckets, assignments/student_tasks, identity consolidation, `claim_pack_with_token`, `/exam` |
