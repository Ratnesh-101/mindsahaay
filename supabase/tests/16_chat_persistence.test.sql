-- ==============================================================================
-- Test File: 16_chat_persistence.test.sql
-- Description: pgTAP tests for Wave 3 Chat Persistence
-- Tests:
--   1. Chat isolation between students
--   2. Zero access for counsellors, moderators, and admins
--   3. sender_role check constraint and insert policy ('user', 'assistant' only)
--   4. Trigger overriding client-provided created_at and retention_expires_at
--   5. Expired-row invisibility in SELECT policy
--   6. Session constraints (title, retention_ttl_days) and unique (session_id, seq)
--   7. Purge function removing expired messages and empty old sessions
--   8. Cascade deletion on session delete and profile delete
-- ==============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
SELECT plan(28);

-- ------------------------------------------------------------------------------
-- 1. Setup Test Fixture Data
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_inst_id uuid := '16161616-1616-1616-1616-161616161616'::uuid;
  v_student_1 uuid := '16000001-0000-0000-0000-000000000001'::uuid;
  v_student_2 uuid := '16000002-0000-0000-0000-000000000002'::uuid;
  v_counsellor uuid := '16000003-0000-0000-0000-000000000003'::uuid;
  v_moderator uuid := '16000004-0000-0000-0000-000000000004'::uuid;
  v_admin uuid := '16000005-0000-0000-0000-000000000005'::uuid;
  v_session_1 uuid := '16111111-1111-1111-1111-111111111111'::uuid;
  v_session_2 uuid := '16222222-2222-2222-2222-222222222222'::uuid;
BEGIN
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst_id, 'Chat Test University', 'CTU', 'ctu.ac.in')
  ON CONFLICT (id) DO NOTHING;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_student_1, 'authenticated', 'authenticated', 'chat_student1@test.com'),
      (v_student_2, 'authenticated', 'authenticated', 'chat_student2@test.com'),
      (v_counsellor, 'authenticated', 'authenticated', 'chat_counsellor@test.com'),
      (v_moderator, 'authenticated', 'authenticated', 'chat_moderator@test.com'),
      (v_admin, 'authenticated', 'authenticated', 'chat_admin@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES 
    (v_student_1, 'student', 'ChatStudent1', 'en', v_inst_id),
    (v_student_2, 'student', 'ChatStudent2', 'en', v_inst_id),
    (v_counsellor, 'counsellor', 'Dr. ChatCounsellor', 'en', v_inst_id),
    (v_moderator, 'moderator', 'ChatModerator', 'en', v_inst_id),
    (v_admin, 'institution_admin', 'ChatDean', 'en', v_inst_id)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    alias = EXCLUDED.alias,
    institution_id = EXCLUDED.institution_id;

  INSERT INTO public.counsellors (id, license_number, verified, institution_id)
  VALUES (v_counsellor, 'RCI-CHAT-01', true, v_inst_id)
  ON CONFLICT (id) DO NOTHING;

  -- Care share between Student 1 and Counsellor (scope all)
  INSERT INTO public.care_shares (student_id, counsellor_id, active, scope)
  VALUES (v_student_1, v_counsellor, true, ARRAY['all'])
  ON CONFLICT (id) DO NOTHING;

  -- Create initial session for Student 1
  INSERT INTO public.chat_sessions (id, user_id, title, salt, key_version)
  VALUES (v_session_1, v_student_1, 'Well-being Chat', 'c2FsdF9zZXNzaW9uXzE=', 1);

  -- Insert active message for Student 1
  INSERT INTO public.chat_messages (id, session_id, sender_role, encrypted_content, iv, seq)
  VALUES ('16000000-0000-0000-0000-000000000001'::uuid, v_session_1, 'user', 'enc_content_1', 'iv_1', 1);

  -- Create session for Student 2
  INSERT INTO public.chat_sessions (id, user_id, title, salt, key_version)
  VALUES (v_session_2, v_student_2, 'Well-being Chat', 'c2FsdF9zZXNzaW9uXzI=', 1);
END $$;

-- ------------------------------------------------------------------------------
-- 2. Test Set 1: Chat Isolation Between Students
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "16000002-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '16000002-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is_empty(
  'SELECT * FROM public.chat_sessions WHERE id = ''16111111-1111-1111-1111-111111111111''::uuid',
  'Student 2 must NOT be able to view Student 1 chat sessions'
);

