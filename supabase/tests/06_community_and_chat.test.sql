-- ==============================================================================
-- Test File: 06_community_and_chat.test.sql
-- Description: pgTAP Test verifying Community Circles, Moderation, Zero-Knowledge
--              Thought Records, Chat Isolation, Message Retention, and Atomic Booking
-- ==============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
SELECT plan(13);

-- ------------------------------------------------------------------------------
-- 1. Setup Test Fixture Data
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_inst_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_student_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  v_student_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
  v_counsellor uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;
  v_moderator uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid;
  v_circle_id uuid := 'c1111111-1111-1111-1111-111111111111'::uuid;
  v_session_b uuid := 'abcdabcd-abcd-abcd-abcd-abcdabcdabcd'::uuid;
  v_slot_1 uuid := '55555555-5555-5555-5555-555555555551'::uuid;
  v_slot_2 uuid := '55555555-5555-5555-5555-555555555552'::uuid;
BEGIN
  -- Insert Institution
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst_id, 'Test National University', 'TNU', 'tnu.ac.in')
  ON CONFLICT (id) DO NOTHING;

  -- Ensure mock auth.users exist so FK on profiles(id) is satisfied
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_student_a, 'authenticated', 'authenticated', 'student_a_comm@test.com'),
      (v_student_b, 'authenticated', 'authenticated', 'student_b_comm@test.com'),
      (v_counsellor, 'authenticated', 'authenticated', 'counsellor_comm@test.com'),
      (v_moderator, 'authenticated', 'authenticated', 'moderator_comm@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Create profiles
  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES 
    (v_student_a, 'student', 'Student-A', 'en', v_inst_id),
    (v_student_b, 'student', 'Student-B', 'en', v_inst_id),
    (v_counsellor, 'counsellor', 'Dr. Counsellor', 'en', v_inst_id),
    (v_moderator, 'moderator', 'Campus Moderator', 'en', v_inst_id)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    alias = EXCLUDED.alias,
    institution_id = EXCLUDED.institution_id;

  -- Insert Counsellor Record
  INSERT INTO public.counsellors (id, license_number, specializations, verified, institution_id)
  VALUES (v_counsellor, 'RCI-TEST-001', ARRAY['CBT', 'Anxiety'], true, v_inst_id)
  ON CONFLICT (id) DO NOTHING;

  -- Availability slots for counsellor
  INSERT INTO public.availability_slots (id, counsellor_id, start_time, end_time, is_booked)
  VALUES 
    (v_slot_1, v_counsellor, now() + interval '2 days', now() + interval '2 days 50 minutes', false),
    (v_slot_2, v_counsellor, now() + interval '3 days', now() + interval '3 days 50 minutes', true)
  ON CONFLICT (id) DO NOTHING;

  -- Create public circle
  INSERT INTO public.circles (id, name, slug, description, category, is_private)
  VALUES (v_circle_id, 'Peer Stress Support', 'peer-stress-test', 'Support for academic pressure', 'stress', false)
  ON CONFLICT (id) DO NOTHING;

  -- Student B creates sensitive CBT Thought Record (Zero Knowledge)
  INSERT INTO public.thought_records (id, student_id, ciphertext, iv, salt)
  VALUES ('c0000001-0000-0000-0000-000000000001'::uuid, v_student_b, 'encrypted_cbt_thought_student_b', 'iv999', 'salt888');

  -- Student B creates Chat Session & Chat Messages (one active, one expired)
  INSERT INTO public.chat_sessions (id, user_id, title, risk_level)
  VALUES (v_session_b, v_student_b, 'Private Session B', 'low');

  INSERT INTO public.chat_messages (id, session_id, sender_role, encrypted_content, retention_expires_at, created_at)
  VALUES 
    ('f0000001-0000-0000-0000-000000000001'::uuid, v_session_b, 'user', 'enc_active_msg', now() + interval '20 days', now()),
    ('f0000002-0000-0000-0000-000000000002'::uuid, v_session_b, 'user', 'enc_expired_msg', now() - interval '2 days', now() - interval '32 days');

  -- Student B creates posts: one approved, one flagged
  INSERT INTO public.posts (id, circle_id, author_id, title, content, moderation_status)
  VALUES 
    ('e0000001-0000-0000-0000-000000000001'::uuid, v_circle_id, v_student_b, 'Approved Post', 'Safe peer reflection', 'approved'),
    ('e0000002-0000-0000-0000-000000000002'::uuid, v_circle_id, v_student_b, 'Flagged Post', 'Needs moderator review', 'flagged');

  -- Student B creates report
  INSERT INTO public.reports (id, reporter_id, resource_type, resource_id, reason, details)
  VALUES ('d0000001-0000-0000-0000-000000000001'::uuid, v_student_b, 'post', 'e0000001-0000-0000-0000-000000000001', 'spam', 'Testing report');
END $$;

-- ------------------------------------------------------------------------------
-- 2. Test Set 1: Zero-Knowledge Thought Records Isolation (Student A)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is_empty(
  'SELECT * FROM public.thought_records WHERE student_id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''::uuid',
  'Student A must NOT be able to view Student B zero-knowledge thought records'
);

PREPARE student_a_spoof_thought AS
  INSERT INTO public.thought_records (student_id, ciphertext, iv, salt)
  VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'malicious_payload', 'iv', 'salt');

