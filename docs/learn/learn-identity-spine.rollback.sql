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
-- =====================================================================

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

-- After running this, remove `learn` from Supabase Dashboard →
-- Project Settings → API → Exposed schemas. The order matters: exposing
-- a schema that does not exist makes PostgREST log an error on reload.
