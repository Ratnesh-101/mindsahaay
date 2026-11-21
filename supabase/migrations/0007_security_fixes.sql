-- ==============================================================================
-- MindSahaay Migration: 0007_security_fixes.sql
-- Description: Security and Clinical Safety Fixes (G6 Review Findings & Systematic Audit)
-- Scope:
--   1. G6-SEC-01 (Critical): Current-cycle escalation idempotency on reopened crisis events
--   2. G6-SEC-02 (High): Authorisation enforcement on get_student_alias_for_care
--   3. G6-SEC-07 (Medium): escalate_overdue_risk caller restriction, advisory lock & unique index
--   4. Care share revocation synchronization (revoked_at check)
--   5. Notification spoofing & tampering defense (RLS insert lock, metadata immutability trigger)
--   6. Warm handoff RPC hardening: cross-user acceptance, slot hijack, replay defense, double offer check
--   7. Systematic SECURITY DEFINER search_path & anon privilege revocation
-- Compliance: India DPDP Act 2023, UGC Well-being Guidelines, Mental Healthcare Act 2017
-- ==============================================================================

-- ==============================================================================
-- 1. Care Share Active Evaluation Fix (Revocation Synchronization)
-- ==============================================================================

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
      AND cs.revoked_at IS NULL
      AND (cs.expires_at IS NULL OR cs.expires_at > now())
      AND (p_scope_item = ANY(cs.scope) OR 'all' = ANY(cs.scope))
      AND EXISTS (
        SELECT 1 FROM public.counsellors c
        WHERE c.id = cs.counsellor_id AND c.verified = true
      )
  );
$$;

