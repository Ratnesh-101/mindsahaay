-- ==============================================================================
-- Test File: 09_crisis_security_and_isolation.test.sql
-- Description: pgTAP tests for security boundaries, cross-user isolation,
--              risk event update lockdown, checkback immutability & spoofing guards,
--              and server timestamp enforcement on offline events.
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
  v_student_a uuid := 'aaaaaaaa-1111-2222-3333-444444444444'::uuid;
  v_student_b uuid := 'bbbbbbbb-1111-2222-3333-444444444444'::uuid;
  v_counsellor_with_share uuid := 'cccccccc-1111-2222-3333-444444444444'::uuid;
  v_counsellor_no_share uuid := 'dddddddd-1111-2222-3333-444444444444'::uuid;
  v_event_a uuid := '71000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst, 'IIT Delhi Health Centre', 'IITD', 'iitd.ac.in')
  ON CONFLICT (id) DO NOTHING;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_student_a, 'authenticated', 'authenticated', 'student_a@test.com'),
      (v_student_b, 'authenticated', 'authenticated', 'student_b@test.com'),
      (v_counsellor_with_share, 'authenticated', 'authenticated', 'counsellor_with@test.com'),
      (v_counsellor_no_share, 'authenticated', 'authenticated', 'counsellor_without@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES
    (v_student_a, 'student', 'Student-Alice', 'en', v_inst),
    (v_student_b, 'student', 'Student-Bob', 'en', v_inst),
    (v_counsellor_with_share, 'counsellor', 'Dr. Sharma', 'en', v_inst),
    (v_counsellor_no_share, 'counsellor', 'Dr. Verma', 'en', v_inst)
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, alias = EXCLUDED.alias;

  INSERT INTO public.counsellors (id, license_number, specializations, verified, institution_id)
  VALUES
    (v_counsellor_with_share, 'RCI-SEC-001', ARRAY['Crisis'], true, v_inst),
    (v_counsellor_no_share, 'RCI-SEC-002', ARRAY['Crisis'], true, v_inst)
  ON CONFLICT (id) DO NOTHING;

  -- Care share ONLY for counsellor_with_share
  INSERT INTO public.care_shares (student_id, counsellor_id, active, scope, granted_at)
  VALUES (v_student_a, v_counsellor_with_share, true, ARRAY['risk_events'], now() - interval '1 day')
  ON CONFLICT (student_id, counsellor_id) DO UPDATE SET active = true, scope = EXCLUDED.scope;

  -- Risk Event for Student Alice (High Severity)
  INSERT INTO public.risk_events (id, student_id, event_type, severity_level, trigger_source, action_taken, resolved)
  VALUES (v_event_a, v_student_a, 'high_isolation_test', 'high', 'manual', 'logged', false)
  ON CONFLICT (id) DO NOTHING;

  -- Advance Event to 'acknowledged' so prompts exist
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub": "cccccccc-1111-2222-3333-444444444444", "role": "authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'cccccccc-1111-2222-3333-444444444444', true);
  PERFORM public.advance_risk_followup(v_event_a, 'acknowledged', NULL, 'Acknowledged for security tests');
END $$;

-- -----------------------------------------------------------------------------
-- Test 1 & 2: (a) Student CANNOT update their own risk event, counsellor with care share CAN
-- -----------------------------------------------------------------------------

-- Context: Student Alice
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-1111-2222-3333-444444444444", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-1111-2222-3333-444444444444';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

DO $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.risk_events SET resolved = true WHERE id = '71000000-0000-0000-0000-000000000001'::uuid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'Student should not be able to update own risk event';
  END IF;
END $$;

SELECT is(
  (SELECT resolved FROM public.risk_events WHERE id = '71000000-0000-0000-0000-000000000001'::uuid),
  false,
  '(a) Student Alice cannot update resolved or any column on her own risk event (affects 0 rows)'
);

-- Context: Counsellor with Care Share (Dr. Sharma)
SET LOCAL "request.jwt.claims" = '{"sub": "cccccccc-1111-2222-3333-444444444444", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'cccccccc-1111-2222-3333-444444444444';

DO $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.risk_events SET action_taken = 'counsellor_intervened_documented'
  WHERE id = '71000000-0000-0000-0000-000000000001'::uuid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Counsellor with care share should update risk event';
  END IF;
END $$;

SELECT is(
  (SELECT action_taken FROM public.risk_events WHERE id = '71000000-0000-0000-0000-000000000001'::uuid),
  'counsellor_intervened_documented',
  '(a) Counsellor with active care share containing risk_events CAN update risk event'
);

