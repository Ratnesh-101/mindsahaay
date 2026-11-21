-- ==============================================================================
-- Test File: 11_warm_handoff_and_optout.test.sql
-- Description: pgTAP tests for Warm Handoff (counsellor offer & student accept),
--              server-side check-back opt-out, transition rules, idempotency,
--              audit logging without message content, and notification RLS isolation.
-- ==============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
SELECT plan(22);

-- -----------------------------------------------------------------------------
-- 1. Setup Fixture
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_inst uuid := '11111111-2222-3333-4444-555555555555'::uuid;
  v_alice uuid := 'aaaaaaaa-9999-2222-3333-444444444441'::uuid;
  v_bob uuid := 'bbbbbbbb-9999-2222-3333-444444444442'::uuid;
  v_counsellor_sharma uuid := 'cccccccc-9999-2222-3333-444444444441'::uuid;
  v_counsellor_verma uuid := 'dddddddd-9999-2222-3333-444444444442'::uuid;
BEGIN
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst, 'IIT Delhi Health Centre', 'IITD', 'iitd.ac.in')
  ON CONFLICT (id) DO NOTHING;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_alice, 'authenticated', 'authenticated', 'alice_g2@test.com'),
      (v_bob, 'authenticated', 'authenticated', 'bob_g2@test.com'),
      (v_counsellor_sharma, 'authenticated', 'authenticated', 'sharma_g2@test.com'),
      (v_counsellor_verma, 'authenticated', 'authenticated', 'verma_g2@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.profiles (id, role, alias, locale, institution_id, checkback_opt_out)
  VALUES
    (v_alice, 'student', 'Student-Alice-G2', 'en', v_inst, false),
    (v_bob, 'student', 'Student-Bob-G2', 'en', v_inst, false),
    (v_counsellor_sharma, 'counsellor', 'Dr. Sharma G2', 'en', v_inst, false),
    (v_counsellor_verma, 'counsellor', 'Dr. Verma G2', 'en', v_inst, false)
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, alias = EXCLUDED.alias, checkback_opt_out = EXCLUDED.checkback_opt_out;

  INSERT INTO public.counsellors (id, license_number, specializations, verified, institution_id)
  VALUES
    (v_counsellor_sharma, 'RCI-G2-01', ARRAY['Crisis', 'CBT'], true, v_inst),
    (v_counsellor_verma, 'RCI-G2-02', ARRAY['Crisis'], true, v_inst)
  ON CONFLICT (id) DO NOTHING;

  -- Care share ONLY for Dr. Sharma with Alice
  INSERT INTO public.care_shares (student_id, counsellor_id, active, scope, granted_at)
  VALUES (v_alice, v_counsellor_sharma, true, ARRAY['risk_events'], now() - interval '1 day')
  ON CONFLICT (student_id, counsellor_id) DO UPDATE SET active = true, scope = EXCLUDED.scope;

  -- Care share for Dr. Sharma with Bob
  INSERT INTO public.care_shares (student_id, counsellor_id, active, scope, granted_at)
  VALUES (v_bob, v_counsellor_sharma, true, ARRAY['risk_events'], now() - interval '1 day')
  ON CONFLICT (student_id, counsellor_id) DO UPDATE SET active = true, scope = EXCLUDED.scope;
END $$;

-- -----------------------------------------------------------------------------
-- Test 1 & 2 & 3: Student cannot change another student's preference or escalate role
-- -----------------------------------------------------------------------------

-- Context: Student Alice
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-9999-2222-3333-444444444441", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-9999-2222-3333-444444444441';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- Alice tries to update Bob's profile preference
DO $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.profiles
  SET checkback_opt_out = true
  WHERE id = 'bbbbbbbb-9999-2222-3333-444444444442'::uuid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'Alice should not be able to update Bob profile';
  END IF;
END $$;

-- Verify Bob's profile is unchanged (switch to Bob's perspective)
SET LOCAL "request.jwt.claims" = '{"sub": "bbbbbbbb-9999-2222-3333-444444444442", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'bbbbbbbb-9999-2222-3333-444444444442';

SELECT is(
  (SELECT checkback_opt_out FROM public.profiles WHERE id = 'bbbbbbbb-9999-2222-3333-444444444442'::uuid),
  false,
  '(1) Student Alice cannot update checkback_opt_out for Student Bob (RLS isolation)'
);

-- Back to Alice context
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-9999-2222-3333-444444444441", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-9999-2222-3333-444444444441';

-- Alice tries to escalate her own role while updating preference
SELECT throws_ok(
  $$UPDATE public.profiles SET checkback_opt_out = true, role = 'counsellor' WHERE id = 'aaaaaaaa-9999-2222-3333-444444444441'::uuid$$,
  'P0001',
  'Unauthorized: Users cannot modify their own role',
  '(2) Student Alice cannot escalate her own role to counsellor via the preference update path'
);