-- ==============================================================================
-- 2. G6-SEC-02: Student Alias Authorisation Enforcement
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_student_alias_for_care(p_student_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_alias text;
BEGIN
  -- Authorisation check:
  -- Allowed only for: trusted backend, super admin, the student themselves, or verified counsellor with active care share
  IF public.is_trusted_backend()
     OR public.is_super_admin()
     OR (v_caller IS NOT NULL AND v_caller = p_student_id)
     OR (
       v_caller IS NOT NULL
       AND public.is_verified_counsellor(v_caller)
       AND (
         public.has_active_care_share(p_student_id, v_caller, 'risk_events')
         OR public.has_active_care_share(p_student_id, v_caller, 'profile')
         OR public.has_active_care_share(p_student_id, v_caller, 'all')
       )
     ) THEN
    SELECT alias INTO v_alias FROM public.profiles WHERE id = p_student_id;
    RETURN v_alias;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_alias_for_care(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_alias_for_care(uuid) TO authenticated, service_role;

-- ==============================================================================
-- 3. G6-SEC-01 & G6-SEC-07: Overdue Crisis Escalation RPC & Partial Unique Index
-- ==============================================================================

-- Partial unique index ensuring idempotency per (user, risk_event, level, followup cycle)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_risk_overdue_cycle
  ON public.notifications (
    user_id,
    type,
    (metadata->>'risk_event_id'),
    (metadata->>'level'),
    (metadata->>'followup_id')
  )
  WHERE type = 'risk_overdue' AND metadata->>'followup_id' IS NOT NULL;

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

  v_caller uuid := auth.uid();
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
  -- 1. Authorisation check: trusted backend OR verified counsellor holding at least one active care share scoped to risk_events
  IF NOT public.is_trusted_backend() THEN
    IF v_caller IS NULL OR NOT public.is_verified_counsellor(v_caller) THEN
      RAISE EXCEPTION 'Unauthorized: Caller is not authorized to escalate overdue risk';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.care_shares cs
      JOIN public.counsellors c ON c.id = cs.counsellor_id
      WHERE cs.counsellor_id = v_caller
        AND cs.active = true
        AND cs.revoked_at IS NULL
        AND (cs.expires_at IS NULL OR cs.expires_at > now())
        AND ('risk_events' = ANY(cs.scope) OR 'all' = ANY(cs.scope))
        AND c.verified = true
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Caller is not authorized to escalate overdue risk';
    END IF;
  END IF;

  -- 2. Concurrency advisory lock: serialize concurrent escalation sweeps
  PERFORM pg_advisory_xact_lock(hashtext('escalate_overdue_risk'));

  -- 3. Loop over all unresolved risk events whose latest followup step is 'open'
  FOR v_rec IN
    WITH latest_followup AS (
      SELECT DISTINCT ON (risk_event_id)
        id AS followup_id,
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
      lf.followup_id,
      lf.step_at
    FROM public.risk_events re
    JOIN latest_followup lf ON lf.risk_event_id = re.id
    JOIN public.profiles p ON p.id = re.student_id
    WHERE re.resolved = false
      AND lf.step = 'open'
      AND re.severity_level IN ('high', 'crisis')
      AND (
        public.is_trusted_backend()
        OR (
          v_caller IS NOT NULL
          AND public.has_active_care_share(re.student_id, v_caller, 'risk_events')
        )
      )
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
          AND cs.revoked_at IS NULL
          AND (cs.expires_at IS NULL OR cs.expires_at > now())
          AND ('risk_events' = ANY(cs.scope) OR 'all' = ANY(cs.scope))
          AND c.verified = true
      LOOP
        -- Check idempotency scoped to CURRENT follow-up cycle (followup_id or step_at timestamp)
        IF NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = v_counsellor.counsellor_id
            AND n.type = 'risk_overdue'
            AND (n.metadata->>'risk_event_id')::uuid = v_rec.risk_event_id
            AND (n.metadata->>'level')::int = 1
            AND (
              (n.metadata->>'followup_id')::uuid = v_rec.followup_id
              OR (n.metadata->>'followup_id' IS NULL AND n.created_at >= v_rec.step_at)
            )
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
              'level', 1,
              'followup_id', v_rec.followup_id,
              'step_at', v_rec.step_at
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
            'severity_level', v_rec.severity_level,
            'followup_id', v_rec.followup_id
          )
        );
      END IF;
    END IF;

    -- Level 2 Escalation: age >= v_l2_threshold
    IF v_age >= v_l2_threshold THEN
      v_backup_counsellor_id := NULL;
      IF v_rec.institution_id IS NOT NULL THEN
        SELECT counsellor_id INTO v_backup_counsellor_id
        FROM public.institution_backup_counsellors
        WHERE institution_id = v_rec.institution_id;
      END IF;

      IF v_backup_counsellor_id IS NOT NULL THEN
        -- Check idempotency scoped to CURRENT follow-up cycle
        IF NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = v_backup_counsellor_id
            AND n.type = 'risk_overdue'
            AND (n.metadata->>'risk_event_id')::uuid = v_rec.risk_event_id
            AND (n.metadata->>'level')::int = 2
            AND (
              (n.metadata->>'followup_id')::uuid = v_rec.followup_id
              OR (n.metadata->>'followup_id' IS NULL AND n.created_at >= v_rec.step_at)
            )
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
              'level', 2,
              'followup_id', v_rec.followup_id,
              'step_at', v_rec.step_at
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
              'backup_counsellor_id', v_backup_counsellor_id,
              'followup_id', v_rec.followup_id
            )
          );
        END IF;
      END IF;
    END IF;

  END LOOP;

  RETURN v_notifications_count;
END;
$$;

REVOKE ALL ON FUNCTION public.escalate_overdue_risk() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalate_overdue_risk() TO authenticated, service_role;

-- ==============================================================================
-- 4. Notification Table Hardening (Spoofing & Tampering Prevention)
-- ==============================================================================

