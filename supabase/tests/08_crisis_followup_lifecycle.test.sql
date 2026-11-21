-- ==============================================================================
-- Test File: 08_crisis_followup_lifecycle.test.sql
-- Description: pgTAP tests for Risk Followup Lifecycle, transitions, checkbacks,
--              automatic prompts, and resolution.
-- ==============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
SELECT plan(15);

-- -----------------------------------------------------------------------------
-- 1. Setup Fixture
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_inst uuid := '11111111-2222-3333-4444-555555555555'::uuid;
  v_student uuid := '11111111-aaaa-bbbb-cccc-000000000001'::uuid;
  v_counsellor uuid := '22222222-aaaa-bbbb-cccc-000000000002'::uuid;
BEGIN
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst, 'IIT Delhi Health Centre', 'IITD', 'iitd.ac.in')
  ON CONFLICT (id) DO NOTHING;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_student, 'authenticated', 'authenticated', 'student_lifecycle@test.com'),
      (v_counsellor, 'authenticated', 'authenticated', 'counsellor_lifecycle@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES
    (v_student, 'student', 'Student-Life', 'en', v_inst),
    (v_counsellor, 'counsellor', 'Dr. Lifecycle', 'en', v_inst)
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, alias = EXCLUDED.alias;

  INSERT INTO public.counsellors (id, license_number, specializations, verified, institution_id)
  VALUES (v_counsellor, 'RCI-LIFE-9901', ARRAY['Crisis', 'CBT'], true, v_inst)
  ON CONFLICT (id) DO NOTHING;

  -- Care share with 'risk_events' scope
  INSERT INTO public.care_shares (student_id, counsellor_id, active, scope, granted_at)
  VALUES (v_student, v_counsellor, true, ARRAY['risk_events'], now() - interval '1 day')
  ON CONFLICT (student_id, counsellor_id) DO UPDATE SET active = true, scope = EXCLUDED.scope;
END $$;

-- -----------------------------------------------------------------------------
-- Test 1 & 2: Trigger creates initial 'open' step for high and crisis, NOT for low or medium
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_student uuid := '11111111-aaaa-bbbb-cccc-000000000001'::uuid;
BEGIN
  -- Insert Low
  INSERT INTO public.risk_events (id, student_id, event_type, severity_level, trigger_source, action_taken)
  VALUES ('70000000-0000-0000-0000-000000000001'::uuid, v_student, 'low_test', 'low', 'manual', 'logged');

  -- Insert Medium
  INSERT INTO public.risk_events (id, student_id, event_type, severity_level, trigger_source, action_taken)
  VALUES ('70000000-0000-0000-0000-000000000002'::uuid, v_student, 'med_test', 'medium', 'manual', 'logged');

  -- Insert High
  INSERT INTO public.risk_events (id, student_id, event_type, severity_level, trigger_source, action_taken)
  VALUES ('70000000-0000-0000-0000-000000000003'::uuid, v_student, 'high_test', 'high', 'manual', 'logged');

  -- Insert Crisis
  INSERT INTO public.risk_events (id, student_id, event_type, severity_level, trigger_source, action_taken)
  VALUES ('70000000-0000-0000-0000-000000000004'::uuid, v_student, 'crisis_test', 'crisis', 'phq9_item9', 'helpline');
END $$;

SELECT is(
  (SELECT count(*)::int FROM public.risk_followups WHERE risk_event_id IN (
    '70000000-0000-0000-0000-000000000001'::uuid,
    '70000000-0000-0000-0000-000000000002'::uuid
  )),
  0,
  '(f) Low and Medium risk events do NOT generate initial risk_followups step'
);

SELECT is(
  (SELECT count(*)::int FROM public.risk_followups WHERE risk_event_id IN (
    '70000000-0000-0000-0000-000000000003'::uuid,
    '70000000-0000-0000-0000-000000000004'::uuid
  ) AND step = 'open'),
  2,
  '(f) High and Crisis risk events automatically generate initial open risk_followups step via trigger'
);

-- -----------------------------------------------------------------------------
-- Step Transitions Testing
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "22222222-aaaa-bbbb-cccc-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '22222222-aaaa-bbbb-cccc-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- Test 3: Illegal step jump - cannot jump from open directly to contacted (skipping acknowledged)
SELECT throws_ok(
  $$SELECT public.advance_risk_followup('70000000-0000-0000-0000-000000000004'::uuid, 'contacted', NULL, 'Illegal jump')$$,
  'P0001',
  NULL,
  '(c) Illegal step jump (open -> contacted) fails with descriptive error'
);

-- Test 4: Cannot advance to open
SELECT throws_ok(
  $$SELECT public.advance_risk_followup('70000000-0000-0000-0000-000000000004'::uuid, 'open', NULL, 'Cannot advance to open')$$,
  'P0001',
  NULL,
  '(c) Calling advance_risk_followup with open fails'
);

-- Test 5: Valid advance to acknowledged succeeds
SELECT lives_ok(
  $$SELECT public.advance_risk_followup('70000000-0000-0000-0000-000000000004'::uuid, 'acknowledged', NULL, 'Acknowledged by Dr. Lifecycle')$$,
  '(c) Advancing from open to acknowledged succeeds'
);

-- Test 6: Acknowledged trigger automatically creates h24 and h72 prompts
SELECT is(
  (SELECT count(*)::int FROM public.risk_checkback_prompts WHERE risk_event_id = '70000000-0000-0000-0000-000000000004'::uuid),
  2,
  'Checkback prompts h24 and h72 are trigger-created upon reaching acknowledged'
);

-- Test 7: Cannot jump from acknowledged to closed (skipping contacted and handed_off)
SELECT throws_ok(
  $$SELECT public.advance_risk_followup('70000000-0000-0000-0000-000000000004'::uuid, 'closed', 'student_reached_safe', 'Skip steps')$$,
  'P0001',
  NULL,
  '(c) Illegal step jump (acknowledged -> closed) fails'
);

-- Test 8: Valid advance to contacted
SELECT lives_ok(
  $$SELECT public.advance_risk_followup('70000000-0000-0000-0000-000000000004'::uuid, 'contacted', NULL, 'Contacted via telephone')$$,
  '(c) Advancing from acknowledged to contacted succeeds'
);

-- Test 9: Cannot go backwards (contacted -> acknowledged)
SELECT throws_ok(
  $$SELECT public.advance_risk_followup('70000000-0000-0000-0000-000000000004'::uuid, 'acknowledged', NULL, 'Going backwards')$$,
  'P0001',
  NULL,
  '(c) Going backwards in step order fails'
);

-- Test 10: Valid advance to handed_off
SELECT lives_ok(
  $$SELECT public.advance_risk_followup('70000000-0000-0000-0000-000000000004'::uuid, 'handed_off', NULL, 'Handed off to psychiatric OPD')$$,
  '(c) Advancing from contacted to handed_off succeeds'
);

-- Test 11: Closing without closure_reason fails
SELECT throws_ok(
  $$SELECT public.advance_risk_followup('70000000-0000-0000-0000-000000000004'::uuid, 'closed', NULL, 'Closing without reason')$$,
  'P0001',
  NULL,
  '(c) Closing without closure_reason fails'
);

-- Test 12: Closing with invalid closure_reason fails
SELECT throws_ok(
  $$SELECT public.advance_risk_followup('70000000-0000-0000-0000-000000000004'::uuid, 'closed', 'invalid_fake_reason', 'Bad reason')$$,
  'P0001',
  NULL,
  '(c) Closing with invalid closure_reason fails'
);

-- Test 13: Closing with valid closure_reason succeeds and marks risk_events.resolved = true
SELECT lives_ok(
  $$SELECT public.advance_risk_followup('70000000-0000-0000-0000-000000000004'::uuid, 'closed', 'student_reached_safe', 'Student safe')$$,
  '(c) Closing with valid closure_reason succeeds'
);

SELECT is(
  (SELECT resolved FROM public.risk_events WHERE id = '70000000-0000-0000-0000-000000000004'::uuid),
  true,
  '(c) Closing sets risk_events.resolved to true'
);

-- Test 15: Acting on a closed event fails
SELECT throws_ok(
  $$SELECT public.advance_risk_followup('70000000-0000-0000-0000-000000000004'::uuid, 'contacted', NULL, 'Cannot act on closed')$$,
  'P0001',
  NULL,
  '(c) Acting on a closed event fails'
);

SELECT * FROM finish();
ROLLBACK;
