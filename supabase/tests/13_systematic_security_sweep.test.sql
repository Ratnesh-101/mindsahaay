-- ==============================================================================
-- Test File: 13_systematic_security_sweep.test.sql
-- Description: pgTAP regression tests for:
--              - (a) SECURITY DEFINER search_path enforcement and anon execute privilege revocation
--              - (b) RPC hardening on 0006 (cross-user acceptance, slot hijack, decline replay, double offer, non-student opt-out, revoked care share)
--              - (c) Notification spoofing prevention (direct insert & metadata update denial)
-- ==============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
SELECT plan(10);

-- -----------------------------------------------------------------------------
-- 1. Setup Fixture
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_inst uuid := '13000000-0000-0000-0000-000000000000'::uuid;
  v_alice uuid := '13000000-0000-0000-0000-000000000001'::uuid;
  v_bob uuid := '13000000-0000-0000-0000-000000000002'::uuid;
  v_sharma uuid := '13000000-0000-0000-0000-000000000003'::uuid;
  v_verma uuid := '13000000-0000-0000-0000-000000000004'::uuid;
  v_event_bob uuid := '13000000-0000-0000-0000-000000000010'::uuid;
  v_slot_verma uuid := '13000000-0000-0000-0000-000000000020'::uuid;
  v_slot_cross uuid := '13000000-0000-0000-0000-000000000021'::uuid;
  v_slot_hijack uuid := '13000000-0000-0000-0000-000000000022'::uuid;
  v_slot_legit uuid := '13000000-0000-0000-0000-000000000023'::uuid;
  v_slot_revoked uuid := '13000000-0000-0000-0000-000000000024'::uuid;
