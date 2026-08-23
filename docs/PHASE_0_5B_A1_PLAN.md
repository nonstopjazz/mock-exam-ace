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
| **A1-3a** | §9.11 — TTS endpoint runs as `service_role` with no auth | 🔴 CRITICAL | `phase-0.5b/A1-3-TTS.md` §3 + 2 patches |
| **A1-3b** | pre-existing large-pack timeout (214-item pack ≈ 1.7× over budget) | 🟠 HIGH | `phase-0.5b/A1-3-TTS.md` §4 + 2 patches |
| **A1-4** | §9.12 — cron endpoint open when `CRON_SECRET` unset | ✅ **exposure CLOSED** — secret set + redeployed; patch is defense-in-depth | `phase-0.5b/A1-4-CRON.md` + 1 patch |
| **A1-6** | §9.15 — premium revocation silently fails | 🟠 HIGH | `phase-0.5b/A1-premium-functions.sql` |
| **A1-5** | §9.13 — token RNG, `.gitignore`, dev tools | 🟢 LOW | ✅ **all three approved & prepared** — `phase-0.5b/A1-5-SCOPE-PROPOSAL.md` + 3 patches |
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
    ├── A1-3-TTS.md                              ★ caller flow, auth design, chunking, verification
    ├── A1-3-pack-size-survey.sql                  read-only — sets the chunk limit from real data
    ├── A1-4-CRON.md                             ★ scheduler flow, secret placement, order, flashcard verification
    ├── A1-5-SCOPE-PROPOSAL.md                     ⏸️ scope only — NOT approved, NOT prepared
    ├── STAGING_PLAN.md                          ★ minimum viable staging (hard gate)
    └── patches/
        ├── A1-3a-security-api.patch             api/generate-pack-audio.ts      (auth)
        ├── A1-3a-security-ui.patch              PackItemsAdmin.tsx              (token)
        ├── A1-3b-reliability-api.patch          api/generate-pack-audio.ts      (chunking)
        ├── A1-3b-reliability-ui.patch           PackItemsAdmin.tsx              (cursor loop)
        ├── A1-4-cron.patch                      api/send-daily-reminders.ts
        ├── A1-5a-secure-token-rng.patch         TokensAdmin.tsx
        ├── A1-5b-gitignore-env.patch            .gitignore
        ├── A1-5c-devtools-env-gate.patch        DevPhaseSwitcher.tsx
        └── OPTIONAL-A1-3-edge-repo-only.patch   repo hygiene — NOT an A1 deliverable
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
# A1-3a — security, independently deployable
git apply docs/phase-0.5b/patches/A1-3a-security-api.patch
git apply docs/phase-0.5b/patches/A1-3a-security-ui.patch

# A1-3b — reliability, applies on top of 3a
git apply docs/phase-0.5b/patches/A1-3b-reliability-api.patch
git apply docs/phase-0.5b/patches/A1-3b-reliability-ui.patch

