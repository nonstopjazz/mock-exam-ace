-- =====================================================================
--  gsat-staging — SYNTHETIC FIXTURES
--
--  🛑 STAGING ONLY. NEVER RUN THIS AGAINST PRODUCTION.
--
--  Implements STAGING_PLAN.md section 4. Run AFTER:
--    1. STAGING-BOOTSTRAP.sql          (section 3.1 schema)
--    2. the staging-only is_admin()    (section 3.3)
--    3. the three @example.test users  (section 4, Dashboard)
--
--  ------------------------------------------------------------------
--  NO UUID SUBSTITUTION NEEDED
--  ------------------------------------------------------------------
--  STAGING_PLAN.md section 4 shows <ADMIN_UUID> / <USER_B_UUID>
--  placeholders to fill in by hand. This script instead looks each user
--  up BY EMAIL, so there is nothing to transcribe and no way to paste
--  the wrong id. Section 0 below fails loudly, naming the exact missing
--  address, if any account is absent or unconfirmed.
--
--  ------------------------------------------------------------------
--  PII RULE (STAGING_PLAN.md section 4.1)
--  ------------------------------------------------------------------
--  Every value here is synthetic. Emails use @example.test, an RFC 2606
--  reserved TLD that can never receive mail. No production row is
--  copied. No real name, school, essay or student record appears.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
--  0. PRECONDITIONS — fail loudly rather than inserting NULLs
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(e, ', ') INTO v_missing
  FROM (VALUES
    ('staging-admin@example.test'),
    ('staging-user-a@example.test'),
    ('staging-user-b@example.test')
  ) AS t(e)
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.email = t.e);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Missing auth user(s): %. Create them in Dashboard -> Authentication -> Add user, with Auto Confirm User ticked. Check for typos: is_admin() compares the admin address as an EXACT string.',
      v_missing;
  END IF;

  -- Already loaded? Re-running would create a THIRD and FOURTH premium
  -- row for USER_B and quietly invalidate the S1-3 expectation of
  -- revoked_count = 2.
  IF EXISTS (SELECT 1 FROM public.packs
             WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION
      'Fixtures already loaded. Re-running would add MORE duplicate premium rows and break the S1-3 expectation. To start over, reset the database and re-run STAGING-BOOTSTRAP.sql first.';
  END IF;
END $$;


-- ---------------------------------------------------------------------
--  1. ADMIN is a row in app_admins
-- ---------------------------------------------------------------------
INSERT INTO public.app_admins (user_id)
SELECT id FROM auth.users WHERE email = 'staging-admin@example.test';


-- ---------------------------------------------------------------------
--  2. One 3-item pack for the TTS path (S3)
--     Three items keeps Google TTS spend to a fraction of a cent, and
--     with TTS_MAX_ITEMS_PER_REQUEST=2 on Preview it still forces the
--     chunking loop to run twice (S3-7).
-- ---------------------------------------------------------------------
INSERT INTO public.packs (id, title, description, is_public, is_active, created_by)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001',
       'Staging TTS Pack', 'synthetic', false, true, id
FROM auth.users WHERE email = 'staging-admin@example.test';

INSERT INTO public.pack_items (pack_id, word, definition, example_sentence, sort_order) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'apple',  '蘋果', 'I ate an apple.',     1),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'banana', '香蕉', 'She likes bananas.',  2),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cherry', '櫻桃', 'Cherries are sweet.', 3);


-- ---------------------------------------------------------------------
--  3. 🔑 Reproduce finding 9.15 — TWO simultaneously active memberships
--     for USER_B.
--
--     This is the single most important fixture in the file. The
--     baseline run must show that revoking one of these leaves
--     is_premium_member() still true. If this row pair is missing, the
--     baseline proves nothing and a green S1-3 afterwards is
--     meaningless.
-- ---------------------------------------------------------------------
INSERT INTO public.premium_memberships (user_id, expires_at, granted_by, is_active, notes)
SELECT b.id, NULL, a.id, true, 'fixture duplicate 1'
FROM auth.users a, auth.users b
WHERE a.email = 'staging-admin@example.test'
  AND b.email = 'staging-user-b@example.test';

