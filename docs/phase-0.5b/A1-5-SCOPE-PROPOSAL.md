# A1-5 — ✅ APPROVED and PREPARED (NOT deployed)

> **Approved 2026-08-23.** All three items approved; **5c approved with a specific design** —
> disabled in Production, retained in local development **and Vercel Preview**.
>
> 🛑 Patches are prepared but **not applied**. `src/` and `.gitignore` are byte-identical to
> Production.

| Item | Patch | Status |
|------|-------|--------|
| **5a** secure token RNG | `patches/A1-5a-secure-token-rng.patch` | ✅ approved, prepared |
| **5b** `.gitignore` env protection | `patches/A1-5b-gitignore-env.patch` | ✅ approved, prepared |
| **5b** `.env.example` full inventory | `patches/A1-5b-env-example.patch` | ✅ approved, prepared |
| **5c** dev tools env gate | `patches/A1-5c-devtools-env-gate.patch` | ✅ approved **with the Preview-preserving design** |

All three **apply independently to a clean tree** (`git apply --check` verified) and touch no
database object.

---

## 1. Summary

A1-5 is the "tail" of A1: **three small, independent, low-risk hardening items** that share one
property — they are pure GSAT-owned application changes with **no database, no Supabase object, and
no LMS/Writing dependency**.

| # | Item | Finding | Severity | Files | DB? |
|---|------|---------|----------|-------|-----|
| **A1-5a** | Invite tokens generated with `Math.random()` | §9.13b / Phase-0 S9 | 🟡 MEDIUM | `src/pages/admin/TokensAdmin.tsx` | ❌ |
| **A1-5b** | `.gitignore` does not cover `.env` | §9.14 | 🟢 INFORMATIONAL | `.gitignore` *(+ `.env.example`)* | ❌ |
| **A1-5c** | Dev panel reachable in Production via `?devmode=true` | §9.13d | 🟢 LOW | `src/components/dev/DevPhaseSwitcher.tsx` | ❌ |

**Total: 3 files, no schema, no migration, no Supabase change.**

**All three approved.** 5c was approved with an amended design that preserves Preview capability — see §4.

---

## 2. A1-5a — Cryptographically weak invite tokens

### Finding
§9.13b (from Phase 0 finding **S9**). 📁 Repository-confirmed.

### Current behaviour
`src/pages/admin/TokensAdmin.tsx:91` builds invite tokens client-side:

```ts
result += chars.charAt(Math.floor(Math.random() * chars.length));
```

`Math.random()` is **not cryptographically secure**. V8's PRNG is seeded per-context and its internal
state is recoverable from a modest number of outputs, so previously-issued and future tokens become
predictable to anyone who can collect a sample.

### Why it matters here specifically
It **compounds finding §9.4**, which is confirmed in Production: `invite_tokens` has
`"Anyone can validate tokens" USING (is_active = true)` and `anon` holds `SELECT`, so **every active
token is already enumerable by anyone**.

> Enumerable **and** predictable is materially worse than either alone: an attacker who cannot list
> tokens can still guess them, and one who can list them can also derive the generator's state.

⚠️ **Scope honesty:** §9.4 (the enumeration policy) is the bigger half of this problem and is
**deferred to Phase 0.5B-B**, because `tokens.created_by` has an FK to `auth.users` and a
cross-application caller cannot be ruled out. **A1-5a does not fix §9.4.** It removes predictability
for *newly issued* tokens only. Existing tokens stay as they are.

