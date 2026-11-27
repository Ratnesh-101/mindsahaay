-- ==============================================================================
-- Migration: 0009_demo_data.sql
-- Description: Demo Data Architecture for MindSahaay Platform
-- Author: Worker D1 (Database)
-- Compliance: India DPDP Act 2023, Mental Healthcare Act 2017, UGC Guidelines
-- Requirements:
--   1. Add is_demo column to mood_entries and assessments (default false)
--   2. RPC load_demo_data() and clear_demo_data() (SECURITY DEFINER, auth.uid() scoped)
--   3. Exclude is_demo rows from institution aggregate views and counsellor read paths
--   4. Ensure zero crisis events, zero followups, zero crisis audits triggered by demo rows
-- ==============================================================================

-- 1. Add is_demo columns to mood_entries and assessments
ALTER TABLE public.mood_entries
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mood_entries_student_demo
  ON public.mood_entries (student_id, is_demo);

CREATE INDEX IF NOT EXISTS idx_assessments_student_demo
  ON public.assessments (student_id, is_demo);

-- 2. Update RLS policies on mood_entries and assessments
-- Counsellors and care shares must NEVER see demo rows; the student owner sees both real and demo rows.

DROP POLICY IF EXISTS "Students own mood entries read" ON public.mood_entries;
CREATE POLICY "Students own mood entries read"
  ON public.mood_entries FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR (
      public.has_active_care_share(student_id, auth.uid(), 'moods')
      AND is_demo = false
    )
  );

DROP POLICY IF EXISTS "Assessments viewable by owner or authorized counsellor" ON public.assessments;
CREATE POLICY "Assessments viewable by owner or authorized counsellor"
  ON public.assessments FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR (
      public.has_active_care_share(student_id, auth.uid(), 'assessments')
      AND is_demo = false
    )
  );

-- 3. Update Institution Aggregates to strictly EXCLUDE is_demo rows
-- k-Anonymity views (k >= 10, security_invoker = true)

CREATE OR REPLACE VIEW public.institution_assessment_aggregates
WITH (security_invoker = true) AS
SELECT
  p.institution_id,
  i.name AS institution_name,
  i.code AS institution_code,
  a.instrument,
  a.severity,
  date_trunc('month', a.completed_at)::date AS report_month,
  count(*)::integer AS sample_size,
  round(avg(a.total), 2) AS mean_score,
  sum(CASE WHEN a.item9_flag THEN 1 ELSE 0 END)::integer AS crisis_indicators
FROM public.assessments a
JOIN public.profiles p ON p.id = a.student_id
JOIN public.institutions i ON i.id = p.institution_id
WHERE a.is_demo = false
GROUP BY
  p.institution_id,
  i.name,
  i.code,
  a.instrument,
  a.severity,
  date_trunc('month', a.completed_at)
HAVING count(*) >= 10;

CREATE OR REPLACE VIEW public.institution_mood_aggregates
WITH (security_invoker = true) AS
SELECT
  p.institution_id,
  i.name AS institution_name,
  m.mood,
  date_trunc('week', m.created_at)::date AS report_week,
  count(*)::integer AS sample_size,
  round(avg(m.score), 2) AS avg_intensity
FROM public.mood_entries m
JOIN public.profiles p ON p.id = m.student_id
JOIN public.institutions i ON i.id = p.institution_id
WHERE m.is_demo = false
GROUP BY
  p.institution_id,
  i.name,
  m.mood,
  date_trunc('week', m.created_at)
HAVING count(*) >= 10;

