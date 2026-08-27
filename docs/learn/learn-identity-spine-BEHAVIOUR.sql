-- =====================================================================
--  /learn identity spine — BEHAVIOURAL verification
--
--  Structural checks prove the objects are SHAPED right. This file
--  proves they BEHAVE right, by actually assuming each identity and
--  reading through RLS:
--     NULL identity · anon · teacher · other teacher · student ·
--     guardian (pending vs confirmed)
--
--  Everything returns in ONE result set (SQL Editor shows only the last
--  grid). Order of execution is guaranteed -- the mutating tests at the
--  end revert themselves.
--
--  🛑 STAGING ONLY until the owner approves a Production plan.
-- =====================================================================

-- =====================================================================
--  0. Test actors — EDIT THESE FIVE LINES to match the staging project
--
--  These must already exist as Supabase Auth users. This file never
--  inserts into auth.users.
--
--  Mapped to gsat-staging on 2026-08-27 (L1/L2). S1 and S2 reuse the two
--  existing staging accounts; TA, TB and G1 were created for this run.
--  🛑 staging-admin@example.test is deliberately NOT used: TA drives every
--     "the teacher CAN see it" assertion, and an admin account there could
--     turn a false positive green.
-- =====================================================================

CREATE OR REPLACE VIEW public._learn_actors AS
SELECT * FROM (VALUES
  ('TA', 'learn-teacher-a@example.test'),
  ('TB', 'learn-teacher-b@example.test'),
  ('S1', 'staging-user-a@example.test'),
  ('S2', 'staging-user-b@example.test'),
  ('G1', 'learn-guardian-1@example.test')
) v(slot, email);

-- Precondition: fail loudly, naming exactly what is missing.
DO $pre$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(a.email, ', ')
    INTO v_missing
    FROM public._learn_actors a
   WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.email = a.email);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'MISSING AUTH USERS: %  -- create them in the staging Dashboard first, or edit public._learn_actors', v_missing;
  END IF;
END $pre$;

-- =====================================================================
--  1. Fixtures — idempotent, learn.* and public.user_profiles only
-- =====================================================================

DO $fix$
DECLARE
  ta uuid; tb uuid; s1 uuid; s2 uuid; g1 uuid;
  c1 uuid; c2 uuid;
BEGIN
  SELECT u.id INTO ta FROM auth.users u JOIN public._learn_actors a ON a.email = u.email WHERE a.slot = 'TA';
  SELECT u.id INTO tb FROM auth.users u JOIN public._learn_actors a ON a.email = u.email WHERE a.slot = 'TB';
  SELECT u.id INTO s1 FROM auth.users u JOIN public._learn_actors a ON a.email = u.email WHERE a.slot = 'S1';
  SELECT u.id INTO s2 FROM auth.users u JOIN public._learn_actors a ON a.email = u.email WHERE a.slot = 'S2';
  SELECT u.id INTO g1 FROM auth.users u JOIN public._learn_actors a ON a.email = u.email WHERE a.slot = 'G1';

  -- profiles for everyone (the roster is meaningless without them)
  INSERT INTO public.user_profiles (user_id, display_name, product)
  SELECT u.id, 'FIXTURE ' || a.slot, 'gsat'
    FROM auth.users u JOIN public._learn_actors a ON a.email = u.email
  ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name;

  -- two classes, one per teacher
  SELECT id INTO c1 FROM learn.classes WHERE name = 'FIXTURE C1';
  IF c1 IS NULL THEN
    INSERT INTO learn.classes (owner_teacher_user_id, name) VALUES (ta, 'FIXTURE C1') RETURNING id INTO c1;
  ELSE
    UPDATE learn.classes SET owner_teacher_user_id = ta, status = 'active' WHERE id = c1;
  END IF;

  SELECT id INTO c2 FROM learn.classes WHERE name = 'FIXTURE C2';
  IF c2 IS NULL THEN
    INSERT INTO learn.classes (owner_teacher_user_id, name) VALUES (tb, 'FIXTURE C2') RETURNING id INTO c2;
  ELSE
    UPDATE learn.classes SET owner_teacher_user_id = tb, status = 'active' WHERE id = c2;
  END IF;

  -- S1 and S2 are both active members of C1
  INSERT INTO learn.class_members (class_id, class_owner_teacher_user_id, user_id, role)
  VALUES (c1, ta, s1, 'student'), (c1, ta, s2, 'student')
  ON CONFLICT (class_id, user_id) DO UPDATE SET status = 'active', role = 'student';

  -- G1: CONFIRMED guardian of S1, PENDING for S2
  INSERT INTO learn.guardian_links (guardian_user_id, student_user_id, status, confirmed_at)
  VALUES (g1, s1, 'active', now())
  ON CONFLICT (guardian_user_id, student_user_id) DO UPDATE SET status = 'active';

  INSERT INTO learn.guardian_links (guardian_user_id, student_user_id, status)
  VALUES (g1, s2, 'pending')
  ON CONFLICT (guardian_user_id, student_user_id) DO UPDATE SET status = 'pending';
