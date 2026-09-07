# A1-4 — Secure the daily-reminder cron endpoint

> 🛑 **PREPARED, NOT DEPLOYED.** `patches/A1-4-cron.patch` is **not applied**. `api/` is untouched.

Addresses audit finding **§9.12 (HIGH)**.

---

## 0a. Product purpose (confirmed by the owner)

> **This cron drives the daily flashcard-review reminder.** It pushes students who have vocabulary
> due back into the flashcard/SRS flow. It is **not** a feature students or teachers invoke by hand.
>
> **The only legitimate caller is the Vercel Cron scheduler.**

Two consequences for this design:

1. **`CRON_SECRET` + the Vercel-injected `Authorization` header IS the correct authorization model.**
   There is no user identity involved and none is needed — this is machine-to-machine.
2. **Verification cannot stop at HTTP 200.** A 200 only proves the guard let the scheduler through.
   It does not prove students with due words actually received a flashcard reminder. §7.2 therefore
   verifies the **reminder workflow**, not just the status code.

---

## 0. ⚠️ Correction to my earlier advice

In the Phase 0.5A audit I recommended the fix should *"fail closed and **reject GET**"*.

**The "reject GET" half was wrong.** **Vercel Cron invokes the endpoint with a `GET` request.**
Rejecting GET would have broken the daily reminder entirely. The patch below keeps GET.

The fail-closed half stands and is the actual fix.

---

## 1. Current scheduler / caller flow

```
vercel.json
  "crons": [ { "path": "/api/send-daily-reminders", "schedule": "0 12 * * *" } ]
        │
        │  Vercel's scheduler, daily at 12:00 UTC (20:00 Asia/Taipei)
        │  Method: GET
        │  Headers: Authorization: Bearer $CRON_SECRET   ← ONLY if CRON_SECRET is set
        ▼
api/send-daily-reminders.ts
  ├─ method must be GET or POST                    → else 405
  ├─ const cronSecret = process.env.CRON_SECRET
  ├─ if (cronSecret && authorization !== `Bearer ${cronSecret}`) → 401
  │        ▲
  │        └── ⚠️ THE DEFECT: when CRON_SECRET is unset the whole check is skipped
  ├─ createClient(URL, SERVICE_ROLE_KEY)           ← full RLS bypass
  ├─ read push_subscriptions ⋈ user_stats
  ├─ webpush.sendNotification() to every subscriber not yet studied today
  └─ DELETE stale push_subscriptions on 410/404
```

### 1.1 The defect, precisely

```ts
const cronSecret = process.env.CRON_SECRET;
if (cronSecret && req.headers['authorization'] !== `Bearer ${cronSecret}`) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

The guard is **conditional on the secret existing**. With `CRON_SECRET` unset, `cronSecret` is
`undefined`, the `&&` short-circuits, and **every request is accepted**. Combined with GET being
allowed, a plain browser visit to `https://<host>/api/send-daily-reminders` triggers a push
broadcast to every subscribed user.

✅ **RESOLVED — `CRON_SECRET` is now set in Vercel Production and the deployment has been
re-deployed** (owner, 2026-08-23). Because the existing guard is `if (cronSecret && …)`, setting the
variable **activated it**: unauthenticated callers now receive 401.

> **The §9.12 exposure is CLOSED in Production as of that redeploy** — before any code change.
> The patch below is now purely defense in depth against the variable being removed, rotated badly,
> or missing on a future environment.

**Do not change the secret again.** Rotating it now would only add risk for no gain.

### 1.2 Impact if unset

- Anyone can trigger a **push notification broadcast to every subscriber**, repeatedly.
- Notification spam → user churn, and push providers (FCM/APNs) may throttle or block the endpoint.
- The handler reads `push_subscriptions` and `user_stats` under `service_role`, bypassing RLS.
- It **deletes** subscription rows on a 410/404 response — so a hostile caller can also cause
  legitimate subscriptions to be pruned.

---

## 2. Where `CRON_SECRET` must be set — ✅ **DONE, do not repeat**

> **This section is now historical.** The owner has set `CRON_SECRET` in Vercel Production and
> redeployed. **Do not create, rotate or delete it as part of A1.** Retained for reference and for
> configuring the Preview environment.

**Vercel → Project → Settings → Environment Variables**

| Field | Value |
|-------|-------|
| Name | `CRON_SECRET` |
| Value | a high-entropy random string — e.g. `openssl rand -hex 32` |
| Environments | ✅ Production · ✅ Preview *(see below)* |
| Type | Secret / Sensitive |

**Generate it with:**

```bash
openssl rand -hex 32
```

