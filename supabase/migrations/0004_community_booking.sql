-- ==============================================================================
-- Migration: 0004_community_booking.sql
-- Project: MindSahaay (Digital Mental Health Platform for Indian HEIs)
-- Description: Peer Circles, Posts, Comments, Moderation Reports, Zero-Knowledge
--              CBT Thought Records, Chat Sessions & Messages with Retention TTL,
--              Atomic Slot Booking, and Automated pg_cron Message Purge
-- Compliance: India DPDP Act 2023, Mental Healthcare Act 2017, Zero-Knowledge Privacy
-- ==============================================================================

-- ==============================================================================
-- 1. Moderation Status Enum
-- ==============================================================================
DO $$ BEGIN
  CREATE TYPE public.moderation_status AS ENUM (
    'pending',
    'approved',
    'flagged',
    'rejected',
    'actioned',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ==============================================================================
-- 2. Security Helper Functions
-- ==============================================================================

-- Check if authenticated user is a moderator or super_admin
CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('moderator', 'super_admin')
  );
$$;

-- ==============================================================================
-- 3. Community Support Circles & Membership
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.circles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  institution_id uuid REFERENCES public.institutions(id) ON DELETE CASCADE, -- NULL = Inter-college
  is_private boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.circle_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_circle_member UNIQUE (circle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_circles_institution ON public.circles (institution_id);
CREATE INDEX IF NOT EXISTS idx_circle_members_user ON public.circle_members (user_id);

-- ==============================================================================
-- 4. Community Posts & Comments (Moderated, Safe Peer Interaction)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  is_anonymous boolean NOT NULL DEFAULT true,
  moderation_status public.moderation_status NOT NULL DEFAULT 'approved',
  ai_moderation jsonb DEFAULT '{}'::jsonb,
  likes_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_circle_created ON public.posts (circle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author ON public.posts (author_id);
CREATE INDEX IF NOT EXISTS idx_posts_moderation ON public.posts (moderation_status);

CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_anonymous boolean NOT NULL DEFAULT true,
  moderation_status public.moderation_status NOT NULL DEFAULT 'approved',
  ai_moderation jsonb DEFAULT '{}'::jsonb,
  parent_comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_post_created ON public.comments (post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_comments_author ON public.comments (author_id);

-- ==============================================================================
-- 5. Moderation Reports Table
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('post', 'comment', 'chat_message', 'profile')),
  resource_id text NOT NULL,
  reason text NOT NULL,
  details text,
  moderation_status public.moderation_status NOT NULL DEFAULT 'pending',
  ai_moderation jsonb DEFAULT '{}'::jsonb,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  action_taken text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports (moderation_status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports (reporter_id);

-- ==============================================================================
-- 6. CBT Thought Records (Zero-Knowledge Client-Side Encrypted)
-- ==============================================================================
-- Stores situation, automatic thoughts, cognitive distortions, and rational response
-- encrypted in the client browser with student-derived key. Server sees ONLY ciphertext.

CREATE TABLE IF NOT EXISTS public.thought_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  salt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thought_records_student ON public.thought_records (student_id);

-- ==============================================================================
-- 7. Chat Sessions & Messages (Encrypted, Retention TTL & Risk Levels)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Well-being Chat',
  risk_level public.risk_severity NOT NULL DEFAULT 'low',
  retention_ttl_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON public.chat_sessions (user_id);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('user', 'assistant', 'counsellor', 'system')),
  encrypted_content text NOT NULL,
  iv text,
  risk_level public.risk_severity NOT NULL DEFAULT 'low',
  retention_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON public.chat_messages (session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_retention ON public.chat_messages (retention_expires_at);

-- ==============================================================================
-- 8. Row Level Security (RLS) Policies
-- ==============================================================================

ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thought_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS-recursion breakers: circles policies read circle_members and circle_members policies
-- read circles. SECURITY DEFINER helpers read the tables directly (bypassing RLS) so the
-- policies no longer re-trigger each other.
CREATE OR REPLACE FUNCTION public.is_circle_member(p_circle_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.circle_members cm
    WHERE cm.circle_id = p_circle_id AND cm.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_public_circle(p_circle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.circles c WHERE c.id = p_circle_id AND c.is_private = false);
$$;

CREATE OR REPLACE FUNCTION public.is_joinable_circle(p_circle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.circles c
    WHERE c.id = p_circle_id AND (c.is_private = false OR public.is_moderator())
  );
$$;

-- 8.1 Circles Policies
CREATE POLICY "Circles viewable by authenticated users"
  ON public.circles FOR SELECT
  TO authenticated
  USING (
    is_private = false
    OR created_by = auth.uid()
    OR public.is_circle_member(circles.id, auth.uid())
  );

CREATE POLICY "Moderators and admins can manage circles"
  ON public.circles FOR ALL
  TO authenticated
  USING (public.is_moderator())
  WITH CHECK (public.is_moderator());

-- 8.2 Circle Members Policies
CREATE POLICY "Users can view circle memberships"
  ON public.circle_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_public_circle(circle_members.circle_id)
    OR public.is_moderator()
  );

CREATE POLICY "Users can join circles"
  ON public.circle_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (role = 'member' OR public.is_moderator())
    AND public.is_joinable_circle(circle_members.circle_id)
  );

CREATE POLICY "Moderators can update circle members"
  ON public.circle_members FOR UPDATE
  TO authenticated
  USING (public.is_moderator())
  WITH CHECK (public.is_moderator());

CREATE POLICY "Users can leave circles"
  ON public.circle_members FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_moderator());

-- Trigger: Prevent non-moderators from altering moderation status
CREATE OR REPLACE FUNCTION public.protect_post_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status THEN
    IF NOT public.is_moderator() THEN
      RAISE EXCEPTION 'Unauthorized: Only moderators can update moderation status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_post_moderation ON public.posts;
CREATE TRIGGER trg_protect_post_moderation
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.protect_post_moderation();

DROP TRIGGER IF EXISTS trg_protect_comment_moderation ON public.comments;
CREATE TRIGGER trg_protect_comment_moderation
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.protect_post_moderation();

-- 8.3 Posts Policies
CREATE POLICY "Approved posts viewable by authenticated users"
  ON public.posts FOR SELECT
  TO authenticated
  USING (
    moderation_status = 'approved'
    OR author_id = auth.uid()
    OR public.is_moderator()
  );

CREATE POLICY "Students can create circle posts"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors or moderators can update posts"
  ON public.posts FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid() OR public.is_moderator())
  WITH CHECK (author_id = auth.uid() OR public.is_moderator());

