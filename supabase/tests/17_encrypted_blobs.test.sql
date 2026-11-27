-- ==============================================================================
-- Test File: 17_encrypted_blobs.test.sql
-- Description: pgTAP tests for Wave 3 Synced Encrypted Blobs & RPC put_blob
-- Tests:
--   1. encrypted_blobs table owner-only RLS (Student isolation)
--   2. Zero counsellor, moderator, and admin access to encrypted blobs
--   3. Slot check constraint ('mindsahaay_sec_0f9a2b8e3d1c4a7e', etc.)
--   4. RPC put_blob initial creation (expected_version = 0)
--   5. RPC put_blob version conflicts on mismatched expected_version
--   6. RPC put_blob successive atomic version increments
--   7. RPC put_blob slot validation
--   8. Cascade deletion on profile removal
-- ==============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
SELECT plan(19);

-- ------------------------------------------------------------------------------
-- 1. Setup Test Fixture Data
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_inst_id uuid := '17171717-1717-1717-1717-171717171717'::uuid;
  v_student_1 uuid := '17000001-0000-0000-0000-000000000001'::uuid;
  v_student_2 uuid := '17000002-0000-0000-0000-000000000002'::uuid;
  v_counsellor uuid := '17000003-0000-0000-0000-000000000003'::uuid;
  v_moderator uuid := '17000004-0000-0000-0000-000000000004'::uuid;
  v_admin uuid := '17000005-0000-0000-0000-000000000005'::uuid;
BEGIN
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst_id, 'Blob Test University', 'BTU', 'btu.ac.in')
  ON CONFLICT (id) DO NOTHING;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_student_1, 'authenticated', 'authenticated', 'blob_student1@test.com'),
      (v_student_2, 'authenticated', 'authenticated', 'blob_student2@test.com'),
      (v_counsellor, 'authenticated', 'authenticated', 'blob_counsellor@test.com'),
      (v_moderator, 'authenticated', 'authenticated', 'blob_moderator@test.com'),
      (v_admin, 'authenticated', 'authenticated', 'blob_admin@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES 
    (v_student_1, 'student', 'BlobStudent1', 'en', v_inst_id),
    (v_student_2, 'student', 'BlobStudent2', 'en', v_inst_id),
    (v_counsellor, 'counsellor', 'Dr. BlobCounsellor', 'en', v_inst_id),
    (v_moderator, 'moderator', 'BlobModerator', 'en', v_inst_id),
    (v_admin, 'institution_admin', 'BlobDean', 'en', v_inst_id)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    alias = EXCLUDED.alias,
    institution_id = EXCLUDED.institution_id;

  INSERT INTO public.counsellors (id, license_number, verified, institution_id)
  VALUES (v_counsellor, 'RCI-BLOB-01', true, v_inst_id)
  ON CONFLICT (id) DO NOTHING;

  -- Care share between Student 1 and Counsellor
  INSERT INTO public.care_shares (student_id, counsellor_id, active, scope)
  VALUES (v_student_1, v_counsellor, true, ARRAY['all'])
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Test Set 1: Encrypted Blobs RLS & Owner Isolation
-- ------------------------------------------------------------------------------
-- Student 1 creates CBT activities blob
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "17000001-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '17000001-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

PREPARE student_1_insert_blob AS
  INSERT INTO public.encrypted_blobs (user_id, slot, ciphertext, iv, salt, version)
  VALUES (
    '17000001-0000-0000-0000-000000000001'::uuid,
    'mindsahaay_sec_0f9a2b8e3d1c4a7e',
    'ciphertext_cbt_student1',
    'iv_cbt_1',
    'salt_cbt_1',
    1
  );

SELECT lives_ok('student_1_insert_blob', 'Student 1 can insert own encrypted blob');

SELECT isnt_empty(
  'SELECT * FROM public.encrypted_blobs WHERE slot = ''mindsahaay_sec_0f9a2b8e3d1c4a7e''',
  'Student 1 can view own encrypted blob'
);

-- Student 2 attempts to view / tamper with Student 1's blob
SET LOCAL "request.jwt.claims" = '{"sub": "17000002-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '17000002-0000-0000-0000-000000000002';

SELECT is_empty(
  'SELECT * FROM public.encrypted_blobs WHERE user_id = ''17000001-0000-0000-0000-000000000001''::uuid',
  'Student 2 must NOT be able to view Student 1 encrypted blobs'
);

PREPARE student_2_spoof_insert AS
  INSERT INTO public.encrypted_blobs (user_id, slot, ciphertext, iv, salt, version)
  VALUES (
    '17000001-0000-0000-0000-000000000001'::uuid,
    'mindsahaay_sec_4c8b1a7d2e9f0a3b',
    'hacked_cbt',
    'iv',
    'salt',
    1
  );

SELECT throws_ok(
  'student_2_spoof_insert',
  '42501',
  NULL,
  'Student 2 must NOT be able to insert encrypted blobs for Student 1'
);

-- Student 2 attempting update on Student 1 blob affects 0 rows
UPDATE public.encrypted_blobs
SET ciphertext = 'tampered'
WHERE user_id = '17000001-0000-0000-0000-000000000001'::uuid;

SET LOCAL ROLE postgres;
SELECT isnt_empty(
  'SELECT * FROM public.encrypted_blobs WHERE user_id = ''17000001-0000-0000-0000-000000000001''::uuid AND ciphertext = ''ciphertext_cbt_student1''',
  'Student 1 blob must be unchanged after Student 2 attempted update'
);

-- Student 2 attempting delete on Student 1 blob affects 0 rows
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "17000002-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '17000002-0000-0000-0000-000000000002';

DELETE FROM public.encrypted_blobs
WHERE user_id = '17000001-0000-0000-0000-000000000001'::uuid;

SET LOCAL ROLE postgres;
SELECT isnt_empty(
  'SELECT * FROM public.encrypted_blobs WHERE user_id = ''17000001-0000-0000-0000-000000000001''::uuid',
  'Student 1 blob must still exist after Student 2 attempted delete'
);

-- ------------------------------------------------------------------------------
-- 3. Test Set 2: Zero Counsellor, Moderator, and Admin Access
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "17000003-0000-0000-0000-000000000003", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '17000003-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is_empty(
  'SELECT * FROM public.encrypted_blobs WHERE user_id = ''17000001-0000-0000-0000-000000000001''::uuid',
  'Counsellor must NOT be able to view Student 1 encrypted blobs even with care share'
);

