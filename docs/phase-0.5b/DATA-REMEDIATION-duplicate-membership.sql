-- =====================================================================
--  DATA REMEDIATION — SEPARATE, APPROVAL-GATED, NOT PART OF A1
--  Clean up the one pre-existing duplicate active premium membership
-- =====================================================================
--
--  ✅ APPROVED 2026-08-23 — but as a SEPARATE deployment, explicitly NOT
--     bundled with the A1 migration.
--
--     Required order (owner's instruction):
--       1. Deploy the A1 premium function fix
--       2. Verify grant / extend / revoke / unauthorized behaviour
--       3. Confirm Production is healthy
--       4. THEN run this targeted cleanup on its own
--       5. Verify is_premium_member() and the active row count
--
--     No data is deleted. is_active is a soft flag, so the row and all
--     its metadata survive and the rollback is a single UPDATE.
--
--  This is the ONLY artefact in Phase 0.5B-A1 that changes production
--  DATA. It is deliberately kept out of A1-premium-functions.sql so that
--  the code change can ship without touching a single row.
--
--  It is NOT required for the A1 fix to work. After A1 deploys:
--    - no NEW duplicates can be created, and
--    - a single revoke already clears BOTH of this user's rows.
--  This script only tidies the existing state so the invariant "at most
--  one active membership per user" holds cleanly going forward, which is
--  a prerequisite if you later want to enforce it with a unique index.
--
--  Run A1-premium-functions.sql FIRST. Running this beforehand would
--  leave the door open for a new duplicate to appear immediately.
-- =====================================================================


-- ---------------------------------------------------------------------
--  THE AFFECTED DATA
-- ---------------------------------------------------------------------
--  User: 36258aeb-f26d-406e-a8ed-25595a736614
--
--  Two active memberships, both permanent (expires_at IS NULL), granted
--  11 seconds apart by 0aea72e3-… (confirmed as the owner's admin
--  account). Almost certainly a double-click in the admin UI.
--
--    id                                    granted_at                notes
--    ------------------------------------  ------------------------  -----
--    93fa86e3-f962-42e4-b5a2-6f290069e39c  2026-04-29 02:41:46+00    NULL   ← older, to be deactivated
--    7c3dbb79-06f9-437c-8288-b9306e7a46e3  2026-04-29 02:41:57+00    NULL   ← newer, KEPT
--
--  Because both are permanent with no expiry, they confer IDENTICAL
--  access. Deactivating the older one therefore changes this user's
--  effective entitlement by exactly nothing: is_premium_member() returns
--  true before and true after. This is a bookkeeping correction, not an
--  entitlement change.
--
--  Keeping the NEWER row is the conventional choice (it reflects the
--  administrator's most recent intent and carries the later granted_at).
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
--  STEP 1 — PRE-FLIGHT (read-only). Run this and read it before Step 2.
-- ---------------------------------------------------------------------
--  Confirms the state still matches what was audited on 2026-08-23. If
--  it does not, STOP and re-audit — do not proceed on stale assumptions.

SELECT
  'PRE' AS stage,
  id,
  user_id,
  granted_at,
  expires_at,
  is_active,
  granted_by,
  notes
FROM public.premium_memberships
WHERE user_id = '36258aeb-f26d-406e-a8ed-25595a736614'
ORDER BY granted_at;
-- EXPECT exactly 2 rows, both is_active = true, both expires_at NULL,
-- with the two ids listed above.

SELECT
  'PRE-scan' AS stage,
  user_id,
  count(*) AS active_membership_count
FROM public.premium_memberships
WHERE is_active = true
  AND (expires_at IS NULL OR expires_at > now())
GROUP BY user_id
HAVING count(*) > 1;
-- EXPECT exactly 1 row (36258aeb…, count 2). If MORE users appear,
-- widen this script deliberately rather than running it as-is.

SELECT
  'PRE-entitlement' AS stage,
  public.is_premium_member('36258aeb-f26d-406e-a8ed-25595a736614') AS is_premium_before;
-- EXPECT true. It must still be true afterwards.


-- ---------------------------------------------------------------------
--  STEP 2 — THE CORRECTION.  🛑 Requires approval.
-- ---------------------------------------------------------------------
--  Targets ONE row by primary key. Deliberately not written as a
--  generic "deactivate all but the newest per user" statement: a
--  targeted single-id UPDATE cannot over-reach if the data has drifted
--  since the audit.

/*
BEGIN;

UPDATE public.premium_memberships
SET is_active = false
WHERE id = '93fa86e3-f962-42e4-b5a2-6f290069e39c'
  AND user_id = '36258aeb-f26d-406e-a8ed-25595a736614'   -- belt and braces
  AND is_active = true;

-- Expect: UPDATE 1
-- If it reports UPDATE 0, the row was already inactive — safe, but stop
-- and re-run Step 1 to understand why before committing.

-- Verify INSIDE the transaction, before committing:
SELECT 'IN-TXN' AS stage,
       count(*) FILTER (WHERE is_active) AS active_rows,
       public.is_premium_member('36258aeb-f26d-406e-a8ed-25595a736614') AS is_premium
FROM public.premium_memberships
WHERE user_id = '36258aeb-f26d-406e-a8ed-25595a736614';
-- EXPECT active_rows = 1 AND is_premium = true
-- If is_premium came back false, ROLLBACK immediately — that would mean
-- the wrong row was targeted.

COMMIT;
*/


-- ---------------------------------------------------------------------
--  STEP 3 — POST-CHECK (read-only)
-- ---------------------------------------------------------------------

SELECT
  'POST' AS stage,
  count(*) FILTER (WHERE is_active) AS active_rows,
  public.is_premium_member('36258aeb-f26d-406e-a8ed-25595a736614') AS is_premium_after
FROM public.premium_memberships
WHERE user_id = '36258aeb-f26d-406e-a8ed-25595a736614';
-- EXPECT active_rows = 1, is_premium_after = true (UNCHANGED entitlement)

SELECT
  'POST-scan' AS stage,
  user_id,
  count(*) AS active_membership_count
FROM public.premium_memberships
WHERE is_active = true
  AND (expires_at IS NULL OR expires_at > now())
GROUP BY user_id
HAVING count(*) > 1;
-- EXPECT 0 rows.


-- ---------------------------------------------------------------------
--  ROLLBACK
-- ---------------------------------------------------------------------
--  Single-row, fully reversible. No data is deleted — is_active is a
--  soft flag, so the row and all its metadata survive untouched.

/*
UPDATE public.premium_memberships
SET is_active = true
WHERE id = '93fa86e3-f962-42e4-b5a2-6f290069e39c';
-- Restores the duplicate exactly as it was.
*/

--  ⚠️ Rollback caveat: if the admin UI performed a revoke on this user
--  between the correction and the rollback, BOTH rows will be inactive
--  and reactivating this one would wrongly re-grant Premium. Always run
--  Step 1 again before rolling back.


-- ---------------------------------------------------------------------
--  IMPACT SUMMARY
-- ---------------------------------------------------------------------
--  Rows changed .............. 1
--  Users affected ............ 1 (36258aeb-f26d-406e-a8ed-25595a736614)
--  Entitlement change ........ NONE — is_premium_member() true before
--                              and after; both rows were permanent
--  User-visible change ....... none
--  Data destroyed ............ none (soft flag only)
--  Reversible ................ yes, single-row UPDATE
--  Required for A1 to work ... NO
--  Blocks anything ........... only a future unique index enforcing
--                              one-active-membership-per-user (Phase 1)
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
--  FOLLOW-UP, NOT PROPOSED HERE
-- ---------------------------------------------------------------------
--  Once this lands and V04 returns zero rows, the invariant could be
--  enforced structurally:
--
--    CREATE UNIQUE INDEX CONCURRENTLY idx_premium_one_active_per_user
--      ON public.premium_memberships (user_id)
--      WHERE is_active = true;
--
--  Deliberately NOT included:
--   - it would fail while the duplicate exists;
--   - it would also forbid legitimate historical patterns if the product
--     ever wants stacked/queued entitlements;
--   - adding a constraint is a schema change, beyond a hotfix.
--  Raise it in Phase 1 with the product decision attached.
-- =====================================================================
