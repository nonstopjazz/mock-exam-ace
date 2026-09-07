-- =====================================================================
--  /learn identity spine — migration v1
--  Source of design: docs/IDENTITY_ARCHITECTURE_CHECKPOINT.md
--                    docs/learn/IDENTITY_SPINE_PLAN.md
--
--  🛑 NOT APPLIED ANYWHERE. Staging first, Production only after the
--     owner approves a Production deployment plan.
--
--  Canonical identity : auth.users.id
--  Profile            : public.user_profiles  (reused, additive only)
--  public.users       : not read / not written / not joined / no FK
--
--  Scope (frozen): learn schema + privileges, three tables, constraints,
--  indexes, RLS ON, minimum policies, and the two additive
--  public.user_profiles SELECT policies of D2. Nothing else.
--
--  Idempotent: safe to re-run.
-- =====================================================================

BEGIN;

-- =====================================================================
--  1. Schema and privileges
--
--  Schema privilege is a SECOND, INDEPENDENT layer. It is NOT a
--  substitute for RLS: every table below also has RLS ON with policies.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS learn;

-- Nothing is granted by default, to anyone.
REVOKE ALL ON SCHEMA learn FROM PUBLIC;

-- anon is deliberately absent from this file. It gets no USAGE, so an
-- anonymous PostgREST request to learn.* fails at the privilege layer
-- before RLS is ever consulted.
GRANT USAGE ON SCHEMA learn TO authenticated;
GRANT USAGE ON SCHEMA learn TO service_role;

-- 🛑 No ALTER DEFAULT PRIVILEGES on this schema, on purpose. A future
--    table in learn starts with ZERO grants and must name its own,
--    which makes "forgot to think about privileges" fail closed.

-- =====================================================================
--  2. learn.classes
-- =====================================================================

CREATE TABLE IF NOT EXISTS learn.classes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_teacher_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name                  text NOT NULL CHECK (length(btrim(name)) > 0),
  status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'archived')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Redundant against the PK, but required as the target of the
  -- composite FK from learn.class_members. See section 3.
  CONSTRAINT classes_id_owner_key UNIQUE (id, owner_teacher_user_id)
);

CREATE INDEX IF NOT EXISTS idx_classes_owner
  ON learn.classes (owner_teacher_user_id);

-- =====================================================================
--  3. learn.class_members
--
--  class_owner_teacher_user_id is a DENORMALISED copy of the owning
--  class's teacher, and it is load-bearing for security, not for speed.
--
--  Without it, the policy "a teacher sees the members of their class"
--  must read learn.classes, while the policy "a student sees the class
--  they belong to" must read learn.class_members -- a cycle, which
--  PostgreSQL rejects as infinite recursion in policy. The usual escape
--  is a SECURITY DEFINER helper; this column removes the need for one.
--
--  It cannot drift: the composite FK below is the ONLY link to
--  learn.classes, so class_id and the owner are validated together, and
--  ON UPDATE CASCADE rewrites every member row if a class changes owner.
-- =====================================================================