CREATE POLICY "Authors or moderators can delete posts"
  ON public.posts FOR DELETE
  TO authenticated
  USING (author_id = auth.uid() OR public.is_moderator());

-- 8.4 Comments Policies
CREATE POLICY "Approved comments viewable by authenticated users"
  ON public.comments FOR SELECT
  TO authenticated
  USING (
    moderation_status = 'approved'
    OR author_id = auth.uid()
    OR public.is_moderator()
  );

CREATE POLICY "Students can create comments"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors or moderators can update comments"
  ON public.comments FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid() OR public.is_moderator())
  WITH CHECK (author_id = auth.uid() OR public.is_moderator());

CREATE POLICY "Authors or moderators can delete comments"
  ON public.comments FOR DELETE
  TO authenticated
  USING (author_id = auth.uid() OR public.is_moderator());

-- 8.5 Reports Policies
CREATE POLICY "Users view own reports, moderators view all"
  ON public.reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid() OR public.is_moderator());

CREATE POLICY "Users can submit reports"
  ON public.reports FOR INSERT
  TO authenticated
  WITH CHECK (
    reporter_id = auth.uid()
    AND (moderation_status = 'pending' OR public.is_moderator())
  );

CREATE POLICY "Moderators can update reports"
  ON public.reports FOR UPDATE
  TO authenticated
  USING (public.is_moderator())
  WITH CHECK (public.is_moderator());

-- 8.6 Thought Records Policies (STRICT ZERO-KNOWLEDGE: STUDENT ONLY)
-- Counsellors, moderators, and institution admins have ZERO access.
CREATE POLICY "Students exclusively access own thought records"
  ON public.thought_records FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Students exclusively insert own thought records"
  ON public.thought_records FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students exclusively update own thought records"
  ON public.thought_records FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students exclusively delete own thought records"
  ON public.thought_records FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());

-- 8.7 Chat Sessions Policies (Strict Owner Isolation)
CREATE POLICY "Users exclusively view own chat sessions"
  ON public.chat_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users exclusively insert own chat sessions"
  ON public.chat_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users exclusively update own chat sessions"
  ON public.chat_sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users exclusively delete own chat sessions"
  ON public.chat_sessions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 8.8 Chat Messages Policies (Strict Session Owner Isolation)
