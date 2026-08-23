-- =====================================================================
--  PRODUCTION READ-ONLY DISCOVERY SCRIPT
--  Phase 0.5A — GSAT Learning Platform
-- =====================================================================
--
--  PURPOSE
--    Collect the complete Production Supabase schema, RLS, function,
--    grant, trigger and storage metadata required to complete
--    docs/PRODUCTION_SCHEMA_AUDIT.md.
--
--  SAFETY GUARANTEE
--    *** EVERY STATEMENT IN THIS FILE IS A READ-ONLY SELECT. ***
--    - No CREATE / ALTER / DROP / INSERT / UPDATE / DELETE / TRUNCATE
--    - No GRANT / REVOKE
--    - No transaction that writes anything
--    - Reads only pg_catalog, information_schema, and storage.buckets
--    - Does NOT select any user PII (no emails, no names, no essay text)
--    You can run this against Production safely.
--
--  THIS FILE IS NOT A MIGRATION.
--    It lives in docs/discovery/ deliberately. Do not move it into
--    supabase/migrations/. Nothing here should ever be "applied".
--
--  HOW TO RUN — pick ONE
--
--    (A) Supabase Dashboard -> SQL Editor
--        Paste and run ONE query block at a time (they are delimited by
--        "-- ===== [Qnn] ... =====" markers). Export each result set.
--        Note: the Dashboard SQL Editor runs as a privileged role, so it
--        will see everything. That is what we want for discovery.
--
--    (B) psql with the Postgres connection string
--        (Dashboard -> Project Settings -> Database -> Connection string)
--
--          psql "$SUPABASE_DB_URL" \
--            -f docs/discovery/production_discovery.sql \
--            --csv > docs/discovery/output.csv 2> docs/discovery/errors.txt
--
--        or for human-readable aligned output:
--
--          psql "$SUPABASE_DB_URL" \
--            -f docs/discovery/production_discovery.sql \
--            > docs/discovery/output.txt 2>&1
--
--  IMPORTANT
--    Use a READ-ONLY database role if one exists. If not, the script is
--    still safe, but prefer the least-privileged role that can read
--    pg_catalog.
--
--  PII WARNING
--    Q22 counts rows in auth.users but NEVER selects email or metadata.
--    Do not paste raw application data back into the repo — only the
--    metadata this script returns.
--
--  Every query returns a literal "qid" column as its first field so that
--  concatenated output remains self-identifying. No psql backslash
--  commands are used, so the file works in the Dashboard SQL Editor too.
-- =====================================================================


-- =====================================================================
--  SECTION 1 — TABLE INVENTORY                              (Task 1)
-- =====================================================================

-- ===== [Q01] All tables: schema, name, owner, RLS state, size, row estimate =====
-- reltuples is a PLANNER ESTIMATE (free, no table scan). For exact counts
-- see the OPTIONAL Q30 at the end.
SELECT
  'Q01' AS qid,
  n.nspname                                   AS table_schema,
  c.relname                                   AS table_name,
  c.relkind                                   AS kind,          -- r=table, v=view, m=matview, p=partitioned
  pg_get_userbyid(c.relowner)                 AS owner,
  c.relrowsecurity                            AS rls_enabled,
  c.relforcerowsecurity                       AS rls_forced,
  CASE WHEN c.reltuples < 0 THEN NULL
       ELSE c.reltuples::bigint END           AS approx_row_estimate,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
  obj_description(c.oid, 'pg_class')          AS table_comment
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p','v','m')
  AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
ORDER BY n.nspname, c.relkind, c.relname;


-- ===== [Q02] All columns: type, nullability, defaults, identity =====
SELECT
  'Q02' AS qid,
  c.table_schema,
  c.table_name,
  c.ordinal_position                          AS pos,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.character_maximum_length                  AS max_len,
  c.numeric_precision,
  c.numeric_scale,
  c.is_nullable,
  c.column_default,
  c.is_identity,
  c.is_generated
FROM information_schema.columns c
WHERE c.table_schema NOT IN ('pg_catalog','information_schema')
ORDER BY c.table_schema, c.table_name, c.ordinal_position;