-- Immutability trigger preventing clients from updating metadata/type/user_id directly
CREATE OR REPLACE FUNCTION public.protect_notifications_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- When updated by system/RPC via allow flag or trusted backend, allow update
  IF public.is_trusted_backend() OR current_setting('app.allow_notification_system_update', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id <> OLD.user_id
     OR NEW.type <> OLD.type
     OR NEW.title <> OLD.title
     OR NEW.body <> OLD.body
     OR NEW.metadata IS DISTINCT FROM OLD.metadata
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Unauthorized: Only notification read status may be updated by users';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_notifications_immutability ON public.notifications;
CREATE TRIGGER trg_protect_notifications_immutability
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_notifications_immutability();

REVOKE ALL ON FUNCTION public.protect_notifications_immutability() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.protect_notifications_immutability() TO authenticated, service_role;

-- Replace permissive FOR ALL policy with separated SELECT, INSERT, UPDATE, DELETE policies
DROP POLICY IF EXISTS "Users manage own notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;

CREATE POLICY "notifications_select"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (public.is_trusted_backend());

CREATE POLICY "notifications_update"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "notifications_delete"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

-- ==============================================================================
-- 5. Hardening 0006 RPCs (set_checkback_opt_out, offer_handoff_slot, accept_handoff_offer, decline_handoff_offer)
-- ==============================================================================

-- 5.1 set_checkback_opt_out: restrict to student role
CREATE OR REPLACE FUNCTION public.set_checkback_opt_out(p_opt_out boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role public.user_role;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_caller;

  IF v_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'Unauthorized: Only students can set check-back opt-out preference';
  END IF;

  UPDATE public.profiles
  SET checkback_opt_out = p_opt_out,
      updated_at = now()
  WHERE id = v_caller;

  RETURN p_opt_out;
END;
$$;

REVOKE ALL ON FUNCTION public.set_checkback_opt_out(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_checkback_opt_out(boolean) TO authenticated, service_role;

-- 5.2 offer_handoff_slot: slot lock FOR UPDATE, duplicate pending offer check
CREATE OR REPLACE FUNCTION public.offer_handoff_slot(
  p_event_id uuid,
  p_slot_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_event public.risk_events%ROWTYPE;
  v_slot public.availability_slots%ROWTYPE;
  v_current_step public.followup_step;
  v_counsellor_alias text;
  v_notification_id uuid;
BEGIN
  -- 1. Caller validation: must be authenticated and verified counsellor
  IF v_caller IS NULL OR NOT public.is_verified_counsellor(v_caller) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not a verified counsellor';
  END IF;

  -- 2. Fetch risk event
  SELECT * INTO v_event
  FROM public.risk_events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Risk event not found';
  END IF;

  -- 3. Check risk event is unclosed
  IF v_event.resolved THEN
    RAISE EXCEPTION 'Cannot offer handoff slot for resolved risk event';
  END IF;

  SELECT step INTO v_current_step
  FROM public.risk_followups
  WHERE risk_event_id = p_event_id
  ORDER BY seq DESC
  LIMIT 1;

  IF v_current_step = 'closed' THEN
    RAISE EXCEPTION 'Cannot offer handoff slot for closed risk event';
  END IF;

  -- 4. Check active care share scoped to risk_events
  IF NOT public.has_active_care_share(v_event.student_id, v_caller, 'risk_events') THEN
    RAISE EXCEPTION 'Unauthorized: Counsellor lacks active care share scoped to risk_events for this student';
  END IF;

  -- 5. Fetch and lock availability slot
  SELECT * INTO v_slot
  FROM public.availability_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Availability slot not found';
  END IF;

  IF v_slot.counsellor_id <> v_caller THEN
    RAISE EXCEPTION 'Slot does not belong to the calling counsellor';
  END IF;

  IF v_slot.is_booked THEN
    RAISE EXCEPTION 'Slot is already booked';
  END IF;

  IF v_slot.start_time <= now() THEN
    RAISE EXCEPTION 'Slot is in the past';
  END IF;

  -- 6. Check for duplicate pending offer on this slot
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE type = 'handoff_offer'
      AND (metadata->>'slot_id')::uuid = p_slot_id
      AND COALESCE(metadata->>'status', 'pending') = 'pending'
      AND created_at >= now() - interval '24 hours'
  ) THEN
    RAISE EXCEPTION 'Slot already has an active pending handoff offer';
  END IF;

  -- 7. Validate note length if provided
  IF p_note IS NOT NULL AND length(p_note) > 500 THEN
    RAISE EXCEPTION 'Note must not exceed 500 characters';
  END IF;

  -- 8. Fetch counsellor alias
  SELECT alias INTO v_counsellor_alias
  FROM public.profiles
  WHERE id = v_caller;

  -- 9. Create notification of type 'handoff_offer' for the student
  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    type,
    metadata
  ) VALUES (
    v_event.student_id,
    'Session Slot Offered',
    'Your counsellor has offered a consultation session slot.',
    'handoff_offer',
    jsonb_build_object(
      'risk_event_id', p_event_id,
      'slot_id', p_slot_id,
      'starts_at', v_slot.start_time,
      'counsellor_alias', COALESCE(v_counsellor_alias, 'Campus Counsellor'),
      'counsellor_id', v_caller,
      'note', p_note,
      'status', 'pending'
    )
  )
  RETURNING id INTO v_notification_id;

  -- 10. Audit log entry
  PERFORM public.log_audit_event(
    v_caller,
    'offer_handoff_slot',
    'risk_events',
    p_event_id::text,
    jsonb_build_object(
      'slot_id', p_slot_id,
      'starts_at', v_slot.start_time,
      'notification_id', v_notification_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'notification_id', v_notification_id,
    'slot_id', p_slot_id,
    'risk_event_id', p_event_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.offer_handoff_slot(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.offer_handoff_slot(uuid, uuid, text) TO authenticated, service_role;

-- 5.3 accept_handoff_offer: cross-user validation & slot ownership verification
CREATE OR REPLACE FUNCTION public.accept_handoff_offer(
  p_notification_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_notif public.notifications%ROWTYPE;
  v_event public.risk_events%ROWTYPE;
  v_slot public.availability_slots%ROWTYPE;
  v_event_id uuid;
  v_slot_id uuid;
  v_counsellor_id uuid;
  v_starts_at timestamptz;
  v_note text;
  v_current_step public.followup_step;
  v_appointment_json jsonb;
  v_appointment_id uuid;
  v_existing_apt public.appointments%ROWTYPE;
  v_transition_applied boolean := false;
BEGIN
  -- 1. Caller authentication
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  -- 2. Fetch notification row with lock
  SELECT * INTO v_notif
  FROM public.notifications
  WHERE id = p_notification_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;

  -- 3. Student only: notification must belong to caller
  IF v_notif.user_id <> v_caller THEN
    RAISE EXCEPTION 'Unauthorized: Notification belongs to another student';
  END IF;

  -- 4. Verify type
  IF v_notif.type <> 'handoff_offer' THEN
    RAISE EXCEPTION 'Invalid notification type for handoff acceptance';
  END IF;

  -- 5. Idempotency check: if already accepted, return existing appointment
  IF (v_notif.metadata->>'status') = 'accepted' THEN
    v_appointment_id := (v_notif.metadata->>'appointment_id')::uuid;
    IF v_appointment_id IS NOT NULL THEN
      SELECT * INTO v_existing_apt
      FROM public.appointments
      WHERE id = v_appointment_id;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'success', true,
          'appointment', to_jsonb(v_existing_apt),
          'already_accepted', true
        );
      END IF;
    END IF;
  END IF;

  -- 6. Check if declined
  IF (v_notif.metadata->>'status') = 'declined' THEN
    RAISE EXCEPTION 'Offer has been declined';
  END IF;

  -- 7. Check 24-hour expiration and slot past time
  IF v_notif.created_at < now() - interval '24 hours' THEN
    RAISE EXCEPTION 'Offer has expired (24 hours limit exceeded)';
  END IF;

  v_starts_at := (v_notif.metadata->>'starts_at')::timestamptz;
  IF v_starts_at IS NOT NULL AND v_starts_at <= now() THEN
    RAISE EXCEPTION 'Slot is in the past';
  END IF;

  -- 8. Extract metadata
  v_event_id := (v_notif.metadata->>'risk_event_id')::uuid;
  v_slot_id := (v_notif.metadata->>'slot_id')::uuid;
  v_counsellor_id := (v_notif.metadata->>'counsellor_id')::uuid;
  v_note := v_notif.metadata->>'note';

  IF v_event_id IS NULL OR v_slot_id IS NULL OR v_counsellor_id IS NULL THEN
    RAISE EXCEPTION 'Malformed handoff offer notification metadata';
  END IF;

  -- 9. Fetch and validate risk event: must belong to the caller (cross-user defense)
  SELECT * INTO v_event
  FROM public.risk_events
  WHERE id = v_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Risk event not found';
  END IF;

  IF v_event.student_id <> v_caller THEN
    RAISE EXCEPTION 'Unauthorized: Risk event does not belong to the calling student';
  END IF;

  IF v_event.resolved THEN
    RAISE EXCEPTION 'Cannot accept offer for resolved risk event';
  END IF;

  -- 10. Fetch and validate availability slot: must belong to offering counsellor (slot hijack defense)
  SELECT * INTO v_slot
  FROM public.availability_slots
  WHERE id = v_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Availability slot not found';
  END IF;

  IF v_slot.counsellor_id <> v_counsellor_id THEN
    RAISE EXCEPTION 'Slot does not belong to the offering counsellor';
  END IF;

  IF v_slot.is_booked THEN
    RAISE EXCEPTION 'Slot is already booked';
  END IF;

  -- 11. Book slot atomically via book_appointment_atomic
  v_appointment_json := public.book_appointment_atomic(
    p_student_id := v_caller,
    p_counsellor_id := v_counsellor_id,
    p_slot_id := v_slot_id,
    p_notes := 'Handoff consultation for risk event ' || v_event_id::text
  );
  v_appointment_id := (v_appointment_json->>'id')::uuid;

  -- 12. Followup step transition handling
  SELECT step INTO v_current_step
  FROM public.risk_followups
  WHERE risk_event_id = v_event_id
  ORDER BY seq DESC
  LIMIT 1;

  IF v_current_step = 'contacted' THEN
    INSERT INTO public.risk_followups (
      risk_event_id,
      step,
      actor_id,
      note
    ) VALUES (
      v_event_id,
      'handed_off',
      v_counsellor_id,
      COALESCE(v_note, 'Student accepted warm handoff session slot.')
    );
    v_transition_applied := true;
  ELSE
    v_transition_applied := false;
  END IF;

  -- 13. Mark notification read and status accepted
  PERFORM set_config('app.allow_notification_system_update', 'true', true);

  UPDATE public.notifications
  SET read = true,
      metadata = metadata || jsonb_build_object(
        'status', 'accepted',
        'appointment_id', v_appointment_id,
        'accepted_at', now()
      )
  WHERE id = p_notification_id;

  PERFORM set_config('app.allow_notification_system_update', 'false', true);

  -- 14. Audit log entry
  PERFORM public.log_audit_event(
    v_caller,
    'accept_handoff_offer',
    'risk_events',
    v_event_id::text,
    jsonb_build_object(
      'notification_id', p_notification_id,
      'slot_id', v_slot_id,
      'appointment_id', v_appointment_id,
      'transition_applied', v_transition_applied,
      'current_step', v_current_step
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment', v_appointment_json,
    'transition_applied', v_transition_applied
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_handoff_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_handoff_offer(uuid) TO authenticated, service_role;

-- 5.4 decline_handoff_offer: replay defense (cannot decline already accepted offer)
CREATE OR REPLACE FUNCTION public.decline_handoff_offer(
  p_notification_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_notif public.notifications%ROWTYPE;
  v_event_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  SELECT * INTO v_notif
  FROM public.notifications
  WHERE id = p_notification_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;

  IF v_notif.user_id <> v_caller THEN
    RAISE EXCEPTION 'Unauthorized: Notification belongs to another student';
  END IF;

  IF v_notif.type <> 'handoff_offer' THEN
    RAISE EXCEPTION 'Invalid notification type';
  END IF;

  -- Replay prevention: cannot decline an already accepted offer
  IF (v_notif.metadata->>'status') = 'accepted' THEN
    RAISE EXCEPTION 'Cannot decline an already accepted offer';
  END IF;

  -- Idempotency: if already declined, return true
  IF (v_notif.metadata->>'status') = 'declined' THEN
    RETURN true;
  END IF;

  v_event_id := (v_notif.metadata->>'risk_event_id')::uuid;

  PERFORM set_config('app.allow_notification_system_update', 'true', true);

  UPDATE public.notifications
  SET read = true,
      metadata = metadata || jsonb_build_object(
        'status', 'declined',
        'declined_at', now()
      )
  WHERE id = p_notification_id;

  PERFORM set_config('app.allow_notification_system_update', 'false', true);

  IF v_event_id IS NOT NULL THEN
    PERFORM public.log_audit_event(
      v_caller,
      'decline_handoff_offer',
      'risk_events',
      v_event_id::text,
      jsonb_build_object('notification_id', p_notification_id)
    );
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_handoff_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_handoff_offer(uuid) TO authenticated, service_role;

-- ==============================================================================
-- 6. Systematic Sweep: Revoke Execution from PUBLIC & anon across all SECURITY DEFINER functions
-- ==============================================================================

-- Explicit revocation of execution from PUBLIC and anon on all public SECURITY DEFINER functions
-- (except allowlisted public.check_rate_limit)
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT p.oid::regprocedure AS proc_signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname NOT IN ('check_rate_limit')
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || v_rec.proc_signature || ' FROM PUBLIC, anon;';
  END LOOP;
END $$;

-- Maintenance functions: revoke from authenticated, grant only to service_role
REVOKE ALL ON FUNCTION public.cleanup_stale_rate_limits() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_rate_limits() TO service_role;

REVOKE ALL ON FUNCTION public.purge_expired_chat_messages() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_chat_messages() TO service_role;

-- Ensure check_rate_limit remains executable by anon, authenticated, service_role
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer, integer) TO anon, authenticated, service_role;
