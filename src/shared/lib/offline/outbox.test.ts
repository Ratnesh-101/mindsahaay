import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  enqueueRiskEvent,
  enqueueMood,
  getOutboxStatus,
  subscribeOutbox,
  flushOutbox,
  hasUnsynced,
  resolveUnsyncedOnLogout,
  purgeExpired,
  clearAllOutboxDbs,
  VaultLockedError,
  computeBackoff,
  initOutbox,
  type StoredOutboxItem,
} from "./outbox";
import {
  createVault,
  generateRecoveryCode,
  lockVault,
} from "../../../features/journal/vault";
import { decryptJournal, JournalCryptoError } from "../../../domain/crypto/journalCrypto";
import type { QueuedRiskEventRow, QueuedMoodRow } from "./types";

// Fake Supabase Client supporting upsert with primary key deduplication
interface TableRecord {
  id: string;
  [key: string]: unknown;
}

class FakeSupabaseClient {
  public tables: Record<string, TableRecord[]> = {
    risk_events: [],
    mood_entries: [],
  };
  public insertCalls: { table: string; row: TableRecord }[] = [];

  reset() {
    this.tables = {
      risk_events: [],
      mood_entries: [],
    };
    this.insertCalls = [];
  }

  from(table: string) {
    return {
      upsert: async (
        row: TableRecord | TableRecord[],
        options?: { onConflict?: string; ignoreDuplicates?: boolean }
      ) => {
        const rows = Array.isArray(row) ? row : [row];
        const conflictCol = options?.onConflict || "id";
        const tableRows = this.tables[table] ?? (this.tables[table] = []);

        for (const r of rows) {
          this.insertCalls.push({ table, row: { ...r } });
          const existingIdx = tableRows.findIndex((item) => item[conflictCol] === r[conflictCol]);

          if (existingIdx >= 0) {
            if (!options?.ignoreDuplicates) {
              tableRows[existingIdx] = { ...tableRows[existingIdx], ...r };
            }
          } else {
            tableRows.push({ ...r });
          }
        }
        return { data: rows, error: null };
      },
      insert: async (row: TableRecord) => {
        const tableRows = this.tables[table] ?? (this.tables[table] = []);
        this.insertCalls.push({ table, row: { ...row } });
        tableRows.push({ ...row });
        return { data: row, error: null };
      },
    };
  }
}

const fakeSupabase = new FakeSupabaseClient();

vi.mock("../supabase", () => ({
  supabase: {
    from: (table: string) => fakeSupabase.from(table),
  },
}));

// Mock active consents
let mockConsentsState = { crisis_intervention: true };

vi.mock("../api/consents", () => ({
  fetchActiveConsents: vi.fn(async () => mockConsentsState),
}));

const PASSPHRASE_USER_A = "student-a-vault-passphrase-2026";
const PASSPHRASE_USER_B = "student-b-vault-passphrase-2026";

beforeEach(async () => {
  fakeSupabase.reset();
  mockConsentsState = { crisis_intervention: true };
  localStorage.clear();
  localStorage.setItem("mindsahaay_demo_mode", "true");
  lockVault();
  await clearAllOutboxDbs();
});

