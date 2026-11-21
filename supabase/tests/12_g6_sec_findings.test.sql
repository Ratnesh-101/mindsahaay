-- ==============================================================================
-- Test File: 12_g6_sec_findings.test.sql
-- Description: pgTAP regression tests for G6-SEC-01, G6-SEC-02, G6-SEC-07
--              - G6-SEC-01: Reopened crisis follow-up escalation cycle suppression
--              - G6-SEC-02: Student alias deanonymization via get_student_alias_for_care
--              - G6-SEC-07: Overdue escalation RPC authorization and concurrency
-- ==============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
SELECT plan(9);

-- -----------------------------------------------------------------------------
-- 1. Setup Fixture
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_inst uuid := '12000000-0000-0000-0000-000000000000'::uuid;
  v_alice uuid := '12000000-0000-0000-0000-000000000001'::uuid;
  v_bob uuid := '12000000-0000-0000-0000-000000000002'::uuid;
  v_sharma uuid := '12000000-0000-0000-0000-000000000003'::uuid;
  v_verma uuid := '12000000-0000-0000-0000-000000000004'::uuid;
  v_backup uuid := '12000000-0000-0000-0000-000000000005'::uuid;
  v_e1 uuid := '12000000-0000-0000-0000-000000000010'::uuid;
BEGIN
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst, 'IIT Delhi Test H1', 'IITD-H1', 'h1.iitd.ac.in')
  ON CONFLICT (id) DO NOTHING;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_alice, 'authenticated', 'authenticated', 'alice_12@test.com'),
      (v_bob, 'authenticated', 'authenticated', 'bob_12@test.com'),
      (v_sharma, 'authenticated', 'authenticated', 'sharma_12@test.com'),
      (v_verma, 'authenticated', 'authenticated', 'verma_12@test.com'),
      (v_backup, 'authenticated', 'authenticated', 'backup_12@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES
    (v_alice, 'student', 'Student-Alice-12', 'en', v_inst),
    (v_bob, 'student', 'Student-Bob-12', 'en', v_inst),
    (v_sharma, 'counsellor', 'Dr. Sharma 12', 'en', v_inst),
    (v_verma, 'counsellor', 'Dr. Verma 12', 'en', v_inst),
    (v_backup, 'counsellor', 'Dr. CampusBackup 12', 'en', v_inst)
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, alias = EXCLUDED.alias, institution_id = EXCLUDED.institution_id;

  INSERT INTO public.counsellors (id, license_number, specializations, verified, institution_id)
  VALUES
    (v_sharma, 'RCI-12-01', ARRAY['Crisis'], true, v_inst),
    (v_verma, 'RCI-12-02', ARRAY['General'], true, v_inst),
    (v_backup, 'RCI-12-03', ARRAY['Emergency'], true, v_inst)
  ON CONFLICT (id) DO UPDATE SET verified = true, institution_id = EXCLUDED.institution_id;

  INSERT INTO public.institution_backup_counsellors (institution_id, counsellor_id)
  VALUES (v_inst, v_backup)
  ON CONFLICT (institution_id) DO UPDATE SET counsellor_id = EXCLUDED.counsellor_id;

  -- Care share ONLY for Dr. Sharma with Alice (scope risk_events)
  INSERT INTO public.care_shares (student_id, counsellor_id, active, scope, granted_at)
  VALUES (v_alice, v_sharma, true, ARRAY['risk_events'], now() - interval '2 days')
  ON CONFLICT (student_id, counsellor_id) DO UPDATE SET active = true, scope = EXCLUDED.scope;

  -- Flush any pre-existing overdue events before inserting test event
  PERFORM public.escalate_overdue_risk();

  -- Insert Crisis Event E1 for Alice: 5 hours ago (threshold is 4 hours)
  INSERT INTO public.risk_events (
    id, student_id, event_type, severity_level, trigger_source, action_taken, resolved, created_at
  ) VALUES (
    v_e1,
    v_alice,
    'crisis_g6_sec01_test',
    'crisis',
    'phq9_item9',
    'helpline_offered',
    false,
    now() - interval '5 hours'
  ) ON CONFLICT (id) DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- Part 1: G6-SEC-01 Reopened Crisis Escalation Cycle Suppression
-- -----------------------------------------------------------------------------

-- Cycle 1 escalation: exactly 1 notification created for Dr. Sharma
SELECT is(
  public.escalate_overdue_risk(),
  1,
  '[G6-SEC-01] Cycle 1 escalation creates 1 notification for Dr. Sharma'
);

-- Advance to 'acknowledged' as Dr. Sharma, then Alice reopens with 'want_to_talk'
DO $$
DECLARE
  v_e1 uuid := '12000000-0000-0000-0000-000000000010'::uuid;
  v_sharma uuid := '12000000-0000-0000-0000-000000000003'::uuid;
  v_alice uuid := '12000000-0000-0000-0000-000000000001'::uuid;
  v_prompt_id uuid;
BEGIN
  -- 1. Dr. Sharma acknowledges
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub": "12000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000003', true);
  PERFORM public.advance_risk_followup(v_e1, 'acknowledged', NULL, 'Acknowledged by Dr. Sharma');

  -- 2. Alice answers checkback prompt with 'want_to_talk'
  SELECT id INTO v_prompt_id
  FROM public.risk_checkback_prompts
  WHERE risk_event_id = v_e1 AND kind = 'h24'
  LIMIT 1;

  PERFORM set_config('request.jwt.claims', '{"sub": "12000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);

  INSERT INTO public.risk_checkbacks (risk_event_id, prompt_id, student_id, answer)
  VALUES (v_e1, v_prompt_id, v_alice, 'want_to_talk');

  -- 3. Reset to trusted context and age the reopened 'open' step past 4 hours threshold (5 hours ago)
  RESET ROLE;
  ALTER TABLE public.risk_followups DISABLE TRIGGER trg_prevent_risk_followups_tampering;
  UPDATE public.risk_followups
  SET created_at = now() - interval '5 hours'
  WHERE risk_event_id = v_e1
    AND step = 'open'
    AND seq = (SELECT max(seq) FROM public.risk_followups WHERE risk_event_id = v_e1);
  ALTER TABLE public.risk_followups ENABLE TRIGGER trg_prevent_risk_followups_tampering;
END $$;

-- Cycle 2 escalation: must generate a new notification in cycle 2
SELECT is(
  public.escalate_overdue_risk(),
  1,
  '[G6-SEC-01] Cycle 2 escalation notifies again for reopened unanswered crisis event'
);

-- Repeated execution in Cycle 2 must be idempotent (0 new notifications)
SELECT is(
  public.escalate_overdue_risk(),
  0,
  '[G6-SEC-01] Cycle 2 escalation repeated execution is idempotent'
);

-- Total notifications across both cycles for Dr. Sharma should be exactly 2
SELECT is(
  (SELECT count(*)::int FROM public.notifications
   WHERE user_id = '12000000-0000-0000-0000-000000000003'::uuid
     AND type = 'risk_overdue'
     AND (metadata->>'risk_event_id')::uuid = '12000000-0000-0000-0000-000000000010'::uuid),
  2,
  '[G6-SEC-01] Exactly 2 notifications exist across both cycles (1 per cycle)'
);

-- -----------------------------------------------------------------------------
-- Part 2: G6-SEC-02 Student Alias Access Control
-- -----------------------------------------------------------------------------

-- Context: Student Bob querying Student Alice alias
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "12000000-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '12000000-0000-0000-0000-000000000002';

SELECT is(
  public.get_student_alias_for_care('12000000-0000-0000-0000-000000000001'::uuid),
  NULL,
  '[G6-SEC-02] Student Bob calling get_student_alias_for_care for Alice returns NULL'
);

-- Context: Counsellor Dr. Verma (NO care share with Alice)
SET LOCAL "request.jwt.claims" = '{"sub": "12000000-0000-0000-0000-000000000004", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '12000000-0000-0000-0000-000000000004';

SELECT is(
  public.get_student_alias_for_care('12000000-0000-0000-0000-000000000001'::uuid),
  NULL,
  '[G6-SEC-02] Counsellor without care share calling get_student_alias_for_care returns NULL'
);

-- Context: Counsellor Dr. Sharma (HAS active care share with Alice)
SET LOCAL "request.jwt.claims" = '{"sub": "12000000-0000-0000-0000-000000000003", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '12000000-0000-0000-0000-000000000003';

SELECT is(
  public.get_student_alias_for_care('12000000-0000-0000-0000-000000000001'::uuid),
  'Student-Alice-12',
  '[G6-SEC-02] Counsellor with active care share retrieves Student Alice alias'
);

-- -----------------------------------------------------------------------------
-- Part 3: G6-SEC-07 escalate_overdue_risk Caller Authorization
-- -----------------------------------------------------------------------------

-- Context: Student Alice calling escalate_overdue_risk() directly
SET LOCAL "request.jwt.claims" = '{"sub": "12000000-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '12000000-0000-0000-0000-000000000001';

SELECT throws_ok(
  $$SELECT public.escalate_overdue_risk()$$,
  'P0001',
  'Unauthorized: Caller is not authorized to escalate overdue risk',
  '[G6-SEC-07] Student cannot call escalate_overdue_risk()'
);

-- Context: Counsellor Dr. Verma (NO active care share for any risk events)
SET LOCAL "request.jwt.claims" = '{"sub": "12000000-0000-0000-0000-000000000004", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '12000000-0000-0000-0000-000000000004';

SELECT throws_ok(
  $$SELECT public.escalate_overdue_risk()$$,
  'P0001',
  'Unauthorized: Caller is not authorized to escalate overdue risk',
  '[G6-SEC-07] Counsellor without care share cannot call escalate_overdue_risk()'
);

SELECT * FROM finish();
ROLLBACK;
