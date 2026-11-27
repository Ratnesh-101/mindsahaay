import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase", async () => {
  const support = await import("../../../features/journal/testSupport");
  const base = support.supabaseModule();
  const rpc = async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    if (rpcFailure) return { data: null, error: { message: rpcFailure } };
    if (!support.fake.signedIn) return { data: null, error: { message: "not authenticated" } };
    const rows = (support.fake.tables.encrypted_blobs ??= []);
    const existing = rows.find((r) => r.user_id === support.fake.userId && r.slot === args.p_slot);
    const current = existing ? Number(existing.version) : 0;
    if (Number(args.p_expected_version) !== current) return { data: null, error: { message: "VERSION_CONFLICT" } };
    const row = {
      user_id: support.fake.userId,
      slot: args.p_slot,
      ciphertext: args.p_ciphertext,
      iv: args.p_iv,
      salt: args.p_salt,
      version: current + 1,
    };
    if (existing) Object.assign(existing, row);
    else rows.push(row);
    return { data: current + 1, error: null };
  };
  const client = { ...support.fakeSupabase, rpc };
  return { ...base, supabase: client, default: client };
});

import { fake, resetFake } from "../../../features/journal/testSupport";
import {
  OPAQUE_KEY_MAP,
  SYNCED_KEYS,
  clearSecureStoreMemory,
  getSecureItem,
  getStoredPayload,
  setSecureItem,
} from "./secureStore";
import { SYNC_META_KEY, SYNC_SLOT_IDS, flushDirty, getSyncSnapshot, resetRemoteSyncMemory } from "./remoteSync";
import { createVault, generateRecoveryCode, lockVault, readVaultMeta, unlockVault } from "../../../features/journal/vault";

const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
let rpcFailure: string | null = null;

const PASS = "remote sync passphrase";
const SECRET = { time: "19:00", duration: 20, parked: [{ id: "w1", text: "very private worry" }] };

function serverRows(): Array<Record<string, unknown>> {
  return (fake.tables.encrypted_blobs ??= []);
}

async function writeWorry(value: unknown = SECRET) {
  const result = await setSecureItem("cbt_worry", value);
  expect(result.status).toBe("ok");
}

beforeEach(async () => {
  resetFake();
  rpcCalls.length = 0;
  rpcFailure = null;
  localStorage.clear();
  sessionStorage.clear();
  clearSecureStoreMemory();
  resetRemoteSyncMemory();
  lockVault();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  await createVault(PASS, generateRecoveryCode());
  await new Promise((r) => setTimeout(r, 20)); // let the post-create pull settle
  rpcCalls.length = 0;
});

afterEach(() => {
  lockVault();
});

