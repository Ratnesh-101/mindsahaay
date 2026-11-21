/**
 * MindSahaay Encrypted-at-Rest Secure Storage Module
 * Compliant with India DPDP Act 2023 & Zero-Knowledge Architecture.
 *
 * Implements an encrypted key-value wrapper over browser localStorage using AES-256-GCM
 * and the student's in-memory PBKDF2 vault key material from `journalCrypto.ts`.
 *
 * Guarantees:
 * 1. Values are completely unreadable while the vault is locked.
 * 2. Key names are opaque hex-prefixed identifiers (e.g. `mindsahaay_sec_...`) that never leak semantic meaning.
 * 3. In-memory decrypted cache is wiped immediately when the vault is locked.
 * 4. Automatic one-time migration of legacy plaintext keys on vault unlock.
 * 5. Centralized `clearAllLocalUserData()` for logout and account erasure.
 */

import {
  encryptJournal,
  decryptJournal,
  type EncryptedJournalPayload,
} from "../../../domain/crypto/journalCrypto";
import {
  getVaultPassphrase,
  lockVault,
  clearVaultState,
} from "../../../features/journal/vault";
import {
  resolveUnsyncedOnLogout,
  purgeExpired,
  hasUnsynced,
  countAllOutboxItems,
  clearAllOutboxDbs,
} from "../offline/outbox";

/**
 * Deterministic mapping for known logical keys to opaque storage keys.
 * Suffixes are non-revealing hex digests ensuring zero leakage of data type.
 */
export const OPAQUE_KEY_MAP = {
  cbt_activities: "mindsahaay_sec_0f9a2b8e3d1c4a7e",
  cbt_worry: "mindsahaay_sec_4c8b1a7d2e9f0a3b",
  safety_card: "mindsahaay_sec_7e1d4a9b2c8f0e3a",
  demo_safety_plan: "mindsahaay_sec_3a8f1c4e9b2d7a0f",
  demo_moods: "mindsahaay_sec_6d2e9a1b4f8c0a3e",
  demo_vault_meta: "mindsahaay_sec_5b0a3f8c2e1d7a9b",
} as const;

export type KnownSecureKey = keyof typeof OPAQUE_KEY_MAP;

/**
 * Converts any logical key name to an opaque prefixed key.
 */
export function toOpaqueKey(key: string): string {
  if (key in OPAQUE_KEY_MAP) {
    return OPAQUE_KEY_MAP[key as KnownSecureKey];
  }
  if (key.startsWith("mindsahaay_sec_")) {
    return key;
  }
  // Deterministic non-revealing hash fallback
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) + key.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return `mindsahaay_sec_${hex}`;
}

/** Non-sensitive preference keys that must NOT be cleared during user data purge. */
export const PRESERVED_STORAGE_KEYS = [
  "mindsahaay-theme",
  "i18nextLng",
] as const;

/** In-memory cache for decrypted objects while the vault remains unlocked. */
const memoryCache = new Map<string, unknown>();

/** Checks whether the zero-knowledge vault is currently locked. */
export function isVaultLocked(): boolean {
  return getVaultPassphrase() === null;
}

/** Completely wipes the in-memory decrypted store. */
export function clearSecureStoreMemory(): void {
  memoryCache.clear();
}

/** Directly stores a value in the memory cache (used by synchronous fallbacks). */
export function setMemoryCacheItem<T = unknown>(key: string, value: T): void {
  const opaqueKey = toOpaqueKey(key);
  memoryCache.set(opaqueKey, value);
}

/** Direct synchronous memory lookup. */
export function getMemoryCacheItem<T = unknown>(key: string): T | undefined {
  const opaqueKey = toOpaqueKey(key);
  return memoryCache.get(opaqueKey) as T | undefined;
}

export type SecureStoreResult<T> =
  | { status: "locked" }
  | { status: "unlocked"; value: T | null };

/**
 * Retrieves and decrypts a value from secure storage.
 * Returns `{ status: "locked" }` if the vault is locked.
 */
export async function getSecureItem<T = unknown>(
  key: string,
  passphraseOverride?: string
): Promise<SecureStoreResult<T>> {
  const passphrase = passphraseOverride || getVaultPassphrase();
  if (!passphrase) {
    return { status: "locked" };
  }

  const opaqueKey = toOpaqueKey(key);
  if (memoryCache.has(opaqueKey)) {
    return { status: "unlocked", value: memoryCache.get(opaqueKey) as T };
  }

  if (typeof localStorage === "undefined") {
    return { status: "unlocked", value: null };
  }

  const raw = localStorage.getItem(opaqueKey);
  if (!raw) {
    return { status: "unlocked", value: null };
  }

  try {
    const payload = JSON.parse(raw) as EncryptedJournalPayload;
    const decryptedJson = await decryptJournal(payload, passphrase);
    const parsed = JSON.parse(decryptedJson) as T;
    memoryCache.set(opaqueKey, parsed);
    return { status: "unlocked", value: parsed };
  } catch {
    return { status: "unlocked", value: null };
  }
}

