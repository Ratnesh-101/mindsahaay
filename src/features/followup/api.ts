import { supabase } from "../../shared/lib/supabase";
import { getAuthenticatedSession } from "../../shared/lib/api/sessionHelper";
import { ApiError } from "../../shared/lib/api/errors";

export type FollowupStep = "open" | "acknowledged" | "contacted" | "handed_off" | "closed";
export type CheckbackAnswer = "okay" | "want_to_talk";

const STEPS: readonly string[] = ["open", "acknowledged", "contacted", "handed_off", "closed"];

export interface MyFollowup {
  eventId: string;
  severity: "high" | "crisis" | "medium" | "low";
  createdAt: string;
  currentStep: FollowupStep;
  currentStepAt: string | null;
}

export interface CheckbackPrompt {
  id: string;
  eventId: string;
  kind: "h24" | "h72";
  dueAt: string;
}

export interface HandoffOffer {
  id: string; // notification ID
  eventId: string;
  slotId: string;
  startsAt: string;
  counsellorAlias: string;
  createdAt: string;
}

export interface MyFollowupState {
  userId: string;
  events: MyFollowup[];
  /** Prompts that are due, unanswered, belong to an event that is not closed, and were not opted out. */
  prompts: CheckbackPrompt[];
  /** Active handoff offers from counsellors awaiting response. */
  offers: HandoffOffer[];
  /** True when at least one current care share lets a counsellor see risk alerts. */
  alertsShared: boolean;
  /** True when the student opted out of check-backs (server preference with local fallback). */
  optedOut: boolean;
}

/** Longest counsellor name shown to a student. */
export const ALIAS_MAX_LENGTH = 40;

/**
 * Counsellor display name from a notification. It is server data, so it is shown as plain text only:
 * control and bidirectional-override characters are removed, whitespace is collapsed and the length is capped.
 */
