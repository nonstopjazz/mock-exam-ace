-- =====================================================================
--  gsat-staging — S1 + S2-5 VERIFICATION   (run AFTER A1-premium-functions.sql)
--
--  🛑 STAGING ONLY.
--
--  ------------------------------------------------------------------
--  WHY THIS IS SHAPED AS A FUNCTION
--  ------------------------------------------------------------------
--  The Supabase SQL Editor displays only the LAST statement's result
--  grid. A script of twenty SELECTs therefore shows exactly one of them
--  and silently discards the rest -- which is how an earlier run of this
--  file appeared to "pass" while hiding a real failure.
--
--  So every check writes into one result set and a single final SELECT
--  returns it. A real (not temp) function is used because Supabase
--  pools connections: a TEMP table can vanish between statements, a
--  function cannot.
--
--  Drop it when staging is finished:
--      DROP FUNCTION public._staging_verify();
--
--  ------------------------------------------------------------------
--  WHAT IS COVERED   (STAGING_PLAN.md section 6)
--  ------------------------------------------------------------------
--    S1-1  V01 V02 V03 V07   structural
--    S2-5  T8                NULL identity, grant layer bypassed
--    S1-2  T1..T4b           idempotent grant, exactly 1 active row
--    S1-3  T5                revoked_count = 2, is_premium_member false
--    S1-4  T7                MEMBERSHIP_NOT_FOUND
--
--  S2-1 / S2-2 / S2-3 are deliberately absent: they must go through
--  PostgREST from a browser, because the EXECUTE grant layer is exactly
--  what they test and this editor connects as a superuser that bypasses
--  it. That same property is what makes T8 possible here.
--
--  State is restored explicitly at the end (no ROLLBACK, because the
--  results have to survive), so the script is safe to re-run.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._staging_verify()
RETURNS TABLE(seq int, test text, detail text, status text)
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_admin  uuid;
  v_user_a uuid;
  v_user_b uuid;
  v_res    json;
  v_n      int;
  v_bool   boolean;
  v_txt    text;
  v_acl    text;
  v_i      int := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _vr(seq int, test text, detail text, status text) ON COMMIT DROP;

  SELECT id INTO v_admin  FROM auth.users WHERE email = 'staging-admin@example.test';
  SELECT id INTO v_user_a FROM auth.users WHERE email = 'staging-user-a@example.test';
  SELECT id INTO v_user_b FROM auth.users WHERE email = 'staging-user-b@example.test';

  IF v_admin IS NULL OR v_user_a IS NULL OR v_user_b IS NULL THEN
    RAISE EXCEPTION 'Missing staging users. Run STAGING-FIXTURES.sql first.';
  END IF;

  -- =================================================================
  --  SECTION 1 — STRUCTURAL
  -- =================================================================
  FOR v_txt IN SELECT unnest(ARRAY['admin_grant_premium','admin_revoke_premium']) LOOP

    v_i := v_i + 1;
    -- Exact array membership, not a LIKE: proconfig::text renders with
    -- escaped quotes ({"search_path=\"\""}) and string matching on that
    -- is easy to get wrong -- an earlier draft of this check did.
    -- Postgres stores an empty search_path as the element  search_path=""
    -- (14 chars, real quote characters), NOT  search_path=  . Accept both
    -- so the check survives any future normalisation.
    SELECT (p.prosecdef AND (p.proconfig && ARRAY['search_path=""','search_path='])),
           COALESCE(p.proconfig::text,'(none)')
      INTO v_bool, v_acl
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_txt;
    INSERT INTO _vr VALUES (v_i, 'V01 ' || v_txt,
      'DEFINER + proconfig ' || v_acl, CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END);

    v_i := v_i + 1;
    SELECT (pg_get_functiondef(p.oid) ILIKE '%is_admin() IS NOT TRUE%'
        AND pg_get_functiondef(p.oid) NOT ILIKE '%IF NOT public.is_admin()%')
      INTO v_bool
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_txt;
    INSERT INTO _vr VALUES (v_i, 'V07 ' || v_txt,
      'gate uses IS NOT TRUE, not a bare NOT', CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END);

    v_i := v_i + 1;
    SELECT p.proacl::text INTO v_acl
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_txt;
    -- FAIL if PUBLIC holds EXECUTE (a bare "=X/" entry) or anon does.
    INSERT INTO _vr VALUES (v_i, 'V02 ' || v_txt, v_acl,
      CASE WHEN v_acl ~ '(\{|,)=X/' OR v_acl LIKE '%anon=X/%'
           THEN 'FAIL' ELSE 'PASS' END);

    v_i := v_i + 1;
    SELECT (NOT has_function_privilege('anon', p.oid, 'EXECUTE')
            AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      INTO v_bool
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_txt;
    INSERT INTO _vr VALUES (v_i, 'V03 ' || v_txt,
      'anon EXECUTE false, authenticated true', CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END);
  END LOOP;

  -- =================================================================
  --  SECTION 2 — S2-5 / T8 : NULL IDENTITY
  -- =================================================================
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims',    '', true);

  v_i := v_i + 1;
  INSERT INTO _vr VALUES (v_i, 'T8-pre', 'auth.uid()=' || COALESCE(auth.uid()::text,'NULL')
    || '  is_admin()=' || COALESCE(public.is_admin()::text,'NULL'),
    CASE WHEN auth.uid() IS NULL AND public.is_admin() IS NOT TRUE THEN 'PASS' ELSE 'FAIL' END);

  v_i := v_i + 1;
  v_res := public.admin_grant_premium(v_user_a, NULL, 'T8 null-identity probe');
  INSERT INTO _vr VALUES (v_i, 'T8-grant', v_res::text,
    CASE WHEN v_res->>'error' = 'UNAUTHORIZED' THEN 'PASS' ELSE 'FAIL' END);

  v_i := v_i + 1;
  v_res := public.admin_revoke_premium(gen_random_uuid());
  INSERT INTO _vr VALUES (v_i, 'T8-revoke', v_res::text,
    CASE WHEN v_res->>'error' = 'UNAUTHORIZED' THEN 'PASS'
         ELSE 'FAIL (MEMBERSHIP_NOT_FOUND means the gate was skipped)' END);

  v_i := v_i + 1;
  SELECT count(*) INTO v_n FROM public.premium_memberships WHERE notes='T8 null-identity probe';
  INSERT INTO _vr VALUES (v_i, 'T8-check', v_n || ' rows written',
    CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END);

  -- =================================================================
  --  SECTION 3 — S1 BEHAVIOURAL (impersonating the staging admin)
  -- =================================================================
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claims',
          json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);

  v_i := v_i + 1;
  INSERT INTO _vr VALUES (v_i, 'S1-pre', 'acting as admin, is_admin()='
    || COALESCE(public.is_admin()::text,'NULL'),
    CASE WHEN public.is_admin() THEN 'PASS' ELSE 'FAIL (everything below would fail for the wrong reason)' END);

  v_res := public.admin_grant_premium(v_user_a, now() + interval '3 months', 'T1');
  SELECT count(*) INTO v_n FROM public.premium_memberships WHERE user_id=v_user_a AND is_active;
  v_i := v_i + 1;
  INSERT INTO _vr VALUES (v_i, 'T1 first grant', 'action=' || (v_res->>'action') || '  active_rows=' || v_n,
    CASE WHEN v_res->>'action'='granted' AND v_n=1 THEN 'PASS' ELSE 'FAIL' END);

  v_res := public.admin_grant_premium(v_user_a, now() + interval '1 month', 'T2');
  SELECT count(*) INTO v_n FROM public.premium_memberships WHERE user_id=v_user_a AND is_active;
  v_i := v_i + 1;
  INSERT INTO _vr VALUES (v_i, 'T2 shorter regrant', 'action=' || (v_res->>'action') || '  active_rows=' || v_n,
    CASE WHEN v_res->>'action'='already_active' AND v_n=1 THEN 'PASS' ELSE 'FAIL' END);

  v_res := public.admin_grant_premium(v_user_a, now() + interval '1 year', 'T3');
  SELECT count(*) INTO v_n FROM public.premium_memberships WHERE user_id=v_user_a AND is_active;
  v_i := v_i + 1;
  INSERT INTO _vr VALUES (v_i, 'T3 longer regrant', 'action=' || (v_res->>'action') || '  active_rows=' || v_n,
    CASE WHEN v_res->>'action'='extended' AND v_n=1 THEN 'PASS' ELSE 'FAIL' END);

  v_res := public.admin_grant_premium(v_user_a, NULL, 'T4');
  SELECT count(*) INTO v_n FROM public.premium_memberships WHERE user_id=v_user_a AND is_active;
  SELECT bool_and(expires_at IS NULL) INTO v_bool FROM public.premium_memberships
   WHERE user_id=v_user_a AND is_active;
  v_i := v_i + 1;
  INSERT INTO _vr VALUES (v_i, 'T4 permanent', 'action=' || (v_res->>'action')
    || '  active_rows=' || v_n || '  all_permanent=' || v_bool,
    CASE WHEN v_res->>'action'='extended' AND v_n=1 AND v_bool THEN 'PASS' ELSE 'FAIL' END);

  v_res := public.admin_grant_premium(v_user_a, now() + interval '3 months', 'T4b');
  SELECT bool_and(expires_at IS NULL) INTO v_bool FROM public.premium_memberships
   WHERE user_id=v_user_a AND is_active;
  v_i := v_i + 1;
  INSERT INTO _vr VALUES (v_i, 'T4b never shortens', 'action=' || (v_res->>'action')
    || '  still_permanent=' || v_bool,
    CASE WHEN v_res->>'action'='already_active' AND v_bool THEN 'PASS' ELSE 'FAIL' END);

  -- ---- T5 : THE CRITICAL TEST -------------------------------------
  SELECT count(*) INTO v_n FROM public.premium_memberships WHERE user_id=v_user_b AND is_active;
  v_i := v_i + 1;
  INSERT INTO _vr VALUES (v_i, 'T5-pre USER_B', v_n || ' active rows (finding 9.15 staged)',
    CASE WHEN v_n=2 THEN 'PASS' ELSE 'FAIL (need 2; restore the fixture duplicates)' END);

  v_res := public.admin_revoke_premium((
    SELECT id FROM public.premium_memberships
     WHERE user_id=v_user_b AND is_active ORDER BY granted_at LIMIT 1));
  v_i := v_i + 1;
  INSERT INTO _vr VALUES (v_i, 'T5 revoke', 'revoked_count=' || COALESCE(v_res->>'revoked_count','(absent)'),
    CASE WHEN (v_res->>'revoked_count')::int = 2 THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_n FROM public.premium_memberships WHERE user_id=v_user_b AND is_active;
  v_bool := public.is_premium_member(v_user_b);
  v_i := v_i + 1;
  INSERT INTO _vr VALUES (v_i, 'T5-check', 'active_rows=' || v_n || '  is_premium_member=' || v_bool,
    CASE WHEN v_n=0 AND v_bool IS FALSE THEN 'PASS  <- finding 9.15 FIXED' ELSE 'FAIL' END);

  -- ---- T7 ----------------------------------------------------------
  v_res := public.admin_revoke_premium(gen_random_uuid());
  v_i := v_i + 1;
  INSERT INTO _vr VALUES (v_i, 'T7 unknown id', v_res::text,
    CASE WHEN v_res->>'error'='MEMBERSHIP_NOT_FOUND' THEN 'PASS' ELSE 'FAIL' END);

  -- =================================================================
  --  RESTORE fixture state (explicit, because we did not roll back)
  -- =================================================================
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims','',true);

  DELETE FROM public.premium_memberships WHERE user_id = v_user_a;
  UPDATE public.premium_memberships SET is_active = true
   WHERE user_id = v_user_b AND notes LIKE 'fixture duplicate%';

  SELECT count(*) INTO v_n FROM public.premium_memberships WHERE user_id=v_user_b AND is_active;
  v_i := v_i + 1;
  INSERT INTO _vr VALUES (v_i, 'RESTORE', 'USER_B back to ' || v_n || ' active rows; USER_A cleared',
    CASE WHEN v_n=2 THEN 'PASS' ELSE 'FAIL' END);

  RETURN QUERY SELECT r.seq, r.test, r.detail, r.status FROM _vr r ORDER BY r.seq;
END;
$fn$;

SELECT * FROM public._staging_verify();
