-- =====================================================================
--  PRODUCTION READ-ONLY DISCOVERY — ROUND 2
--  Phase 0.5A follow-up, targeting only the gaps left after round 1
-- =====================================================================
--
--  ROUND 1 (Q15, Q07, Q10, Q19, Q29) resolved:
--    - which claim_pack_with_token is live  (premium version; p_site ignored)
--    - admin_grant_premium / admin_revoke_premium have no auth check
--    - invite_tokens is anon-enumerable
--    - site_settings UPDATE is admin-gated  (good news)
--    - the writing app = essay_submissions + the `essays` bucket
--    - 11 tables run with RLS DISABLED and full anon grants
--
--  ROUND 2 answers what is still blocking Phase 1. Ordered by priority.
--
--  *** EVERY STATEMENT IS A READ-ONLY SELECT. ***
--  Reads pg_catalog, information_schema, storage.buckets/objects only.
--  Selects NO user PII: no emails, no names, no essay text, no file bodies.
--  This file is NOT a migration. Never apply it.
--
--  HOW TO RUN: same as round 1 — see docs/discovery/README.md
-- =====================================================================


-- =====================================================================
--  PRIORITY 1 — THE FOUR QUESTIONS THAT UNBLOCK THE MOST
-- =====================================================================

-- ===== [R01] 🔴 RLS enabled/disabled for EVERY public table =====
-- Round 1 gave RLS state only for tables the GSAT repo does NOT reference.
-- We still cannot assert that any GSAT table is actually protected, because
-- a policy on a table with RLS DISABLED is inert. This settles it, and
-- cross-references the policy count.
SELECT
  'R01' AS qid,
  c.relname                                   AS table_name,
  c.relrowsecurity                            AS rls_enabled,
  c.relforcerowsecurity                       AS rls_forced,
  (SELECT count(*) FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename=c.relname) AS policy_count,
  CASE
    WHEN NOT c.relrowsecurity THEN '*** RLS OFF — PUBLICLY READ/WRITABLE ***'
    WHEN c.relrowsecurity AND (SELECT count(*) FROM pg_policies p
      WHERE p.schemaname='public' AND p.tablename=c.relname) = 0
      THEN 'RLS on, no policies — deny-all'
    ELSE 'ok'
  END                                         AS verdict,
  CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint END AS approx_rows,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname = 'public'
ORDER BY c.relrowsecurity ASC, c.relname;


-- ===== [R02] 🔴 FULL column list for the writing application =====
-- Decides whether essay_submissions can be reused additively (Phase 5).
-- Looking for: student_id type (text vs uuid), essay body column, AI
-- feedback / rubric / score columns, teacher feedback, revision tracking,
-- and any link to essay_questions or assignments.
SELECT
  'R02' AS qid,
  table_name,
  ordinal_position                            AS pos,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('essay_submissions','essay_questions')
ORDER BY table_name, ordinal_position;


-- ===== [R03] 🔴 FULL column list for the 22 unaccounted tables =====
-- Identifies which application owns them and whether Domain B can reuse
-- them instead of building a parallel assignment system.
SELECT
  'R03' AS qid,
  table_name,
  ordinal_position                            AS pos,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'users','assignments','assignment_submissions','student_tasks',
    'courses','course_lessons','user_course_access','user_lesson_progress',
    'learning_progress_stats','vocabulary_sessions','exam_records','exam_types',
    'course_requests','notifications','admin_course_reminders',
    'user_reminder_preferences','reminder_logs','tokens',
    'file_download_logs','grammar_tags','blog_comments'
  )
ORDER BY table_name, ordinal_position;


-- ===== [R04] 🔴 Storage buckets — public flag decides the essays fix =====
-- If `essays` has public = true, object-level SELECT policies are bypassed
-- for reads and the bucket flag itself must change. Also reveals whether
-- pack-audio / exam-images are public (they have NO policies in round 1).
SELECT
  'R04' AS qid,
  id                                          AS bucket_id,
  public                                      AS is_public,
  file_size_limit,
  allowed_mime_types,
  created_at
FROM storage.buckets
ORDER BY id;


-- =====================================================================
--  PRIORITY 2 — IDENTITY MODEL (Phase 1 design inputs)
-- =====================================================================

