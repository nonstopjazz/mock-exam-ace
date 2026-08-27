-- =====================================================================
--  /learn identity spine — STRUCTURAL verification
--
--  Returns ALL checks in ONE result set. The Supabase SQL Editor
--  displays only the last statement's grid, so a script of 26 separate
--  SELECTs would hide 25 of them -- an A1 lesson, learned the hard way.
--
--  These are CATALOG checks: they prove the objects, privileges and
--  policies are shaped as intended. They do NOT prove behaviour.
--  Behaviour is learn-identity-spine-BEHAVIOUR.sql, and both are
--  required -- the privilege layer and the RLS layer are independent,
--  and during A1 a REVOKE block silently failed to apply twice while
--  every functional signal still looked correct.
--
--  Run as the SQL Editor's privileged role. SECURITY INVOKER.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._learn_spine_verify()
RETURNS TABLE (seq int, test text, detail text, status text)
LANGUAGE sql
STABLE
AS $fn$

SELECT 1, 'V01 schema learn exists',
       (SELECT count(*)::text FROM pg_namespace WHERE nspname = 'learn'),
       CASE WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'learn')
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 2, 'V02 anon has NO USAGE on schema learn',
       has_schema_privilege('anon', 'learn', 'USAGE')::text,
       CASE WHEN NOT has_schema_privilege('anon', 'learn', 'USAGE')
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 3, 'V03 anon has NO CREATE on schema learn',
       has_schema_privilege('anon', 'learn', 'CREATE')::text,
       CASE WHEN NOT has_schema_privilege('anon', 'learn', 'CREATE')
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 4, 'V04 authenticated HAS USAGE on schema learn',
       has_schema_privilege('authenticated', 'learn', 'USAGE')::text,
       CASE WHEN has_schema_privilege('authenticated', 'learn', 'USAGE')
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 5, 'V05 PUBLIC has no USAGE/CREATE on schema learn',
       has_schema_privilege('public', 'learn', 'USAGE')::text || ' / ' ||
       has_schema_privilege('public', 'learn', 'CREATE')::text,
       CASE WHEN NOT has_schema_privilege('public', 'learn', 'USAGE')
             AND NOT has_schema_privilege('public', 'learn', 'CREATE')
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 6, 'V06 exactly 3 tables in learn (classes, class_members, guardian_links)',
       (SELECT coalesce(string_agg(c.relname, ', ' ORDER BY c.relname), '(none)')
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'learn' AND c.relkind = 'r'),
       CASE WHEN (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = 'learn' AND c.relkind = 'r') = 3
             AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = 'learn' AND c.relkind = 'r'
                     AND c.relname IN ('classes','class_members','guardian_links')) = 3
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 7, 'V07 every table in learn has RLS ENABLED',
       (SELECT coalesce(string_agg(c.relname, ', '), '(none)')
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'learn' AND c.relkind = 'r' AND NOT c.relrowsecurity),
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'learn' AND c.relkind = 'r' AND NOT c.relrowsecurity)
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 8, 'V08 no table in learn has RLS on with zero policies (deny-all trap)',
       (SELECT coalesce(string_agg(c.relname, ', '), '(none)')
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'learn' AND c.relkind = 'r'
           AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)),
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'learn' AND c.relkind = 'r'
                 AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid))
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 9, 'V09 every policy in learn is TO authenticated ONLY',
       (SELECT coalesce(string_agg(p.polname, ', '), '(none deviate)')
          FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'learn'
           AND p.polroles <> ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')]::oid[]),
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'learn'
                 AND p.polroles <> ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')]::oid[])
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 10, 'V10 anon has NO privilege on any learn table',
       (SELECT coalesce(string_agg(c.relname || ':' || pv.priv, ', '), '(none)')
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES')) pv(priv)
         WHERE n.nspname = 'learn' AND c.relkind = 'r'
           AND has_table_privilege('anon', c.oid, pv.priv)),
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES')) pv(priv)
               WHERE n.nspname = 'learn' AND c.relkind = 'r'
                 AND has_table_privilege('anon', c.oid, pv.priv))
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 11, 'V11 authenticated HAS SELECT/INSERT/UPDATE on all 3 tables',
       (SELECT count(*)::text || ' of 9'
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE')) pv(priv)
         WHERE n.nspname = 'learn' AND c.relkind = 'r'
           AND has_table_privilege('authenticated', c.oid, pv.priv)),
       CASE WHEN (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE')) pv(priv)
                   WHERE n.nspname = 'learn' AND c.relkind = 'r'
                     AND has_table_privilege('authenticated', c.oid, pv.priv)) = 9
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 12, 'V12 authenticated has NO DELETE on any learn table',
       (SELECT coalesce(string_agg(c.relname, ', '), '(none)')
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'learn' AND c.relkind = 'r'
           AND has_table_privilege('authenticated', c.oid, 'DELETE')),
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'learn' AND c.relkind = 'r'
                 AND has_table_privilege('authenticated', c.oid, 'DELETE'))
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 13, 'V13 no function of any kind in schema learn',
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'learn'),
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE n.nspname = 'learn')
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 14, 'V14 no ALTER DEFAULT PRIVILEGES on schema learn (new tables fail closed)',
       (SELECT count(*)::text FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
         WHERE n.nspname = 'learn'),
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
                              WHERE n.nspname = 'learn')
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 15, 'V15 class_members composite FK -> classes(id, owner) ON UPDATE CASCADE',
       (SELECT coalesce(string_agg(con.conname || ' upd=' || con.confupdtype::text || ' del=' || con.confdeltype::text, ', '), '(missing)')
          FROM pg_constraint con
         WHERE con.conrelid = 'learn.class_members'::regclass
           AND con.contype = 'f'
           AND con.confrelid = 'learn.classes'::regclass),
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_constraint con
               WHERE con.conrelid = 'learn.class_members'::regclass
                 AND con.contype = 'f'
                 AND con.confrelid = 'learn.classes'::regclass
                 AND array_length(con.conkey, 1) = 2
                 AND con.confupdtype = 'c'
                 AND con.confdeltype = 'c')
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 16, 'V16 classes.owner_teacher_user_id FK -> auth.users ON DELETE RESTRICT',
       (SELECT coalesce(string_agg(con.conname || ' del=' || con.confdeltype::text, ', '), '(missing)')
          FROM pg_constraint con
         WHERE con.conrelid = 'learn.classes'::regclass AND con.contype = 'f'
           AND con.confrelid = 'auth.users'::regclass),
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_constraint con
               WHERE con.conrelid = 'learn.classes'::regclass AND con.contype = 'f'
                 AND con.confrelid = 'auth.users'::regclass AND con.confdeltype = 'r')
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 17, 'V17 exactly 4 FKs in learn point at auth.users (classes.owner, members.user_id, guardian x2)',
       (SELECT count(*)::text FROM pg_constraint con
         WHERE con.connamespace = 'learn'::regnamespace AND con.contype = 'f'
           AND con.confrelid = 'auth.users'::regclass),
       CASE WHEN (SELECT count(*) FROM pg_constraint con
                   WHERE con.connamespace = 'learn'::regnamespace AND con.contype = 'f'
                     AND con.confrelid = 'auth.users'::regclass) = 4
            THEN 'PASS' ELSE 'FAIL' END

