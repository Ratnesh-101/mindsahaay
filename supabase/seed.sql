-- ==============================================================================
-- MindSahaay Demo & Seed Dataset
-- File: supabase/seed.sql
-- Description: Realistic, privacy-preserving demo fixtures for Indian Higher Education
-- Roles Covered: 1 Super Admin, 1 Institution Admin, 3 Counsellors, 1 Moderator, 12 Students
-- Safety & Ethics: STRICTLY SYNTHETIC DEMO DATA. NO REAL PERSONAL DATA.
-- Compliance: India DPDP Act 2023, Mental Healthcare Act 2017, UGC Well-being Guidelines
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. Fixed UUID Constants
-- ==============================================================================
-- Institution: IIST
-- 10000000-0000-0000-0000-000000000001
-- Super Admin:
-- 20000000-0000-0000-0000-000000000001
-- Institution Admin:
-- 20000000-0000-0000-0000-000000000002
-- Moderator:
-- 20000000-0000-0000-0000-000000000003
-- Counsellors (3):
-- 30000000-0000-0000-0000-000000000001 to 30000000-0000-0000-0000-000000000003
-- Students (12):
-- 40000000-0000-0000-0000-000000000001 to 40000000-0000-0000-0000-000000000012
-- Circles (4):
-- 60000000-0000-0000-0000-000000000001 to 60000000-0000-0000-0000-000000000004

