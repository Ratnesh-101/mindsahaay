-- ==============================================================================
-- Test File: 07_security_gaps.test.sql
-- Description: pgTAP Test verifying critical security fixes:
--              1. Role escalation prevention (student cannot set role to counsellor/admin)
--              2. Counsellor self-verification prevention
--              3. Rate limits table unreachability by authenticated users
--              4. INSERT WITH CHECK bypass attempts across sensitive domains
--              5. Circle privilege escalation prevention (joining as admin or private circle)
--              6. Content moderation tampering prevention
--              7. DPDP Act 2023 Right to Erasure cascade profile deletion
-- ==============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
SELECT plan(10);

-- 1. Setup Test Fixture Data
DO $$
DECLARE
  v_inst_id uuid := '11111111-2222-3333-4444-555555555555'::uuid;
  v_student_a uuid := 'aaaaaaaa-1111-2222-3333-444444444444'::uuid;
  v_student_b uuid := 'bbbbbbbb-1111-2222-3333-444444444444'::uuid;
  v_counsellor uuid := 'cccccccc-1111-2222-3333-444444444444'::uuid;
  v_circle_public uuid := 'd1111111-1111-1111-1111-111111111111'::uuid;
  v_circle_private uuid := 'd2222222-2222-2222-2222-222222222222'::uuid;
  v_post_id uuid := 'e1111111-1111-1111-1111-111111111111'::uuid;
BEGIN
  -- Insert Institution
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst_id, 'Audit Security Test University', 'ASTU', 'astu.edu.in')
  ON CONFLICT (id) DO NOTHING;

  -- Ensure mock auth.users exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_student_a, 'authenticated', 'authenticated', 'alice@astu.edu.in'),
      (v_student_b, 'authenticated', 'authenticated', 'bob@astu.edu.in'),
      (v_counsellor, 'authenticated', 'authenticated', 'dr.verma@astu.edu.in')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Create Profiles
  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES
    (v_student_a, 'student', 'Student-Alice', 'en', v_inst_id),
    (v_student_b, 'student', 'Student-Bob', 'en', v_inst_id),
    (v_counsellor, 'counsellor', 'Dr. Verma', 'en', v_inst_id)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    alias = EXCLUDED.alias,
    institution_id = EXCLUDED.institution_id;

  -- Verified Counsellor record
  INSERT INTO public.counsellors (id, license_number, verified, institution_id)
  VALUES (v_counsellor, 'RCI-AUDIT-999', true, v_inst_id)
  ON CONFLICT (id) DO NOTHING;

  -- Circles (One public, one private)
  INSERT INTO public.circles (id, name, slug, description, is_private)
  VALUES
    (v_circle_public, 'Public Peer Space', 'public-space', 'Open circle', false),
    (v_circle_private, 'Closed Counsellor Group', 'closed-group', 'Private circle', true)
  ON CONFLICT (id) DO NOTHING;

  -- Post created by Alice in flagged state
  INSERT INTO public.posts (id, circle_id, author_id, title, content, moderation_status)
  VALUES (v_post_id, v_circle_public, v_student_a, 'Flagged Post', 'Needs review', 'flagged')
  ON CONFLICT (id) DO NOTHING;

  -- Bob creates a consent and mood entry for erasure test
  INSERT INTO public.consents (student_id, purpose, consented)
  VALUES (v_student_b, 'data_processing', true);

  INSERT INTO public.mood_entries (student_id, mood, score)
  VALUES (v_student_b, 'Tired', 5);
END $$;

-- -----------------------------------------------------------------------------
-- Test 1: Student cannot escalate their own role to 'counsellor' or 'super_admin'
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-1111-2222-3333-444444444444", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-1111-2222-3333-444444444444';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

PREPARE student_escalate_role AS
  UPDATE public.profiles
  SET role = 'counsellor'
  WHERE id = 'aaaaaaaa-1111-2222-3333-444444444444'::uuid;

SELECT throws_matching(
  'student_escalate_role',
  'Unauthorized.*role',
  'Student must NOT be able to escalate their own role to counsellor'
);

-- -----------------------------------------------------------------------------
-- Test 2: Student cannot self-verify into public.counsellors
-- -----------------------------------------------------------------------------
PREPARE student_self_verify_counsellor AS
  INSERT INTO public.counsellors (id, license_number, verified)
  VALUES ('aaaaaaaa-1111-2222-3333-444444444444'::uuid, 'FAKE-RCI-12345', true);

SELECT throws_ok(
  'student_self_verify_counsellor',
  NULL,
  NULL,
  'Student must NOT be able to insert themselves as a verified counsellor'
);