-- 4. Update get_institution_wellbeing_summary to exclude is_demo
CREATE OR REPLACE FUNCTION public.get_institution_wellbeing_summary(p_institution_id uuid)
RETURNS TABLE (
  instrument public.assessment_instrument,
  severity_band text,
  report_month date,
  sample_size integer,
  mean_score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (
    public.is_super_admin() OR
    public.is_institution_admin(p_institution_id)
  ) THEN
    RAISE EXCEPTION 'Access Denied: Only designated institution administrators may access anonymized aggregates.';
  END IF;

  RETURN QUERY
  SELECT
    a.instrument,
    a.severity AS severity_band,
    date_trunc('month', a.completed_at)::date AS report_month,
    count(*)::integer AS sample_size,
    round(avg(a.total), 2) AS mean_score
  FROM public.assessments a
  JOIN public.profiles p ON p.id = a.student_id
  WHERE p.institution_id = p_institution_id
    AND a.is_demo = false
  GROUP BY a.instrument, a.severity, date_trunc('month', a.completed_at)
  HAVING count(*) >= 10;
END;
$$;

GRANT SELECT ON public.institution_assessment_aggregates TO authenticated;
GRANT SELECT ON public.institution_mood_aggregates TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_institution_wellbeing_summary(uuid) TO authenticated;

-- 5. Safety Trigger Hardening: Ensure demo assessments NEVER create risk events, follow-ups, or audits
CREATE OR REPLACE FUNCTION public.handle_assessment_crisis_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Strict guard: demo assessments must never activate crisis protocols
  IF NEW.instrument = 'phq9' AND NEW.item9_flag = true AND COALESCE(NEW.is_demo, false) = false THEN
    INSERT INTO public.risk_events (
      student_id,
      event_type,
      severity_level,
      trigger_source,
      action_taken,
      payload,
      created_at
    ) VALUES (
      NEW.student_id,
      'suicidal_ideation_item9',
      'crisis'::public.risk_severity,
      'phq9_item9'::public.risk_trigger,
      'crisis_protocol_activated_helpline_presented',
      jsonb_build_object(
        'assessment_id', NEW.id,
        'total_score', NEW.total,
        'item9_score', NEW.answers[9],
        'helpline_telemanas', '14416',
        'helpline_kiran', '1800-599-0019',
        'emergency_services', '112'
      ),
      now()
    );

    PERFORM public.log_audit_event(
      NEW.student_id,
      'CRISIS_PROTOCOL_ACTIVATED',
      'assessments',
      NEW.id::text,
      jsonb_build_object(
        'reason', 'PHQ-9 item 9 non-zero',
        'total', NEW.total
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 6. RPC: clear_demo_data()
-- Removes ONLY is_demo = true rows of the authenticated caller; real rows are untouched.
-- Calling with no demo rows returns {"moods": 0, "assessments": 0}.
CREATE OR REPLACE FUNCTION public.clear_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_moods_deleted integer := 0;
  v_assessments_deleted integer := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated: session required' USING ERRCODE = '28000';
  END IF;

  WITH deleted_moods AS (
    DELETE FROM public.mood_entries
    WHERE student_id = v_user_id AND is_demo = true
    RETURNING id
  )
  SELECT count(*)::integer INTO v_moods_deleted FROM deleted_moods;

  WITH deleted_assessments AS (
    DELETE FROM public.assessments
    WHERE student_id = v_user_id AND is_demo = true
    RETURNING id
  )
  SELECT count(*)::integer INTO v_assessments_deleted FROM deleted_assessments;

  RETURN jsonb_build_object(
    'moods', v_moods_deleted,
    'assessments', v_assessments_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clear_demo_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_demo_data() FROM anon;
GRANT EXECUTE ON FUNCTION public.clear_demo_data() TO authenticated;

-- 7. RPC: load_demo_data()
-- Idempotent: clears caller's existing demo rows, then inserts ~30 days of mood check-ins
-- and 3 sample screenings (all with is_demo = true, item 9 = 0).
CREATE OR REPLACE FUNCTION public.load_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_moods_count integer := 0;
  v_assessments_count integer := 0;
  v_now timestamptz := clock_timestamp();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated: session required' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'Profile not found for authenticated user' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: remove caller's existing demo rows first
  DELETE FROM public.mood_entries
  WHERE student_id = v_user_id AND is_demo = true;

  DELETE FROM public.assessments
  WHERE student_id = v_user_id AND is_demo = true;

  -- Insert 26 mood check-in records across 30 days (4 days skipped to look natural)
  -- Emotion vocabulary: Anxious, Calm, Exhausted, Grateful, Homesick, Overwhelmed,
  --                     Hopeful, Stressed, Lonely, Focused, Relieved, Burnout
  -- Scores 1..10 with gentle trend and a few low days; notes NULL
  INSERT INTO public.mood_entries (
    student_id, mood, score, tags, notes, is_demo, created_at
  )
  VALUES
    (v_user_id, 'Low', 4, ARRAY['Homesick', 'Anxious'], NULL, true, v_now - interval '29 days' + interval '9 hours'),
    (v_user_id, 'Low', 5, ARRAY['Exhausted'], NULL, true, v_now - interval '28 days' + interval '14 hours'),
    (v_user_id, 'Rough', 4, ARRAY['Overwhelmed', 'Stressed'], NULL, true, v_now - interval '27 days' + interval '11 hours'),
    (v_user_id, 'Okay', 5, ARRAY['Lonely'], NULL, true, v_now - interval '26 days' + interval '16 hours'),
    -- Day 25 skipped
    (v_user_id, 'Okay', 6, ARRAY['Calm'], NULL, true, v_now - interval '24 days' + interval '10 hours'),
    (v_user_id, 'Okay', 6, ARRAY['Focused'], NULL, true, v_now - interval '23 days' + interval '15 hours'),
    (v_user_id, 'Good', 7, ARRAY['Hopeful', 'Focused'], NULL, true, v_now - interval '22 days' + interval '12 hours'),
    (v_user_id, 'Okay', 5, ARRAY['Stressed'], NULL, true, v_now - interval '21 days' + interval '18 hours'),
    (v_user_id, 'Okay', 6, ARRAY['Calm'], NULL, true, v_now - interval '20 days' + interval '10 hours'),
    -- Day 19 skipped
    (v_user_id, 'Good', 7, ARRAY['Focused', 'Relieved'], NULL, true, v_now - interval '18 days' + interval '14 hours'),
    (v_user_id, 'Okay', 6, ARRAY['Exhausted'], NULL, true, v_now - interval '17 days' + interval '17 hours'),
    (v_user_id, 'Good', 8, ARRAY['Grateful', 'Calm'], NULL, true, v_now - interval '16 days' + interval '11 hours'),
    (v_user_id, 'Good', 7, ARRAY['Focused'], NULL, true, v_now - interval '15 days' + interval '13 hours'),
    (v_user_id, 'Low', 5, ARRAY['Burnout', 'Stressed'], NULL, true, v_now - interval '14 days' + interval '16 hours'),
    (v_user_id, 'Okay', 6, ARRAY['Relieved'], NULL, true, v_now - interval '13 days' + interval '12 hours'),
    (v_user_id, 'Good', 7, ARRAY['Hopeful'], NULL, true, v_now - interval '12 days' + interval '15 hours'),
    -- Day 11 skipped
    (v_user_id, 'Good', 8, ARRAY['Calm', 'Grateful'], NULL, true, v_now - interval '10 days' + interval '10 hours'),
    (v_user_id, 'Good', 7, ARRAY['Focused'], NULL, true, v_now - interval '9 days' + interval '14 hours'),
    (v_user_id, 'Good', 8, ARRAY['Hopeful', 'Calm'], NULL, true, v_now - interval '8 days' + interval '11 hours'),
    (v_user_id, 'Great', 9, ARRAY['Grateful', 'Relieved'], NULL, true, v_now - interval '7 days' + interval '16 hours'),
    -- Day 6 skipped
    (v_user_id, 'Good', 8, ARRAY['Focused', 'Calm'], NULL, true, v_now - interval '5 days' + interval '13 hours'),
    (v_user_id, 'Good', 7, ARRAY['Hopeful'], NULL, true, v_now - interval '4 days' + interval '12 hours'),
    (v_user_id, 'Good', 8, ARRAY['Relieved', 'Grateful'], NULL, true, v_now - interval '3 days' + interval '17 hours'),
    (v_user_id, 'Great', 9, ARRAY['Hopeful', 'Focused'], NULL, true, v_now - interval '2 days' + interval '15 hours'),
    (v_user_id, 'Good', 8, ARRAY['Calm', 'Grateful'], NULL, true, v_now - interval '1 days' + interval '14 hours'),
    (v_user_id, 'Good', 8, ARRAY['Calm', 'Focused'], NULL, true, v_now - interval '4 hours');

  GET DIAGNOSTICS v_moods_count = ROW_COUNT;

  -- Insert 3 sample screenings matching scoring.ts cutoffs and severity labels
  -- Item 9 is ALWAYS 0; no crisis event, follow-up, or alert is created
  INSERT INTO public.assessments (
    student_id, instrument, answers, total, severity, item9_flag, metadata, is_demo, completed_at, created_at
  )
  VALUES
    (
      v_user_id,
      'phq9'::public.assessment_instrument,
      ARRAY[1, 1, 1, 1, 0, 1, 0, 1, 0],
      6,
      'Mild',
      false,
      jsonb_build_object('item9Score', 0, 'crisisFlag', false),
      true,
      v_now - interval '20 days',
      v_now - interval '20 days'
    ),
    (
      v_user_id,
      'gad7'::public.assessment_instrument,
      ARRAY[1, 1, 1, 1, 1, 1, 0],
      6,
      'Mild anxiety',
      false,
      jsonb_build_object('highAnxietyIndicator', false),
      true,
      v_now - interval '12 days',
      v_now - interval '12 days'
    ),
    (
      v_user_id,
      'phq9'::public.assessment_instrument,
      ARRAY[0, 1, 0, 1, 0, 0, 0, 1, 0],
      3,
      'Minimal or None',
      false,
      jsonb_build_object('item9Score', 0, 'crisisFlag', false),
      true,
      v_now - interval '3 days',
      v_now - interval '3 days'
    );

  GET DIAGNOSTICS v_assessments_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'moods', v_moods_count,
    'assessments', v_assessments_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.load_demo_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.load_demo_data() FROM anon;
GRANT EXECUTE ON FUNCTION public.load_demo_data() TO authenticated;