export function cleanAlias(raw: unknown): string {
  if (typeof raw !== "string") return "Campus Counsellor";
  const cleaned = Array.from(raw, (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    const control = code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    const invisible = (code >= 0x200b && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069) || code === 0xfeff;
    return control || invisible ? " " : ch;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ALIAS_MAX_LENGTH)
    .trim();
  return cleaned || "Campus Counsellor";
}

/** Closed follow-ups stay visible this long so the student can see the outcome. */
export const CLOSED_VISIBLE_MS = 7 * 24 * 3600 * 1000;

function fail(error: { message: string; code?: string }): never {
  throw new ApiError(error.message, 500, error.code ?? "DB_ERROR");
}

const optOutKey = (userId: string) => `mindsahaay-followup-optout:${userId}`;

/** ISO time the student opted out of future check-backs on this device, or null. Stored locally only. */
export function getCheckbackOptOut(userId: string): string | null {
  try {
    const v = localStorage.getItem(optOutKey(userId));
    return v && !Number.isNaN(Date.parse(v)) ? v : null;
  } catch {
    return null;
  }
}

export function setCheckbackOptOut(userId: string, optedOut: boolean, now: Date = new Date()): void {
  try {
    if (optedOut) localStorage.setItem(optOutKey(userId), now.toISOString());
    else localStorage.removeItem(optOutKey(userId));
  } catch {
    /* private mode: the preference simply does not persist */
  }
}

/** A prompt is hidden only if the student opted out before it was due. Already-due prompts stay answerable. */
export function isPromptHidden(dueAt: string, optOutAt: string | null): boolean {
  return optOutAt !== null && new Date(dueAt).getTime() >= new Date(optOutAt).getTime();
}

/** Updates server-side checkback opt-out preference, with offline localStorage fallback. */
export async function setServerCheckbackOptOut(optedOut: boolean): Promise<void> {
  const { user } = await getAuthenticatedSession();
  const previousLocal = getCheckbackOptOut(user.id);
  setCheckbackOptOut(user.id, optedOut);
  try {
    const { error } = await supabase.rpc("set_checkback_opt_out", { p_opt_out: optedOut });
    if (!error) return;
  } catch {
    /* fall back to direct update below */
  }
  const { error } = await supabase.from("profiles").update({ checkback_opt_out: optedOut }).eq("id", user.id);
  if (error) {
    // The server did not take the change, so do not leave a local preference that disagrees with it.
    try {
      if (previousLocal) localStorage.setItem(optOutKey(user.id), previousLocal);
      else localStorage.removeItem(optOutKey(user.id));
    } catch {
      /* ignore */
    }
    fail(error);
  }
}

/**
 * Loads only the signed-in student's own follow-ups, check-back prompts, warm handoff offers,
 * and server-side opt-out preference.
 * Every query is filtered by the student's id and Row Level Security enforces the same on the server.
 */
export async function fetchMyFollowups(now: Date = new Date()): Promise<MyFollowupState> {
  const { user } = await getAuthenticatedSession();

  const [queueRes, profileRes, promptsRes, answersRes, sharesRes, notifsRes] = await Promise.all([
    supabase
      .from("risk_queue")
      .select("id, severity_level, created_at, current_step, current_step_at, resolved")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("profiles")
      .select("checkback_opt_out")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("risk_checkback_prompts")
      .select("id, risk_event_id, kind, due_at")
      .eq("student_id", user.id)
      .order("due_at", { ascending: true }),
    supabase
      .from("risk_checkbacks")
      .select("prompt_id")
      .eq("student_id", user.id),
    supabase
      .from("care_shares")
      .select("scope, active, expires_at, revoked_at")
      .eq("student_id", user.id)
      .eq("active", true),
    supabase
      .from("notifications")
      .select("id, type, metadata, created_at, read")
      .eq("user_id", user.id)
      .eq("type", "handoff_offer")
      .eq("read", false)
      .order("created_at", { ascending: false }),
  ]);

  if (queueRes.error) fail(queueRes.error);
  if (promptsRes.error) fail(promptsRes.error);
  if (answersRes.error) fail(answersRes.error);
  if (sharesRes.error) fail(sharesRes.error);
  if (notifsRes.error) fail(notifsRes.error);

  const localOptOut = getCheckbackOptOut(user.id);
  const serverOptOut = Boolean(profileRes.data?.checkback_opt_out);
  const isOptedOut = serverOptOut || localOptOut !== null;

  if (localOptOut !== null && !serverOptOut) {
    try {
      await supabase.rpc("set_checkback_opt_out", { p_opt_out: true });
    } catch {
      /* offline or network error; will retry next time */
    }
  } else if (serverOptOut && localOptOut === null) {
    setCheckbackOptOut(user.id, true);
  }

  const events: MyFollowup[] = [];
  for (const r of (queueRes.data ?? []) as Record<string, unknown>[]) {
    if (typeof r.current_step !== "string" || !STEPS.includes(r.current_step)) continue;
    const step = r.current_step as FollowupStep;
    const at = typeof r.current_step_at === "string" ? r.current_step_at : null;
    if (step === "closed" && (!at || now.getTime() - new Date(at).getTime() > CLOSED_VISIBLE_MS)) continue;
    events.push({
      eventId: String(r.id),
      severity: r.severity_level as MyFollowup["severity"],
      createdAt: String(r.created_at),
      currentStep: step,
      currentStepAt: at,
    });
  }

  // Filter checkback prompts: hidden by the API if student opted out on server.
  // If only local offline timestamp exists, prompts due after opt-out are hidden.
  const answered = new Set(((answersRes.data ?? []) as Record<string, unknown>[]).map((a) => String(a.prompt_id)));
  const open = new Set(events.filter((e) => e.currentStep !== "closed").map((e) => e.eventId));
  const prompts: CheckbackPrompt[] = serverOptOut
    ? []
    : ((promptsRes.data ?? []) as Record<string, unknown>[])
        .map((p) => ({
          id: String(p.id),
          eventId: String(p.risk_event_id),
          kind: (p.kind === "h72" ? "h72" : "h24") as CheckbackPrompt["kind"],
          dueAt: String(p.due_at),
        }))
        .filter(
          (p) =>
            !answered.has(p.id) &&
            open.has(p.eventId) &&
            new Date(p.dueAt).getTime() <= now.getTime() &&
            !isPromptHidden(p.dueAt, localOptOut),
        );

  // Active warm handoff offers
  const offers: HandoffOffer[] = [];
  for (const n of (notifsRes.data ?? []) as Record<string, unknown>[]) {
    const meta = (n.metadata && typeof n.metadata === "object" ? n.metadata : {}) as Record<string, unknown>;
    if (meta.status === "declined" || meta.status === "accepted") continue;
    const createdTime = new Date(String(n.created_at)).getTime();
    if (now.getTime() - createdTime >= 24 * 3600 * 1000) continue; // expired (>24h)
    const startsAt = typeof meta.starts_at === "string" ? meta.starts_at : null;
    if (!startsAt || Number.isNaN(Date.parse(startsAt)) || new Date(startsAt).getTime() <= now.getTime()) continue; // past slot
    // An offer belongs to one event. Once that event is closed the offer is stale and cannot be accepted.
    const offerEventId = String(meta.risk_event_id ?? "");
    const owner = events.find((e) => e.eventId === offerEventId);
    if (owner?.currentStep === "closed") continue;
    offers.push({
      id: String(n.id),
      eventId: offerEventId,
      slotId: String(meta.slot_id ?? ""),
      startsAt,
      counsellorAlias: cleanAlias(meta.counsellor_alias),
      createdAt: String(n.created_at),
    });
  }

  const alertsShared = ((sharesRes.data ?? []) as Record<string, unknown>[]).some((s) => {
    const scope = (s.scope as string[] | null) ?? [];
    const current = s.active !== false && !s.revoked_at && (!s.expires_at || new Date(String(s.expires_at)).getTime() > now.getTime());
    return current && scope.includes("risk_events");
  });

  return { userId: user.id, events, prompts, offers, alertsShared, optedOut: isOptedOut };
}

/**
 * Records the student's answer. The database only lets a student answer their own prompt and an
 * answer can never close or lower an event: "want_to_talk" reopens it and notifies the counsellor.
 */
export async function answerCheckback(promptId: string, answer: CheckbackAnswer, eventId?: string): Promise<void> {
  const { user } = await getAuthenticatedSession();
  let riskEventId = eventId;
  if (!riskEventId) {
    const lookup = await supabase.from("risk_checkback_prompts").select("risk_event_id").eq("id", promptId).eq("student_id", user.id).single();
    if (lookup.error || !lookup.data) throw new ApiError("That check-back could not be found.", 404, "PROMPT_NOT_FOUND");
    riskEventId = String((lookup.data as Record<string, unknown>).risk_event_id);
  }
  const { error } = await supabase.from("risk_checkbacks").insert({ risk_event_id: riskEventId, prompt_id: promptId, student_id: user.id, answer });
  if (error) fail(error);
}

/** Accepts a counsellor's warm handoff offer, booking the session atomically. */
export async function acceptHandoffOffer(notificationId: string): Promise<void> {
  await getAuthenticatedSession();
  const { error } = await supabase.rpc("accept_handoff_offer", {
    p_notification_id: notificationId,
  });
  if (error) fail(error);
}

/** Declines a counsellor's warm handoff offer. */
export async function declineHandoffOffer(notificationId: string): Promise<void> {
  await getAuthenticatedSession();
  const { error } = await supabase.rpc("decline_handoff_offer", {
    p_notification_id: notificationId,
  });
  if (error) fail(error);
}
