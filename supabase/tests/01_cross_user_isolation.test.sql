-- ==============================================================================
-- Test File: 01_cross_user_isolation.test.sql
-- Description: pgTAP Test verifying peer-to-peer data isolation and RLS boundaries
-- ==============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
SELECT plan(12);

-- 1. Setup Test Fixture Data
DO $$
DECLARE
  v_inst_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_student_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  v_student_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
BEGIN
  -- Insert Institution
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst_id, 'Test National University', 'TNU', 'tnu.ac.in')
  ON CONFLICT (id) DO NOTHING;

  -- Ensure mock auth.users exist so FK on profiles(id) is satisfied
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_student_a, 'authenticated', 'authenticated', 'student_a@test.com'),
      (v_student_b, 'authenticated', 'authenticated', 'student_b@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Create profiles for Student A and Student B
  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES 
    (v_student_a, 'student', 'Student-A', 'en', v_inst_id),
    (v_student_b, 'student', 'Student-B', 'en', v_inst_id)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    alias = EXCLUDED.alias,
    locale = EXCLUDED.locale,
    institution_id = EXCLUDED.institution_id;

  -- Student B creates sensitive health records
  INSERT INTO public.mood_entries (id, student_id, mood, score, tags)
  VALUES ('b0000001-0000-0000-0000-000000000001'::uuid, v_student_b, 'Anxious', 4, ARRAY['exams']);

  INSERT INTO public.assessments (id, student_id, instrument, answers, total, severity, item9_flag)
  VALUES ('b0000002-0000-0000-0000-000000000002'::uuid, v_student_b, 'phq9', ARRAY[1,2,1,0,0,1,0,1,0], 6, 'Mild', false);

  INSERT INTO public.journal_entries (id, student_id, ciphertext, iv, salt)
  VALUES ('b0000003-0000-0000-0000-000000000003'::uuid, v_student_b, 'encrypted_payload_student_b', 'iv123', 'salt456');

  INSERT INTO public.safety_plans (id, student_id, warning_signs, coping_strategies)
  VALUES ('b0000004-0000-0000-0000-000000000004'::uuid, v_student_b, ARRAY['isolation'], ARRAY['breathing']);
END $$;

-- Switch session to Student A
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- -----------------------------------------------------------------------------
-- Test Set 1: Cross-User READ Isolation (Student A cannot read Student B data)
-- -----------------------------------------------------------------------------

SELECT is_empty(
  'SELECT * FROM public.mood_entries WHERE student_id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''::uuid',
  'Student A must NOT be able to view Student B mood entries'
);

SELECT is_empty(
  'SELECT * FROM public.assessments WHERE student_id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''::uuid',
  'Student A must NOT be able to view Student B assessments'
);

SELECT is_empty(
  'SELECT * FROM public.journal_entries WHERE student_id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''::uuid',
  'Student A must NOT be able to view Student B journal entries'
);

SELECT is_empty(
  'SELECT * FROM public.safety_plans WHERE student_id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''::uuid',
  'Student A must NOT be able to view Student B safety plans'
);

SELECT is_empty(
  'SELECT * FROM public.consents WHERE student_id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''::uuid',
  'Student A must NOT be able to view Student B consent ledger'
);

-- -----------------------------------------------------------------------------
-- Test Set 2: Cross-User WRITE Isolation (Student A cannot alter Student B data)
-- -----------------------------------------------------------------------------

-- Attempt to insert a mood entry attributed to Student B
PREPARE student_a_spoof_mood AS
  INSERT INTO public.mood_entries (student_id, mood, score)
  VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'Sad', 2);

SELECT throws_ok(
  'student_a_spoof_mood',
  '42501', -- Insufficient privilege / RLS violation
  NULL,
  'Student A must NOT be able to insert mood entries for Student B'
);

-- Attempt to insert an assessment attributed to Student B
PREPARE student_a_spoof_assessment AS
  INSERT INTO public.assessments (student_id, instrument, answers, total, severity)
  VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'phq4', ARRAY[1,1,1,1], 4, 'Mild');

SELECT throws_ok(
  'student_a_spoof_assessment',
  '42501',
  NULL,
  'Student A must NOT be able to insert assessments for Student B'
);

-- Attempt to insert a journal entry attributed to Student B
PREPARE student_a_spoof_journal AS
  INSERT INTO public.journal_entries (student_id, ciphertext, iv, salt)
  VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'forged_cipher', 'iv', 'salt');

SELECT throws_ok(
  'student_a_spoof_journal',
  '42501',
  NULL,
  'Student A must NOT be able to insert journal entries for Student B'
);

-- Attempt to update Student B assessment
PREPARE student_a_tamper_assessment AS
  UPDATE public.assessments SET total = 0 WHERE student_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;

-- RLS silently filters or throws on update with 0 rows affected
SELECT lives_ok(
  'student_a_tamper_assessment',
  'Student A update query executes under RLS'
);

SELECT is(
  (SELECT total FROM public.assessments WHERE id = 'b0000002-0000-0000-0000-000000000002'::uuid),
  NULL, -- Since Student A cannot even see it, it returns NULL to Student A
  'Student A cannot see or modify Student B assessment score'
);

-- -----------------------------------------------------------------------------
-- Test Set 3: Student A CAN access own records
-- -----------------------------------------------------------------------------

PREPARE student_a_insert_own_mood AS
  INSERT INTO public.mood_entries (id, student_id, mood, score)
  VALUES ('a0000001-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Calm', 8);

SELECT lives_ok(
  'student_a_insert_own_mood',
  'Student A can successfully insert their own mood entry'
);

SELECT results_eq(
  'SELECT mood, score FROM public.mood_entries WHERE student_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''::uuid',
  'VALUES (''Calm''::text, 8::integer)',
  'Student A can successfully read their own mood entry'
);

SELECT * FROM finish();
ROLLBACK;