-- ===== [Q03] All constraints: PK / FK / UNIQUE / CHECK / EXCLUDE =====
-- pg_get_constraintdef() gives the exact definition including ON DELETE rules.
SELECT
  'Q03' AS qid,
  n.nspname                                   AS table_schema,
  rel.relname                                 AS table_name,
  con.conname                                 AS constraint_name,
  CASE con.contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'c' THEN 'CHECK'
    WHEN 'x' THEN 'EXCLUDE'
    ELSE con.contype::text
  END                                         AS constraint_type,
  pg_get_constraintdef(con.oid)               AS definition,
  CASE WHEN con.confrelid <> 0
       THEN confn.nspname || '.' || confrel.relname
  END                                         AS references_table
FROM pg_constraint con
JOIN pg_class rel        ON rel.oid = con.conrelid
JOIN pg_namespace n      ON n.oid = rel.relnamespace
LEFT JOIN pg_class confrel   ON confrel.oid = con.confrelid
LEFT JOIN pg_namespace confn ON confn.oid = confrel.relnamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY n.nspname, rel.relname, con.contype, con.conname;


-- ===== [Q04] All indexes (including UNIQUE INDEXes, which Q03 misses) =====
-- NOTE: unify_word_progress_tracking.sql created a UNIQUE INDEX (not a
-- constraint) using COALESCE(pack_id, ...). It will only appear HERE.
SELECT
  'Q04' AS qid,
  schemaname                                  AS table_schema,
  tablename                                   AS table_name,
  indexname                                   AS index_name,
  indexdef                                    AS definition
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog','information_schema')
ORDER BY schemaname, tablename, indexname;


-- ===== [Q05] Views and materialized views: full definition =====
-- Expect exam_statistics and blog_post_stats here if they are views.
SELECT
  'Q05' AS qid,
  n.nspname                                   AS view_schema,
  c.relname                                   AS view_name,
  c.relkind                                   AS kind,
  pg_get_viewdef(c.oid, true)                 AS definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('v','m')
  AND n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY n.nspname, c.relname;


-- ===== [Q06] Custom enum / composite types =====
SELECT
  'Q06' AS qid,
  n.nspname                                   AS type_schema,
  t.typname                                   AS type_name,
  string_agg(e.enumlabel, ' | ' ORDER BY e.enumsortorder) AS enum_values
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
JOIN pg_enum e      ON e.enumtypid = t.oid
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
GROUP BY n.nspname, t.typname
ORDER BY 2, 3;


-- =====================================================================
--  SECTION 2 — RLS AUDIT                                     (Task 2)
-- =====================================================================

-- ===== [Q07] EVERY RLS policy: command, roles, USING, WITH CHECK =====
-- This is the single most important query in this script.
SELECT
  'Q07' AS qid,
  schemaname                                  AS table_schema,
  tablename                                   AS table_name,
  policyname                                  AS policy_name,
  permissive,                                 -- PERMISSIVE vs RESTRICTIVE
  roles::text                                 AS applies_to_roles,
  cmd                                         AS command,
  qual                                        AS using_expression,
  with_check                                  AS with_check_expression
FROM pg_policies
WHERE schemaname NOT IN ('pg_catalog','information_schema')
ORDER BY schemaname, tablename, cmd, policyname;


-- ===== [Q08] DANGER: tables in public with RLS DISABLED =====
-- Any row here that is an application table is exposed to every client
-- that holds the anon key (subject to Q10 grants).
SELECT
  'Q08' AS qid,
  n.nspname                                   AS table_schema,
  c.relname                                   AS table_name,
  c.relrowsecurity                            AS rls_enabled,
  'RLS DISABLED — VERIFY EXPOSURE'            AS flag
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p')
  AND n.nspname = 'public'
  AND c.relrowsecurity = false
ORDER BY c.relname;


-- ===== [Q09] DANGER: tables with RLS ENABLED but ZERO policies =====
-- RLS on + no policy = deny-all for non-owners. Usually a mistake:
-- either the feature is silently broken, or writes go through a
-- SECURITY DEFINER function that bypasses the intended check.
SELECT
  'Q09' AS qid,
  n.nspname                                   AS table_schema,
  c.relname                                   AS table_name,
  'RLS ENABLED BUT NO POLICIES'               AS flag
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p')
  AND n.nspname NOT IN ('pg_catalog','information_schema')
  AND c.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = n.nspname AND p.tablename = c.relname
  )
ORDER BY n.nspname, c.relname;


-- ===== [Q10] CRITICAL: table-level grants to anon / authenticated =====
-- RLS is irrelevant if the role has no grant, and RLS is the ONLY thing
-- standing between anon and the data if the grant exists. Read Q07 and
-- Q10 together — never separately.
SELECT
  'Q10' AS qid,
  table_schema,
  table_name,
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE grantee IN ('anon','authenticated','public','service_role')
  AND table_schema NOT IN ('pg_catalog','information_schema')
