# A1-3 — Secure the privileged TTS endpoints

> 🛑 **PREPARED, NOT DEPLOYED.** The patches in `patches/` are **not applied** to the working tree.
> `api/`, `src/` and `supabase/functions/` are untouched.

Addresses audit finding **§9.11 (CRITICAL)**.

| Patch | Target |
|-------|--------|
| `patches/A1-3-tts-api.patch` | `api/generate-pack-audio.ts` — the live endpoint |
| `patches/A1-3-tts-ui.patch` | `src/pages/admin/PackItemsAdmin.tsx` — its only caller |
| `patches/A1-3-tts-edge.patch` | `supabase/functions/generate-pack-audio/index.ts` — the parallel copy |

---

## 1. Current caller flow

```
Admin opens /admin/packs/:packId/items      (RequireAdmin — UI gate only)
  └─ clicks 「生成發音」
      └─ PackItemsAdmin.handleGenerateAudio()          src/…/PackItemsAdmin.tsx:243
          └─ fetch('/api/generate-pack-audio', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },   ← ⚠️ NO Authorization header
               body: { pack_id }
             })
              └─ api/generate-pack-audio.ts
                   ├─ if (req.method !== 'POST') → 405       ← the ONLY gate that exists
                   ├─ createClient(URL, SERVICE_ROLE_KEY)    ← full RLS bypass
                   ├─ SELECT pack_items WHERE pack_id
                   ├─ Google TTS × N   (5-way concurrency, maxDuration 60s)
                   ├─ storage.upload('pack-audio', …, { upsert: true })
                   └─ UPDATE pack_items SET audio_url / example_audio_url
```

### 1.1 Confirmed facts

| Fact | Evidence |
|------|----------|
| **The caller sends no `Authorization` header at all** | `PackItemsAdmin.tsx:247-251` — headers are `Content-Type` only |
| **The handler performs no authentication or authorization** | `api/generate-pack-audio.ts` — the only guard is the HTTP-method check |
| **It runs as `service_role`** | `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` |
| **The Edge Function has no caller in this repository** | `grep -rn "functions.invoke\|generate-pack-audio" src api` returns only the Vercel path |
| `RequireAdmin` is a UI gate only | It renders a component; it cannot stop a direct HTTP request |

### 1.2 What an unauthenticated attacker can do today

`POST /api/generate-pack-audio {"pack_id":"…","force":true}` — no key, no cookie, no token:

1. **Burn unbounded Google Cloud TTS quota.** `force: true` re-synthesises every word *and* every example sentence. Repeat at will. This is an uncapped billing attack.
2. **Overwrite Storage objects** — `upsert: true` into `pack-audio`.
3. **Write to `pack_items` with RLS bypassed** via `service_role`.

Pack ids are discoverable: `packs` has a public SELECT policy for `is_public = true`.

> The Edge Function is worse in one respect (`Access-Control-Allow-Origin: *`) and better in another (it may be behind `verify_jwt`). ⚠️ **`verify_jwt` only proves *some* valid JWT was presented — any logged-in user passes.** It is not an admin check.

---

## 2. Proposed authentication / authorization design

**Principle: reuse the authoritative gate, do not invent a fifth one.**

The audit found four parallel admin mechanisms (§3.5). This design adds none. It validates the
caller's JWT, then evaluates `is_admin()` **as that user**, so this endpoint inherits whatever
`is_admin()` means — including the Phase 1 convergence, for free.

```
Client (admin browser)
  └─ supabase.auth.getSession() → access_token
      └─ POST /api/generate-pack-audio
           Authorization: Bearer <access_token>
              │
              ▼
        api/generate-pack-audio.ts
          1. extract Bearer token            → 401 UNAUTHENTICATED if absent
          2. anon-key client + caller's token
             └─ auth.getUser()               → 401 UNAUTHENTICATED if invalid/expired
          3. rpc('is_admin')  AS THE CALLER   → 403 FORBIDDEN if not true
          4. force && !confirm_force          → 400 FORCE_REQUIRES_CONFIRMATION
          5. log { admin_id, pack_id, force }
          6. ── only now ── service_role client does the work
```