**On Preview:** if you want to exercise the cron path on preview deployments, set it there too — a
**different** value from Production. If you only ever test Production, leave Preview unset; with
this patch the endpoint then returns `503` on preview rather than running unauthenticated.

**Do not** put it in `.env`, `vercel.json`, or any committed file. It is a bearer credential.

> ℹ️ **`.env.example` should document it.** The audit noted (§App. B) that `.env.example` lists only
> 2 of the ~11 variables actually used. Adding `CRON_SECRET=` there — name only, no value — is a
> worthwhile companion change, deliberately not bundled into this patch.

---

## 3. How the scheduler carries the secret

**Vercel does this automatically — no code or `vercel.json` change is required.**

When a `CRON_SECRET` environment variable exists on the project, Vercel's cron scheduler attaches it
to every scheduled invocation as:

```
Authorization: Bearer <CRON_SECRET>
```

So the flow becomes:

```
Vercel Cron (12:00 UTC)
  └─ GET /api/send-daily-reminders
       Authorization: Bearer <CRON_SECRET>     ← injected by Vercel
          └─ handler compares against process.env.CRON_SECRET  (constant-time)
```

### 3.1 🔑 The single most important consequence

> **Setting `CRON_SECRET` is itself the security fix.**

Look again at the current code: `if (cronSecret && …)`. The moment `CRON_SECRET` is set **the
existing guard becomes active** and unauthenticated callers get 401 — with no code change at all.

**So the exposure can be closed by an environment-variable change plus a redeploy, today.**

The code patch below is *defense in depth*: it ensures the endpoint can never silently revert to
open if the variable is later removed, rotated badly, or missing on a new environment. That is a
real risk — the current design fails **open** on misconfiguration, which is the wrong default — but
it is a second-order improvement over simply setting the variable.

⚠️ **Vercel environment variables take effect on the next deployment.** Setting the value alone does
not change a running function; a redeploy is required.

---

## 4. Deployment order — steps 1–3 ✅ already done

| # | Step | Status |
|---|------|--------|
| ~~1~~ | ~~Generate the secret~~ | ✅ **Done** |
| ~~2~~ | ~~Set `CRON_SECRET` in Vercel → Production~~ | ✅ **Done** |
| ~~3~~ | ~~Redeploy~~ | ✅ **Done — exposure closed here** |
| **4** | **Verify the next real Vercel Cron invocation succeeds** | 🛑 **REMAINING HARD GATE** |
| **4b** | **Verify the daily flashcard reminder workflow still functions** | 🛑 **REMAINING** |
| **4c** | **Verify a real device receives the reminder** (where applicable) | 🛑 **REMAINING** |
| 5 | Deploy the fail-closed patch | Only after 4 / 4b / 4c pass |
| 6 | Verify again — one more scheduled run, plus the unauthorized cases | — |

### 4.1 The remaining gate, precisely

Steps 4 / 4b / 4c are your three stated conditions, and they are **not** the same check:

| Gate | Question | Where |
|------|----------|-------|
| **4** | Did the scheduler authenticate? | Vercel → Cron Jobs → last run = `200` (§7.2 Step A) |
| **4b** | Did the flashcard reminder workflow actually run and target the right students? | §7.2 Steps B + C |
| **4c** | Did a real device receive it, and does tapping it open the flashcard flow? | §7.2 Step D |

> 🛑 **Do not deploy the fail-closed patch until all three pass.** A 200 alone proves only that the
> guard let the scheduler in. If the reminder workflow is broken for an unrelated reason, deploying
> a stricter guard on top makes diagnosis harder, not easier.

**Rollback trigger after step 5:** a scheduled run returns 401 or 503.

## 5. Code diff

`patches/A1-4-cron.patch` — dry-run verified (`git apply --check` passes).

```diff
 import { createClient } from '@supabase/supabase-js';
 import webpush from 'web-push';
+import { timingSafeEqual } from 'node:crypto';

+/**
+ * A1-4: constant-time comparison so the secret cannot be recovered by
+ * timing the response.
+ */
+function secretMatches(provided: string, expected: string): boolean {
+  const a = Buffer.from(provided);
+  const b = Buffer.from(expected);
+  if (a.length !== b.length) return false;
+  return timingSafeEqual(a, b);
+}
+
 export default async function handler(req: any, res: any) {
-  // Only allow GET (Vercel Cron) or POST
+  // Vercel Cron invokes this path with GET, so GET must stay allowed.
   if (req.method !== 'GET' && req.method !== 'POST') {
     return res.status(405).json({ error: 'Method not allowed' });
   }

-  // Verify cron secret in production
-  const cronSecret = process.env.CRON_SECRET;
-  if (cronSecret && req.headers['authorization'] !== `Bearer ${cronSecret}`) {
-    return res.status(401).json({ error: 'Unauthorized' });
-  }
+  const cronSecret = process.env.CRON_SECRET;
+  if (!cronSecret) {
+    console.error('[send-daily-reminders] CRON_SECRET is not configured; refusing to run.');
+    return res.status(503).json({ error: 'CRON_SECRET_NOT_CONFIGURED' });
+  }
+
+  const authHeader: string = req.headers?.authorization || req.headers?.Authorization || '';
+  const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
+
+  if (!providedSecret || !secretMatches(providedSecret, cronSecret)) {
+    return res.status(401).json({ error: 'Unauthorized' });
+  }
```

