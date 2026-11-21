-- ==============================================================================
-- Migration: 0002_triggers.sql
-- Project: MindSahaay (Digital Mental Health Platform for Indian HEIs)
-- Description: Triggers (Auto Profile Creation, Audit Logging, Append-Only Protection),
--              and k-Anonymity Institutional Aggregate Views (k >= 10)
-- Compliance: India DPDP Act 2023, Mental Healthcare Act 2017, Statistical Disclosure Control
-- ==============================================================================

-- ==============================================================================
-- 1. Automatic Profile Creation on Signup
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_role public.user_role := 'student';
  v_alias text;
  v_locale text := 'en';
  v_institution_id uuid := NULL;
BEGIN
  -- Generate a privacy-preserving anonymous alias if none provided
  v_alias := COALESCE(
    new.raw_user_meta_data->>'alias',
    'Student-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  );

  -- Safely parse role from user metadata
  IF new.raw_user_meta_data->>'role' IS NOT NULL THEN
    BEGIN
      v_role := (new.raw_user_meta_data->>'role')::public.user_role;
    EXCEPTION WHEN OTHERS THEN
      v_role := 'student'::public.user_role;
    END;
  END IF;

  -- Locale (default 'en', supporting 'hi', 'ta', 'te', 'bn', 'mr', etc.)
  IF new.raw_user_meta_data->>'locale' IS NOT NULL THEN
    v_locale := new.raw_user_meta_data->>'locale';
  END IF;

  -- Institutional affiliation: verify institution exists before assignment
  IF new.raw_user_meta_data->>'institution_id' IS NOT NULL THEN
    BEGIN
      v_institution_id := (new.raw_user_meta_data->>'institution_id')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.institutions WHERE id = v_institution_id) THEN
        v_institution_id := NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_institution_id := NULL;
    END;
  END IF;

  -- Create corresponding profile record
  INSERT INTO public.profiles (
    id,
    role,
    alias,
    locale,
    institution_id,
    avatar_seed,
    created_at,
    updated_at
  ) VALUES (
    new.id,
    v_role,
    v_alias,
    v_locale,
    v_institution_id,
    substr(new.id::text, 1, 8),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    updated_at = now(),
    alias = EXCLUDED.alias,
    locale = EXCLUDED.locale;

  -- Record initial consent ledger entry for DPDP Act 2023 compliance
  INSERT INTO public.consents (
    student_id,
    purpose,
    consented,
    policy_version,
    granted_at
  ) VALUES (
    new.id,
    'data_processing'::public.consent_purpose,
    true,
    '2023.1-DPDP',
    now()
  );

  RETURN new;
END;
$$;

-- Trigger to hook into Supabase Auth signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant trigger execution privileges to Supabase Auth daemon if role exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
  END IF;
END $$;

-- ==============================================================================
-- 2. Append-Only Ledger Enforcement Triggers (DPDP Act 2023)
-- ==============================================================================

-- 2.1 Enforce Consents Ledger Immutability (Allows cascading profile erasure)
CREATE OR REPLACE FUNCTION public.enforce_consents_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow cascade deletion triggered by parent profile deletion (DPDP Right to Erasure)
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'DPDP Compliance Violation: Consents ledger is strictly append-only. Updates and deletions are forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_consents_tampering ON public.consents;
CREATE TRIGGER trg_prevent_consents_tampering
  BEFORE UPDATE OR DELETE ON public.consents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_consents_append_only();

-- 2.2 Enforce Audit Log Immutability (Allows ON DELETE SET NULL cascade on actor_id)
CREATE OR REPLACE FUNCTION public.enforce_audit_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Security Policy Violation: Audit log entries are immutable and cannot be modified or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_tampering ON public.audit_log;
CREATE TRIGGER trg_prevent_audit_log_tampering
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_log_append_only();

-- ==============================================================================
-- 3. Audit Helpers and Automated Event Logging
-- ==============================================================================

-- General audit helper procedure
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_actor_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_ip_hash text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_log (
    actor_id,
    action,
    resource_type,
    resource_id,
    details,
    ip_hash,
    created_at
  ) VALUES (
    p_actor_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_details,
    p_ip_hash,
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Trigger: Audit Care Share Lifecycle (Grant & Revocation)
CREATE OR REPLACE FUNCTION public.audit_care_shares_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    PERFORM public.log_audit_event(
      new.student_id,
      'CARE_SHARE_GRANTED',
      'care_shares',
      new.id::text,
      jsonb_build_object(
        'counsellor_id', new.counsellor_id,
        'scope', new.scope,
        'active', new.active,
        'expires_at', new.expires_at
      )
    );
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.active = true AND NEW.active = false) THEN
      PERFORM public.log_audit_event(
        new.student_id,
        'CARE_SHARE_REVOKED',
        'care_shares',
        new.id::text,
        jsonb_build_object(
          'counsellor_id', new.counsellor_id,
          'revoked_at', now()
        )
      );
    END IF;
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM public.log_audit_event(
      old.student_id,
      'CARE_SHARE_DELETED',
      'care_shares',
      old.id::text,
      jsonb_build_object('counsellor_id', old.counsellor_id)
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_care_shares ON public.care_shares;
CREATE TRIGGER trg_audit_care_shares
  AFTER INSERT OR UPDATE OR DELETE ON public.care_shares
  FOR EACH ROW EXECUTE FUNCTION public.audit_care_shares_trigger();

-- Trigger: Automatically flag item 9 suicidal ideation before insert (Clinical Safety Standard)
CREATE OR REPLACE FUNCTION public.enforce_assessment_crisis_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.instrument = 'phq9' THEN
    IF (array_length(NEW.answers, 1) >= 9 AND NEW.answers[9] > 0) THEN
      NEW.item9_flag := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assessment_crisis_flag ON public.assessments;
CREATE TRIGGER trg_assessment_crisis_flag
  BEFORE INSERT ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_assessment_crisis_flag();

-- Trigger: Automatic Crisis Event Creation from PHQ-9 Item 9 Flag
CREATE OR REPLACE FUNCTION public.handle_assessment_crisis_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.instrument = 'phq9' AND NEW.item9_flag = true THEN
    -- Ensure a risk event is formally recorded
    INSERT INTO public.risk_events (
      student_id,
      event_type,
      severity_level,
      trigger_source,
      action_taken,
      payload,
      created_at
    ) VALUES (
      new.student_id,
      'suicidal_ideation_item9',
      'crisis'::public.risk_severity,
      'phq9_item9'::public.risk_trigger,
      'crisis_protocol_activated_helpline_presented',
      jsonb_build_object(
        'assessment_id', new.id,
        'total_score', new.total,
        'item9_score', new.answers[9],
        'helpline_telemanas', '14416',
        'helpline_kiran', '1800-599-0019',
        'emergency_services', '112'
      ),
      now()
    );

    -- Log crisis event in audit log
    PERFORM public.log_audit_event(
      new.student_id,
      'CRISIS_PROTOCOL_ACTIVATED',
      'assessments',
      new.id::text,
      jsonb_build_object(
        'reason', 'PHQ-9 item 9 non-zero',
        'total', new.total
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assessment_crisis ON public.assessments;
CREATE TRIGGER trg_assessment_crisis
  AFTER INSERT ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.handle_assessment_crisis_trigger();

-- ==============================================================================
-- 4. k-Anonymity Institutional Aggregate Views (k >= 10, security_invoker = true)
-- ==============================================================================
-- In accordance with India DPDP Act 2023 & Statistical Disclosure Control,
-- individual student health records must NEVER be accessible to institution admins.
-- Only aggregate distributions with group size k >= 10 are visible.
-- Cells with N < 10 are completely excluded/suppressed to prevent deanonymization.
-- WITH (security_invoker = true) ensures views strictly obey invoker RLS.

-- 4.1 Assessment Aggregates (k >= 10)
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
GROUP BY
  p.institution_id,
  i.name,
  i.code,
  a.instrument,
  a.severity,
  date_trunc('month', a.completed_at)
HAVING count(*) >= 10;

-- 4.2 Mood Trend Aggregates (k >= 10)
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
GROUP BY
  p.institution_id,
  i.name,
  m.mood,
  date_trunc('week', m.created_at)
HAVING count(*) >= 10;

-- 4.3 Risk Distribution Aggregates (k >= 10)
CREATE OR REPLACE VIEW public.institution_risk_aggregates
WITH (security_invoker = true) AS
SELECT
  p.institution_id,
  i.name AS institution_name,
  r.severity_level,
  date_trunc('month', r.created_at)::date AS report_month,
  count(*)::integer AS incident_count
FROM public.risk_events r
JOIN public.profiles p ON p.id = r.student_id
JOIN public.institutions i ON i.id = p.institution_id
GROUP BY
  p.institution_id,
  i.name,
  r.severity_level,
  date_trunc('month', r.created_at)
HAVING count(*) >= 10;

-- 4.4 Institutional Anonymized Summary Function with Row Filtering for Admins
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
  -- Strict permission check: caller must be super_admin OR institution_admin for this institution
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
  GROUP BY a.instrument, a.severity, date_trunc('month', a.completed_at)
  HAVING count(*) >= 10; -- Enforce k >= 10 suppression
END;
$$;

-- Grant usage on views & helper functions to authenticated users
GRANT SELECT ON public.institution_assessment_aggregates TO authenticated;
GRANT SELECT ON public.institution_mood_aggregates TO authenticated;
GRANT SELECT ON public.institution_risk_aggregates TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_institution_wellbeing_summary(uuid) TO authenticated;