END $fix$;

-- =====================================================================
--  2. Probe helper — assume an identity, run one scalar query
-- =====================================================================

CREATE OR REPLACE FUNCTION public._learn_probe(p_role text, p_uid uuid, p_sql text)
RETURNS TABLE (res text, err text)
LANGUAGE plpgsql
AS $probe$
DECLARE v text; e text := '';
BEGIN
  EXECUTE 'RESET ROLE';

  IF p_uid IS NULL THEN
    PERFORM set_config('request.jwt.claims',    '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
  ELSE
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', p_uid, 'role', p_role)::text, true);
    PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  END IF;

  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := NULL;
    e := SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';

  RETURN QUERY SELECT v, e;
END
$probe$;

CREATE OR REPLACE FUNCTION public._learn_expect(
  p_seq int, p_test text, p_role text, p_uid uuid, p_sql text,
  p_expect_res text, p_expect_err text DEFAULT '')
RETURNS TABLE (seq int, test text, expected text, actual text, status text)
LANGUAGE plpgsql
AS $exp$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public._learn_probe(p_role, p_uid, p_sql);
  RETURN QUERY SELECT
    p_seq,
    p_test,
    coalesce(p_expect_res, 'NULL') || CASE WHEN p_expect_err <> '' THEN ' err=' || p_expect_err ELSE '' END,
    coalesce(r.res, 'NULL')        || CASE WHEN r.err      <> '' THEN ' err=' || r.err      ELSE '' END,
    CASE WHEN coalesce(r.res, '<null>') IS NOT DISTINCT FROM coalesce(p_expect_res, '<null>')
          AND r.err = p_expect_err
         THEN 'PASS' ELSE 'FAIL' END;
END
$exp$;

-- =====================================================================
--  3. The tests
-- =====================================================================

CREATE OR REPLACE FUNCTION public._learn_spine_behaviour()
RETURNS TABLE (seq int, test text, expected text, actual text, status text)
LANGUAGE plpgsql
AS $run$
DECLARE
  ta uuid; tb uuid; s1 uuid; s2 uuid; g1 uuid;
  c1 uuid; old_owner uuid;
BEGIN
  SELECT u.id INTO ta FROM auth.users u JOIN public._learn_actors a ON a.email = u.email WHERE a.slot = 'TA';
  SELECT u.id INTO tb FROM auth.users u JOIN public._learn_actors a ON a.email = u.email WHERE a.slot = 'TB';
  SELECT u.id INTO s1 FROM auth.users u JOIN public._learn_actors a ON a.email = u.email WHERE a.slot = 'S1';
  SELECT u.id INTO s2 FROM auth.users u JOIN public._learn_actors a ON a.email = u.email WHERE a.slot = 'S2';
  SELECT u.id INTO g1 FROM auth.users u JOIN public._learn_actors a ON a.email = u.email WHERE a.slot = 'G1';
  SELECT id INTO c1 FROM learn.classes WHERE name = 'FIXTURE C1';

  -- ---- NULL identity -------------------------------------------------
  RETURN QUERY SELECT * FROM public._learn_expect(1,
    'B01 NULL identity reading learn.classes returns 0 rows, no error',
    'authenticated', NULL, 'SELECT count(*)::text FROM learn.classes', '0');

  RETURN QUERY SELECT * FROM public._learn_expect(2,
    'B02 NULL identity reading user_profiles returns 0 rows, no error',
    'authenticated', NULL, 'SELECT count(*)::text FROM public.user_profiles', '0');

  -- ---- anon ----------------------------------------------------------
  RETURN QUERY SELECT * FROM public._learn_expect(3,
    'B03 anon reading learn.classes is DENIED at the privilege layer',
    'anon', NULL, 'SELECT count(*)::text FROM learn.classes', NULL, '42501');

  RETURN QUERY SELECT * FROM public._learn_expect(4,
    'B04 anon reading user_profiles still returns 0 rows, NOT an error (TO authenticated works)',
    'anon', NULL, 'SELECT count(*)::text FROM public.user_profiles', '0');

  -- ---- teacher / class ownership -------------------------------------
  RETURN QUERY SELECT * FROM public._learn_expect(5,
    'B05 teacher A sees exactly their own class',
    'authenticated', ta, 'SELECT count(*)::text FROM learn.classes', '1');

  RETURN QUERY SELECT * FROM public._learn_expect(6,
    'B06 teacher A sees both members of their class',
    'authenticated', ta, 'SELECT count(*)::text FROM learn.class_members', '2');

  RETURN QUERY SELECT * FROM public._learn_expect(7,
    'B07 teacher B sees NO members of teacher A''s class',
    'authenticated', tb, 'SELECT count(*)::text FROM learn.class_members', '0');

  -- ---- student -------------------------------------------------------
  RETURN QUERY SELECT * FROM public._learn_expect(8,
    'B08 student S1 sees only their OWN membership row',
    'authenticated', s1, 'SELECT count(*)::text FROM learn.class_members', '1');

  RETURN QUERY SELECT * FROM public._learn_expect(9,
    'B09 student S1 CAN see the class they belong to (proves no policy recursion)',
    'authenticated', s1, 'SELECT count(*)::text FROM learn.classes', '1');

  -- ---- D2: the narrowed profile grants --------------------------------
  RETURN QUERY SELECT * FROM public._learn_expect(10,
    'B10 🛑 student S1 CANNOT read classmate S2''s profile (D2 point 4)',
    'authenticated', s1,
    format('SELECT count(*)::text FROM public.user_profiles WHERE user_id = %L', s2), '0');

  RETURN QUERY SELECT * FROM public._learn_expect(11,
    'B11 teacher A CAN read both students'' profiles',
    'authenticated', ta,
    format('SELECT count(*)::text FROM public.user_profiles WHERE user_id IN (%L, %L)', s1, s2), '2');

  RETURN QUERY SELECT * FROM public._learn_expect(12,
    'B12 teacher B CANNOT read teacher A''s student''s profile',
    'authenticated', tb,
    format('SELECT count(*)::text FROM public.user_profiles WHERE user_id = %L', s1), '0');

  RETURN QUERY SELECT * FROM public._learn_expect(13,
    'B13 CONFIRMED guardian CAN read their child''s profile',
    'authenticated', g1,
    format('SELECT count(*)::text FROM public.user_profiles WHERE user_id = %L', s1), '1');

  RETURN QUERY SELECT * FROM public._learn_expect(14,
    'B14 🛑 PENDING guardian link grants NOTHING',
    'authenticated', g1,
    format('SELECT count(*)::text FROM public.user_profiles WHERE user_id = %L', s2), '0');

  RETURN QUERY SELECT * FROM public._learn_expect(15,
    'B15 the ORIGINAL self policy still works (regression)',
    'authenticated', s1,
    format('SELECT count(*)::text FROM public.user_profiles WHERE user_id = %L', s1), '1');

  -- ---- writes --------------------------------------------------------
  -- Truthful owner column, so the composite FK is satisfied and the ONLY
  -- thing that can reject these is RLS.
  RETURN QUERY SELECT * FROM public._learn_expect(16,
    'B16 student CANNOT add a member to a class (RLS)',
    'authenticated', s1,
    format('INSERT INTO learn.class_members (class_id, class_owner_teacher_user_id, user_id, role) '
           'VALUES (%L, %L, %L, ''student'') RETURNING ''ok''', c1, ta, g1), NULL, '42501');

  RETURN QUERY SELECT * FROM public._learn_expect(17,
    'B17 teacher B CANNOT add a member to teacher A''s class (RLS)',
    'authenticated', tb,
    format('INSERT INTO learn.class_members (class_id, class_owner_teacher_user_id, user_id, role) '
           'VALUES (%L, %L, %L, ''student'') RETURNING ''ok''', c1, ta, g1), NULL, '42501');

  -- Second, independent layer: forging the denormalised owner column to
  -- get past RLS fails on the composite FK instead.
  RETURN QUERY SELECT * FROM public._learn_expect(18,
    'B18 forging class_owner_teacher_user_id is rejected by the composite FK',
    'authenticated', tb,
    format('INSERT INTO learn.class_members (class_id, class_owner_teacher_user_id, user_id, role) '
           'VALUES (%L, %L, %L, ''student'') RETURNING ''ok''', c1, tb, g1), NULL, '23503');

  RETURN QUERY SELECT * FROM public._learn_expect(19,
    'B19 authenticated CANNOT DELETE from learn.classes (no grant at all)',
    'authenticated', ta,
    'DELETE FROM learn.classes WHERE id = ''00000000-0000-0000-0000-000000000000'' RETURNING ''ok''',
    NULL, '42501');

  RETURN QUERY SELECT * FROM public._learn_expect(20,
    'B20 🛑 guardian CANNOT self-activate a pending link',
    'authenticated', g1,
    format('UPDATE learn.guardian_links SET status = ''active'' '
           'WHERE guardian_user_id = %L AND student_user_id = %L RETURNING ''ok''', g1, s2),
    NULL, '42501');

  RETURN QUERY SELECT * FROM public._learn_expect(21,
    'B21 the STUDENT can activate their own pending guardian link',
    'authenticated', s2,
    format('UPDATE learn.guardian_links SET status = ''active'' '
           'WHERE guardian_user_id = %L AND student_user_id = %L RETURNING ''ok''', g1, s2),
    'ok');

  -- revert B20
  UPDATE learn.guardian_links SET status = 'pending'
   WHERE guardian_user_id = g1 AND student_user_id = s2;

  -- ---- derived-state consequences ------------------------------------
  UPDATE learn.class_members SET status = 'removed' WHERE class_id = c1 AND user_id = s1;
  RETURN QUERY SELECT * FROM public._learn_expect(22,
    'B22 removing a member revokes the teacher''s view of their profile',
    'authenticated', ta,
    format('SELECT count(*)::text FROM public.user_profiles WHERE user_id = %L', s1), '0');
  UPDATE learn.class_members SET status = 'active' WHERE class_id = c1 AND user_id = s1;

  UPDATE learn.classes SET status = 'archived' WHERE id = c1;
  RETURN QUERY SELECT * FROM public._learn_expect(23,
    'B23 archiving the class revokes the teacher''s view of member profiles',
    'authenticated', ta,
    format('SELECT count(*)::text FROM public.user_profiles WHERE user_id = %L', s1), '0');
  UPDATE learn.classes SET status = 'active' WHERE id = c1;

  -- ---- the denormalised owner cannot drift ---------------------------
  SELECT owner_teacher_user_id INTO old_owner FROM learn.classes WHERE id = c1;
  UPDATE learn.classes SET owner_teacher_user_id = tb WHERE id = c1;
  RETURN QUERY SELECT * FROM public._learn_expect(24,
    'B24 changing class owner CASCADES to class_members (denormalised copy cannot drift)',
    'authenticated', tb, 'SELECT count(*)::text FROM learn.class_members', '2');
  UPDATE learn.classes SET owner_teacher_user_id = old_owner WHERE id = c1;

  RETURN QUERY SELECT * FROM public._learn_expect(25,
    'B25 ... and the old owner gets the members back after the revert',
    'authenticated', ta, 'SELECT count(*)::text FROM learn.class_members', '2');
END
$run$;

-- The one result grid that matters.
SELECT * FROM public._learn_spine_behaviour() ORDER BY seq;

-- Cleanup after recording the results:
--   DROP FUNCTION public._learn_spine_behaviour();
--   DROP FUNCTION public._learn_expect(int, text, text, uuid, text, text, text);
--   DROP FUNCTION public._learn_probe(text, uuid, text);
--   DROP VIEW public._learn_actors;
--   -- fixture rows: delete as postgres, or leave them on throwaway staging
