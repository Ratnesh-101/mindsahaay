-- ==============================================================================
-- Test File: 15_demo_data.test.sql
-- Description: pgTAP Test verifying Demo Data Architecture:
--   - RPC load_demo_data() and clear_demo_data() security and execution
--   - Idempotency and zero-duplication
--   - Real data preservation (real rows never deleted or modified)
--   - Cross-user isolation (User A cannot affect User B)
--   - Counsellor care share demo isolation (counsellors never see demo rows)
--   - Institution aggregate k-anonymity suppression ignoring demo rows
--   - Clinical safety: Zero crisis events, followups, or crisis audits created
-- ==============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
SELECT plan(38);

-- 1. Setup Test Fixture Data
DO $$
DECLARE
  v_inst_id uuid := '88880000-0000-0000-0000-000000000001'::uuid;
  v_student_a uuid := '88881111-1111-1111-1111-111111111111'::uuid;
  v_student_b uuid := '88882222-2222-2222-2222-222222222222'::uuid;
  v_counsellor uuid := '88883333-3333-3333-3333-333333333333'::uuid;
BEGIN
  -- Institution
  INSERT INTO public.institutions (id, name, code, domain)
  VALUES (v_inst_id, 'Demo Test Institute of Technology', 'DTIT', 'dtit.ac.in')
  ON CONFLICT (id) DO NOTHING;

  -- Ensure mock auth.users exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email) VALUES
      (v_student_a, 'authenticated', 'authenticated', 'student_a_demo@test.com'),
      (v_student_b, 'authenticated', 'authenticated', 'student_b_demo@test.com'),
      (v_counsellor, 'authenticated', 'authenticated', 'counsellor_demo@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Profiles
  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES
    (v_student_a, 'student', 'Student-A-Demo', 'en', v_inst_id),
    (v_student_b, 'student', 'Student-B-Demo', 'en', v_inst_id),
    (v_counsellor, 'counsellor', 'Dr. Demo Counsellor', 'en', v_inst_id)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    alias = EXCLUDED.alias,
    institution_id = EXCLUDED.institution_id;

  -- Counsellor table entry
  INSERT INTO public.counsellors (id, license_number, specializations, verified, institution_id)
  VALUES (v_counsellor, 'RCI-DEMO-9999', ARRAY['CBT'], true, v_inst_id)
  ON CONFLICT (id) DO UPDATE SET verified = true;

  -- Active Care Share between Student A and Counsellor (scope includes moods and assessments)
  INSERT INTO public.care_shares (id, student_id, counsellor_id, active, scope)
  VALUES (
    '88884444-4444-4444-4444-444444444444'::uuid,
    v_student_a,
    v_counsellor,
    true,
    ARRAY['moods', 'assessments']
  )
  ON CONFLICT (id) DO UPDATE SET active = true, revoked_at = NULL;

  -- Insert REAL health records for Student A (is_demo = false)
  INSERT INTO public.mood_entries (id, student_id, mood, score, tags, is_demo, created_at)
  VALUES (
    '88885555-0001-0000-0000-000000000001'::uuid,
    v_student_a,
    'Good',
    7,
    ARRAY['Calm'],
    false,
    now() - interval '10 days'
  );

  INSERT INTO public.assessments (id, student_id, instrument, answers, total, severity, item9_flag, is_demo, completed_at)
  VALUES (
    '88885555-0002-0000-0000-000000000002'::uuid,
    v_student_a,
    'phq4',
    ARRAY[1, 1, 1, 1],
    4,
    'Mild',
    false,
    false,
    now() - interval '10 days'
  );

  -- Insert REAL health records for Student B (is_demo = false)
  INSERT INTO public.mood_entries (id, student_id, mood, score, tags, is_demo, created_at)
  VALUES (
    '88885555-0003-0000-0000-000000000003'::uuid,
    v_student_b,
    'Okay',
    6,
    ARRAY['Focused'],
    false,
    now() - interval '8 days'
  );

  INSERT INTO public.assessments (id, student_id, instrument, answers, total, severity, item9_flag, is_demo, completed_at)
  VALUES (
    '88885555-0004-0000-0000-000000000004'::uuid,
    v_student_b,
    'phq4',
    ARRAY[0, 0, 0, 0],
    0,
    'Normal',
    false,
    false,
    now() - interval '8 days'
  );
END $$;

-- -----------------------------------------------------------------------------
-- Test Set 1: Anonymous Access Denial
-- -----------------------------------------------------------------------------
SET LOCAL ROLE anon;

SELECT throws_matching(
  'SELECT public.load_demo_data()',
  'permission denied',
  '1. anon role cannot execute load_demo_data()'
);

SELECT throws_matching(
  'SELECT public.clear_demo_data()',
  'permission denied',
  '2. anon role cannot execute clear_demo_data()'
);

-- -----------------------------------------------------------------------------
-- Test Set 2: Authenticated Role without Session Claim (auth.uid() IS NULL)
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '';
SET LOCAL "request.jwt.claim.sub" = '';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_matching(
  'SELECT public.load_demo_data()',
  'Not authenticated',
  '3. Authenticated caller without session claim gets clear error on load_demo_data()'
);

SELECT throws_matching(
  'SELECT public.clear_demo_data()',
  'Not authenticated',
  '4. Authenticated caller without session claim gets clear error on clear_demo_data()'
);

-- -----------------------------------------------------------------------------
-- Test Set 3: No User ID Parameter Spoofing (Functions take zero arguments)
-- -----------------------------------------------------------------------------
SELECT throws_matching(
  'SELECT public.load_demo_data(''88882222-2222-2222-2222-222222222222''::uuid)',
  'function public.load_demo_data\(uuid\) does not exist',
  '5. load_demo_data() rejects user id arguments (cannot spoof other users)'
);

SELECT throws_matching(
  'SELECT public.clear_demo_data(''88882222-2222-2222-2222-222222222222''::uuid)',
  'function public.clear_demo_data\(uuid\) does not exist',
  '6. clear_demo_data() rejects user id arguments (cannot spoof other users)'
);

-- -----------------------------------------------------------------------------
-- Test Set 4: Clear when no demo data exists returns zeros
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "88881111-1111-1111-1111-111111111111", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '88881111-1111-1111-1111-111111111111';

SELECT is(
  public.clear_demo_data(),
  jsonb_build_object('moods', 0, 'assessments', 0),
  '7. clear_demo_data() returns zeros when caller has no demo rows'
);

-- -----------------------------------------------------------------------------
-- Test Set 5: Student A Loads Demo Data
-- -----------------------------------------------------------------------------
SELECT is(
  public.load_demo_data(),
  jsonb_build_object('moods', 26, 'assessments', 3),
  '8. load_demo_data() returns jsonb with expected counts (26 moods, 3 assessments)'
);

SELECT is(
  (SELECT count(*)::integer FROM public.mood_entries WHERE student_id = '88881111-1111-1111-1111-111111111111' AND is_demo = true),
  26,
  '9. Student A has 26 mood check-in records flagged is_demo = true'
);

SELECT is(
  (SELECT count(*)::integer FROM public.assessments WHERE student_id = '88881111-1111-1111-1111-111111111111' AND is_demo = true),
  3,
  '10. Student A has 3 assessment records flagged is_demo = true'
);

SELECT is(
  (SELECT count(*)::integer FROM public.mood_entries WHERE student_id = '88881111-1111-1111-1111-111111111111'),
  27,
  '11. Student A total moods is 27 (26 demo + 1 real)'
);

SELECT is(
  (SELECT count(*)::integer FROM public.assessments WHERE student_id = '88881111-1111-1111-1111-111111111111'),
  4,
  '12. Student A total assessments is 4 (3 demo + 1 real)'
);

-- -----------------------------------------------------------------------------
-- Test Set 6: Clinical Safety Verification (Zero crisis side effects from demo)
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::integer FROM public.risk_events WHERE student_id = '88881111-1111-1111-1111-111111111111'),
  0,
  '13. Demo load creates zero risk_events (item 9 is always 0)'
);