CREATE POLICY "Users exclusively view messages from own sessions"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_messages.session_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users exclusively insert messages into own sessions"
  ON public.chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_messages.session_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users exclusively delete messages from own sessions"
  ON public.chat_messages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_messages.session_id AND s.user_id = auth.uid()
    )
  );

-- ==============================================================================
-- 9. Atomic Slot Booking Function (Eliminates Race Conditions)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.book_appointment_atomic(
  p_student_id uuid,
  p_counsellor_id uuid,
  p_slot_id uuid,
  p_notes text DEFAULT NULL,
  p_meeting_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_slot public.availability_slots%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_meeting_url text;
  v_scheduled_at timestamptz;
BEGIN
  -- Strict identity validation: caller must match p_student_id or be super_admin
  IF auth.uid() IS NULL OR (auth.uid() <> p_student_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Unauthorized: Student identity mismatch or missing authentication';
  END IF;

  -- If slot_id is provided, lock the slot row FOR UPDATE to prevent race conditions
  IF p_slot_id IS NOT NULL THEN
    SELECT * INTO v_slot
    FROM public.availability_slots
    WHERE id = p_slot_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Availability slot not found';
    END IF;

    IF v_slot.is_booked THEN
      RAISE EXCEPTION 'Slot is already booked';
    END IF;

    IF v_slot.counsellor_id <> p_counsellor_id THEN
      RAISE EXCEPTION 'Slot does not belong to the specified counsellor';
    END IF;

    -- Atomically claim slot
    UPDATE public.availability_slots
    SET is_booked = true
    WHERE id = p_slot_id;

    v_scheduled_at := v_slot.start_time;
  ELSE
    v_scheduled_at := now() + interval '1 day';
  END IF;

  -- Generate private meeting URL if none provided (built-in gen_random_uuid eliminates extension dependency)
  v_meeting_url := COALESCE(
    p_meeting_url,
    'https://meet.mindsahaay.org/consultation/' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
  );

  -- Insert appointment record atomically
  INSERT INTO public.appointments (
    student_id,
    counsellor_id,
    slot_id,
    scheduled_at,
    status,
    meeting_url,
    notes,
    created_at
  ) VALUES (
    p_student_id,
    p_counsellor_id,
    p_slot_id,
    v_scheduled_at,
    'confirmed'::public.appointment_status,
    v_meeting_url,
    p_notes,
    now()
  )
  RETURNING * INTO v_appointment;

  -- Create notification for the counsellor
  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    type,
    metadata
  ) VALUES (
    p_counsellor_id,
    'New Consultation Scheduled',
    'A student has scheduled a wellness consultation.',
    'appointment_booked',
    jsonb_build_object(
      'appointment_id', v_appointment.id,
      'slot_id', p_slot_id,
      'scheduled_at', v_scheduled_at
    )
  );

  -- Log audit record
  PERFORM public.log_audit_event(
    p_student_id,
    'APPOINTMENT_BOOKED_ATOMIC',
    'appointments',
    v_appointment.id::text,
    jsonb_build_object(
      'counsellor_id', p_counsellor_id,
      'slot_id', p_slot_id,
      'scheduled_at', v_scheduled_at
    )
  );

  RETURN to_jsonb(v_appointment);
END;
$$;

REVOKE ALL ON FUNCTION public.book_appointment_atomic(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(uuid, uuid, uuid, text, text) TO authenticated, service_role;

-- ==============================================================================
-- 10. Chat Message Retention Purge (pg_cron & Manual Purge Function)
-- ==============================================================================
-- In compliance with DPDP Act 2023 storage limitation and right to erasure,
-- companion chat messages older than retention TTL (default 30 days) are automatically purged.

CREATE OR REPLACE FUNCTION public.purge_expired_chat_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.chat_messages
  WHERE retention_expires_at < now()
     OR created_at < (now() - interval '30 days');

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_chat_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_chat_messages() TO service_role, authenticated;

-- Attempt to register pg_cron job if pg_cron extension is available (dynamic execution prevents compile failure)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_cron";
  -- Run message purge daily at 03:00 AM UTC via dynamic SQL
  EXECUTE 'SELECT cron.schedule(''purge_expired_chat_messages_daily'', ''0 3 * * *'', ''SELECT public.purge_expired_chat_messages();'')';
EXCEPTION WHEN OTHERS THEN
  -- Gracefully ignore if pg_cron extension cannot be activated in local/test environment
  RAISE NOTICE 'pg_cron job schedule skipped: %', SQLERRM;
END $$;