-- -----------------------------------------------------------------------------
-- Test 3: Authenticated user cannot read public.rate_limits table directly
-- -----------------------------------------------------------------------------
PREPARE student_read_rate_limits AS SELECT * FROM public.rate_limits;

SELECT throws_ok(
  'student_read_rate_limits',
  '42501',
  NULL,
  'rate_limits must be completely inaccessible (permission denied) to authenticated clients'
);

-- -----------------------------------------------------------------------------
-- Test 4: Authenticated user cannot insert into public.rate_limits table
-- -----------------------------------------------------------------------------
PREPARE student_insert_rate_limit AS
  INSERT INTO public.rate_limits (key, tokens) VALUES ('test-key', 100);

SELECT throws_ok(
  'student_insert_rate_limit',
  NULL,
  NULL,
  'Authenticated clients must NOT be able to modify rate_limits table directly'
);

-- -----------------------------------------------------------------------------
-- Test 5: WITH CHECK: Student Alice cannot spoof mood_entries for Student Bob
-- -----------------------------------------------------------------------------
PREPARE student_spoof_mood_check AS
  INSERT INTO public.mood_entries (student_id, mood, score)
  VALUES ('bbbbbbbb-1111-2222-3333-444444444444'::uuid, 'Happy', 9);

SELECT throws_ok(
  'student_spoof_mood_check',
  '42501',
  NULL,
  'WITH CHECK on mood_entries must reject insert with mismatched student_id'
);

-- -----------------------------------------------------------------------------
-- Test 6: WITH CHECK: Student Alice cannot spoof assessments for Student Bob
-- -----------------------------------------------------------------------------
PREPARE student_spoof_assessment_check AS
  INSERT INTO public.assessments (student_id, instrument, answers, total, severity)
  VALUES ('bbbbbbbb-1111-2222-3333-444444444444'::uuid, 'phq4', ARRAY[0,0,0,0], 0, 'Normal');

SELECT throws_ok(
  'student_spoof_assessment_check',
  '42501',
  NULL,
  'WITH CHECK on assessments must reject insert with mismatched student_id'
);

-- -----------------------------------------------------------------------------
-- Test 7: Student Alice cannot join a private circle without authorization
-- -----------------------------------------------------------------------------
PREPARE student_join_private_circle AS
  INSERT INTO public.circle_members (circle_id, user_id, role)
  VALUES ('d2222222-2222-2222-2222-222222222222'::uuid, 'aaaaaaaa-1111-2222-3333-444444444444'::uuid, 'member');

SELECT throws_ok(
  'student_join_private_circle',
  '42501',
  NULL,
  'Regular student cannot join a private circle without moderator status'
);

-- -----------------------------------------------------------------------------
-- Test 8: Student Alice cannot join a public circle with role = 'admin'
-- -----------------------------------------------------------------------------
PREPARE student_join_circle_as_admin AS
  INSERT INTO public.circle_members (circle_id, user_id, role)
  VALUES ('d1111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-1111-2222-3333-444444444444'::uuid, 'admin');

SELECT throws_ok(
  'student_join_circle_as_admin',
  '42501',
  NULL,
  'Regular student cannot self-assign role=admin when joining a circle'
);

-- -----------------------------------------------------------------------------
-- Test 9: Author cannot unflag their own flagged post
-- -----------------------------------------------------------------------------
PREPARE student_unflag_own_post AS
  UPDATE public.posts
  SET moderation_status = 'approved'
  WHERE id = 'e1111111-1111-1111-1111-111111111111'::uuid;

SELECT throws_matching(
  'student_unflag_own_post',
  'Unauthorized.*moderator',
  'Post author must NOT be able to approve their own flagged post'
);

-- -----------------------------------------------------------------------------
-- Test 10: DPDP Right to Erasure - Profile deletion successfully cascades
-- -----------------------------------------------------------------------------
-- Switch to Student Bob
SET LOCAL "request.jwt.claims" = '{"sub": "bbbbbbbb-1111-2222-3333-444444444444", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'bbbbbbbb-1111-2222-3333-444444444444';

-- Student Bob deletes his own profile
PREPARE bob_delete_own_profile AS
  DELETE FROM public.profiles WHERE id = 'bbbbbbbb-1111-2222-3333-444444444444'::uuid;

SELECT lives_ok(
  'bob_delete_own_profile',
  'Student Bob can successfully delete his profile (DPDP Right to Erasure cascade unblocked)'
);

SELECT * FROM finish();
ROLLBACK;
