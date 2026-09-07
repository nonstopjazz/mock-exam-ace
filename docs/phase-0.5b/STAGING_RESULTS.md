# Staging Results — Phase 0.5B-A1

> **The hard gate. PASSED.**
>
> | | |
> |---|---|
> | **Run** | 2026-08-25 → 2026-08-26 |
> | **Supabase** | `gsat-staging`, ref `cwymrzcovgobfqxtithn` (throwaway, free of production data) |
> | **Vercel** | Preview deployment of `claude/a1-staging-validation` |
> | **Code under test** | `main` + the nine A1 patches, with `package-lock.json` identical to `main` |
> | **Result** | **S1–S5 all pass.** Every finding reproduced BEFORE its fix and is closed AFTER it. |

---

## 0. Why the baseline matters more than the green run

`STAGING_PLAN.md` §7: *"If staging cannot reproduce the bug, staging is not faithfully modelling
Production, and a green test run afterwards would prove nothing."*

Both A1 findings were reproduced on staging **before** any fix was applied.

| Finding | Baseline (unfixed) | After A1 |
|---|---|---|
| **9.15** revocation silently fails | `admin_revoke_premium` → `{"success": true}`, `is_premium_member` **still true**, 1 of 2 rows left active | `revoked_count: 2`, active rows **0**, `is_premium_member` **false** |
| **9.11** TTS endpoint unauthenticated | Unauthenticated `POST` → **HTTP 200**, `total:3`, **6 audio files generated** | Unauthenticated `POST` → **HTTP 401 UNAUTHENTICATED**, **0 rows written** |

Every result below is measured against those two baselines.

---

## 1. S1 — RPC behaviour and EXECUTE grants

`STAGING-S1-VERIFY.sql`, run in the Supabase SQL Editor. **23 of 23 PASS.**

| # | Check | Result |
|---|---|---|
| 1, 5 | **V01** both functions `SECURITY DEFINER` + `proconfig {"search_path=\"\""}` | PASS |
| 2, 6 | **V07** gate written `is_admin() IS NOT TRUE`, no bare `NOT` | PASS |
| 3, 7 | **V02** acl `{postgres, authenticated, service_role}` — no bare `=X/`, no `anon=X/` | PASS |
| 4, 8 | **V03** `anon` EXECUTE false, `authenticated` true | PASS |
| 9–12 | **T8** NULL identity → `UNAUTHORIZED` for grant and revoke, **0 rows written** | PASS |
| 13 | **S1-pre** acting as staging admin, `is_admin()` true | PASS |
| 14 | **T1** first grant → `granted`, 1 active row | PASS |
| 15 | **T2** shorter re-grant → `already_active`, still 1 row | PASS |
| 16 | **T3** longer re-grant → `extended`, still 1 row | PASS |
| 17 | **T4** permanent → `extended`, 1 row, all permanent | PASS |
| 18 | **T4b** 3-month over permanent → `already_active`, **still permanent** (never shortens) | PASS |
| 19 | **T5-pre** USER_B holds 2 active rows (9.15 staged) | PASS |
| 20 | **T5** revoke → **`revoked_count: 2`** | PASS |
| 21 | **T5-check** active rows 0, `is_premium_member` **false** | **PASS — 9.15 FIXED** |
| 22 | **T7** unknown id → `MEMBERSHIP_NOT_FOUND` (not `UNAUTHORIZED`, so the gate passed for a real admin) | PASS |
| 23 | **RESTORE** fixtures back to 2 active rows | PASS |

---

## 2. S2 — the three defence layers, each proven independently

`STAGING_PLAN.md` §6 requires the transport and application layers to hold **separately**, because
testing only one hides a hole in the other. All three were exercised.

| Test | Caller | Result | Blocked at |
|---|---|---|---|
| **S2-1** | `anon`, via PostgREST | HTTP **401**, `{"code":"42501","message":"permission denied for function admin_grant_premium"}` (and the same for revoke) | **Transport** — the `REVOKE` |
| **S2-2** | `staging-user-a`, authenticated non-admin | HTTP **200**, `{"success":false,"error":"UNAUTHORIZED"}` (both functions) | **Application** — `is_admin()` returns false |
| **S2-5 / T8** | NULL identity, grant layer bypassed via SQL Editor | `UNAUTHORIZED` (both), **0 rows written** | **Application** — `is_admin()` returns NULL |
| **S2-3** | `staging-admin`, grant | HTTP **409**, FK violation on the deliberately non-existent target uuid | ✅ **gate passed** — execution reached the `INSERT` |
| **S2-4** | `staging-admin`, revoke | HTTP **200**, `MEMBERSHIP_NOT_FOUND` | ✅ **gate passed** — reached the lookup |