GROUP BY table_schema, table_name, grantee
ORDER BY table_schema, table_name, grantee;


-- ===== [Q11] Column-level grants to anon / authenticated (rarer, but checked) =====
SELECT
  'Q11' AS qid,
  table_schema, table_name, column_name, grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.column_privileges
WHERE grantee IN ('anon','authenticated','public')
  AND table_schema NOT IN ('pg_catalog','information_schema')
GROUP BY table_schema, table_name, column_name, grantee
ORDER BY table_schema, table_name, column_name, grantee;


-- ===== [Q12] Default privileges (what NEW objects will inherit) =====
SELECT
  'Q12' AS qid,
  n.nspname                                   AS schema_name,
  pg_get_userbyid(d.defaclrole)               AS granting_role,
  d.defaclobjtype                             AS object_type,  -- r=table, f=function, S=sequence
  d.defaclacl::text                           AS default_acl
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
ORDER BY 2, 3;


-- =====================================================================
--  SECTION 3 — FUNCTION / RPC AUDIT                          (Task 3)
-- =====================================================================

-- ===== [Q13] All functions: signature, security, search_path, ACL =====
-- prosecdef = true  -> SECURITY DEFINER (runs as owner, bypasses caller RLS)
-- proconfig NULL    -> NO "SET search_path" -> mutable search_path.
--                      For SECURITY DEFINER functions this is a known
--                      privilege-escalation vector and is flagged by
--                      Supabase's own linter (function_search_path_mutable).
SELECT
  'Q13' AS qid,
  n.nspname                                   AS function_schema,
  p.proname                                   AS function_name,
  pg_get_function_identity_arguments(p.oid)   AS arguments,
  pg_get_function_result(p.oid)               AS return_type,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER'
       ELSE 'SECURITY INVOKER' END            AS security_mode,
  pg_get_userbyid(p.proowner)                 AS owner,
  COALESCE(p.proconfig::text, '(none)')       AS proconfig_search_path,
  COALESCE(p.proacl::text, '(default: PUBLIC EXECUTE)') AS execute_acl,
  l.lanname                                   AS language,
  p.provolatile                               AS volatility
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l  ON l.oid = p.prolang
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY n.nspname, p.proname, arguments;


-- ===== [Q14] FULL SOURCE of every public function =====
-- This is how we determine definitively which claim_pack_with_token
-- version is live, and whether admin_grant_premium checks authorization.
SELECT
  'Q14' AS qid,
  n.nspname                                   AS function_schema,
  p.proname                                   AS function_name,
  pg_get_function_identity_arguments(p.oid)   AS arguments,
  p.prosecdef                                 AS is_security_definer,
  pg_get_functiondef(p.oid)                   AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname, arguments;


-- ===== [Q15] TARGETED: the five functions named in the audit =====
-- Includes overload detection. If claim_pack_with_token returns TWO rows,
-- the 1-arg / 2-arg ambiguity documented in PLATFORM_AUDIT.md C2 is real.
SELECT
  'Q15' AS qid,
  p.proname                                   AS function_name,
  pg_get_function_identity_arguments(p.oid)   AS arguments,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security_mode,
  COALESCE(p.proconfig::text,'(no search_path)') AS proconfig,
  COALESCE(p.proacl::text,'(default: PUBLIC EXECUTE)') AS execute_acl,
  -- Quick heuristic: does the body reference an authorization check?
  -- CAVEAT: for the function `is_admin` itself this is trivially TRUE
  -- (the name appears in its own definition). Ignore that one row and
  -- always confirm against full_definition below.
  (pg_get_functiondef(p.oid) ILIKE '%is_admin%')      AS body_mentions_is_admin,
  (pg_get_functiondef(p.oid) ILIKE '%auth.uid%')      AS body_mentions_auth_uid,
  (pg_get_functiondef(p.oid) ILIKE '%is_premium_member%') AS body_mentions_premium_check,
  (pg_get_functiondef(p.oid) ILIKE '%site%')          AS body_mentions_site,
  pg_get_functiondef(p.oid)                   AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'is_admin',
    'admin_grant_premium',
    'admin_revoke_premium',
    'claim_pack_with_token',
    'is_premium_member',
    'generate_short_token',
    'upsert_user_profile',
    'get_user_profile',
    'admin_get_all_users',
    'admin_get_user_stats',
    'update_user_streak',
    'get_user_stats',
    'upsert_word_progress',
    'get_all_word_progress',
    'update_pack_item_progress',
    'get_pack_statistics',
    'get_weak_words'
  )
