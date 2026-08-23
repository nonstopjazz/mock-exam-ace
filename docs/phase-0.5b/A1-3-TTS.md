# A1-3 — Secure the privileged TTS endpoints

> 🛑 **PREPARED, NOT DEPLOYED.** The patches in `patches/` are **not applied**.
> `api/`, `src/` and `supabase/functions/` are byte-identical to Production.

Addresses audit finding **§9.11 (CRITICAL)**.

| Artefact | Target |
|----------|--------|
| `patches/A1-3-tts-api.patch` | `api/generate-pack-audio.ts` — the live endpoint |
| `patches/A1-3-tts-ui.patch` | `src/pages/admin/PackItemsAdmin.tsx` — its only caller |
| `patches/A1-3-tts-edge.patch` | `supabase/functions/generate-pack-audio/index.ts` — the parallel copy |
| `A1-3-pack-size-survey.sql` | **read-only** — measures real pack sizes to set the chunk limit |

---

## 1. Product semantics (confirmed by the owner)

> **TTS is an admin content-authoring tool, not a student-facing service.**
> It exists so the owner can generate English pronunciation audio for vocabulary packs and
> flashcards from the admin back office. `PackItemsAdmin` is the expected — and only — caller.
> **Ordinary authenticated students have no need for TTS generation rights.**

This makes **admin-only authorization the correct product semantics**, not merely a security
tightening. The design below implements exactly that.

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

### 2.1 Confirmed facts

| Fact | Evidence |
|------|----------|
| **The caller sends no `Authorization` header at all** | `PackItemsAdmin.tsx:247-251` — headers are `Content-Type` only |
| **The handler performs no authentication or authorization** | the only guard is the HTTP-method check |
| **It runs as `service_role`** | `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` |
| **The Edge Function has no caller in this repository** | `grep -rn "functions.invoke\|generate-pack-audio" src api` returns only the Vercel path |
| **Large packs already fail today** | `maxDuration: 60` **and** the UI carries a 504 handler: 「處理超時，請嘗試較小的單字包或稍後重試」(`PackItemsAdmin.tsx:257`) |
| `RequireAdmin` is a UI gate only | It renders a component; it cannot stop a direct HTTP request |

### 2.2 What an unauthenticated attacker can do today

`POST /api/generate-pack-audio {"pack_id":"…","force":true}` — no key, no cookie, no token:

1. **Burn unbounded Google Cloud TTS quota.** `force: true` re-synthesises every word *and* every
   example sentence. Repeat at will. An uncapped billing attack.
2. **Overwrite Storage objects** — `upsert: true` into `pack-audio`.
3. **Write to `pack_items` with RLS bypassed** via `service_role`.

Pack ids are discoverable: `packs` has a public SELECT policy for `is_public = true`.

---

## 3. Proposed authentication / authorization design

**Principle: reuse the authoritative gate, do not invent a fifth one.**

The audit found four parallel admin mechanisms (§3.5 of the schema audit). This design adds none. It
validates the caller's JWT, then evaluates `is_admin()` **as that user**, so the endpoint inherits
whatever `is_admin()` means — including the Phase 1 convergence, for free.

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
          3. rpc('is_admin')  AS THE CALLER   → 403 FORBIDDEN if not true   ← students stop here
          4. force && !confirm_force          → 400 FORCE_REQUIRES_CONFIRMATION
          5. log { admin_id, pack_id, offset, limit, force }
          6. ── only now ── service_role client processes ONE SLICE
```

**Why a second client rather than validating with `service_role`:** `is_admin()` reads `auth.uid()`.
Under `service_role` that is `NULL`, so the check would always fail. A short-lived anon-key client
carrying the caller's token makes `auth.uid()` resolve to the real user, which is what makes reusing
`is_admin()` possible at all.

**New environment variable:** `SUPABASE_ANON_KEY` (the patch also accepts the existing
`VITE_SUPABASE_ANON_KEY`). This is the **publishable** key — it already ships in the browser bundle —
so it is not a new secret, just a new place to read it.

### 3.1 Response contract

| Status | Body | Meaning |
|--------|------|---------|
| 401 | `{"error":"UNAUTHENTICATED"}` | No/invalid/expired token |
| 403 | `{"error":"FORBIDDEN"}` | Valid user, not an admin — **the student case** |
| 400 | `{"error":"FORCE_REQUIRES_CONFIRMATION"}` | `force:true` without `confirm_force:true` |
| 200 | `{success, total, processed, offset, next_offset, has_more, …}` | One slice done |

---

## 4. Batch size — redesigned as chunking, not a cap

### 4.1 Why the 400-cap I first proposed was the wrong answer

You pushed back on treating 400 as final, and investigating the actual constraint showed the cap was
**not just arbitrary — it was solving the wrong problem.**

`api/generate-pack-audio.ts` declares `maxDuration: 60`. Each item costs up to **two** Google TTS
syntheses. At 5-way concurrency and ~0.5s per round trip, roughly **250 syntheses** is the realistic
ceiling for a single invocation — well below 400. So a 400-cap would never fire; **the function would
time out first.**

And that is not hypothetical. The admin UI already ships a 504 handler that says
「處理超時，請嘗試較小的單字包或稍後重試」. **Large packs already fail in Production today**, and the
existing remedy is "use a smaller pack" — which is not a remedy at all if the pack is genuinely large.

> A security cap that fires *after* the real failure point protects nothing and breaks workflow.
> **Chunking fixes the pre-existing timeout bug and bounds cost as a side effect.**

### 4.2 The design

The endpoint processes **one slice** and returns a cursor; the UI loops until done.

```
POST { pack_id, offset?, limit?, force?, confirm_force? }
  → processes pack_items ordered by sort_order, rows [offset, offset+limit)
  → 200 { total, processed, offset, next_offset, has_more, …counters }