**S2-1 returned `42501` (`insufficient_privilege`), not `No API key found`.** That distinction is the
whole test: a missing API key would also be a 401, but it would mean the request never reached the
grant layer at all — a false pass.

**S2-3's 409 is the strongest possible positive.** A foreign-key error proves the call ran all the
way to the `INSERT`. Had the gate wrongly rejected a real admin, the answer would have been
`UNAUTHORIZED`.

---

## 3. S3 — TTS caller path

| # | Check | Result |
|---|---|---|
| **S3-1** | U1 no token / U2 garbage token / U3 anon-key-as-token | **401** `UNAUTHENTICATED` ×3 |
| | U4 **valid non-admin student token** | **403** `FORBIDDEN` |
| | U5 `GET` | **405** |
| **S3-2** | `pack_items` audio columns after the unauthorized calls | **0 rows populated — zero side effects** |
| **S3-3** | Admin generation across the cursor | all 3 items got **both** `audio_url` and `example_audio_url` |
| **S3-4** | A2 `force` without `confirm_force` | **400** `FORCE_REQUIRES_CONFIRMATION` |
| | A3 `force` + `confirm_force` | **200**, regenerated despite existing audio |
| **S3-7** | Chunking with `TTS_MAX_ITEMS_PER_REQUEST=2` | round 1 `processed=2, next_offset=2, has_more=true` → round 2 `processed=1, next_offset=null, has_more=false` |
| **S3-8** | Caller sends `limit: 100000` | `processed=2` — **server clamps, never accepts a larger value** |
| **S3-5** | Vercel runtime log | `[generate-pack-audio] admin=7860b609-… pack=… offset=… limit=… force=…` on **every** 200; **absent** from the 401/403/405/400 rows |
| **S3-6** | Real admin UI → 「生成發音」 | Success |

