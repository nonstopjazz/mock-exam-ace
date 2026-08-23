-- =====================================================================
--  ROLLBACK for A1-premium-functions.sql
--  Restores the EXACT production definitions captured by Q15 on
--  2026-08-23, verbatim.
-- =====================================================================
--
--  ⚠️  Applying this rollback REINSTATES CRITICAL security finding 9.3:
--      both functions become executable by PUBLIC (including anon) with
--      no authorization check, and finding 9.15 (revocation silently
--      failing) returns with them.
--
--      Use it only if the A1 change causes a worse problem, and treat
--      the window as an active exposure.
--
--  This rollback changes NO DATA. Any memberships granted, extended or
--  revoked while the A1 version was live remain exactly as they are —
--  those are legitimate administrator actions, not artefacts of the
--  change. In particular, if a revoke ran under A1 and correctly
--  deactivated two rows, rolling back does NOT reactivate them.
--
--  Source of truth: the `full_definition` column of Q15's output. The
--  bodies below are reproduced unaltered, including the absence of
--  SET search_path.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
--  1. Restore admin_grant_premium to its pre-A1 definition
--     (no admin check, no search_path, unconditional INSERT)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_grant_premium(
  p_user_id uuid,
  p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_notes text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();

  INSERT INTO premium_memberships (user_id, expires_at, granted_by, notes)
  VALUES (p_user_id, p_expires_at, v_admin_id, p_notes);

  RETURN json_build_object('success', true);
END;
$function$;


-- ---------------------------------------------------------------------
--  2. Restore admin_revoke_premium to its pre-A1 definition
--     (no admin check, no search_path, single-row revoke by id)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_revoke_premium(p_membership_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE premium_memberships
  SET is_active = false
  WHERE id = p_membership_id;

  RETURN json_build_object('success', true);
END;
$function$;


-- ---------------------------------------------------------------------
--  3. Restore the pre-A1 EXECUTE privileges
-- ---------------------------------------------------------------------
--  Original ACL, from Q15:
--    {=X/postgres, postgres=X/postgres, anon=X/postgres,
--     authenticated=X/postgres, service_role=X/postgres}
--
--  "=X/postgres" is EXECUTE granted to PUBLIC. Restoring it is what
--  makes this rollback dangerous; it is included so the rollback is
--  faithful rather than partial.
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.admin_grant_premium(uuid, timestamp with time zone, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_premium(uuid, timestamp with time zone, text) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_premium(uuid, timestamp with time zone, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_premium(uuid, timestamp with time zone, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_revoke_premium(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_premium(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_premium(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_premium(uuid) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------
--  Confirm the rollback landed
-- ---------------------------------------------------------------------
--  Expect: proconfig = NULL (no search_path) and an ACL containing
--  "=X/postgres" for both functions.
--
--  SELECT p.proname,
--         pg_get_function_identity_arguments(p.oid) AS args,
--         COALESCE(p.proconfig::text, '(no search_path)') AS proconfig,
--         p.proacl::text AS execute_acl
--  FROM pg_proc p
--  JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public'
--    AND p.proname IN ('admin_grant_premium','admin_revoke_premium')
--  ORDER BY p.proname;
-- =====================================================================
