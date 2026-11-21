-- ==============================================================================
-- Test File: 04_triggers_and_append_only.test.sql
-- Description: pgTAP Test verifying append-only ledger triggers, exclusion constraints,
--              and automatic crisis escalation triggers
-- ==============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
SELECT plan(7);

-- 1. Setup Fixture
DO $$
DECLARE
  v_inst_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_student uuid := '55550000-0000-0000-0000-000000000001'::uuid;
  v_counsellor uuid := '55550000-0000-0000-0000-000000000002'::uuid;
BEGIN
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst_id, 'BITS Pilani Wellness Hub', 'BITS', 'bits-pilani.ac.in')
  ON CONFLICT (id) DO NOTHING;

  -- Ensure mock auth.users exist so FK on profiles(id) is satisfied
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_student, 'authenticated', 'authenticated', 'student_bits@test.com'),
      (v_counsellor, 'authenticated', 'authenticated', 'counsellor_alok@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES 
    (v_student, 'student', 'Student-BITS', 'en', v_inst_id),
    (v_counsellor, 'counsellor', 'Dr. Alok Verma', 'en', v_inst_id)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    alias = EXCLUDED.alias,
    institution_id = EXCLUDED.institution_id;

  INSERT INTO public.counsellors (id, license_number, verified, institution_id)
  VALUES (v_counsellor, 'RCI-BITS-441', true, v_inst_id)
  ON CONFLICT (id) DO NOTHING;

  -- Insert initial consent record
  INSERT INTO public.consents (id, student_id, purpose, consented, policy_version)
  VALUES (
    '66660000-0000-0000-0000-000000000001'::uuid,
    v_student,
    'data_processing',
    true,
    '2023.1-DPDP'
  );

  -- Insert initial audit entry
  INSERT INTO public.audit_log (id, actor_id, action, resource_type, resource_id)
  VALUES (
    '77770000-0000-0000-0000-000000000001'::uuid,
    v_student,
    'STUDENT_SESSION_LOGIN',
    'profiles',
    v_student::text
  );
END $$;

-- -----------------------------------------------------------------------------
-- Test 1 & 2: Consents Ledger is strictly append-only
-- -----------------------------------------------------------------------------

PREPARE update_consents_attempt AS
  UPDATE public.consents
  SET consented = false
  WHERE id = '66660000-0000-0000-0000-000000000001'::uuid;

SELECT throws_matching(
  'update_consents_attempt',
  'append-only',
  'Consents table must reject UPDATE statements to maintain immutable audit trail'
);

PREPARE delete_consents_attempt AS
  DELETE FROM public.consents
  WHERE id = '66660000-0000-0000-0000-000000000001'::uuid;

SELECT throws_matching(
  'delete_consents_attempt',
  'append-only',
  'Consents table must reject DELETE statements'
);

-- -----------------------------------------------------------------------------
-- Test 3 & 4: Audit Log is strictly append-only
-- -----------------------------------------------------------------------------

PREPARE update_audit_log_attempt AS
  UPDATE public.audit_log
  SET action = 'TAMPERED_ACTION'
  WHERE id = '77770000-0000-0000-0000-000000000001'::uuid;

SELECT throws_matching(
  'update_audit_log_attempt',
  'immutable',
  'Audit log must reject UPDATE statements'
);

PREPARE delete_audit_log_attempt AS
  DELETE FROM public.audit_log
  WHERE id = '77770000-0000-0000-0000-000000000001'::uuid;

SELECT throws_matching(
  'delete_audit_log_attempt',
  'immutable',
  'Audit log must reject DELETE statements'
);

-- -----------------------------------------------------------------------------
-- Test 5 & 6: Exclusion Constraint on Availability Slots prevents overlapping bookings
-- -----------------------------------------------------------------------------

-- Counsellor creates slot from 10:00 to 11:00
INSERT INTO public.availability_slots (id, counsellor_id, start_time, end_time)
VALUES (
  '88880000-0000-0000-0000-000000000001'::uuid,
  '55550000-0000-0000-0000-000000000002'::uuid,
  '2026-11-20 10:00:00+05:30',
  '2026-11-20 11:00:00+05:30'
);

SELECT is(
  (SELECT count(*)::integer FROM public.availability_slots WHERE counsellor_id = '55550000-0000-0000-0000-000000000002'::uuid),
  1,
  'Initial slot registered successfully'
);

-- Attempt to create overlapping slot for same counsellor: 10:30 to 11:30
PREPARE insert_overlapping_slot AS
  INSERT INTO public.availability_slots (id, counsellor_id, start_time, end_time)
  VALUES (
    '88880000-0000-0000-0000-000000000002'::uuid,
    '55550000-0000-0000-0000-000000000002'::uuid,
    '2026-11-20 10:30:00+05:30',
    '2026-11-20 11:30:00+05:30'
  );

SELECT throws_matching(
  'insert_overlapping_slot',
  'no_overlapping_slots|exclusion',
  'Exclusion constraint must reject overlapping availability slots for the same counsellor'
);

-- -----------------------------------------------------------------------------
-- Test 7: Item 9 Trigger automatically escalates to risk_events
-- -----------------------------------------------------------------------------

INSERT INTO public.assessments (id, student_id, instrument, answers, total, severity, item9_flag)
VALUES (
  '99990000-0000-0000-0000-000000000001'::uuid,
  '55550000-0000-0000-0000-000000000001'::uuid,
  'phq9',
  ARRAY[2,2,2,2,2,2,2,2,1], -- answers[9] = 1 (>0 indicates suicidal ideation)
  17,
  'Moderately Severe',
  true
);

SELECT is(
  (SELECT count(*)::integer FROM public.risk_events 
   WHERE student_id = '55550000-0000-0000-0000-000000000001'::uuid 
     AND trigger_source = 'phq9_item9'
     AND severity_level = 'crisis'),
  1,
  'Assessment with item9_flag=true must automatically generate a crisis risk_event via trigger'
);

SELECT * FROM finish();
ROLLBACK;
