# Phase 0.5A — Production Discovery Runbook

This folder contains the **read-only** discovery tooling for Phase 0.5A.

> **This folder is NOT a migration directory.** Nothing here is ever applied to the
> database as a change. `production_discovery.sql` contains only `SELECT`
> statements against `pg_catalog`, `information_schema`, and `storage.*`.

---

## Why this exists

The Phase 0.5A audit (`docs/PRODUCTION_SCHEMA_AUDIT.md`) requires evidence from the
**live Production Supabase project**. This session had **no Production access** — no
credentials, no project ref, no Supabase MCP server, no linked CLI. Rather than guess,
the audit is written as a template with every Production claim explicitly marked
`NOT YET CONFIRMED`, and this script exists to produce the missing evidence.

---

## What access is missing

| Needed | Status in this session |
|--------|------------------------|
| `VITE_SUPABASE_URL` / project ref | ❌ Not set. Only the placeholder in `.env.example` exists. |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ Not set |
| Postgres connection string | ❌ Not set |
| Supabase MCP server | ❌ Not connected |
| Supabase CLI + linked project | ❌ CLI not installed, no `~/.supabase`, no `supabase/config.toml` |
| `psql` client | ✅ Installed (PostgreSQL 16.13) — usable the moment a connection string is provided |

**Confirmed clean:** no `.env` file exists, no credentials appear anywhere in the working
tree, and no `.env` has ever been committed in the repository's 113-commit history.
The absence of access is a configuration gap, not a leak.

---

## How to run

Pick whichever is convenient. **Option A is the lowest-friction and lowest-risk.**

### Option A — Supabase Dashboard (recommended)

1. Open your project → **SQL Editor**.
2. Open `production_discovery.sql`.
3. Run **one block at a time**. Blocks are delimited by markers like:
   ```
   -- ===== [Q07] EVERY RLS policy: command, roles, USING, WITH CHECK =====
   ```
