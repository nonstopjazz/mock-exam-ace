# A1-3 — TTS: split into **A1-3a Security** and **A1-3b Reliability**

> 🛑 **PREPARED, NOT DEPLOYED.** No patch is applied. `api/` and `src/` are byte-identical to
> Production.

Per your instruction, the **authorization fix and the API/workflow redesign are now two
independently reviewable, independently deployable, independently reversible patches.**

| Patch | Concern | Files | Fixes |
|-------|---------|-------|-------|
| **A1-3a** `A1-3a-security-api.patch` + `A1-3a-security-ui.patch` | 🔴 **Security** — JWT auth + authoritative `is_admin()` | `api/generate-pack-audio.ts`, `PackItemsAdmin.tsx` | §9.11 CRITICAL |
| **A1-3b** `A1-3b-reliability-api.patch` + `A1-3b-reliability-ui.patch` | 🟠 **Reliability** — chunking/cursor/UI loop | same two files | pre-existing large-pack timeout |
| *(optional)* `OPTIONAL-A1-3-edge-repo-only.patch` | Repository hygiene | `supabase/functions/generate-pack-audio/index.ts` | see §5 |

**Verified independence:**

```
A1-3a alone applies to a clean tree                    ✅ OK
A1-3b applies on top of A1-3a                          ✅ OK
A1-3b reverses cleanly, leaving A1-3a still applied    ✅ OK   ← the property you asked for
```

So you can ship security now and reliability later, or roll reliability back without reopening the
security hole.

---

## 1. Product semantics (confirmed by the owner)

> **TTS is an admin content-authoring tool, not a student-facing service.** It exists so the owner
> can generate English pronunciation audio for vocabulary packs and flashcards from the admin back
> office. `PackItemsAdmin` is the expected — and only — caller. **Ordinary authenticated students
> have no need for TTS generation rights.**

Admin-only authorization is therefore the **correct product semantics**, not merely a tightening.
The student case (`403`) is the key negative test in §3.5.

---

## 2. Current caller flow

```
Admin opens /admin/packs/:packId/items      (RequireAdmin — UI gate only)
  └─ clicks 「生成發音」
      └─ PackItemsAdmin.handleGenerateAudio()          src/…/PackItemsAdmin.tsx:243
          └─ fetch('/api/generate-pack-audio', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },   ← ⚠️ NO Authorization header
               body: { pack_id }
             })
              └─ api/generate-pack-audio.ts     (maxDuration: 60)
                   ├─ if (req.method !== 'POST') → 405       ← the ONLY gate that exists
                   ├─ createClient(URL, SERVICE_ROLE_KEY)    ← full RLS bypass
                   ├─ SELECT pack_items WHERE pack_id        ← ⚠️ the WHOLE pack, unbounded
                   ├─ Google TTS × N   (5-way concurrency)
                   ├─ storage.upload('pack-audio', …, { upsert: true })
                   └─ UPDATE pack_items SET audio_url / example_audio_url
```

| Fact | Evidence |
|------|----------|
| Caller sends **no** `Authorization` header | `PackItemsAdmin.tsx:247-251` |
| Handler has **no** auth/authz | only the HTTP-method check |
| Runs as `service_role` | `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` |
| **Large packs already fail today** | `maxDuration: 60` + the UI's 504 handler 「處理超時，請嘗試較小的單字包或稍後重試」(`PackItemsAdmin.tsx:257`) |
| `RequireAdmin` is a UI gate only | it renders a component; it cannot stop an HTTP request |

**What an unauthenticated `POST` can do right now:** burn unbounded Google TTS quota (`force: true`
re-synthesises everything), overwrite `pack-audio` objects (`upsert: true`), and write `pack_items`
with RLS bypassed. Pack ids are discoverable — `packs` has a public SELECT policy for
`is_public = true`.

---

## 3. A1-3a — Security

### 3.1 Design

**Principle: reuse the authoritative gate, do not invent a fifth one.** The audit found four
parallel admin mechanisms; this adds none. It validates the caller's JWT, then evaluates
`is_admin()` **as that user**, so the endpoint inherits whatever `is_admin()` means — including the
Phase 1 convergence, for free.

```
1. extract Bearer token                → 401 UNAUTHENTICATED if absent
2. anon-key client + caller's token
   └─ auth.getUser()                   → 401 UNAUTHENTICATED if invalid/expired
3. rpc('is_admin')  AS THE CALLER       → 403 FORBIDDEN if not true   ← students stop here
4. force && !confirm_force              → 400 FORCE_REQUIRES_CONFIRMATION
5. log { admin_id, pack_id, force }
6. ── only now ── service_role client does the work
```