SELECT is_empty(
  'SELECT * FROM public.chat_messages WHERE session_id = ''16111111-1111-1111-1111-111111111111''::uuid',
  'Student 2 must NOT be able to view Student 1 chat messages'
);

PREPARE student_2_spoof_message AS
  INSERT INTO public.chat_messages (session_id, sender_role, encrypted_content, iv, seq)
  VALUES ('16111111-1111-1111-1111-111111111111'::uuid, 'user', 'hacked', 'iv', 2);

SELECT throws_ok(
  'student_2_spoof_message',
  '42501',
  NULL,
  'Student 2 must NOT be able to insert messages into Student 1 chat session'
);

PREPARE student_2_delete_session AS
  DELETE FROM public.chat_sessions WHERE id = '16111111-1111-1111-1111-111111111111'::uuid;

-- Student 2 attempting to delete Student 1 session deletes 0 rows
SELECT lives_ok('student_2_delete_session', 'Delete statement executes under RLS');

SET LOCAL ROLE postgres;
SELECT isnt_empty(
  'SELECT * FROM public.chat_sessions WHERE id = ''16111111-1111-1111-1111-111111111111''::uuid',
  'Student 1 session must still exist after Student 2 attempted delete'
);

-- ------------------------------------------------------------------------------
-- 3. Test Set 2: Zero Counsellor, Moderator, and Admin Access
-- ------------------------------------------------------------------------------
-- Counsellor has active care share, but must have ZERO access to chat
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "16000003-0000-0000-0000-000000000003", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '16000003-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is_empty(
  'SELECT * FROM public.chat_sessions WHERE id = ''16111111-1111-1111-1111-111111111111''::uuid',
  'Counsellor must NOT be able to view Student 1 chat sessions even with active care share'
);

SELECT is_empty(
  'SELECT * FROM public.chat_messages WHERE session_id = ''16111111-1111-1111-1111-111111111111''::uuid',
  'Counsellor must NOT be able to view Student 1 chat messages'
);

PREPARE counsellor_insert_chat AS
  INSERT INTO public.chat_messages (session_id, sender_role, encrypted_content, iv, seq)
  VALUES ('16111111-1111-1111-1111-111111111111'::uuid, 'user', 'counsellor_msg', 'iv', 2);

SELECT throws_ok(
  'counsellor_insert_chat',
  '42501',
  NULL,
  'Counsellor must NOT be able to insert messages into Student 1 chat session'
);

-- Moderator access check
SET LOCAL "request.jwt.claims" = '{"sub": "16000004-0000-0000-0000-000000000004", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '16000004-0000-0000-0000-000000000004';

SELECT is_empty(
  'SELECT * FROM public.chat_sessions WHERE id = ''16111111-1111-1111-1111-111111111111''::uuid',
  'Moderator must NOT be able to view student chat sessions'
);

-- Admin access check
SET LOCAL "request.jwt.claims" = '{"sub": "16000005-0000-0000-0000-000000000005", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '16000005-0000-0000-0000-000000000005';

SELECT is_empty(
  'SELECT * FROM public.chat_sessions WHERE id = ''16111111-1111-1111-1111-111111111111''::uuid',
  'Institution Admin must NOT be able to view student chat sessions'
);

-- ------------------------------------------------------------------------------
-- 4. Test Set 3: sender_role Check Constraint & Policy
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "16000001-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '16000001-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

PREPARE insert_invalid_role_counsellor AS
  INSERT INTO public.chat_messages (session_id, sender_role, encrypted_content, iv, seq)
  VALUES ('16111111-1111-1111-1111-111111111111'::uuid, 'counsellor', 'enc', 'iv', 2);

SELECT throws_ok(
  'insert_invalid_role_counsellor',
  NULL,
  NULL,
  'Inserting chat message with sender_role = counsellor must fail'
);

PREPARE insert_invalid_role_system AS
  INSERT INTO public.chat_messages (session_id, sender_role, encrypted_content, iv, seq)
  VALUES ('16111111-1111-1111-1111-111111111111'::uuid, 'system', 'enc', 'iv', 2);