UI: offset = 0
    loop { POST …; accumulate counters; if (!has_more) break; offset = next_offset }
```

| Property | Effect |
|----------|--------|
| **No pack is too large** | A 1000-item pack completes in 10 requests instead of one impossible one |
| **Admin workflow unbroken** | One click still generates the whole pack; progress toasts show `N / total` |
| **Cost bounded per request** | Each invocation does at most `limit × 2` syntheses |
| **Partial progress survives** | A failed chunk keeps every earlier slice; a retry resumes cheaply |
| **Configurable server-side** | `TTS_MAX_ITEMS_PER_REQUEST`, default **100** |

The client may request a *smaller* `limit`, never a larger one — the server clamps to
`TTS_MAX_ITEMS_PER_REQUEST`, so the bound cannot be raised by a caller.

### 4.3 Setting the limit from real data

**Run `A1-3-pack-size-survey.sql`** (read-only, Production-safe). It reports per-pack item counts,
synthesis workload, and — via **P03** — exactly which packs already exceed a single invocation's
budget today.

Rule of thumb, since each item costs 1 synthesis or 2 when it has an example sentence:

```
limit  ≈  200 / (1 + fraction_of_items_with_an_example)

  every item has an example  →  ~100 items per request
  no item has an example     →  ~200 items per request
```

**Default 100 is deliberately conservative and safe for any pack shape.** Raise it only after timing
a real chunk against your largest pack (survey §P04) and confirming it lands comfortably under ~45s.

> Please send me the **P02** output and I will recommend a specific value. Until then the default
> guarantees correctness at the cost of a few extra HTTP round trips — the right trade for a hotfix.

### 4.4 Remaining cost controls in the patch

| Control | Rationale |
|---------|-----------|
| **`force` requires `confirm_force`** | `force` is the expensive path. A stray retry or double-click cannot trigger a full regeneration. The UI never sends `force`, so this is invisible in normal use. |
| **Structured logging** | `admin=<uuid> pack=<id> offset=… limit=… force=…`. There is currently **no record at all** of who triggered generation. |

**A true rate limiter is still out of scope and I want to be clear why.** It needs shared state, and
serverless has none — in-memory counters do not survive across invocations. Doing it properly means a
`tts_jobs` table (a schema change) or an external store like Upstash (new infrastructure). Neither
belongs in a hotfix.

**The admin gate is what closes the abuse vector.** For the residual accidental-cost risk, the
highest-value control is outside this codebase entirely: a **quota cap on the Google Cloud
Text-to-Speech API** (not merely a budget alert). Worth setting regardless of what the application
does.

---

## 5. Code diff

Apply with `git apply docs/phase-0.5b/patches/A1-3-tts-*.patch`.
All three are **dry-run verified** (`git apply --check` passes), and the patched TypeScript
parse-checks to the **same error-code set** as the originals — no new error class introduced.

### 5.1 `api/generate-pack-audio.ts`

```diff
+const DEFAULT_MAX_ITEMS_PER_REQUEST = 100;
+const MAX_ITEMS_PER_REQUEST = Math.max(1,
+  parseInt(process.env.TTS_MAX_ITEMS_PER_REQUEST || '', 10) || DEFAULT_MAX_ITEMS_PER_REQUEST);
+
 export default async function handler(req: any, res: any) {
   if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }
-  const { pack_id, force = false } = req.body || {};
+  const { pack_id, force = false, confirm_force = false,
+          offset: rawOffset = 0, limit: rawLimit } = req.body || {};
   …
+  const offset = Math.max(0, parseInt(String(rawOffset), 10) || 0);
+  const limit  = Math.min(MAX_ITEMS_PER_REQUEST, …);      // server clamps; caller cannot raise
+  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
   …
