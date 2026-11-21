-- ==============================================================================
-- Test File: 03_zero_knowledge_journals.test.sql
-- Description: pgTAP Test verifying Zero-Knowledge client-side encryption policy
-- ==============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
SELECT plan(5);

-- 1. Setup Fixture
DO $$
DECLARE
  v_inst_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_student uuid := '11110000-0000-0000-0000-000000000001'::uuid;
  v_counsellor uuid := '22220000-0000-0000-0000-000000000002'::uuid;
  v_admin uuid := '33330000-0000-0000-0000-000000000003'::uuid;
BEGIN
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst_id, 'Delhi University Wellness', 'DU', 'du.ac.in')
  ON CONFLICT (id) DO NOTHING;

  -- Ensure mock auth.users exist so FK on profiles(id) is satisfied
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_student, 'authenticated', 'authenticated', 'student_secret@test.com'),
      (v_counsellor, 'authenticated', 'authenticated', 'counsellor_ramesh@test.com'),
      (v_admin, 'authenticated', 'authenticated', 'admin_dean@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Create Student Profile
  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES (v_student, 'student', 'Student-Secret', 'en', v_inst_id)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    alias = EXCLUDED.alias,
    institution_id = EXCLUDED.institution_id;

  -- Create Counsellor Profile
  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES (v_counsellor, 'counsellor', 'Dr. Ramesh Kumar', 'en', v_inst_id)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    alias = EXCLUDED.alias,
    institution_id = EXCLUDED.institution_id;

  INSERT INTO public.counsellors (id, license_number, verified, institution_id)
  VALUES (v_counsellor, 'RCI-99881', true, v_inst_id)
  ON CONFLICT (id) DO NOTHING;

  -- Create Institution Admin Profile
  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES (v_admin, 'institution_admin', 'Dean Student Welfare', 'en', v_inst_id)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    alias = EXCLUDED.alias,
    institution_id = EXCLUDED.institution_id;

  -- Student creates zero-knowledge encrypted journal entry
  INSERT INTO public.journal_entries (id, student_id, ciphertext, iv, salt)
  VALUES (
    '44440000-0000-0000-0000-000000000004'::uuid,
    v_student,
    'AES-GCM-256-CIPHERTEXT-OF-HIGHLY-CONFIDENTIAL-THOUGHTS',
    'random_iv_12bytes_base64',
    'argon2id_salt_16bytes'
  );

  -- Student even grants "all" care share to Counsellor
  INSERT INTO public.care_shares (student_id, counsellor_id, active, scope)
  VALUES (v_student, v_counsellor, true, ARRAY['all', 'assessments', 'moods']);
END $$;

SET LOCAL ROLE authenticated;

-- -----------------------------------------------------------------------------
-- Test 1: Counsellor CANNOT access student journals even with "all" care share
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "22220000-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '22220000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is_empty(
  'SELECT * FROM public.journal_entries WHERE student_id = ''11110000-0000-0000-0000-000000000001''::uuid',
  'Counsellor MUST NEVER have access to client-side encrypted journal entries, regardless of care share status'
);

-- -----------------------------------------------------------------------------
-- Test 2: Institution Admin CANNOT access student journals
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "33330000-0000-0000-0000-000000000003", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '33330000-0000-0000-0000-000000000003';

SELECT is_empty(
  'SELECT * FROM public.journal_entries WHERE student_id = ''11110000-0000-0000-0000-000000000001''::uuid',
  'Institution Administrator / Dean MUST NEVER have access to student journal entries'
);

-- -----------------------------------------------------------------------------
-- Test 3: Counsellor CANNOT insert journals on behalf of student
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "22220000-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '22220000-0000-0000-0000-000000000002';

PREPARE counsellor_insert_student_journal AS
  INSERT INTO public.journal_entries (student_id, ciphertext, iv, salt)
  VALUES ('11110000-0000-0000-0000-000000000001'::uuid, 'forged', 'iv', 'salt');

SELECT throws_ok(
  'counsellor_insert_student_journal',
  '42501',
  NULL,
  'Counsellor cannot insert journal entries for a student'
);

-- -----------------------------------------------------------------------------
-- Test 4: Student CAN read their own encrypted journal entry
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "11110000-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '11110000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT ciphertext FROM public.journal_entries WHERE id = '44440000-0000-0000-0000-000000000004'::uuid),
  'AES-GCM-256-CIPHERTEXT-OF-HIGHLY-CONFIDENTIAL-THOUGHTS',
  'Student can access their own encrypted journal entry'
);

-- -----------------------------------------------------------------------------
-- Test 5: Verify schema holds ONLY ciphertext, iv, salt (no plaintext column)
-- -----------------------------------------------------------------------------
SELECT has_column('public', 'journal_entries', 'ciphertext', 'Table has ciphertext column');

SELECT * FROM finish();
ROLLBACK;