INSERT INTO public.premium_memberships (user_id, expires_at, granted_by, is_active, notes)
SELECT b.id, NULL, a.id, true, 'fixture duplicate 2'
FROM auth.users a, auth.users b
WHERE a.email = 'staging-admin@example.test'
  AND b.email = 'staging-user-b@example.test';


-- ---------------------------------------------------------------------
--  4. Cron path (S4)
--     The push endpoint is deliberately fake: webpush cannot deliver to
--     it, so S4 expects failed:1 / cleaned:1. That is a PASS — it proves
--     the secret guard let the scheduler through and the send path ran.
--
--     last_study_date = yesterday puts USER_A inside the cron's
--     targeting window (last_study_date <> today).
-- ---------------------------------------------------------------------
INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth)
SELECT id, 'https://example.test/push/synthetic-endpoint',
       'synthetic-p256dh', 'synthetic-auth'
FROM auth.users WHERE email = 'staging-user-a@example.test';

INSERT INTO public.user_stats (user_id, streak_days, last_study_date,
                               total_review_count, total_words_learned)
SELECT id, 3, CURRENT_DATE - 1, 42, 10
FROM auth.users WHERE email = 'staging-user-a@example.test';


-- ---------------------------------------------------------------------
--  5. A pre-existing invite token for S5-4
--
--     A1-5a changes how NEW tokens are generated. S5-4 proves the change
--     is backward compatible: a token that already existed must still
--     redeem. That needs a token created BEFORE the patch, which is what
--     this is.
--
--     'TESTPACK' uses only the existing alphabet
--     ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no I, O, 0 or 1) and is 8
--     characters, matching what generate_short_token produces today.
--     A1-5a changes the randomness source, NOT the alphabet or length.
--
--     Redeem at:  https://<preview-url>/claim/TESTPACK
-- ---------------------------------------------------------------------
INSERT INTO public.invite_tokens (pack_id, created_by, token, max_uses, is_active)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001', id, 'TESTPACK', 10, true
FROM auth.users WHERE email = 'staging-admin@example.test';

COMMIT;


-- =====================================================================
--  POST-CHECK — every line must read PASS
-- =====================================================================
SELECT 'users confirmed' AS check,
       count(*)::text || ' of 3' AS value,
       CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL' END AS status
FROM auth.users
WHERE email LIKE '%@example.test' AND email_confirmed_at IS NOT NULL
UNION ALL
SELECT 'admin in app_admins', count(*)::text,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM public.app_admins
UNION ALL
SELECT 'pack items', count(*)::text,
       CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL' END
FROM public.pack_items
WHERE pack_id = 'aaaaaaaa-0000-0000-0000-000000000001'
UNION ALL
SELECT 'USER_B active memberships', count(*)::text,
       CASE WHEN count(*) = 2 THEN 'PASS  <- finding 9.15 staged' ELSE 'FAIL' END
FROM public.premium_memberships m
JOIN auth.users u ON u.id = m.user_id
WHERE u.email = 'staging-user-b@example.test' AND m.is_active
UNION ALL
SELECT 'USER_B is_premium_member', is_premium_member(u.id)::text,
       CASE WHEN is_premium_member(u.id) THEN 'PASS' ELSE 'FAIL' END
FROM auth.users u WHERE u.email = 'staging-user-b@example.test'
UNION ALL
SELECT 'USER_A push subscription', count(*)::text,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM public.push_subscriptions s
JOIN auth.users u ON u.id = s.user_id
WHERE u.email = 'staging-user-a@example.test'
UNION ALL
SELECT 'USER_A cron-targetable', s.last_study_date::text,
       CASE WHEN s.last_study_date <> CURRENT_DATE THEN 'PASS' ELSE 'FAIL' END
FROM public.user_stats s
JOIN auth.users u ON u.id = s.user_id
WHERE u.email = 'staging-user-a@example.test'
UNION ALL
SELECT 'invite token TESTPACK', count(*)::text,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM public.invite_tokens WHERE token = 'TESTPACK'
UNION ALL
SELECT 'no real email present', count(*)::text,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL  <- PII leak' END
FROM auth.users WHERE email NOT LIKE '%@example.test';