CREATE TABLE IF NOT EXISTS learn.class_members (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id                    uuid NOT NULL,
  class_owner_teacher_user_id uuid NOT NULL,
  user_id                     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role                        text NOT NULL CHECK (role IN ('teacher', 'student')),
  status                      text NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'removed')),
  joined_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT class_members_class_fk
    FOREIGN KEY (class_id, class_owner_teacher_user_id)
    REFERENCES learn.classes (id, owner_teacher_user_id)
    ON UPDATE CASCADE ON DELETE CASCADE,

  CONSTRAINT class_members_class_user_key UNIQUE (class_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_class_members_user
  ON learn.class_members (user_id);
CREATE INDEX IF NOT EXISTS idx_class_members_owner
  ON learn.class_members (class_owner_teacher_user_id);
CREATE INDEX IF NOT EXISTS idx_class_members_class_owner
  ON learn.class_members (class_id, class_owner_teacher_user_id);

-- =====================================================================
--  4. learn.guardian_links
--
--  A guardian link is person-to-person, NOT a class role. Access is
--  derived from a CONFIRMED link; 'pending' grants nothing.
-- =====================================================================

CREATE TABLE IF NOT EXISTS learn.guardian_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'active', 'revoked')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  confirmed_at     timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT guardian_links_pair_key UNIQUE (guardian_user_id, student_user_id),
  CONSTRAINT guardian_links_not_self CHECK (guardian_user_id <> student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_guardian_links_student
  ON learn.guardian_links (student_user_id);
CREATE INDEX IF NOT EXISTS idx_guardian_links_guardian
  ON learn.guardian_links (guardian_user_id);

-- =====================================================================
--  5. Table privileges
--
--  No DELETE to authenticated, anywhere. Removal is a status change, so
--  prior work stays attributable -- the same soft-flag lesson as the A1
--  Phase C remediation. The missing grant is the enforcement.
-- =====================================================================

GRANT SELECT, INSERT, UPDATE ON learn.classes        TO authenticated;
GRANT SELECT, INSERT, UPDATE ON learn.class_members  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON learn.guardian_links TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON learn.classes        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON learn.class_members  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON learn.guardian_links TO service_role;

-- =====================================================================
--  6. RLS -- enabled with its policies in the same migration
--
--  Every policy carries TO authenticated. A policy with no role clause
--  applies to PUBLIC, which includes anon -- that is the exact defect
--  behind finding 9.8, and it also matters here: it keeps anon from ever
--  evaluating an expression that reads the learn schema.
-- =====================================================================

ALTER TABLE learn.classes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn.class_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn.guardian_links ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
--  6.1 learn.class_members -- LEAF. References no other table.
--      Every predicate is a direct comparison against auth.uid().
--      This is what makes the whole policy graph acyclic.
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS class_members_select ON learn.class_members;
CREATE POLICY class_members_select
  ON learn.class_members FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR class_owner_teacher_user_id = (SELECT auth.uid())
  );

-- Only the owning teacher adds members. Self-service join by invite is
-- NOT part of the spine.
DROP POLICY IF EXISTS class_members_insert_by_owner ON learn.class_members;
CREATE POLICY class_members_insert_by_owner
  ON learn.class_members FOR INSERT
  TO authenticated
  WITH CHECK (class_owner_teacher_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS class_members_update_by_owner ON learn.class_members;
CREATE POLICY class_members_update_by_owner
  ON learn.class_members FOR UPDATE
  TO authenticated
  USING      (class_owner_teacher_user_id = (SELECT auth.uid()))
  WITH CHECK (class_owner_teacher_user_id = (SELECT auth.uid()));

-- No DELETE policy, and no DELETE grant. Two layers, same answer.

-- ---------------------------------------------------------------------
--  6.2 learn.classes -- reads class_members (a leaf). Depth 1. Acyclic.
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS classes_select ON learn.classes;
CREATE POLICY classes_select
  ON learn.classes FOR SELECT
  TO authenticated
  USING (
    owner_teacher_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM learn.class_members m
      WHERE m.class_id = classes.id
        AND m.user_id  = (SELECT auth.uid())
        AND m.status   = 'active'
    )
  );