4. Export each result (the Editor's *Download CSV* button, or copy as Markdown).
5. Save the outputs as `docs/discovery/output/Q01.csv`, `Q02.csv`, … or paste them
   into a single `docs/discovery/output/RESULTS.md`.

The Dashboard SQL Editor runs as a privileged role, so it sees everything — which is
exactly what discovery needs.

### Option B — psql

Get the connection string from **Project Settings → Database → Connection string**
(use the *Session* pooler or direct connection).

```bash
export SUPABASE_DB_URL='postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres'

# human-readable
psql "$SUPABASE_DB_URL" \
  -f docs/discovery/production_discovery.sql \
  > docs/discovery/output/output.txt 2>&1

# or CSV
psql "$SUPABASE_DB_URL" --csv \
  -f docs/discovery/production_discovery.sql \
  > docs/discovery/output/output.csv 2> docs/discovery/output/errors.txt
```

Prefer a **read-only role** if one exists. If not, the script is still safe — but use
the least-privileged role that can read `pg_catalog`.

---

## Query map

| Query | Answers | Audit task |
|-------|---------|-----------|
| Q01 | All tables/views: RLS state, owner, size, row estimate | Task 1 |
| Q02 | All columns: type, nullability, defaults | Task 1 |
| Q03 | PK / FK / UNIQUE / CHECK constraints | Task 1 |
| Q04 | All indexes (**incl. the `COALESCE` UNIQUE INDEX** constraints miss) | Task 1 |
| Q05 | View + matview definitions (`exam_statistics`, `blog_post_stats`) | Task 1 |
| Q06 | Custom enum types | Task 1 |
| **Q07** | **Every RLS policy with USING / WITH CHECK** | **Task 2** |
| Q08 | ⚠️ `public` tables with RLS **disabled** | Task 2 |
| Q09 | ⚠️ Tables with RLS on but **zero policies** | Task 2 |
| **Q10** | **Table grants to `anon` / `authenticated`** | **Task 2** |
| Q11 | Column-level grants | Task 2 |
| Q12 | Default privileges for future objects | Task 2 |
| Q13 | All functions: `SECURITY DEFINER`, `search_path`, ACL | Task 3 |
| Q14 | **Full source of every `public` function** | Task 3 |
| Q15 | Targeted: `is_admin`, `admin_grant_premium`, `admin_revoke_premium`, `claim_pack_with_token` (+ overload detection) | Task 3, 7 |
| Q16 | `EXECUTE` grants to `anon` / `authenticated` | Task 3, 7 |
| Q17 | All triggers (incl. any on `auth.users`) | Task 3, 4 |
| Q18 | Every FK pointing at `auth.users` — the identity graph | Task 4 |
| Q19 | Pre-existing role/teacher/class/parent tables | Task 4 |
| Q20 | Role/permission-shaped columns | Task 4 |
| Q21 | Does `app_admins` exist? | Task 4, 7 |
| Q22 | Identity volume — **counts only, no PII** | Task 4 |
| Q23 | Auth providers in use | Task 4 |
| Q24 | Storage buckets: public flag, limits, MIME types | Task 5 |
| Q25 | Storage RLS policies on `storage.objects` | Task 5 |
| Q26 | Per-bucket object counts + path conventions | Task 5 |
| **Q27** | **Writing/essay/AI-grading tables by name** | **Task 6** |
| **Q28** | **Writing-shaped columns (catches oddly-named tables)** | **Task 6** |
| **Q29** | **Tables NOT referenced by the GSAT repo** → writing-app candidates | **Task 6** |
| Q30 | Was Supabase CLI migration tracking ever used? (resolves C1) | Task 3 |
| Q31 | Installed extensions | Task 1 |
| Q32 | *(optional, commented)* Exact row counts | Task 1 |
| Q33 | *(optional, commented)* Premium self-grant integrity check | Task 7 |

---

## The three questions that unblock the most work

If you only run three queries, run these:

1. **Q15** — settles which `claim_pack_with_token` is live, and whether
   `admin_grant_premium` actually checks authorization. This is the difference between
   a CRITICAL finding and a false alarm.
2. **Q07 + Q10 together** — the real access-control picture. A policy without a grant is
   inert; a grant without a policy is wide open. Neither query alone tells the truth.
3. **Q29** — reveals the writing application's tables. Phase 5 cannot be designed
   without it, and Phase 1 schema naming needs it to avoid collisions.

---

## Handling the output

- **Do not paste application row data into the repository.** This script returns metadata
  only. If you run the optional Q32/Q33 blocks, they return ids, counts and timestamps —
  no emails, names, or essay text. Keep it that way.
- Q22 counts `auth.users` but never selects `email` or `raw_user_meta_data`. Please don't
  extend it to.
- Suggested location for results: `docs/discovery/output/` (create it; it is not tracked
  by anything yet).

Once the output is available, the analysis step is:

> "Here is the Production discovery output. Complete `docs/PRODUCTION_SCHEMA_AUDIT.md`
> by replacing every `NOT YET CONFIRMED` marker with confirmed findings."

Every section of that document is already structured to receive these results, and each
placeholder names the exact query whose output fills it.

---

## Validation performed on this script

The script was executed end-to-end against a **throwaway local PostgreSQL 16.13 instance**
seeded with a Supabase-shaped fixture (`auth.users`, `auth.identities`, `storage.buckets`,
`storage.objects`, the `anon` / `authenticated` / `service_role` roles, RLS policies,
overloaded functions, and a decoy `writing_submissions` table).

Result: **all 31 active queries executed with zero errors.** Spot-checks confirmed that
Q15 correctly detects both `claim_pack_with_token` overloads and reports their
`search_path` status, and that Q29 correctly isolates the unaccounted writing table while
ignoring known GSAT tables. The test instance was destroyed afterwards; it never touched
Production.