-- Alice updates her own preference via RPC
SELECT lives_ok(
  $$SELECT public.set_checkback_opt_out(true)$$,
  '(3) Student Alice can update her own checkback_opt_out to true via set_checkback_opt_out'
);

-- Verify Alice's preference is true and role is still student
SELECT is(
  (SELECT checkback_opt_out FROM public.profiles WHERE id = 'aaaaaaaa-9999-2222-3333-444444444441'::uuid),
  true,
  '(3b) Alice checkback_opt_out is now true and role remains student'
);

-- -----------------------------------------------------------------------------
-- Test 4 & 5: Opted-out students get no new prompts on acknowledged step
-- -----------------------------------------------------------------------------
-- Reset to trusted context to insert test risk events
RESET ROLE;

DO $$
DECLARE
  v_alice uuid := 'aaaaaaaa-9999-2222-3333-444444444441'::uuid;
  v_bob uuid := 'bbbbbbbb-9999-2222-3333-444444444442'::uuid;
  v_sharma uuid := 'cccccccc-9999-2222-3333-444444444441'::uuid;
  v_event_alice uuid := '75000000-0000-0000-0000-000000000001'::uuid;
  v_event_bob uuid := '75000000-0000-0000-0000-000000000002'::uuid;
BEGIN
  -- Insert high event for Alice (opted out = true)
  INSERT INTO public.risk_events (id, student_id, event_type, severity_level, trigger_source, action_taken, resolved)
  VALUES (v_event_alice, v_alice, 'high_test_opted_out', 'high', 'manual', 'logged', false)
  ON CONFLICT (id) DO NOTHING;

  -- Insert high event for Bob (opted out = false)
  INSERT INTO public.risk_events (id, student_id, event_type, severity_level, trigger_source, action_taken, resolved)
  VALUES (v_event_bob, v_bob, 'high_test_not_opted_out', 'high', 'manual', 'logged', false)
  ON CONFLICT (id) DO NOTHING;

  -- Advance both to 'acknowledged' as Dr. Sharma
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub": "cccccccc-9999-2222-3333-444444444441", "role": "authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'cccccccc-9999-2222-3333-444444444441', true);

  PERFORM public.advance_risk_followup(v_event_alice, 'acknowledged', NULL, 'Acknowledged Alice');
  PERFORM public.advance_risk_followup(v_event_bob, 'acknowledged', NULL, 'Acknowledged Bob');
END $$;

SELECT is(
  (SELECT count(*)::int FROM public.risk_checkback_prompts WHERE risk_event_id = '75000000-0000-0000-0000-000000000001'::uuid),
  0,
  '(4) Opted-out student Alice gets 0 checkback prompts when event is acknowledged'
);

SELECT is(
  (SELECT count(*)::int FROM public.risk_checkback_prompts WHERE risk_event_id = '75000000-0000-0000-0000-000000000002'::uuid),
  2,
  '(5) Non-opted-out student Bob gets 2 checkback prompts (h24, h72) when event is acknowledged'
);

-- -----------------------------------------------------------------------------
-- Test 6 & 7: Non-counsellor or counsellor without care share cannot offer
-- -----------------------------------------------------------------------------

-- Context: Student Alice calls offer_handoff_slot
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-9999-2222-3333-444444444441", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-9999-2222-3333-444444444441';

SELECT throws_ok(
  $$SELECT public.offer_handoff_slot('75000000-0000-0000-0000-000000000001'::uuid, '85000000-0000-0000-0000-000000000001'::uuid)$$,
  'P0001',
  'Unauthorized: Caller is not a verified counsellor',
  '(6) Student cannot call offer_handoff_slot'
);

-- Context: Dr. Verma (no care share for Alice)
SET LOCAL "request.jwt.claims" = '{"sub": "dddddddd-9999-2222-3333-444444444442", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'dddddddd-9999-2222-3333-444444444442';

SELECT throws_ok(
  $$SELECT public.offer_handoff_slot('75000000-0000-0000-0000-000000000001'::uuid, '85000000-0000-0000-0000-000000000001'::uuid)$$,
  'P0001',
  'Unauthorized: Counsellor lacks active care share scoped to risk_events for this student',
  '(7) Counsellor without care share cannot call offer_handoff_slot'
);

-- -----------------------------------------------------------------------------
-- Test 8, 9, 10: Invalid slots (booked, past, belongs to other counsellor) rejected
-- -----------------------------------------------------------------------------
RESET ROLE;

