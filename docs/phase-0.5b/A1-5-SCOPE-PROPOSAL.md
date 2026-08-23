# A1-5 — Scope proposal (NOT approved, NOT prepared, NOT deployed)

> You asked for the exact scope, findings, objects/files and A1 justification **before** approving.
> This document is that proposal. **No patch has been written and nothing has been changed.**

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

**My honest recommendation: approve A1-5a and A1-5b; treat A1-5c as optional.** Reasoning in §5.

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

**Optional companion:** `.env.example` currently documents 2 of the ~11 variables actually used. A1-4
adds `CRON_SECRET` and A1-3 adds `SUPABASE_ANON_KEY` / `TTS_MAX_ITEMS_PER_REQUEST`, so someone will
need the full list. Adding **names only, never values** is a small, useful change — flag if you want
it in scope.

### Objects touched
`.gitignore` (3 lines). Optionally `.env.example` (names only).

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

### Proposed change
Gate on `import.meta.env.DEV` alone — delete the URL-parameter and `localStorage` activation paths,
matching what the component's own comment already claims.

### Objects touched
`src/components/dev/DevPhaseSwitcher.tsx` — one function, plus removal of the now-unused
`clearDevMode` escape hatch.

### Risk
🟡 **Low, with one caveat worth your attention.** If you currently use `?devmode=true` to preview
phase behaviour on a deployed Production or Preview URL, **this removes that ability**. The
replacement is running locally (`npm run dev`), where it still works.

**Tell me if that workflow matters to you** — if so, the better fix is to keep it but gate on a
Preview-only env flag rather than removing it. I have not assumed either way.

### Why A1
Pure frontend, no DB, no LMS dependency. **But it is the weakest A1 fit of the three** — it is a
hygiene item, not a security fix, and it is the only A1-5 item that could remove something you use.

---

## 5. Recommendation

| Item | Recommend | Why |
|------|-----------|-----|
| **A1-5a** tokens | ✅ **Approve** | Real security value; compounds a confirmed Production finding; zero-risk change |
| **A1-5b** `.gitignore` | ✅ **Approve** | Free; protects the very credentials A1-3/A1-4 introduce |
| **A1-5c** dev panel | 🤔 **Your call** | Genuinely low impact, and it may remove a workflow you rely on |

**Suggested sequencing:** A1-5 is not urgent and has no dependencies. It can ride along with the
A1-3/A1-4 deployment as **one extra commit in the same Vercel deploy**, or land separately at any
time. It does **not** need to gate on staging the way the SQL and endpoint changes do — though
verifying it there costs nothing.

### What I would need from you to prepare it

1. Approve A1-5a and A1-5b (or a subset).
2. Decide on A1-5c: **remove** the production activation path, or **keep** it behind a Preview-only
   flag.
3. Say whether `.env.example` should be completed with the full variable-name list.

On approval I will prepare it exactly as with A1-3/A1-4: patch files under
`docs/phase-0.5b/patches/`, dry-run verified, with rollback and verification, **and nothing applied
to the working tree**.

---

## 6. Explicitly NOT in A1-5

For the avoidance of doubt, these related items stay where the audit put them:

| Item | Where it stays | Why |
|------|----------------|-----|
| §9.4 — `invite_tokens` / `tokens` readable by `anon` | **0.5B-B** | Possible cross-application caller; `tokens.created_by` FKs `auth.users` |
| §9.13a — `/dashboard/result-summary` ungated | **Deferred, opt-in** | Lives in the **reserved** GSAT exam domain (§8) — needs your explicit approval to touch |
| §9.13e — 9 legacy admin routes gated only by `!IS_PRODUCTION` | **Deferred, opt-in** | Same reserved-domain consideration |
| §9.9 — broken `upsert_word_progress` 6-arg overload | **A2 optional ride-along** | It is a database object, not application code |