**Why a second client rather than validating with `service_role`:** `is_admin()` reads `auth.uid()`.
Under `service_role` that is `NULL`, so the check would always fail. Creating a short-lived
anon-key client carrying the caller's token makes `auth.uid()` resolve to the real user, which is
what makes reusing `is_admin()` possible at all.

**New environment variable:** `SUPABASE_ANON_KEY` (or the existing `VITE_SUPABASE_ANON_KEY`, which
the patch accepts as a fallback). This is the **publishable** key — it already ships in the browser
bundle — so it is not a new secret, just a new place to read it.

### 2.1 Response contract

| Status | Body | Meaning |
|--------|------|---------|
| 401 | `{"error":"UNAUTHENTICATED"}` | No/invalid/expired token |
| 403 | `{"error":"FORBIDDEN"}` | Valid user, not an admin |
| 400 | `{"error":"FORCE_REQUIRES_CONFIRMATION"}` | `force:true` without `confirm_force:true` |
| 413 | `{"error":"TOO_MANY_ITEMS", …}` | Pack exceeds the per-request synthesis cap |
| 200 | unchanged | Success — existing shape preserved |

The UI maps 401/403/413 to readable Chinese messages; every other path is untouched.

---

## 3. Rate-limit recommendation

**Let me be straight about what is and isn't achievable inside A1.**

**The admin gate is the actual fix.** Once only admins can call this, the *abuse* vector is closed
entirely. What remains is **accidental cost blowup** — a double-click, a retry loop, a mistaken
`force` on a large pack. That is what the limits below address.

### In scope (in the patch)

| Control | Value | Rationale |
|---------|-------|-----------|
| **Per-request synthesis cap** | `MAX_TTS_CALLS_PER_REQUEST = 400` | Bounds the cost of any single invocation. Returns 413 with the required count so the admin can split the pack. Tune to your largest legitimate pack. |
| **`force` requires `confirm_force`** | — | `force` is the expensive path. A stray retry cannot trigger a full re-synthesis. The UI never sends `force`, so this is invisible in normal use. |
| **Structured logging** | `admin=<uuid> pack=<id> force=<bool>` | Makes usage auditable in Vercel logs. There is currently **no record at all** of who triggered generation. |

### Deliberately NOT in scope

**A real rate limiter needs shared state, and serverless has none.** In-memory counters do not work
across Vercel invocations. Doing it properly means either a `tts_jobs` table (a schema change,
outside a hotfix) or an external store like Upstash (new infrastructure).

**Recommendation:** ship the three controls above now; revisit a `tts_jobs` table in Phase 1 if
usage warrants it. Meanwhile the practical cost ceiling is a Google Cloud **budget alert plus a
quota cap on the Text-to-Speech API** — configured in GCP, not in this codebase, and worth doing
regardless of what the application does.

---

## 4. Code diff

Apply with `git apply docs/phase-0.5b/patches/A1-3-tts-*.patch`.
All three have been **dry-run verified** against the current tree (`git apply --check` passes).

### 4.1 `api/generate-pack-audio.ts` — auth + limits

```diff
+// A1-3: the maximum number of TTS syntheses a single invocation may perform.
+const MAX_TTS_CALLS_PER_REQUEST = 400;
+
 export default async function handler(req: any, res: any) {
   if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }
-  const { pack_id, force = false } = req.body || {};
+  const { pack_id, force = false, confirm_force = false } = req.body || {};
   …
+  const SUPABASE_ANON_KEY =
+    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
   …
+  // ---- authenticate ----
+  const authHeader: string = req.headers?.authorization || req.headers?.Authorization || '';
+  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
+  if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });
+
+  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
+    global: { headers: { Authorization: `Bearer ${token}` } },
+    auth: { persistSession: false, autoRefreshToken: false },
+  });
+  const { data: userData, error: userError } = await userClient.auth.getUser();
+  if (userError || !userData?.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
+
+  // ---- authorize, reusing the schema's own admin gate ----
+  const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin');
+  if (adminError || isAdmin !== true) return res.status(403).json({ error: 'FORBIDDEN' });
+
+  if (force && !confirm_force) {
+    return res.status(400).json({ error: 'FORCE_REQUIRES_CONFIRMATION' });
+  }
+  console.log(`[generate-pack-audio] admin=${userData.user.id} pack=${pack_id} force=${force}`);
 
   const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
```