PREPARE counsellor_insert_blob AS
  INSERT INTO public.encrypted_blobs (user_id, slot, ciphertext, iv, salt, version)
  VALUES (
    '17000001-0000-0000-0000-000000000001'::uuid,
    'mindsahaay_sec_4c8b1a7d2e9f0a3b',
    'counsellor_payload',
    'iv',
    'salt',
    1
  );

SELECT throws_ok(
  'counsellor_insert_blob',
  '42501',
  NULL,
  'Counsellor must NOT be able to insert encrypted blobs for Student 1'
);

-- Moderator check
SET LOCAL "request.jwt.claims" = '{"sub": "17000004-0000-0000-0000-000000000004", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '17000004-0000-0000-0000-000000000004';

SELECT is_empty(
  'SELECT * FROM public.encrypted_blobs WHERE user_id = ''17000001-0000-0000-0000-000000000001''::uuid',
  'Moderator must NOT be able to view student encrypted blobs'
);

-- Admin check
SET LOCAL "request.jwt.claims" = '{"sub": "17000005-0000-0000-0000-000000000005", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '17000005-0000-0000-0000-000000000005';

SELECT is_empty(
  'SELECT * FROM public.encrypted_blobs WHERE user_id = ''17000001-0000-0000-0000-000000000001''::uuid',
  'Institution Admin must NOT be able to view student encrypted blobs'
);

-- ------------------------------------------------------------------------------
-- 4. Test Set 3: Slot Check Constraint
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "17000001-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '17000001-0000-0000-0000-000000000001';

PREPARE insert_invalid_slot AS
  INSERT INTO public.encrypted_blobs (user_id, slot, ciphertext, iv, salt, version)
  VALUES (
    '17000001-0000-0000-0000-000000000001'::uuid,
    'unauthorized_arbitrary_slot',
    'ciphertext',
    'iv',
    'salt',
    1
  );

SELECT throws_ok(
  'insert_invalid_slot',
  '23514',
  NULL,
  'Inserting encrypted blob with unauthorized slot identifier must violate check constraint'
);