+  // ---- authenticate ----
+  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
+  if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });
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
+  if (force && !confirm_force) return res.status(400).json({ error: 'FORCE_REQUIRES_CONFIRMATION' });
+  console.log(`[generate-pack-audio] admin=${userData.user.id} pack=${pack_id} offset=${offset} limit=${limit} force=${force}`);
```

and the fetch becomes a slice with an exact total:

```diff
-      .select('id, word, example_sentence, audio_url, example_audio_url')
-      .eq('pack_id', pack_id)
-      .order('sort_order', { ascending: true });
+      .select('id, word, example_sentence, audio_url, example_audio_url', { count: 'exact' })
+      .eq('pack_id', pack_id)
+      .order('sort_order', { ascending: true })
+      .range(offset, offset + limit - 1);
…
+    const nextOffset = offset + items.length;
+    const hasMore = nextOffset < total;
     return res.json({
-      success: true, total: items.length, wordGenerated, …
+      success: true, total, processed: items.length, offset,
+      next_offset: hasMore ? nextOffset : null, has_more: hasMore, wordGenerated, …
     });
```

### 5.2 `src/pages/admin/PackItemsAdmin.tsx` — token + chunk loop

```diff
+      const { data: { session } } = await supabase.auth.getSession();
+      if (!session) throw new Error('登入狀態已失效，請重新登入後再試');
+
+      let offset = 0, wg = 0, ws = 0, eg = 0, es = 0, total = 0, guard = 0;
+      while (true) {
+        if (++guard > 1000) throw new Error('生成流程異常中止，請回報此問題');
         const res = await fetch('/api/generate-pack-audio', {
           method: 'POST',
-          headers: { 'Content-Type': 'application/json' },
-          body: JSON.stringify({ pack_id: packId }),
+          headers: { 'Content-Type': 'application/json',
+                     Authorization: `Bearer ${session.access_token}` },
+          body: JSON.stringify({ pack_id: packId, offset }),
         });
         …
+        if (res.status === 401) throw new Error('登入狀態已失效，請重新登入後再試');
+        if (res.status === 403) throw new Error('權限不足：只有管理員可以生成發音');
         if (!res.ok) throw new Error(data.error || '生成失敗');
+        wg += …; ws += …; eg += …; es += …; total = data.total ?? total;
+        if (!data.has_more || data.next_offset == null) break;
+        offset = data.next_offset;
+        toast({ title: '發音生成中…', description: `已處理 ${offset} / ${total} 個單字` });
+      }
```

`supabase` is already imported at line 3 — no new import. The `guard > 1000` counter is a
belt-and-braces stop in case a server bug ever returned a non-advancing cursor.

### 5.3 `supabase/functions/generate-pack-audio/index.ts`

Identical auth flow in Deno, plus the wildcard CORS origin replaced by an `ALLOWED_ORIGINS`
allow-list. If the variable is unset, **no** `Access-Control-Allow-Origin` header is emitted —
browsers are blocked by default rather than by accident.

Chunking is **deliberately not** added here, pending §7.

---

## 6. Rollback

No database objects change; rollback is purely code.

```bash
git apply -R docs/phase-0.5b/patches/A1-3-tts-ui.patch
git apply -R docs/phase-0.5b/patches/A1-3-tts-api.patch
git apply -R docs/phase-0.5b/patches/A1-3-tts-edge.patch
# or, once committed:  git revert <sha> && redeploy
# or Vercel Dashboard → Deployments → previous → Promote to Production  (fastest)
```

⚠️ **Rolling back reinstates finding §9.11** — the endpoint becomes unauthenticated again, and the
pre-existing large-pack timeout returns with it.

**Order matters.** The UI and API patches are coupled by the chunk protocol:

| State | Result |
|-------|--------|
| API patched, UI not | Admin UI gets **403** (no token). Audio generation broken. |
| UI patched, API not | UI sends `offset` and a token; the old API ignores both and processes the whole pack, returning no `has_more` → the loop exits after one pass. **Degrades to today's behaviour — safe.** |

So: **deploy UI first or simultaneously; roll back API first.** Both live in the same Vercel
deployment, so one deploy covers both — but the asymmetry matters if they are ever split.

`SUPABASE_ANON_KEY` and `TTS_MAX_ITEMS_PER_REQUEST` may be left set after a rollback; both are inert.

---

## 7. Edge Function status — **OBSOLETE-PENDING-CONFIRMATION**

Per your decision, it is **not deleted**. The patch marks it with a status header and applies the
same admin gate, so it cannot remain an unauthenticated `service_role` surface while the question is
open.

**Your check in the Supabase Dashboard, then:**

| Finding | Action |
|---------|--------|
| **Not deployed** | Mark obsolete; remove in a later cleanup. The patch becomes unnecessary — but harmless to carry. |
| **Deployed, no invocation traffic** | Apply the patch now, then schedule removal once you are confident. |
| **Deployed, with traffic** | Apply the patch now. Identify the caller before considering removal — a legitimate external caller would need the admin JWT flow. |

⚠️ **If it is deployed, it is currently an unauthenticated `service_role` endpoint reachable from any
origin** (`Access-Control-Allow-Origin: *`). In that case its patch is **as urgent as the Vercel
one**, not a follow-up. `verify_jwt` does not help: it proves only that *some* valid JWT was
presented, so any logged-in student would still pass.

---

## 8. Verification

### 8.1 Unauthorized — must all fail closed

```bash
BASE=https://<staging-host>