ORDER BY p.proname, arguments;


-- ===== [Q16] Function EXECUTE privileges for anon / authenticated =====
-- A SECURITY DEFINER function with EXECUTE granted to `authenticated`
-- and no internal admin check is a privilege-escalation primitive.
SELECT
  'Q16' AS qid,
  r.routine_schema,
  r.routine_name,
  r.grantee,
  r.privilege_type,
  p.prosecdef                                 AS is_security_definer
FROM information_schema.routine_privileges r
LEFT JOIN pg_proc p      ON p.proname = r.routine_name
LEFT JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = r.routine_schema
WHERE r.grantee IN ('anon','authenticated','public')
  AND r.routine_schema NOT IN ('pg_catalog','information_schema')
ORDER BY r.routine_schema, r.routine_name, r.grantee;


-- ===== [Q17] All triggers (including any on auth.users) =====
SELECT
  'Q17' AS qid,
  n.nspname                                   AS table_schema,
  c.relname                                   AS table_name,
  t.tgname                                    AS trigger_name,
  CASE WHEN t.tgenabled = 'D' THEN 'DISABLED' ELSE 'ENABLED' END AS status,
  pg_get_triggerdef(t.oid)                    AS definition
FROM pg_trigger t
JOIN pg_class c     ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY n.nspname, c.relname, t.tgname;


-- =====================================================================
--  SECTION 4 — AUTH / IDENTITY MODEL                         (Task 4)
-- =====================================================================

-- ===== [Q18] EVERY foreign key that points at auth.users =====
-- This defines the complete identity graph of the application.
SELECT
  'Q18' AS qid,
  n.nspname                                   AS referencing_schema,
  rel.relname                                 AS referencing_table,
  con.conname                                 AS constraint_name,
  pg_get_constraintdef(con.oid)               AS definition
FROM pg_constraint con
JOIN pg_class rel        ON rel.oid = con.conrelid
JOIN pg_namespace n      ON n.oid = rel.relnamespace
JOIN pg_class confrel    ON confrel.oid = con.confrelid
JOIN pg_namespace confn  ON confn.oid = confrel.relnamespace
WHERE con.contype = 'f'
  AND confn.nspname = 'auth'
  AND confrel.relname = 'users'
ORDER BY n.nspname, rel.relname;


-- ===== [Q19] Search for any pre-existing role / teacher / class / parent concept =====
-- Confirms (or refutes) the audit claim that these do not exist yet.
SELECT
  'Q19' AS qid,
  n.nspname                                   AS table_schema,
  c.relname                                   AS table_name,
  c.relkind                                   AS kind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p','v','m')
  AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
  AND (
       c.relname ILIKE '%role%'      OR c.relname ILIKE '%teacher%'
    OR c.relname ILIKE '%class%'     OR c.relname ILIKE '%student%'
    OR c.relname ILIKE '%parent%'    OR c.relname ILIKE '%guardian%'
    OR c.relname ILIKE '%assignment%'OR c.relname ILIKE '%homework%'
    OR c.relname ILIKE '%enroll%'    OR c.relname ILIKE '%roster%'
    OR c.relname ILIKE '%member%'    OR c.relname ILIKE '%permission%'
    OR c.relname ILIKE '%organization%' OR c.relname ILIKE '%school%'
    OR c.relname ILIKE '%tenant%'    OR c.relname ILIKE '%group%'
  )
ORDER BY 2, 3;


-- ===== [Q20] Any column that looks like a role/permission discriminator =====
SELECT
  'Q20' AS qid,
  table_schema, table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog','information_schema')
  AND (
       column_name ILIKE '%role%'     OR column_name ILIKE '%is_admin%'
    OR column_name ILIKE '%teacher%'  OR column_name ILIKE '%student%'
    OR column_name ILIKE '%parent%'   OR column_name ILIKE '%guardian%'
    OR column_name ILIKE '%class_id%' OR column_name ILIKE '%permission%'
  )
ORDER BY 2, 3, 4;


-- ===== [Q21] Does app_admins actually exist? What is in it (ids only)? =====
-- Structure only — see Q02/Q07 for columns and policies.
SELECT
  'Q21' AS qid,
  EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='app_admins'
  ) AS app_admins_table_exists;