# A1-4 and A1-5 — each independent
git apply docs/phase-0.5b/patches/A1-4-cron.patch
git apply docs/phase-0.5b/patches/A1-5a-secure-token-rng.patch
git apply docs/phase-0.5b/patches/A1-5b-gitignore-env.patch
git apply docs/phase-0.5b/patches/A1-5c-devtools-env-gate.patch
```

**Verified separability (the property you required):**

| Check | Result |
|-------|--------|
| A1-3a alone applies to a clean tree | ✅ |
| A1-3b applies on top of A1-3a | ✅ |
| **A1-3b reverses cleanly, leaving A1-3a applied** | ✅ **security stays fixed** |
| A1-4, A1-5a/b/c each apply independently | ✅ |

All patched TypeScript parse-checks to the **same error-code set** as the originals.

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

## 4. A1-3 — TTS · **split into 3a Security + 3b Reliability**

Full detail in `phase-0.5b/A1-3-TTS.md`.

Per your instruction the authorization fix and the API/workflow redesign are **two independently
reviewable, deployable and reversible patches**, with separate rollback and verification paths.

### 4.1 A1-3a — Security 🔴

**Product semantics (confirmed):** TTS is an **admin content-authoring tool**, not a student-facing
service. `PackItemsAdmin` is the only expected caller and **students do not need TTS rights** — so
admin-only authorization is the correct product semantics, not merely a tightening.

Today the caller sends **no `Authorization` header** and the handler's only gate is the HTTP-method
check, while it runs as `service_role`. Design: validate the caller's JWT, then evaluate
**`is_admin()` as that user** — reusing the schema's authoritative gate rather than adding a fifth
admin mechanism. Students get `403`. Needs `SUPABASE_ANON_KEY` server-side (publishable key, not a
new secret).

**Response shape unchanged** — that is what makes 3a independently deployable.

### 4.2 A1-3b — Reliability 🟠

Your 214-item figure settles the design question:

```
Largest Production pack           214 items
Worst case (all have examples)    214 × 2 = 428 syntheses
Realistic 60s capacity            ~250 syntheses
```

**Roughly 1.7× over budget — that pack almost certainly times out today**, which is why the UI
already ships a 504 「請嘗試較小的單字包」 handler. This is a **pre-existing production defect**, not a
consequence of the security fix, and it deserves its own patch.

**Approved: `TTS_MAX_ITEMS_PER_REQUEST = 100`** → 214 items completes in **3 chunks**, each ≤ 200
syntheses. The endpoint returns a cursor (`next_offset` / `has_more`); the UI loops with progress
toasts. A caller may request a **smaller** limit, never a larger one.

| Property | Effect |
|----------|--------|
| No pack is too large | 214 items → 3 requests instead of one that fails |
| Admin workflow unbroken | One click still does the whole pack |
| Partial progress survives | A failed chunk keeps every earlier slice |

⚠️ **3b deployment ordering differs from 3a.** For 3b, deploy **API and UI together**:
API-patched/UI-unpatched silently processes only the first 100 items and **looks like success**.
(3a is safe either way round.)

### 4.3 Edge Function — REPOSITORY-ONLY / NOT CONFIRMED DEPLOYED

Your Dashboard check found **no deployed Edge Functions**. `GOOGLE_TTS_API_KEY` exists under Edge
Function Secrets, but a secret with no function to run it is inert.

| Decision | Status |
|----------|--------|
| Production patch required for A1? | ❌ **No** — nothing deployed to patch |
| Delete the function? | ❌ Not yet |
| Rotate/delete the secret? | ❌ **No** — unchanged in A1 |
| Active TTS path | ✅ The **Vercel API** route from `PackItemsAdmin` |

`OPTIONAL-A1-3-edge-repo-only.patch` is retained as **repository hygiene, not an A1 deliverable** —
its value is that **if anyone ever deploys this function as-is it would go live unauthenticated with
`Access-Control-Allow-Origin: *`**. Apply whenever convenient.

## 5. A1-4 — Cron · summary

Full detail in `phase-0.5b/A1-4-CRON.md`.

### ⚠️ Correction to my earlier advice

I previously said the fix should *"fail closed and **reject GET**"*. **Vercel Cron invokes with
`GET`** — rejecting it would have broken the daily reminder outright. The patch keeps GET.

**Product purpose (confirmed):** this cron drives the **daily flashcard-review reminder**, pushing
students with vocabulary due back into the SRS flow. It is not user-invokable, and **the only
legitimate caller is the Vercel Cron scheduler** — so `CRON_SECRET` + the Vercel-injected
`Authorization` header is exactly the right authorization model (machine-to-machine, no user
identity involved).

**The defect:** `if (cronSecret && authorization !== …)`. With `CRON_SECRET` unset the guard is
skipped and anyone — including a browser visit, since GET is allowed — triggers a flashcard-reminder
broadcast to every subscriber using `service_role`.

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

### 5.2 Verification goes beyond HTTP 200

Per your instruction, `A1-4-CRON.md` §7.2 now verifies the **reminder workflow**, not just the status
code — because a 200 only proves the guard let the scheduler in:

| Step | Proves |
|------|--------|
| **A** Vercel Cron Jobs shows `200` | the scheduler authenticated |
| **B** `sent` count reconciles with subscribers whose `last_study_date` is not today | targeting works — a `sent: 0` is **not** automatically a pass |
| **C** students with words actually due (`user_word_progress.next_review_time <= now`) | the reminder population is real |
| **D** a notification **arrives on a real device** and opens `/practice/vocabulary` | end-to-end delivery — the only check no HTTP status can give |
| **E** message copy matches the student's streak/recency state | `getNotificationContent()` is coherent |

> ℹ️ Step C surfaces a **product-behaviour observation, not a security finding**: the handler targets
> on `user_stats.last_study_date` alone and never consults `user_word_progress`, so a student who is
> fully caught up still gets a "come back and review" nudge. **Out of A1 scope** — A1 changes only
> the authorization guard — but worth knowing before the flashcard analytics work.

### 5.1 ✅ Exposure already closed

**`CRON_SECRET` is set in Vercel Production and the deployment has been redeployed.** Because the
existing guard is `if (cronSecret && …)`, setting the variable **activated it** — so **§9.12 is
closed in Production as of that redeploy, before any code change**. Do not change the secret again.

**Remaining gates before deploying the fail-closed patch** — your three stated conditions, which are
genuinely different checks:

| Gate | Question | Where |
|------|----------|-------|
| **4** | Did the scheduler authenticate? | Vercel → Cron Jobs → last run `200` |
| **4b** | Did the flashcard reminder workflow run and target the right students? | `A1-4-CRON.md` §7.2 Steps B + C |
| **4c** | Did a real device receive it, and does tapping it open the flashcard flow? | §7.2 Step D |

🛑 **All three must pass before step 5.** A 200 alone proves only that the guard let the scheduler
in.

### 5.3 📌 Deferred product improvement (not A1)

The handler targets purely on `user_stats.last_study_date != today` and **never consults
`user_word_progress`**, so a student who is fully caught up still receives a 「回來複習」 nudge, and
the copy never mentions how many words are actually waiting. **Documented as a later product /
analytics improvement; explicitly not fixed in A1** — changing the targeting query changes who gets
notified, which is a product decision needing its own verification. Natural home: the flashcard /
vocabulary analytics work.

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

1. **Edge Function** — your Dashboard check (deployed? invocation logs?) decides patch vs. mark-obsolete
   (§4.2). ⚠️ If it **is** deployed, its patch is as urgent as the Vercel one.
2. **`CRON_SECRET`** — is it set? (§5.1) Determines whether A1-4 is urgent or routine.
3. **Pack sizes** — run `phase-0.5b/A1-3-pack-size-survey.sql` and send me **P02**; I will recommend a
   `TTS_MAX_ITEMS_PER_REQUEST`. Default 100 is safe meanwhile.
4. **A1-5** — approve per `phase-0.5b/A1-5-SCOPE-PROPOSAL.md`? I recommend 5a + 5b; 5c is your call
   (it removes `?devmode=true` on deployed URLs — tell me if you use that).
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
