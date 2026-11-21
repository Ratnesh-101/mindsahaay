import { supabase } from "../../shared/lib/supabase";
import { getAuthenticatedSession } from "../../shared/lib/api/sessionHelper";
import { ApiError } from "../../shared/lib/api/errors";
import { decryptJournal, encryptJournal } from "../../domain/crypto/journalCrypto";
import { fetchSlots, type Slot } from "../doctors/api";

function fail(error: { message: string; code?: string }): never {
  throw new ApiError(error.message, 500, error.code ?? "DB_ERROR");
}

export interface CaseloadEntry {
  careShareId: string;
  studentId: string;
  alias: string | null;
  scope: string[];
  expiresAt: string | null;
}

/** True when the care share is active and has not expired. */
export function isShareCurrent(share: { active?: boolean; expires_at?: string | null; revoked_at?: string | null }, now: Date = new Date()): boolean {
  if (share.active === false || share.revoked_at) return false;
  return !share.expires_at || new Date(share.expires_at).getTime() > now.getTime();
}

/**
 * Appends to the audit log (append-only; the student can read entries about themselves).
 * Never throws: auditing must not hide data from a counsellor in an emergency, but failures are returned.
 */
export async function logAccess(action: string, resourceType: string, resourceId: string, details: Record<string, unknown> = {}): Promise<boolean> {
  try {
    const { user } = await getAuthenticatedSession();
    const { error } = await supabase.from("audit_log").insert({
      actor_id: user.id,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
    });
    return !error;
  } catch {
    return false;
  }
}

/** The counsellor's caseload: students with an active, unexpired care share (RLS also limits what is readable). */
export async function fetchCaseload(now: Date = new Date()): Promise<CaseloadEntry[]> {
  const { user } = await getAuthenticatedSession();
  const { data, error } = await supabase
    .from("care_shares")
    .select("id, student_id, scope, expires_at, active, revoked_at, profiles(alias)")
    .eq("counsellor_id", user.id)
    .eq("active", true);
  if (error) fail(error);
  const entries = (data ?? [])
    .filter((r: Record<string, unknown>) => isShareCurrent(r as { active?: boolean; expires_at?: string | null; revoked_at?: string | null }, now))
    .map((r: Record<string, unknown>) => {
      const profile = r.profiles as { alias?: string } | { alias?: string }[] | null;
      const alias = Array.isArray(profile) ? profile[0]?.alias : profile?.alias;
      return {
        careShareId: String(r.id),
        studentId: String(r.student_id),
        alias: alias ?? null,
        scope: (r.scope as string[] | null) ?? [],
        expiresAt: (r.expires_at as string | null) ?? null,
      };
    });
  void logAccess("COUNSELLOR_VIEWED_CASELOAD", "care_shares", user.id, { count: entries.length });
  return entries;
}

export interface ScorePoint {
  id: string;
  instrument: "phq9" | "gad7";
  total: number;
  completedAt: string;
}

/** PHQ-9 and GAD-7 history for one consented student. Writes an audit entry first. */
export async function fetchTrajectory(studentId: string): Promise<ScorePoint[]> {
  await logAccess("COUNSELLOR_VIEWED_ASSESSMENTS", "student", studentId, { scope: "assessments" });
  const { data, error } = await supabase
    .from("assessments")
    .select("id, instrument, total, completed_at")
    .eq("student_id", studentId)
    .in("instrument", ["phq9", "gad7"])
    .order("completed_at", { ascending: true });
  if (error) fail(error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    instrument: r.instrument as "phq9" | "gad7",
    total: Number(r.total),
    completedAt: String(r.completed_at),
  }));
}

export type FollowupStep = "open" | "acknowledged" | "contacted" | "handed_off" | "closed";

/** The five steps in their only legal order. */
export const FOLLOWUP_STEPS: readonly FollowupStep[] = ["open", "acknowledged", "contacted", "handed_off", "closed"];

/** Fixed closure reasons accepted by the database. */
export const CLOSURE_REASONS = [
  "student_reached_safe",
  "referred_to_counsellor_session",
  "referred_to_emergency_services",
  "unable_to_reach_documented",
  "false_alarm",
] as const;
export type ClosureReason = (typeof CLOSURE_REASONS)[number];

export const NOTE_MAX_LENGTH = 500;

/** The one step a counsellor may take next, or null when the event is closed. */
export function nextStep(step: FollowupStep): FollowupStep | null {
  const i = FOLLOWUP_STEPS.indexOf(step);
  return i >= 0 && i < FOLLOWUP_STEPS.length - 1 ? FOLLOWUP_STEPS[i + 1] : null;
}