-- ===== [R05] Every foreign key in public — the full relational graph =====
-- Answers: does essay_submissions FK auth.users or public.users? Do the
-- assignment tables FK anything? What is public.users actually linked to?
SELECT
  'R05' AS qid,
  rel.relname                                 AS table_name,
  con.conname                                 AS constraint_name,
  pg_get_constraintdef(con.oid)               AS definition
FROM pg_constraint con
JOIN pg_class rel   ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'f'
ORDER BY rel.relname, con.conname;


-- ===== [R06] public.users vs auth.users — structure and overlap (NO PII) =====
-- Counts and id-overlap only. Do NOT extend this to select emails.
SELECT 'R06' AS qid, 'auth.users'   AS source, count(*) AS row_count FROM auth.users
UNION ALL
SELECT 'R06', 'public.users',        count(*) FROM public.users
UNION ALL
SELECT 'R06', 'user_profiles',       count(*) FROM public.user_profiles
UNION ALL
SELECT 'R06', 'app_admins',          count(*) FROM public.app_admins;


-- ===== [R07] Triggers anywhere in public or auth =====
-- Is there already an auth.users -> user_profiles auto-provisioning trigger?
-- Phase 1 item C1 depends entirely on this answer.
SELECT
  'R07' AS qid,
  n.nspname                                   AS table_schema,
  c.relname                                   AS table_name,
  t.tgname                                    AS trigger_name,
  CASE WHEN t.tgenabled = 'D' THEN 'DISABLED' ELSE 'ENABLED' END AS status,
  pg_get_triggerdef(t.oid)                    AS definition
FROM pg_trigger t
JOIN pg_class c     ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname IN ('public','auth','storage')
ORDER BY n.nspname, c.relname, t.tgname;


-- ===== [R08] Can `authenticated` create objects in schema public? =====
-- Determines the real severity of finding 9.7 (mutable search_path).
-- If CREATE is granted to PUBLIC/authenticated, 9.7 escalates to HIGH.
SELECT
  'R08' AS qid,
  n.nspname                                   AS schema_name,
  COALESCE(n.nspacl::text, '(default)')       AS schema_acl,
  has_schema_privilege('authenticated', n.nspname, 'CREATE') AS authenticated_can_create,
  has_schema_privilege('anon',          n.nspname, 'CREATE') AS anon_can_create
FROM pg_namespace n
WHERE n.nspname IN ('public','storage')
ORDER BY 2;


-- =====================================================================
--  PRIORITY 3 — REMAINING STRUCTURE
-- =====================================================================

-- ===== [R09] Indexes on public tables =====
-- Confirms the COALESCE UNIQUE INDEX from unify_word_progress_tracking.sql,
-- and shows what the unaccounted tables are keyed on.
SELECT 'R09' AS qid, tablename AS table_name, indexname AS index_name, indexdef AS definition
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;


-- ===== [R10] Views and materialized views =====
-- Are exam_statistics / blog_post_stats views? Note: neither appeared in
-- round 1's Q10 grant list, so they may not exist at all.
SELECT
  'R10' AS qid,
  c.relname                                   AS view_name,
  CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'matview' END AS kind,
  pg_get_viewdef(c.oid, true)                 AS definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('v','m') AND n.nspname = 'public'
ORDER BY c.relname;


-- ===== [R11] Storage object counts + path conventions (NO file contents) =====
-- The `essays` path convention determines how to write the ownership
-- predicate in the 9.2 fix — e.g. (storage.foldername(name))[1] = uid.
SELECT
  'R11' AS qid,
  bucket_id,
  count(*)                                    AS object_count,
  pg_size_pretty(COALESCE(sum((metadata->>'size')::bigint),0)) AS total_bytes,
  (array_agg(name ORDER BY created_at DESC))[1:5] AS five_most_recent_paths,
  count(*) FILTER (WHERE owner IS NULL)       AS objects_with_null_owner
FROM storage.objects
GROUP BY bucket_id
ORDER BY bucket_id;


-- ===== [R12] Was Supabase CLI migration tracking ever used? =====
SELECT
  'R12' AS qid,
  EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='supabase_migrations' AND c.relname='schema_migrations'
  ) AS cli_migration_table_exists;
-- If true, also run:
-- SELECT 'R12b' AS qid, version, name FROM supabase_migrations.schema_migrations ORDER BY version;