# U1 — no token  (today: 200 and burns quota; after: 401)
curl -s -o /dev/null -w "U1 no-token          -> %{http_code}\n" \
  -X POST "$BASE/api/generate-pack-audio" \
  -H 'Content-Type: application/json' -d '{"pack_id":"<PACK_ID>"}'          # EXPECT 401

# U2 — malformed token
curl -s -o /dev/null -w "U2 garbage-token     -> %{http_code}\n" \
  -X POST "$BASE/api/generate-pack-audio" -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer not-a-jwt' -d '{"pack_id":"<PACK_ID>"}'         # EXPECT 401

# U3 — anon key used as a bearer token
curl -s -o /dev/null -w "U3 anon-key-as-token -> %{http_code}\n" \
  -X POST "$BASE/api/generate-pack-audio" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" -d '{"pack_id":"<PACK_ID>"}' # EXPECT 401

# U4 — valid NON-ADMIN student token   ← the product-semantics test
curl -s -o /dev/null -w "U4 student-token     -> %{http_code}\n" \
  -X POST "$BASE/api/generate-pack-audio" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $STUDENT_JWT" -d '{"pack_id":"<PACK_ID>"}'      # EXPECT 403

# U5 — wrong method
curl -s -o /dev/null -w "U5 wrong-method      -> %{http_code}\n" \
  "$BASE/api/generate-pack-audio"                                           # EXPECT 405
```

**Then confirm no side effects — compare against the same query run before U1:**

```sql
SELECT count(*) FILTER (WHERE audio_url IS NOT NULL) AS with_audio, count(*) AS total
FROM public.pack_items WHERE pack_id = '<PACK_ID>';
```

Also check Google Cloud TTS metrics: the request count must not move.

### 8.2 Authorized — must all succeed

```bash
# A1 — admin, small pack, single chunk
curl -s -w "\nA1 admin -> %{http_code}\n" -X POST "$BASE/api/generate-pack-audio" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"pack_id":"<SMALL_PACK_ID>"}'
# EXPECT 200, has_more:false, next_offset:null

# A2 — force without confirmation
… -d '{"pack_id":"<SMALL_PACK_ID>","force":true}'
# EXPECT 400 FORCE_REQUIRES_CONFIRMATION

# A3 — force WITH confirmation
… -d '{"pack_id":"<SMALL_PACK_ID>","force":true,"confirm_force":true}'
# EXPECT 200, all items regenerated

# A4 — CHUNKING: a pack larger than TTS_MAX_ITEMS_PER_REQUEST
… -d '{"pack_id":"<LARGE_PACK_ID>","offset":0}'
# EXPECT 200, has_more:true, next_offset:<limit>, processed == limit
… -d '{"pack_id":"<LARGE_PACK_ID>","offset":<limit>}'
# EXPECT the cursor advances, and the FINAL call returns has_more:false

# A5 — a caller cannot raise the limit
… -d '{"pack_id":"<LARGE_PACK_ID>","offset":0,"limit":100000}'
# EXPECT processed <= TTS_MAX_ITEMS_PER_REQUEST   (server clamps)
```

**To exercise A4 without a large pack**, temporarily set `TTS_MAX_ITEMS_PER_REQUEST=2` on staging —
then even the 3-item fixture pack chunks.

### 8.3 UI smoke test (staging)

1. **Admin** → `/admin/packs/:packId/items` → 「生成發音」 → progress toasts (`已處理 N / M`) then a
   completion toast; `audio_url` populated; audio plays.
2. **Large pack** → completes in multiple chunks **without a 504** — the regression this fixes.
3. **Student** calls the endpoint directly → **403**, UI shows 「權限不足：只有管理員可以生成發音」.
4. **Expired session** → 「登入狀態已失效」 and **no request reaches the server**.
5. **Interrupt mid-chunk** (close the tab), then re-run → already-generated items are **skipped**,
   confirming partial progress survives.

### 8.4 Log verification

Vercel → Deployment → Functions → `generate-pack-audio`. Every chunk must emit:

```
[generate-pack-audio] admin=<uuid> pack=<pack_id> offset=<n> limit=<n> force=<bool>
```

A 200 with no such line means the gate was bypassed — **stop and investigate**.