export interface RiskEvent {
  id: string;
  studentId: string;
  eventType: string;
  severity: "low" | "medium" | "high" | "crisis";
  createdAt: string;
  resolved: boolean;
  currentStep: FollowupStep;
  currentStepAt: string | null;
  isOverdue: boolean;
  overdueThresholdHours: number | null;
  /** True when the event was queued on the student's device while offline (payload.offline). */
  offline: boolean;
  /** Device time the event was detected (payload.detected_at), only when it parses as a date. */
  detectedAt: string | null;
  /** ISO timestamps for each step reached in the current cycle. Empty when steps could not be loaded. */
  stepTimes: Partial<Record<FollowupStep, string>>;
  /** True when the student asked to talk in a check-back and the event was reopened. */
  reopened: boolean;
}

const SEVERITIES = ["low", "medium", "high", "crisis"] as const;

/**
 * Event types the system itself raises. risk_events.event_type is free text in the database, so a
 * student could store any wording (for example "FALSE ALARM - RESOLVED"). The queue therefore never
 * shows the stored text: it shows a fixed label for a known type and "other" for anything else.
 */
export const KNOWN_EVENT_TYPES = ["chat_crisis", "phq9_item9", "counsellor_contact_requested", "manual", "lexicon_match", "assessment_escalation"] as const;

/** i18n key of the label for an event type; unknown values map to the generic "other" label. */
export function eventTypeLabelKey(eventType: string): string {
  return (KNOWN_EVENT_TYPES as readonly string[]).includes(eventType) ? `counsellor.eventType.${eventType}` : "counsellor.eventType.other";
}

function isStep(v: unknown): v is FollowupStep {
  return typeof v === "string" && (FOLLOWUP_STEPS as readonly string[]).includes(v);
}

/**
 * Maps a risk_queue row. Only payload.offline and payload.detected_at are ever read from the payload;
 * nothing else from it can reach the UI.
 */
function mapRisk(r: Record<string, unknown>): RiskEvent {
  const payload = (r.payload && typeof r.payload === "object" ? r.payload : {}) as Record<string, unknown>;
  const detected = typeof payload.detected_at === "string" && !Number.isNaN(Date.parse(payload.detected_at)) ? payload.detected_at : null;
  const step: FollowupStep = isStep(r.current_step) ? r.current_step : r.resolved === true ? "closed" : "open";
  const threshold = r.overdue_threshold_hours;
  return {
    id: String(r.id),
    studentId: String(r.student_id),
    eventType: String(r.event_type),
    // An unknown severity is shown as "high" rather than passed through: it must stay visible and never read as lower.
    severity: (SEVERITIES as readonly unknown[]).includes(r.severity_level) ? (r.severity_level as RiskEvent["severity"]) : "high",
    createdAt: String(r.created_at),
    resolved: r.resolved === true,
    currentStep: step,
    currentStepAt: typeof r.current_step_at === "string" ? r.current_step_at : null,
    isOverdue: r.is_overdue === true,
    overdueThresholdHours: typeof threshold === "number" ? threshold : threshold == null ? null : Number(threshold),
    offline: payload.offline === true && detected !== null,
    detectedAt: payload.offline === true ? detected : null,
    stepTimes: {},
    reopened: false,
  };
}

const SEVERITY_ORDER: Record<RiskEvent["severity"], number> = { crisis: 0, high: 1, medium: 2, low: 3 };

/** Overdue combines the server flag with a client check: still "open" past the severity threshold. */
export function isEventOverdue(event: Pick<RiskEvent, "isOverdue" | "currentStep" | "createdAt" | "overdueThresholdHours"> & { currentStepAt?: string | null }, now: Date = new Date()): boolean {
  if (event.isOverdue) return true;
  if (event.currentStep !== "open" || event.overdueThresholdHours == null) return false;
  // The clock restarts when a check-back reopens the event, so measure from when the current "open" step began.
  const since = event.currentStepAt ?? event.createdAt;
  return now.getTime() - new Date(since).getTime() > event.overdueThresholdHours * 3600 * 1000;
}