-- ==============================================================================
-- 2. Institution Fixture (Indian Institute of Science & Technology)
-- ==============================================================================
INSERT INTO public.institutions (
  id,
  name,
  code,
  domain,
  city,
  state,
  helpline_contact,
  created_at
) VALUES (
  '10000000-0000-0000-0000-000000000001'::uuid,
  'Indian Institute of Science & Technology (IIST)',
  'IIST',
  'iist.ac.in',
  'Bengaluru',
  'Karnataka',
  '14416',
  now() - interval '90 days'
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  domain = EXCLUDED.domain;

-- ==============================================================================
-- 3. Auth Users (If auth.users table is accessible in Supabase environment)
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
      -- Super Admin
      ('20000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'admin@mindsahaay.test', crypt('DemoAdmin@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"super_admin","alias":"SuperAdmin-System"}', now(), now()),
      -- Institution Admin
      ('20000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'dean.wellbeing@iist.ac.in', crypt('DemoDean@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"institution_admin","alias":"Admin-IIST-Dean","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      -- Moderator
      ('20000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'moderator@iist.ac.in', crypt('DemoMod@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"moderator","alias":"Moderator-SafeSpace","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      -- Counsellors (3)
      ('30000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'dr.ananya@iist.ac.in', crypt('DemoCounsellor@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"counsellor","alias":"Dr. Ananya Sharma","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      ('30000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'dr.rajesh@iist.ac.in', crypt('DemoCounsellor@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"counsellor","alias":"Dr. Rajesh Nair","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      ('30000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'priya.mukherjee@iist.ac.in', crypt('DemoCounsellor@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"counsellor","alias":"Priya Mukherjee","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      -- Students (12)
      ('40000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'student01@iist.ac.in', crypt('DemoPass@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"student","alias":"Student-Aarav","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      ('40000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'student02@iist.ac.in', crypt('DemoPass@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"student","alias":"Student-Diya","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      ('40000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'student03@iist.ac.in', crypt('DemoPass@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"student","alias":"Student-Ishaan","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      ('40000000-0000-0000-0000-000000000004'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'student04@iist.ac.in', crypt('DemoPass@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"student","alias":"Student-Kavya","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      ('40000000-0000-0000-0000-000000000005'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'student05@iist.ac.in', crypt('DemoPass@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"student","alias":"Student-Rohan","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      ('40000000-0000-0000-0000-000000000006'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'student06@iist.ac.in', crypt('DemoPass@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"student","alias":"Student-Ananya","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      ('40000000-0000-0000-0000-000000000007'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'student07@iist.ac.in', crypt('DemoPass@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"student","alias":"Student-Siddharth","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      ('40000000-0000-0000-0000-000000000008'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'student08@iist.ac.in', crypt('DemoPass@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"student","alias":"Student-Meera","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      ('40000000-0000-0000-0000-000000000009'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'student09@iist.ac.in', crypt('DemoPass@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"student","alias":"Student-Aditya","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      ('40000000-0000-0000-0000-000000000010'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'student10@iist.ac.in', crypt('DemoPass@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"student","alias":"Student-Pooja","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      ('40000000-0000-0000-0000-000000000011'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'student11@iist.ac.in', crypt('DemoPass@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"student","alias":"Student-Vikram","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now()),
      ('40000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'student12@iist.ac.in', crypt('DemoPass@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"student","alias":"Student-Sneha","institution_id":"10000000-0000-0000-0000-000000000001"}', now(), now())
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ==============================================================================
-- 4. User Profiles Table
-- ==============================================================================
INSERT INTO public.profiles (id, role, alias, locale, institution_id, created_at, updated_at)
VALUES
  -- Super Admin
  ('20000000-0000-0000-0000-000000000001'::uuid, 'super_admin', 'SuperAdmin-System', 'en', NULL, now() - interval '90 days', now()),
  -- Institution Admin
  ('20000000-0000-0000-0000-000000000002'::uuid, 'institution_admin', 'Admin-IIST-Dean', 'en', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '90 days', now()),
  -- Moderator
  ('20000000-0000-0000-0000-000000000003'::uuid, 'moderator', 'Moderator-SafeSpace', 'en', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '80 days', now()),
  -- 3 Counsellors
  ('30000000-0000-0000-0000-000000000001'::uuid, 'counsellor', 'Dr. Ananya Sharma', 'en', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '75 days', now()),
  ('30000000-0000-0000-0000-000000000002'::uuid, 'counsellor', 'Dr. Rajesh Nair', 'en', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '70 days', now()),
  ('30000000-0000-0000-0000-000000000003'::uuid, 'counsellor', 'Priya Mukherjee', 'en', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '65 days', now()),
  -- 12 Students
  ('40000000-0000-0000-0000-000000000001'::uuid, 'student', 'Student-Aarav', 'en', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '60 days', now()),
  ('40000000-0000-0000-0000-000000000002'::uuid, 'student', 'Student-Diya', 'en', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '55 days', now()),
  ('40000000-0000-0000-0000-000000000003'::uuid, 'student', 'Student-Ishaan', 'hi', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '50 days', now()),
  ('40000000-0000-0000-0000-000000000004'::uuid, 'student', 'Student-Kavya', 'en', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '45 days', now()),
  ('40000000-0000-0000-0000-000000000005'::uuid, 'student', 'Student-Rohan', 'en', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '40 days', now()),
  ('40000000-0000-0000-0000-000000000006'::uuid, 'student', 'Student-Ananya', 'hi', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '35 days', now()),
  ('40000000-0000-0000-0000-000000000007'::uuid, 'student', 'Student-Siddharth', 'en', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '30 days', now()),
  ('40000000-0000-0000-0000-000000000008'::uuid, 'student', 'Student-Meera', 'en', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '25 days', now()),
  ('40000000-0000-0000-0000-000000000009'::uuid, 'student', 'Student-Aditya', 'en', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '20 days', now()),
  ('40000000-0000-0000-0000-000000000010'::uuid, 'student', 'Student-Pooja', 'hi', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '15 days', now()),
  ('40000000-0000-0000-0000-000000000011'::uuid, 'student', 'Student-Vikram', 'en', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '10 days', now()),
  ('40000000-0000-0000-0000-000000000012'::uuid, 'student', 'Student-Sneha', 'en', '10000000-0000-0000-0000-000000000001'::uuid, now() - interval '5 days', now())
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role,
  alias = EXCLUDED.alias,
  institution_id = EXCLUDED.institution_id;

-- ==============================================================================
-- 5. Consents Ledger (DPDP Act 2023 Initial Consent Grants)
-- ==============================================================================
INSERT INTO public.consents (student_id, purpose, consented, policy_version, granted_at)
SELECT
  p.id,
  'data_processing'::public.consent_purpose,
  true,
  '2023.1-DPDP',
  p.created_at
FROM public.profiles p
WHERE p.role = 'student'
  AND NOT EXISTS (
    SELECT 1 FROM public.consents c
    WHERE c.student_id = p.id AND c.purpose = 'data_processing'
  );

-- ==============================================================================
-- 6. Counsellors Details & Verification
-- ==============================================================================
INSERT INTO public.counsellors (id, license_number, specializations, bio, verified, institution_id, created_at)
VALUES
  (
    '30000000-0000-0000-0000-000000000001'::uuid,
    'RCI-CRR-2018-09142',
    ARRAY['Cognitive Behavioral Therapy (CBT)', 'Exam Stress', 'Sleep Hygiene', 'Depression'],
    'Clinical Psychologist registered with the Rehabilitation Council of India (RCI). Specializes in university student transition and cognitive therapy.',
    true,
    '10000000-0000-0000-0000-000000000001'::uuid,
    now() - interval '75 days'
  ),
  (
    '30000000-0000-0000-0000-000000000002'::uuid,
    'RCI-CRR-2020-11893',
    ARRAY['Mindfulness & Grounding', 'General Anxiety Disorder', 'Hostel Isolation', 'Social Phobia'],
    'Counselling Psychologist with 6+ years experience supporting undergraduate and postgraduate engineering students through homesickness and social adjustment.',
    true,
    '10000000-0000-0000-0000-000000000001'::uuid,
    now() - interval '70 days'
  ),
  (
    '30000000-0000-0000-0000-000000000003'::uuid,
    'RCI-CRR-2021-04281',
    ARRAY['Placement Anxiety', 'Career Identity Crisis', 'Interpersonal Relationships', 'Burnout Prevention'],
    'Mental Health Counselor focusing on final-year placement season stress, perfectionism, and career path discernment for technical students.',
    true,
    '10000000-0000-0000-0000-000000000001'::uuid,
    now() - interval '65 days'
  )
ON CONFLICT (id) DO UPDATE SET
  license_number = EXCLUDED.license_number,
  verified = true;

-- ==============================================================================
-- 7. Counsellor Availability Slots (Past and Future for Consultations)
-- ==============================================================================
INSERT INTO public.availability_slots (id, counsellor_id, start_time, end_time, is_booked, created_at)
VALUES
  -- Dr. Ananya Sharma slots
  ('50000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, now() + interval '1 day 10 hours', now() + interval '1 day 10 hours 50 minutes', false, now()),
  ('50000000-0000-0000-0000-000000000002'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, now() + interval '1 day 11 hours', now() + interval '1 day 11 hours 50 minutes', false, now()),
  ('50000000-0000-0000-0000-000000000003'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, now() + interval '2 days 14 hours', now() + interval '2 days 14 hours 50 minutes', true, now()),
  ('50000000-0000-0000-0000-000000000004'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, now() + interval '2 days 15 hours', now() + interval '2 days 15 hours 50 minutes', false, now()),

  -- Dr. Rajesh Nair slots
  ('50000000-0000-0000-0000-000000000005'::uuid, '30000000-0000-0000-0000-000000000002'::uuid, now() + interval '1 day 14 hours', now() + interval '1 day 14 hours 50 minutes', false, now()),
  ('50000000-0000-0000-0000-000000000006'::uuid, '30000000-0000-0000-0000-000000000002'::uuid, now() + interval '1 day 15 hours', now() + interval '1 day 15 hours 50 minutes', true, now()),
  ('50000000-0000-0000-0000-000000000007'::uuid, '30000000-0000-0000-0000-000000000002'::uuid, now() + interval '3 days 11 hours', now() + interval '3 days 11 hours 50 minutes', false, now()),

  -- Priya Mukherjee slots
  ('50000000-0000-0000-0000-000000000008'::uuid, '30000000-0000-0000-0000-000000000003'::uuid, now() + interval '1 day 16 hours', now() + interval '1 day 16 hours 50 minutes', false, now()),
  ('50000000-0000-0000-0000-000000000009'::uuid, '30000000-0000-0000-0000-000000000003'::uuid, now() + interval '2 days 10 hours', now() + interval '2 days 10 hours 50 minutes', false, now()),
  ('50000000-0000-0000-0000-000000000010'::uuid, '30000000-0000-0000-0000-000000000003'::uuid, now() + interval '3 days 16 hours', now() + interval '3 days 16 hours 50 minutes', false, now())
ON CONFLICT (id) DO NOTHING;

-- Sample Booked Appointments
INSERT INTO public.appointments (
  id, student_id, counsellor_id, slot_id, scheduled_at, status, meeting_url, notes, created_at
) VALUES
  (
    '70000000-0000-0000-0000-000000000001'::uuid,
    '40000000-0000-0000-0000-000000000001'::uuid, -- Student-Aarav
    '30000000-0000-0000-0000-000000000001'::uuid, -- Dr. Ananya
    '50000000-0000-0000-0000-000000000003'::uuid,
    now() + interval '2 days 14 hours',
    'confirmed'::public.appointment_status,
    'https://meet.mindsahaay.org/consultation/iist-consult-7001',
    'Follow up on sleep patterns and mid-semester study workload.',
    now() - interval '1 day'
  ),
  (
    '70000000-0000-0000-0000-000000000002'::uuid,
    '40000000-0000-0000-0000-000000000005'::uuid, -- Student-Rohan
    '30000000-0000-0000-0000-000000000002'::uuid, -- Dr. Rajesh
    '50000000-0000-0000-0000-000000000006'::uuid,
    now() + interval '1 day 15 hours',
    'confirmed'::public.appointment_status,
    'https://meet.mindsahaay.org/consultation/iist-consult-7002',
    'Hostel roommate friction and focus strategies.',
    now() - interval '2 days'
  )
ON CONFLICT (id) DO NOTHING;

-- Active Care Shares for Booked Consultations
INSERT INTO public.care_shares (student_id, counsellor_id, active, scope, granted_at)
VALUES
  (
    '40000000-0000-0000-0000-000000000001'::uuid, -- Student-Aarav
    '30000000-0000-0000-0000-000000000001'::uuid, -- Dr. Ananya
    true,
    ARRAY['assessments', 'moods'],
    now() - interval '2 days'
  ),
  (
    '40000000-0000-0000-0000-000000000005'::uuid, -- Student-Rohan
    '30000000-0000-0000-0000-000000000002'::uuid, -- Dr. Rajesh
    true,
    ARRAY['assessments', 'moods'],
    now() - interval '3 days'
  )
ON CONFLICT (student_id, counsellor_id) DO NOTHING;

-- ==============================================================================
-- 8. Standardized Mental Health Assessments (12 Students, N >= 10 for Analytics)
-- ==============================================================================
-- Inserting at least 12 PHQ-9 and PHQ-4 records ensures that the k >= 10 views
-- (institution_assessment_aggregates) populate with valid aggregate data!

INSERT INTO public.assessments (student_id, instrument, answers, total, severity, item9_flag, metadata, completed_at)
VALUES
  ('40000000-0000-0000-0000-000000000001'::uuid, 'phq9', ARRAY[1,2,1,1,0,1,1,0,0], 7, 'Mild', false, '{"band":"Mild"}', now() - interval '20 days'),
  ('40000000-0000-0000-0000-000000000002'::uuid, 'phq9', ARRAY[2,2,1,2,1,2,1,1,0], 12, 'Moderate', false, '{"band":"Moderate"}', now() - interval '18 days'),
  ('40000000-0000-0000-0000-000000000003'::uuid, 'phq9', ARRAY[1,1,1,0,0,1,0,1,0], 5, 'Mild', false, '{"band":"Mild"}', now() - interval '16 days'),
  ('40000000-0000-0000-0000-000000000004'::uuid, 'phq9', ARRAY[2,3,2,2,1,2,2,1,0], 15, 'Moderately Severe', false, '{"band":"Moderately Severe"}', now() - interval '15 days'),
  ('40000000-0000-0000-0000-000000000005'::uuid, 'phq9', ARRAY[0,1,0,1,1,0,0,1,0], 4, 'Minimal', false, '{"band":"Minimal"}', now() - interval '14 days'),
  ('40000000-0000-0000-0000-000000000006'::uuid, 'phq9', ARRAY[2,2,2,2,2,1,1,0,0], 12, 'Moderate', false, '{"band":"Moderate"}', now() - interval '12 days'),
  ('40000000-0000-0000-0000-000000000007'::uuid, 'phq9', ARRAY[1,0,1,1,0,0,1,1,0], 5, 'Mild', false, '{"band":"Mild"}', now() - interval '10 days'),
  ('40000000-0000-0000-0000-000000000008'::uuid, 'phq9', ARRAY[2,1,2,1,1,1,0,1,0], 9, 'Mild', false, '{"band":"Mild"}', now() - interval '9 days'),
  ('40000000-0000-0000-0000-000000000009'::uuid, 'phq9', ARRAY[2,3,3,2,2,2,1,1,0], 16, 'Moderately Severe', false, '{"band":"Moderately Severe"}', now() - interval '7 days'),
  ('40000000-0000-0000-0000-000000000010'::uuid, 'phq9', ARRAY[1,1,0,1,0,1,0,0,0], 4, 'Minimal', false, '{"band":"Minimal"}', now() - interval '6 days'),
  ('40000000-0000-0000-0000-000000000011'::uuid, 'phq9', ARRAY[2,2,1,2,1,1,2,0,0], 11, 'Moderate', false, '{"band":"Moderate"}', now() - interval '4 days'),
  ('40000000-0000-0000-0000-000000000012'::uuid, 'phq9', ARRAY[1,1,1,0,1,1,0,1,0], 6, 'Mild', false, '{"band":"Mild"}', now() - interval '2 days'),

  -- Additional PHQ-4 baseline screenings
  ('40000000-0000-0000-0000-000000000001'::uuid, 'phq4', ARRAY[1,1,1,1], 4, 'Mild', false, '{"anxiety_sub":2,"depression_sub":2}', now() - interval '30 days'),
  ('40000000-0000-0000-0000-000000000002'::uuid, 'phq4', ARRAY[2,2,2,1], 7, 'Moderate', false, '{"anxiety_sub":4,"depression_sub":3}', now() - interval '28 days'),
  ('40000000-0000-0000-0000-000000000003'::uuid, 'phq4', ARRAY[0,1,1,0], 2, 'Normal', false, '{"anxiety_sub":1,"depression_sub":1}', now() - interval '25 days'),
  ('40000000-0000-0000-0000-000000000004'::uuid, 'phq4', ARRAY[2,3,2,2], 9, 'Severe', false, '{"anxiety_sub":5,"depression_sub":4}', now() - interval '22 days'),
  ('40000000-0000-0000-0000-000000000005'::uuid, 'phq4', ARRAY[1,0,1,0], 2, 'Normal', false, '{"anxiety_sub":1,"depression_sub":1}', now() - interval '20 days'),
  ('40000000-0000-0000-0000-000000000006'::uuid, 'phq4', ARRAY[2,2,1,1], 6, 'Moderate', false, '{"anxiety_sub":4,"depression_sub":2}', now() - interval '18 days'),
  ('40000000-0000-0000-0000-000000000007'::uuid, 'phq4', ARRAY[1,1,0,1], 3, 'Mild', false, '{"anxiety_sub":2,"depression_sub":1}', now() - interval '15 days'),
  ('40000000-0000-0000-0000-000000000008'::uuid, 'phq4', ARRAY[1,2,1,1], 5, 'Mild', false, '{"anxiety_sub":3,"depression_sub":2}', now() - interval '12 days'),
  ('40000000-0000-0000-0000-000000000009'::uuid, 'phq4', ARRAY[3,2,2,2], 9, 'Severe', false, '{"anxiety_sub":5,"depression_sub":4}', now() - interval '10 days'),
  ('40000000-0000-0000-0000-000000000010'::uuid, 'phq4', ARRAY[0,1,0,0], 1, 'Normal', false, '{"anxiety_sub":1,"depression_sub":0}', now() - interval '8 days'),
  ('40000000-0000-0000-0000-000000000011'::uuid, 'phq4', ARRAY[2,1,1,2], 6, 'Moderate', false, '{"anxiety_sub":3,"depression_sub":3}', now() - interval '6 days'),
  ('40000000-0000-0000-0000-000000000012'::uuid, 'phq4', ARRAY[1,1,1,0], 3, 'Mild', false, '{"anxiety_sub":2,"depression_sub":1}', now() - interval '3 days');

-- ==============================================================================
-- 9. Daily Mood Check-in History (Multiple entries per student)
-- ==============================================================================
INSERT INTO public.mood_entries (student_id, mood, score, tags, notes, created_at)
VALUES
  ('40000000-0000-0000-0000-000000000001'::uuid, 'Calm', 8, ARRAY['Morning', 'Library'], 'Finished problem set early today.', now() - interval '14 days'),
  ('40000000-0000-0000-0000-000000000001'::uuid, 'Stressed', 4, ARRAY['Exams', 'Deadlines'], 'Mid-semester syllabus seems very long.', now() - interval '7 days'),
  ('40000000-0000-0000-0000-000000000001'::uuid, 'Relieved', 7, ARRAY['Friends', 'Canteen'], 'Chatted with hostel mates, feeling better.', now() - interval '1 day'),

  ('40000000-0000-0000-0000-000000000002'::uuid, 'Overwhelmed', 3, ARRAY['Placements', 'Interviews'], 'Had two mock technical interviews back to back.', now() - interval '12 days'),
  ('40000000-0000-0000-0000-000000000002'::uuid, 'Grounded', 6, ARRAY['Breathing', 'Mindfulness'], 'Practiced 4-7-8 breathing before bed.', now() - interval '5 days'),

  ('40000000-0000-0000-0000-000000000003'::uuid, 'Homesick', 4, ARRAY['Hostel', 'Family'], 'Missing home-cooked food and family.', now() - interval '10 days'),
  ('40000000-0000-0000-0000-000000000003'::uuid, 'Content', 7, ARRAY['Sports', 'Badminton'], 'Played sports at the campus sports complex.', now() - interval '3 days'),

  ('40000000-0000-0000-0000-000000000004'::uuid, 'Anxious', 3, ARRAY['CGPA', 'Grades'], 'Worrying about relative grading curve.', now() - interval '8 days'),
  ('40000000-0000-0000-0000-000000000004'::uuid, 'Hopeful', 6, ARRAY['Study Group'], 'Group study helped clarify complex concepts.', now() - interval '2 days'),

  ('40000000-0000-0000-0000-000000000005'::uuid, 'Peaceful', 8, ARRAY['Music', 'Walk'], 'Took a quiet evening walk around the botanical garden.', now() - interval '11 days'),
  ('40000000-0000-0000-0000-000000000006'::uuid, 'Exhausted', 4, ARRAY['Late Night', 'Coding'], 'Slept late fixing a bug for lab evaluation.', now() - interval '9 days'),
  ('40000000-0000-0000-0000-000000000007'::uuid, 'Energized', 8, ARRAY['Project', 'Hackathon'], 'Great progress on our mini project presentation.', now() - interval '6 days'),
  ('40000000-0000-0000-0000-000000000008'::uuid, 'Neutral', 6, ARRAY['Lectures', 'Routine'], 'Regular classes throughout the day.', now() - interval '7 days'),
  ('40000000-0000-0000-0000-000000000009'::uuid, 'Restless', 4, ARRAY['Placement', 'Resume'], 'Editing resume points for campus drive.', now() - interval '5 days'),
  ('40000000-0000-0000-0000-000000000010'::uuid, 'Happy', 9, ARRAY['Festival', 'Celebration'], 'Campus cultural event was wonderful.', now() - interval '4 days'),
  ('40000000-0000-0000-0000-000000000011'::uuid, 'Focused', 7, ARRAY['Library', 'Notes'], 'Good 4 hours of undistracted study.', now() - interval '3 days'),
  ('40000000-0000-0000-0000-000000000012'::uuid, 'Calm', 8, ARRAY['Yoga', 'Morning'], 'Started morning yoga routine.', now() - interval '1 day');

-- ==============================================================================
-- 10. Community Peer Circles
-- ==============================================================================
INSERT INTO public.circles (id, name, slug, description, category, institution_id, is_private, created_by, created_at)
VALUES
  (
    '60000000-0000-0000-0000-000000000001'::uuid,
    'Study & Exam Stress Circle',
    'study-exam-stress',
    'A safe space to share study routines, coping with mid-term pressure, and academic burnout.',
    'academics',
    '10000000-0000-0000-0000-000000000001'::uuid,
    false,
    '20000000-0000-0000-0000-000000000003'::uuid,
    now() - interval '60 days'
  ),
  (
    '60000000-0000-0000-0000-000000000002'::uuid,
    'Hostel Life & Homesickness',
    'hostel-life',
    'Navigating shared rooms, mess food, adjusting to life away from home, and finding community.',
    'lifestyle',
    '10000000-0000-0000-0000-000000000001'::uuid,
    false,
    '20000000-0000-0000-0000-000000000003'::uuid,
    now() - interval '55 days'
  ),
  (
    '60000000-0000-0000-0000-000000000003'::uuid,
    'Mindfulness & Daily Grounding',
    'mindfulness-grounding',
    'Daily check-ins, breathwork sharing, 5-4-3-2-1 technique, and quiet relaxation habits.',
    'wellbeing',
    NULL, -- Open across institutions
    false,
    '20000000-0000-0000-0000-000000000003'::uuid,
    now() - interval '50 days'
  ),
  (
    '60000000-0000-0000-0000-000000000004'::uuid,
    'Placement & Career Discernment',
    'career-anxiety',
    'Support during recruitment rounds, handling rejections, comparing oneself with peers, and building resilience.',
    'career',
    '10000000-0000-0000-0000-000000000001'::uuid,
    false,
    '20000000-0000-0000-0000-000000000003'::uuid,
    now() - interval '45 days'
  )
ON CONFLICT (id) DO NOTHING;

-- Circle Memberships
INSERT INTO public.circle_members (circle_id, user_id, role, joined_at)
SELECT
  '60000000-0000-0000-0000-000000000001'::uuid,
  p.id,
  'member',
  now() - interval '30 days'
FROM public.profiles p
WHERE p.role = 'student'
LIMIT 8
ON CONFLICT (circle_id, user_id) DO NOTHING;

-- ==============================================================================
-- 11. Community Posts & Comments
-- ==============================================================================
INSERT INTO public.posts (
  id, circle_id, author_id, title, content, is_anonymous, moderation_status, ai_moderation, likes_count, created_at
) VALUES
  (
    '80000000-0000-0000-0000-000000000001'::uuid,
    '60000000-0000-0000-0000-000000000001'::uuid,
    '40000000-0000-0000-0000-000000000001'::uuid,
    'How do you manage study fatigue before mid-terms?',
    'I find myself studying for 6-7 hours straight and retaining nothing by 9 PM. Has anyone tried the Pomodoro method with 25-minute blocks? What works for keeping focus without feeling guilty during breaks?',
    true,
    'approved'::public.moderation_status,
    '{"checked": true, "clean": true}',
    14,
    now() - interval '10 days'
  ),
  (
    '80000000-0000-0000-0000-000000000002'::uuid,
    '60000000-0000-0000-0000-000000000002'::uuid,
    '40000000-0000-0000-0000-000000000003'::uuid,
    'First semester in hostel: tips for homesickness',
    'The silence in the room in the evenings makes me really miss my hometown and family. Sharing with a roommate who has completely different sleep timings. Would love to hear how seniors adapted during their first year.',
    true,
    'approved'::public.moderation_status,
    '{"checked": true, "clean": true}',
    22,
    now() - interval '8 days'
  ),
  (
    '80000000-0000-0000-0000-000000000004'::uuid,
    '60000000-0000-0000-0000-000000000004'::uuid,
    '40000000-0000-0000-0000-000000000002'::uuid,
    'Dealing with rejection emails during Day 1 placements',
    'It is really tough seeing WhatsApp groups celebrating offers while you are staring at a rejection mail. Just wanted to remind anyone in the same boat that day one does not define your entire career journey.',
    true,
    'approved'::public.moderation_status,
    '{"checked": true, "clean": true}',
    35,
    now() - interval '5 days'
  )
ON CONFLICT (id) DO NOTHING;

-- Comments on Posts
INSERT INTO public.comments (
  id, post_id, author_id, content, is_anonymous, moderation_status, created_at
) VALUES
  (
    '90000000-0000-0000-0000-000000000001'::uuid,
    '80000000-0000-0000-0000-000000000001'::uuid,
    '40000000-0000-0000-0000-000000000004'::uuid,
    '50 minutes work + 10 minutes walk completely transformed my afternoons. Do not touch your phone during those 10 minutes though!',
    true,
    'approved'::public.moderation_status,
    now() - interval '9 days'
  ),
  (
    '90000000-0000-0000-0000-000000000002'::uuid,
    '80000000-0000-0000-0000-000000000002'::uuid,
    '40000000-0000-0000-0000-000000000005'::uuid,
    'Joining an evening badminton game or reading in the central library really helped me. You are not alone in this!',
    true,
    'approved'::public.moderation_status,
    now() - interval '7 days'
  )
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- 12. Zero-Knowledge CBT Thought Records (Encrypted Ciphertext)
-- ==============================================================================
INSERT INTO public.thought_records (student_id, ciphertext, iv, salt, created_at)
VALUES
  (
    '40000000-0000-0000-0000-000000000001'::uuid,
    'U2FsdGVkX1+m2Wk3N9mZq9Xk8...[AES-GCM-256-ENCRYPTED-CBT-THOUGHT-RECORD-STUDENT-01]',
    'aXYwMDEyMzQ1Njc4OQ==',
    'c2FsdDAwMTIzNDU2Nzg5',
    now() - interval '5 days'
  ),
  (
    '40000000-0000-0000-0000-000000000002'::uuid,
    'U2FsdGVkX1+k4Pq1L0oXp8Yj7...[AES-GCM-256-ENCRYPTED-CBT-THOUGHT-RECORD-STUDENT-02]',
    'aXYwMDIyMzQ1Njc4OQ==',
    'c2FsdDAwMjIzNDU2Nzg5',
    now() - interval '3 days'
  );

-- ==============================================================================
-- 13. Audit Log Entries (Append-Only Demo Ledger)
-- ==============================================================================
INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, details, created_at)
VALUES
  (
    '20000000-0000-0000-0000-000000000001'::uuid,
    'SYSTEM_SEED_INITIALIZED',
    'database',
    'mindsahaay',
    '{"institution": "IIST", "students_seeded": 12, "counsellors_seeded": 3}',
    now()
  );

-- ==============================================================================
-- 14. Feature X: Crisis Follow-Through Loop Fixtures (Worker A Demo Data)
-- ==============================================================================

-- 14.1 Backup Counsellor for IIST
INSERT INTO public.institution_backup_counsellors (institution_id, counsellor_id)
VALUES (
  '10000000-0000-0000-0000-000000000001'::uuid, -- IIST
  '30000000-0000-0000-0000-000000000003'::uuid  -- Priya Mukherjee (Backup Counsellor)
)
ON CONFLICT (institution_id) DO UPDATE SET counsellor_id = EXCLUDED.counsellor_id;

-- 14.2 Active Care Shares scoped to include 'risk_events'
INSERT INTO public.care_shares (student_id, counsellor_id, active, scope, granted_at)
VALUES
  (
    '40000000-0000-0000-0000-000000000001'::uuid, -- Student-Aarav
    '30000000-0000-0000-0000-000000000001'::uuid, -- Dr. Ananya Sharma
    true,
    ARRAY['assessments', 'moods', 'risk_events'],
    now() - interval '30 days'
  ),
  (
    '40000000-0000-0000-0000-000000000002'::uuid, -- Student-Diya
    '30000000-0000-0000-0000-000000000001'::uuid, -- Dr. Ananya Sharma
    true,
    ARRAY['assessments', 'moods', 'risk_events'],
    now() - interval '25 days'
  ),
  (
    '40000000-0000-0000-0000-000000000003'::uuid, -- Student-Ishaan
    '30000000-0000-0000-0000-000000000002'::uuid, -- Dr. Rajesh Nair
    true,
    ARRAY['assessments', 'moods', 'risk_events'],
    now() - interval '20 days'
  ),
  (
    '40000000-0000-0000-0000-000000000004'::uuid, -- Student-Kavya
    '30000000-0000-0000-0000-000000000001'::uuid, -- Dr. Ananya Sharma
    true,
    ARRAY['risk_events'],
    now() - interval '15 days'
  ),
  (
    '40000000-0000-0000-0000-000000000005'::uuid, -- Student-Rohan
    '30000000-0000-0000-0000-000000000002'::uuid, -- Dr. Rajesh Nair
    true,
    ARRAY['assessments', 'moods', 'risk_events'],
    now() - interval '10 days'
  )
ON CONFLICT (student_id, counsellor_id) DO UPDATE SET
  scope = EXCLUDED.scope,
  active = EXCLUDED.active;

-- 14.3 Demo Risk Events at Different Ages and Steps
-- Event 1: Aarav (Crisis, 5 hours old - Overdue Level 1)
INSERT INTO public.risk_events (
  id, student_id, event_type, severity_level, trigger_source, action_taken, payload, resolved, created_at
) VALUES (
  '50000000-0000-0000-0000-000000000010'::uuid,
  '40000000-0000-0000-0000-000000000001'::uuid,
  'suicidal_ideation_item9',
  'crisis'::public.risk_severity,
  'phq9_item9'::public.risk_trigger,
  'crisis_protocol_activated_helpline_presented',
  '{"helpline_presented": "14416", "item9_score": 2}',
  false,
  now() - interval '5 hours'
) ON CONFLICT (id) DO NOTHING;

-- Event 2: Diya (Crisis, 8 hours old - Overdue Level 2)
INSERT INTO public.risk_events (
  id, student_id, event_type, severity_level, trigger_source, action_taken, payload, resolved, created_at
) VALUES (
  '50000000-0000-0000-0000-000000000011'::uuid,
  '40000000-0000-0000-0000-000000000002'::uuid,
  'chat_crisis_escalation',
  'crisis'::public.risk_severity,
  'chat_crisis'::public.risk_trigger,
  'crisis_protocol_activated_helpline_presented',
  '{"helpline_presented": "14416", "trigger_context": "urgent_safety_support"}',
  false,
  now() - interval '8 hours'
) ON CONFLICT (id) DO NOTHING;

-- Event 3: Ishaan (High, 16 hours old - Overdue Level 2)
INSERT INTO public.risk_events (
  id, student_id, event_type, severity_level, trigger_source, action_taken, payload, resolved, created_at
) VALUES (
  '50000000-0000-0000-0000-000000000012'::uuid,
  '40000000-0000-0000-0000-000000000003'::uuid,
  'severe_depression_phq9',
  'high'::public.risk_severity,
  'assessment_escalation'::public.risk_trigger,
  'counsellor_alert_logged',
  '{"phq9_total": 21, "band": "Severe"}',
  false,
  now() - interval '16 hours'
) ON CONFLICT (id) DO NOTHING;

-- Event 4: Kavya (High, 8 hours old - Acknowledged with Prompts)
INSERT INTO public.risk_events (
  id, student_id, event_type, severity_level, trigger_source, action_taken, payload, resolved, created_at
) VALUES (
  '50000000-0000-0000-0000-000000000013'::uuid,
  '40000000-0000-0000-0000-000000000004'::uuid,
  'distress_keyword_flag',
  'high'::public.risk_severity,
  'lexicon_match'::public.risk_trigger,
  'counsellor_alert_logged',
  '{"matched_category": "severe_hopelessness"}',
  false,
  now() - interval '8 hours'
) ON CONFLICT (id) DO NOTHING;

-- Advance Event 4 to 'acknowledged'
INSERT INTO public.risk_followups (
  id, risk_event_id, step, actor_id, note, created_at
) VALUES (
  '51000000-0000-0000-0000-000000000001'::uuid,
  '50000000-0000-0000-0000-000000000013'::uuid,
  'acknowledged',
  '30000000-0000-0000-0000-000000000001'::uuid, -- Dr. Ananya
  'Acknowledged by counsellor; reviewing wellness profile.',
  now() - interval '6 hours'
) ON CONFLICT (id) DO NOTHING;

-- Event 5: Rohan (Crisis, 12 hours old - In Progress: Contacted -> Handed Off)
INSERT INTO public.risk_events (
  id, student_id, event_type, severity_level, trigger_source, action_taken, payload, resolved, created_at
) VALUES (
  '50000000-0000-0000-0000-000000000014'::uuid,
  '40000000-0000-0000-0000-000000000005'::uuid,
  'suicidal_ideation_item9',
  'crisis'::public.risk_severity,
  'phq9_item9'::public.risk_trigger,
  'crisis_protocol_activated_helpline_presented',
  '{"helpline_presented": "14416", "item9_score": 3}',
  false,
  now() - interval '12 hours'
) ON CONFLICT (id) DO NOTHING;

-- Advance Event 5: acknowledged -> contacted -> handed_off
INSERT INTO public.risk_followups (id, risk_event_id, step, actor_id, note, created_at)
VALUES
  (
    '51000000-0000-0000-0000-000000000002'::uuid,
    '50000000-0000-0000-0000-000000000014'::uuid,
    'acknowledged',
    '30000000-0000-0000-0000-000000000002'::uuid, -- Dr. Rajesh
    'Urgent crisis priority noted; initiating student contact.',
    now() - interval '10 hours'
  ),
  (
    '51000000-0000-0000-0000-000000000003'::uuid,
    '50000000-0000-0000-0000-000000000014'::uuid,
    'contacted',
    '30000000-0000-0000-0000-000000000002'::uuid, -- Dr. Rajesh
    'Contacted student via verified campus channel.',
    now() - interval '8 hours'
  ),
  (
    '51000000-0000-0000-0000-000000000004'::uuid,
    '50000000-0000-0000-0000-000000000014'::uuid,
    'handed_off',
    '30000000-0000-0000-0000-000000000002'::uuid, -- Dr. Rajesh
    'Handed off to clinical supervisor for scheduled evaluation.',
    now() - interval '4 hours'
  )
ON CONFLICT (id) DO NOTHING;

-- Event 6: Aarav (High, 3 days old - Closed and Resolved)
INSERT INTO public.risk_events (
  id, student_id, event_type, severity_level, trigger_source, action_taken, payload, resolved, created_at
) VALUES (
  '50000000-0000-0000-0000-000000000015'::uuid,
  '40000000-0000-0000-0000-000000000001'::uuid,
  'severe_anxiety_gad7',
  'high'::public.risk_severity,
  'manual'::public.risk_trigger,
  'counsellor_alert_logged',
  '{"gad7_total": 19}',
  false,
  now() - interval '3 days'
) ON CONFLICT (id) DO NOTHING;

-- Advance Event 6 to closed
INSERT INTO public.risk_followups (id, risk_event_id, step, actor_id, closure_reason, note, created_at)
VALUES
  (
    '51000000-0000-0000-0000-000000000005'::uuid,
    '50000000-0000-0000-0000-000000000015'::uuid,
    'acknowledged',
    '30000000-0000-0000-0000-000000000001'::uuid,
    NULL,
    'Acknowledged high anxiety alert.',
    now() - interval '2 days 20 hours'
  ),
  (
    '51000000-0000-0000-0000-000000000006'::uuid,
    '50000000-0000-0000-0000-000000000015'::uuid,
    'contacted',
    '30000000-0000-0000-0000-000000000001'::uuid,
    NULL,
    'Spoke with student and scheduled session.',
    now() - interval '2 days 15 hours'
  ),
  (
    '51000000-0000-0000-0000-000000000007'::uuid,
    '50000000-0000-0000-0000-000000000015'::uuid,
    'handed_off',
    '30000000-0000-0000-0000-000000000001'::uuid,
    NULL,
    'Handed off to counsellor consultation session.',
    now() - interval '2 days 10 hours'
  ),
  (
    '51000000-0000-0000-0000-000000000008'::uuid,
    '50000000-0000-0000-0000-000000000015'::uuid,
    'closed',
    '30000000-0000-0000-0000-000000000001'::uuid,
    'student_reached_safe',
    'Student attended counselling session and verified safe with coping plan.',
    now() - interval '2 days 5 hours'
  )
ON CONFLICT (id) DO NOTHING;

-- Event 7: Diya (High, Offline-Queued Event, 1 hour old)
INSERT INTO public.risk_events (
  id, student_id, event_type, severity_level, trigger_source, action_taken, payload, resolved, created_at
) VALUES (
  '50000000-0000-0000-0000-000000000016'::uuid,
  '40000000-0000-0000-0000-000000000002'::uuid,
  'offline_crisis_trigger',
  'high'::public.risk_severity,
  'chat_crisis'::public.risk_trigger,
  'offline_crisis_pack_displayed',
  '{"offline": true, "detected_at": "2026-11-20T08:00:00Z"}',
  false,
  now() - interval '1 hour'
) ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ==============================================================================
-- 18. Warm Handoff & Server-Side Opt-Out Demo Fixtures (Appended)
-- ==============================================================================
BEGIN;

-- Future unbooked availability slot for Dr. Ananya Sharma
INSERT INTO public.availability_slots (
  id, counsellor_id, start_time, end_time, is_booked, created_at
) VALUES (
  '31000000-0000-0000-0000-000000000099'::uuid,
  '30000000-0000-0000-0000-000000000001'::uuid,
  now() + interval '1 day 4 hours',
  now() + interval '1 day 5 hours',
  false,
  now() - interval '1 day'
) ON CONFLICT (id) DO NOTHING;

COMMIT;

