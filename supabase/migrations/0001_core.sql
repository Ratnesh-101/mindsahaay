-- ==============================================================================
-- Migration: 0001_core.sql
-- Project: MindSahaay (Digital Mental Health Platform for Indian HEIs)
-- Description: Core Schema, Enums, Tables, Constraints, and Row-Level Security
-- Compliance: India DPDP Act 2023, Mental Healthcare Act 2017, UGC HEI Guidelines
-- ==============================================================================

-- 1. Required Schemas and PostgreSQL Extensions
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA extensions;

-- Ensure public and extensions are accessible in search_path for GiST operators
SET search_path TO public, extensions;

-- Portability fallback for plain Postgres / test harnesses ONLY.
-- On a real Supabase project the auth schema and auth.users already exist and the
-- migration role has no CREATE privilege on schema auth, so even
-- 'CREATE TABLE IF NOT EXISTS auth.users' fails with 'permission denied for schema auth'.
-- Everything is therefore guarded by an existence check and is a no-op on Supabase.
DO $auth_fallback$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token varchar(255),
  confirmation_sent_at timestamptz,
  recovery_token varchar(255),
  recovery_sent_at timestamptz,
  email_change_token_new varchar(255),
  email_change varchar(255),
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  is_super_admin boolean,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  phone text,
  phone_confirmed_at timestamptz,
  phone_change text,
  phone_change_token varchar(255),
  phone_change_sent_at timestamptz,
  confirmed_at timestamptz,
  email_change_token_current varchar(255),
  email_change_confirm_status smallint,
  banned_until timestamptz,
  reauthentication_token varchar(255),
  reauthentication_sent_at timestamptz,
  is_sso_user boolean DEFAULT false NOT NULL,
  deleted_at timestamptz,
  is_anonymous boolean DEFAULT false NOT NULL
    );
  END IF;
END
$auth_fallback$;

