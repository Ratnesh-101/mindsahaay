/**
 * MindSahaay Lifeline Offline Outbox
 * Zero-Knowledge, encrypted-at-rest client queue for crisis events and mood entries.
 *
 * Security & Privacy Specifications:
 * - Each outbox database name is derived from a salted SHA-256 of the student's ID (per-device random salt, never the plain ID).
 * - Every item is encrypted client-side using AES-256-GCM via the student's PBKDF2 vault key. The item kind and
 *   creation time are inside the encrypted payload, so the raw IndexedDB record shows neither.
 * - Outbox items remain encrypted and unreadable when the vault is locked.
 * - Multi-user shared device safety: User B cannot decrypt or flush User A's outbox items.
 * - Append-only integrity: student_id and row id are fixed at enqueue time and never rewritten.
 * - Never includes student message content in risk event payloads (FR-CRISIS-07).
 */

import {
  encryptJournal,
  decryptJournal,
  type EncryptedJournalPayload,
} from "../../../domain/crypto/journalCrypto";
import { getVaultPassphrase } from "../../../features/journal/vault";
import { supabase } from "../supabase";
import { fetchActiveConsents } from "../api/consents";
import type {
  OutboxApi,
  OutboxKind,
  OutboxStatus,
  QueuedRiskEventRow,
  QueuedMoodRow,
  FlushResult,
  LogoutChoice,
} from "./types";

export class VaultLockedError extends Error {
  constructor(message = "Vault is locked. Unlock your vault to save offline.") {
    super(message);
    this.name = "VaultLockedError";
  }
}

/**
 * What is stored in IndexedDB for one queued item. Only the minimum needed to route and retry:
 * the kind of item (risk event or mood) and every timestamp except the retry schedule live INSIDE
 * the encrypted payload (see OutboxEnvelope), so a person reading the raw database on a shared
 * computer cannot tell that a crisis event was queued or when.
 */
export interface StoredOutboxItem {
  id: string;
  /** Salted SHA-256 of the owner's user id (per-device salt). */
  ownerHash: string;
  /** Encrypted OutboxEnvelope. */
  encryptedPayload: EncryptedJournalPayload;
  attempts: number;
  /** Epoch ms. 0 until a send fails; then the backoff time. */
  nextAttemptAt: number;
}

/** The encrypted plaintext of a queued item. */
interface OutboxEnvelope {
  v: 2;
  kind: OutboxKind;
  createdAt: string;
  row: Record<string, unknown>;
}

/** Item layout written before the salt/envelope change; only ever read to migrate it. */
interface LegacyStoredOutboxItem {
  id: string;
  kind: OutboxKind;
  ownerHash: string;
  encryptedPayload: EncryptedJournalPayload;
  createdAt: string;
  attempts: number;
  nextAttemptAt: number;
}

const REGISTRY_STORAGE_KEY = "mindsahaay_outbox_dbs";
const DB_PREFIX = "mindsahaay_outbox_";

interface OutboxRegistry {
  /** Random per-device salt mixed into every database name and owner tag. */
  salt: string;
  dbs: string[];
}

let memoryRegistry: OutboxRegistry | null = null;

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The registry shares one localStorage key with the list of database names, because that key is
 * the one the sign-out cleanup deliberately keeps when the student chooses to keep queued items.
 * The salt must survive exactly as long as the databases do, or kept items could not be found again.
 */
function readRegistry(): OutboxRegistry {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Older format: a bare list of names. Adopt it under a fresh salt.
          const reg = { salt: randomHex(16), dbs: parsed.filter((n): n is string => typeof n === "string") };
          localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(reg));
          return reg;
        }
        if (parsed && typeof parsed === "object") {
          const o = parsed as Partial<OutboxRegistry>;
          if (typeof o.salt === "string" && o.salt.length >= 16) {
            return { salt: o.salt, dbs: Array.isArray(o.dbs) ? o.dbs.filter((n): n is string => typeof n === "string") : [] };
          }
        }
      }
      const reg = { salt: randomHex(16), dbs: [] as string[] };
      localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(reg));
      return reg;
    }
  } catch {
    // storage blocked: fall through to a salt that lasts for this page only
  }
  memoryRegistry ??= { salt: randomHex(16), dbs: [] };
  return memoryRegistry;
}

