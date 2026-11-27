/**
 * Encrypted blob sync for the three slots that follow a student across devices:
 * CBT activities, worry time and safety-card anchors.
 *
 * How it works:
 * - The local encrypted write (secureStore) always happens first. The SAME ciphertext that was just
 *   written to localStorage is then pushed to `public.encrypted_blobs` through the `put_blob` RPC.
 *   The server only ever sees ciphertext, iv and salt. It cannot read the data.
 * - A failed, offline or not-yet-possible push marks the slot "dirty". The dirty list and the known
 *   server versions are kept in one localStorage key as opaque slot ids and numbers only. No plaintext.
 * - Dirty slots are retried after unlock, when the browser comes back online, and after the next write.
 * - On unlock, newer server copies are pulled. If the server version moved on (VERSION_CONFLICT on a push,
 *   or a newer server version found while local edits are waiting), the server copy wins and the UI is
 *   told so through the `conflict` flag.
 * - Preview/demo mode never syncs. Signing out wipes the local copy, the server copy stays.
 */

import { supabase } from "../supabase";
import { isDemoModeActive } from "../../../features/auth/demoMode";
import {
  OPAQUE_KEY_MAP,
  SYNCED_KEYS,
  applyRemotePayload,
  getStoredPayload,
  type SyncedKey,
} from "./secureStore";
import { getVaultPassphrase } from "../../../features/journal/vault";

export const SYNC_META_KEY = "mindsahaay_sync_meta";

export type SyncStatus = "synced" | "pending" | "off";

export interface SyncSnapshot {
  status: SyncStatus;
  /** Bumped whenever a pull replaced local data, so screens can reload what they show. */
  revision: number;
  /** True when a newer copy from another device replaced this device's copy. */
  conflict: boolean;
}

interface SyncMeta {
  versions: Record<string, number>;
  dirty: string[];
}

interface RpcResult {
  data: unknown;
  error: { message?: string; code?: string } | null;
}

interface BlobRow {
  slot: string;
  ciphertext: string;
  iv: string;
  salt: string;
  version: number;
}

const listeners = new Set<() => void>();
const writeSeq = new Map<SyncedKey, number>();
const conflicts = new Set<SyncedKey>();
const revisions = new Map<SyncedKey, number>();
const pullFailed = new Set<SyncedKey>();
const snapshots = new Map<SyncedKey, SyncSnapshot>();
let chain: Promise<unknown> = Promise.resolve();

function slotId(key: SyncedKey): string {
  return OPAQUE_KEY_MAP[key];
}

function keyForSlot(id: string): SyncedKey | null {
  return SYNCED_KEYS.find((k) => OPAQUE_KEY_MAP[k] === id) ?? null;
}

function readMeta(): SyncMeta {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SYNC_META_KEY) : null;
    if (!raw) return { versions: {}, dirty: [] };
    const parsed = JSON.parse(raw) as Partial<SyncMeta>;
    const versions: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed.versions ?? {})) {
      if (typeof v === "number" && Number.isInteger(v) && v >= 0) versions[k] = v;
    }
    const dirty = Array.isArray(parsed.dirty) ? parsed.dirty.filter((d): d is string => typeof d === "string") : [];
    return { versions, dirty };
  } catch {
    return { versions: {}, dirty: [] };
  }
}

function writeMeta(meta: SyncMeta): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    // The flags could not be stored. The in-memory status below still reflects reality for this tab.
  }
}

function setDirty(key: SyncedKey, dirty: boolean): void {
  const meta = readMeta();
  const id = slotId(key);
  const has = meta.dirty.includes(id);
  if (dirty && !has) meta.dirty.push(id);
  if (!dirty && has) meta.dirty = meta.dirty.filter((d) => d !== id);
  writeMeta(meta);
}

function isDirty(key: SyncedKey): boolean {
  return readMeta().dirty.includes(slotId(key));
}

function setVersion(key: SyncedKey, version: number): void {
  const meta = readMeta();
  meta.versions[slotId(key)] = version;
  writeMeta(meta);
}

function knownVersion(key: SyncedKey): number {
  return readMeta().versions[slotId(key)] ?? 0;
}

function computeStatus(key: SyncedKey): SyncStatus {
  if (isDemoModeActive()) return "off";
  return isDirty(key) || pullFailed.has(key) ? "pending" : "synced";
}

/** Updates the cached snapshot. Returns true when it changed. Never notifies. */
function refresh(key: SyncedKey): boolean {
  const next: SyncSnapshot = {
    status: computeStatus(key),
    revision: revisions.get(key) ?? 0,
    conflict: conflicts.has(key),
  };
  const prev = snapshots.get(key);
  if (prev && prev.status === next.status && prev.revision === next.revision && prev.conflict === next.conflict) return false;
  snapshots.set(key, next);
  return true;
}

function publish(key: SyncedKey): void {
  if (refresh(key)) listeners.forEach((l) => l());
}

/** Stable snapshot for useSyncExternalStore (same object until something changes). Safe to call during render. */
export function getSyncSnapshot(key: SyncedKey): SyncSnapshot {
  refresh(key);
  return snapshots.get(key) as SyncSnapshot;
}

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Hides the "newer copy from another device" notice. */
export function acknowledgeConflict(key: SyncedKey): void {
  conflicts.delete(key);
  publish(key);
}

/** Clears in-memory sync state (sign-out). localStorage flags are wiped by clearAllLocalUserData. */
export function resetRemoteSyncMemory(): void {
  writeSeq.clear();
  conflicts.clear();
  revisions.clear();
  pullFailed.clear();
  snapshots.clear();
  listeners.forEach((l) => l());
}

function online(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.user) return null;
    return data.session.user.id;
  } catch {
    return null;
  }
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