SELECT throws_ok(
  'student_a_spoof_thought',
  '42501',
  NULL,
  'Student A must NOT be able to insert thought records for Student B'
);

-- ------------------------------------------------------------------------------
-- 3. Test Set 2: Chat Sessions & Messages Isolation
-- ------------------------------------------------------------------------------
SELECT is_empty(
  'SELECT * FROM public.chat_sessions WHERE user_id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''::uuid',
  'Student A must NOT be able to view Student B chat sessions'
);

SELECT is_empty(
  'SELECT * FROM public.chat_messages WHERE session_id = ''abcdabcd-abcd-abcd-abcd-abcdabcdabcd''::uuid',
  'Student A must NOT be able to view Student B chat messages'
);

PREPARE student_a_spoof_message AS
  INSERT INTO public.chat_messages (session_id, sender_role, encrypted_content)
  VALUES ('abcdabcd-abcd-abcd-abcd-abcdabcdabcd'::uuid, 'user', 'hacked');

SELECT throws_ok(
  'student_a_spoof_message',
  '42501',
  NULL,
  'Student A must NOT be able to insert messages into Student B chat session'
);

-- ------------------------------------------------------------------------------
-- 4. Test Set 3: Community Posts & Moderation RLS
-- ------------------------------------------------------------------------------
-- Student A CAN view approved posts
SELECT isnt_empty(
  'SELECT * FROM public.posts WHERE id = ''e0000001-0000-0000-0000-000000000001''::uuid',
  'Student A should be able to view approved community posts'
);

-- Student A CANNOT view flagged posts created by Student B
SELECT is_empty(
  'SELECT * FROM public.posts WHERE id = ''e0000002-0000-0000-0000-000000000002''::uuid',
  'Student A must NOT be able to view flagged community posts created by others'
);

-- Student A CANNOT view reports filed by Student B
SELECT is_empty(
  'SELECT * FROM public.reports WHERE reporter_id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''::uuid',
  'Student A must NOT be able to view moderation reports filed by Student B'
);

-- ------------------------------------------------------------------------------
-- 5. Test Set 4: Moderator Privileges
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT isnt_empty(
  'SELECT * FROM public.posts WHERE id = ''e0000002-0000-0000-0000-000000000002''::uuid',
  'Moderator MUST be able to view flagged community posts for review'
);

-- ------------------------------------------------------------------------------
-- 6. Test Set 5: Message Retention Purging Function
-- ------------------------------------------------------------------------------
SET LOCAL ROLE postgres;

SELECT isnt_empty(
  'SELECT * FROM public.chat_messages WHERE id = ''f0000002-0000-0000-0000-000000000002''::uuid',
  'Expired message should exist before purge execution'
);

SELECT cmp_ok(
  public.purge_expired_chat_messages(),
  '>=',
  1,
  'purge_expired_chat_messages should remove at least 1 expired message'
);

-- ------------------------------------------------------------------------------
-- 7. Test Set 6: Atomic Slot Booking & Double-Booking Prevention
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- Student A books slot 1 successfully
SELECT lives_ok(
  $$SELECT public.book_appointment_atomic(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
      '55555555-5555-5555-5555-555555555551'::uuid,
      'Initial consultation'
    )$$,
  'Student A books available slot atomically'
);

-- Attempting to book already-booked slot (slot 2) must throw an exception
PREPARE book_already_booked_slot AS
  SELECT public.book_appointment_atomic(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    '55555555-5555-5555-5555-555555555552'::uuid,
    'Attempt double booking'
  );

SELECT throws_ok(
  'book_already_booked_slot',
  'P0001', -- RAISE EXCEPTION
  'Slot is already booked',
  'Attempt to book an already booked slot must fail'
);

SELECT * FROM finish();
ROLLBACK;
