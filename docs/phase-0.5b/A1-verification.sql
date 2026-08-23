-- =====================================================================
--  VERIFICATION for A1-premium-functions.sql
--  Run on STAGING first. Sections A and B are safe on Production.
-- =====================================================================
--
--  Section A — read-only structural checks   (safe on Production)
--  Section B — read-only data invariants     (safe on Production)
--  Section C — behavioural tests             (STAGING ONLY: writes data)
--
--  ⚠️ Section C creates and mutates membership rows. Never run it on
--     Production. It is wrapped in a transaction that ROLLS BACK, but
--     do not rely on that as your only safeguard.
-- =====================================================================


-- =====================================================================
--  SECTION A — structural checks (READ-ONLY, Production-safe)
-- =====================================================================

-- ===== [V01] Both functions carry a pinned search_path and are DEFINER =====
-- PASS: proconfig = {search_path=""} for both.
-- (If you stripped the search_path lines for strict A1/A2 separation,
--  expect '(no search_path)' here and verify it in A2 instead.)
SELECT
  'V01' AS check_id,
  p.proname                                   AS function_name,
  pg_get_function_identity_arguments(p.oid)   AS arguments,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security_mode,
  COALESCE(p.proconfig::text, '(no search_path)') AS proconfig,
  (pg_get_functiondef(p.oid) ILIKE '%is_admin%') AS has_admin_check
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('admin_grant_premium','admin_revoke_premium')
ORDER BY p.proname;
-- PASS criteria: has_admin_check = true for BOTH rows.


-- ===== [V02] EXECUTE is no longer granted to PUBLIC or anon =====
-- PASS: neither "=X/" (PUBLIC) nor "anon=X/" appears in execute_acl.
SELECT
  'V02' AS check_id,
  p.proname                                   AS function_name,
  p.proacl::text                              AS execute_acl,
  (p.proacl::text LIKE '%=X/%'
     AND p.proacl::text NOT LIKE '%postgres=X/%postgres=X/%') AS public_grant_present_raw,
  (p.proacl::text LIKE '%anon=X/%')           AS anon_grant_present,
  (p.proacl::text LIKE '%authenticated=X/%')  AS authenticated_grant_present
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('admin_grant_premium','admin_revoke_premium')
ORDER BY p.proname;
-- PASS criteria: anon_grant_present = false, authenticated_grant_present = true.
-- Read execute_acl by eye as well: a bare "=X/postgres" entry means
-- PUBLIC still holds EXECUTE and the REVOKE did not take.


-- ===== [V03] Explicit privilege probe for anon and authenticated =====
SELECT
  'V03' AS check_id,
  'admin_grant_premium' AS function_name,
  has_function_privilege('anon',
    'public.admin_grant_premium(uuid, timestamp with time zone, text)', 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated',
    'public.admin_grant_premium(uuid, timestamp with time zone, text)', 'EXECUTE') AS authenticated_can_execute
UNION ALL
SELECT
  'V03',
  'admin_revoke_premium',
  has_function_privilege('anon',          'public.admin_revoke_premium(uuid)', 'EXECUTE'),
  has_function_privilege('authenticated', 'public.admin_revoke_premium(uuid)', 'EXECUTE');
-- PASS criteria: anon_can_execute = false, authenticated_can_execute = true, both rows.


-- =====================================================================
--  SECTION B — data invariants (READ-ONLY, Production-safe)
-- =====================================================================

-- ===== [V04] How many users hold more than one active membership? =====
-- Before the data remediation: expect exactly 1 row
--   (36258aeb-f26d-406e-a8ed-25595a736614, active_count = 2).
-- After the data remediation: expect 0 rows.
-- At any point AFTER A1 is deployed, this number must never increase.
SELECT
  'V04' AS check_id,
  user_id,
  count(*) AS active_membership_count,
  min(granted_at) AS earliest,
  max(granted_at) AS latest
FROM public.premium_memberships
WHERE is_active = true
  AND (expires_at IS NULL OR expires_at > now())
GROUP BY user_id
HAVING count(*) > 1
ORDER BY active_membership_count DESC;


-- ===== [V05] Cross-check: does any user's effective status disagree =====
-- Compares is_premium_member() against the raw row state. Any row where
-- they disagree is a bug in the predicate or the data.
SELECT
  'V05' AS check_id,
  pm.user_id,
  count(*) FILTER (WHERE pm.is_active) AS active_rows,
  count(*) FILTER (WHERE pm.is_active AND (pm.expires_at IS NULL OR pm.expires_at > now())) AS effective_rows,
  public.is_premium_member(pm.user_id) AS is_premium_member_says
FROM public.premium_memberships pm
GROUP BY pm.user_id
ORDER BY pm.user_id;
-- PASS criteria: is_premium_member_says = true exactly when effective_rows > 0.


-- ===== [V06] Re-run the A0 audit (R14) as a regression check =====
SELECT
  'V06' AS check_id,
  id, user_id, granted_by, is_active, granted_at, expires_at, notes,
  (granted_by IS NULL)   AS granted_anonymously_or_unattributed,
  (granted_by = user_id) AS self_granted