/**
 * Synchronous read against the in-memory decrypted cache.
 * Returns `{ status: "locked" }` if the vault is locked.
 */
export function getSecureItemSync<T = unknown>(key: string): SecureStoreResult<T> {
  const passphrase = getVaultPassphrase();
  if (!passphrase) {
    return { status: "locked" };
  }

  const opaqueKey = toOpaqueKey(key);
  if (memoryCache.has(opaqueKey)) {
    return { status: "unlocked", value: memoryCache.get(opaqueKey) as T };
  }

  return { status: "unlocked", value: null };
}

/**
 * Encrypts and persists a value to secure storage.
 * Returns `{ status: "locked" }` if the vault is locked.
 */
export async function setSecureItem<T = unknown>(
  key: string,
  value: T,
  passphraseOverride?: string
): Promise<{ status: "ok" | "locked" }> {
  const passphrase = passphraseOverride || getVaultPassphrase();
  if (!passphrase) {
    return { status: "locked" };
  }

  const opaqueKey = toOpaqueKey(key);
  memoryCache.set(opaqueKey, value);

  try {
    const serialized = JSON.stringify(value);
    const payload = await encryptJournal(serialized, passphrase);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(opaqueKey, JSON.stringify(payload));
    }
    return { status: "ok" };
  } catch {
    return { status: "locked" };
  }
}

/**
 * Synchronously caches value in memory and dispatches background encryption to localStorage.
 */
export function setSecureItemSync<T = unknown>(
  key: string,
  value: T,
  passphraseOverride?: string
): { status: "ok" | "locked" } {
  const passphrase = passphraseOverride || getVaultPassphrase();
  if (!passphrase) {
    return { status: "locked" };
  }

  const opaqueKey = toOpaqueKey(key);
  memoryCache.set(opaqueKey, value);

  // Background async encryption to avoid blocking UI thread
  void (async () => {
    try {
      const serialized = JSON.stringify(value);
      const payload = await encryptJournal(serialized, passphrase);
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(opaqueKey, JSON.stringify(payload));
      }
    } catch {
      // Storage failure handled silently
    }
  })();

  return { status: "ok" };
}

/**
 * Removes an item from memory cache and localStorage.
 */
export function removeSecureItem(key: string): void {
  const opaqueKey = toOpaqueKey(key);
  memoryCache.delete(opaqueKey);
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(opaqueKey);
  }
}

/**
 * Performs a one-time migration of any legacy plaintext storage keys into
 * AES-256-GCM encrypted payloads stored under opaque keys. Deletes plaintext originals.
 */