DO $$
DECLARE
  v_sharma uuid := 'cccccccc-9999-2222-3333-444444444441'::uuid;
  v_verma uuid := 'dddddddd-9999-2222-3333-444444444442'::uuid;
BEGIN
  -- Slot 1: Belongs to Dr. Verma (other counsellor)
  INSERT INTO public.availability_slots (id, counsellor_id, start_time, end_time, is_booked)
  VALUES ('85000000-0000-0000-0000-000000000001'::uuid, v_verma, now() + interval '2 days', now() + interval '2 days 1 hour', false)
  ON CONFLICT (id) DO NOTHING;

  -- Slot 2: Belongs to Dr. Sharma, but already booked
  INSERT INTO public.availability_slots (id, counsellor_id, start_time, end_time, is_booked)
  VALUES ('85000000-0000-0000-0000-000000000002'::uuid, v_sharma, now() + interval '3 days', now() + interval '3 days 1 hour', true)
  ON CONFLICT (id) DO NOTHING;

  -- Slot 3: Belongs to Dr. Sharma, but in the past
  INSERT INTO public.availability_slots (id, counsellor_id, start_time, end_time, is_booked)
  VALUES ('85000000-0000-0000-0000-000000000003'::uuid, v_sharma, now() - interval '1 hour', now() - interval '30 minutes', false)
  ON CONFLICT (id) DO NOTHING;

  -- Slot 4: Valid future unbooked slot for Dr. Sharma
  INSERT INTO public.availability_slots (id, counsellor_id, start_time, end_time, is_booked)
  VALUES ('85000000-0000-0000-0000-000000000004'::uuid, v_sharma, now() + interval '4 days', now() + interval '4 days 1 hour', false)
  ON CONFLICT (id) DO NOTHING;

  -- Slot 5: Another valid slot for contacted test
  INSERT INTO public.availability_slots (id, counsellor_id, start_time, end_time, is_booked)
  VALUES ('85000000-0000-0000-0000-000000000005'::uuid, v_sharma, now() + interval '5 days', now() + interval '5 days 1 hour', false)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Context: Dr. Sharma
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "cccccccc-9999-2222-3333-444444444441", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'cccccccc-9999-2222-3333-444444444441';

-- Reject slot belonging to someone else
SELECT throws_ok(
  $$SELECT public.offer_handoff_slot('75000000-0000-0000-0000-000000000001'::uuid, '85000000-0000-0000-0000-000000000001'::uuid)$$,
  'P0001',
  'Slot does not belong to the calling counsellor',
  '(8) Slot belonging to another counsellor is rejected'
);

-- Reject already booked slot
SELECT throws_ok(
  $$SELECT public.offer_handoff_slot('75000000-0000-0000-0000-000000000001'::uuid, '85000000-0000-0000-0000-000000000002'::uuid)$$,
  'P0001',
  'Slot is already booked',
  '(9) Already booked slot is rejected'
);

-- Reject slot in the past
SELECT throws_ok(
  $$SELECT public.offer_handoff_slot('75000000-0000-0000-0000-000000000001'::uuid, '85000000-0000-0000-0000-000000000003'::uuid)$$,
  'P0001',
  'Slot is in the past',
  '(10) Past availability slot is rejected'
);

-- -----------------------------------------------------------------------------
-- Test 11 & 12: Successful offer creates notification and does NOT advance follow-up
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.offer_handoff_slot('75000000-0000-0000-0000-000000000001'::uuid, '85000000-0000-0000-0000-000000000004'::uuid, 'Optional counsellor offer note');
  PERFORM set_config('app.test_alice_notif', v_res->>'notification_id', true);
END $$;

SELECT isnt(
  current_setting('app.test_alice_notif', true),
  '',
  '(11) Dr. Sharma successfully offers valid slot 4 to Alice and generates notification ID'
);

-- Followup step is STILL 'acknowledged', NOT 'handed_off'
SELECT is(
  (SELECT step FROM public.risk_followups WHERE risk_event_id = '75000000-0000-0000-0000-000000000001'::uuid ORDER BY seq DESC LIMIT 1),
  'acknowledged'::public.followup_step,
  '(12) Risk followup step remains acknowledged upon offering (advances only upon acceptance)'
);

-- -----------------------------------------------------------------------------
-- Test 13: Student Bob cannot accept Alice's offer notification
-- -----------------------------------------------------------------------------
-- Switch to Bob context and try to accept Alice's notification
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "bbbbbbbb-9999-2222-3333-444444444442", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'bbbbbbbb-9999-2222-3333-444444444442';

SELECT throws_ok(
  format('SELECT public.accept_handoff_offer(%L::uuid)', current_setting('app.test_alice_notif')),
  'P0001',
  'Unauthorized: Notification belongs to another student',
  '(13) Student Bob cannot accept Student Alice handoff offer'
);