-- IMPORTANT: these are created ONLY when they do not already exist. On a real
-- Supabase project auth.uid() and auth.role() are owned by supabase_auth_admin and
-- must never be replaced; the existence check makes this block a no-op there.
DO $fallback$
BEGIN
  IF to_regprocedure('auth.uid()') IS NULL THEN
    EXECUTE $f$
      CREATE FUNCTION auth.uid()
      RETURNS uuid
      LANGUAGE sql
      STABLE
      AS $body$
        SELECT COALESCE(
          NULLIF(current_setting('request.jwt.claim.sub', true), ''),
          (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
        )::uuid;
      $body$
    $f$;
  END IF;

  IF to_regprocedure('auth.role()') IS NULL THEN
    EXECUTE $f$
      CREATE FUNCTION auth.role()
      RETURNS text
      LANGUAGE sql
      STABLE
      AS $body$
        SELECT COALESCE(
          NULLIF(current_setting('request.jwt.claim.role', true), ''),
          (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
        )::text;
      $body$
    $f$;
  END IF;
END
$fallback$;

-- 2. Enumerated Types
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM (
    'student',
    'counsellor',
    'moderator',
    'institution_admin',
    'super_admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.consent_purpose AS ENUM (
    'data_processing',
    'crisis_intervention',
    'analytics',
    'counsellor_sharing',
    'peer_support',
    'research'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.assessment_instrument AS ENUM (
    'phq9',
    'gad7',
    'phq4'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.risk_severity AS ENUM (
    'low',
    'medium',
    'high',
    'crisis'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.risk_trigger AS ENUM (
    'phq9_item9',
    'chat_crisis',
    'lexicon_match',
    'manual',
    'assessment_escalation'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.appointment_status AS ENUM (
    'scheduled',
    'confirmed',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ==============================================================================
-- 3. Core Tables
-- ==============================================================================

-- 3.1 Institutions (Universities, Colleges, Institutes of National Importance)
CREATE TABLE IF NOT EXISTS public.institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  domain text UNIQUE NOT NULL,
  city text,
  state text,
  helpline_contact text DEFAULT '14416',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.2 Profiles (Linked 1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'student',
  alias text NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  institution_id uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  avatar_seed text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.3 Consents (DPDP Act 2023 Append-Only Consent Ledger)
CREATE TABLE IF NOT EXISTS public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purpose public.consent_purpose NOT NULL,
  consented boolean NOT NULL,
  policy_version text NOT NULL DEFAULT '2023.1-DPDP',
  ip_hash text,
  user_agent_hash text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- 3.4 Mood Entries (Daily Check-ins & Ecological Momentary Assessment)
CREATE TABLE IF NOT EXISTS public.mood_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mood text NOT NULL,
  score integer NOT NULL CHECK (score >= 1 AND score <= 10),
  tags text[] DEFAULT '{}'::text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.5 Assessments (PHQ-9, GAD-7, PHQ-4 with Item 9 Suicidal Ideation Flag)
CREATE TABLE IF NOT EXISTS public.assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  instrument public.assessment_instrument NOT NULL,
  answers integer[] NOT NULL,
  total integer NOT NULL,
  severity text NOT NULL,
  item9_flag boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.6 Journal Entries (Zero-Knowledge Client-Side Encrypted: Ciphertext, IV, Salt Only)
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  salt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.7 Safety Plans (Stanley-Brown Suicide Safety Planning Intervention)
CREATE TABLE IF NOT EXISTS public.safety_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  warning_signs text[] DEFAULT '{}'::text[],
  coping_strategies text[] DEFAULT '{}'::text[],
  emergency_contacts jsonb DEFAULT '[]'::jsonb,
  safe_environments text[] DEFAULT '{}'::text[],
  reasons_to_live text[] DEFAULT '{}'::text[],
  professional_support jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.8 Risk Events (Crisis Trigger Log & Escalations)
CREATE TABLE IF NOT EXISTS public.risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  severity_level public.risk_severity NOT NULL,
  trigger_source public.risk_trigger NOT NULL,
  action_taken text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.9 Counsellors (Campus Psychologists and Certified Wellness Mentors)
CREATE TABLE IF NOT EXISTS public.counsellors (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  license_number text NOT NULL,
  specializations text[] DEFAULT '{}'::text[],
  bio text,
  verified boolean NOT NULL DEFAULT false,
  institution_id uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.10 Availability Slots (With Exclusion Constraint Against Overlap)
CREATE TABLE IF NOT EXISTS public.availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counsellor_id uuid NOT NULL REFERENCES public.counsellors(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  is_booked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_slot_range CHECK (end_time > start_time),
  CONSTRAINT no_overlapping_slots EXCLUDE USING gist (
    counsellor_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  )
);

-- 3.11 Appointments
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  counsellor_id uuid NOT NULL REFERENCES public.counsellors(id) ON DELETE CASCADE,
  slot_id uuid REFERENCES public.availability_slots(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  status public.appointment_status NOT NULL DEFAULT 'confirmed',
  meeting_url text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.12 Session Notes (Counsellor Clinical Notes Encrypted)
CREATE TABLE IF NOT EXISTS public.session_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  counsellor_id uuid NOT NULL REFERENCES public.counsellors(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.13 Care Shares (Explicit, Revocable Sharing of Wellness Data with Counsellors)
CREATE TABLE IF NOT EXISTS public.care_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  counsellor_id uuid NOT NULL REFERENCES public.counsellors(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  scope text[] NOT NULL DEFAULT ARRAY['assessments', 'moods'],
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT unique_student_counsellor_active UNIQUE (student_id, counsellor_id)
);

-- 3.14 Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.15 Audit Log (Append-Only Immutable Ledger)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  details jsonb DEFAULT '{}'::jsonb,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 4. Helper Security Functions
-- ==============================================================================

-- Check if a counsellor has an active, valid care share with a student for a specific scope
CREATE OR REPLACE FUNCTION public.has_active_care_share(
  p_student_id uuid,
  p_counsellor_id uuid,
  p_scope_item text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.care_shares cs
    WHERE cs.student_id = p_student_id
      AND cs.counsellor_id = p_counsellor_id
      AND cs.active = true
      AND (cs.expires_at IS NULL OR cs.expires_at > now())
      AND (p_scope_item = ANY(cs.scope) OR 'all' = ANY(cs.scope))
      AND EXISTS (
        SELECT 1 FROM public.counsellors c
        WHERE c.id = cs.counsellor_id AND c.verified = true
      )
  );
$$;

-- Check if authenticated user is a super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'super_admin'
  );
$$;

-- RLS-recursion breakers: profiles policies consult counsellors and counsellors policies
-- consult profiles. Doing those lookups through SECURITY DEFINER helpers (which read the
-- tables directly, bypassing RLS) removes the policy cycle ("infinite recursion detected
-- in policy for relation profiles").
CREATE OR REPLACE FUNCTION public.is_counsellor_role(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND role = 'counsellor');
$$;

CREATE OR REPLACE FUNCTION public.is_verified_counsellor(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.counsellors WHERE id = p_id AND verified = true);
$$;

-- Check if authenticated user is an institution_admin for a given institution
CREATE OR REPLACE FUNCTION public.is_institution_admin(p_institution_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'institution_admin'
      AND institution_id = p_institution_id
  );
$$;

-- Prevent role escalation on profile updates
-- Trusted backend callers (migrations, seed, service_role key held only by the edge function)
-- may bypass the end-user guards below. PostgREST connects as 'authenticator' for every
-- request, so an end user (including anon) can never satisfy this check.
-- PostgREST switches the ACTIVE role to anon / authenticated / service_role on every request,
-- so we test the active role (current_setting('role')): it is 'none' only on a direct database
-- connection as the login role (migrations, seed, psql), never for an API caller.
CREATE OR REPLACE FUNCTION public.is_trusted_backend()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(current_setting('role', true), 'none')
           IN ('none', 'postgres', 'supabase_admin', 'service_role');
$$;

CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role AND NOT (public.is_trusted_backend() OR public.is_super_admin()) THEN
      RAISE EXCEPTION 'Unauthorized: Users cannot modify their own role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- ==============================================================================
-- 5. Row-Level Security (RLS) on EVERY Table
-- ==============================================================================

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mood_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counsellors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 5.1 Institutions Policies
CREATE POLICY "Institutions viewable by authenticated users"
  ON public.institutions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins can manage institutions"
  ON public.institutions FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 5.2 Profiles Policies
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR (role = 'counsellor' AND public.is_verified_counsellor(profiles.id))
    OR (public.has_active_care_share(profiles.id, auth.uid(), 'profile'))
  );

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid() AND (role = 'student' OR public.is_super_admin()));

CREATE POLICY "Users can delete own profile"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (id = auth.uid());

-- 5.3 Consents Policies (Append-Only Ledger)
CREATE POLICY "Students can read own consents"
  ON public.consents FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Students can grant consents"
  ON public.consents FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Note: No UPDATE or DELETE policies for consents (strictly append-only)

-- 5.4 Mood Entries Policies
CREATE POLICY "Students own mood entries read"
  ON public.mood_entries FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.has_active_care_share(student_id, auth.uid(), 'moods')
  );

CREATE POLICY "Students own mood entries insert"
  ON public.mood_entries FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students own mood entries update"
  ON public.mood_entries FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students own mood entries delete"
  ON public.mood_entries FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());

-- 5.5 Assessments Policies
CREATE POLICY "Assessments viewable by owner or authorized counsellor"
  ON public.assessments FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.has_active_care_share(student_id, auth.uid(), 'assessments')
  );

CREATE POLICY "Students can submit own assessments"
  ON public.assessments FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can delete own assessments"
  ON public.assessments FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());

-- 5.6 Journal Entries Policies (STRICT ZERO-KNOWLEDGE: COUNSELLORS NEVER ACCESS)
CREATE POLICY "Students exclusively access own encrypted journals"
  ON public.journal_entries FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Students exclusively insert own encrypted journals"
  ON public.journal_entries FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students exclusively update own encrypted journals"
  ON public.journal_entries FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students exclusively delete own encrypted journals"
  ON public.journal_entries FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());

-- 5.7 Safety Plans Policies
CREATE POLICY "Safety plan viewable by owner or authorized counsellor"
  ON public.safety_plans FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.has_active_care_share(student_id, auth.uid(), 'safety_plan')
  );

CREATE POLICY "Students can insert own safety plan"
  ON public.safety_plans FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own safety plan"
  ON public.safety_plans FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can delete own safety plan"
  ON public.safety_plans FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());

-- 5.8 Risk Events Policies
CREATE POLICY "Risk events viewable by owner or authorized counsellor"
  ON public.risk_events FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.has_active_care_share(student_id, auth.uid(), 'risk_events')
  );

CREATE POLICY "Risk events insertable by owner or system"
  ON public.risk_events FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Counsellors or owners can update risk event resolution"
  ON public.risk_events FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.has_active_care_share(student_id, auth.uid(), 'risk_events')
  )
  WITH CHECK (
    student_id = auth.uid()
    OR public.has_active_care_share(student_id, auth.uid(), 'risk_events')
  );