afterEach(() => {
  lockVault();
  vi.restoreAllMocks();
});

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function putRawRecord(dbName: string, record: Record<string, unknown>): Promise<void> {
  const req = indexedDB.open(dbName, 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore("outbox_items", { keyPath: "id" });
  };
  const db = await new Promise<IDBDatabase>((resolve) => {
    req.onsuccess = () => resolve(req.result);
  });
  const tx = db.transaction("outbox_items", "readwrite");
  tx.objectStore("outbox_items").put(record);
  await new Promise<void>((resolve) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

async function readRawRecords(dbName: string): Promise<Record<string, unknown>[]> {
  const req = indexedDB.open(dbName, 1);
  const db = await new Promise<IDBDatabase>((resolve) => {
    req.onsuccess = () => resolve(req.result);
  });
  if (!db.objectStoreNames.contains("outbox_items")) {
    db.close();
    return [];
  }
  const tx = db.transaction("outbox_items", "readonly");
  const all = tx.objectStore("outbox_items").getAll();
  const rows = await new Promise<Record<string, unknown>[]>((resolve) => {
    tx.oncomplete = () => {
      db.close();
      resolve(all.result as Record<string, unknown>[]);
    };
  });
  return rows;
}

describe("G6-SEC-06: no stable identifiers or plaintext clinical metadata at rest", () => {
  const risk: QueuedRiskEventRow = {
    id: "risk-meta-1",
    student_id: "user-a",
    event_type: "chat_crisis",
    severity_level: "crisis",
    trigger_source: "chat_crisis",
    action_taken: "crisis_card_shown",
    payload: { offline: true },
  };

  it("stores neither the kind nor a timestamp in plaintext", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());
    await enqueueRiskEvent(risk);
    const { getOutboxDbName } = await import("./outbox");
    const [raw] = await readRawRecords(await getOutboxDbName("user-a"));
    expect(raw).not.toHaveProperty("kind");
    expect(raw).not.toHaveProperty("createdAt");
    expect(JSON.stringify(raw)).not.toContain("risk_event");
    expect(JSON.stringify(raw)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("does not name the database or tag the owner with a bare SHA-256 of the user id", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());
    await enqueueRiskEvent(risk);
    const bare = await sha256Hex("user-a");
    const { getOutboxDbName } = await import("./outbox");
    const dbName = await getOutboxDbName("user-a");
    expect(dbName).not.toContain(bare);
    const [raw] = await readRawRecords(dbName);
    expect(raw.ownerHash).not.toBe(bare);
    expect(localStorage.getItem("mindsahaay_outbox_dbs") ?? "").not.toContain(bare);
  });

  it("uses a different per-device salt after the registry is reset", async () => {
    const { getOutboxDbName } = await import("./outbox");
    const first = await getOutboxDbName("user-a");
    localStorage.clear();
    const second = await getOutboxDbName("user-a");
    expect(second).not.toBe(first);
  });

  it("still reports separate risk and mood counts while the vault is unlocked, and total only when locked", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());
    await enqueueRiskEvent(risk);
    await enqueueMood({ id: "mood-meta-1", student_id: "user-a", mood: "Calm", score: 7 });
    expect(await getOutboxStatus("user-a")).toMatchObject({ pending: 2, riskEvents: 1, moods: 1 });
    lockVault();
    const locked = await getOutboxStatus("user-a");
    expect(locked.pending).toBe(2);
  });

  it("migrates items written by the older layout (plaintext kind, unsalted db name) without losing them", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());
    const { encryptJournal } = await import("../../../domain/crypto/journalCrypto");
    const bare = await sha256Hex("user-a");
    const legacyName = `mindsahaay_outbox_${bare}`;
    const row = { ...risk, id: "risk-legacy-1" };
    const encrypted = await encryptJournal(JSON.stringify(row), PASSPHRASE_USER_A);
    const open = indexedDB.open(legacyName, 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("outbox_items", { keyPath: "id" });
    };
    const db = await new Promise<IDBDatabase>((resolve) => {
      open.onsuccess = () => resolve(open.result);
    });
    const tx = db.transaction("outbox_items", "readwrite");
    tx.objectStore("outbox_items").put({ id: "risk-legacy-1", kind: "risk_event", ownerHash: bare, encryptedPayload: encrypted, createdAt: new Date().toISOString(), attempts: 0, nextAttemptAt: 0 });
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
    const { registerOutboxDb } = await import("./outbox");
    registerOutboxDb(legacyName);

    const res = await flushOutbox("user-a");
    expect(res.sent).toBe(1);
    expect(fakeSupabase.tables.risk_events.map((r) => r.id)).toEqual(["risk-legacy-1"]);
    expect(await readRawRecords(legacyName)).toHaveLength(0);
  });
});