/** Crisis first, then overdue first, then oldest first. */
export function sortRiskQueue(events: RiskEvent[], now: Date = new Date()): RiskEvent[] {
  return [...events].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      Number(isEventOverdue(b, now)) - Number(isEventOverdue(a, now)) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

/** Folds follow-up rows into per-step timestamps. A later "open" row (reopen) starts a new cycle. */
export function foldStepTimes(rows: { step: FollowupStep; created_at: string }[]): { times: Partial<Record<FollowupStep, string>>; reopened: boolean } {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let times: Partial<Record<FollowupStep, string>> = {};
  let opens = 0;
  for (const r of sorted) {
    if (r.step === "open") {
      opens += 1;
      times = {};
    }
    times[r.step] = r.created_at;
  }
  return { times, reopened: opens > 1 };
}

const QUEUE_COLUMNS =
  "id, student_id, alias, severity_level, event_type, trigger_source, payload, created_at, resolved, current_step, current_step_at, is_overdue, overdue_threshold_hours";

/** Unresolved events from the risk_queue view (RLS limits rows to students with a current risk_events care share). */
export async function fetchRiskQueue(): Promise<RiskEvent[]> {
  await getAuthenticatedSession();
  const { data, error } = await supabase.from("risk_queue").select(QUEUE_COLUMNS).eq("resolved", false).order("created_at", { ascending: false }).limit(100);
  if (error) fail(error);
  const events = ((data ?? []) as Record<string, unknown>[]).map(mapRisk);
  if (events.length > 0) {
    // Step timestamps are a nicety: if they cannot be read the current step from the view still shows.
    try {
      const { data: steps, error: stepError } = await supabase
        .from("risk_followups")
        .select("risk_event_id, step, created_at")
        .in("risk_event_id", events.map((e) => e.id));
      if (!stepError && steps) {
        const byEvent = new Map<string, { step: FollowupStep; created_at: string }[]>();
        for (const row of steps as Record<string, unknown>[]) {
          if (!isStep(row.step)) continue;
          const list = byEvent.get(String(row.risk_event_id)) ?? [];
          list.push({ step: row.step, created_at: String(row.created_at) });
          byEvent.set(String(row.risk_event_id), list);
        }
        for (const e of events) {
          const folded = foldStepTimes(byEvent.get(e.id) ?? []);
          e.stepTimes = folded.times;
          e.reopened = folded.reopened;
        }
      }
    } catch {
      /* keep events without timestamps */
    }
  }
  return sortRiskQueue(events);
}

export interface FollowupRow {
  id: string;
  eventId: string;
  step: FollowupStep;
  actorId: string;
  closureReason: string | null;
  note: string | null;
  createdAt: string;
}

/**
 * Moves an event one step forward through the database RPC, which re-checks the counsellor's care
 * share and the legal order. The note must never contain what the student wrote.
 */
export async function advanceFollowup(eventId: string, step: FollowupStep, reason?: ClosureReason | null, note?: string | null): Promise<FollowupRow> {
  await getAuthenticatedSession();
  const trimmed = note?.trim() ? note.trim() : null;
  if (step === "closed" && !reason) throw new ApiError("A closure reason is required to close an event.", 422, "REASON_REQUIRED");
  if (reason && !(CLOSURE_REASONS as readonly string[]).includes(reason)) throw new ApiError("Unknown closure reason.", 422, "BAD_REASON");
  if (trimmed && trimmed.length > NOTE_MAX_LENGTH) throw new ApiError(`Notes can be at most ${NOTE_MAX_LENGTH} characters.`, 422, "NOTE_TOO_LONG");
  const { data, error } = await supabase.rpc("advance_risk_followup", {
    p_event_id: eventId,
    p_step: step,
    p_closure_reason: step === "closed" ? reason : null,
    p_note: trimmed,
  });
  if (error) fail(error);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) throw new ApiError("The follow-up step was not saved.", 502, "EMPTY_RESPONSE");
  return {
    id: String(row.id),
    eventId: String(row.risk_event_id ?? eventId),
    step: (isStep(row.step) ? row.step : step) as FollowupStep,
    actorId: String(row.actor_id ?? ""),
    closureReason: (row.closure_reason as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}

/** Future unbooked slots for the signed-in counsellor. Reuses fetchSlots from doctors feature. */
export async function fetchMySlots(now: Date = new Date()): Promise<Slot[]> {
  const { user } = await getAuthenticatedSession();
  return fetchSlots(user.id, now);
}

/** Offers an availability slot to a student for warm handoff from an unclosed risk event. */
export async function offerHandoffSlot(
  eventId: string,
  slotId: string,
  note?: string | null,
): Promise<{ success: boolean; notificationId: string }> {
  await getAuthenticatedSession();
  const trimmed = note?.trim() ? note.trim() : null;
  if (trimmed && trimmed.length > NOTE_MAX_LENGTH) {
    throw new ApiError(`Notes can be at most ${NOTE_MAX_LENGTH} characters.`, 422, "NOTE_TOO_LONG");
  }
  const { data, error } = await supabase.rpc("offer_handoff_slot", {
    p_event_id: eventId,
    p_slot_id: slotId,
    p_note: trimmed,
  });
  if (error) fail(error);
  const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return {
    success: row.success === true,
    notificationId: String(row.notification_id ?? ""),
  };
}


/**
 * Read-time fallback for the pg_cron job: asks the database to create overdue notifications now.
 * Returns how many notifications were created (0 when the call fails, because the queue itself must still load).
 */
export async function runOverdueEscalation(): Promise<number> {
  try {
    await getAuthenticatedSession();
    const { data, error } = await supabase.rpc("escalate_overdue_risk");
    if (error) return 0;
    return typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}

/** @deprecated Use advanceFollowup. Closes an event as a false alarm; only legal from the "handed_off" step. */
export async function resolveRiskEvent(id: string): Promise<void> {
  await advanceFollowup(id, "closed", "false_alarm");
}

/**
 * Supabase Realtime subscription to risk_events. RLS still applies to the change feed, so only
 * events for consenting students arrive. Handlers get only the event id and severity because the
 * realtime row lacks the follow-up step; the queue refetches the view. Returns an unsubscribe function.
 */
export function subscribeRiskEvents(handlers: {
  onInsert: (change: { id: string; severity: RiskEvent["severity"] }) => void;
  onUpdate: (change: { id: string; severity: RiskEvent["severity"] }) => void;
  onStatus?: (live: boolean) => void;
}): () => void {
  const channel = supabase
    .channel("counsellor-risk-events")
    .on("postgres_changes", { event: "*", schema: "public", table: "risk_events" }, (payload: { eventType: string; new: Record<string, unknown> }) => {
      if (!payload.new || !("id" in payload.new)) return;
      const change = { id: String(payload.new.id), severity: payload.new.severity_level as RiskEvent["severity"] };
      if (payload.eventType === "INSERT") handlers.onInsert(change);
      else if (payload.eventType === "UPDATE") handlers.onUpdate(change);
    })
    .subscribe((status: string) => handlers.onStatus?.(status === "SUBSCRIBED"));
  return () => {
    void supabase.removeChannel(channel);
  };
}
export interface AppointmentOption {
  id: string;
  scheduledAt: string;
}

export async function fetchAppointmentsWithStudent(studentId: string): Promise<AppointmentOption[]> {
  const { user } = await getAuthenticatedSession();
  const { data, error } = await supabase
    .from("appointments")
    .select("id, scheduled_at")
    .eq("counsellor_id", user.id)
    .eq("student_id", studentId)
    .order("scheduled_at", { ascending: false });
  if (error) fail(error);
  return (data ?? []).map((r: Record<string, unknown>) => ({ id: String(r.id), scheduledAt: String(r.scheduled_at) }));
}

export interface SessionNote {
  id: string;
  appointmentId: string;
  text: string;
  createdAt: string;
}

/** session_notes has ciphertext and iv columns only, so the key-derivation salt is stored as "salt.ciphertext". */
export function packNote(payload: { salt: string; ciphertext: string }): string {
  return `${payload.salt}.${payload.ciphertext}`;
}

export function unpackNote(stored: string): { salt: string; ciphertext: string } {
  const dot = stored.indexOf(".");
  if (dot < 1) throw new ApiError("Malformed encrypted note.", 422, "BAD_NOTE");
  return { salt: stored.slice(0, dot), ciphertext: stored.slice(dot + 1) };
}

export async function saveSessionNote(input: { appointmentId: string; studentId: string; text: string }, passphrase: string): Promise<SessionNote> {
  const { user } = await getAuthenticatedSession();
  const enc = await encryptJournal(input.text, passphrase);
  const { data, error } = await supabase
    .from("session_notes")
    .insert({
      appointment_id: input.appointmentId,
      counsellor_id: user.id,
      student_id: input.studentId,
      ciphertext: packNote(enc),
      iv: enc.iv,
    })
    .select()
    .single();
  if (error) fail(error);
  void logAccess("COUNSELLOR_WROTE_SESSION_NOTE", "session_notes", String(data.id), { appointment_id: input.appointmentId });
  return { id: String(data.id), appointmentId: input.appointmentId, text: input.text, createdAt: String(data.created_at) };
}

export async function fetchSessionNotes(studentId: string, passphrase: string): Promise<SessionNote[]> {
  const { user } = await getAuthenticatedSession();
  const { data, error } = await supabase
    .from("session_notes")
    .select("id, appointment_id, ciphertext, iv, created_at")
    .eq("counsellor_id", user.id)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) fail(error);
  const notes: SessionNote[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    try {
      const { salt, ciphertext } = unpackNote(String(r.ciphertext));
      const text = await decryptJournal({ ciphertext, iv: String(r.iv), salt }, passphrase);
      notes.push({ id: String(r.id), appointmentId: String(r.appointment_id), text, createdAt: String(r.created_at) });
    } catch {
      throw new ApiError("Failed to decrypt session notes. Incorrect passphrase.", 401, "CRYPTO_DECRYPT_FAILED");
    }
  }
  return notes;
}