-- ------------------------------------------------------------------------------
-- 5. Test Set 4: RPC put_blob & Version Conflicts
-- ------------------------------------------------------------------------------
-- Slot 2: worry time slot
-- Initial create with p_expected_version = 0 must succeed and return version 1
SELECT is(
  public.put_blob(
    'mindsahaay_sec_4c8b1a7d2e9f0a3b',
    'ciphertext_v1',
    'iv_v1',
    'salt_v1',
    0
  ),
  1,
  'put_blob with expected_version = 0 creates slot and returns version 1'
);

-- Calling put_blob with expected_version = 0 again when row exists must raise VERSION_CONFLICT
SELECT throws_ok(
  $$SELECT public.put_blob(
      'mindsahaay_sec_4c8b1a7d2e9f0a3b',
      'ciphertext_v_conflict',
      'iv_conflict',
      'salt_conflict',
      0
    )$$,
  'P0001',
  'VERSION_CONFLICT',
  'put_blob with expected_version = 0 when row already exists must raise VERSION_CONFLICT'
);

-- Calling put_blob with mismatched expected_version (e.g. 5 instead of 1) must raise VERSION_CONFLICT
SELECT throws_ok(
  $$SELECT public.put_blob(
      'mindsahaay_sec_4c8b1a7d2e9f0a3b',
      'ciphertext_v_conflict',
      'iv_conflict',
      'salt_conflict',
      5
    )$$,
  'P0001',
  'VERSION_CONFLICT',
  'put_blob with mismatched expected_version must raise VERSION_CONFLICT'
);

-- Calling put_blob with expected_version = 1 succeeds and returns version 2
SELECT is(
  public.put_blob(
    'mindsahaay_sec_4c8b1a7d2e9f0a3b',
    'ciphertext_v2',
    'iv_v2',
    'salt_v2',
    1
  ),
  2,
  'put_blob with matching expected_version = 1 updates row and returns version 2'
);

-- Calling put_blob with expected_version = 1 again (stale version) must raise VERSION_CONFLICT
SELECT throws_ok(
  $$SELECT public.put_blob(
      'mindsahaay_sec_4c8b1a7d2e9f0a3b',
      'ciphertext_v_stale',
      'iv_stale',
      'salt_stale',
      1
    )$$,
  'P0001',
  'VERSION_CONFLICT',
  'put_blob with stale expected_version must raise VERSION_CONFLICT'
);

-- Calling put_blob with expected_version = 2 succeeds and returns version 3
SELECT is(
  public.put_blob(
    'mindsahaay_sec_4c8b1a7d2e9f0a3b',
    'ciphertext_v3',
    'iv_v3',
    'salt_v3',
    2
  ),
  3,
  'put_blob with matching expected_version = 2 updates row and returns version 3'
);

-- Calling put_blob with an invalid slot must fail
SELECT throws_ok(
  $$SELECT public.put_blob(
      'invalid_slot_key',
      'ciphertext',
      'iv',
      'salt',
      0
    )$$,
  'P0001',
  'Invalid slot identifier',
  'put_blob with invalid slot must raise exception'
);

-- ------------------------------------------------------------------------------
-- 6. Test Set 5: Cascade Deletion on Profile Removal
-- ------------------------------------------------------------------------------
SET LOCAL ROLE postgres;

-- Insert safety card slot for student 2
INSERT INTO public.encrypted_blobs (user_id, slot, ciphertext, iv, salt, version)
VALUES (
  '17000002-0000-0000-0000-000000000002'::uuid,
  'mindsahaay_sec_7e1d4a9b2c8f0e3a',
  'ciphertext_safety',
  'iv_safe',
  'salt_safe',
  1
);

-- Delete student 2 profile
DELETE FROM public.profiles WHERE id = '17000002-0000-0000-0000-000000000002'::uuid;

-- All blobs belonging to student 2 must be cascade deleted
SELECT is_empty(
  'SELECT * FROM public.encrypted_blobs WHERE user_id = ''17000002-0000-0000-0000-000000000002''::uuid',
  'Deleting user profile must cascade-delete all their encrypted blobs'
);

SELECT * FROM finish();
ROLLBACK;