SELECT is(
  (SELECT count(*)::integer FROM public.risk_followups rf JOIN public.risk_events re ON re.id = rf.risk_event_id WHERE re.student_id = '88881111-1111-1111-1111-111111111111'),
  0,
  '14. Demo load creates zero risk_followups'
);

SELECT is(
  (SELECT count(*)::integer FROM public.audit_log WHERE actor_id = '88881111-1111-1111-1111-111111111111' AND action = 'CRISIS_PROTOCOL_ACTIVATED'),
  0,
  '15. Demo load creates zero crisis audit log rows'
);

-- -----------------------------------------------------------------------------
-- Test Set 7: Idempotency (Second load leaves identical counts, no duplicates)
-- -----------------------------------------------------------------------------
SELECT is(
  public.load_demo_data(),
  jsonb_build_object('moods', 26, 'assessments', 3),
  '16. Second load_demo_data() call succeeds and returns same counts'
);

SELECT is(
  (SELECT count(*)::integer FROM public.mood_entries WHERE student_id = '88881111-1111-1111-1111-111111111111' AND is_demo = true),
  26,
  '17. Demo moods count remains 26 after second load (no duplication)'
);

SELECT is(
  (SELECT count(*)::integer FROM public.assessments WHERE student_id = '88881111-1111-1111-1111-111111111111' AND is_demo = true),
  3,
  '18. Demo assessments count remains 3 after second load (no duplication)'
);