-- ===== [Q22] Identity volume (NO PII — counts only) =====
-- Do NOT extend this query to select email / raw_user_meta_data.
SELECT
  'Q22' AS qid,
  (SELECT count(*) FROM auth.users)                              AS auth_users_total,
  (SELECT count(*) FROM auth.users WHERE last_sign_in_at IS NOT NULL) AS users_ever_signed_in,
  (SELECT count(*) FROM auth.identities)                         AS auth_identities_total;


-- ===== [Q23] Auth providers actually in use (no PII) =====
SELECT
  'Q23' AS qid,
  provider,
  count(*) AS identity_count
FROM auth.identities
GROUP BY provider
ORDER BY 3 DESC;


-- =====================================================================
--  SECTION 5 — STORAGE AUDIT                                 (Task 5)
-- =====================================================================

-- ===== [Q24] All storage buckets: public flag, limits, allowed MIME types =====
SELECT
  'Q24' AS qid,
  id                                          AS bucket_id,
  name                                        AS bucket_name,
  public                                      AS is_public,
  file_size_limit,
  allowed_mime_types,
  created_at,
  updated_at
FROM storage.buckets
ORDER BY id;


-- ===== [Q25] Storage RLS policies (these live on storage.objects) =====
SELECT
  'Q25' AS qid,
  schemaname, tablename, policyname,
  permissive, roles::text AS applies_to_roles, cmd AS command,
  qual AS using_expression, with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY tablename, cmd, policyname;


-- ===== [Q26] Object counts + path conventions per bucket (NO file contents) =====
-- Reveals the folder convention actually in use, e.g. "<pack_id>/<item_id>_word.mp3".
SELECT
  'Q26' AS qid,
  bucket_id,
  count(*)                                    AS object_count,
  pg_size_pretty(COALESCE(sum((metadata->>'size')::bigint),0)) AS total_bytes,
  min(created_at)                             AS earliest_object,
  max(created_at)                             AS latest_object,
  (array_agg(name ORDER BY created_at DESC))[1:5] AS five_most_recent_paths
FROM storage.objects
GROUP BY bucket_id
ORDER BY bucket_id;


-- =====================================================================
--  SECTION 6 — WRITING APPLICATION DISCOVERY                 (Task 6)
-- =====================================================================
--  The writing app shares this database. Its schema is NOT in this repo.
--  These queries are deliberately broad — cast a wide net, then triage.

-- ===== [Q27] Tables whose NAME suggests writing / essay / AI grading =====
SELECT
  'Q27' AS qid,
  n.nspname                                   AS table_schema,
  c.relname                                   AS table_name,
  c.relkind                                   AS kind,
  c.relrowsecurity                            AS rls_enabled,
  CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint END AS approx_rows,
  obj_description(c.oid,'pg_class')           AS comment
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p','v','m')
  AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
  AND (
       c.relname ILIKE '%writ%'      OR c.relname ILIKE '%essay%'
    OR c.relname ILIKE '%submission%'OR c.relname ILIKE '%draft%'
    OR c.relname ILIKE '%feedback%'  OR c.relname ILIKE '%grading%'
    OR c.relname ILIKE '%grade%'     OR c.relname ILIKE '%rubric%'
    OR c.relname ILIKE '%score%'     OR c.relname ILIKE '%revision%'
    OR c.relname ILIKE '%correction%'OR c.relname ILIKE '%prompt%'
    OR c.relname ILIKE '%ai_%'       OR c.relname ILIKE '%llm%'
    OR c.relname ILIKE '%review%'    OR c.relname ILIKE '%comment%'
  )
ORDER BY 2, 3;


-- ===== [Q28] Columns whose NAME suggests writing content / AI feedback =====
-- Catches writing tables that do NOT have an obvious table name.
SELECT
  'Q28' AS qid,
  table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog','information_schema')
  AND (
       column_name ILIKE '%essay%'      OR column_name ILIKE '%writing%'
    OR column_name ILIKE '%content%'    OR column_name ILIKE '%body%'
    OR column_name ILIKE '%rubric%'     OR column_name ILIKE '%feedback%'
    OR column_name ILIKE '%ai_%'        OR column_name ILIKE '%model%'
    OR column_name ILIKE '%prompt%'     OR column_name ILIKE '%submission%'
    OR column_name ILIKE '%word_count%' OR column_name ILIKE '%highlight%'
    OR column_name ILIKE '%suggestion%' OR column_name ILIKE '%revision%'
    OR column_name ILIKE '%teacher%'    OR column_name ILIKE '%graded%'
  )