-- 5.9 Counsellors Policies
CREATE POLICY "Verified counsellors viewable by all authenticated users"
  ON public.counsellors FOR SELECT
  TO authenticated
  USING (verified = true OR id = auth.uid());

CREATE POLICY "Counsellors manage own profile"
  ON public.counsellors FOR ALL
  TO authenticated
  USING (
    id = auth.uid() AND (
      public.is_counsellor_role(auth.uid())
      OR public.is_super_admin()
    )
  )
  WITH CHECK (
    id = auth.uid() AND (
      public.is_counsellor_role(auth.uid())
      OR public.is_super_admin()
    )
  );

CREATE POLICY "Admins manage counsellors"
  ON public.counsellors FOR ALL
  TO authenticated
  USING (public.is_super_admin() OR public.is_institution_admin(institution_id))
  WITH CHECK (public.is_super_admin() OR public.is_institution_admin(institution_id));

-- Prevent counsellor self-verification (verification must be performed by admin)
CREATE OR REPLACE FUNCTION public.prevent_counsellor_self_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.verified = true) OR
     (TG_OP = 'UPDATE' AND NEW.verified IS DISTINCT FROM OLD.verified AND NEW.verified = true) THEN
    IF NOT (public.is_trusted_backend() OR public.is_super_admin() OR public.is_institution_admin(NEW.institution_id)) THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can verify counsellor credentials';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_counsellor_self_verification ON public.counsellors;
