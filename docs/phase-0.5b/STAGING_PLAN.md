# Minimum Viable Staging — hard gate for any A1 Production deployment

> ✅ **BUILT AND RUN — 2026-08-26. S1–S5 all pass.** Results: `STAGING_RESULTS.md`.
> This file remains the plan of record, for rebuilding staging in 0.5B-B or Phase 1.
> **Constraint honoured: no real student PII is copied.** Schema + synthetic fixtures only.
>
> **A1 scope was frozen on 2026-08-25** — see `docs/PHASE_0_5B_A1_PLAN.md` §0. Staging validates
> **exactly** that frozen scope. 🛑 **Do not add a staging check for anything outside it**, and do
> not fix anything you discover here that is not already an A1 item.

---

## 1. What staging must be able to prove

Exactly five things — the five A1 surfaces. Anything beyond this is out of scope.

| # | Capability | Gates |
|---|-----------|-------|
| **S1** | Supabase **RPC behaviour + EXECUTE grants** | A1-1, A1-2, A1-6 |
| **S2** | **`authenticated` vs `anon`** behaviour differences | A1-1, A1-2, A1-3a |
| **S3** | **TTS caller path** end-to-end (browser → JWT → endpoint → admin check) + **chunking** | A1-3a, A1-3b |
| **S4** | **Cron secret path** (header → guard → notification) | A1-4 |
| **S5** | **A1-5 tail** — token RNG, `.env` hygiene, and the **dev-tools environment gate in both states** | A1-5a, A1-5b, A1-5c |

**Not required:** production data volume, the 22 LMS tables, the writing application, real student
records, real push devices, real Google TTS spend.

> **On S5:** A1-5 does not strictly *need* to gate on staging the way the SQL and endpoint changes
> do — but A1-5c is the one item whose correctness is **entirely a property of the environment it
> runs in**, and Preview is the only place its "enabled" state can be observed before Production.
> Verifying it here costs minutes.

---

## 2. Shape: a second Supabase project + a Vercel Preview deployment

```
┌──────────────────────────────────┐     ┌────────────────────────────────┐
│ Supabase project  gsat-staging   │     │ Vercel — Preview deployment    │
│  (free tier is sufficient)       │     │  branch: claude/security-…-i3hw1y │
│                                  │◄────┤                                │
│  • GSAT schema subset (§3)       │     │  VITE_SUPABASE_URL   → staging │
│  • synthetic users (§4)          │     │  SUPABASE_*          → staging │
│  • is_admin() → staging admin    │     │  CRON_SECRET         → test    │
│  • NO student PII                │     │  GOOGLE_TTS_API_KEY  → capped  │
└──────────────────────────────────┘     └────────────────────────────────┘
```

**Why a separate Supabase project rather than a schema inside Production:** A1 changes function
definitions and `EXECUTE` grants. Doing that inside the production database — even in another schema
— risks touching the shared LMS/Writing application. A separate project has zero blast radius.

**Free tier is enough.** The fixtures below are a handful of rows.

---

## 3. Schema: which objects to create

**Only what the five capabilities need.** Do not restore a full production dump.

### 3.1 Required

| Object | Source | Why |
|--------|--------|-----|
| `auth.users` | created by Supabase | identity root |
| `premium_memberships` | `supabase/migrations/add_premium_memberships.sql` (table + RLS only) | S1, S2 |
| `app_admins` | ⚠️ **no DDL in the repo** — recreate from Q07/Q18: `user_id uuid PK REFERENCES auth.users(id) ON DELETE CASCADE`, RLS on, policy `SELECT USING (auth.uid() = user_id)` | S1, S2 |
| `packs`, `pack_items` | `supabase/schema.sql` (+ `add_audio_to_pack_items.sql`, `add_skill_type_to_packs.sql`) | S3 |
| `push_subscriptions` | `create_push_subscriptions_table.sql` | S4 |
| `user_stats` | `create_user_stats_table.sql` | S4 |
| `is_admin()`, `is_premium_member()` | `add_premium_memberships.sql` / `create_user_profiles_table.sql` | S1, S2, S3 |
| `admin_grant_premium`, `admin_revoke_premium` | **current production bodies** — copy verbatim from `A1-premium-functions.rollback.sql` | ⚠️ **Critical: staging must start from the CURRENT state so the A1 change is what gets tested** |
| `user_profiles` | `create_user_profiles_table.sql` | `is_admin()` migration file also defines it |
| Storage bucket `pack-audio` | create in Dashboard | S3 |