**U4 is the product-semantics test, not merely a security one.** A fully authenticated student is
refused because TTS is an admin content-authoring tool (frozen decision §6 #6). It returns **403**,
not 401 — authentication succeeded; authorization did not.

**S3-6 is the only check that proves the A1-3a *UI* patch attaches the caller's JWT.** Every other
S3 test used hand-written `fetch` calls rather than the application's own code. A UI patch that
failed to attach the token would pass all of them and still 403 in the real screen — exactly the
"3a API patched, UI not" failure `PHASE_0_5B_A1_PLAN.md` §15.1 warns about.

**S3-2 is the direct contrast with the baseline.** Three unauthorized calls, zero database change.
Before the fix, one unauthenticated POST generated six audio files.

---

## 4. S4 — cron secret path

| # | Check | Result |
|---|---|---|
| **S4-1** | M1 no auth / M2 wrong secret / M3 malformed header | **401** ×3 |
| | M5 `DELETE` | **405** |
| **S4-2** | M4 correct secret, **`GET`** (as Vercel Cron invokes) | **200** `{"sent":0,"failed":1,"cleaned":0,"total":1}` |
| **S4-3** | Delivery to the synthetic endpoint | `failed: 1` — **expected PASS**: the guard let the caller through and the send path ran |
| **S4-6** | Targeting reconciles | `total: 1` — USER_A, whose `last_study_date` is yesterday |
| **S4-4** | `CRON_SECRET` removed from Preview, redeployed | **503** `{"error":"CRON_SECRET_NOT_CONFIGURED"}` |
| **S4-5** | `CRON_SECRET` restored, redeployed | back to **200** |

**S4-4 is the entire point of the A1-4 patch.** Before it, a missing `CRON_SECRET` skipped the check
completely, so anyone could trigger a push broadcast to every subscriber using `service_role` with
RLS bypassed. A missing secret is now a misconfiguration, not an open door.

**`GET` remains allowed** (frozen rule DO NOT DO #12) — Vercel Cron invokes with `GET`.

---

## 5. S5 — the A1-5 tail

| # | Check | Result |
|---|---|---|
| **S5-1** | Preview with `VITE_ENABLE_DEV_TOOLS=true`, `?devmode=true` | Dev panel **appears** — Preview capability preserved |
| **S5-2** | Flag removed and redeployed: `?devmode=true` **and** `localStorage.dev_mode_enabled` | Panel **does not appear by either route** |
| **S5-3** | New invite token issued in `/admin/tokens` | 8 characters, alphabet unchanged |
| **S5-4** | Pre-existing fixture token `TESTPACK` redeemed at `/claim/TESTPACK` | **Still redeems** — A1-5a is backward compatible |
| **S5-5** | `grep -E "eyJ\|sk-\|AIza" .env.example` | No output |
| **S5-6** | `git check-ignore -v .env .env.local` · `git ls-files .env.example` | Both ignored; `.env.example` still tracked |
| **S5-7** | `npm run build` | Succeeds. The >500 kB chunk warning is pre-existing (the static vocabulary in `PLATFORM_AUDIT.md`), not caused by these patches |

**S5-2 matters more than S5-1.** S5-1 only shows the feature still works. S5-2 proves the Production
posture: with the flag absent there is **no activation path at all**, including the `localStorage`
route that survives navigation. Before A1-5c, one visit to `?devmode=true` wrote that key and the
panel stayed reachable afterwards without the parameter.

---

## 6. What staging found — four defects the API tests alone would have missed

| # | Found | How it surfaced | Outcome |
|---|---|---|---|
| 1 | **The A1 admin gate was open to NULL-identity callers.** `is_admin()` returns NULL — not false — when `auth.uid()` is NULL; under a bare `NOT` the condition is NULL, PL/pgSQL treats that as false, and the `UNAUTHORIZED` branch was **skipped**. A NULL-identity call returned `{"success": true, "action": "extended", …}`. Only the `REVOKE` was holding, so the two defences were not independent. | Reproduced on PostgreSQL 16.13 while preparing staging | **Fixed** with `IS NOT TRUE` in A1-1/A1-2 (owner-approved as an in-scope correctness fix; A1 stayed at nine items). Locked in by **V07** and **T8/S2-5** |
| 2 | **The `REVOKE` block never applied.** The SQL Editor run left both function bodies correctly updated while PUBLIC and `anon` kept `EXECUTE`. Every functional signal looked right. | Caught by **V02/V03** | Grants re-applied; re-verified |
| 3 | **Two of the verification checks were themselves broken.** V01 compared `proconfig::text` with `LIKE '%search_path=""%'`, but that renders with escaped quotes, so a correctly hardened function reported FAIL. V02 built a `has_function_privilege` signature from `pg_get_function_identity_arguments`, which includes parameter names and is not a valid signature. | Noticed while reconciling a FAIL against a direct query | Both fixed. *A structural check that cannot fail is worse than no check, because it reads as evidence.* |
| 4 | **`pack_images` was missing from the staging schema**, so the admin pack page could not load and S3-6 was blocked. Like `app_admins`, it exists in Production with no DDL anywhere in the repository. | S3-6 | Reconstructed from its call sites and added to `STAGING-BOOTSTRAP.sql`. Its RLS is **not** modelled on Production and the file says so; no A1 item touches it |

Defect 2 is the one to remember: **had this SQL gone straight to Production, `anon` would have kept
EXECUTE on both admin functions while every functional test passed.**

---

## 7. What staging deliberately could NOT prove

| Limit | Where it was closed |
|---|---|
| **Vercel's scheduler attaching `Authorization: Bearer $CRON_SECRET`** — Preview deployments do not run crons | ✅ **Gate G4, closed on Production 2026-08-25 ~20:13 Asia/Taipei**: the `0 12 * * *` schedule fired automatically with no manual Run, and a real device received the reminder |
| **Real push delivery** — the synthetic endpoint cannot receive | Same G4 observation |
| **Production data volume** — a 3-item fixture cannot show real timing | Time one chunk against the largest real pack (214 items) before choosing the Production `TTS_MAX_ITEMS_PER_REQUEST` |
| **Interaction with the LMS/Writing application** — absent by design | Nothing in A1 touches it; every item that does is deferred to 0.5B-B |

---

## 8. Deployment prerequisites still open

| Gate | State |
|---|---|
| **G4** scheduled cron | ✅ **PASSED** — no longer blocks A1-4 |
| **G5** `SUPABASE_ANON_KEY` on **Production** | ⏳ **OPEN.** Set on Preview during this run; 🛑 **required by A1-3a on Production, with no fallback** |
| `VITE_ENABLE_DEV_TOOLS` **absent** from Production | Must be confirmed before the A1-5c deploy |

---

## 9. Teardown

The staging Supabase project and `claude/a1-staging-validation` are throwaway. When deleting them:

1. 🛑 **Delete the branch — never merge it.** It carries the patched source.
2. Deleting the staging Supabase project leaves every Preview deployment pointing at a dead
   database, because the Preview variables are scoped to all preview branches. Either remove those
   Preview-scoped variables or repoint them.
3. **Do not restore the old scoping.** Before this work, `SUPABASE_SERVICE_ROLE_KEY`,
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` were set to *All Environments*, which meant
   every Preview deployment held Production's service-role key and could write to Production with
   RLS bypassed. Detaching Preview closed that. **Leave it closed.**
4. `DROP FUNCTION public._staging_verify();` if the project is kept for 0.5B-B.