-- to_regclass, not ::regclass: public.users is an LMS table and does not
-- exist on staging at all, where a hard cast would abort the whole script.
-- When it is absent the check is VACUOUS, and the detail column says so
-- rather than reporting a bare 0 that would read as real evidence.
UNION ALL SELECT 18, 'V18 NO foreign key in learn references public.users',
       CASE WHEN to_regclass('public.users') IS NULL
            THEN '(public.users does not exist here - check is vacuous)'
            ELSE (SELECT count(*)::text FROM pg_constraint con
                   WHERE con.connamespace = 'learn'::regnamespace AND con.contype = 'f'
                     AND con.confrelid = to_regclass('public.users'))
       END,
       CASE WHEN to_regclass('public.users') IS NULL
             OR NOT EXISTS (SELECT 1 FROM pg_constraint con
                             WHERE con.connamespace = 'learn'::regnamespace AND con.contype = 'f'
                               AND con.confrelid = to_regclass('public.users'))
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 19, 'V19 no column named student_id anywhere in schema learn',
       (SELECT coalesce(string_agg(c.relname || '.' || a.attname, ', '), '(none)')
          FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'learn' AND c.relkind = 'r'
           AND a.attnum > 0 AND NOT a.attisdropped AND a.attname = 'student_id'),
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'learn' AND c.relkind = 'r'
                 AND a.attnum > 0 AND NOT a.attisdropped AND a.attname = 'student_id')
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 20, 'V20 every *_user_id column in learn is uuid',
       (SELECT coalesce(string_agg(c.relname || '.' || a.attname || ':' || format_type(a.atttypid, NULL), ', '), '(none deviate)')
          FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'learn' AND c.relkind = 'r'
           AND a.attnum > 0 AND NOT a.attisdropped
           AND a.attname LIKE '%\_user\_id'
           AND a.atttypid <> 'uuid'::regtype),
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'learn' AND c.relkind = 'r'
                 AND a.attnum > 0 AND NOT a.attisdropped
                 AND a.attname LIKE '%\_user\_id' AND a.atttypid <> 'uuid'::regtype)
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 21, 'V21 the 3 expected UNIQUE constraints exist',
       (SELECT count(*)::text || ' of 3'
          FROM pg_constraint con
         WHERE con.contype = 'u'
           AND con.conname IN ('classes_id_owner_key','class_members_class_user_key','guardian_links_pair_key')),
       CASE WHEN (SELECT count(*) FROM pg_constraint con
                   WHERE con.contype = 'u'
                     AND con.conname IN ('classes_id_owner_key','class_members_class_user_key','guardian_links_pair_key')) = 3
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 22, 'V22 the 3 ORIGINAL user_profiles policies are still present and unmodified',
       (SELECT coalesce(string_agg(p.polname, ' | ' ORDER BY p.polname), '(missing)')
          FROM pg_policy p
         WHERE p.polrelid = 'public.user_profiles'::regclass
           AND p.polname IN ('Users can view own profile','Users can insert own profile','Users can update own profile')),
       CASE WHEN (SELECT count(*) FROM pg_policy p
                   WHERE p.polrelid = 'public.user_profiles'::regclass
                     AND p.polname IN ('Users can view own profile','Users can insert own profile','Users can update own profile')) = 3
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 23, 'V23 the 2 NEW user_profiles policies exist and are TO authenticated ONLY',
       (SELECT coalesce(string_agg(p.polname || ' roles=' ||
                 (SELECT coalesce(string_agg(r.rolname, '+'), 'PUBLIC')
                    FROM pg_roles r WHERE r.oid = ANY (p.polroles)), ' | '), '(missing)')
          FROM pg_policy p
         WHERE p.polrelid = 'public.user_profiles'::regclass
           AND p.polname IN ('user_profiles_select_by_class_owner','user_profiles_select_by_guardian')),
       CASE WHEN (SELECT count(*) FROM pg_policy p
                   WHERE p.polrelid = 'public.user_profiles'::regclass
                     AND p.polname IN ('user_profiles_select_by_class_owner','user_profiles_select_by_guardian')
                     AND p.polcmd = 'r'
                     AND p.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')]::oid[]) = 2
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 24, 'V24 user_profiles has EXACTLY 5 policies (3 original + 2 new, nothing else)',
       (SELECT count(*)::text FROM pg_policy p WHERE p.polrelid = 'public.user_profiles'::regclass),
       CASE WHEN (SELECT count(*) FROM pg_policy p WHERE p.polrelid = 'public.user_profiles'::regclass) = 5
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 25, 'V25 each NEW user_profiles policy is anchored on an owner or guardian predicate (D2 point 4)',
       (SELECT coalesce(string_agg(p.polname, ', '), '(none)')
          FROM pg_policy p
         WHERE p.polrelid = 'public.user_profiles'::regclass
           AND p.polname IN ('user_profiles_select_by_class_owner','user_profiles_select_by_guardian')
           AND pg_get_expr(p.polqual, p.polrelid) NOT LIKE '%owner_teacher_user_id%'
           AND pg_get_expr(p.polqual, p.polrelid) NOT LIKE '%guardian_user_id%'),
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_policy p
               WHERE p.polrelid = 'public.user_profiles'::regclass
                 AND p.polname IN ('user_profiles_select_by_class_owner','user_profiles_select_by_guardian')
                 AND pg_get_expr(p.polqual, p.polrelid) NOT LIKE '%owner_teacher_user_id%'
                 AND pg_get_expr(p.polqual, p.polrelid) NOT LIKE '%guardian_user_id%')
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT 26, 'V26 the 6 expected indexes on learn.* exist',
       (SELECT count(*)::text || ' of 6'
          FROM pg_indexes
         WHERE schemaname = 'learn'
           AND indexname IN ('idx_classes_owner','idx_class_members_user','idx_class_members_owner',
                             'idx_class_members_class_owner','idx_guardian_links_student','idx_guardian_links_guardian')),
       CASE WHEN (SELECT count(*) FROM pg_indexes
                   WHERE schemaname = 'learn'
                     AND indexname IN ('idx_classes_owner','idx_class_members_user','idx_class_members_owner',
                                       'idx_class_members_class_owner','idx_guardian_links_student','idx_guardian_links_guardian')) = 6
            THEN 'PASS' ELSE 'FAIL' END

ORDER BY 1
$fn$;

-- The one result grid that matters.
SELECT * FROM public._learn_spine_verify();

-- Cleanup after recording the results:
--   DROP FUNCTION public._learn_spine_verify();
