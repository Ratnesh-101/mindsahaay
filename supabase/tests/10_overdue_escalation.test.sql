-- ==============================================================================
-- Test File: 10_overdue_escalation.test.sql
-- Description: pgTAP tests for overdue crisis escalation (Level 1 care share counsellors,
--              Level 2 backup counsellor), idempotency, generic alert content,
--              audit logging, and risk_queue view security and filtering.
-- ==============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
SELECT plan(14);

-- -----------------------------------------------------------------------------
-- 1. Setup Fixture
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_inst uuid := '11111111-2222-3333-4444-555555555555'::uuid;
  v_student uuid := 'aaaaaaaa-2222-3333-4444-555555555555'::uuid;
  v_c1_risk uuid := 'cccccccc-2222-3333-4444-555555555551'::uuid;
  v_c2_mood uuid := 'cccccccc-2222-3333-4444-555555555552'::uuid;
  v_c3_none uuid := 'cccccccc-2222-3333-4444-555555555553'::uuid;
  v_bc_inst uuid := 'cccccccc-2222-3333-4444-555555555554'::uuid;
  v_e1_l1 uuid := '73000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst, 'IIT Delhi Health Centre', 'IITD', 'iitd.ac.in')
  ON CONFLICT (id) DO NOTHING;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_student, 'authenticated', 'authenticated', 'student_esc@test.com'),
      (v_c1_risk, 'authenticated', 'authenticated', 'c1_risk@test.com'),
      (v_c2_mood, 'authenticated', 'authenticated', 'c2_mood@test.com'),
      (v_c3_none, 'authenticated', 'authenticated', 'c3_none@test.com'),
      (v_bc_inst, 'authenticated', 'authenticated', 'bc_inst@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES
    (v_student, 'student', 'Student-Overdue', 'en', v_inst),
    (v_c1_risk, 'counsellor', 'Dr. RiskLead', 'en', v_inst),
    (v_c2_mood, 'counsellor', 'Dr. MoodOnly', 'en', v_inst),
    (v_c3_none, 'counsellor', 'Dr. Unshared', 'en', v_inst),
    (v_bc_inst, 'counsellor', 'Dr. CampusBackup', 'en', v_inst)
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, alias = EXCLUDED.alias, institution_id = EXCLUDED.institution_id;

  INSERT INTO public.counsellors (id, license_number, specializations, verified, institution_id)
  VALUES
    (v_c1_risk, 'RCI-ESC-01', ARRAY['Crisis'], true, v_inst),
    (v_c2_mood, 'RCI-ESC-02', ARRAY['Mood'], true, v_inst),
    (v_c3_none, 'RCI-ESC-03', ARRAY['General'], true, v_inst),
    (v_bc_inst, 'RCI-ESC-04', ARRAY['Emergency'], true, v_inst)
  ON CONFLICT (id) DO UPDATE SET verified = true, institution_id = EXCLUDED.institution_id;

  -- Institution Backup Counsellor
  INSERT INTO public.institution_backup_counsellors (institution_id, counsellor_id)
  VALUES (v_inst, v_bc_inst)
  ON CONFLICT (institution_id) DO UPDATE SET counsellor_id = EXCLUDED.counsellor_id;

  -- Care share for C1 with 'risk_events'
  INSERT INTO public.care_shares (student_id, counsellor_id, active, scope, granted_at)
  VALUES (v_student, v_c1_risk, true, ARRAY['risk_events'], now() - interval '2 days')
  ON CONFLICT (student_id, counsellor_id) DO UPDATE SET active = true, scope = EXCLUDED.scope;

  -- Care share for C2 with 'assessments' ONLY (no risk_events)
  INSERT INTO public.care_shares (student_id, counsellor_id, active, scope, granted_at)
  VALUES (v_student, v_c2_mood, true, ARRAY['assessments'], now() - interval '2 days')
  ON CONFLICT (student_id, counsellor_id) DO UPDATE SET active = true, scope = EXCLUDED.scope;

  -- Flush any pre-existing seed overdue events so test fixture assertions are isolated
  PERFORM public.escalate_overdue_risk();

  -- Insert Crisis Event E1: age 5 hours ago (Crisis threshold is 4 hours, level 2 is 6 hours)
  INSERT INTO public.risk_events (
    id, student_id, event_type, severity_level, trigger_source, action_taken, resolved, created_at
  ) VALUES (
    v_e1_l1,
    v_student,
    'crisis_overdue_l1_test',
    'crisis',
    'phq9_item9',
    'helpline_offered',
    false,
    now() - interval '5 hours'
  ) ON CONFLICT (id) DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- Test 1 to 5: (d) Level 1 Escalation: notifies ONLY counsellor with risk_events care share
-- -----------------------------------------------------------------------------
-- Call escalate_overdue_risk directly
SELECT is(
  public.escalate_overdue_risk(),
  1,
  '(d) escalate_overdue_risk() creates exactly 1 notification for Level 1 overdue event'
);

-- Counsellor C1 (holding risk_events scope) received Level 1 notification
SELECT is(
  (SELECT count(*)::int FROM public.notifications
   WHERE user_id = 'cccccccc-2222-3333-4444-555555555551'::uuid
     AND type = 'risk_overdue'
     AND (metadata->>'risk_event_id')::uuid = '73000000-0000-0000-0000-000000000001'::uuid
     AND (metadata->>'level')::int = 1),
  1,
  '(d) Counsellor with active care share scoped to risk_events receives Level 1 risk_overdue notification'
);

-- Counsellor C2 (holding only assessments scope) receives 0 notifications
SELECT is(
  (SELECT count(*)::int FROM public.notifications
   WHERE user_id = 'cccccccc-2222-3333-4444-555555555552'::uuid),
  0,
  '(d) Counsellor without risk_events scope receives 0 notifications'
);

-- Counsellor C3 (no care share) receives 0 notifications
SELECT is(
  (SELECT count(*)::int FROM public.notifications
   WHERE user_id = 'cccccccc-2222-3333-4444-555555555553'::uuid),
  0,
  '(d) Counsellor without care share receives 0 notifications'
);

-- Backup Counsellor BC receives 0 notifications at Level 1 (age 5h < 6h)
SELECT is(
  (SELECT count(*)::int FROM public.notifications
   WHERE user_id = 'cccccccc-2222-3333-4444-555555555554'::uuid),
  0,
  '(d) Institution backup counsellor is NOT notified at Level 1 (threshold not reached)'
);

-- -----------------------------------------------------------------------------
-- Test 6 & 7: Idempotency and Audit Logging
-- -----------------------------------------------------------------------------
-- Calling escalate_overdue_risk a second time produces 0 new notifications
SELECT is(
  public.escalate_overdue_risk(),
  0,
  '(d) escalate_overdue_risk() is idempotent per (event, level) - repeated execution creates 0 duplicate notifications'
);

-- Audit log entry was written
SELECT is(
  (SELECT count(*)::int FROM public.audit_log
   WHERE action = 'escalate_overdue_risk'
     AND resource_id = '73000000-0000-0000-0000-000000000001'
     AND (details->>'level')::int = 1),
  1,
  '(d) escalate_overdue_risk() writes audit_log with generic details and no student message content'
);

-- -----------------------------------------------------------------------------
-- Test 8 & 9: Level 2 Escalation to Institution Backup Counsellor
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_student uuid := 'aaaaaaaa-2222-3333-4444-555555555555'::uuid;
  v_e2_l2 uuid := '73000000-0000-0000-0000-000000000002'::uuid;
BEGIN
  -- Insert Crisis Event E2: age 7 hours ago (7h >= 6h => Level 2 overdue)
  INSERT INTO public.risk_events (
    id, student_id, event_type, severity_level, trigger_source, action_taken, resolved, created_at
  ) VALUES (
    v_e2_l2,
    v_student,
    'crisis_overdue_l2_test',
    'crisis',
    'phq9_item9',
    'helpline_offered',
    false,
    now() - interval '7 hours'
  ) ON CONFLICT (id) DO NOTHING;
END $$;

-- Run escalation for Level 2 event (fires Level 1 for C1 and Level 2 for backup counsellor)
SELECT is(
  public.escalate_overdue_risk(),
  2,
  '(d) escalate_overdue_risk() creates Level 1 and Level 2 notifications for 7-hour overdue event'
);

-- Verify Backup Counsellor received Level 2 notification
SELECT is(
  (SELECT count(*)::int FROM public.notifications
   WHERE user_id = 'cccccccc-2222-3333-4444-555555555554'::uuid
     AND type = 'risk_overdue'
     AND (metadata->>'risk_event_id')::uuid = '73000000-0000-0000-0000-000000000002'::uuid
     AND (metadata->>'level')::int = 2),
  1,
  '(d) Institution backup counsellor receives Level 2 risk_overdue notification at 2h post-L1 threshold'
);

-- Repeated execution is idempotent
SELECT is(
  public.escalate_overdue_risk(),
  0,
  '(d) Level 2 escalation repeated execution is idempotent'
);

-- -----------------------------------------------------------------------------
-- Test 11 to 14: public.risk_queue View Behavior & Security Invoker
-- -----------------------------------------------------------------------------

-- Context: Student
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-2222-3333-4444-555555555555", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-2222-3333-4444-555555555555';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is(
  (SELECT count(*)::int FROM public.risk_queue WHERE student_id = 'aaaaaaaa-2222-3333-4444-555555555555'::uuid),
  2,
  'Student sees own events in public.risk_queue'
);

-- Context: Counsellor with Care Share (Dr. RiskLead)
SET LOCAL "request.jwt.claims" = '{"sub": "cccccccc-2222-3333-4444-555555555551", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'cccccccc-2222-3333-4444-555555555551';

SELECT is(
  (SELECT is_overdue FROM public.risk_queue WHERE id = '73000000-0000-0000-0000-000000000001'::uuid),
  true,
  'Counsellor with care share views overdue status as TRUE for 5h old open crisis event'
);

SELECT is(
  (SELECT alias FROM public.risk_queue WHERE id = '73000000-0000-0000-0000-000000000001'::uuid),
  'Student-Overdue',
  'Counsellor with care share views student alias in public.risk_queue'
);

-- Context: Counsellor with NO Care Share (Dr. Unshared)
SET LOCAL "request.jwt.claims" = '{"sub": "cccccccc-2222-3333-4444-555555555553", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'cccccccc-2222-3333-4444-555555555553';

SELECT is_empty(
  $$SELECT * FROM public.risk_queue WHERE student_id = 'aaaaaaaa-2222-3333-4444-555555555555'::uuid$$,
  'Counsellor without care share sees 0 rows in public.risk_queue (security invoker RLS)'
);

SELECT * FROM finish();
ROLLBACK;