**Why a second client rather than validating with `service_role`:** `is_admin()` reads `auth.uid()`,
which is `NULL` under `service_role`, so the check would always fail. A short-lived anon-key client
carrying the caller's token makes `auth.uid()` resolve to the real user.

**New env var:** `SUPABASE_ANON_KEY` (the patch also accepts `VITE_SUPABASE_ANON_KEY`). This is the
**publishable** key — it already ships in the browser bundle — so it is not a new secret.

### 3.2 Response contract

| Status | Body | Meaning |
|--------|------|---------|
| 401 | `{"error":"UNAUTHENTICATED"}` | No/invalid/expired token |
| 403 | `{"error":"FORBIDDEN"}` | Valid user, not an admin — **the student case** |
| 400 | `{"error":"FORCE_REQUIRES_CONFIRMATION"}` | `force:true` without `confirm_force:true` |
| 200 | unchanged from today | Success |

**A1-3a does not change the response shape.** That is what makes it independently deployable.

### 3.3 Diff

```diff
+  const SUPABASE_ANON_KEY =
+    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
   …
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
+  const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin');
+  if (adminError || isAdmin !== true) return res.status(403).json({ error: 'FORBIDDEN' });
+
+  if (force && !confirm_force) return res.status(400).json({ error: 'FORCE_REQUIRES_CONFIRMATION' });
+  console.log(`[generate-pack-audio] admin=${userData.user.id} pack=${pack_id} force=${force}`);
```

UI side — send the token, map the new statuses:

```diff
+      const { data: { session } } = await supabase.auth.getSession();
+      if (!session) throw new Error('登入狀態已失效，請重新登入後再試');
+
       const res = await fetch('/api/generate-pack-audio', {
         method: 'POST',
-        headers: { 'Content-Type': 'application/json' },
+        headers: { 'Content-Type': 'application/json',
+                   Authorization: `Bearer ${session.access_token}` },
         body: JSON.stringify({ pack_id: packId }),
       });
…
+      if (res.status === 401) throw new Error('登入狀態已失效，請重新登入後再試');
+      if (res.status === 403) throw new Error('權限不足：只有管理員可以生成發音');
       if (!res.ok) throw new Error(data.error || '生成失敗');
```

`supabase` is already imported at line 3 — no new import.

### 3.4 Rollback — A1-3a only

```bash
git apply -R docs/phase-0.5b/patches/A1-3a-security-ui.patch
git apply -R docs/phase-0.5b/patches/A1-3a-security-api.patch
# or Vercel Dashboard → Deployments → previous → Promote  (fastest)
```

⚠️ **Reinstates §9.11** — the endpoint becomes unauthenticated again.

⚠️ **If A1-3b is deployed, roll it back FIRST.** A1-3b's UI loop reads `has_more`/`next_offset`,
which only the A1-3b API returns. Reverting 3a alone is fine; reverting 3a while 3b is applied is
not a state either patch was designed for.

**Ordering within 3a:** UI-patched/API-unpatched is safe (the extra header is ignored).
API-patched/UI-unpatched gives the admin UI a 403. **Deploy UI first or together; roll back API
first.** Both live in one Vercel deployment, so a single deploy covers it.

`SUPABASE_ANON_KEY` may be left set after rollback; it is inert.

### 3.5 Verification — A1-3a

**Unauthorized — must all fail closed:**

```bash
BASE=https://<staging-host>

curl -s -o /dev/null -w "U1 no-token          -> %{http_code}\n" \
  -X POST "$BASE/api/generate-pack-audio" -H 'Content-Type: application/json' \
  -d '{"pack_id":"<PACK_ID>"}'                                            # EXPECT 401

curl -s -o /dev/null -w "U2 garbage-token     -> %{http_code}\n" \
  -X POST "$BASE/api/generate-pack-audio" -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer not-a-jwt' -d '{"pack_id":"<PACK_ID>"}'       # EXPECT 401

curl -s -o /dev/null -w "U3 anon-key-as-token -> %{http_code}\n" \
  -X POST "$BASE/api/generate-pack-audio" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" -d '{"pack_id":"<PACK_ID>"}'  # EXPECT 401

# U4 — valid NON-ADMIN student token   ← the product-semantics test
curl -s -o /dev/null -w "U4 student-token     -> %{http_code}\n" \
  -X POST "$BASE/api/generate-pack-audio" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $STUDENT_JWT" -d '{"pack_id":"<PACK_ID>"}'    # EXPECT 403

curl -s -o /dev/null -w "U5 wrong-method      -> %{http_code}\n" \
  "$BASE/api/generate-pack-audio"                                          # EXPECT 405
```