### 3.2 Explicitly NOT created

`exams` and the GSAT exam domain · `level_words` and its 2.1 MB seed · all `blog_*` tables · the 22
LMS/Writing tables · `essay_submissions` · the `essays` / `Essays` buckets.

None are touched by A1, and several are the other application's.

### 3.3 `is_admin()` on staging

Production's `is_admin()` hard-codes `nonstopjazz@gmail.com`. On staging, point it at the synthetic
admin instead — **this is a staging-only edit and must never be copied back**:

```sql
-- STAGING ONLY
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_user_email TEXT;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  RETURN v_user_email = 'staging-admin@example.test';   -- ← staging identity
END;
$$;
```

⚠️ Because the shape is identical, a real admin email must never appear here.

---

## 4. Fixtures: synthetic only

Create through the Supabase Dashboard (Authentication → Add user) so real `auth.users` rows exist
with working passwords:

| Handle | Email | Role | Purpose |
|--------|-------|------|---------|
| **ADMIN** | `staging-admin@example.test` | admin via §3.3 | positive tests |
| **USER_A** | `staging-user-a@example.test` | ordinary | 403/UNAUTHORIZED tests, premium target |
| **USER_B** | `staging-user-b@example.test` | ordinary | duplicate-membership reproduction |

```sql
-- Fill in the ids from Authentication → Users. Synthetic data only.
INSERT INTO public.app_admins (user_id) VALUES ('<ADMIN_UUID>');

-- One small pack for the TTS path: 3 items keeps Google TTS spend negligible.
INSERT INTO public.packs (id, title, description, is_public, is_active, created_by)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Staging TTS Pack', 'synthetic', false, true, '<ADMIN_UUID>');

INSERT INTO public.pack_items (pack_id, word, definition, example_sentence, sort_order) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'apple',  '蘋果', 'I ate an apple.',      1),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'banana', '香蕉', 'She likes bananas.',   2),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cherry', '櫻桃', 'Cherries are sweet.',  3);

-- Reproduce finding 9.15: two simultaneously-active memberships for USER_B.
INSERT INTO public.premium_memberships (user_id, expires_at, granted_by, is_active) VALUES
  ('<USER_B_UUID>', NULL, '<ADMIN_UUID>', true),
  ('<USER_B_UUID>', NULL, '<ADMIN_UUID>', true);

-- One push subscription for the cron path. The endpoint/keys are fake, so
-- webpush will fail to deliver — that is fine and expected (§6, S4-3).
INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth) VALUES
  ('<USER_A_UUID>', 'https://example.test/push/synthetic-endpoint', 'synthetic-p256dh', 'synthetic-auth');

INSERT INTO public.user_stats (user_id, streak_days, last_study_date, total_review_count, total_words_learned)
VALUES ('<USER_A_UUID>', 3, CURRENT_DATE - 1, 42, 10);
```

### 4.1 PII rule

**No production row is copied.** Every email is `@example.test` (an RFC 2606 reserved TLD, so it can
never receive mail). No real names, schools, essays, or student records.

If a future phase genuinely needs production-shaped data, that is a separate decision requiring
pseudonymisation — not something to slip in here.

---

## 5. Vercel Preview configuration