SELECT is(
  (SELECT count(*)::integer FROM public.mood_entries WHERE student_id = '88881111-1111-1111-1111-111111111111' AND is_demo = false),
  1,
  '19. Real mood entry for Student A is preserved and untouched'
);

SELECT is(
  (SELECT count(*)::integer FROM public.assessments WHERE student_id = '88881111-1111-1111-1111-111111111111' AND is_demo = false),
  1,
  '20. Real assessment for Student A is preserved and untouched'
);

-- -----------------------------------------------------------------------------
-- Test Set 8: Cross-User Isolation (Student A load did not affect Student B)
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "88882222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '88882222-2222-2222-2222-222222222222';

SELECT is(
  (SELECT count(*)::integer FROM public.mood_entries WHERE student_id = '88882222-2222-2222-2222-222222222222' AND is_demo = true),
  0,
  '21. Student B has 0 demo mood entries (Student A load isolated)'
);

SELECT is(
  (SELECT count(*)::integer FROM public.assessments WHERE student_id = '88882222-2222-2222-2222-222222222222' AND is_demo = true),
  0,
  '22. Student B has 0 demo assessments (Student A load isolated)'
);

SELECT is(
  (SELECT count(*)::integer FROM public.mood_entries WHERE student_id = '88882222-2222-2222-2222-222222222222' AND is_demo = false),
  1,
  '23. Student B real mood entry remains intact'
);

-- -----------------------------------------------------------------------------
-- Test Set 9: Counsellor Care Share Isolation (Counsellor never sees demo rows)
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "88883333-3333-3333-3333-333333333333", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '88883333-3333-3333-3333-333333333333';

SELECT is(
  (SELECT count(*)::integer FROM public.mood_entries WHERE student_id = '88881111-1111-1111-1111-111111111111' AND is_demo = true),
  0,
  '24. Counsellor sees ZERO demo mood entries for Student A under active care share'
);

SELECT is(
  (SELECT count(*)::integer FROM public.mood_entries WHERE student_id = '88881111-1111-1111-1111-111111111111'),
  1,
  '25. Counsellor sees ONLY the 1 real mood entry for Student A'
);

SELECT is(
  (SELECT count(*)::integer FROM public.assessments WHERE student_id = '88881111-1111-1111-1111-111111111111' AND is_demo = true),
  0,
  '26. Counsellor sees ZERO demo assessments for Student A under active care share'
);

SELECT is(
  (SELECT count(*)::integer FROM public.assessments WHERE student_id = '88881111-1111-1111-1111-111111111111'),
  1,
  '27. Counsellor sees ONLY the 1 real assessment for Student A'
);

-- -----------------------------------------------------------------------------
-- Test Set 10: Institution Aggregates Ignore Demo Rows
-- -----------------------------------------------------------------------------
RESET ROLE;