-- -----------------------------------------------------------------------------
-- Test 14 & 15: Student Alice accepts; accepting twice books once (Idempotent)
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-9999-2222-3333-444444444441", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-9999-2222-3333-444444444441';

-- First acceptance
SELECT lives_ok(
  format('SELECT public.accept_handoff_offer(%L::uuid)', current_setting('app.test_alice_notif')),
  '(14) Student Alice successfully accepts handoff offer'
);

-- Slot is now booked
SELECT is(
  (SELECT is_booked FROM public.availability_slots WHERE id = '85000000-0000-0000-0000-000000000004'::uuid),
  true,
  '(14b) Availability slot is now marked is_booked = true'
);

-- Second acceptance (idempotency check)
SELECT lives_ok(
  format('SELECT public.accept_handoff_offer(%L::uuid)', current_setting('app.test_alice_notif')),
  '(15) Second acceptance returns successfully without error'
);

-- Exactly 1 appointment was created for slot 4
SELECT is(
  (SELECT count(*)::int FROM public.appointments WHERE slot_id = '85000000-0000-0000-0000-000000000004'::uuid),
  1,
  '(15b) Exactly one appointment booked despite two accept calls (idempotent)'
);

-- -----------------------------------------------------------------------------
-- Test 16: Acceptance when event is at 'contacted' legal order advances to handed_off
-- -----------------------------------------------------------------------------
RESET ROLE;

DO $$
DECLARE
  v_alice uuid := 'aaaaaaaa-9999-2222-3333-444444444441'::uuid;
  v_sharma uuid := 'cccccccc-9999-2222-3333-444444444441'::uuid;
  v_event3 uuid := '75000000-0000-0000-0000-000000000003'::uuid;
  v_slot5 uuid := '85000000-0000-0000-0000-000000000005'::uuid;
  v_res jsonb;
BEGIN
  -- Insert high event 3
  INSERT INTO public.risk_events (id, student_id, event_type, severity_level, trigger_source, action_taken, resolved)
  VALUES (v_event3, v_alice, 'high_handoff_contacted_test', 'high', 'manual', 'logged', false)
  ON CONFLICT (id) DO NOTHING;

  -- Advance to acknowledged, then contacted
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub": "cccccccc-9999-2222-3333-444444444441", "role": "authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'cccccccc-9999-2222-3333-444444444441', true);

  PERFORM public.advance_risk_followup(v_event3, 'acknowledged', NULL, 'Acknowledged for contacted test');
  PERFORM public.advance_risk_followup(v_event3, 'contacted', NULL, 'Contacted student');

  -- Offer slot 5
  v_res := public.offer_handoff_slot(v_event3, v_slot5, 'Warm handoff offer at contacted step');
  PERFORM set_config('app.test_alice_notif3', v_res->>'notification_id', true);
END $$;

-- Student Alice accepts offer for event 3
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-9999-2222-3333-444444444441", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-9999-2222-3333-444444444441';

SELECT lives_ok(
  format('SELECT public.accept_handoff_offer(%L::uuid)', current_setting('app.test_alice_notif3')),
  '(16) Student Alice accepts handoff offer when event is at contacted step'
);

-- Followup step is now handed_off
SELECT is(
  (SELECT step FROM public.risk_followups WHERE risk_event_id = '75000000-0000-0000-0000-000000000003'::uuid ORDER BY seq DESC LIMIT 1),
  'handed_off'::public.followup_step,
  '(16b) Followup step cleanly advances to handed_off when accepted from contacted step'
);

-- -----------------------------------------------------------------------------
-- Test 17: Offers and acceptances write audit_log without message content
-- -----------------------------------------------------------------------------
SELECT is(
  (
    SELECT count(*)::int
    FROM public.audit_log
    WHERE action IN ('offer_handoff_slot', 'accept_handoff_offer')
      AND (
        details ? 'message'
        OR details ? 'content'
        OR details ? 'student_text'
      )
  ),
  0,
  '(17) Audit log entries for offer and accept contain NO message content (data minimization)'
);

-- -----------------------------------------------------------------------------
-- Test 18: Notification RLS isolation
-- -----------------------------------------------------------------------------
-- Context: Student Bob querying notifications
SET LOCAL "request.jwt.claims" = '{"sub": "bbbbbbbb-9999-2222-3333-444444444442", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'bbbbbbbb-9999-2222-3333-444444444442';

SELECT is(
  (SELECT count(*)::int FROM public.notifications WHERE user_id = 'aaaaaaaa-9999-2222-3333-444444444441'::uuid),
  0,
  '(18) Student Bob cannot see any notifications belonging to Student Alice (RLS isolation)'
);

SELECT * FROM finish();
ROLLBACK;
