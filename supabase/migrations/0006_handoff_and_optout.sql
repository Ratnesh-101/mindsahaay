-- ==============================================================================
-- MindSahaay Migration: 0006_handoff_and_optout.sql
-- Description: Warm handoff (counsellor slot offer & student acceptance) and
--              server-side check-back opt-out preference.
-- Feature: Crisis Follow-Through Loop (Warm Handoff & Server-Side Opt-Out)
-- Compliance: India DPDP Act 2023, Mental Healthcare Act 2017, UGC Guidelines
-- ==============================================================================

-- ==============================================================================
-- 1. Server-Side Check-Back Opt-Out on public.profiles
-- ==============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS checkback_opt_out boolean NOT NULL DEFAULT false;

-- Helper to check if a student has opted out (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_student_opted_out(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT checkback_opt_out FROM public.profiles WHERE id = p_student_id), false);
$$;

-- RPC for a student to set their own check-back opt-out preference
CREATE OR REPLACE FUNCTION public.set_checkback_opt_out(p_opt_out boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  UPDATE public.profiles
  SET checkback_opt_out = p_opt_out,
      updated_at = now()
  WHERE id = v_caller;

  RETURN p_opt_out;
END;
$$;

-- Update AFTER INSERT trigger on risk_followups to skip prompt creation if student is opted out
CREATE OR REPLACE FUNCTION public.handle_risk_followup_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student_id uuid;
  v_opted_out boolean;
BEGIN
  -- If closed: set risk_events.resolved = true, resolved_at = now()
  IF NEW.step = 'closed' THEN
    UPDATE public.risk_events
    SET resolved = true,
        resolved_at = coalesce(resolved_at, now())
    WHERE id = NEW.risk_event_id;
  END IF;

  -- If acknowledged: trigger-created checkback prompts h24 and h72 (unless opted out)
  IF NEW.step = 'acknowledged' THEN
    SELECT student_id INTO v_student_id
    FROM public.risk_events
    WHERE id = NEW.risk_event_id;

    IF v_student_id IS NOT NULL THEN
      SELECT COALESCE(checkback_opt_out, false) INTO v_opted_out
      FROM public.profiles
      WHERE id = v_student_id;

      IF NOT v_opted_out THEN
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
  END IF;

  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 2. Warm Handoff: Offer Session Slot RPC
-- ==============================================================================

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

  -- 5. Fetch and validate availability slot
  SELECT * INTO v_slot
  FROM public.availability_slots
  WHERE id = p_slot_id;

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

  -- 6. Validate note length if provided
  IF p_note IS NOT NULL AND length(p_note) > 500 THEN
    RAISE EXCEPTION 'Note must not exceed 500 characters';
  END IF;

  -- 7. Fetch counsellor alias
  SELECT alias INTO v_counsellor_alias
  FROM public.profiles
  WHERE id = v_caller;

  -- 8. Create notification of type 'handoff_offer' for the student
  -- Note: Follow-up step is NOT advanced here. Advances only upon acceptance.
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
      'note', p_note
    )
  )
  RETURNING id INTO v_notification_id;

  -- 9. Audit log entry (data minimization: no message content)
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

-- ==============================================================================
-- 3. Warm Handoff: Accept Handoff Offer RPC
-- ==============================================================================

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

  -- 9. Fetch and validate risk event
  SELECT * INTO v_event
  FROM public.risk_events
  WHERE id = v_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Risk event not found';
  END IF;

  IF v_event.resolved THEN
    RAISE EXCEPTION 'Cannot accept offer for resolved risk event';
  END IF;

  -- 10. Book slot atomically via book_appointment_atomic
  v_appointment_json := public.book_appointment_atomic(
    p_student_id := v_caller,
    p_counsellor_id := v_counsellor_id,
    p_slot_id := v_slot_id,
    p_notes := 'Handoff consultation for risk event ' || v_event_id::text
  );
  v_appointment_id := (v_appointment_json->>'id')::uuid;

  -- 11. Followup step transition handling
  -- The legal order is: open -> acknowledged -> contacted -> handed_off -> closed
  -- If event is at 'contacted', transition to 'handed_off' passes validation.
  -- If earlier (open or acknowledged), acceptance books the appointment without forcing an illegal jump.
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

  -- 12. Mark notification read and status accepted
  UPDATE public.notifications
  SET read = true,
      metadata = metadata || jsonb_build_object(
        'status', 'accepted',
        'appointment_id', v_appointment_id,
        'accepted_at', now()
      )
  WHERE id = p_notification_id;

  -- 13. Audit log entry (data minimization: no message content)
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

-- ==============================================================================
-- 4. Warm Handoff: Decline Handoff Offer RPC
-- ==============================================================================

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

  v_event_id := (v_notif.metadata->>'risk_event_id')::uuid;

  UPDATE public.notifications
  SET read = true,
      metadata = metadata || jsonb_build_object(
        'status', 'declined',
        'declined_at', now()
      )
  WHERE id = p_notification_id;

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

-- ==============================================================================
-- 5. Grants
-- ==============================================================================

REVOKE ALL ON FUNCTION public.set_checkback_opt_out(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_checkback_opt_out(boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.offer_handoff_slot(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.offer_handoff_slot(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_handoff_offer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_handoff_offer(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.decline_handoff_offer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_handoff_offer(uuid) TO authenticated;