SELECT throws_ok(
  'insert_invalid_role_system',
  NULL,
  NULL,
  'Inserting chat message with sender_role = system must fail'
);

PREPARE insert_valid_role_assistant AS
  INSERT INTO public.chat_messages (session_id, sender_role, encrypted_content, iv, seq)
  VALUES ('16111111-1111-1111-1111-111111111111'::uuid, 'assistant', 'enc_assistant_reply', 'iv_assist', 2);

SELECT lives_ok(
  'insert_valid_role_assistant',
  'Inserting chat message with sender_role = assistant must succeed'
);

-- ------------------------------------------------------------------------------
-- 5. Test Set 4: Trigger Overriding Client Dates
-- ------------------------------------------------------------------------------
PREPARE insert_spoofed_dates AS
  INSERT INTO public.chat_messages (id, session_id, sender_role, encrypted_content, iv, seq, created_at, retention_expires_at)
  VALUES (
    '16000000-0000-0000-0000-000000000099'::uuid,
    '16111111-1111-1111-1111-111111111111'::uuid,
    'user',
    'enc_spoofed_dates',
    'iv_spoof',
    3,
    now() - interval '10 days',
    now() + interval '5 days'
  );

SELECT lives_ok('insert_spoofed_dates', 'Insert message with client-supplied dates succeeds');

-- Trigger must have overwritten created_at to now() and retention_expires_at to now() + 30 days
SELECT isnt_empty(
  'SELECT * FROM public.chat_messages WHERE id = ''16000000-0000-0000-0000-000000000099''::uuid AND created_at >= (now() - interval ''1 minute'')',
  'Trigger must override client created_at with current timestamp'
);

SELECT isnt_empty(
  'SELECT * FROM public.chat_messages WHERE id = ''16000000-0000-0000-0000-000000000099''::uuid AND retention_expires_at >= (now() + interval ''29 days'')',
  'Trigger must override client retention_expires_at with now() + 30 days'
);

-- ------------------------------------------------------------------------------
-- 6. Test Set 5: Expired-Row Invisibility in SELECT Policy
-- ------------------------------------------------------------------------------
-- Superuser sets message 99 to expired
SET LOCAL ROLE postgres;
UPDATE public.chat_messages
SET retention_expires_at = now() - interval '1 hour'
WHERE id = '16000000-0000-0000-0000-000000000099'::uuid;

-- Student 1 queries messages
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "16000001-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '16000001-0000-0000-0000-000000000001';

SELECT is_empty(
  'SELECT * FROM public.chat_messages WHERE id = ''16000000-0000-0000-0000-000000000099''::uuid',
  'Expired chat message must be invisible to student under SELECT policy'
);

-- Active message 1 must still be visible
SELECT isnt_empty(
  'SELECT * FROM public.chat_messages WHERE id = ''16000000-0000-0000-0000-000000000001''::uuid',
  'Active message must remain visible to student'
);

-- ------------------------------------------------------------------------------
-- 7. Test Set 6: Session Constraints & Unique (session_id, seq)
-- ------------------------------------------------------------------------------
PREPARE insert_invalid_title AS
  INSERT INTO public.chat_sessions (user_id, title, salt)
  VALUES ('16000001-0000-0000-0000-000000000001'::uuid, 'Custom Unallowed Title', 'salt');

SELECT throws_ok(
  'insert_invalid_title',
  '23514',
  NULL,
  'Chat session with title other than Well-being Chat must violate check constraint'
);

PREPARE insert_invalid_ttl AS
  INSERT INTO public.chat_sessions (user_id, title, retention_ttl_days, salt)
  VALUES ('16000001-0000-0000-0000-000000000001'::uuid, 'Well-being Chat', 60, 'salt');

SELECT throws_ok(
  'insert_invalid_ttl',
  '23514',
  NULL,
  'Chat session with retention_ttl_days other than 30 must violate check constraint'
);

PREPARE insert_duplicate_seq AS
  INSERT INTO public.chat_messages (session_id, sender_role, encrypted_content, iv, seq)
  VALUES ('16111111-1111-1111-1111-111111111111'::uuid, 'user', 'duplicate_seq', 'iv_dup', 1);