-- ===== [R13] Exact row counts for the exposed and disputed tables =====
-- Sizes the blast radius of finding 9.1 and confirms whether the GSAT
-- exam attempt tables are genuinely dead.
SELECT 'R13' AS qid, 'users'                   AS t, count(*) FROM public.users
UNION ALL SELECT 'R13','assignments',              count(*) FROM public.assignments
UNION ALL SELECT 'R13','assignment_submissions',   count(*) FROM public.assignment_submissions
UNION ALL SELECT 'R13','student_tasks',            count(*) FROM public.student_tasks
UNION ALL SELECT 'R13','courses',                  count(*) FROM public.courses
UNION ALL SELECT 'R13','course_lessons',           count(*) FROM public.course_lessons
UNION ALL SELECT 'R13','user_course_access',       count(*) FROM public.user_course_access
UNION ALL SELECT 'R13','learning_progress_stats',  count(*) FROM public.learning_progress_stats
UNION ALL SELECT 'R13','vocabulary_sessions',      count(*) FROM public.vocabulary_sessions
UNION ALL SELECT 'R13','exam_records',             count(*) FROM public.exam_records
UNION ALL SELECT 'R13','exam_types',               count(*) FROM public.exam_types
UNION ALL SELECT 'R13','essay_submissions',        count(*) FROM public.essay_submissions
UNION ALL SELECT 'R13','exam_attempts',            count(*) FROM public.exam_attempts
UNION ALL SELECT 'R13','exam_user_answers',        count(*) FROM public.exam_user_answers
UNION ALL SELECT 'R13','exams',                    count(*) FROM public.exams
UNION ALL SELECT 'R13','essay_questions',          count(*) FROM public.essay_questions
UNION ALL SELECT 'R13','invite_tokens',            count(*) FROM public.invite_tokens
UNION ALL SELECT 'R13','tokens',                   count(*) FROM public.tokens
UNION ALL SELECT 'R13','premium_memberships',      count(*) FROM public.premium_memberships
ORDER BY 2;


-- =====================================================================
--  PRIORITY 4 — SECURITY VERIFICATION (read-only; changes nothing)
-- =====================================================================

-- ===== [R14] B9: premium grants that look like self-grants or anon grants =====
-- Finding 9.3 means anyone (even anon) could call admin_grant_premium.
-- An anonymous grant lands with granted_by = NULL. Ids and timestamps only.
SELECT
  'R14' AS qid,
  id, user_id, granted_by, is_active, granted_at, expires_at, notes,
  (granted_by IS NULL)      AS granted_anonymously_or_unattributed,
  (granted_by = user_id)    AS self_granted
FROM public.premium_memberships
ORDER BY granted_at DESC;


-- ===== [R15] B11: is `role` present in user metadata? (NO PII) =====
-- Finding 9.6 mechanism 4 trusts raw_user_meta_data->>'role'. This counts
-- how many users carry a role claim WITHOUT selecting emails or metadata
-- bodies. A non-zero admin count on accounts that should not be admin is
-- the signal that the claim is self-assignable.
SELECT
  'R15' AS qid,
  COALESCE(raw_user_meta_data ->> 'role', '(no role claim)') AS role_claim,
  count(*)                                    AS user_count
FROM auth.users
GROUP BY COALESCE(raw_user_meta_data ->> 'role', '(no role claim)')
ORDER BY user_count DESC;


-- ===== [R16] Function EXECUTE grants — confirm the PUBLIC grant scope =====
-- Round 1 showed proacl on individual functions. This lists every public
-- function whose ACL grants EXECUTE to PUBLIC or anon, so B2b knows the
-- full revoke list rather than just the two premium functions.
SELECT
  'R16' AS qid,
  p.proname                                   AS function_name,
  pg_get_function_identity_arguments(p.oid)   AS arguments,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security_mode,
  COALESCE(p.proconfig::text,'(no search_path)') AS proconfig,
  COALESCE(p.proacl::text,'(default: PUBLIC EXECUTE)') AS execute_acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND p.prosecdef                              -- SECURITY DEFINER only
ORDER BY (p.proconfig IS NULL) DESC, p.proname;


-- =====================================================================
--  END — nothing above modifies anything.
-- =====================================================================
