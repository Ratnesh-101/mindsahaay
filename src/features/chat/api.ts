import { supabase } from "../../shared/lib/supabase";
import { getAuthenticatedSession } from "../../shared/lib/api/sessionHelper";
import { fetchActiveConsents } from "../../shared/lib/api/consents";
import { ApiError } from "../../shared/lib/api/errors";
import { enqueueRiskEvent } from "../../shared/lib/offline/outbox";
import type { QueuedRiskEventRow } from "../../shared/lib/offline/types";

/**
 * About the crisis-consent cache. It is a CONVENIENCE hint filled while online and it is NOT an
 * authority: nothing is sent, or withheld, because of what it says.
 *  - Offline, a crisis is always queued (fail open), whatever the cache holds, so a value changed
 *    in DevTools cannot make the app drop a crisis event.
 *  - The outbox re-checks crisis_intervention consent on the SERVER before any queued event leaves
 *    the device and drops the event when consent is not on file, so a cache tampered to "true"
 *    can never cause a send without that server-side check.
 * The record exposes no student id: one fixed key, a per-device random salt, a salted tag in place
 * of the id, and a timestamp so a stale answer (over 24 hours) is ignored.
 */
export const CONSENT_CACHE_KEY = "mindsahaay_consent_crisis";
/** Key prefix of the first version, which put the raw student id in the key. Removed when written. */
const LEGACY_CONSENT_CACHE_KEY_PREFIX = "mindsahaay_consent_crisis_";
export const CONSENT_CACHE_MAX_AGE_MS = 24 * 3600 * 1000;

interface ConsentCacheRecord {
  d: string;
  u: string;
  g: boolean;
  at: number;
}

/** Small non-cryptographic 53-bit hash (cyrb53). It only has to avoid storing the raw id. */
function tagFor(salt: string, userId: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const s = `${salt}:${userId}`;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function readConsentCache(): ConsentCacheRecord | null {
  try {
    const raw = localStorage.getItem(CONSENT_CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<ConsentCacheRecord> | null;
    if (!o || typeof o.d !== "string" || typeof o.u !== "string" || typeof o.g !== "boolean" || typeof o.at !== "number") return null;
    return o as ConsentCacheRecord;
  } catch {
    return null;
  }
}

/** The cached answer for this student, or false when missing, malformed, for someone else, or stale. Hint only. */
export function getCachedCrisisConsent(userId: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const rec = readConsentCache();
    if (!rec || rec.u !== tagFor(rec.d, userId)) return false;
    if (Date.now() - rec.at > CONSENT_CACHE_MAX_AGE_MS || rec.at > Date.now() + 60_000) return false;
    return rec.g;
  } catch {
    return false;
  }
}

export function setCachedCrisisConsent(userId: string, granted: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    const salt = readConsentCache()?.d ?? Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
    const rec: ConsentCacheRecord = { d: salt, u: tagFor(salt, userId), g: granted, at: Date.now() };
    localStorage.setItem(CONSENT_CACHE_KEY, JSON.stringify(rec));
    localStorage.removeItem(`${LEGACY_CONSENT_CACHE_KEY_PREFIX}${userId}`);
  } catch {
    // ignore
  }
}

/**
 * Refreshes the crisis-consent hint while the device is ONLINE (at sign-in and whenever the
 * connection returns). It is advisory only (see the note above CONSENT_CACHE_KEY): offline events are
 * queued regardless and consent is verified on the server at send time. Best effort: never throws.
 */
export async function warmCrisisConsentCache(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const { user } = await getAuthenticatedSession();
    const consents = await fetchActiveConsents();
    setCachedCrisisConsent(user.id, Boolean(consents.crisis_intervention));
  } catch {
    // Best effort: the cache simply stays as it was.
  }
}

/**
 * Logs a crisis interception without any message content (FR-CRISIS-07). Online, it is written only
 * when the server says the student gave the crisis_intervention consent. When the server cannot be
 * asked (offline, or the lookup failed) the event is queued and the outbox checks consent on the
 * server before sending it; the local consent cache is never consulted here.
 * When offline or when the insert call fails, queues the risk event into the offline outbox
 * with client ISO timestamp and returns "queued".
 * Failures are swallowed on purpose: the safety UI must never depend on this call.
 */
export async function logChatCrisisEvent(): Promise<boolean | "queued"> {
  try {
    const { user } = await getAuthenticatedSession();

    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

    // "unknown" means the server could not be asked (offline, or the lookup failed). The event is then
    // queued rather than dropped or sent: the outbox verifies consent on the server before sending.
    let consentUnknown = isOffline;
    if (!isOffline) {
      try {
        const consents = await fetchActiveConsents();
        const hasConsent = Boolean(consents.crisis_intervention);
        setCachedCrisisConsent(user.id, hasConsent);
        if (!hasConsent) return false;
      } catch {
        consentUnknown = true;
      }
    }
    const queueOfflineEvent = async (): Promise<"queued"> => {
      const queuedRow: QueuedRiskEventRow = {
        id: crypto.randomUUID(),
        student_id: user.id,
        event_type: "chat_crisis",
        severity_level: "crisis",
        trigger_source: "chat_crisis",
        action_taken: "crisis_card_shown",
        payload: {
          layer: "client_lexicon",
          detected_at: new Date().toISOString(),
          offline: true,
        },
      };
      await enqueueRiskEvent(queuedRow);
      return "queued";
    };

    if (consentUnknown) {
      return await queueOfflineEvent();
    }

    const { error } = await supabase.from("risk_events").insert({
      student_id: user.id,
      event_type: "chat_crisis",
      severity_level: "crisis",
      trigger_source: "chat_crisis",
      action_taken: "crisis_card_shown",
      payload: { layer: "client_lexicon" },
    });

    if (error) {
      return await queueOfflineEvent();
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * The student explicitly asks to be contacted by their counsellor. This creates a high-severity
 * risk event (no message content) that appears in the counsellor's queue when a care share exists.
 */
export async function requestCounsellorContact(): Promise<void> {
  const { user } = await getAuthenticatedSession();
  const { error } = await supabase.from("risk_events").insert({
    student_id: user.id,
    event_type: "counsellor_contact_requested",
    severity_level: "high",
    trigger_source: "manual",
    action_taken: "student_requested_counsellor_contact",
    payload: { channel: "chat" },
  });
  if (error) {
    throw new ApiError(error.message, 500, error.code);
  }
}
