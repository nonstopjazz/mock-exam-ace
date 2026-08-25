-- =====================================================================
--  gsat-staging — S1 + S2-5 VERIFICATION  (run AFTER A1-premium-functions.sql)
--
--  🛑 STAGING ONLY. Section 3 writes data, then ROLLS BACK.
--
--  Covers, from STAGING_PLAN.md section 6:
--    S1-1  V01 V02 V03 V07   structural
--    S2-5  T8                NULL identity, grant layer bypassed
--    S1-2  T1..T4b           idempotent grant, exactly 1 active row
--    S1-3  T5                revoked_count = 2, is_premium_member false
--    S1-4  T7                MEMBERSHIP_NOT_FOUND
--
--  S2-1 / S2-2 / S2-3 are NOT here: they must run through PostgREST from
--  a browser, because the grant layer is exactly what they test. The SQL
--  Editor connects as a superuser and would bypass it.
--
--  No UUID substitution: the admin is resolved by email.
-- =====================================================================


-- #####################################################################
--  SECTION 1 — STRUCTURAL (read-only)
-- #####################################################################

-- V01 + V07: DEFINER, pinned search_path, admin check present, and the
--            gate written as IS NOT TRUE rather than a bare NOT.
SELECT
  'V01/V07' AS check_id,
  p.proname AS function_name,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security_mode,
  COALESCE(p.proconfig::text, '(no search_path)')          AS proconfig,
  (pg_get_functiondef(p.oid) ILIKE '%is_admin%')           AS has_admin_check,
  (pg_get_functiondef(p.oid) ILIKE '%is_admin() IS NOT TRUE%') AS uses_is_not_true,
  (pg_get_functiondef(p.oid) ILIKE '%IF NOT public.is_admin()%') AS uses_bare_not
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('admin_grant_premium','admin_revoke_premium')
ORDER BY p.proname;
-- PASS: DEFINER · proconfig = {"search_path=\"\""} · has_admin_check t
--       uses_is_not_true t · uses_bare_not f      -- for BOTH rows


-- V02 + V03: EXECUTE revoked from PUBLIC and anon, kept for authenticated.
SELECT
  'V02/V03' AS check_id,
  p.proname AS function_name,
  p.proacl::text                     AS execute_acl,
  (p.proacl::text LIKE '%anon=X/%')  AS anon_grant_present,
  has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('admin_grant_premium','admin_revoke_premium')
ORDER BY p.proname;
-- PASS: anon_grant_present f · anon_can_execute f · authenticated_can_execute t
--       and execute_acl must NOT contain a bare "=X/" (that is PUBLIC).


-- #####################################################################
--  SECTION 2 — S2-5 / T8 : NULL IDENTITY, GRANT LAYER BYPASSED
-- #####################################################################
--  The SQL Editor connects as a superuser, so the REVOKE does not apply
--  and the call reaches the function body with NO identity attached.
--  That is precisely the condition being tested: the APPLICATION-layer
--  gate on its own.
--
--  An earlier A1 draft using a bare NOT returned
--      {"success": true, "action": "extended", ...}
--  here, because is_admin() returns NULL when auth.uid() is NULL and
--  PL/pgSQL treats a NULL IF condition as false.
-- #####################################################################

SELECT 'T8-pre' AS test,
       auth.uid()        AS uid_must_be_null,
       public.is_admin() AS is_admin_expect_null;
-- PASS: both NULL. If uid is NOT null, this test proves nothing.

SELECT 'T8-grant' AS test,
       public.admin_grant_premium(
         (SELECT id FROM auth.users WHERE email = 'staging-user-a@example.test'),
         NULL, 'T8 null-identity probe') AS result;
-- PASS: {"success": false, "error": "UNAUTHORIZED"}
-- FAIL: anything containing "success" : true

SELECT 'T8-revoke' AS test,
       public.admin_revoke_premium(gen_random_uuid()) AS result;
-- PASS: UNAUTHORIZED  -- NOT MEMBERSHIP_NOT_FOUND. The gate must be
--       reached BEFORE the membership lookup.

SELECT 'T8-check' AS test, count(*) AS rows_written
FROM public.premium_memberships WHERE notes = 'T8 null-identity probe';
-- PASS: 0


-- #####################################################################
--  SECTION 3 — S1 BEHAVIOURAL   ⚠️ WRITES, THEN ROLLS BACK
-- #####################################################################
--  Impersonates the staging admin by setting the JWT claim the Supabase
--  auth.uid() reads. Both claim shapes are set so this works regardless
--  of which auth.uid() implementation the project ships.
--
--  Everything is inside one transaction ending in ROLLBACK, so the
--  fixture state (USER_B holding 2 active rows) survives intact for any
--  re-run.
-- #####################################################################

BEGIN;

SELECT set_config('request.jwt.claim.sub',
       (SELECT id::text FROM auth.users WHERE email = 'staging-admin@example.test'), true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub',
         (SELECT id::text FROM auth.users WHERE email = 'staging-admin@example.test'),
         'role','authenticated')::text, true);

SELECT 'S1-pre' AS test, auth.uid() AS acting_as, public.is_admin() AS is_admin_expect_true;
-- PASS: acting_as = the admin uuid, is_admin_expect_true = t
-- If this shows NULL/false, STOP: every test below would return
-- UNAUTHORIZED for the wrong reason.