BEGIN
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst, 'IIT Delhi Test H1-13', 'IITD-13', '13.iitd.ac.in')
  ON CONFLICT (id) DO NOTHING;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_alice, 'authenticated', 'authenticated', 'alice_13@test.com'),
      (v_bob, 'authenticated', 'authenticated', 'bob_13@test.com'),
      (v_sharma, 'authenticated', 'authenticated', 'sharma_13@test.com'),
      (v_verma, 'authenticated', 'authenticated', 'verma_13@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES
    (v_alice, 'student', 'Student-Alice-13', 'en', v_inst),
    (v_bob, 'student', 'Student-Bob-13', 'en', v_inst),
    (v_sharma, 'counsellor', 'Dr. Sharma 13', 'en', v_inst),
    (v_verma, 'counsellor', 'Dr. Verma 13', 'en', v_inst)
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, alias = EXCLUDED.alias, institution_id = EXCLUDED.institution_id;

  INSERT INTO public.counsellors (id, license_number, specializations, verified, institution_id)
  VALUES
    (v_sharma, 'RCI-13-01', ARRAY['Crisis'], true, v_inst),
    (v_verma, 'RCI-13-02', ARRAY['General'], true, v_inst)
  ON CONFLICT (id) DO UPDATE SET verified = true, institution_id = EXCLUDED.institution_id;

  -- Care share for Dr. Sharma with Bob and Alice
  INSERT INTO public.care_shares (student_id, counsellor_id, active, scope, granted_at)
  VALUES
    (v_bob, v_sharma, true, ARRAY['risk_events'], now() - interval '2 days'),
    (v_alice, v_sharma, true, ARRAY['risk_events'], now() - interval '2 days')
  ON CONFLICT (student_id, counsellor_id) DO UPDATE SET active = true, scope = EXCLUDED.scope;

  -- Bob's high risk event
  INSERT INTO public.risk_events (
    id, student_id, event_type, severity_level, trigger_source, action_taken, resolved, created_at
  ) VALUES (
    v_event_bob,
    v_bob,
    'high_risk_bob_13',
    'high',
    'manual',
    'logged',
    false,
    now() - interval '1 hour'
  ) ON CONFLICT (id) DO NOTHING;

  -- Dr. Verma slot
  INSERT INTO public.availability_slots (id, counsellor_id, start_time, end_time, is_booked)
  VALUES (v_slot_verma, v_verma, now() + interval '2 days', now() + interval '2 days 1 hour', false)
  ON CONFLICT (id) DO NOTHING;

  -- Dr. Sharma slots
  INSERT INTO public.availability_slots (id, counsellor_id, start_time, end_time, is_booked)
  VALUES
    (v_slot_cross, v_sharma, now() + interval '3 days', now() + interval '3 days 1 hour', false),
    (v_slot_hijack, v_sharma, now() + interval '4 days', now() + interval '4 days 1 hour', false),
    (v_slot_legit, v_sharma, now() + interval '5 days', now() + interval '5 days 1 hour', false),
    (v_slot_revoked, v_sharma, now() + interval '6 days', now() + interval '6 days 1 hour', false)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- (a) SECURITY DEFINER search_path and anon execution privilege sweep
-- -----------------------------------------------------------------------------

-- Assertion 1: No SECURITY DEFINER in public lacks fixed search_path
SELECT is_empty(
  $$
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (p.proconfig IS NULL OR NOT array_to_string(p.proconfig, ' ') LIKE '%search_path=%')
  $$,
  '[(a)] No SECURITY DEFINER function in public lacks a fixed search_path'
);

-- Assertion 2: No SECURITY DEFINER in public is executable by anon except check_rate_limit
SELECT is_empty(
  $$
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname NOT IN ('check_rate_limit')
  $$,
  '[(a)] No SECURITY DEFINER function in public is executable by anon except allowlisted check_rate_limit'
);

-- -----------------------------------------------------------------------------
-- (c) Notification Spoofing Prevention
-- -----------------------------------------------------------------------------

-- Context: Student Alice
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "13000000-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000001';

-- Assertion 3: Alice cannot insert handoff_offer notification for herself directly
SELECT throws_ok(
  $$
    INSERT INTO public.notifications (user_id, title, body, type, metadata)
    VALUES (
      '13000000-0000-0000-0000-000000000001'::uuid,
      'Spoofed Offer',
      'Tampered handoff offer',
      'handoff_offer',
      '{"slot_id": "13000000-0000-0000-0000-000000000020"}'::jsonb
    )
  $$,
  '42501',
  NULL,
  '[(c)] Student cannot INSERT notification of type handoff_offer directly (RLS insert blocked)'
);

-- Reset role to insert a legitimate test notification for Alice
RESET ROLE;
DO $$
BEGIN
  INSERT INTO public.notifications (id, user_id, title, body, type, metadata)
  VALUES (
    '13000000-0000-0000-0000-000000000099'::uuid,
    '13000000-0000-0000-0000-000000000001'::uuid,
    'Legit Offer',
    'Real offer',
    'handoff_offer',
    '{"slot_id": "13000000-0000-0000-0000-000000000021"}'::jsonb
  ) ON CONFLICT (id) DO NOTHING;
END $$;

-- Context: Student Alice
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "13000000-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000001';

-- Assertion 4: Alice cannot tamper with metadata on her notification directly
SELECT throws_ok(
  $$
    UPDATE public.notifications
    SET metadata = '{"slot_id": "13000000-0000-0000-0000-000000000020"}'::jsonb
    WHERE id = '13000000-0000-0000-0000-000000000099'::uuid
  $$,
  'P0001',
  'Unauthorized: Only notification read status may be updated by users',
  '[(c)] Student cannot directly UPDATE metadata on notifications'
);

-- -----------------------------------------------------------------------------
-- (b) 0006 RPC Hardening: Cross-user acceptance, slot hijack, decline replay, opt-out role check
-- -----------------------------------------------------------------------------

-- Reset role to insert cross-user notification: notification sent to Alice, but event belongs to Bob
RESET ROLE;
DO $$
BEGIN
  INSERT INTO public.notifications (id, user_id, title, body, type, metadata)
  VALUES (
    '13000000-0000-0000-0000-000000000091'::uuid,
    '13000000-0000-0000-0000-000000000001'::uuid, -- Alice
    'Handoff Cross',
    'Body',
    'handoff_offer',
    jsonb_build_object(
      'risk_event_id', '13000000-0000-0000-0000-000000000010'::uuid, -- Bob's event!
      'slot_id', '13000000-0000-0000-0000-000000000021'::uuid,
      'counsellor_id', '13000000-0000-0000-0000-000000000003'::uuid,
      'starts_at', now() + interval '3 days'
    )
  ) ON CONFLICT (id) DO NOTHING;
END $$;

-- Context: Student Alice
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "13000000-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000001';

-- Assertion 5: Cross-user acceptance rejected (Alice cannot accept Bob's risk event)
SELECT throws_ok(
  $$SELECT public.accept_handoff_offer('13000000-0000-0000-0000-000000000091'::uuid)$$,
  'P0001',
  'Unauthorized: Risk event does not belong to the calling student',
  '[(b)] Cross-user acceptance rejected: Student Alice cannot accept offer for Bob risk event'
);

-- Insert slot mismatch notification: counsellor_id Dr. Verma, but slot_id belongs to Dr. Sharma
RESET ROLE;
DO $$
BEGIN
  INSERT INTO public.notifications (id, user_id, title, body, type, metadata)
  VALUES (
    '13000000-0000-0000-0000-000000000092'::uuid,
    '13000000-0000-0000-0000-000000000002'::uuid, -- Bob
    'Handoff Hijack',
    'Body',
    'handoff_offer',
    jsonb_build_object(
      'risk_event_id', '13000000-0000-0000-0000-000000000010'::uuid,
      'slot_id', '13000000-0000-0000-0000-000000000022'::uuid, -- Dr. Sharma's hijack slot!
      'counsellor_id', '13000000-0000-0000-0000-000000000004'::uuid, -- Dr. Verma!
      'starts_at', now() + interval '4 days'
    )
  ) ON CONFLICT (id) DO NOTHING;
END $$;

-- Context: Student Bob
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "13000000-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000002';

-- Assertion 6: Slot mismatch rejected
SELECT throws_ok(
  $$SELECT public.accept_handoff_offer('13000000-0000-0000-0000-000000000092'::uuid)$$,
  'P0001',
  'Slot does not belong to the offering counsellor',
  '[(b)] Slot hijack rejected: Slot counsellor does not match offering counsellor'
);

-- Legitimate offer for Bob by Dr. Sharma
RESET ROLE;
DO $$
DECLARE
  v_res jsonb;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub": "13000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000003', true);

  -- Dr. Sharma offers slot_legit to Bob
  v_res := public.offer_handoff_slot(
    '13000000-0000-0000-0000-000000000010'::uuid,
    '13000000-0000-0000-0000-000000000023'::uuid,
    'Initial offer'
  );
END $$;

-- Context: Dr. Sharma trying to offer the same slot again
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "13000000-0000-0000-0000-000000000003", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000003';

-- Assertion 7: Offering already pending slot rejected
SELECT throws_ok(
  $$
    SELECT public.offer_handoff_slot(
      '13000000-0000-0000-0000-000000000010'::uuid,
      '13000000-0000-0000-0000-000000000023'::uuid
    )
  $$,
  'P0001',
  'Slot already has an active pending handoff offer',
  '[(b)] Duplicate slot offer rejected while an active pending offer exists'
);

-- Bob accepts the legitimate offer
SET LOCAL "request.jwt.claims" = '{"sub": "13000000-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000002';

DO $$
DECLARE
  v_notif_id uuid;
BEGIN
  SELECT id INTO v_notif_id
  FROM public.notifications
  WHERE user_id = '13000000-0000-0000-0000-000000000002'::uuid
    AND type = 'handoff_offer'
    AND (metadata->>'slot_id')::uuid = '13000000-0000-0000-0000-000000000023'::uuid
    AND (metadata->>'status' IS NULL OR metadata->>'status' = 'pending')
  ORDER BY created_at DESC LIMIT 1;

  PERFORM public.accept_handoff_offer(v_notif_id);
END $$;

-- Assertion 8: Bob cannot decline an already accepted offer
SELECT throws_ok(
  $$
    SELECT public.decline_handoff_offer(
      (SELECT id FROM public.notifications
       WHERE user_id = '13000000-0000-0000-0000-000000000002'::uuid
         AND type = 'handoff_offer'
         AND metadata->>'status' = 'accepted'
       LIMIT 1)
    )
  $$,
  'P0001',
  'Cannot decline an already accepted offer',
  '[(b)] Replay defense: Cannot decline an already accepted offer'
);

-- Assertion 9: Non-student (Counsellor Sharma) cannot call set_checkback_opt_out
SET LOCAL "request.jwt.claims" = '{"sub": "13000000-0000-0000-0000-000000000003", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000003';

SELECT throws_ok(
  $$SELECT public.set_checkback_opt_out(true)$$,
  'P0001',
  'Unauthorized: Only students can set check-back opt-out preference',
  '[(b)] Counsellor cannot invoke set_checkback_opt_out'
);

-- Assertion 10: Revoked care share prevents counsellor from offering handoff slot
RESET ROLE;
DO $$
BEGIN
  -- Mark care share revoked
  UPDATE public.care_shares
  SET revoked_at = now()
  WHERE student_id = '13000000-0000-0000-0000-000000000002'::uuid
    AND counsellor_id = '13000000-0000-0000-0000-000000000003'::uuid;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "13000000-0000-0000-0000-000000000003", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000003';

SELECT throws_ok(
  $$
    SELECT public.offer_handoff_slot(
      '13000000-0000-0000-0000-000000000010'::uuid,
      '13000000-0000-0000-0000-000000000024'::uuid
    )
  $$,
  'P0001',
  'Unauthorized: Counsellor lacks active care share scoped to risk_events for this student',
  '[(b)] Counsellor with revoked care share (revoked_at set) cannot offer handoff slot'
);

SELECT * FROM finish();
ROLLBACK;