describe("remoteSync", () => {
  it("only syncs the slots the migration allows, using their opaque ids", () => {
    expect([...SYNC_SLOT_IDS].sort()).toEqual(
      [OPAQUE_KEY_MAP.cbt_activities, OPAQUE_KEY_MAP.cbt_worry, OPAQUE_KEY_MAP.safety_card].sort()
    );
    expect(SYNCED_KEYS).toHaveLength(3);
  });

  it("pushes the SAME ciphertext that was written locally, and the server never sees plaintext", { timeout: 60000 }, async () => {
    await writeWorry();
    await vi.waitFor(() => expect(serverRows()).toHaveLength(1));
    await vi.waitFor(() => expect(getSyncSnapshot("cbt_worry").status).toBe("synced"));
    const local = getStoredPayload("cbt_worry");
    const row = serverRows()[0];
    expect(row.slot).toBe(OPAQUE_KEY_MAP.cbt_worry);
    expect(row.ciphertext).toBe(local?.ciphertext);
    expect(row.iv).toBe(local?.iv);
    expect(row.salt).toBe(local?.salt);
    expect(row.version).toBe(1);
    expect(JSON.stringify(row)).not.toContain("private worry");
  });

  it("when the push fails the slot is dirty (no plaintext in the flag) and a later flush retries it", { timeout: 60000 }, async () => {
    rpcFailure = "network down";
    await writeWorry();
    await vi.waitFor(() => expect(rpcCalls.length).toBeGreaterThan(0));
    await vi.waitFor(() => expect(getSyncSnapshot("cbt_worry").status).toBe("pending"));
    const meta = localStorage.getItem(SYNC_META_KEY) ?? "";
    expect(JSON.parse(meta).dirty).toEqual([OPAQUE_KEY_MAP.cbt_worry]);
    expect(meta).not.toContain("private worry");
    expect(serverRows()).toHaveLength(0);

    rpcFailure = null;
    await flushDirty();
    expect(serverRows()).toHaveLength(1);
    expect(getSyncSnapshot("cbt_worry").status).toBe("synced");
    expect(JSON.parse(localStorage.getItem(SYNC_META_KEY) ?? "{}").dirty).toEqual([]);
  });

  it("while offline nothing is sent, the slot waits, and coming back online sends it", { timeout: 60000 }, async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await writeWorry();
    await vi.waitFor(() => expect(getSyncSnapshot("cbt_worry").status).toBe("pending"));
    expect(rpcCalls).toHaveLength(0);

    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(serverRows()).toHaveLength(1));
  });

  it("preview mode never syncs", { timeout: 60000 }, async () => {
    sessionStorage.setItem("mindsahaay_demo_mode", "true");
    await writeWorry();
    await new Promise((r) => setTimeout(r, 50));
    expect(rpcCalls).toHaveLength(0);
    expect(getSyncSnapshot("cbt_worry").status).toBe("off");
  });

  it("another device gets the data on unlock after the local copy is gone", { timeout: 90000 }, async () => {
    await writeWorry();
    await vi.waitFor(() => expect(serverRows()).toHaveLength(1));
    await vi.waitFor(() => expect(getSyncSnapshot("cbt_worry").status).toBe("synced"));

    // Sign out wipes this device. The server copy remains.
    const meta = await readVaultMeta();
    localStorage.removeItem(OPAQUE_KEY_MAP.cbt_worry);
    localStorage.removeItem(SYNC_META_KEY);
    clearSecureStoreMemory();
    resetRemoteSyncMemory();
    lockVault();
    expect(getStoredPayload("cbt_worry")).toBeNull();

    await unlockVault(PASS, meta!);
    await vi.waitFor(async () => {
      const got = await getSecureItem<typeof SECRET>("cbt_worry");
      expect(got).toEqual({ status: "unlocked", value: SECRET });
    }, { timeout: 20000 });
    expect(getSyncSnapshot("cbt_worry").revision).toBeGreaterThan(0);
    expect(getSyncSnapshot("cbt_worry").conflict).toBe(false);
  });

  it("on VERSION_CONFLICT the newer server copy wins and the conflict is flagged", { timeout: 90000 }, async () => {
    await writeWorry();
    await vi.waitFor(() => expect(serverRows()).toHaveLength(1));
    await vi.waitFor(() => expect(getSyncSnapshot("cbt_worry").status).toBe("synced"));

    // Another device pushed version 2 while this device still believes it is on version 1.
    const other = { time: "21:00", duration: 30, parked: [] };
    const { encryptJournal } = await import("../../../domain/crypto/journalCrypto");
    const payload = await encryptJournal(JSON.stringify(other), PASS);
    Object.assign(serverRows()[0], { ciphertext: payload.ciphertext, iv: payload.iv, salt: payload.salt, version: 2 });

    await writeWorry({ time: "08:00", duration: 10, parked: [] });
    await vi.waitFor(() => expect(getSyncSnapshot("cbt_worry").conflict).toBe(true));
    const got = await getSecureItem<typeof other>("cbt_worry");
    expect(got).toEqual({ status: "unlocked", value: other });
    expect(getSyncSnapshot("cbt_worry").status).toBe("synced");
    expect(serverRows()[0].version).toBe(2);
  });

  it("sign-out wipes the local copy and the sync flags but leaves the server copy", { timeout: 60000 }, async () => {
    const { clearAllLocalUserData } = await import("./secureStore");
    await writeWorry();
    await vi.waitFor(() => expect(serverRows()).toHaveLength(1));
    await clearAllLocalUserData();
    expect(localStorage.getItem(OPAQUE_KEY_MAP.cbt_worry)).toBeNull();
    expect(localStorage.getItem(SYNC_META_KEY)).toBeNull();
    expect(serverRows()).toHaveLength(1);
  });
});