DROP POLICY IF EXISTS classes_insert_own ON learn.classes;
CREATE POLICY classes_insert_own
  ON learn.classes FOR INSERT
  TO authenticated
  WITH CHECK (owner_teacher_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS classes_update_own ON learn.classes;
CREATE POLICY classes_update_own
  ON learn.classes FOR UPDATE
  TO authenticated
  USING      (owner_teacher_user_id = (SELECT auth.uid()))
  WITH CHECK (owner_teacher_user_id = (SELECT auth.uid()));

-- No DELETE policy. Classes are archived (status), never deleted.

-- ---------------------------------------------------------------------
--  6.3 learn.guardian_links -- LEAF. Direct comparisons only.
--
--  INSERT: a guardian may only create a link naming THEMSELVES as the
--          guardian, and only as 'pending'. A pending link grants
--          nothing -- see 7.2.
--  UPDATE: only the student can activate. Either party can revoke.
--          PostgreSQL policies cannot compare OLD to NEW, so
--          "pending -> active only" is not expressible here; the
--          confirmation FLOW is product work. What is enforced now is
--          that a guardian can never self-activate.
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS guardian_links_select ON learn.guardian_links;
CREATE POLICY guardian_links_select
  ON learn.guardian_links FOR SELECT
  TO authenticated
  USING (
    guardian_user_id = (SELECT auth.uid())
    OR student_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS guardian_links_insert_by_guardian ON learn.guardian_links;
CREATE POLICY guardian_links_insert_by_guardian
  ON learn.guardian_links FOR INSERT
  TO authenticated
  WITH CHECK (
    guardian_user_id = (SELECT auth.uid())
    AND status = 'pending'
  );

DROP POLICY IF EXISTS guardian_links_update_by_student ON learn.guardian_links;
CREATE POLICY guardian_links_update_by_student
  ON learn.guardian_links FOR UPDATE
  TO authenticated
  USING      (student_user_id = (SELECT auth.uid()))
  WITH CHECK (student_user_id = (SELECT auth.uid())
              AND status IN ('active', 'revoked'));

DROP POLICY IF EXISTS guardian_links_update_by_guardian ON learn.guardian_links;
CREATE POLICY guardian_links_update_by_guardian
  ON learn.guardian_links FOR UPDATE
  TO authenticated
  USING      (guardian_user_id = (SELECT auth.uid()))
  WITH CHECK (guardian_user_id = (SELECT auth.uid())
              AND status = 'revoked');

-- =====================================================================
--  7. D2 -- two ADDITIVE SELECT policies on public.user_profiles
--
--  🛑 The three existing policies ("Users can view own profile",
--     "Users can insert own profile", "Users can update own profile")
--     are NOT touched. Nothing below removes, replaces or narrows them.
--
--  Both policies carry TO authenticated. That is not decoration: anon
--  has no USAGE on schema learn, so if these applied to PUBLIC an
--  anonymous read of user_profiles would raise permission denied instead
--  of returning zero rows -- a behaviour change to the existing app.
--
--  Deliberately NOT granted (owner decision D2, points 4 and 5):
--    - a student does NOT gain SELECT on a classmate's profile
--    - there is no "shares a class" predicate anywhere below
-- =====================================================================

-- 7.1 A teacher may read the profiles of the active members of an
--     active class they own.
DROP POLICY IF EXISTS user_profiles_select_by_class_owner ON public.user_profiles;
CREATE POLICY user_profiles_select_by_class_owner
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM learn.class_members m
    JOIN learn.classes c ON c.id = m.class_id
    WHERE m.user_id = user_profiles.user_id
      AND m.status  = 'active'
      AND c.status  = 'active'
      AND c.owner_teacher_user_id = (SELECT auth.uid())
  ));

-- 7.2 A guardian may read the profile of a child they are CONFIRMED
--     linked to. status = 'active' only -- 'pending' grants nothing.
DROP POLICY IF EXISTS user_profiles_select_by_guardian ON public.user_profiles;
CREATE POLICY user_profiles_select_by_guardian
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM learn.guardian_links g
    WHERE g.student_user_id  = user_profiles.user_id
      AND g.guardian_user_id = (SELECT auth.uid())
      AND g.status = 'active'
  ));

COMMIT;

-- =====================================================================
--  NOT in this migration, on purpose:
--    - class invites / self-service join      (needs the 9.4 lesson applied)
--    - any storage bucket                     (no product need this stage)
--    - any SECURITY DEFINER function          (none proved necessary)
--    - any global role table                  (roles are relationships)
--    - any change to public.users             (quarantined)
--    - any change to is_admin()               (9.6 stays in Phase 1)
--    - updated_at triggers                    (kept out of v1; the app sets it)
-- =====================================================================