**Three changes, each deliberate:**

1. **Missing secret → `503`, not "proceed".** Fails closed. `503` (not `401`) because it is a
   *server misconfiguration*, not a caller problem — and it is greppable in logs.
2. **Constant-time comparison.** The original `!==` on strings leaks length and prefix information
   through timing. `timingSafeEqual` closes that. The length pre-check is required because
   `timingSafeEqual` throws on mismatched lengths.
3. **Tolerant header parsing** — `req.headers.authorization` casing, and `Bearer ` prefix stripped
   before comparison, so the comparison is against the secret itself.

**Unchanged:** GET stays allowed (§0), POST stays allowed for manual triggering, and every line of
the notification logic below the guard is untouched.

---

## 6. Rollback

Code-only; no database or configuration objects change.

```bash
git apply -R docs/phase-0.5b/patches/A1-4-cron.patch     # working tree
# or
git revert <commit-sha> && redeploy
# or Vercel Dashboard → Deployments → previous → "Promote to Production"  (fastest)
```

⚠️ **Rolling back reinstates finding §9.12** — but only if `CRON_SECRET` is *also* unset. If you keep
the variable set, the old code's guard stays active and you remain protected. **So the safe rollback
is: revert the code, keep the secret.**

**Do NOT roll back by deleting `CRON_SECRET`.** That would restore the fully-open behaviour, which is
the opposite of what a rollback should achieve.

---

## 7. Verification

### 7.1 Manual verification (any time)

```bash
BASE=https://<staging-or-prod-host>
SECRET='<the CRON_SECRET value>'

# M1 — no Authorization header  (today, if the secret is unset: 200 + BROADCAST)
curl -s -o /dev/null -w "M1 no-auth        -> %{http_code}\n" "$BASE/api/send-daily-reminders"
# EXPECT 401   (503 if CRON_SECRET is not configured on that environment)

# M2 — wrong secret
curl -s -o /dev/null -w "M2 wrong-secret   -> %{http_code}\n" \
  -H 'Authorization: Bearer wrong-value' "$BASE/api/send-daily-reminders"
# EXPECT 401

# M3 — secret without the Bearer prefix
curl -s -o /dev/null -w "M3 raw-secret     -> %{http_code}\n" \
  -H "Authorization: $SECRET" "$BASE/api/send-daily-reminders"
# EXPECT 401

# M4 — correct secret  ⚠️ THIS SENDS REAL PUSH NOTIFICATIONS
curl -s -w "\nM4 correct-secret -> %{http_code}\n" \
  -H "Authorization: Bearer $SECRET" "$BASE/api/send-daily-reminders"
# EXPECT 200 {"sent":N,"failed":0,"cleaned":0,"total":N}

# M5 — wrong method
curl -s -o /dev/null -w "M5 wrong-method   -> %{http_code}\n" \
  -X DELETE -H "Authorization: Bearer $SECRET" "$BASE/api/send-daily-reminders"
# EXPECT 405
```

> ⚠️ **M4 sends real notifications to real devices.** Run it on staging with a synthetic
> subscription, or on Production only when you accept that subscribers receive an extra reminder.
> M1–M3 and M5 are safe everywhere — they are rejected before any push is sent.

**Confirm M1–M3 caused no sends:** the response body should be an error, not a `sent` count, and the
Vercel function log should show no `webpush` activity.

### 7.2 Scheduled verification — the flashcard reminder workflow

Manual curl proves the guard works. **It does not prove the scheduler can still get in, and it does
not prove a student actually got a flashcard reminder.** Both matter, and the second is the one that
silently breaks the product.

**Run this after step 3 and again after step 5.**

#### Step A — the scheduler got in

**Vercel → Project → Cron Jobs** — check the last run's status and timestamp.

| Result | Meaning |
|--------|---------|
| ✅ `200` at ~12:00 UTC | The scheduler is authenticating correctly |
| ❌ `401` | Vercel is not attaching the header → **roll back immediately** (§6) |
| ❌ `503` | `CRON_SECRET` not set on that environment |

#### Step B — the run had something to send

