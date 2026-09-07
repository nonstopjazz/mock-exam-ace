-- =====================================================================
--  /learn identity spine — PRODUCTION safety checks
--
--  READ-ONLY. Creates no fixture, writes no row, changes no setting.
--  The staging BEHAVIOUR file must NOT be run on Production: it builds
--  fixture classes and FIXTURE user_profiles rows.
--
--  Run this TWICE with the identical script:
--     P1  BEFORE the migration   -> baseline
--     P3  AFTER  the migration   -> compare
--
--  The point is the comparison. C02/C03 are a per-user census of what
--  every real account can actually see in user_profiles. If the two
--  additive policies widened anyone's visibility by even one row, the
--  digest changes. With learn.* empty they cannot, and C07 proves it is
--  empty -- so the migration is INERT on Production until the first
--  class is created.
--
--  Safe to run on Production before the migration exists: every learn
--  reference is guarded with to_regclass.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._learn_prod_checks()
RETURNS TABLE (seq int, check_name text, value text)
LANGUAGE plpgsql
AS $fn$
DECLARE
  u          record;
  v          int;
  n_users    int := 0;
  total      int := 0;
  mx         int := 0;
  null_rows  int;
  anon_rows  int;
  anon_err   text := '';
  learn_err  text;
  learn_cnt  text;
BEGIN
  -- ---- per-user census of user_profiles visibility ------------------
  FOR u IN SELECT id FROM auth.users ORDER BY id LOOP
    n_users := n_users + 1;
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', u.id::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM public.user_profiles' INTO v;
    EXECUTE 'RESET ROLE';
    total := total + v;
    IF v > mx THEN mx := v; END IF;
  END LOOP;

  -- ---- NULL identity -------------------------------------------------
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE 'SELECT count(*) FROM public.user_profiles' INTO null_rows;
  EXECUTE 'RESET ROLE';

  -- ---- anon reading user_profiles: must be 0 rows, NOT an error ------
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.user_profiles' INTO anon_rows;
  EXCEPTION WHEN OTHERS THEN
    anon_rows := NULL; anon_err := SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';

  -- ---- anon reaching learn.classes: must be denied -------------------
  IF to_regclass('learn.classes') IS NULL THEN
    learn_err := '(learn does not exist yet)';
    learn_cnt := '(learn does not exist yet)';
  ELSE
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN
      EXECUTE 'SELECT count(*) FROM learn.classes' INTO v;
      learn_err := 'ALLOWED - ' || v::text || ' rows';
    EXCEPTION WHEN OTHERS THEN
      learn_err := 'denied ' || SQLSTATE;
    END;
    EXECUTE 'RESET ROLE';

    EXECUTE 'SELECT (SELECT count(*) FROM learn.classes)::text || '' / '' || '
         || '(SELECT count(*) FROM learn.class_members)::text || '' / '' || '
         || '(SELECT count(*) FROM learn.guardian_links)::text'
      INTO learn_cnt;
  END IF;

  RETURN QUERY
  SELECT 1, 'C01 auth.users total',                         n_users::text
  UNION ALL SELECT 2, 'C02 SUM of user_profiles rows visible per user  <-- MUST NOT CHANGE', total::text
  UNION ALL SELECT 3, 'C03 MAX rows visible to any single user         <-- MUST NOT CHANGE', mx::text
  UNION ALL SELECT 4, 'C04 user_profiles policy count',
                      (SELECT count(*)::text FROM pg_policy WHERE polrelid = 'public.user_profiles'::regclass)
  UNION ALL SELECT 5, 'C05 NULL identity -> user_profiles rows (expect 0)', null_rows::text
  UNION ALL SELECT 6, 'C06 anon -> user_profiles (expect 0 rows, NO error)',
                      coalesce(anon_rows::text, 'ERROR') || CASE WHEN anon_err <> '' THEN ' err=' || anon_err ELSE ' rows' END
  UNION ALL SELECT 7, 'C07 learn row counts classes / members / guardian_links', learn_cnt
  UNION ALL SELECT 8, 'C08 anon -> learn.classes',           learn_err
  ORDER BY 1;
END
$fn$;

SELECT * FROM public._learn_prod_checks();

-- Cleanup after recording BOTH runs:
--   DROP FUNCTION public._learn_prod_checks();