async function fetchServerRow(key: SyncedKey, userId: string): Promise<BlobRow | null | "error"> {
  try {
    const res = (await supabase
      .from("encrypted_blobs")
      .select("slot, ciphertext, iv, salt, version")
      .eq("user_id", userId)
      .eq("slot", slotId(key))
      .maybeSingle()) as { data: BlobRow | null; error: unknown };
    if (res.error) return "error";
    return res.data ?? null;
  } catch {
    return "error";
  }
}

/** Replaces the local copy with the server copy. Returns false if it could not be applied. */
async function adoptServerRow(key: SyncedKey, row: BlobRow, passphrase: string | null, flagConflict: boolean): Promise<boolean> {
  const ok = await applyRemotePayload(key, { ciphertext: row.ciphertext, iv: row.iv, salt: row.salt }, passphrase);
  if (!ok) return false;
  setVersion(key, row.version);
  setDirty(key, false);
  pullFailed.delete(key);
  revisions.set(key, (revisions.get(key) ?? 0) + 1);
  if (flagConflict) conflicts.add(key);
  return true;
}

async function pushOne(key: SyncedKey, passphrase: string | null): Promise<void> {
  if (isDemoModeActive()) return;
  if (!isDirty(key)) {
    publish(key);
    return;
  }
  const stored = getStoredPayload(key);
  if (!stored) {
    // Nothing local to push (for example after sign-out). Do not keep a dangling flag.
    setDirty(key, false);
    publish(key);
    return;
  }
  if (!online()) {
    publish(key);
    return;
  }
  const userId = await currentUserId();
  if (!userId) {
    publish(key);
    return;
  }

  const seqAtStart = writeSeq.get(key) ?? 0;
  let result: RpcResult;
  try {
    result = (await supabase.rpc("put_blob", {
      p_slot: slotId(key),
      p_ciphertext: stored.ciphertext,
      p_iv: stored.iv,
      p_salt: stored.salt,
      p_expected_version: knownVersion(key),
    })) as RpcResult;
  } catch {
    publish(key);
    return;
  }

  if (result.error) {
    if (String(result.error.message ?? "").includes("VERSION_CONFLICT")) {
      const row = await fetchServerRow(key, userId);
      if (row && row !== "error") {
        if (!(await adoptServerRow(key, row, passphrase ?? getVaultPassphrase(), true))) {
          // The newer server copy cannot be opened with this passphrase. Keep local data and keep waiting.
          pullFailed.add(key);
        }
      }
    }
    publish(key);
    return;
  }

  const newVersion = typeof result.data === "number" ? result.data : Number(result.data);
  if (Number.isInteger(newVersion) && newVersion > 0) setVersion(key, newVersion);
  if ((writeSeq.get(key) ?? 0) === seqAtStart) {
    setDirty(key, false);
    pullFailed.delete(key);
    publish(key);
  } else {
    // The student saved again while this push was in flight. Push the newer ciphertext too.
    publish(key);
    await pushOne(key, passphrase);
  }
}

async function pullOne(key: SyncedKey, passphrase: string | null): Promise<void> {
  const userId = await currentUserId();
  if (!userId || !online()) {
    pullFailed.add(key);
    publish(key);
    return;
  }
  const row = await fetchServerRow(key, userId);
  if (row === "error") {
    pullFailed.add(key);
    publish(key);
    return;
  }
  if (row === null) {
    // Server has nothing yet. Anything stored locally (including data migrated from older versions) must go up.
    pullFailed.delete(key);
    if (getStoredPayload(key)) setDirty(key, true);
    publish(key);
    return;
  }
  const local = knownVersion(key);
  if (row.version > local) {
    const hadLocalEdits = isDirty(key);
    const adopted = await adoptServerRow(key, row, passphrase, hadLocalEdits);
    if (!adopted) pullFailed.add(key);
  } else {
    pullFailed.delete(key);
  }
  publish(key);
}

/** Pushes every slot that is waiting. Safe to call at any time. */
export function flushDirty(passphrase?: string | null): Promise<void> {
  if (isDemoModeActive()) return Promise.resolve();
  return enqueue(async () => {
    for (const key of SYNCED_KEYS) {
      if (isDirty(key)) await pushOne(key, passphrase ?? null);
    }
  });
}

/** Called by secureStore right after the encrypted local write of a synced slot succeeded. */
export function onLocalWrite(key: SyncedKey): Promise<void> {
  if (isDemoModeActive()) return Promise.resolve();
  writeSeq.set(key, (writeSeq.get(key) ?? 0) + 1);
  conflicts.delete(key);
  setDirty(key, true);
  publish(key);
  return enqueue(() => pushOne(key, null));
}

/** Called by secureStore when the vault unlocks: pull newer server copies, then push what is waiting. */
export function syncOnUnlock(passphrase: string): Promise<void> {
  if (isDemoModeActive()) return Promise.resolve();
  return enqueue(async () => {
    for (const key of SYNCED_KEYS) {
      await pullOne(key, passphrase);
    }
    for (const key of SYNCED_KEYS) {
      if (isDirty(key)) await pushOne(key, passphrase);
    }
  });
}

/** Slot ids this module may sync. Must match the CHECK constraint on encrypted_blobs.slot. */
export const SYNC_SLOT_IDS: readonly string[] = SYNCED_KEYS.map(slotId);

export function isSyncSlot(id: string): boolean {
  return keyForSlot(id) !== null;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    const passphrase = getVaultPassphrase();
    // Unlocked: pull newer copies and push what is waiting. Locked: pushing the stored ciphertext is still fine.
    if (passphrase) void syncOnUnlock(passphrase);
    else void flushDirty(null);
  });
}