plus, before the batch loop:

```diff
+    if (tasks.length > MAX_TTS_CALLS_PER_REQUEST) {
+      return res.status(413).json({ error: 'TOO_MANY_ITEMS', required: tasks.length,
+                                    limit: MAX_TTS_CALLS_PER_REQUEST, message: … });
+    }
     await processInBatches(tasks, 5, async (task) => {
```

### 4.2 `src/pages/admin/PackItemsAdmin.tsx` — send the token

```diff
+      const { data: { session } } = await supabase.auth.getSession();
+      if (!session) throw new Error('登入狀態已失效，請重新登入後再試');
+
       const res = await fetch('/api/generate-pack-audio', {
         method: 'POST',
-        headers: { 'Content-Type': 'application/json' },
+        headers: {
+          'Content-Type': 'application/json',
+          Authorization: `Bearer ${session.access_token}`,
+        },
         body: JSON.stringify({ pack_id: packId }),
       });
…
+      if (res.status === 401) throw new Error('登入狀態已失效，請重新登入後再試');
+      if (res.status === 403) throw new Error('權限不足：只有管理員可以生成發音');
+      if (res.status === 413) throw new Error(data.message || '單字包過大，請分批處理');
       if (!res.ok) throw new Error(data.error || '生成失敗');
```

`supabase` is already imported at line 3 — no new import needed.

### 4.3 `supabase/functions/generate-pack-audio/index.ts` — same gate, plus CORS

Identical auth flow in Deno, and the wildcard origin replaced by an allow-list driven by a new
`ALLOWED_ORIGINS` env var. If the variable is unset, **no** `Access-Control-Allow-Origin` header is
emitted — browsers are blocked by default rather than by accident.

> **Open question for you.** This Edge Function has **no caller anywhere in this repository**. It is
> a second, divergent implementation of a privileged endpoint. Options:
> **(a)** patch it (this diff), **(b)** delete it, **(c)** leave it and accept the exposure.
> **I recommend (b) if it is genuinely unused** — one less privileged surface. The patch exists so
> that (a) is available if something outside this repo calls it. ⚠️ Check the Supabase Dashboard for
> whether it is even deployed before deciding.

---

## 5. Rollback

No database objects change, so rollback is purely code.

```bash
# Reverse the patches (working tree)
git apply -R docs/phase-0.5b/patches/A1-3-tts-ui.patch
git apply -R docs/phase-0.5b/patches/A1-3-tts-api.patch
git apply -R docs/phase-0.5b/patches/A1-3-tts-edge.patch

# or, if already committed and deployed:
git revert <commit-sha>          # then redeploy
```

Vercel also allows an **instant rollback** to the previous deployment from the Dashboard —
faster than a git revert if the endpoint is broken in production.

⚠️ **Rolling back reinstates finding §9.11**: the endpoint becomes unauthenticated again.

**Order matters.** The UI patch and the API patch must move together:

| State | Result |
|-------|--------|
| API patched, UI not | Admin UI gets **403** — audio generation broken |
| UI patched, API not | Works (the extra header is ignored) — **safe intermediate state** |

So: **deploy UI first or simultaneously; roll back API first.** Since both live in the same Vercel
deployment, a single deploy covers both — but the asymmetry matters if you ever split them.

`SUPABASE_ANON_KEY` may be left set after a rollback; it is harmless and publishable.

---

## 6. Verification cases

### 6.1 Unauthorized (must all FAIL closed)