SELECT throws_ok(
  'insert_duplicate_seq',
  '23505',
  NULL,
  'Chat message with duplicate (session_id, seq) must violate unique constraint'
);

-- ------------------------------------------------------------------------------
-- 8. Test Set 7: Message and Empty Old Session Purge
-- ------------------------------------------------------------------------------
SET LOCAL ROLE postgres;

DO $$
DECLARE
  v_old_session uuid := '16333333-3333-3333-3333-333333333333'::uuid;
  v_old_empty_session uuid := '16444444-4444-4444-4444-444444444444'::uuid;
  v_fresh_empty_session uuid := '16555555-5555-5555-5555-555555555555'::uuid;
  v_student_1 uuid := '16000001-0000-0000-0000-000000000001'::uuid;
BEGIN
  -- Old session with 1 expired message
  INSERT INTO public.chat_sessions (id, user_id, title, salt)
  VALUES (v_old_session, v_student_1, 'Well-being Chat', 'c2FsdF9vbGQ=');

  INSERT INTO public.chat_messages (id, session_id, sender_role, encrypted_content, iv, seq)
  VALUES ('16000000-0000-0000-0000-000000000088'::uuid, v_old_session, 'user', 'enc_exp', 'iv', 1);

  -- Manually adjust dates to simulate age
  UPDATE public.chat_messages
  SET retention_expires_at = now() - interval '5 days',
      created_at = now() - interval '35 days'
  WHERE id = '16000000-0000-0000-0000-000000000088'::uuid;

  UPDATE public.chat_sessions
  SET created_at = now() - interval '35 days'
  WHERE id = v_old_session;

  -- Old empty session (> 30 days old)
  INSERT INTO public.chat_sessions (id, user_id, title, salt)
  VALUES (v_old_empty_session, v_student_1, 'Well-being Chat', 'c2FsdF9vbGRfZW1wdHk=');

  UPDATE public.chat_sessions
  SET created_at = now() - interval '35 days'
  WHERE id = v_old_empty_session;

  -- Fresh empty session (only 2 days old)
  INSERT INTO public.chat_sessions (id, user_id, title, salt)
  VALUES (v_fresh_empty_session, v_student_1, 'Well-being Chat', 'c2FsdF9mcmVzaF9lbXB0eQ==');
END $$;

-- Run purge
SELECT cmp_ok(
  public.purge_expired_chat_messages(),
  '>=',
  2,
  'Purge should delete expired messages and empty old sessions'
);

SELECT is_empty(
  'SELECT * FROM public.chat_messages WHERE id = ''16000000-0000-0000-0000-000000000088''::uuid',
  'Expired message 88 must be deleted by purge'
);

SELECT is_empty(
  'SELECT * FROM public.chat_sessions WHERE id = ''16333333-3333-3333-3333-333333333333''::uuid',
  'Old session (now empty and > 30 days) must be deleted by purge'
);

SELECT is_empty(
  'SELECT * FROM public.chat_sessions WHERE id = ''16444444-4444-4444-4444-444444444444''::uuid',
  'Old empty session (> 30 days) must be deleted by purge'
);

SELECT isnt_empty(
  'SELECT * FROM public.chat_sessions WHERE id = ''16555555-5555-5555-5555-555555555555''::uuid',
  'Fresh empty session (< 30 days old) must NOT be deleted by purge'
);

-- ------------------------------------------------------------------------------
-- 9. Test Set 8: Cascade Deletion
-- ------------------------------------------------------------------------------
-- Delete session cascades to its messages
DELETE FROM public.chat_sessions WHERE id = '16111111-1111-1111-1111-111111111111'::uuid;

SELECT is_empty(
  'SELECT * FROM public.chat_messages WHERE session_id = ''16111111-1111-1111-1111-111111111111''::uuid',
  'Deleting chat session must cascade-delete all its messages'
);

-- Delete student 2 profile cascades to student 2 chat sessions
DELETE FROM public.profiles WHERE id = '16000002-0000-0000-0000-000000000002'::uuid;

SELECT is_empty(
  'SELECT * FROM public.chat_sessions WHERE user_id = ''16000002-0000-0000-0000-000000000002''::uuid',
  'Deleting user profile must cascade-delete all their chat sessions'
);

SELECT * FROM finish();
ROLLBACK;
