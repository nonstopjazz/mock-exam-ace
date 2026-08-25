-- =====================================================================
--  PHASE 0.5B-A1 — PREPARED CHANGE, NOT YET APPLIED
--  admin_grant_premium / admin_revoke_premium
--  Covers A1-1, A1-2 and A1-6
-- =====================================================================
--
--  ⚠️  THIS FILE HAS NOT BEEN DEPLOYED AND MUST NOT BE APPLIED TO
--      PRODUCTION WITHOUT EXPLICIT APPROVAL.
--
--  It deliberately lives in docs/phase-0.5b/ rather than
--  supabase/migrations/ so that it cannot be picked up and applied by
--  accident. At deploy time, move or copy it into the migration
--  location your team actually uses.
--
--  It changes NO DATA. It only replaces two function bodies and
--  tightens their EXECUTE privileges. The one pre-existing duplicate
--  membership row is deliberately left untouched — see
--  DATA-REMEDIATION-duplicate-membership.sql, which is separate and
--  awaits its own approval.
--
--  Rollback:     A1-premium-functions.rollback.sql
--  Verification: A1-verification.sql
--  Rationale:    README.md (caller analysis + option comparison)
--
-- ---------------------------------------------------------------------
--  WHAT THIS FIXES
--
--  A1-1 / A1-2  (audit finding 9.3, CRITICAL)
--    Both functions are SECURITY DEFINER but contain no authorization
--    check, and EXECUTE is granted to PUBLIC including anon. Any caller,
--    authenticated or not, can currently grant or revoke Premium for any
--    user.
--
--  A1-6  (audit finding 9.15, HIGH)
--    admin_grant_premium INSERTs unconditionally, so one user can hold
--    several simultaneously-active memberships. admin_revoke_premium
--    deactivates a single row by id, while is_premium_member() tests
--    EXISTS over all active rows. Revoking a user who holds two rows
--    therefore reports success while leaving them Premium.
--
-- ---------------------------------------------------------------------
--  ⚠️  SCOPE NOTE — please confirm you want this
--
--  Both functions are also on the Phase 0.5B-A2 list (finding 9.7,
--  unpinned search_path). Because this change rewrites both bodies in
--  full anyway, `SET search_path = ''` is included here rather than
--  rewriting the same two functions a second time in A2. Every object
--  reference is schema-qualified accordingly.
--
--  This crosses the A1/A2 boundary you drew. If you prefer strict phase
--  separation, delete the two `SET search_path = ''` lines and drop the
--  `public.` qualification — the rest is unaffected. Including it leaves
--  A2 with 4 functions instead of 6.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
--  1. admin_grant_premium — authorize, and never create a second
--     simultaneously-active membership for the same user.
-- ---------------------------------------------------------------------
--  Signature unchanged: (uuid, timestamptz, text) -> json
--
--  Behaviour matrix (existing = newest currently-effective membership):
--
--    no existing membership          -> INSERT      action='granted'
--    existing, new grant extends it  -> UPDATE      action='extended'
--    existing, new grant does not
--      extend it (same or shorter)   -> no write    action='already_active'
--
--  "Extends" means: the new expiry is NULL (permanent), or the existing
--  expiry is not NULL and the new expiry is later than it.
--
--  Deliberate: a grant is NEVER allowed to SHORTEN existing coverage
--  silently. Granting 3 months to a user who already holds a permanent
--  membership returns 'already_active' and writes nothing. To shorten,
--  revoke first, then grant. This keeps the renewal workflow in
--  UsersAdmin.tsx working (3months / 6months / 1year / forever) while
--  guaranteeing at most one active row per user.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_grant_premium(
  p_user_id uuid,
  p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_notes text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid;
  v_existing public.premium_memberships%ROWTYPE;
  v_action   text;
BEGIN
  -- A1-1: authoritative admin check. is_admin() is the same gate used by
  -- every other privileged object in this schema, so this makes these
  -- functions as strong as the rest of the system.
  --
  -- WHY `IS NOT TRUE` AND NOT A PLAIN `NOT`:
  --   is_admin() returns NULL -- not false -- when auth.uid() is NULL,
  --   because its SELECT ... INTO matches no auth.users row. Under a
  --   plain NOT, the condition is then NULL; PL/pgSQL treats a NULL IF
  --   condition as false, so this UNAUTHORIZED branch would be SKIPPED
  --   and a caller with no identity would be granted.
  --
  --   Reproduced on PostgreSQL 16.13 while preparing staging. A call
  --   with auth.uid() = NULL returned
  --       {"success": true, "action": "extended", ...}
  --   while an authenticated non-admin correctly returned UNAUTHORIZED.
  --
  --   `IS NOT TRUE` treats NULL and false alike, so the gate fails
  --   closed. Behaviour for authenticated callers is unchanged.
  --
  --   The REVOKE at the bottom of this file also stops anon at the grant
  --   layer, but the two defences must hold INDEPENDENTLY -- see
  --   STAGING_PLAN.md section 6, S2. Verified by S2-5 / V07.
  IF public.is_admin() IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  v_admin_id := auth.uid();

  -- A1-6: find the newest membership that is_premium_member() would
  -- currently honour. Matching its predicate exactly is what guarantees
  -- we never leave a second effective row behind.
  SELECT * INTO v_existing
  FROM public.premium_memberships
  WHERE user_id = p_user_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY granted_at DESC
  LIMIT 1;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.premium_memberships (user_id, expires_at, granted_by, notes)
    VALUES (p_user_id, p_expires_at, v_admin_id, p_notes)
    RETURNING * INTO v_existing;
    v_action := 'granted';

  ELSIF p_expires_at IS NULL
        OR (v_existing.expires_at IS NOT NULL AND p_expires_at > v_existing.expires_at) THEN
    -- Extend in place rather than inserting a second active row.
    UPDATE public.premium_memberships
    SET expires_at = p_expires_at,
        notes      = COALESCE(p_notes, notes),
        granted_by = v_admin_id
    WHERE id = v_existing.id
    RETURNING * INTO v_existing;
    v_action := 'extended';

  ELSE
    -- Idempotent: already covered for at least as long. Write nothing.
    v_action := 'already_active';
  END IF;

  -- Return shape is a superset of the old {'success': true}.
  -- UsersAdmin.handleGrantPremium reads only rpcError, so this is
  -- backward compatible; the extra fields are for verification and for
  -- any future UI that wants to report what actually happened.
  RETURN json_build_object(
    'success',       true,
    'action',        v_action,
    'membership_id', v_existing.id,
    'user_id',       v_existing.user_id,
    'expires_at',    v_existing.expires_at
  );
END;
$function$;


-- ---------------------------------------------------------------------
--  2. admin_revoke_premium — authorize, and revoke the USER's Premium,
--     not merely one row of it.
-- ---------------------------------------------------------------------
--  Signature unchanged: (uuid) -> json, still taking a membership id.
--
--  The membership id is now treated as a HANDLE that identifies which
--  user to revoke, which is exactly how the admin UI already uses it:
--  UsersAdmin.tsx:548 passes premiumCache[user.id].id (the newest active
--  membership) behind a button labelled 「收回 Premium」, and line 552
--  then clears that user's entire cache entry. The UI's intent is
--  already per-user; only the RPC disagreed.
--
--  Guarantee (audit finding 9.15, constraint 3): after this returns
--  success, is_premium_member(user) is false. It deactivates every row
--  with is_active = true for that user, which is a superset of what
--  is_premium_member() inspects.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_revoke_premium(p_membership_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id       uuid;
  v_revoked_count integer;
BEGIN
  -- A1-2: authoritative admin check.
  -- `IS NOT TRUE` rather than a plain NOT -- see the note in
  -- admin_grant_premium above. is_admin() returns NULL when auth.uid()
  -- is NULL, and a NULL IF condition would skip this branch entirely.
  -- Verified by S2-5 / V07.
  IF public.is_admin() IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- Resolve the owning user from the supplied membership handle.
  SELECT user_id INTO v_user_id
  FROM public.premium_memberships
  WHERE id = p_membership_id;

  IF v_user_id IS NULL THEN
    -- Previously this silently reported success for a nonexistent id.
    RETURN json_build_object('success', false, 'error', 'MEMBERSHIP_NOT_FOUND');
  END IF;

  -- A1-6: revoke ALL active memberships for that user, not just the one
  -- whose id was passed.
  UPDATE public.premium_memberships
  SET is_active = false
  WHERE user_id = v_user_id
    AND is_active = true;

  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

  -- revoked_count = 0 is still success: the user held nothing active, so
  -- the postcondition (is_premium_member = false) already holds. Revoke
  -- is idempotent.
  RETURN json_build_object(
    'success',       true,
    'user_id',       v_user_id,
    'revoked_count', v_revoked_count
  );
END;
$function$;


-- ---------------------------------------------------------------------
--  3. EXECUTE privileges (A1-1 / A1-2, finding 9.3)
-- ---------------------------------------------------------------------
--  Production currently shows:
--    {=X/postgres, postgres=X/postgres, anon=X/postgres,
--     authenticated=X/postgres, service_role=X/postgres}
--  The leading "=X" is a grant to PUBLIC, so anon can execute both.
--
--  Minimum that preserves the existing admin UI: the UI calls these from
--  the browser with the signed-in user's JWT, i.e. as `authenticated`.
--  So `authenticated` must retain EXECUTE, with is_admin() inside the
--  function doing the real gating. service_role is kept for any
--  server-side path.
--
--  Stricter alternative (route admin actions through a server endpoint
--  and grant to service_role only) would break UsersAdmin.tsx and is
--  therefore Phase 1 work, not a hotfix.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_grant_premium(uuid, timestamp with time zone, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_grant_premium(uuid, timestamp with time zone, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_revoke_premium(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_revoke_premium(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_grant_premium(uuid, timestamp with time zone, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_premium(uuid, timestamp with time zone, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_premium(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_premium(uuid) TO service_role;

COMMIT;

-- =====================================================================
--  NOT INCLUDED HERE, ON PURPOSE
--
--  * No data changes. The existing duplicate active membership for user
--    36258aeb-f26d-406e-a8ed-25595a736614 is untouched. After this
--    change that user still holds two active rows, but a single revoke
--    now clears both, and no new duplicates can be created. Cleaning up
--    the existing row is a separate, approval-gated step —
--    DATA-REMEDIATION-duplicate-membership.sql.
--  * No UNIQUE constraint is added. A partial unique index on
--    (user_id) WHERE is_active would enforce this structurally, but it
--    would fail immediately against the existing duplicate row and is a
--    larger change than a hotfix warrants. Proposed for Phase 1 after
--    the data remediation lands.
--  * No changes to is_premium_member() or claim_pack_with_token().
-- =====================================================================