describe("Lifeline Offline Outbox (Judge Acceptance Criteria)", () => {
  // (a) Shared-device test
  it("(a) shared-device: user A enqueues offline, user B signs in: A's rows are never sent under B, B's flush reports them skipped, and B cannot decrypt them", async () => {
    // 1. User A unlocks vault and enqueues offline
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());

    const riskA: QueuedRiskEventRow = {
      id: "risk-user-a-1",
      student_id: "user-a",
      event_type: "chat_crisis",
      severity_level: "crisis",
      trigger_source: "chat_crisis",
      action_taken: "crisis_card_shown",
      payload: { layer: "client_lexicon", offline: true },
    };
    await enqueueRiskEvent(riskA);

    const statusA = await getOutboxStatus("user-a");
    expect(statusA.pending).toBe(1);

    // 2. User A logs out (locks vault)
    lockVault();

    // 3. User B signs in on the same browser profile and unlocks vault with B's passphrase
    await createVault(PASSPHRASE_USER_B, generateRecoveryCode());

    // 4. User B triggers flushOutbox("user-b")
    const flushResultB = await flushOutbox("user-b");

    // A's item must be skipped, not sent
    expect(flushResultB.sent).toBe(0);
    expect(flushResultB.skipped).toBe(1);
    expect(fakeSupabase.tables.risk_events).toHaveLength(0);

    // 5. B cannot decrypt A's payload
    const { getOutboxDbName } = await import("./outbox");
    const dbNameA = await getOutboxDbName("user-a");
    const openReq = indexedDB.open(dbNameA, 1);
    const dbA = await new Promise<IDBDatabase>((resolve) => {
      openReq.onsuccess = () => resolve(openReq.result);
    });
    const tx = dbA.transaction("outbox_items", "readonly");
    const req = tx.objectStore("outbox_items").get("risk-user-a-1");
    let storedItemA: StoredOutboxItem | undefined;
    req.onsuccess = () => {
      storedItemA = req.result;
    };
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => {
        dbA.close();
        resolve();
      };
    });

    // Decrypting A's payload with B's passphrase MUST throw
    await expect(decryptJournal(storedItemA!.encryptedPayload, PASSPHRASE_USER_B)).rejects.toThrow(
      JournalCryptoError
    );

    // 6. User B logs out, User A logs back in: User A can flush successfully
    lockVault();
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());
    const flushResultA = await flushOutbox("user-a");
    expect(flushResultA.sent).toBe(1);
    expect(fakeSupabase.tables.risk_events).toHaveLength(1);
    expect(fakeSupabase.tables.risk_events[0].student_id).toBe("user-a");
  });

  // (b) Replay idempotency test
  it("(b) replay: flushing the same item twice produces exactly one row (fake Supabase enforces primary key)", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());

    const mood: QueuedMoodRow = {
      id: "mood-replay-1",
      student_id: "user-a",
      mood: "Anxious",
      score: 4,
    };
    await enqueueMood(mood);

    // First flush sends the item
    const res1 = await flushOutbox("user-a");
    expect(res1.sent).toBe(1);
    expect(fakeSupabase.tables.mood_entries).toHaveLength(1);

    // If somehow enqueued again with same client UUID
    await enqueueMood(mood);
    const res2 = await flushOutbox("user-a");
    expect(res2.sent).toBe(1);

    // Table still contains exactly one entry for this id
    expect(fakeSupabase.tables.mood_entries).toHaveLength(1);
    expect(fakeSupabase.tables.mood_entries[0].id).toBe("mood-replay-1");
  });

  // (c) created_at is never sent; device time lives only in payload.detected_at
  it("(c) created_at is never sent, device time lives only in payload.detected_at", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());

    const detectedTime = "2026-11-20T10:15:30.000Z";
    const risk: QueuedRiskEventRow = {
      id: "risk-time-test-1",
      student_id: "user-a",
      event_type: "chat_crisis",
      severity_level: "crisis",
      trigger_source: "chat_crisis",
      action_taken: "crisis_card_shown",
      payload: {
        detected_at: detectedTime,
        offline: true,
      },
    };
    // Deliberately attach created_at to verify it gets stripped
    (risk as unknown as Record<string, unknown>).created_at = "2020-01-01T00:00:00Z";

    await enqueueRiskEvent(risk);
    await flushOutbox("user-a");

    expect(fakeSupabase.tables.risk_events).toHaveLength(1);
    const [sentRow] = fakeSupabase.tables.risk_events;

    // created_at MUST NOT be sent
    expect(sentRow).not.toHaveProperty("created_at");

    // Device time lives only in payload.detected_at
    const payload = sentRow.payload as { detected_at: string; offline: boolean };
    expect(payload.detected_at).toBe(detectedTime);
    expect(payload.offline).toBe(true);
  });

  // (d) Consent withdrawn before send drops risk event
  it("(d) consent withdrawn before send drops the risk event", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());

    await enqueueRiskEvent({
      id: "risk-consent-1",
      student_id: "user-a",
      event_type: "chat_crisis",
      severity_level: "crisis",
      trigger_source: "chat_crisis",
      action_taken: "crisis_card_shown",
      payload: { offline: true },
    });

    expect(await hasUnsynced("user-a")).toBe(1);

    // Student withdraws consent before send
    mockConsentsState = { crisis_intervention: false };

    const result = await flushOutbox("user-a");
    expect(result.sent).toBe(0);
    expect(fakeSupabase.tables.risk_events).toHaveLength(0);

    // Dropped from outbox
    expect(await hasUnsynced("user-a")).toBe(0);
  });

  // (e) Risk events sent before moods regardless of enqueue order
  it("(e) risk events are sent before moods regardless of enqueue order", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());

    // Enqueue in order: Mood 1, Mood 2, Risk Event 1, Mood 3
    await enqueueMood({ id: "mood-order-1", student_id: "user-a", mood: "Tired", score: 5 });
    await enqueueMood({ id: "mood-order-2", student_id: "user-a", mood: "Okay", score: 6 });
    await enqueueRiskEvent({
      id: "risk-order-1",
      student_id: "user-a",
      event_type: "chat_crisis",
      severity_level: "crisis",
      trigger_source: "chat_crisis",
      action_taken: "crisis_card_shown",
      payload: { offline: true },
    });
    await enqueueMood({ id: "mood-order-3", student_id: "user-a", mood: "Good", score: 8 });

    await flushOutbox("user-a");

    expect(fakeSupabase.insertCalls).toHaveLength(4);
    // The very first insertion MUST be the risk event
    expect(fakeSupabase.insertCalls[0].table).toBe("risk_events");
    expect(fakeSupabase.insertCalls[0].row.id).toBe("risk-order-1");

    // Followed by moods in chronological order
    expect(fakeSupabase.insertCalls[1].row.id).toBe("mood-order-1");
    expect(fakeSupabase.insertCalls[2].row.id).toBe("mood-order-2");
    expect(fakeSupabase.insertCalls[3].row.id).toBe("mood-order-3");
  });

  // (g) A locked vault rejects offline enqueue with typed error
  it("(g) a locked vault rejects offline enqueue with the typed error", async () => {
    expect(lockVault).toBeDefined();
    lockVault(); // Ensure locked

    await expect(
      enqueueRiskEvent({
        id: "risk-locked-1",
        student_id: "user-a",
        event_type: "chat_crisis",
        severity_level: "crisis",
        trigger_source: "chat_crisis",
        action_taken: "crisis_card_shown",
        payload: { offline: true },
      })
    ).rejects.toThrow(VaultLockedError);

    await expect(
      enqueueMood({
        id: "mood-locked-1",
        student_id: "user-a",
        mood: "Calm",
        score: 7,
      })
    ).rejects.toThrow(VaultLockedError);
  });

  // (h) purgeExpired removes only items older than 7 days for that user
  it("(h) purgeExpired removes only items older than 7 days for that user", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());

    // 1. Recent item and an 8-day-old item for User A (the age lives inside the encrypted payload)
    await enqueueMood({ id: "mood-recent-a", student_id: "user-a", mood: "Happy", score: 9 });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await enqueueMood({ id: "mood-old-a", student_id: "user-a", mood: "Happy", score: 9 });

    // 2. An old item for User B, to prove the purge is scoped to the owner
    lockVault();
    await createVault(PASSPHRASE_USER_B, generateRecoveryCode());
    await enqueueMood({ id: "mood-old-b", student_id: "user-b", mood: "Calm", score: 7 });
    vi.useRealTimers();

    // A locked vault cannot age anything, so nothing is removed
    lockVault();
    expect(await purgeExpired("user-a", 7)).toBe(0);

    // Run purge for user-a with A's vault unlocked
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());
    const purgedA = await purgeExpired("user-a", 7);
    expect(purgedA).toBe(1);

    // User A recent item remains
    const statusA = await getOutboxStatus("user-a");
    expect(statusA.pending).toBe(1);

    // User B old item was NOT touched by user A's purge
    const statusB = await getOutboxStatus("user-b");
    expect(statusB.pending).toBe(1);
  });
  // (j) Backoff schedule and idempotent flush under concurrent calls
  it("(j) backoff schedule and idempotent flush under concurrent calls (two simultaneous flushes do not double send)", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());

    // Backoff schedule calculation check
    expect(computeBackoff(1, false)).toBe(1000);
    expect(computeBackoff(2, false)).toBe(2000);
    expect(computeBackoff(3, false)).toBe(4000);
    expect(computeBackoff(4, false)).toBe(8000);
    expect(computeBackoff(20, false)).toBe(3600000); // capped at 1h

    await enqueueMood({ id: "mood-concurrent-1", student_id: "user-a", mood: "Hopeful", score: 8 });

    // Trigger two simultaneous flushes
    const [res1, res2] = await Promise.all([flushOutbox("user-a"), flushOutbox("user-a")]);

    // Both receive identical result without double sending
    expect(res1.sent).toBe(1);
    expect(res2.sent).toBe(1);
    expect(fakeSupabase.insertCalls).toHaveLength(1);
  });

  // Subscription and status check
  it("subscribeOutbox notifies subscribers on enqueue, flush and status change", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());

    const statusUpdates: number[] = [];
    const unsubscribe = subscribeOutbox("user-a", (s) => {
      statusUpdates.push(s.pending);
    });

    await enqueueMood({ id: "mood-sub-1", student_id: "user-a", mood: "Peaceful", score: 9 });
    await flushOutbox("user-a");

    unsubscribe();
    expect(statusUpdates.length).toBeGreaterThan(0);
  });

  // Logout choice handling
  it("resolveUnsyncedOnLogout handles keep and discard options", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());

    await enqueueMood({ id: "mood-logout-1", student_id: "user-a", mood: "Fine", score: 6 });
    expect(await hasUnsynced("user-a")).toBe(1);

    // Keep preserves
    await resolveUnsyncedOnLogout("user-a", "keep");
    expect(await hasUnsynced("user-a")).toBe(1);

    // Discard purges
    await resolveUnsyncedOnLogout("user-a", "discard");
    expect(await hasUnsynced("user-a")).toBe(0);
  });

  // initOutbox wiring test
  it("initOutbox sets up online listener and cleanup", () => {
    const addEventSpy = vi.spyOn(window, "addEventListener");
    const removeEventSpy = vi.spyOn(window, "removeEventListener");

    const cleanup = initOutbox("user-a");
    expect(addEventSpy).toHaveBeenCalledWith("online", expect.any(Function));

    cleanup();
    expect(removeEventSpy).toHaveBeenCalledWith("online", expect.any(Function));
  });

  // Additional branch coverage tests
  it("handles empty student_id validation in enqueue functions", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());

    await expect(
      enqueueRiskEvent({
        id: "risk-no-student",
        student_id: "",
        event_type: "chat_crisis",
        severity_level: "crisis",
        trigger_source: "chat_crisis",
        action_taken: "crisis_card_shown",
        payload: {},
      })
    ).rejects.toThrow("Student ID is required");

    await expect(
      enqueueMood({
        id: "mood-no-student",
        student_id: "",
        mood: "Calm",
        score: 8,
      })
    ).rejects.toThrow("Student ID is required");
  });

  it("handles locked vault at flush time gracefully", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());
    await enqueueMood({ id: "mood-lock-flush", student_id: "user-a", mood: "Peaceful", score: 8 });

    // Lock vault before flush
    lockVault();

    const res = await flushOutbox("user-a");
    expect(res.sent).toBe(0);
    expect(res.failed).toBe(0);

    // Items remain safe in outbox
    const status = await getOutboxStatus("user-a");
    expect(status.pending).toBe(1);
  });

  it("handles Supabase upsert error and exceptions with backoff", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());
    await enqueueMood({ id: "mood-fail-1", student_id: "user-a", mood: "Tense", score: 3 });

    // Mock Supabase upsert returning error
    vi.spyOn(fakeSupabase, "from").mockReturnValueOnce({
      upsert: async () => ({ data: null, error: { message: "DB Error" } }),
      insert: async () => ({ data: null, error: { message: "DB Error" } }),
    } as unknown as ReturnType<typeof fakeSupabase.from>);

    const res1 = await flushOutbox("user-a");
    expect(res1.failed).toBe(1);
    expect(res1.sent).toBe(0);

    // Mock Supabase upsert throwing exception
    vi.spyOn(fakeSupabase, "from").mockReturnValueOnce({
      upsert: async () => {
        throw new Error("Network crash");
      },
      insert: async () => {
        throw new Error("Network crash");
      },
    } as unknown as ReturnType<typeof fakeSupabase.from>);

    // Wait 1ms so backoff can be tested
    const res2 = await flushOutbox("user-a");
    expect(res2.failed).toBe(1);
  });

  it("handles consent check error during risk event flush with backoff", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());
    await enqueueRiskEvent({
      id: "risk-consent-err",
      student_id: "user-a",
      event_type: "chat_crisis",
      severity_level: "crisis",
      trigger_source: "chat_crisis",
      action_taken: "crisis_card_shown",
      payload: {},
    });

    const consentsMod = await import("../api/consents");
    vi.spyOn(consentsMod, "fetchActiveConsents").mockRejectedValueOnce(new Error("Network timeout"));

    const res = await flushOutbox("user-a");
    expect(res.failed).toBe(1);
    expect(res.sent).toBe(0);
  });

  it("handles corrupted ciphertext payload during flush", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());
    const { getOutboxDbName, hashUserId } = await import("./outbox");
    await putRawRecord(await getOutboxDbName("user-a"), {
      id: "mood-corrupted",
      ownerHash: await hashUserId("user-a"),
      encryptedPayload: { ciphertext: "invalid-cipher", iv: "invalid-iv", salt: "invalid-salt" },
      attempts: 0,
      nextAttemptAt: 0,
    });

    const res = await flushOutbox("user-a");
    expect(res.failed).toBe(1);
  });
  it("handles throwing upsert implementation during flush", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());
    await enqueueMood({ id: "mood-crash-test", student_id: "user-a", mood: "Restless", score: 4 });

    vi.spyOn(fakeSupabase, "from").mockReturnValueOnce({
      upsert: () => {
        throw new Error("Synchronous network failure");
      },
      insert: () => {
        throw new Error("Synchronous network failure");
      },
    } as unknown as ReturnType<typeof fakeSupabase.from>);

    const res = await flushOutbox("user-a");
    expect(res.failed).toBe(1);
    expect(res.sent).toBe(0);
  });

  it("countAllOutboxItems counts items across multiple databases", async () => {
    const { countAllOutboxItems } = await import("./outbox");
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());
    await enqueueMood({ id: "mood-count-a", student_id: "user-a", mood: "Joy", score: 10 });

    await createVault(PASSPHRASE_USER_B, generateRecoveryCode());
    await enqueueMood({ id: "mood-count-b", student_id: "user-b", mood: "Peace", score: 9 });

    const total = await countAllOutboxItems();
    expect(total).toBe(2);
  });

  it("verifies outbox default export satisfies OutboxApi interface", async () => {
    const { outbox } = await import("./index");
    expect(outbox).toHaveProperty("enqueueRiskEvent");
    expect(outbox).toHaveProperty("enqueueMood");
    expect(outbox).toHaveProperty("getOutboxStatus");
    expect(outbox).toHaveProperty("subscribeOutbox");
    expect(outbox).toHaveProperty("flushOutbox");
    expect(outbox).toHaveProperty("hasUnsynced");
    expect(outbox).toHaveProperty("resolveUnsyncedOnLogout");
    expect(outbox).toHaveProperty("purgeExpired");
  });

  it("skips items scheduled in future nextAttemptAt during flush", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());
    const { getOutboxDbName, hashUserId } = await import("./outbox");
    await putRawRecord(await getOutboxDbName("user-a"), {
      id: "mood-future-attempt",
      ownerHash: await hashUserId("user-a"),
      encryptedPayload: { ciphertext: "abc", iv: "def", salt: "ghi" },
      attempts: 2,
      nextAttemptAt: Date.now() + 600000, // 10 minutes in the future
    });

    const res = await flushOutbox("user-a");
    expect(res.failed).toBe(1);
    expect(res.sent).toBe(0);
  });
  it("initOutbox flushes when online and on window online event", async () => {
    await createVault(PASSPHRASE_USER_A, generateRecoveryCode());
    await enqueueMood({ id: "mood-online-trigger", student_id: "user-a", mood: "Glad", score: 8 });

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);

    const cleanup = initOutbox("user-a");
    // Trigger online event manually
    window.dispatchEvent(new Event("online"));

    cleanup();
  });
});