CREATE TRIGGER trg_prevent_counsellor_self_verification
  BEFORE INSERT OR UPDATE ON public.counsellors
  FOR EACH ROW EXECUTE FUNCTION public.prevent_counsellor_self_verification();

-- 5.10 Availability Slots Policies
CREATE POLICY "Slots viewable by authenticated users"
  ON public.availability_slots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Counsellors manage own availability slots"
  ON public.availability_slots FOR ALL
  TO authenticated
  USING (counsellor_id = auth.uid())
  WITH CHECK (counsellor_id = auth.uid());

-- 5.11 Appointments Policies
CREATE POLICY "Appointments viewable by participants"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (student_id = auth.uid() OR counsellor_id = auth.uid());

CREATE POLICY "Students can book appointments"
  ON public.appointments FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Participants can update appointments"
  ON public.appointments FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid() OR counsellor_id = auth.uid())
  WITH CHECK (student_id = auth.uid() OR counsellor_id = auth.uid());

-- 5.12 Session Notes Policies
CREATE POLICY "Counsellors manage session notes"
  ON public.session_notes FOR ALL
  TO authenticated
  USING (counsellor_id = auth.uid())
  WITH CHECK (
    counsellor_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = session_notes.appointment_id
        AND a.counsellor_id = auth.uid()
        AND a.student_id = session_notes.student_id
    )
  );

-- 5.13 Care Shares Policies
CREATE POLICY "Care shares viewable by student or designated counsellor"
  ON public.care_shares FOR SELECT
  TO authenticated
  USING (student_id = auth.uid() OR counsellor_id = auth.uid());

CREATE POLICY "Students can grant care shares"
  ON public.care_shares FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can revoke care shares"
  ON public.care_shares FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can delete care shares"
  ON public.care_shares FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());

-- 5.14 Notifications Policies
CREATE POLICY "Users manage own notifications"
  ON public.notifications FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 5.15 Audit Log Policies (Append-Only Ledger)
CREATE POLICY "Users can view audit entries for themselves"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (actor_id = auth.uid() OR resource_id = auth.uid()::text);

CREATE POLICY "Users and system can record audit events"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);

-- Note: No UPDATE or DELETE policies for audit_log (strictly append-only)