Vercel → Project → Settings → Environment Variables, scoped to **Preview**:

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | staging project URL |
| `VITE_SUPABASE_ANON_KEY` | staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **staging** service-role key |
| `SUPABASE_ANON_KEY` | staging anon key *(new — **required by A1-3a**, and there is deliberately **no fallback** to `VITE_SUPABASE_ANON_KEY`; if it is missing the endpoint returns `500 Supabase credentials not configured`)* |
| `TTS_MAX_ITEMS_PER_REQUEST` | **`2`** on staging — makes the 3-item fixture pack chunk, so S3 exercises the cursor loop |
| `VITE_ENABLE_DEV_TOOLS` | **`true`** *(new — required by **A1-5c**)*. **Preview scope ONLY.** This is what proves the approved design's middle row: Preview dev tools are available **only when explicitly enabled**. 🛑 **Never set this on Production** — with it unset there, no activation path exists at all. S5-2 temporarily removes it to model Production |
| `CRON_SECRET` | `openssl rand -hex 32` — **different from Production** |
| `GOOGLE_TTS_API_KEY` | a key restricted to a **capped** GCP project |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` | a staging VAPID pair |

> **Two variables are new to this deployment** — `SUPABASE_ANON_KEY` (A1-3a) and
> `VITE_ENABLE_DEV_TOOLS` (A1-5c). Both are also **Production-side prerequisites** with opposite
> rules: `SUPABASE_ANON_KEY` **must** be set on Production, `VITE_ENABLE_DEV_TOOLS` **must not** be.
> See `PHASE_0_5B_A1_PLAN.md` §7.0.

> 🛑 **Triple-check `SUPABASE_SERVICE_ROLE_KEY` is the staging one.** A production service-role key in
> a preview environment would let staging tests write to Production with RLS bypassed — the single
> worst mistake available in this whole plan.

**Google TTS cost containment:** use a separate GCP project with a **quota cap** on the
Text-to-Speech API, not just a budget alert. The 3-item fixture pack costs a fraction of a cent, but
a cap makes a mistake impossible rather than merely visible.

---

## 6. Acceptance criteria

Staging is ready when all of these pass. Each maps to a capability from §1.

### S1 — RPC behaviour and grants

| # | Check | Expect |
|---|-------|--------|
| S1-1 | `A1-verification.sql` Section A (V01–V03, **V07**) | admin check present; `anon` EXECUTE false; `authenticated` true; **V07: both bodies use `IS NOT TRUE`, neither uses a bare `NOT`** |
| S1-2 | Section C tests T1–T4b as ADMIN | `granted` → `already_active` → `extended` → `extended` → `already_active`, **exactly 1 active row** |
| S1-3 | Section C test T5 against USER_B's duplicate | `revoked_count: 2`, active rows 0, `is_premium_member` false |
| S1-4 | T7 unknown id | `MEMBERSHIP_NOT_FOUND` |

### S2 — authenticated vs anon

| # | Check | Expect |
|---|-------|--------|
| S2-1 | `rpc('admin_grant_premium')` **as anon** | permission denied at the grant layer |
| S2-2 | same **as USER_A** (authenticated, non-admin) | `{"success":false,"error":"UNAUTHORIZED"}` |
| S2-3 | same **as ADMIN** | `{"success":true,…}` |
| S2-4 | Repeat S2-1..3 for `admin_revoke_premium` | same pattern |
| **S2-5** | **`admin_grant_premium` and `admin_revoke_premium` with `auth.uid()` = NULL**, run from the **SQL Editor** so the EXECUTE grant is bypassed and the call reaches the function body with no identity — `A1-verification.sql` Section C **T8** | `{"success": false, "error": "UNAUTHORIZED"}` for both. **Any `"success": true` is a failure.** For revoke the expectation is `UNAUTHORIZED`, **not** `MEMBERSHIP_NOT_FOUND` — the gate must be reached before the lookup |

> S2-1, S2-2 and S2-5 fail *differently* on purpose, and all three must be verified — testing only
> some of them hides a hole in the others:
>
> | | Blocked by | Layer |
> |---|---|---|
> | **S2-1** anon | the `REVOKE` | transport |
> | **S2-2** authenticated non-admin | `is_admin()` returning **false** | application |
> | **S2-5** NULL identity | `is_admin()` returning **NULL** | application |
>
> **Why S2-5 was added.** `is_admin()` returns **NULL**, not false, when `auth.uid()` is NULL — its
> `SELECT ... INTO` matches no `auth.users` row. A gate written as a plain `NOT is_admin()` then
> evaluates to NULL, PL/pgSQL treats a NULL `IF` condition as false, and the UNAUTHORIZED branch is
> **skipped**. An earlier A1 draft did exactly this and, reproduced on PostgreSQL 16.13, returned
> `{"success": true, "action": "extended", …}` to a caller with no identity — **only the `REVOKE` was
> holding**, so the two defences were not independent as S2 assumes. The gate now uses
> `IS NOT TRUE`. S2-5 is what keeps it that way.
>
> Run S2-5 from the **SQL Editor** (superuser, bypasses the grant), never through PostgREST — there
> the `REVOKE` rejects it first and the result tells you nothing about the body. S2-1 is the reverse:
> it must go through PostgREST, because the grant layer is precisely what it is testing.

Run S2-1 to S2-4 from a browser console on the preview deployment, signed in as each user, via
`supabase.rpc(...)` — that exercises the real PostgREST path rather than a psql superuser session.

### S3 — TTS caller path

| # | Check | Expect |
|---|-------|--------|
| S3-1 | `A1-3-TTS.md` §8.1 U1–U5 (unauthorized) — U4 uses a **student** token | 401/401/401/**403**/405 |
| S3-2 | `pack_items.audio_url` unchanged after U1–U5 | identical counts before/after |
| S3-3 | §8.2 A1 as ADMIN on the 3-item pack | 200, three `audio_url` values populated |
| S3-4 | §8.2 A2 / A3 (force gating) | 400 then 200 |
| S3-7 | §8.2 A4 chunking with `TTS_MAX_ITEMS_PER_REQUEST=2` | `has_more:true` → cursor advances → final call `has_more:false`; all 3 items get audio |
| S3-8 | §8.2 A5 caller sends `limit: 100000` | `processed <= 2` — the server clamps |
| S3-5 | Vercel log shows `[generate-pack-audio] admin=<uuid> …` | present on every 200 |
| S3-6 | UI: ADMIN clicks 「生成發音」 | success toast, audio plays |

### S4 — cron secret path

| # | Check | Expect |
|---|-------|--------|
| S4-1 | `A1-4-CRON.md` §7.1 M1–M3, M5 | 401 / 401 / 401 / 405 |
| S4-6 | §7.2 Step B: `sent` reconciles with subscribers whose `last_study_date` ≠ today | counts match |
| S4-2 | M4 with the correct staging secret | 200 with a `sent`/`failed` count |
| S4-3 | M4 against the synthetic subscription | `failed: 1` (or `cleaned: 1`) — **expected**: the fake endpoint cannot receive. Proves the guard passed and the send path ran. |
| S4-4 | Temporarily unset `CRON_SECRET` on Preview, redeploy, run M1 | **503**, and the log line `CRON_SECRET is not configured` |
| S4-5 | Restore `CRON_SECRET`, redeploy, re-run M4 | back to 200 |

S4-4 is the one that proves fail-closed actually fails *closed*. Do not skip it — it is the entire
point of the A1-4 patch.

⚠️ **S4 does not close gate G4.** Preview deployments do not run crons, so staging can prove the
*guard* is correct but never that **Vercel's scheduler attaches the header** to an automatic
invocation. That remains a Production-only check (§9, and `PHASE_0_5B_A1_PLAN.md` §10.3).

### S5 — A1-5 tail

| # | Check | Expect |
|---|-------|--------|
| S5-1 | **A1-5c Preview, `VITE_ENABLE_DEV_TOOLS=true`:** open `https://<preview>/?devmode=true` | Dev panel **appears** — proves the Preview capability was preserved |
| S5-2 | **A1-5c models Production:** remove `VITE_ENABLE_DEV_TOOLS` from Preview, redeploy, retry `?devmode=true`, and set `localStorage.dev_mode_enabled = 'true'` | Panel **does NOT appear** in either case — proves **no activation path exists** when the flag is absent. **Restore the variable afterwards** |
| S5-3 | **A1-5a:** issue a new invite token in `/admin/tokens` | 8 characters, same alphabet as before |
| S5-4 | **A1-5a backward compatibility:** redeem a **pre-existing** token at `/claim/:token` | Still redeems — alphabet and length are unchanged, so old tokens stay valid |
| S5-5 | **A1-5b:** `grep -E "eyJ\|sk-\|AIza" .env.example` | Returns nothing — no real key reached the template |
| S5-6 | **A1-5b:** `git check-ignore -v .env .env.local .env.production` and `git ls-files .env.example` | First three **ignored**; `.env.example` still **tracked** |
| S5-7 | **A1-5b:** `cp .env.example .env`, fill in staging values, `npm run dev` | App boots — the template is complete enough to work from |