**Then prove no side effects — compare against the same query run before U1:**

```sql
SELECT count(*) FILTER (WHERE audio_url IS NOT NULL) AS with_audio, count(*) AS total
FROM public.pack_items WHERE pack_id = '<PACK_ID>';
```

Also confirm Google Cloud TTS request count did not move.

**Authorized:**

| # | Call | Expect |
|---|------|--------|
| A1 | admin token, small pack | 200, normal counters |
| A2 | `{"force":true}` | 400 `FORCE_REQUIRES_CONFIRMATION` |
| A3 | `{"force":true,"confirm_force":true}` | 200, everything regenerated |

**UI:** admin generates successfully; student gets 「權限不足：只有管理員可以生成發音」; an expired
session gives 「登入狀態已失效」 **without any request reaching the server**.

**Logs:** every 200 must emit `[generate-pack-audio] admin=<uuid> pack=<id> force=<bool>`.
A 200 with no such line means the gate was bypassed — **stop and investigate**.

---

## 4. A1-3b — Reliability (chunking)

### 4.1 Why this is a separate concern — and a real bug

Your 214-item figure settles it. With `maxDuration: 60`, 5-way concurrency and ~0.5s per synthesis,
the realistic single-invocation ceiling is roughly **250 syntheses**.

```
Largest Production pack      214 items
Worst case (all have examples)  214 × 2 = 428 syntheses
Realistic capacity              ~250 syntheses
```

> **Your largest pack is roughly 1.7× over budget.** It almost certainly times out today — which is
> exactly why the UI already ships a 504 handler telling the admin to "try a smaller pack".

**This is a pre-existing production defect, not a consequence of the security fix.** Keeping it in a
separate patch is right: it has a different risk profile, a different rollback, and a different
reason to exist.

### 4.2 Design

```
POST { pack_id, offset?, limit?, force?, confirm_force? }
  → processes pack_items ordered by sort_order, rows [offset, offset+limit)
  → 200 { total, processed, offset, next_offset, has_more, …counters }

UI: offset = 0
    loop { POST …; accumulate counters; if (!has_more) break; offset = next_offset }
```

**Approved default: `TTS_MAX_ITEMS_PER_REQUEST = 100`.** At 214 items that is **3 chunks**, each at
most 200 syntheses — under the ~250 ceiling with margin.

| Property | Effect |
|----------|--------|
| No pack is too large | 214 items completes in 3 requests instead of one that fails |
| Admin workflow unbroken | One click still does the whole pack; progress toasts show `N / total` |
| Cost bounded per request | At most `limit × 2` syntheses |
| Partial progress survives | A failed chunk keeps every earlier slice; a retry skips completed items |
| Server-clamped | A caller may request a **smaller** `limit`, never a larger one |

### 4.3 Diff

```diff
+const DEFAULT_MAX_ITEMS_PER_REQUEST = 100;
+const MAX_ITEMS_PER_REQUEST = Math.max(1,
+  parseInt(process.env.TTS_MAX_ITEMS_PER_REQUEST || '', 10) || DEFAULT_MAX_ITEMS_PER_REQUEST);
…
+  const offset = Math.max(0, parseInt(String(rawOffset), 10) || 0);
+  const limit  = Math.min(MAX_ITEMS_PER_REQUEST, …);     // server clamps
…
-      .select('id, word, example_sentence, audio_url, example_audio_url')
-      .order('sort_order', { ascending: true });
+      .select('…', { count: 'exact' })
+      .order('sort_order', { ascending: true })
+      .range(offset, offset + limit - 1);
…
+    const nextOffset = offset + items.length;
+    const hasMore = nextOffset < total;
     return res.json({
-      success: true, total: items.length, …
+      success: true, total, processed: items.length, offset,
+      next_offset: hasMore ? nextOffset : null, has_more: hasMore, …
     });
```

UI — wrap the existing call in a cursor loop with progress toasts and a `guard > 1000` stop, in case
a server bug ever returned a non-advancing cursor.

### 4.4 Rollback — A1-3b only

```bash
git apply -R docs/phase-0.5b/patches/A1-3b-reliability-ui.patch
git apply -R docs/phase-0.5b/patches/A1-3b-reliability-api.patch
```

✅ **Verified: this leaves A1-3a fully applied.** Reverting reliability does **not** reopen §9.11.

⚠️ It restores the large-pack timeout, so your 214-item pack goes back to failing.