function writeRegistry(reg: OutboxRegistry): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(reg));
  } catch {
    // ignore
  }
}

async function sha256Hex(text: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Salted SHA-256 hex digest of the user id. The per-device random salt means the value cannot be
 * recomputed from a known student id elsewhere, and differs between devices.
 */
export async function hashUserId(userId: string): Promise<string> {
  return sha256Hex(`${readRegistry().salt}:${userId}`);
}

/** The unsalted hash used by the first version of the outbox. Only used to find and migrate old items. */
async function legacyHashUserId(userId: string): Promise<string> {
  return sha256Hex(userId);
}

/**
 * Derives the database name from the salted user hash.
 */
export async function getOutboxDbName(userId: string): Promise<string> {
  const hash = await hashUserId(userId);
  return `${DB_PREFIX}${hash}`;
}

export function registerOutboxDb(dbName: string): void {
  const reg = readRegistry();
  if (!reg.dbs.includes(dbName)) {
    reg.dbs.push(dbName);
    writeRegistry(reg);
  }
}

export async function listAllOutboxDbNames(): Promise<string[]> {
  const set = new Set<string>();
  readRegistry().dbs.forEach((name) => set.add(name));
  if (typeof indexedDB !== "undefined" && typeof indexedDB.databases === "function") {
    try {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name && db.name.startsWith(DB_PREFIX)) {
          set.add(db.name);
        }
      }
    } catch {
      // ignore
    }
  }
  return Array.from(set);
}

// ---------------------------------------------------------------------------
// Low-level IndexedDB Operations
// ---------------------------------------------------------------------------

function openDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in the current environment"));
      return;
    }
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("outbox_items")) {
        // No indexes on purpose: there is nothing in the clear worth indexing (kind and time are encrypted).
        db.createObjectStore("outbox_items", { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      // Version change blocked
    };
  });
}

function getAllRecords<T = StoredOutboxItem>(dbName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    openDb(dbName)
      .then((db) => {
        const tx = db.transaction("outbox_items", "readonly");
        const store = tx.objectStore("outbox_items");
        let result: T[] = [];
        const req = store.getAll();
        req.onsuccess = () => {
          result = req.result as T[];
        };
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      })
      .catch(reject);
  });
}

function putRecord<T extends { id: string }>(dbName: string, record: T): Promise<void> {
  return new Promise((resolve, reject) => {
    openDb(dbName)
      .then((db) => {
        const tx = db.transaction("outbox_items", "readwrite");
        const store = tx.objectStore("outbox_items");
        store.put(record);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      })
      .catch(reject);
  });
}

function deleteRecord(dbName: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    openDb(dbName)
      .then((db) => {
        const tx = db.transaction("outbox_items", "readwrite");
        const store = tx.objectStore("outbox_items");
        store.delete(id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      })
      .catch(reject);
  });
}

function clearStore(dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    openDb(dbName)
      .then((db) => {
        const tx = db.transaction("outbox_items", "readwrite");
        const store = tx.objectStore("outbox_items");
        store.clear();
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      })
      .catch(reject);
  });
}

function _deleteDb(dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      resolve();
      return;
    }
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

export async function countAllOutboxItems(): Promise<number> {
  const dbNames = await listAllOutboxDbNames();
  let total = 0;
  for (const name of dbNames) {
    try {
      const items = await getAllRecords(name);
      total += items.length;
    } catch {
      // ignore
    }
  }
  return total;
}