> **S5-2 is the one that matters.** S5-1 only proves the feature still works; S5-2 proves the
> Production posture — that with the flag absent there is **no way in at all**, including the
> `localStorage` path. Testing only S5-1 would leave the actual security property unverified.

---

## 7. Setup checklist

- [ ] Create Supabase project `gsat-staging` (free tier)
- [ ] Apply §3.1 schema objects
- [ ] Install **current production** `admin_grant_premium` / `admin_revoke_premium` from the rollback file
- [ ] Apply the staging-only `is_admin()` (§3.3)
- [ ] Create ADMIN / USER_A / USER_B in Authentication
- [ ] Insert §4 fixtures (ids substituted)
- [ ] Create the `pack-audio` bucket
- [ ] Set Preview env vars (§5) — **verify the service-role key is staging's**
- [ ] Confirm `SUPABASE_ANON_KEY` is set on Preview (A1-3a fails closed with `500` without it)
- [ ] Confirm `VITE_ENABLE_DEV_TOOLS=true` is set on **Preview only** (A1-5c)
- [ ] Deploy the branch to Vercel Preview
- [ ] **Baseline run:** confirm S1-3 and S3-1/U1 **FAIL** on the unpatched code — i.e. reproduce both
      bugs on staging before fixing them
- [ ] Apply the A1 SQL, then **all nine patches** (§7.1)
- [ ] Run **S1–S5** in full
- [ ] Record results in `docs/phase-0.5b/STAGING_RESULTS.md`

