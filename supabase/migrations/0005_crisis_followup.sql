-- ==============================================================================
-- MindSahaay Migration: 0005_crisis_followup.sql
-- Description: Crisis Follow-Through Loop (Database Layer)
-- Feature X: Risk follow-up steps, check-back prompts, check-back responses,
--            backup counsellors, RPCs for step advancement and overdue escalation,
--            audit logging, and security invoker risk queue view.
-- Compliance: India DPDP Act 2023, UGC Well-being Guidelines, Mental Healthcare Act 2017
-- ==============================================================================

-- 1. Enum for Risk Followup Steps
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'followup_step') THEN
    CREATE TYPE public.followup_step AS ENUM (
      'open',
      'acknowledged',
      'contacted',
      'handed_off',
      'closed'
    );
  END IF;
END $$;

-- 2. Table: public.institution_backup_counsellors
CREATE TABLE IF NOT EXISTS public.institution_backup_counsellors (
  institution_id uuid PRIMARY KEY REFERENCES public.institutions(id) ON DELETE CASCADE,
  counsellor_id uuid NOT NULL REFERENCES public.counsellors(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_institution_backup_counsellors_counsellor
  ON public.institution_backup_counsellors (counsellor_id);

-- 3. Table: public.risk_followups (Append-Only)
CREATE TABLE IF NOT EXISTS public.risk_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  risk_event_id uuid NOT NULL REFERENCES public.risk_events(id) ON DELETE CASCADE,
  step public.followup_step NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  closure_reason text NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_risk_followup_note_len CHECK (note IS NULL OR length(note) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_risk_followups_event_seq
  ON public.risk_followups (risk_event_id, seq DESC);

CREATE INDEX IF NOT EXISTS idx_risk_followups_event_created
  ON public.risk_followups (risk_event_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_risk_followups_actor
  ON public.risk_followups (actor_id);

-- 4. Table: public.risk_checkback_prompts (Read-only for student, trigger-created on acknowledged)
CREATE TABLE IF NOT EXISTS public.risk_checkback_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_event_id uuid NOT NULL REFERENCES public.risk_events(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('h24', 'h72')),
  due_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_risk_event_prompt_kind UNIQUE (risk_event_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_risk_checkback_prompts_student
  ON public.risk_checkback_prompts (student_id);

CREATE INDEX IF NOT EXISTS idx_risk_checkback_prompts_event
  ON public.risk_checkback_prompts (risk_event_id);

-- 5. Table: public.risk_checkbacks (Student responses; append-only)
CREATE TABLE IF NOT EXISTS public.risk_checkbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_event_id uuid NOT NULL REFERENCES public.risk_events(id) ON DELETE CASCADE,
  prompt_id uuid NOT NULL UNIQUE REFERENCES public.risk_checkback_prompts(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  answer text NOT NULL CHECK (answer IN ('okay', 'want_to_talk')),
  answered_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_checkbacks_student
  ON public.risk_checkbacks (student_id);

CREATE INDEX IF NOT EXISTS idx_risk_checkbacks_event
  ON public.risk_checkbacks (risk_event_id);

-- 6. Server Timestamp Enforcement on public.risk_events
CREATE OR REPLACE FUNCTION public.enforce_risk_event_server_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_trusted_backend() THEN
      NEW.created_at := now();
    ELSE
      IF NEW.created_at IS NULL THEN
        NEW.created_at := now();
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT public.is_trusted_backend() THEN
      NEW.created_at := OLD.created_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_risk_event_server_timestamp ON public.risk_events;
CREATE TRIGGER trg_enforce_risk_event_server_timestamp
  BEFORE INSERT OR UPDATE ON public.risk_events
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_risk_event_server_timestamp();

-- 7. Automatic Initial 'open' Followup on High/Crisis Risk Events
CREATE OR REPLACE FUNCTION public.handle_new_risk_event_followup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.severity_level IN ('high', 'crisis') THEN
    INSERT INTO public.risk_followups (
      risk_event_id,
      step,
      actor_id,
      created_at
    ) VALUES (
      NEW.id,
      'open',
      NEW.student_id,
      NEW.created_at
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_initial_risk_followup ON public.risk_events;
CREATE TRIGGER trg_create_initial_risk_followup
  AFTER INSERT ON public.risk_events
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_risk_event_followup();

-- 8. Append-Only Enforcements
CREATE OR REPLACE FUNCTION public.enforce_risk_followups_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    -- Allow cascade delete when parent risk_event or profile is deleted under DPDP erasure
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'risk_followups is strictly append-only: updates and direct deletes are prohibited';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_risk_followups_tampering ON public.risk_followups;
CREATE TRIGGER trg_prevent_risk_followups_tampering
  BEFORE UPDATE OR DELETE ON public.risk_followups
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_risk_followups_append_only();

CREATE OR REPLACE FUNCTION public.enforce_risk_checkbacks_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    -- Allow cascade delete when parent prompt/event/profile is deleted
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'risk_checkbacks is strictly append-only: updates and direct deletes are prohibited';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_risk_checkbacks_tampering ON public.risk_checkbacks;
CREATE TRIGGER trg_prevent_risk_checkbacks_tampering
  BEFORE UPDATE OR DELETE ON public.risk_checkbacks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_risk_checkbacks_append_only();

-- 9. BEFORE INSERT Transition Validation on public.risk_followups
CREATE OR REPLACE FUNCTION public.validate_risk_followup_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_step public.followup_step;
  v_allowed_closure_reasons text[] := ARRAY[
    'student_reached_safe',
    'referred_to_counsellor_session',
    'referred_to_emergency_services',
    'unable_to_reach_documented',
    'false_alarm'
  ];
BEGIN
  -- 1. Find latest step using seq order
  SELECT step INTO v_current_step
  FROM public.risk_followups
  WHERE risk_event_id = NEW.risk_event_id
  ORDER BY seq DESC
  LIMIT 1;

  -- 2. If no prior step, initial must be 'open'
  IF v_current_step IS NULL THEN
    IF NEW.step <> 'open' THEN
      RAISE EXCEPTION 'Initial followup step must be open';
    END IF;
  ELSE
    -- 3. If prior step exists, cannot advance if already closed
    IF v_current_step = 'closed' THEN
      RAISE EXCEPTION 'Cannot advance closed risk event';
    END IF;

    -- 4. Check step transition
    IF NEW.step = 'open' THEN
      -- Allowed only if reopened via check-back trigger
      IF current_setting('app.checkback_reopen', true) IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Transition to open is only permitted via student check-back response';
      END IF;
    ELSIF v_current_step = 'open' AND NEW.step = 'acknowledged' THEN
      -- Valid transition
    ELSIF v_current_step = 'acknowledged' AND NEW.step = 'contacted' THEN
      -- Valid transition
    ELSIF v_current_step = 'contacted' AND NEW.step = 'handed_off' THEN
      -- Valid transition
    ELSIF v_current_step = 'handed_off' AND NEW.step = 'closed' THEN
      -- Valid transition
    ELSE
      RAISE EXCEPTION 'Invalid risk followup transition from % to %', v_current_step, NEW.step;
    END IF;
  END IF;

  -- 5. Validate closure reason
  IF NEW.step = 'closed' THEN
    IF NEW.closure_reason IS NULL OR NOT (NEW.closure_reason = ANY(v_allowed_closure_reasons)) THEN
      RAISE EXCEPTION 'Invalid closure reason: %. Must be one of: student_reached_safe, referred_to_counsellor_session, referred_to_emergency_services, unable_to_reach_documented, false_alarm', NEW.closure_reason;
    END IF;
  ELSE
    IF NEW.closure_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Closure reason must be NULL for non-closed step';
    END IF;
  END IF;

  -- 6. Validate note length
  IF NEW.note IS NOT NULL AND length(NEW.note) > 500 THEN
    RAISE EXCEPTION 'Note must not exceed 500 characters';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_risk_followup_transition ON public.risk_followups;
CREATE TRIGGER trg_validate_risk_followup_transition
  BEFORE INSERT ON public.risk_followups
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_risk_followup_transition();

-- 10. AFTER INSERT on public.risk_followups (Resolution & Prompts Creation)
CREATE OR REPLACE FUNCTION public.handle_risk_followup_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  -- If closed: set risk_events.resolved = true, resolved_at = now()
  IF NEW.step = 'closed' THEN
    UPDATE public.risk_events
    SET resolved = true,
        resolved_at = coalesce(resolved_at, now())
    WHERE id = NEW.risk_event_id;
  END IF;

  -- If acknowledged: trigger-created checkback prompts h24 and h72
  IF NEW.step = 'acknowledged' THEN
    SELECT student_id INTO v_student_id
    FROM public.risk_events
    WHERE id = NEW.risk_event_id;

    IF v_student_id IS NOT NULL THEN
      INSERT INTO public.risk_checkback_prompts (
        risk_event_id,
        student_id,
        kind,
        due_at,
        created_at
      ) VALUES
        (NEW.risk_event_id, v_student_id, 'h24', NEW.created_at + interval '24 hours', NEW.created_at),
        (NEW.risk_event_id, v_student_id, 'h72', NEW.created_at + interval '72 hours', NEW.created_at)
      ON CONFLICT (risk_event_id, kind) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_risk_followup_after_insert ON public.risk_followups;
CREATE TRIGGER trg_handle_risk_followup_after_insert
  AFTER INSERT ON public.risk_followups
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_risk_followup_after_insert();

-- 11. BEFORE INSERT Validation on public.risk_checkbacks
CREATE OR REPLACE FUNCTION public.validate_risk_checkback_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prompt public.risk_checkback_prompts%ROWTYPE;
  v_event public.risk_events%ROWTYPE;
BEGIN
  -- Verify prompt exists
  SELECT * INTO v_prompt
  FROM public.risk_checkback_prompts
  WHERE id = NEW.prompt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced checkback prompt does not exist';
  END IF;

  IF v_prompt.student_id <> NEW.student_id THEN
    RAISE EXCEPTION 'Checkback prompt does not belong to the inserting student';
  END IF;

  IF v_prompt.risk_event_id <> NEW.risk_event_id THEN
    RAISE EXCEPTION 'Checkback prompt does not belong to the referenced risk event';
  END IF;

  -- Verify risk event belongs to student
  SELECT * INTO v_event
  FROM public.risk_events
  WHERE id = NEW.risk_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced risk event does not exist';
  END IF;

  IF v_event.student_id <> NEW.student_id THEN
    RAISE EXCEPTION 'Risk event does not belong to the inserting student';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_risk_checkback_insert ON public.risk_checkbacks;
CREATE TRIGGER trg_validate_risk_checkback_insert
  BEFORE INSERT ON public.risk_checkbacks
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_risk_checkback_insert();

-- 12. AFTER INSERT on public.risk_checkbacks (Reopen & Notification)
CREATE OR REPLACE FUNCTION public.handle_risk_checkback_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_step public.followup_step;
BEGIN
  IF NEW.answer = 'want_to_talk' THEN
    -- Check current step
    SELECT step INTO v_current_step
    FROM public.risk_followups
    WHERE risk_event_id = NEW.risk_event_id
    ORDER BY seq DESC
    LIMIT 1;

    -- An answer can never close or downgrade an event; if not closed, reopen to 'open'
    IF v_current_step IS DISTINCT FROM 'closed' THEN
      PERFORM set_config('app.checkback_reopen', 'true', true);

      INSERT INTO public.risk_followups (
        risk_event_id,
        step,
        actor_id,
        note,
        created_at
      ) VALUES (
        NEW.risk_event_id,
        'open',
        NEW.student_id,
        'Student responded want_to_talk via check-back prompt',
        NEW.answered_at
      );

      PERFORM set_config('app.checkback_reopen', 'false', true);
    END IF;

    -- Notification to counsellors holding care share with scope 'risk_events'
    INSERT INTO public.notifications (
      user_id,
      title,
      body,
      type,
      metadata,
      created_at
    )
    SELECT
      cs.counsellor_id,
      'Check-back response received',
      'A student has requested follow-up support.',
      'checkback_want_to_talk',
      jsonb_build_object('risk_event_id', NEW.risk_event_id),
      NEW.answered_at
    FROM public.care_shares cs
    JOIN public.counsellors c ON c.id = cs.counsellor_id
    WHERE cs.student_id = NEW.student_id
      AND cs.active = true
      AND (cs.expires_at IS NULL OR cs.expires_at > now())
      AND ('risk_events' = ANY(cs.scope) OR 'all' = ANY(cs.scope))
      AND c.verified = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_risk_checkback_after_insert ON public.risk_checkbacks;
CREATE TRIGGER trg_handle_risk_checkback_after_insert
  AFTER INSERT ON public.risk_checkbacks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_risk_checkback_after_insert();

-- 13. Security Definer Helper for Student Alias
CREATE OR REPLACE FUNCTION public.get_student_alias_for_care(p_student_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT alias FROM public.profiles WHERE id = p_student_id;
$$;

-- 14. Row Level Security Policies

-- 14.1 Update policy on public.risk_events (Drop student branch, counsellors/admins only)
DROP POLICY IF EXISTS "Counsellors or owners can update risk event resolution" ON public.risk_events;
DROP POLICY IF EXISTS "Counsellors or admins can update risk event resolution" ON public.risk_events;

CREATE POLICY "Counsellors or admins can update risk event resolution"
  ON public.risk_events FOR UPDATE
  TO authenticated
  USING (
    public.has_active_care_share(student_id, auth.uid(), 'risk_events')
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.has_active_care_share(student_id, auth.uid(), 'risk_events')
    OR public.is_super_admin()
  );

-- 14.2 Profiles SELECT policy update (allow counsellors with risk_events care share)
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR (role = 'counsellor' AND public.is_verified_counsellor(profiles.id))
    OR public.has_active_care_share(profiles.id, auth.uid(), 'profile')
    OR public.has_active_care_share(profiles.id, auth.uid(), 'risk_events')
    OR public.is_super_admin()
  );

-- 14.3 public.risk_followups RLS
ALTER TABLE public.risk_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "risk_followups_select" ON public.risk_followups;
CREATE POLICY "risk_followups_select"
  ON public.risk_followups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.risk_events re
      WHERE re.id = risk_event_id
        AND (
          re.student_id = auth.uid()
          OR public.has_active_care_share(re.student_id, auth.uid(), 'risk_events')
          OR public.is_super_admin()
        )
    )
  );

DROP POLICY IF EXISTS "risk_followups_insert" ON public.risk_followups;
CREATE POLICY "risk_followups_insert"
  ON public.risk_followups FOR INSERT
  TO authenticated
  WITH CHECK (public.is_trusted_backend());

-- 14.4 public.risk_checkback_prompts RLS
ALTER TABLE public.risk_checkback_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "risk_checkback_prompts_select" ON public.risk_checkback_prompts;
CREATE POLICY "risk_checkback_prompts_select"
  ON public.risk_checkback_prompts FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.has_active_care_share(student_id, auth.uid(), 'risk_events')
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "risk_checkback_prompts_insert" ON public.risk_checkback_prompts;
CREATE POLICY "risk_checkback_prompts_insert"
  ON public.risk_checkback_prompts FOR INSERT
  TO authenticated
  WITH CHECK (public.is_trusted_backend());

-- 14.5 public.risk_checkbacks RLS
ALTER TABLE public.risk_checkbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "risk_checkbacks_select" ON public.risk_checkbacks;
CREATE POLICY "risk_checkbacks_select"
  ON public.risk_checkbacks FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.has_active_care_share(student_id, auth.uid(), 'risk_events')
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "risk_checkbacks_insert" ON public.risk_checkbacks;
CREATE POLICY "risk_checkbacks_insert"
  ON public.risk_checkbacks FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.risk_checkback_prompts p
      WHERE p.id = prompt_id
        AND p.student_id = auth.uid()
        AND p.risk_event_id = risk_checkbacks.risk_event_id
    )
  );

-- 14.6 public.institution_backup_counsellors RLS
ALTER TABLE public.institution_backup_counsellors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "institution_backup_counsellors_select" ON public.institution_backup_counsellors;
CREATE POLICY "institution_backup_counsellors_select"
  ON public.institution_backup_counsellors FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "institution_backup_counsellors_admin" ON public.institution_backup_counsellors;
CREATE POLICY "institution_backup_counsellors_admin"
  ON public.institution_backup_counsellors FOR ALL
  TO authenticated
  USING (public.is_super_admin() OR public.is_institution_admin(institution_id))
  WITH CHECK (public.is_super_admin() OR public.is_institution_admin(institution_id));

-- 15. RPC: public.advance_risk_followup
CREATE OR REPLACE FUNCTION public.advance_risk_followup(
  p_event_id uuid,
  p_step public.followup_step,
  p_closure_reason text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.risk_followups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.risk_events%ROWTYPE;
  v_new_row public.risk_followups%ROWTYPE;
  v_caller uuid := auth.uid();
BEGIN
  -- 1. Fetch risk event
  SELECT * INTO v_event
  FROM public.risk_events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Risk event not found';
  END IF;

  -- 2. Authorize caller: verified counsellor with care share scope containing 'risk_events', or super admin
  IF NOT (
    public.is_super_admin()
    OR (
      v_caller IS NOT NULL
      AND public.is_verified_counsellor(v_caller)
      AND public.has_active_care_share(v_event.student_id, v_caller, 'risk_events')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an authorized counsellor or admin for this student';
  END IF;

  -- 3. advance cannot be 'open'
  IF p_step = 'open' THEN
    RAISE EXCEPTION 'Cannot advance followup step to open directly';
  END IF;

  -- 4. Insert step (transition trigger validates sequence and closure reason)
  INSERT INTO public.risk_followups (
    risk_event_id,
    step,
    actor_id,
    closure_reason,
    note
  ) VALUES (
    p_event_id,
    p_step,
    v_caller,
    p_closure_reason,
    p_note
  )
  RETURNING * INTO v_new_row;

  -- 5. Audit log
  PERFORM public.log_audit_event(
    v_caller,
    'advance_risk_followup',
    'risk_events',
    p_event_id::text,
    jsonb_build_object(
      'step', p_step,
      'closure_reason', p_closure_reason,
      'followup_id', v_new_row.id
    )
  );

  RETURN v_new_row;
END;
$$;

-- 16. RPC: public.escalate_overdue_risk
CREATE OR REPLACE FUNCTION public.escalate_overdue_risk()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Threshold constants
  c_crisis_threshold CONSTANT interval := interval '4 hours';
  c_high_threshold CONSTANT interval := interval '12 hours';
  c_level2_delay CONSTANT interval := interval '2 hours';

  v_notifications_count integer := 0;
  v_rec RECORD;
  v_counsellor RECORD;
  v_backup_counsellor_id uuid;
  v_age interval;
  v_l1_threshold interval;
  v_l2_threshold interval;
  v_notified_l1 boolean;
  v_notified_l2 boolean;
BEGIN
  -- Loop over all unresolved risk events whose latest followup step is 'open'
  FOR v_rec IN
    WITH latest_followup AS (
      SELECT DISTINCT ON (risk_event_id)
        risk_event_id,
        step,
        created_at AS step_at
      FROM public.risk_followups
      ORDER BY risk_event_id, seq DESC
    )
    SELECT
      re.id AS risk_event_id,
      re.student_id,
      re.severity_level,
      p.institution_id,
      lf.step_at
    FROM public.risk_events re
    JOIN latest_followup lf ON lf.risk_event_id = re.id
    JOIN public.profiles p ON p.id = re.student_id
    WHERE re.resolved = false
      AND lf.step = 'open'
      AND re.severity_level IN ('high', 'crisis')
  LOOP
    v_age := now() - v_rec.step_at;

    IF v_rec.severity_level = 'crisis' THEN
      v_l1_threshold := c_crisis_threshold;
    ELSE
      v_l1_threshold := c_high_threshold;
    END IF;
    v_l2_threshold := v_l1_threshold + c_level2_delay;

    v_notified_l1 := false;
    v_notified_l2 := false;

    -- Level 1 Escalation: age >= v_l1_threshold
    IF v_age >= v_l1_threshold THEN
      FOR v_counsellor IN
        SELECT DISTINCT cs.counsellor_id
        FROM public.care_shares cs
        JOIN public.counsellors c ON c.id = cs.counsellor_id
        WHERE cs.student_id = v_rec.student_id
          AND cs.active = true
          AND (cs.expires_at IS NULL OR cs.expires_at > now())
          AND ('risk_events' = ANY(cs.scope) OR 'all' = ANY(cs.scope))
          AND c.verified = true
      LOOP
        -- Check idempotency: notification for this counsellor, event, and level 1
        IF NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = v_counsellor.counsellor_id
            AND n.type = 'risk_overdue'
            AND (n.metadata->>'risk_event_id')::uuid = v_rec.risk_event_id
            AND (n.metadata->>'level')::int = 1
        ) THEN
          INSERT INTO public.notifications (
            user_id,
            title,
            body,
            type,
            metadata
          ) VALUES (
            v_counsellor.counsellor_id,
            'Overdue Risk Event',
            'A student risk event requires urgent follow-up.',
            'risk_overdue',
            jsonb_build_object(
              'risk_event_id', v_rec.risk_event_id,
              'severity_level', v_rec.severity_level,
              'level', 1
            )
          );
          v_notifications_count := v_notifications_count + 1;
          v_notified_l1 := true;
        END IF;
      END LOOP;

      IF v_notified_l1 THEN
        PERFORM public.log_audit_event(
          auth.uid(),
          'escalate_overdue_risk',
          'risk_events',
          v_rec.risk_event_id::text,
          jsonb_build_object(
            'level', 1,
            'severity_level', v_rec.severity_level
          )
        );
      END IF;
    END IF;

    -- Level 2 Escalation: age >= v_l2_threshold
    IF v_age >= v_l2_threshold THEN
      -- Find institution backup counsellor
      v_backup_counsellor_id := NULL;
      IF v_rec.institution_id IS NOT NULL THEN
        SELECT counsellor_id INTO v_backup_counsellor_id
        FROM public.institution_backup_counsellors
        WHERE institution_id = v_rec.institution_id;
      END IF;

      IF v_backup_counsellor_id IS NOT NULL THEN
        -- Check idempotency: notification for backup counsellor, event, and level 2
        IF NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = v_backup_counsellor_id
            AND n.type = 'risk_overdue'
            AND (n.metadata->>'risk_event_id')::uuid = v_rec.risk_event_id
            AND (n.metadata->>'level')::int = 2
        ) THEN
          INSERT INTO public.notifications (
            user_id,
            title,
            body,
            type,
            metadata
          ) VALUES (
            v_backup_counsellor_id,
            'Overdue Risk Event - Backup Escalation',
            'A student risk event has exceeded the primary follow-up threshold.',
            'risk_overdue',
            jsonb_build_object(
              'risk_event_id', v_rec.risk_event_id,
              'severity_level', v_rec.severity_level,
              'level', 2
            )
          );
          v_notifications_count := v_notifications_count + 1;
          v_notified_l2 := true;
        END IF;

        IF v_notified_l2 THEN
          PERFORM public.log_audit_event(
            auth.uid(),
            'escalate_overdue_risk',
            'risk_events',
            v_rec.risk_event_id::text,
            jsonb_build_object(
              'level', 2,
              'severity_level', v_rec.severity_level,
              'backup_counsellor_id', v_backup_counsellor_id
            )
          );
        END IF;
      END IF;
    END IF;

  END LOOP;

  RETURN v_notifications_count;
END;
$$;

-- 17. View: public.risk_queue (security_invoker = true)
CREATE OR REPLACE VIEW public.risk_queue
WITH (security_invoker = true)
AS
SELECT
  re.id,
  re.student_id,
  COALESCE(p.alias, public.get_student_alias_for_care(re.student_id)) AS alias,
  re.severity_level,
  re.event_type,
  re.trigger_source,
  -- Data minimisation: counsellors only ever need to know that the event was detected offline and
  -- when. Expose ONLY those two keys so that, even if a payload someday held more, a direct API
  -- caller reading this view cannot see it.
  jsonb_strip_nulls(jsonb_build_object(
    'offline', re.payload -> 'offline',
    'detected_at', re.payload -> 'detected_at'
  )) AS payload,
  re.created_at,
  re.resolved,
  rf.step AS current_step,
  rf.created_at AS current_step_at,
  CASE
    WHEN re.resolved = false
     AND rf.step = 'open'
     AND (
       (re.severity_level = 'crisis' AND rf.created_at <= now() - interval '4 hours')
       OR
       (re.severity_level = 'high' AND rf.created_at <= now() - interval '12 hours')
     )
    THEN true
    ELSE false
  END AS is_overdue,
  CASE
    WHEN re.severity_level = 'crisis' THEN 4
    WHEN re.severity_level = 'high' THEN 12
    ELSE NULL
  END AS overdue_threshold_hours
FROM public.risk_events re
LEFT JOIN public.profiles p ON p.id = re.student_id
LEFT JOIN LATERAL (
  SELECT rf_inner.step, rf_inner.created_at
  FROM public.risk_followups rf_inner
  WHERE rf_inner.risk_event_id = re.id
  ORDER BY rf_inner.seq DESC
  LIMIT 1
) rf ON true;

-- 18. Grants & Permissions
GRANT SELECT ON public.risk_queue TO authenticated;
GRANT SELECT ON public.risk_followups TO authenticated;
GRANT SELECT ON public.risk_checkback_prompts TO authenticated;
GRANT SELECT, INSERT ON public.risk_checkbacks TO authenticated;
GRANT SELECT ON public.institution_backup_counsellors TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_risk_followup(uuid, public.followup_step, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.escalate_overdue_risk() TO authenticated, service_role;

-- 19. Guarded pg_cron Job Schedule
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_cron";
  EXECUTE 'SELECT cron.schedule(''escalate_overdue_risk_periodic'', ''*/15 * * * *'', ''SELECT public.escalate_overdue_risk();'')';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron job schedule skipped: %', SQLERRM;
END $$;