-- -----------------------------------------------------------------------------
-- Test 3, 4, 5: (e) Cross-User Isolation: Student Bob cannot read Alice followups, prompts, checkbacks
-- -----------------------------------------------------------------------------
-- Context: Student Bob
SET LOCAL "request.jwt.claims" = '{"sub": "bbbbbbbb-1111-2222-3333-444444444444", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'bbbbbbbb-1111-2222-3333-444444444444';

SELECT is_empty(
  $$SELECT * FROM public.risk_followups WHERE risk_event_id = '71000000-0000-0000-0000-000000000001'::uuid$$,
  '(e) Student Bob CANNOT read Student Alice risk_followups'
);

SELECT is_empty(
  $$SELECT * FROM public.risk_checkback_prompts WHERE risk_event_id = '71000000-0000-0000-0000-000000000001'::uuid$$,
  '(e) Student Bob CANNOT read Student Alice risk_checkback_prompts'
);

SELECT is_empty(
  $$SELECT * FROM public.risk_checkbacks WHERE risk_event_id = '71000000-0000-0000-0000-000000000001'::uuid$$,
  '(e) Student Bob CANNOT read Student Alice risk_checkbacks'
);

-- -----------------------------------------------------------------------------
-- Test 6: (e) Counsellor without Care Share cannot call advance_risk_followup (raises)
-- -----------------------------------------------------------------------------
-- Context: Counsellor without care share (Dr. Verma)
SET LOCAL "request.jwt.claims" = '{"sub": "dddddddd-1111-2222-3333-444444444444", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'dddddddd-1111-2222-3333-444444444444';

SELECT throws_ok(
  $$SELECT public.advance_risk_followup('71000000-0000-0000-0000-000000000001'::uuid, 'contacted', NULL, 'Unauthorized attempt')$$,
  'P0001',
  NULL,
  '(e) Counsellor without care share CANNOT call advance_risk_followup (raises Unauthorized)'
);

-- -----------------------------------------------------------------------------
-- Test 7, 8, 9, 10, 11: (b) Checkbacks: no update, no delete, no cross-student spoofing, single-answer only
-- -----------------------------------------------------------------------------
-- Context: Student Alice answers her own prompt
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-1111-2222-3333-444444444444", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-1111-2222-3333-444444444444';

DO $$
DECLARE
  v_prompt_id uuid;
BEGIN
  SELECT id INTO v_prompt_id
  FROM public.risk_checkback_prompts
  WHERE risk_event_id = '71000000-0000-0000-0000-000000000001'::uuid
    AND kind = 'h24';

  INSERT INTO public.risk_checkbacks (id, risk_event_id, prompt_id, student_id, answer)
  VALUES (
    '72000000-0000-0000-0000-000000000001'::uuid,
    '71000000-0000-0000-0000-000000000001'::uuid,
    v_prompt_id,
    'aaaaaaaa-1111-2222-3333-444444444444'::uuid,
    'okay'
  );
END $$;

SELECT is(
  (SELECT answer FROM public.risk_checkbacks WHERE id = '72000000-0000-0000-0000-000000000001'::uuid),
  'okay',
  'Student Alice successfully answers her own checkback prompt'
);

-- Test 8: risk_checkbacks cannot be updated (affects 0 rows under RLS; trigger blocks under direct)
DO $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.risk_checkbacks SET answer = 'want_to_talk' WHERE id = '72000000-0000-0000-0000-000000000001'::uuid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'risk_checkbacks should not be updatable via client';
  END IF;
END $$;

SET LOCAL ROLE postgres;
SELECT throws_ok(
  $$UPDATE public.risk_checkbacks SET answer = 'want_to_talk' WHERE id = '72000000-0000-0000-0000-000000000001'::uuid$$,
  'P0001',
  NULL,
  '(b) risk_checkbacks cannot be updated (append-only trigger blocks UPDATE)'
);

-- Test 9: risk_checkbacks cannot be deleted (trigger blocks direct DELETE)
SELECT throws_ok(
  $$DELETE FROM public.risk_checkbacks WHERE id = '72000000-0000-0000-0000-000000000001'::uuid$$,
  'P0001',
  NULL,
  '(b) risk_checkbacks cannot be directly deleted (append-only trigger blocks DELETE)'
);

-- Test 10: Student Bob CANNOT answer Alice prompt (cross-student checkback spoofing fails)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "bbbbbbbb-1111-2222-3333-444444444444", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'bbbbbbbb-1111-2222-3333-444444444444';