### 7.1 The nine patches — explicit list

Superseding the earlier "the four patches" wording, which predates the A1-3a/A1-3b split and the
A1-5 approval. **A1-3b applies on top of A1-3a**; the rest are independent.

```bash
# SQL first
#   docs/phase-0.5b/A1-premium-functions.sql        (A1-1, A1-2, A1-6)

# A1-3a — TTS security
git apply docs/phase-0.5b/patches/A1-3a-security-api.patch
git apply docs/phase-0.5b/patches/A1-3a-security-ui.patch

# A1-3b — TTS reliability (REQUIRES A1-3a first; API + UI together)
git apply docs/phase-0.5b/patches/A1-3b-reliability-api.patch
git apply docs/phase-0.5b/patches/A1-3b-reliability-ui.patch

# A1-4 — cron fail-closed
git apply docs/phase-0.5b/patches/A1-4-cron.patch

# A1-5 — independent of everything above and of each other
git apply docs/phase-0.5b/patches/A1-5a-secure-token-rng.patch
git apply docs/phase-0.5b/patches/A1-5b-gitignore-env.patch
git apply docs/phase-0.5b/patches/A1-5b-env-example.patch
git apply docs/phase-0.5b/patches/A1-5c-devtools-env-gate.patch
```

`OPTIONAL-A1-3-edge-repo-only.patch` is **not** in this list and **not** an A1 deliverable.

⚠️ **Apply these to the staging deployment only.** 🛑 The `claude/security-architecture-continuation-i3hw1y`
branch must keep `api/`, `src/`, `supabase/`, `.gitignore` and `.env.example` **byte-identical to
`main`** — that is what guarantees pushing it cannot change deployed Production behaviour.

> **The baseline run is not ceremony.** If staging cannot reproduce the bug, staging is not
> faithfully modelling Production, and a green test run afterwards would prove nothing.

---

## 8. Effort and lifetime

| Item | Estimate |
|------|----------|
| Supabase project + schema | ~1 h |
| Fixtures + users | ~30 min |
| Vercel Preview env | ~20 min |
| Baseline + full S1–S5 | ~2 h |
| **Total** | **~4 h** |

Keep the project for Phase 0.5B-B and Phase 1 — the shared-LMS work in B will need a far more
careful staging story, and this becomes its foundation.

**Cost:** Supabase free tier + Vercel preview (included) + a few cents of TTS.

---

## 9. What this staging deliberately cannot prove

Stating the limits, so a green run is not over-read:

- **Production data volume** — a 3-item fixture cannot show real timing. Set
  `TTS_MAX_ITEMS_PER_REQUEST=2` on staging so the chunk loop is exercised, then time one chunk
  against your **largest real pack** separately (survey §P04) before choosing the Production value.
- **Real push delivery** — the synthetic subscription cannot receive. Only a real device on
  Production closes that loop.
- **Vercel's cron scheduler attaching the header (gate G4)** — preview deployments do not run cron
  jobs. This is why A1-4 step 4 (§4 of `A1-4-CRON.md`) verifies a **real scheduled run on
  Production** after setting the secret but **before** deploying fail-closed. **G4 is open, and a
  fully green S1–S5 run does not close it.** G4 does **not** block creating or testing staging —
  it blocks only the Production deployment of `A1-4-cron.patch`.
- **Interaction with the LMS/Writing application** — absent from staging by design. Nothing in A1
  touches it; every item that does is deferred to Phase 0.5B-B.