-- ---- T1: first grant on USER_A -> 'granted', exactly 1 active row ----
SELECT 'T1' AS test, public.admin_grant_premium(
  (SELECT id FROM auth.users WHERE email = 'staging-user-a@example.test'),
  now() + interval '3 months', 'T1') AS result;

SELECT 'T1-check' AS test, count(*) AS active_rows FROM public.premium_memberships m
JOIN auth.users u ON u.id = m.user_id
WHERE u.email = 'staging-user-a@example.test' AND m.is_active;
-- PASS: action 'granted' · active_rows 1

-- ---- T2: shorter grant -> 'already_active', still 1 row -------------
SELECT 'T2' AS test, public.admin_grant_premium(
  (SELECT id FROM auth.users WHERE email = 'staging-user-a@example.test'),
  now() + interval '1 month', 'T2') AS result;

SELECT 'T2-check' AS test, count(*) AS active_rows FROM public.premium_memberships m
JOIN auth.users u ON u.id = m.user_id
WHERE u.email = 'staging-user-a@example.test' AND m.is_active;
-- PASS: action 'already_active' · active_rows 1
--       <- this is the regression finding 9.15 was

-- ---- T3: longer grant -> 'extended', still 1 row --------------------
SELECT 'T3' AS test, public.admin_grant_premium(
  (SELECT id FROM auth.users WHERE email = 'staging-user-a@example.test'),
  now() + interval '1 year', 'T3') AS result;

SELECT 'T3-check' AS test, count(*) AS active_rows, max(m.expires_at) AS expires_at
FROM public.premium_memberships m JOIN auth.users u ON u.id = m.user_id
WHERE u.email = 'staging-user-a@example.test' AND m.is_active;
-- PASS: action 'extended' · active_rows 1 · expires_at about 1 year out

-- ---- T4: permanent grant -> 'extended', all_permanent --------------
SELECT 'T4' AS test, public.admin_grant_premium(
  (SELECT id FROM auth.users WHERE email = 'staging-user-a@example.test'),
  NULL, 'T4') AS result;

SELECT 'T4-check' AS test, count(*) AS active_rows,
       bool_and(m.expires_at IS NULL) AS all_permanent
FROM public.premium_memberships m JOIN auth.users u ON u.id = m.user_id
WHERE u.email = 'staging-user-a@example.test' AND m.is_active;
-- PASS: action 'extended' · active_rows 1 · all_permanent t

-- ---- T4b: 3-month over permanent -> 'already_active', never shortens
SELECT 'T4b' AS test, public.admin_grant_premium(
  (SELECT id FROM auth.users WHERE email = 'staging-user-a@example.test'),
  now() + interval '3 months', 'T4b') AS result;

SELECT 'T4b-check' AS test, count(*) AS active_rows,
       bool_and(m.expires_at IS NULL) AS still_permanent
FROM public.premium_memberships m JOIN auth.users u ON u.id = m.user_id
WHERE u.email = 'staging-user-a@example.test' AND m.is_active;
-- PASS: action 'already_active' · active_rows 1 · still_permanent t

-- ---- T5: THE CRITICAL TEST -- USER_B holds 2 active rows -----------
SELECT 'T5-pre' AS test, count(*) AS active_rows_before
FROM public.premium_memberships m JOIN auth.users u ON u.id = m.user_id
WHERE u.email = 'staging-user-b@example.test' AND m.is_active;
-- PASS: 2   <- if this is not 2, re-run the fixtures restore first

SELECT 'T5' AS test, public.admin_revoke_premium((
  SELECT m.id FROM public.premium_memberships m
  JOIN auth.users u ON u.id = m.user_id
  WHERE u.email = 'staging-user-b@example.test' AND m.is_active
  ORDER BY m.granted_at LIMIT 1)) AS result;
-- PASS: {"success": true, ..., "revoked_count": 2}
--       Baseline returned {"success": true} and left the user premium.

SELECT 'T5-check' AS test,
       count(*) FILTER (WHERE m.is_active) AS active_rows,
       public.is_premium_member(u.id)      AS still_premium
FROM public.premium_memberships m JOIN auth.users u ON u.id = m.user_id
WHERE u.email = 'staging-user-b@example.test'
GROUP BY u.id;
-- PASS: active_rows 0 · still_premium f   <- finding 9.15 FIXED

-- ---- T7: unknown membership id -> MEMBERSHIP_NOT_FOUND -------------
SELECT 'T7' AS test, public.admin_revoke_premium(gen_random_uuid()) AS result;
-- PASS: {"success": false, "error": "MEMBERSHIP_NOT_FOUND"}
--       Reaching this error (rather than UNAUTHORIZED) confirms the
--       admin gate passed for a real admin.

ROLLBACK;


-- #####################################################################
--  POST-ROLLBACK — fixture state must be untouched
-- #####################################################################
SELECT 'fixtures intact' AS check,
       count(*) FILTER (WHERE m.is_active)::text || ' active rows for USER_B' AS value,
       CASE WHEN count(*) FILTER (WHERE m.is_active) = 2 THEN 'PASS' ELSE 'FAIL' END AS status
FROM public.premium_memberships m JOIN auth.users u ON u.id = m.user_id
WHERE u.email = 'staging-user-b@example.test';