-- Add 8 more real students to DTIT with phq4 Mild (giving 1 + 8 = 9 real students in that cohort)
-- Student A also has 3 demo assessments, but those must be ignored.
-- Since 9 < 10 (k-anonymity threshold), the view must return EMPTY for DTIT.
DO $$
DECLARE
  v_inst_id uuid := '88880000-0000-0000-0000-000000000001'::uuid;
  v_id uuid;
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    v_id := ('88889999-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
      INSERT INTO auth.users (id, aud, role, email)
      VALUES (v_id, 'authenticated', 'authenticated', 'k_student_' || i || '@test.com')
      ON CONFLICT (id) DO NOTHING;
    END IF;

    INSERT INTO public.profiles (id, role, alias, locale, institution_id)
    VALUES (v_id, 'student', 'K-Student-' || i, 'en', v_inst_id)
    ON CONFLICT (id) DO UPDATE SET institution_id = EXCLUDED.institution_id;

    INSERT INTO public.assessments (student_id, instrument, answers, total, severity, item9_flag, is_demo, completed_at)
    VALUES (
      v_id,
      'phq4',
      ARRAY[1, 1, 1, 1],
      4,
      'Mild',
      false,
      false,
      now() - interval '5 days'
    );
  END LOOP;
END $$;

SELECT is_empty(
  'SELECT * FROM public.institution_assessment_aggregates WHERE institution_code = ''DTIT'' AND instrument = ''phq4''',
  '28. k-Anonymity view suppresses cohort when real rows count = 9 (< 10), ignoring demo rows'
);

-- Now add 1 more real student to reach k = 10 (9 + 1 = 10)
DO $$
DECLARE
  v_inst_id uuid := '88880000-0000-0000-0000-000000000001'::uuid;
  v_id uuid := '88889999-0000-0000-0000-000000000009'::uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, aud, role, email)
    VALUES (v_id, 'authenticated', 'authenticated', 'k_student_9@test.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.profiles (id, role, alias, locale, institution_id)
  VALUES (v_id, 'student', 'K-Student-9', 'en', v_inst_id)
  ON CONFLICT (id) DO UPDATE SET institution_id = EXCLUDED.institution_id;

  INSERT INTO public.assessments (student_id, instrument, answers, total, severity, item9_flag, is_demo, completed_at)
  VALUES (
    v_id,
    'phq4',
    ARRAY[1, 1, 1, 1],
    4,
    'Mild',
    false,
    false,
    now() - interval '5 days'
  );
END $$;

SELECT is(
  (SELECT sample_size FROM public.institution_assessment_aggregates WHERE institution_code = 'DTIT' AND instrument = 'phq4'),
  10,
  '29. k-Anonymity view displays sample_size = 10 once real rows reach 10, strictly ignoring demo rows'
);

-- -----------------------------------------------------------------------------
-- Test Set 11: Student Reads Own Demo Presence via Direct Query
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "88881111-1111-1111-1111-111111111111", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '88881111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT count(*)::integer FROM public.mood_entries WHERE is_demo = true),
  26,
  '30. Student A can query their own demo presence via mood_entries?is_demo=eq.true'
);

-- -----------------------------------------------------------------------------
-- Test Set 12: Clear Demo Data Removes Demo Rows and Preserves Real Rows
-- -----------------------------------------------------------------------------
SELECT is(
  public.clear_demo_data(),
  jsonb_build_object('moods', 26, 'assessments', 3),
  '31. clear_demo_data() removes and reports 26 moods and 3 assessments'
);

SELECT is(
  (SELECT count(*)::integer FROM public.mood_entries WHERE student_id = '88881111-1111-1111-1111-111111111111' AND is_demo = true),
  0,
  '32. Student A has 0 demo mood entries remaining'
);

SELECT is(
  (SELECT count(*)::integer FROM public.assessments WHERE student_id = '88881111-1111-1111-1111-111111111111' AND is_demo = true),
  0,
  '33. Student A has 0 demo assessments remaining'
);

SELECT is(
  (SELECT count(*)::integer FROM public.mood_entries WHERE student_id = '88881111-1111-1111-1111-111111111111'),
  1,
  '34. Student A real mood entry survived clear_demo_data()'
);

SELECT is(
  (SELECT count(*)::integer FROM public.assessments WHERE student_id = '88881111-1111-1111-1111-111111111111'),
  1,
  '35. Student A real assessment survived clear_demo_data()'
);

-- -----------------------------------------------------------------------------
-- Test Set 13: Student B Load and Student A Isolation
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "88882222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '88882222-2222-2222-2222-222222222222';

SELECT is(
  public.load_demo_data(),
  jsonb_build_object('moods', 26, 'assessments', 3),
  '36. Student B can load demo data independently'
);

-- Switch to Student A and clear
SET LOCAL "request.jwt.claims" = '{"sub": "88881111-1111-1111-1111-111111111111", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '88881111-1111-1111-1111-111111111111';

SELECT is(
  public.clear_demo_data(),
  jsonb_build_object('moods', 0, 'assessments', 0),
  '37. Student A clearing demo data returns zeros and does not touch Student B'
);

-- Switch back to Student B to verify Student B's demo data is still intact
SET LOCAL "request.jwt.claims" = '{"sub": "88882222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '88882222-2222-2222-2222-222222222222';

SELECT is(
  (SELECT count(*)::integer FROM public.mood_entries WHERE student_id = '88882222-2222-2222-2222-222222222222' AND is_demo = true),
  26,
  '38. Student B demo mood entries remain completely intact'
);

SELECT * FROM finish();
ROLLBACK;
