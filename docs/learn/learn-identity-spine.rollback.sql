-- =====================================================================
--  /learn identity spine — ROLLBACK for learn-identity-spine.sql
--
--  Restores the database to its pre-migration state exactly:
--    - the two additive public.user_profiles policies are removed
--    - the learn schema and its three tables are removed
--
--  Nothing else is touched, because the migration changed nothing else.
--  The three original user_profiles policies were never modified, so
--  there is nothing to restore for them.
--
--  ⚠️ DESTRUCTIVE: drops learn.* and everything in it. On Production
--     this is only correct while the spine still holds no real data.
--
--  =====================================================================
--  🛑 MANDATORY PRE-STEP -- DO NOT SKIP, DO NOT REORDER
--  =====================================================================
--  BEFORE running any of the SQL below, remove `learn` from
--    Dashboard -> Project Settings -> Data API -> Exposed schemas
--  and save. Wait for PostgREST to reload.
--
--  WHY: measured on gsat-staging, 2026-08-27 (rehearsal step L8-2). With
--  `learn` still listed as an exposed schema but the schema itself
--  dropped, PostgREST cannot build its schema cache AT ALL and the whole
--  Data API returns 503:
--
--      {"code":"PGRST002",
--       "message":"Could not query the database for the schema cache. Retrying."}
--
--  That is not scoped to learn.* -- an anonymous read of public.user_profiles
--  returned the same 503. On Production that window is a FULL OUTAGE of the
--  live GSAT site, for as long as the mismatch lasts.
--
--  Recovery, if it is hit anyway: re-create the schema (re-apply
--  learn-identity-spine.sql) or remove `learn` from Exposed schemas.
--  Either resolves the mismatch and PostgREST recovers on its own.
--  =====================================================================

BEGIN;

-- 1. Drop the additive policies FIRST. They reference learn.*, so they
--    must go before the schema does.
DROP POLICY IF EXISTS user_profiles_select_by_class_owner ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_select_by_guardian    ON public.user_profiles;

-- 2. classes_select reads learn.class_members, so that policy has to go
--    before the table it reads. No CASCADE anywhere in this file: every
--    drop is named explicitly, so nothing unexpected can go with it.
DROP POLICY IF EXISTS classes_select ON learn.classes;

-- 3. Drop the spine. class_members before classes (composite FK).
DROP TABLE IF EXISTS learn.class_members;
DROP TABLE IF EXISTS learn.guardian_links;
DROP TABLE IF EXISTS learn.classes;

DROP SCHEMA IF EXISTS learn;

COMMIT;

-- The Exposed-schemas change belongs BEFORE this file, not after. See the
-- mandatory pre-step at the top. An earlier version of this comment had it
-- backwards; staging step L8-2 measured what that actually costs.