FROM public.premium_memberships
ORDER BY granted_at DESC;
-- PASS criteria: no NEW rows with granted_by IS NULL. The 5 pre-existing
-- rows are known-good (confirmed as the owner's own admin account).


-- =====================================================================
--  SECTION C — behavioural tests   ⚠️ STAGING ONLY — WRITES DATA
-- =====================================================================
--
--  These prove the two guarantees that matter:
--    (1) granting twice never produces two active rows
--    (2) revoking always leaves is_premium_member() false
--
--  Wrapped in an explicit ROLLBACK. Do not run on Production.
--
--  NOTE: is_admin() is a hard-coded email comparison, so on staging you
--  must run these as that account, or temporarily point is_admin() at a
--  staging identity. If is_admin() returns false, every call below
--  returns {"success": false, "error": "UNAUTHORIZED"} — which is itself
--  a valid negative test (see T0).
--
/*
BEGIN;

-- Use a throwaway user id that exists in auth.users on staging.
-- Replace the literal below before running.
\set test_user '00000000-0000-0000-0000-0000000000ff'

-- T0 — negative test: a non-admin session must be refused.
--      Run this one while authenticated as a NON-admin user.
--      EXPECT: {"success": false, "error": "UNAUTHORIZED"}
SELECT 'T0' AS test, public.admin_grant_premium(:'test_user'::uuid, NULL, 'should be refused');

-- The remaining tests assume an admin session.

-- T1 — first grant creates exactly one row.  EXPECT action='granted'
SELECT 'T1' AS test, public.admin_grant_premium(:'test_user'::uuid, now() + interval '3 months', 'T1');
SELECT 'T1-check' AS test, count(*) AS active_rows
FROM public.premium_memberships
WHERE user_id = :'test_user'::uuid AND is_active;
-- EXPECT active_rows = 1

-- T2 — idempotency: same-or-shorter grant must NOT insert a second row.
--      EXPECT action='already_active'
SELECT 'T2' AS test, public.admin_grant_premium(:'test_user'::uuid, now() + interval '1 month', 'T2');
SELECT 'T2-check' AS test, count(*) AS active_rows
FROM public.premium_memberships
WHERE user_id = :'test_user'::uuid AND is_active;
-- EXPECT active_rows = 1   ← this is the regression that finding 9.15 was

-- T3 — extension: a longer grant updates in place, still one row.
--      EXPECT action='extended'
SELECT 'T3' AS test, public.admin_grant_premium(:'test_user'::uuid, now() + interval '1 year', 'T3');
SELECT 'T3-check' AS test, count(*) AS active_rows, max(expires_at) AS expires_at
FROM public.premium_memberships
WHERE user_id = :'test_user'::uuid AND is_active;
-- EXPECT active_rows = 1 AND expires_at ≈ now() + 1 year

-- T4 — permanent grant also extends in place.  EXPECT action='extended'
SELECT 'T4' AS test, public.admin_grant_premium(:'test_user'::uuid, NULL, 'T4');
SELECT 'T4-check' AS test, count(*) AS active_rows, bool_and(expires_at IS NULL) AS all_permanent
FROM public.premium_memberships
WHERE user_id = :'test_user'::uuid AND is_active;
-- EXPECT active_rows = 1 AND all_permanent = true

-- T5 — THE CRITICAL TEST. Simulate the finding-9.15 state by forcing a
--      second active row in directly, then revoke through the RPC.
INSERT INTO public.premium_memberships (user_id, expires_at, granted_by, notes)
VALUES (:'test_user'::uuid, NULL, NULL, 'T5 forced duplicate');

SELECT 'T5-pre' AS test, count(*) AS active_rows,
       public.is_premium_member(:'test_user'::uuid) AS is_premium
FROM public.premium_memberships
WHERE user_id = :'test_user'::uuid AND is_active;
-- EXPECT active_rows = 2, is_premium = true

-- Revoke using the id of only ONE of them — exactly what the admin UI does.
SELECT 'T5-revoke' AS test, public.admin_revoke_premium(
  (SELECT id FROM public.premium_memberships
    WHERE user_id = :'test_user'::uuid AND is_active
    ORDER BY granted_at DESC LIMIT 1)
);
-- EXPECT revoked_count = 2

SELECT 'T5-post' AS test, count(*) AS active_rows,
       public.is_premium_member(:'test_user'::uuid) AS is_premium
FROM public.premium_memberships
WHERE user_id = :'test_user'::uuid AND is_active;
-- EXPECT active_rows = 0 AND is_premium = false
-- ← Under the OLD function this returned active_rows = 1, is_premium = true.

-- T6 — revoke is idempotent: revoking again still succeeds.
SELECT 'T6' AS test, public.admin_revoke_premium(
  (SELECT id FROM public.premium_memberships
    WHERE user_id = :'test_user'::uuid ORDER BY granted_at DESC LIMIT 1)
);
-- EXPECT success = true, revoked_count = 0

-- T7 — unknown membership id is now reported rather than silently OK.
SELECT 'T7' AS test, public.admin_revoke_premium('00000000-0000-0000-0000-000000000000'::uuid);
-- EXPECT {"success": false, "error": "MEMBERSHIP_NOT_FOUND"}

ROLLBACK;
*/

-- =====================================================================
--  SECTION D — application smoke test (staging, manual)
-- =====================================================================
--  In /admin/users, signed in as the admin account:
--    1. Grant Premium to a test user (1 year)     -> badge appears
--    2. Grant again (3 months)                    -> still ONE row (V04)
--    3. Grant again (forever)                     -> badge persists,
--                                                    expiry now null
--    4. Click 收回 Premium                         -> badge clears AND
--                                                    stays cleared after
--                                                    a page refresh
--  Step 4's "stays cleared after refresh" is the user-visible symptom of
--  finding 9.15 and the thing this change exists to fix.
--
--  No UI code change is required for any of this — see README.md §3.
-- =====================================================================