SELECT throws_ok(
  $$
  INSERT INTO public.risk_checkbacks (risk_event_id, prompt_id, student_id, answer)
  VALUES (
    '71000000-0000-0000-0000-000000000001'::uuid,
    (SELECT id FROM public.risk_checkback_prompts WHERE risk_event_id = '71000000-0000-0000-0000-000000000001'::uuid AND kind = 'h72'),
    'bbbbbbbb-1111-2222-3333-444444444444'::uuid,
    'want_to_talk'
  )
  $$,
  NULL,
  NULL,
  '(b) Student Bob CANNOT insert a checkback for Student Alice prompt (RLS and validation trigger reject)'
);

-- Test 11: Prompt can be answered only once (unique constraint)
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-1111-2222-3333-444444444444", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-1111-2222-3333-444444444444';

SELECT throws_ok(
  $$
  INSERT INTO public.risk_checkbacks (risk_event_id, prompt_id, student_id, answer)
  VALUES (
    '71000000-0000-0000-0000-000000000001'::uuid,
    (SELECT id FROM public.risk_checkback_prompts WHERE risk_event_id = '71000000-0000-0000-0000-000000000001'::uuid AND kind = 'h24'),
    'aaaaaaaa-1111-2222-3333-444444444444'::uuid,
    'want_to_talk'
  )
  $$,
  '23505', -- unique violation on prompt_id
  NULL,
  '(b) A prompt can be answered only once (duplicate checkback throws unique constraint violation)'
);

-- -----------------------------------------------------------------------------
-- Test 12, 13, 14: Answering 'want_to_talk' reopens to 'open' and creates notification
-- -----------------------------------------------------------------------------
SELECT lives_ok(
  $$
  INSERT INTO public.risk_checkbacks (risk_event_id, prompt_id, student_id, answer)
  VALUES (
    '71000000-0000-0000-0000-000000000001'::uuid,
    (SELECT id FROM public.risk_checkback_prompts WHERE risk_event_id = '71000000-0000-0000-0000-000000000001'::uuid AND kind = 'h72'),
    'aaaaaaaa-1111-2222-3333-444444444444'::uuid,
    'want_to_talk'
  )
  $$,
  'Student Alice answers second prompt with want_to_talk'
);

SELECT is(
  (SELECT step FROM public.risk_followups WHERE risk_event_id = '71000000-0000-0000-0000-000000000001'::uuid ORDER BY seq DESC LIMIT 1),
  'open'::public.followup_step,
  'Answering want_to_talk reopens the risk event followup step to open'
);

-- Check notification as Counsellor Dr. Sharma
SET LOCAL "request.jwt.claims" = '{"sub": "cccccccc-1111-2222-3333-444444444444", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'cccccccc-1111-2222-3333-444444444444';

SELECT is(
  (SELECT count(*)::int FROM public.notifications 
   WHERE user_id = 'cccccccc-1111-2222-3333-444444444444'::uuid
     AND type = 'checkback_want_to_talk'
     AND (metadata->>'risk_event_id')::uuid = '71000000-0000-0000-0000-000000000001'::uuid),
  1,
  'Checkback want_to_talk notification created for counsellor holding care share with scope risk_events'
);

-- -----------------------------------------------------------------------------
-- Test 15: (g) Offline-style event keeps created_at = server now() (client cannot set created_at)
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-1111-2222-3333-444444444444", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-1111-2222-3333-444444444444';

DO $$
BEGIN
  INSERT INTO public.risk_events (
    id,
    student_id,
    event_type,
    severity_level,
    trigger_source,
    action_taken,
    payload,
    created_at
  ) VALUES (
    '71000000-0000-0000-0000-000000000099'::uuid,
    'aaaaaaaa-1111-2222-3333-444444444444'::uuid,
    'offline_client_spoof_attempt',
    'high',
    'chat_crisis',
    'offline_pack',
    '{"offline": true, "detected_at": "2020-01-01T00:00:00Z"}'::jsonb,
    '2020-01-01 00:00:00+00'::timestamptz -- Spoofed past date
  );
END $$;

SELECT is(
  (SELECT (created_at >= now() - interval '10 seconds' AND payload->>'detected_at' = '2020-01-01T00:00:00Z')
   FROM public.risk_events WHERE id = '71000000-0000-0000-0000-000000000099'::uuid),
  true,
  '(g) Offline-style event: client-supplied created_at is ignored by trigger; server enforces created_at = now() while preserving payload.detected_at'
);

SELECT * FROM finish();
ROLLBACK;