**Ordering within 3b:** UI-patched/API-unpatched degrades safely — the old API returns no `has_more`,
so the loop exits after one pass, i.e. today's behaviour. API-patched/UI-unpatched also works: the
old UI sends no `offset`, gets slice 0, and silently processes only the first 100 items — **which
looks like success but is incomplete.** So for 3b: **deploy API and UI together**, and if splitting
is ever unavoidable, deploy the **UI first**.

`TTS_MAX_ITEMS_PER_REQUEST` may be left set after rollback; it is inert.

### 4.5 Verification — A1-3b

| # | Call | Expect |
|---|------|--------|
| B1 | `{"pack_id":"<214-ITEM>","offset":0}` | 200, `total:214`, `processed:100`, `has_more:true`, `next_offset:100` |
| B2 | `…"offset":100` | `processed:100`, `has_more:true`, `next_offset:200` |
| B3 | `…"offset":200` | `processed:14`, **`has_more:false`**, `next_offset:null` |
| B4 | `…"offset":0,"limit":100000` | `processed <= 100` — **server clamps** |
| B5 | after B1–B3 | every one of the 214 items has `audio_url` |
| B6 | re-run B1 | `wordSkipped` high, `wordGenerated` ~0 — already-done items skipped |

```sql
-- B5
SELECT count(*) FILTER (WHERE audio_url IS NOT NULL) AS with_audio, count(*) AS total
FROM public.pack_items WHERE pack_id = '<214-ITEM-PACK>';
-- EXPECT with_audio = total = 214
```

**Timing (survey §P04):** one chunk against the 214-item pack must land comfortably under ~45s. If it
approaches 50s, lower `TTS_MAX_ITEMS_PER_REQUEST`.

**UI:** the large pack completes with progress toasts and **no 504** — the regression this fixes.
Interrupt mid-run (close the tab) and re-run: already-generated items are skipped.

**On staging**, set `TTS_MAX_ITEMS_PER_REQUEST=2` so the 3-item fixture pack exercises the same loop
without real TTS spend.

---

## 5. Edge Function — **REPOSITORY-ONLY / NOT CONFIRMED DEPLOYED**

Your Dashboard check found **no deployed Edge Functions**. `GOOGLE_TTS_API_KEY` exists under Edge
Function Secrets, but a secret with no function to run it is inert.

**Status: `REPOSITORY-ONLY / NOT CONFIRMED DEPLOYED IN PRODUCTION`.**

| Decision | Status |
|----------|--------|
| Production patch required for A1? | ❌ **No** — nothing is deployed to patch |
| Delete the function? | ❌ **Not yet**, per your instruction |
| Rotate/delete `GOOGLE_TTS_API_KEY` secret? | ❌ **No** — leave unchanged in A1 |
| Active TTS path | ✅ The **Vercel API** route from `PackItemsAdmin` |

`OPTIONAL-A1-3-edge-repo-only.patch` is retained as **repository hygiene, not an A1 deliverable**. Its
value is forward-looking: **if anyone ever deploys this function as-is, it would go live
unauthenticated with `Access-Control-Allow-Origin: *`.** Applying the patch means the repository
cannot ship an unsecured privileged endpoint by accident. Apply it whenever convenient, or when the
function is next touched.

> ⚠️ One caveat on the evidence: "not visible in the Dashboard" is strong but not absolute — a
> function deployed under a different project, or removed from the list while still routable, would
> not show. If you later see traffic on `/functions/v1/generate-pack-audio`, treat that as evidence
> of deployment and apply the patch immediately.

---

## 6. Combined deployment order

Both patches may ship in **one Vercel deployment**; they are separable for review and rollback, not
necessarily for release.

| # | Step | Note |
|---|------|------|
| 1 | Set `SUPABASE_ANON_KEY` (Production + Preview) | Required by A1-3a |
| 2 | Set `TTS_MAX_ITEMS_PER_REQUEST=100` (Production), `=2` (Preview) | Optional — 100 is the default |
| 3 | Staging: apply 3a → verify §3.5 | Security proven in isolation |
| 4 | Staging: apply 3b → verify §4.5 | Reliability proven on top |
| 5 | Staging: revert 3b → confirm 3a still enforces | **Proves the split is real** |
| 6 | Production deploy (3a + 3b together, or 3a alone first) | Your call |
| 7 | Verify §3.5 U1–U5 and §4.5 B1–B6 against Production | — |

**If you want the security fix out sooner**, ship 3a alone at step 6 and follow with 3b. The
214-item pack keeps failing in the interim — exactly as it does today, no worse.