```bash
BASE=https://<staging-host>

# U1 — no token at all (today: 200 and burns quota; after: 401)
curl -s -o /dev/null -w "U1 no-token          -> %{http_code}\n" \
  -X POST "$BASE/api/generate-pack-audio" \
  -H 'Content-Type: application/json' -d '{"pack_id":"<REAL_PACK_ID>"}'
# EXPECT 401

# U2 — malformed token
curl -s -o /dev/null -w "U2 garbage-token     -> %{http_code}\n" \
  -X POST "$BASE/api/generate-pack-audio" \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer not-a-jwt' \
  -d '{"pack_id":"<REAL_PACK_ID>"}'
# EXPECT 401

# U3 — anon key used as a bearer token
curl -s -o /dev/null -w "U3 anon-key-as-token -> %{http_code}\n" \
  -X POST "$BASE/api/generate-pack-audio" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{"pack_id":"<REAL_PACK_ID>"}'
# EXPECT 401

# U4 — valid NON-ADMIN user token  ← the most important negative test
curl -s -o /dev/null -w "U4 non-admin-token   -> %{http_code}\n" \
  -X POST "$BASE/api/generate-pack-audio" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $NON_ADMIN_JWT" \
  -d '{"pack_id":"<REAL_PACK_ID>"}'
# EXPECT 403

# U5 — GET instead of POST
curl -s -o /dev/null -w "U5 wrong-method      -> %{http_code}\n" \
  "$BASE/api/generate-pack-audio"
# EXPECT 405
```

**After U1–U5, confirm no side effects occurred:**

```sql
-- No audio_url should have been written by the failed attempts.
SELECT count(*) FILTER (WHERE audio_url IS NOT NULL) AS with_audio, count(*) AS total
FROM public.pack_items WHERE pack_id = '<REAL_PACK_ID>';
-- Compare against the same query run BEFORE the attempts. Must be identical.
```

Also check the Google Cloud TTS metrics dashboard: the request count must not move.

### 6.2 Authorized (must all SUCCEED)

```bash
# A1 — admin token, normal generation
curl -s -w "\nA1 admin -> %{http_code}\n" \
  -X POST "$BASE/api/generate-pack-audio" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"pack_id":"<SMALL_TEST_PACK_ID>"}'
# EXPECT 200 and the usual {success, total, wordGenerated, …}

# A2 — force without confirmation
curl -s -w "\nA2 force-unconfirmed -> %{http_code}\n" \
  -X POST "$BASE/api/generate-pack-audio" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"pack_id":"<SMALL_TEST_PACK_ID>","force":true}'
# EXPECT 400 FORCE_REQUIRES_CONFIRMATION

# A3 — force WITH confirmation
curl -s -w "\nA3 force-confirmed -> %{http_code}\n" \
  -X POST "$BASE/api/generate-pack-audio" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"pack_id":"<SMALL_TEST_PACK_ID>","force":true,"confirm_force":true}'
# EXPECT 200, all items regenerated

# A4 — over-large pack
#      Use a pack whose (words + examples) exceeds MAX_TTS_CALLS_PER_REQUEST.
# EXPECT 413 TOO_MANY_ITEMS with `required` and `limit`
```

### 6.3 UI smoke test (staging)

1. Sign in as **admin** → `/admin/packs/:packId/items` → 「生成發音」 → success toast, `audio_url`
   populated, audio plays.
2. Sign in as a **non-admin** and call the endpoint directly (the UI route is gated) → **403**, and
   the UI shows 「權限不足：只有管理員可以生成發音」.
3. Let the session expire (or clear it) → click 「生成發音」 → 「登入狀態已失效，請重新登入後再試」,
   and **no request reaches the server**.

### 6.4 Log verification

Vercel → Deployment → Functions → `generate-pack-audio`. Every successful A1/A3 run must emit:

```
[generate-pack-audio] admin=<uuid> pack=<pack_id> force=<bool>
```

An invocation with no such line and a 200 means the gate was bypassed — **stop and investigate**.