export async function clearAllOutboxDbs(): Promise<void> {
  const dbNames = await listAllOutboxDbNames();
  for (const name of dbNames) {
    try {
      await clearStore(name);
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Backoff & Jitter
// ---------------------------------------------------------------------------

/**
 * Calculates exponential backoff delay with jitter.
 * Schedule: base 1000ms * 2^(attempts - 1), capped at 1 hour (3600000ms).
 */
export function computeBackoff(attempts: number, withJitter = true): number {
  const base = Math.min(1000 * Math.pow(2, Math.max(0, attempts - 1)), 60 * 60 * 1000);
  const jitter = withJitter ? Math.floor(Math.random() * 500) : 0;
  return base + jitter;
}

// ---------------------------------------------------------------------------
// Encrypted envelope, in-memory metadata and legacy migration
// ---------------------------------------------------------------------------

/**
 * Item kind and age for items seen in this page session. Needed for the status counts and nothing
 * else; never persisted, so the raw database stays free of them. Items not in the map are only
 * categorised once the vault is unlocked and they have been decrypted.
 */
const metaCache = new Map<string, { kind: OutboxKind; createdAt: string }>();

async function sealItem(
  id: string,
  ownerHash: string,
  kind: OutboxKind,
  row: Record<string, unknown>,
  passphrase: string,
): Promise<StoredOutboxItem> {
  const createdAt = new Date().toISOString();
  const envelope: OutboxEnvelope = { v: 2, kind, createdAt, row };
  const encryptedPayload = await encryptJournal(JSON.stringify(envelope), passphrase);
  metaCache.set(id, { kind, createdAt });
  return { id, ownerHash, encryptedPayload, attempts: 0, nextAttemptAt: 0 };
}

async function openItem(item: StoredOutboxItem, passphrase: string): Promise<OutboxEnvelope> {
  const parsed: unknown = JSON.parse(await decryptJournal(item.encryptedPayload, passphrase));
  const e = parsed as Partial<OutboxEnvelope> | null;
  if (!e || e.v !== 2 || (e.kind !== "risk_event" && e.kind !== "mood") || typeof e.createdAt !== "string" || !e.row || typeof e.row !== "object") {
    throw new Error("Unrecognised outbox item");
  }
  metaCache.set(item.id, { kind: e.kind, createdAt: e.createdAt });
  return e as OutboxEnvelope;
}

const migrations = new Map<string, Promise<void>>();

/**
 * Moves items written by the first outbox layout (unsalted database name, plaintext kind and
 * time) into the current layout. Needs the unlocked vault because the kind and time must be
 * re-sealed inside the encrypted payload. Nothing is deleted until its new copy is stored.
 */
function migrateLegacyItems(userId: string, passphrase: string): Promise<void> {
  const running = migrations.get(userId);
  if (running) return running;
  const job = (async () => {
    const legacyHash = await legacyHashUserId(userId);
    const legacyName = `${DB_PREFIX}${legacyHash}`;
    if (!(await listAllOutboxDbNames()).includes(legacyName)) return;
    let legacyItems: LegacyStoredOutboxItem[];
    try {
      legacyItems = await getAllRecords<LegacyStoredOutboxItem>(legacyName);
    } catch {
      return;
    }
    const ownerHash = await hashUserId(userId);
    const newName = await getOutboxDbName(userId);
    registerOutboxDb(newName);
    let remaining = 0;
    for (const old of legacyItems) {
      if (old.ownerHash !== legacyHash) {
        remaining += 1;
        continue;
      }
      try {
        const row = JSON.parse(await decryptJournal(old.encryptedPayload, passphrase)) as Record<string, unknown>;
        const envelope: OutboxEnvelope = { v: 2, kind: old.kind, createdAt: old.createdAt, row };
        const encryptedPayload = await encryptJournal(JSON.stringify(envelope), passphrase);
        await putRecord<StoredOutboxItem>(newName, { id: old.id, ownerHash, encryptedPayload, attempts: old.attempts || 0, nextAttemptAt: old.nextAttemptAt || 0 });
        metaCache.set(old.id, { kind: old.kind, createdAt: old.createdAt });
        await deleteRecord(legacyName, old.id);
      } catch {
        remaining += 1; // left in place; it is retried the next time the vault is unlocked
      }
    }
    if (remaining === 0) {
      try {
        await _deleteDb(legacyName);
        const reg = readRegistry();
        reg.dbs = reg.dbs.filter((n) => n !== legacyName);
        writeRegistry(reg);
      } catch {
        // ignore
      }
    }
  })()
    .catch(() => undefined)
    .finally(() => {
      migrations.delete(userId);
    });
  migrations.set(userId, job);
  return job;
}

// ---------------------------------------------------------------------------
// Status & Subscriptions
// ---------------------------------------------------------------------------

const subscribers = new Map<string, Set<(s: OutboxStatus) => void>>();
const lastSyncMap = new Map<string, string>();
const syncingMap = new Map<string, boolean>();
const activeFlushes = new Map<string, Promise<FlushResult>>();

export function notifySubscribers(userId: string): void {
  const set = subscribers.get(userId);
  if (set && set.size > 0) {
    void getOutboxStatus(userId).then((status) => {
      set.forEach((cb) => {
        try {
          cb(status);
        } catch {
          // ignore callback error
        }
      });
    });
  }
}

export async function getOutboxStatus(userId: string): Promise<OutboxStatus> {
  const passphrase = getVaultPassphrase();
  if (passphrase) await migrateLegacyItems(userId, passphrase);
  const ownerHash = await hashUserId(userId);
  const dbName = await getOutboxDbName(userId);
  registerOutboxDb(dbName);

  let items: StoredOutboxItem[] = [];
  try {
    items = await getAllRecords(dbName);
  } catch {
    items = [];
  }

  let pending = 0;
  let riskEvents = 0;
  let moods = 0;
  for (const item of items) {
    if (item.ownerHash !== ownerHash) continue;
    pending += 1;
    let kind = metaCache.get(item.id)?.kind;
    if (!kind && passphrase) {
      try {
        kind = (await openItem(item, passphrase)).kind;
      } catch {
        // unreadable with this vault key: still pending, kind unknown
      }
    }
    if (kind === "risk_event") riskEvents += 1;
    else if (kind === "mood") moods += 1;
  }

  return {
    pending,
    riskEvents,
    moods,
    lastSyncAt: lastSyncMap.get(userId) ?? null,
    syncing: syncingMap.get(userId) ?? false,
  };
}

export function subscribeOutbox(userId: string, cb: (s: OutboxStatus) => void): () => void {
  if (!subscribers.has(userId)) {
    subscribers.set(userId, new Set());
  }
  const set = subscribers.get(userId)!;
  set.add(cb);

  // Send immediate initial push
  void getOutboxStatus(userId).then((status) => {
    if (set.has(cb)) {
      cb(status);
    }
  });

  return () => {
    set.delete(cb);
    if (set.size === 0) {
      subscribers.delete(userId);
    }
  };
}

// ---------------------------------------------------------------------------
// Enqueue Operations
// ---------------------------------------------------------------------------

export async function enqueueRiskEvent(row: QueuedRiskEventRow): Promise<string> {
  const passphrase = getVaultPassphrase();
  if (!passphrase) {
    throw new VaultLockedError("Vault is locked. Unlock your vault to save offline.");
  }

  const studentId = row.student_id;
  if (!studentId) {
    throw new Error("Student ID is required to enqueue a risk event.");
  }

  const id = row.id || crypto.randomUUID();
  const ownerHash = await hashUserId(studentId);
  const dbName = await getOutboxDbName(studentId);
  registerOutboxDb(dbName);

  // Strip created_at if present; enforce detected_at and offline in payload
  const { created_at: _c, ...rowWithoutCreatedAt } = row as unknown as Record<string, unknown>;
  const payload = {
    ...((row.payload as Record<string, unknown>) || {}),
    detected_at: row.payload?.detected_at || new Date().toISOString(),
    offline: true,
  };

  const finalRow: QueuedRiskEventRow = {
    ...(rowWithoutCreatedAt as unknown as QueuedRiskEventRow),
    id,
    student_id: studentId,
    payload,
  };

  const serialized = finalRow as unknown as Record<string, unknown>;
  const record = await sealItem(id, ownerHash, "risk_event", serialized, passphrase);

  await putRecord(dbName, record);
  notifySubscribers(studentId);
  return id;
}

export async function enqueueMood(row: QueuedMoodRow): Promise<string> {
  const passphrase = getVaultPassphrase();
  if (!passphrase) {
    throw new VaultLockedError("Vault is locked. Unlock your vault to save offline.");
  }

  const studentId = row.student_id;
  if (!studentId) {
    throw new Error("Student ID is required to enqueue a mood entry.");
  }

  const id = row.id || crypto.randomUUID();
  const ownerHash = await hashUserId(studentId);
  const dbName = await getOutboxDbName(studentId);
  registerOutboxDb(dbName);

  // Strip created_at if present: server sets it
  const { created_at: _c, ...rowWithoutCreatedAt } = row as Record<string, unknown>;
  const finalRow: QueuedMoodRow = {
    ...(rowWithoutCreatedAt as QueuedMoodRow),
    id,
    student_id: studentId,
  };

  const serialized = finalRow as unknown as Record<string, unknown>;
  const record = await sealItem(id, ownerHash, "mood", serialized, passphrase);

  await putRecord(dbName, record);
  notifySubscribers(studentId);
  return id;
}

// ---------------------------------------------------------------------------
// Drain & Flush Operations
// ---------------------------------------------------------------------------

export async function flushOutbox(userId: string): Promise<FlushResult> {
  if (activeFlushes.has(userId)) {
    return activeFlushes.get(userId)!;
  }

  const flushPromise = (async () => {
    syncingMap.set(userId, true);
    notifySubscribers(userId);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    try {
      const userHash = await hashUserId(userId);
      const userDbName = await getOutboxDbName(userId);
      registerOutboxDb(userDbName);

      // 0. Items from the first outbox layout move into this user's current database (needs the vault).
      const unlocked = getVaultPassphrase();
      if (unlocked) await migrateLegacyItems(userId, unlocked);

      // 1. Scan other outbox databases on this browser profile (shared-device safety)
      const allDbs = await listAllOutboxDbNames();
      for (const otherDb of allDbs) {
        if (otherDb !== userDbName) {
          try {
            const otherItems = await getAllRecords(otherDb);
            skipped += otherItems.length;
          } catch {
            // ignore unreadable foreign DB
          }
        }
      }

      // 2. Fetch records in this user's DB
      let userRecords: StoredOutboxItem[] = [];
      try {
        userRecords = await getAllRecords(userDbName);
      } catch {
        userRecords = [];
      }

      // Filter: only items belonging to this user
      const ownRecords: StoredOutboxItem[] = [];
      for (const item of userRecords) {
        if (item.ownerHash !== userHash) {
          skipped += 1;
        } else {
          ownRecords.push(item);
        }
      }

      if (ownRecords.length === 0) {
        return { sent, failed, skipped };
      }

      // Check if vault is unlocked
      const passphrase = getVaultPassphrase();
      if (!passphrase) {
        // Vault is locked: cannot decrypt own records. Leave them untouched.
        return { sent, failed, skipped };
      }

      // 3. Open each eligible item (kind and time are inside the encrypted payload), then drain
      // risk events before moods, FIFO by creation time within each kind.
      type Ready = { item: StoredOutboxItem; envelope: OutboxEnvelope };
      const ready: Ready[] = [];
      for (const item of ownRecords) {
        // Check backoff schedule (the only schedule data kept in the clear)
        if (item.nextAttemptAt && item.nextAttemptAt > Date.now()) {
          failed += 1;
          continue;
        }
        try {
          ready.push({ item, envelope: await openItem(item, passphrase) });
        } catch {
          // Corrupted or wrong passphrase
          failed += 1;
        }
      }
      ready.sort((a, b) => {
        const priorityA = a.envelope.kind === "risk_event" ? 0 : 1;
        const priorityB = b.envelope.kind === "risk_event" ? 0 : 1;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return new Date(a.envelope.createdAt).getTime() - new Date(b.envelope.createdAt).getTime();
      });

      // 4. Process each own record
      for (const { item, envelope } of ready) {
        // Re-check consent at SEND time for risk events. This server-side check is the only thing
        // that lets a queued crisis event leave the device; nothing cached locally can replace it.
        if (envelope.kind === "risk_event") {
          let hasConsent = false;
          try {
            const consents = await fetchActiveConsents();
            hasConsent = Boolean(consents.crisis_intervention);
          } catch {
            // Cannot verify consent right now (e.g. network/auth error)
            item.attempts = (item.attempts || 0) + 1;
            item.nextAttemptAt = Date.now() + computeBackoff(item.attempts);
            await putRecord(userDbName, item);
            failed += 1;
            continue;
          }

          if (!hasConsent) {
            // Consent was withdrawn (or never given)! Drop item from outbox with local log
            console.warn(`[outbox] Dropping queued risk event ${item.id}: crisis_intervention consent is not on file.`);
            await deleteRecord(userDbName, item.id);
            metaCache.delete(item.id);
            continue;
          }
        }

        // Strip created_at: the server sets it with now() so events cannot be backdated
        const { created_at: _c, ...payloadToSend } = envelope.row;

        const tableName = envelope.kind === "risk_event" ? "risk_events" : "mood_entries";

        try {
          const { error } = await supabase
            .from(tableName)
            .upsert(payloadToSend, { onConflict: "id", ignoreDuplicates: true });

          if (error) {
            item.attempts = (item.attempts || 0) + 1;
            item.nextAttemptAt = Date.now() + computeBackoff(item.attempts);
            await putRecord(userDbName, item);
            failed += 1;
          } else {
            await deleteRecord(userDbName, item.id);
            metaCache.delete(item.id);
            sent += 1;
          }
        } catch {
          item.attempts = (item.attempts || 0) + 1;
          item.nextAttemptAt = Date.now() + computeBackoff(item.attempts);
          await putRecord(userDbName, item);
          failed += 1;
        }
      }

      if (sent > 0) {
        lastSyncMap.set(userId, new Date().toISOString());
      }

      return { sent, failed, skipped };
    } finally {
      syncingMap.set(userId, false);
      activeFlushes.delete(userId);
      notifySubscribers(userId);
    }
  })();

  activeFlushes.set(userId, flushPromise);
  return flushPromise;
}

// ---------------------------------------------------------------------------
// Lifecycle & Purge
// ---------------------------------------------------------------------------

export async function hasUnsynced(userId: string): Promise<number> {
  const status = await getOutboxStatus(userId);
  return status.pending;
}

export async function resolveUnsyncedOnLogout(userId: string, choice: LogoutChoice): Promise<void> {
  if (choice === "discard") {
    const dbName = await getOutboxDbName(userId);
    try {
      await clearStore(dbName);
    } catch {
      // ignore
    }
    notifySubscribers(userId);
  } else if (choice === "keep") {
    // Leave encrypted items on device; purge expired older than 7 days
    await purgeExpired(userId, 7);
  }
}

export async function purgeExpired(userId: string, maxAgeDays = 7): Promise<number> {
  // The creation time is inside the encrypted payload, so ageing items needs the unlocked vault.
  // With a locked vault nothing can be aged and nothing is removed; the next unlocked start purges.
  const passphrase = getVaultPassphrase();
  if (!passphrase) return 0;
  await migrateLegacyItems(userId, passphrase);
  const ownerHash = await hashUserId(userId);
  const dbName = await getOutboxDbName(userId);
  let items: StoredOutboxItem[] = [];
  try {
    items = await getAllRecords(dbName);
  } catch {
    return 0;
  }

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let purged = 0;

  for (const item of items) {
    if (item.ownerHash !== ownerHash) continue;
    let createdAt = metaCache.get(item.id)?.createdAt;
    if (!createdAt) {
      try {
        createdAt = (await openItem(item, passphrase)).createdAt;
      } catch {
        continue; // unreadable: age unknown, leave it
      }
    }
    const createdTime = new Date(createdAt).getTime();
    if (!isNaN(createdTime) && createdTime < cutoff) {
      try {
        await deleteRecord(dbName, item.id);
        metaCache.delete(item.id);
        purged += 1;
      } catch {
        // ignore
      }
    }
  }

  if (purged > 0) {
    notifySubscribers(userId);
  }
  return purged;
}

/**
 * Initializes outbox sync triggers:
 * 1. Purges items older than 7 days on start.
 * 2. Triggers an initial flush if online.
 * 3. Registers Background Sync if supported.
 * 4. Listens for window 'online' event to trigger automatic flush.
 * Returns a cleanup unsubscribe function.
 */
export function initOutbox(userId: string): () => void {
  void purgeExpired(userId, 7).catch(() => {});

  if (typeof navigator !== "undefined" && navigator.onLine) {
    void flushOutbox(userId).catch(() => {});
  }

  // Attempt background sync registration
  import("./registerBackgroundSync")
    .then((m) => m.registerBackgroundSync())
    .catch(() => {});

  const handleOnline = () => {
    void flushOutbox(userId).catch(() => {});
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
  }

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
    }
  };
}

export const outbox: OutboxApi = {
  enqueueRiskEvent,
  enqueueMood,
  getOutboxStatus,
  subscribeOutbox,
  flushOutbox,
  hasUnsynced,
  resolveUnsyncedOnLogout,
  purgeExpired,
};

export default outbox;
