-- ==============================================================================
-- Test File: 05_k_anonymity_aggregates.test.sql
-- Description: pgTAP Test verifying statistical k-anonymity (k >= 10) suppression
-- ==============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
SELECT plan(4);

-- 1. Setup Fixture
DO $$
DECLARE
  v_inst_id uuid := '99991111-1111-1111-1111-111111111111'::uuid;
  v_admin_id uuid := '99992222-2222-2222-2222-222222222222'::uuid;
  v_student_id uuid;
  i integer;
BEGIN
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst_id, 'Ashoka University Wellbeing', 'ASHOKA', 'ashoka.edu.in')
  ON CONFLICT (id) DO NOTHING;

  -- Ensure mock auth.users exist so FK on profiles(id) is satisfied
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_admin_id, 'authenticated', 'authenticated', 'dean_ashoka@test.com'),
      ('99990000-0000-0000-0000-000000000001'::uuid, 'authenticated', 'authenticated', 'student_random@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Create Institution Admin
  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES (v_admin_id, 'institution_admin', 'Dean Admin', 'en', v_inst_id)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    alias = EXCLUDED.alias,
    institution_id = EXCLUDED.institution_id;

  -- Insert random student profile for unauthorized test caller
  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES ('99990000-0000-0000-0000-000000000001'::uuid, 'student', 'Student-Caller', 'en', v_inst_id)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    alias = EXCLUDED.alias,
    institution_id = EXCLUDED.institution_id;

  -- Insert only 5 student assessments (k = 5, strictly < 10)
  FOR i IN 1..5 LOOP
    v_student_id := gen_random_uuid();
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
      INSERT INTO auth.users (id, aud, role, email) VALUES
        (v_student_id, 'authenticated', 'authenticated', 'student_' || i || '@test.com')
      ON CONFLICT (id) DO NOTHING;
    END IF;

    INSERT INTO public.profiles (id, role, alias, locale, institution_id)
    VALUES (v_student_id, 'student', 'Student-' || i, 'en', v_inst_id)
    ON CONFLICT (id) DO UPDATE SET
      role = EXCLUDED.role,
      alias = EXCLUDED.alias,
      institution_id = EXCLUDED.institution_id;

    INSERT INTO public.assessments (student_id, instrument, answers, total, severity, item9_flag, completed_at)
    VALUES (
      v_student_id,
      'phq4',
      ARRAY[1, 1, 1, 1],
      4,
      'Mild',
      false,
      '2026-11-01 12:00:00+05:30'
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Test 1: With N = 5 (less than 10), the k-anonymity view returns ZERO rows
-- -----------------------------------------------------------------------------
SELECT is_empty(
  'SELECT * FROM public.institution_assessment_aggregates WHERE institution_code = ''ASHOKA''',
  'k-Anonymity View MUST suppress cohorts where count < 10 to prevent student deanonymization'
);

-- -----------------------------------------------------------------------------
-- Step 2: Insert 5 more students to reach k = 10 threshold
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_inst_id uuid := '99991111-1111-1111-1111-111111111111'::uuid;
  v_student_id uuid;
  i integer;
BEGIN
  FOR i IN 6..10 LOOP
    v_student_id := gen_random_uuid();
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
      INSERT INTO auth.users (id, aud, role, email) VALUES
        (v_student_id, 'authenticated', 'authenticated', 'student_' || i || '@test.com')
      ON CONFLICT (id) DO NOTHING;
    END IF;

    INSERT INTO public.profiles (id, role, alias, locale, institution_id)
    VALUES (v_student_id, 'student', 'Student-' || i, 'en', v_inst_id)
    ON CONFLICT (id) DO UPDATE SET
      role = EXCLUDED.role,
      alias = EXCLUDED.alias,
      institution_id = EXCLUDED.institution_id;

    INSERT INTO public.assessments (student_id, instrument, answers, total, severity, item9_flag, completed_at)
    VALUES (
      v_student_id,
      'phq4',
      ARRAY[1, 1, 1, 1],
      4,
      'Mild',
      false,
      '2026-11-01 12:00:00+05:30'
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Test 2: Now with N = 10, the cohort appears in the view with sample_size = 10
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT sample_size FROM public.institution_assessment_aggregates 
   WHERE institution_code = 'ASHOKA' AND severity = 'Mild'),
  10,
  'Cohort with sample size k >= 10 safely appears in institutional aggregate view'
);

-- -----------------------------------------------------------------------------
-- Test 3: Unauthorized student cannot query administrative summary function
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "99990000-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '99990000-0000-0000-0000-000000000001'; -- Arbitrary student
SET LOCAL "request.jwt.claim.role" = 'authenticated';

PREPARE student_call_summary AS
  SELECT * FROM public.get_institution_wellbeing_summary('99991111-1111-1111-1111-111111111111'::uuid);

SELECT throws_matching(
  'student_call_summary',
  'Access Denied',
  'Regular student cannot invoke institutional administrative aggregate function'
);

-- -----------------------------------------------------------------------------
-- Test 4: Institution Admin can successfully query summary
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "99992222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '99992222-2222-2222-2222-222222222222'; -- Institution Admin

SELECT is(
  (SELECT count(*)::integer FROM public.get_institution_wellbeing_summary('99991111-1111-1111-1111-111111111111'::uuid)),
  1,
  'Designated Institution Admin can safely retrieve k-anonymized wellbeing summary'
);

SELECT * FROM finish();
ROLLBACK;