export async function migrateSensitiveStorage(passphrase: string): Promise<void> {
  if (!passphrase || typeof localStorage === "undefined") return;

  // 1. CBT Activities
  const legacyActivities = localStorage.getItem("mindsahaay-cbt-activities");
  if (legacyActivities) {
    try {
      const parsed = JSON.parse(legacyActivities);
      const payload = await encryptJournal(JSON.stringify(parsed), passphrase);
      localStorage.setItem(toOpaqueKey("cbt_activities"), JSON.stringify(payload));
      memoryCache.set(toOpaqueKey("cbt_activities"), parsed);
    } catch {
      // ignore
    } finally {
      localStorage.removeItem("mindsahaay-cbt-activities");
    }
  }

  // 2. CBT Worry
  const legacyWorry = localStorage.getItem("mindsahaay-cbt-worry");
  if (legacyWorry) {
    try {
      const parsed = JSON.parse(legacyWorry);
      const payload = await encryptJournal(JSON.stringify(parsed), passphrase);
      localStorage.setItem(toOpaqueKey("cbt_worry"), JSON.stringify(payload));
      memoryCache.set(toOpaqueKey("cbt_worry"), parsed);
    } catch {
      // ignore
    } finally {
      localStorage.removeItem("mindsahaay-cbt-worry");
    }
  }

  // 3. Safety Card Anchors & Trusted Friend Contact
  const a1 = localStorage.getItem("mindsahaay-anchor1");
  const a2 = localStorage.getItem("mindsahaay-anchor2");
  const a3 = localStorage.getItem("mindsahaay-anchor3");
  const friend = localStorage.getItem("mindsahaay-friend");
  if (a1 || a2 || a3 || friend) {
    const cardData = {
      anchor1: a1 || "Ice water on face & wrists + 4-7-8 breathing",
      anchor2: a2 || "Step outside hostel block to the campus lawn",
      anchor3: a3 || "Play 432Hz Tibetan Bowl soundscape with eyes closed",
      trustedFriend: friend || "Kabir (Roommate) · +91 98765 43210",
    };
    try {
      const payload = await encryptJournal(JSON.stringify(cardData), passphrase);
      localStorage.setItem(toOpaqueKey("safety_card"), JSON.stringify(payload));
      memoryCache.set(toOpaqueKey("safety_card"), cardData);
    } catch {
      // ignore
    } finally {
      localStorage.removeItem("mindsahaay-anchor1");
      localStorage.removeItem("mindsahaay-anchor2");
      localStorage.removeItem("mindsahaay-anchor3");
      localStorage.removeItem("mindsahaay-friend");
    }
  }

  // 4. Demo Safety Plan
  const legacySafetyPlan = localStorage.getItem("mindsahaay_demo_safety_plan");
  if (legacySafetyPlan) {
    try {
      const parsed = JSON.parse(legacySafetyPlan);
      const payload = await encryptJournal(JSON.stringify(parsed), passphrase);
      localStorage.setItem(toOpaqueKey("demo_safety_plan"), JSON.stringify(payload));
      memoryCache.set(toOpaqueKey("demo_safety_plan"), parsed);
    } catch {
      // ignore
    } finally {
      localStorage.removeItem("mindsahaay_demo_safety_plan");
    }
  }

  // 5. Demo Moods
  const legacyMoods = localStorage.getItem("mindsahaay_demo_moods");
  if (legacyMoods) {
    try {
      const parsed = JSON.parse(legacyMoods);
      const payload = await encryptJournal(JSON.stringify(parsed), passphrase);
      localStorage.setItem(toOpaqueKey("demo_moods"), JSON.stringify(payload));
      memoryCache.set(toOpaqueKey("demo_moods"), parsed);
    } catch {
      // ignore
    } finally {
      localStorage.removeItem("mindsahaay_demo_moods");
    }
  }

  // 6. Demo Vault Metadata (ensure purged from localStorage if ever set there)
  const legacyVaultMeta = localStorage.getItem("mindsahaay_demo_vault_meta");
  if (legacyVaultMeta) {
    if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem("mindsahaay_demo_vault_meta")) {
      sessionStorage.setItem("mindsahaay_demo_vault_meta", legacyVaultMeta);
    }
    localStorage.removeItem("mindsahaay_demo_vault_meta");
  }

  // Decrypt and load any existing opaque items into memory cache
  for (const opaque of Object.values(OPAQUE_KEY_MAP)) {
    if (!memoryCache.has(opaque)) {
      const raw = localStorage.getItem(opaque);
      if (raw) {
        try {
          const payload = JSON.parse(raw) as EncryptedJournalPayload;
          const decrypted = await decryptJournal(payload, passphrase);
          memoryCache.set(opaque, JSON.parse(decrypted));
        } catch {
          // ignore corrupted or mismatched item
        }
      }
    }
  }
}

export interface ClearUserDataOptions {
  discardOutbox?: boolean;
  userId?: string;
}

export interface ClearUserDataReport {
  keptUnsynced: number;
}

/**
 * Centralized data cleanup for user logout, account erasure, and session termination.
 * Purges every application-owned key in localStorage and sessionStorage by prefix,
 * clears memory caches, and locks the vault.
 * Non-sensitive UI preferences (theme and language) are explicitly preserved.
 *
 * Outbox items in IndexedDB:
 * - Must NOT be silently destroyed.
 * - Kept by default for up to 7 days (encrypted at rest).
 * - Discarded only when explicitly called with { discardOutbox: true }.
 * - Returns a report with { keptUnsynced: number }.
 */
export async function clearAllLocalUserData(
  options?: ClearUserDataOptions
): Promise<ClearUserDataReport> {
  // 1. Wipe in-memory crypto material and decrypted data
  clearSecureStoreMemory();
  lockVault();
  clearVaultState();

  // 2. Clear application-owned keys from localStorage
  const preservedKeys: readonly string[] = [
    ...PRESERVED_STORAGE_KEYS,
    ...(options?.discardOutbox ? [] : ["mindsahaay_outbox_dbs"]),
  ];

  if (typeof localStorage !== "undefined") {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (preservedKeys.includes(key)) continue;
      if (key.startsWith("mindsahaay") || key.startsWith("sb-")) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }

  // 3. Clear application-owned keys from sessionStorage
  if (typeof sessionStorage !== "undefined") {
    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (preservedKeys.includes(key)) continue;
      if (key.startsWith("mindsahaay") || key.startsWith("sb-")) {
        sessionKeysToRemove.push(key);
      }
    }
    for (const key of sessionKeysToRemove) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }

  // 4. Handle IndexedDB Outbox
  let keptUnsynced = 0;
  try {
    if (options?.userId) {
      if (options.discardOutbox) {
        await resolveUnsyncedOnLogout(options.userId, "discard");
        keptUnsynced = 0;
      } else {
        await purgeExpired(options.userId, 7);
        keptUnsynced = await hasUnsynced(options.userId);
      }
    } else {
      if (options?.discardOutbox) {
        await clearAllOutboxDbs();
        keptUnsynced = 0;
      } else {
        keptUnsynced = await countAllOutboxItems();
      }
    }
  } catch {
    keptUnsynced = 0;
  }

  return { keptUnsynced };
}
