/**
 * CONTRACT between the offline workers. Written by the lead; do not change names or
 * shapes without telling the lead. The outbox implementation (src/shared/lib/offline/outbox.ts,
 * useOutboxStatus.ts, useOnlineStatus.ts) implements these; UI code imports only from here
 * and from the index re-exports.
 */

export type OutboxKind = "risk_event" | "mood";

export interface OutboxStatus {
  /** Items waiting to be sent for this user (risk events + moods). */
  pending: number;
  riskEvents: number;
  moods: number;
  /** ISO time of the last successful flush, or null. */
  lastSyncAt: string | null;
  syncing: boolean;
}

/** Row to insert into public.risk_events when sent. id is a client-generated UUID so a replay is idempotent. */
export interface QueuedRiskEventRow {
  id: string;
  student_id: string;
  event_type: string;
  severity_level: "low" | "medium" | "high" | "crisis";
  trigger_source: "phq9_item9" | "chat_crisis" | "lexicon_match" | "manual" | "assessment_escalation";
  action_taken: string;
  /**
   * NEVER contains message content. For events raised offline:
   *   detected_at: ISO string, device time when the crisis was detected
   *   offline: true
   * created_at is NOT part of the row: the server sets it with now() so events cannot be backdated.
   */
  payload: { detected_at?: string; offline?: boolean; [key: string]: unknown };
}

/** Row to insert into public.mood_entries when sent (id is a client UUID). */
export interface QueuedMoodRow {
  id: string;
  student_id: string;
  [column: string]: unknown;
}

export interface FlushResult {
  sent: number;
  failed: number;
  /** Items owned by a different user than the one flushing; left untouched. */
  skipped: number;
}

export type LogoutChoice = "keep" | "discard";

export interface OutboxApi {
  enqueueRiskEvent(row: QueuedRiskEventRow): Promise<string>;
  enqueueMood(row: QueuedMoodRow): Promise<string>;
  getOutboxStatus(userId: string): Promise<OutboxStatus>;
  subscribeOutbox(userId: string, cb: (s: OutboxStatus) => void): () => void;
  /** Sends only items owned by userId; drains risk events before moods. */
  flushOutbox(userId: string): Promise<FlushResult>;
  /** Number of unsynced items for userId (used by the logout dialog). */
  hasUnsynced(userId: string): Promise<number>;
  /**
   * "keep": leave the encrypted items on this device (max 7 days).
   * "discard": delete this user's items. Nothing is ever deleted without one of these two calls.
   */
  resolveUnsyncedOnLogout(userId: string, choice: LogoutChoice): Promise<void>;
  /** Removes items older than maxAgeDays (default 7) for this user; returns how many. */
  purgeExpired(userId: string, maxAgeDays?: number): Promise<number>;
}