A 200 with `sent: 0` is **not** a pass. It may mean the guard worked and there was genuinely nobody
to remind — or it may mean the targeting query is broken. Distinguish them:

```sql
-- B1. Are there any push subscriptions at all?
SELECT count(*) AS live_subscriptions FROM public.push_subscriptions;
-- If 0, the cron cannot demonstrate anything. Subscribe a test device first.

-- B2. Who SHOULD have been reminded today?
--     The handler targets subscribers whose last_study_date is not today.
SELECT
  count(*)                                                    AS subscribers,
  count(*) FILTER (WHERE us.last_study_date = CURRENT_DATE)   AS studied_today_should_be_skipped,
  count(*) FILTER (WHERE us.last_study_date IS DISTINCT FROM CURRENT_DATE)
                                                              AS should_have_been_reminded
FROM public.push_subscriptions ps
LEFT JOIN public.user_stats us ON us.user_id = ps.user_id;
```

**`should_have_been_reminded` must match the `sent` count** in the response (allowing for `failed`
and `cleaned`). A mismatch means the targeting logic is not doing what the product intends.

#### Step C — the reminder is actually about flashcards

The whole point is bringing students back to review due words. Confirm the population is real:

```sql
-- C1. Students who genuinely have vocabulary due right now.
--     user_word_progress.next_review_time is Unix MILLISECONDS (BIGINT).
SELECT
  count(DISTINCT uwp.user_id) AS students_with_words_due,
  count(*)                    AS words_due_total
FROM public.user_word_progress uwp
WHERE uwp.review_count > 0
  AND uwp.next_review_time <= (extract(epoch FROM now()) * 1000)::bigint;

-- C2. …and of those, how many can actually be reached by push?
SELECT count(DISTINCT uwp.user_id) AS reachable_students_with_words_due
FROM public.user_word_progress uwp
JOIN public.push_subscriptions ps ON ps.user_id = uwp.user_id
WHERE uwp.review_count > 0
  AND uwp.next_review_time <= (extract(epoch FROM now()) * 1000)::bigint;
```

> ### 📌 DEFERRED PRODUCT IMPROVEMENT — not an A1 item
>
> **Observation:** the handler targets purely on `user_stats.last_study_date != today`. It **never
> consults `user_word_progress`**, so it cannot tell whether a student actually has vocabulary due.
>
> **Effect:** a student who is fully caught up — nothing due — still receives a
> 「回來複習」 nudge. Conversely the copy in `getNotificationContent()` talks about streaks and
> days-away, never about *how many words are waiting*, which is the thing most likely to bring a
> student back.
>
> **Status (owner-confirmed):** documented as a **later product / analytics improvement**.
> **Explicitly NOT fixed in A1** — A1 changes only the authorization guard, and altering the
> targeting query would change who receives notifications, which is a product decision needing its
> own verification.
>
> **Natural home:** the flashcard/vocabulary analytics work, where `user_word_progress` due-counts
> become first-class. A plausible shape is targeting on *"has words due"* rather than
> *"hasn't studied today"*, and including the due count in the message.

#### Step D — end-to-end delivery

**Confirm a notification actually arrived on a real device** with a live subscription, and that
tapping it opens the flashcard flow. The handler sends `url: '/practice/vocabulary'`.

No HTTP status can give you this. It is the only check that proves the product works.

#### Step E — content sanity

`getNotificationContent()` varies the copy by streak and days-since-study. Confirm the received
message is coherent for that student's state — e.g. a 3-day streak should not read
「歡迎回來！」(the ≥14-days-away message).

```sql
-- The streak/recency inputs that decide the message text.
SELECT us.streak_days,
       us.last_study_date,
       (CURRENT_DATE - us.last_study_date) AS days_since_study
FROM public.user_stats us
JOIN public.push_subscriptions ps ON ps.user_id = us.user_id
ORDER BY us.last_study_date DESC NULLS LAST
LIMIT 10;
```

### 7.3 Pre-deployment check — ✅ **no longer applicable**

This section previously told you to probe Production with an unauthenticated `GET` to find out
whether `CRON_SECRET` was set — and warned that a 200 would mean the probe itself had triggered a
real broadcast.

**That question is answered: the secret is set and the deployment is live.** An unauthenticated `GET`
should now return **401**, which is a safe check and a reasonable one-off confirmation:

```bash
curl -s -o /dev/null -w "unauth GET -> %{http_code}\n" "$BASE/api/send-daily-reminders"
# EXPECT 401   (a 200 here would mean the redeploy did not pick up the variable)
```

If this returns 200, the variable did not take effect — **re-check the Vercel environment scope
(Production vs Preview) and redeploy** before doing anything else.
