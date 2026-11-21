-- ==============================================================================
-- Test File: 02_care_shares_counsellor.test.sql
-- Description: pgTAP Test verifying delegated counsellor access via Care Shares
-- ==============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
SELECT plan(6);

-- 1. Setup Fixture
DO $$
DECLARE
  v_inst_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_student uuid := '10000000-0000-0000-0000-000000000001'::uuid;
  v_counsellor uuid := '20000000-0000-0000-0000-000000000002'::uuid;
BEGIN
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst_id, 'IIT Bombay Wellness Centre', 'IITB', 'iitb.ac.in')
  ON CONFLICT (id) DO NOTHING;

  -- Ensure mock auth.users exist so FK on profiles(id) is satisfied
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_student, 'authenticated', 'authenticated', 'student_one@test.com'),
      (v_counsellor, 'authenticated', 'authenticated', 'counsellor_priya@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Create Student Profile
  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES (v_student, 'student', 'Student-One', 'en', v_inst_id)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    alias = EXCLUDED.alias,
    institution_id = EXCLUDED.institution_id;

  -- Create Counsellor Profile & Counsellor Table Record
  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES (v_counsellor, 'counsellor', 'Dr. Priya Sharma', 'en', v_inst_id)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    alias = EXCLUDED.alias,
    institution_id = EXCLUDED.institution_id;

  INSERT INTO public.counsellors (id, license_number, specializations, verified, institution_id)
  VALUES (v_counsellor, 'RCI-CLINICAL-PSYCH-8921', ARRAY['CBT', 'Student Anxiety'], true, v_inst_id)
  ON CONFLICT (id) DO NOTHING;

  -- Student logs mood and assessment
  INSERT INTO public.mood_entries (id, student_id, mood, score)
  VALUES ('30000000-0000-0000-0000-000000000001'::uuid, v_student, 'Overwhelmed', 3);

  INSERT INTO public.assessments (id, student_id, instrument, answers, total, severity, item9_flag)
  VALUES ('40000000-0000-0000-0000-000000000001'::uuid, v_student, 'gad7', ARRAY[2,2,3,2,1,2,2], 14, 'Moderate', false);
END $$;

-- -----------------------------------------------------------------------------
-- Test 1: Counsellor has NO access without care share
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "20000000-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '20000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is_empty(
  'SELECT * FROM public.assessments WHERE student_id = ''10000000-0000-0000-0000-000000000001''::uuid',
  'Counsellor CANNOT view student assessments before care share is granted'
);

SELECT is_empty(
  'SELECT * FROM public.mood_entries WHERE student_id = ''10000000-0000-0000-0000-000000000001''::uuid',
  'Counsellor CANNOT view student mood entries before care share is granted'
);

-- -----------------------------------------------------------------------------
-- Step 2: Student grants active Care Share for assessments only
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "10000000-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000001';

INSERT INTO public.care_shares (id, student_id, counsellor_id, active, scope)
VALUES (
  '50000000-0000-0000-0000-000000000001'::uuid,
  '10000000-0000-0000-0000-000000000001'::uuid,
  '20000000-0000-0000-0000-000000000002'::uuid,
  true,
  ARRAY['assessments']
);

-- -----------------------------------------------------------------------------
-- Test 3: Counsellor CAN read assessments within scope, but NOT moods outside scope
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "20000000-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '20000000-0000-0000-0000-000000000002';

SELECT is(
  (SELECT total FROM public.assessments WHERE student_id = '10000000-0000-0000-0000-000000000001'::uuid),
  14,
  'Counsellor CAN view student assessment when active care share exists with assessments in scope'
);

SELECT is_empty(
  'SELECT * FROM public.mood_entries WHERE student_id = ''10000000-0000-0000-0000-000000000001''::uuid',
  'Counsellor CANNOT view student mood entries when scope is restricted to assessments only'
);

-- -----------------------------------------------------------------------------
-- Step 4: Student revokes Care Share (DPDP Right to Revoke Consent)
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "10000000-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000001';

UPDATE public.care_shares
SET active = false, revoked_at = now()
WHERE id = '50000000-0000-0000-0000-000000000001'::uuid;

-- -----------------------------------------------------------------------------
-- Test 5: Counsellor IMMEDIATELY loses access once revoked
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "20000000-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '20000000-0000-0000-0000-000000000002';

SELECT is_empty(
  'SELECT * FROM public.assessments WHERE student_id = ''10000000-0000-0000-0000-000000000001''::uuid',
  'Counsellor access is instantly severed upon care share revocation'
);

SELECT is_empty(
  'SELECT * FROM public.mood_entries WHERE student_id = ''10000000-0000-0000-0000-000000000001''::uuid',
  'Counsellor still cannot view student mood entries after care share revocation'
);

SELECT * FROM finish();
ROLLBACK;