ORDER BY 2, 3, 4;


-- ===== [Q29] Tables NOT accounted for by the GSAT repository =====
-- Anything returned here that is not in the known-GSAT list is a strong
-- candidate for belonging to the writing application (or another app).
SELECT
  'Q29' AS qid,
  c.relname                                   AS table_name,
  c.relkind                                   AS kind,
  c.relrowsecurity                            AS rls_enabled,
  CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint END AS approx_rows,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
  'NOT REFERENCED BY GSAT REPOSITORY'         AS note
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p','v','m')
  AND n.nspname = 'public'
  AND c.relname NOT IN (
    -- Tables the GSAT repository is known to reference (PLATFORM_AUDIT.md §2)
    'packs','pack_items','pack_images','pack_item_progress',
    'invite_tokens','user_pack_claims',
    'user_profiles','user_stats','user_word_progress','level_words',
    'premium_memberships','push_subscriptions','app_admins','site_settings',
    'exams','vocabulary_questions','question_groups','group_questions',
    'translation_questions','essay_questions','exam_attempts',
    'exam_user_answers','exam_statistics',
    'blog_posts','blog_categories','blog_likes','blog_bookmarks',
    'blog_shares','blog_page_views','blog_post_stats'
  )
ORDER BY c.relname;


-- ===== [Q30] Was Supabase CLI migration tracking ever used? =====
-- If this table exists and has rows, there IS an authoritative migration
-- order, which resolves the claim_pack_with_token ambiguity (C1).
SELECT
  'Q30' AS qid,
  EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='supabase_migrations' AND c.relname='schema_migrations'
  ) AS cli_migration_table_exists;

-- If Q30 returned true, ALSO run this:
-- SELECT 'Q30b' AS qid, version, name FROM supabase_migrations.schema_migrations ORDER BY version;


-- ===== [Q31] Installed extensions (context: pg_cron, pg_net, vector, etc.) =====
SELECT
  'Q31' AS qid,
  e.extname                                   AS extension,
  e.extversion                                AS version,
  n.nspname                                   AS schema
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
ORDER BY 2;


-- =====================================================================
--  SECTION 7 — OPTIONAL: EXACT ROW COUNTS
-- =====================================================================
--  Still read-only, but performs sequential scans. On a small project
--  this is instant. Skip if any table is very large.
--
--  Run this ONLY if you want exact counts to confirm which tables are
--  actually dead (the audit predicts exam_attempts and exam_user_answers
--  are EMPTY — this is how we prove it).
--
--  SELECT 'Q32' AS qid, 'exam_attempts'     AS t, count(*) FROM exam_attempts
--  UNION ALL SELECT 'Q32','exam_user_answers',   count(*) FROM exam_user_answers
--  UNION ALL SELECT 'Q32','exams',               count(*) FROM exams
--  UNION ALL SELECT 'Q32','essay_questions',     count(*) FROM essay_questions
--  UNION ALL SELECT 'Q32','user_word_progress',  count(*) FROM user_word_progress
--  UNION ALL SELECT 'Q32','pack_item_progress',  count(*) FROM pack_item_progress
--  UNION ALL SELECT 'Q32','user_profiles',       count(*) FROM user_profiles
--  UNION ALL SELECT 'Q32','premium_memberships', count(*) FROM premium_memberships
--  UNION ALL SELECT 'Q32','invite_tokens',       count(*) FROM invite_tokens
--  UNION ALL SELECT 'Q32','app_admins',          count(*) FROM app_admins
--  UNION ALL SELECT 'Q32','site_settings',       count(*) FROM site_settings
--  ORDER BY 2;


-- =====================================================================
--  SECTION 8 — OPTIONAL: PREMIUM GRANT INTEGRITY CHECK
-- =====================================================================
--  Read-only. Relevant to security finding S1 (admin_grant_premium has
--  no authorization check in the repository version). If the live
--  function is also unchecked, rows where granted_by IS NULL or where
--  granted_by <> the user's own admin identity may indicate self-grants.
--
--  This SELECTs ids and timestamps only — no PII.
--
--  SELECT 'Q33' AS qid, id, user_id, granted_by, is_active,
--         (granted_by IS NULL)          AS granted_by_missing,
--         (granted_by = user_id)        AS self_granted,
--         granted_at, expires_at, notes
--  FROM premium_memberships
--  ORDER BY granted_at DESC;


-- =====================================================================
--  END OF SCRIPT — nothing above this line modifies anything.
-- =====================================================================