### Proposed change
Replace the `Math.random()` loop with `crypto.getRandomValues()`, preserving the existing alphabet
(`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — already excludes look-alike characters) and token length, so
**every existing token stays valid and the format is unchanged**.

Use rejection sampling rather than plain modulo, so the 32-character alphabet maps uniformly onto
byte values without bias.

### Objects touched
`src/pages/admin/TokensAdmin.tsx` — one function. No DB, no API, no format change.

### Risk
🟢 **Very low.** `crypto.getRandomValues` is available in every browser this admin UI supports. Token
shape, length and alphabet are identical, so nothing downstream changes.

### Why A1 (not A2 or Phase 1)
Pure GSAT admin UI code with no LMS dependency — the A1 criterion. It is also the natural companion
to §9.4's eventual fix: doing it now means that when B-14 tightens the read policy, the tokens behind
it are already unguessable.

---

## 3. A1-5b — `.gitignore` does not cover `.env`

### Finding
§9.14. 📁 Repository-confirmed, and **downgraded to INFORMATIONAL** because verification showed **no
`.env` has ever been committed** across all 113 commits, and **no secret appears anywhere** in the
tree or its history.

### Current behaviour
`.gitignore` covers `*.local` (so `.env.local` is ignored) but **not `.env`**. A developer creating
`.env` locally — exactly what `.env.example` instructs — would find it staged by `git add .`.

That file would contain `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_TTS_API_KEY`, `VAPID_PRIVATE_KEY` and
(after A1-4) `CRON_SECRET`. **Committing it once means rotating every one of them**, since git history
is effectively permanent on a pushed branch.

### Proposed change
Add to `.gitignore`:

```gitignore
.env
.env.*
!.env.example
```

### ✅ `.env.example` full inventory — APPROVED and DELIVERED

`patches/A1-5b-env-example.patch`. A complete repository inventory of `process.env.*`,
`import.meta.env.*` and `Deno.env.get()` was run; **17 distinct variables** were found and **all 17
are documented** (`DEV` / `PROD` are Vite built-ins and are excluded by design, with a note saying so).

Each entry carries: **name · safe placeholder · one-line purpose · which file uses it · environment
scope · server-only vs client-exposed.**

**Variables the earlier drafts had missed** — found only by doing the full inventory rather than
adding the three we happened to be discussing:

| Variable | Where | Why it was missed |
|----------|-------|-------------------|
| `VITE_SITE_ID` | `src/hooks/useSiteIdentifier.ts` | Local-only override; invisible in deployed environments |
| `VITE_VAPID_PUBLIC_KEY` | `src/hooks/usePushSubscription.ts` | Browser half of the push key pair |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` | `api/send-daily-reminders.ts` | Server side of push |
| `SUPABASE_URL` | both `api/*.ts` + the Edge Function | Server fallback behind `VITE_SUPABASE_URL` |

**Structure:** §1 server-only · §2 client-exposed (Vite) · §3 optional configuration · a
quick-reference table. It opens with an explanation that **the `VITE_` prefix is a security
boundary** — anything carrying it is compiled into the browser bundle and is therefore public.

**Specific callouts, as instructed:**

- **`VITE_ENABLE_DEV_TOOLS`** — *"LOCAL AND PREVIEW ONLY. NEVER enable in Production."* with the
  reason: unset in Production means **no activation path exists at all**.
- **`CRON_SECRET`** — *"PRODUCTION SECRET"*, generate with `openssl rand -hex 32`, and
  *"DO NOT reuse a Supabase key, a Google API key, or any other existing credential."*
- **`TTS_MAX_ITEMS_PER_REQUEST`** — default **100**, explicitly **not required**; commented out so
  the default applies unless deliberately overridden.

**Verified safe:** no real project URL, no key-shaped string, no `nonstopjazz`/`ilearn.blog` value.
Every placeholder is non-functional.

### 3.1 ⚠️ Your correction, and a defect it exposed in my own patch

You separated `SUPABASE_ANON_KEY` (server) from `VITE_SUPABASE_ANON_KEY` (browser) and said not to
conflate them because the value may be the same. **That is right, and it caught a real mistake in my
A1-3a patch.**

My earlier version read:

```ts
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;   // ← conflates the two
```

I added that fallback for deployment convenience, and in doing so I **defeated the very property
that makes the naming useful**: with the fallback, a reader can no longer tell from a variable's
name whether its value reaches the client, and the server handler would silently work off the
browser variable.

**Fixed.** The patch now reads the server-only name and nothing else:

```ts
// Server-only name, deliberately NOT the VITE_-prefixed one.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
```

with a comment in the code explaining why, and matching notes on both entries in `.env.example`.
**The cost is one extra Vercel variable to set. The benefit is that the naming convention stays
honest** — and, as you put it, you can tell at a glance which values get bundled into client JS.

### Objects touched
`.gitignore` (7 lines) and `.env.example` (full rewrite — template values only).

### Risk
🟢 **None.** Purely preventative. No runtime behaviour. The `!.env.example` negation keeps the
existing tracked file tracked.

### Why A1
It is the cheapest item in the entire programme and it protects the credentials the *other* A1 items
introduce. A1-3 adds `SUPABASE_ANON_KEY` and A1-4 adds `CRON_SECRET` to the set of things a developer
will put in a local `.env` — **so this is most valuable landed alongside them, not after.**

---

## 4. A1-5c — Dev panel reachable in Production

### Finding
§9.13d. 📁 Repository-confirmed.

### Current behaviour
`src/components/dev/DevPhaseSwitcher.tsx` documents itself as *"completely removed in production
builds"*. It is not. `isDevModeEnabled()` explicitly supports production activation:

```ts
if (import.meta.env.DEV) return true;
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("devmode") === "true") {
  localStorage.setItem("dev_mode_enabled", "true");   // persists across navigation
  return true;
}
if (localStorage.getItem("dev_mode_enabled") === "true") return true;
```

So `https://<host>/?devmode=true` opens a developer panel in Production for any visitor, and it
persists via `localStorage`.

### Actual impact — deliberately not overstated
🟢 **LOW, and I want to be precise about why.** The panel writes `dev_simulated_phase` to
`localStorage` and dispatches an event. It **does not**:

- change routing (`PhaseGate` reads `PhaseContext`, which is sourced from `site_settings`),
- alter any server-side authorization,
- grant access to gated pages.

The real cost is **information disclosure and confusion**: it advertises the internal phase model and
lets a curious visitor toggle a panel that looks meaningful but is not.

### Approved change — Production off, local **and Preview** on

You approved 5c **with an amended design**, and the amendment is the right call: my original
proposal (gate on `import.meta.env.DEV` alone) would have removed a legitimate Preview capability to
fix a low-severity issue. That is a bad trade.

**Approved behaviour:**

| Environment | Dev tools | Mechanism |
|-------------|-----------|-----------|
| **Local development** | ✅ available | `import.meta.env.DEV` is true |
| **Vercel Preview** | ✅ available | `VITE_ENABLE_DEV_TOOLS === 'true'`, set on the Preview scope only |
| **Production** | ❌ **no activation path exists** | neither condition holds |

Inside the permitted environments, `?devmode=true` and the `localStorage` persistence continue to
work **exactly as they do today** — nothing about the developer workflow changes.

```ts
function devToolsAllowedHere(): boolean {
  if (import.meta.env.DEV) return true;                      // local
  return import.meta.env.VITE_ENABLE_DEV_TOOLS === "true";   // Preview (explicit opt-in)
}

function isDevModeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (!devToolsAllowedHere()) return false;                  // ← Production stops here
  …existing ?devmode / localStorage logic, unchanged…
}
```

**Why an explicit `VITE_ENABLE_DEV_TOOLS` rather than sniffing `VERCEL_ENV`:**

1. Vite only exposes variables prefixed `VITE_` to client code, so `VERCEL_ENV` is not readable in
   the browser without mapping it anyway.
2. An explicit variable makes enabling dev tooling a **visible, intentional configuration act**
   scoped to one environment — rather than behaviour that silently follows a platform value someone
   could change without realising.
3. It keeps the mechanism portable if the project ever moves off Vercel.

**`clearDevMode()` is retained** — it is still useful on Preview, and my earlier proposal to delete
it no longer applies.

### Objects touched
`src/components/dev/DevPhaseSwitcher.tsx` — one added helper and one guard line.
Plus one Vercel env var: `VITE_ENABLE_DEV_TOOLS=true`, **Preview scope only**.

### Risk
🟢 **Low, and lower than my original proposal.** Local development is untouched. Preview keeps the
capability provided the variable is set. Only Production loses an activation path that was never
intended to exist.

⚠️ **One operational note:** if `VITE_ENABLE_DEV_TOOLS` is *not* set on Preview, dev tools become
unavailable there too. That is a configuration step, not a code defect — it is in the deployment
checklist below and in `STAGING_PLAN.md`.

### Why A1
Pure frontend, no DB, no LMS dependency. With the amended design it no longer removes any capability
you use, which was my only reservation about including it.

## 5. Recommendation

| Item | Status | Notes |
|------|--------|-------|
| **A1-5a** tokens | ✅ **APPROVED — prepared** | `crypto.getRandomValues()` + rejection sampling; alphabet and length unchanged, so existing tokens stay valid |
| **A1-5b** `.gitignore` | ✅ **APPROVED — prepared** | `.env`, `.env.*`, `!.env.example` |
| **A1-5c** dev tools | ✅ **APPROVED — prepared, amended design** | Production off; local + Preview on via `VITE_ENABLE_DEV_TOOLS` |

**Suggested sequencing:** A1-5 is not urgent and has no dependencies. It can ride along with the
A1-3/A1-4 deployment as **one extra commit in the same Vercel deploy**, or land separately at any
time. It does **not** need to gate on staging the way the SQL and endpoint changes do — though
verifying it there costs nothing.

### Deployment checklist

- [ ] Set `VITE_ENABLE_DEV_TOOLS=true` on the Vercel **Preview** environment (5c). **Do not set it on
      Production.**
- [ ] Apply the three patches (they are independent; any subset is valid)
- [ ] `npm run build` succeeds
- [ ] **5a:** issue a new invite token in `/admin/tokens` — 8 characters, same alphabet, and an
      existing token still redeems successfully at `/claim/:token`
- [ ] **5b `.gitignore`:** ✅ *already verified behaviourally* — with the patch applied,
      `git check-ignore` reports `.env`, `.env.local` and `.env.production` as **ignored** while
      `.env.example` stays **tracked**
- [ ] **5b `.env.example`:** confirm a fresh `cp .env.example .env` + filling in real values still
      boots the app locally (`npm run dev`)
- [ ] **5b:** confirm no real value reached the template — `grep -E "eyJ|sk-|AIza" .env.example`
      returns nothing
- [ ] **5c Production:** `https://<prod>/?devmode=true` → **no panel**, and
      `localStorage.dev_mode_enabled` has no effect
- [ ] **5c Preview:** `https://<preview>/?devmode=true` → panel **appears** (proves the capability
      was preserved)
- [ ] **5c local:** `npm run dev` → panel appears as before

### Rollback

```bash
git apply -R docs/phase-0.5b/patches/A1-5a-secure-token-rng.patch
git apply -R docs/phase-0.5b/patches/A1-5b-gitignore-env.patch
git apply -R docs/phase-0.5b/patches/A1-5c-devtools-env-gate.patch
```

Each is independent — reverting one does not affect the others. None touches a database object, so
there is no data to restore. Tokens issued while 5a was live remain valid after a rollback; they were
simply generated from a better source.

### ✅ Nothing left open in A1-5

The `.env.example` inventory was the last outstanding item and is now delivered — all 17 variables,
placeholders only.

### One deployment consequence to note

Because the `VITE_SUPABASE_ANON_KEY` fallback is removed (§3.1), **`SUPABASE_ANON_KEY` must be set
in Vercel before A1-3a is deployed.** If it is missing the endpoint returns
`500 Supabase credentials not configured` — it fails closed, which is the correct direction, but it
would look like a broken deploy. It is on the deployment checklist in `PHASE_0_5B_A1_PLAN.md` §7.

---

## 6. Explicitly NOT in A1-5

For the avoidance of doubt, these related items stay where the audit put them:

| Item | Where it stays | Why |
|------|----------------|-----|
| §9.4 — `invite_tokens` / `tokens` readable by `anon` | **0.5B-B** | Possible cross-application caller; `tokens.created_by` FKs `auth.users` |
| §9.13a — `/dashboard/result-summary` ungated | **Deferred, opt-in** | Lives in the **reserved** GSAT exam domain (§8) — needs your explicit approval to touch |
| §9.13e — 9 legacy admin routes gated only by `!IS_PRODUCTION` | **Deferred, opt-in** | Same reserved-domain consideration |
| §9.9 — broken `upsert_word_progress` 6-arg overload | **A2 optional ride-along** | It is a database object, not application code |
