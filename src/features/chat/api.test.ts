import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());

import { fake, resetFake } from "../journal/testSupport";
import {
  logChatCrisisEvent,
  requestCounsellorContact,
  setCachedCrisisConsent,
  getCachedCrisisConsent,
  warmCrisisConsentCache,
} from "./api";
import { createVault, generateRecoveryCode, lockVault } from "../journal/vault";
import { getOutboxStatus, clearAllOutboxDbs } from "../../shared/lib/offline/outbox";
import { ApiError } from "../../shared/lib/api/errors";

beforeEach(async () => {
  resetFake();
  localStorage.clear();
  lockVault();
  await clearAllOutboxDbs();
  await createVault("secure-test-passphrase-2026", generateRecoveryCode());
});

afterEach(() => {
  vi.restoreAllMocks();
  lockVault();
});

describe("chat crisis logging", () => {
  it("logs only with crisis_intervention consent, and never with message content", async () => {
    // No consent on file: nothing is written.
    resetFake({ consents: [] });
    await expect(logChatCrisisEvent()).resolves.toBe(false);
    expect(fake.tables.risk_events ?? []).toHaveLength(0);

    resetFake({
      consents: [{ id: "c1", student_id: "user-1", purpose: "crisis_intervention", consented: true, granted_at: "2026-01-01T00:00:00Z", revoked_at: null, policy_version: "2023.1-DPDP" }],
    });
    await expect(logChatCrisisEvent()).resolves.toBe(true);
    const [row] = fake.tables.risk_events;
    expect(row).toMatchObject({ student_id: "user-1", event_type: "chat_crisis", trigger_source: "chat_crisis", severity_level: "crisis" });
    expect(Object.keys(row.payload as object)).toEqual(["layer"]);
  });

  it("never throws when signed out", async () => {
    fake.signedIn = false;
    await expect(logChatCrisisEvent()).resolves.toBe(false);
    await expect(requestCounsellorContact()).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("queues risk event when offline and never contains message text", async () => {
    resetFake({
      consents: [{ id: "c1", student_id: "user-1", purpose: "crisis_intervention", consented: true, granted_at: "2026-01-01T00:00:00Z", revoked_at: null, policy_version: "2023.1-DPDP" }],
    });

    // While ONLINE (at sign-in) the consent cache is filled...
    await warmCrisisConsentCache();

    // ...then the device goes offline: the event is queued at once, from the cached consent,
    // without any network lookup.
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    const result = await logChatCrisisEvent();
    expect(result).toBe("queued");

    // Supabase was NOT hit online
    expect(fake.tables.risk_events ?? []).toHaveLength(0);

    // Outbox has 1 queued risk event
    const status = await getOutboxStatus("user-1");
    expect(status.riskEvents).toBe(1);
    expect(status.pending).toBe(1);
  });

  it("offline with a COLD consent cache still queues (fail open): consent is checked on the server at send time", async () => {
    resetFake({ consents: [] });
    localStorage.clear();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    await expect(logChatCrisisEvent()).resolves.toBe("queued");
    expect((await getOutboxStatus("user-1")).pending).toBe(1);
    expect(fake.tables.risk_events ?? []).toHaveLength(0);
  });

  describe("G6-SEC-09: the consent cache is a convenience, never an authority", () => {
    const noConsent = { consents: [] as Record<string, unknown>[] };

    it("a cache tampered to false offline cannot drop a crisis event", async () => {
      resetFake({
        consents: [{ id: "c1", student_id: "user-1", purpose: "crisis_intervention", consented: true, granted_at: "2026-01-01T00:00:00Z", revoked_at: null, policy_version: "2023.1-DPDP" }],
      });
      await warmCrisisConsentCache();
      for (const key of Object.keys(localStorage)) if (key.includes("consent_crisis")) localStorage.setItem(key, "false");
      setCachedCrisisConsent("user-1", false);
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

      await expect(logChatCrisisEvent()).resolves.toBe("queued");
      expect((await getOutboxStatus("user-1")).riskEvents).toBe(1);
    });

    it("a cache tampered to true without real consent never leads to a send: the outbox checks the server and drops the event", async () => {
      resetFake(noConsent);
      setCachedCrisisConsent("user-1", true);
      const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      await expect(logChatCrisisEvent()).resolves.toBe("queued");

      onLine.mockReturnValue(true);
      const consentsMod = await import("../../shared/lib/api/consents");
      const check = vi.spyOn(consentsMod, "fetchActiveConsents");
      const { flushOutbox } = await import("../../shared/lib/offline/outbox");
      const res = await flushOutbox("user-1");

      expect(check).toHaveBeenCalled();
      expect(res.sent).toBe(0);
      expect(fake.tables.risk_events ?? []).toHaveLength(0);
      expect((await getOutboxStatus("user-1")).pending).toBe(0);
    });

    it("when the online consent lookup fails, a tampered true cache cannot cause a direct insert: the event is queued for the server-side check", async () => {
      resetFake(noConsent);
      setCachedCrisisConsent("user-1", true);
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
      const consentsMod = await import("../../shared/lib/api/consents");
      vi.spyOn(consentsMod, "fetchActiveConsents").mockRejectedValueOnce(new Error("timeout"));

      await expect(logChatCrisisEvent()).resolves.toBe("queued");
      expect(fake.tables.risk_events ?? []).toHaveLength(0);
    });

    it("keeps the student id out of localStorage keys and values", async () => {
      resetFake(noConsent);
      setCachedCrisisConsent("user-1", true);
      const dump = Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`).join("\n");
      expect(dump).not.toContain("user-1");
      expect(getCachedCrisisConsent("user-1")).toBe(true);
      expect(getCachedCrisisConsent("user-2")).toBe(false);
    });

    it("ignores a cached answer older than a day and malformed values", () => {
      setCachedCrisisConsent("user-1", true);
      expect(getCachedCrisisConsent("user-1")).toBe(true);
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + 25 * 3600 * 1000);
      expect(getCachedCrisisConsent("user-1")).toBe(false);
      vi.useRealTimers();
      for (const key of Object.keys(localStorage)) if (key.includes("consent_crisis")) localStorage.setItem(key, "true");
      expect(getCachedCrisisConsent("user-1")).toBe(false);
    });
  });
  it("queues risk event when online insert fails, and does not depend on network", async () => {
    resetFake({
      consents: [{ id: "c1", student_id: "user-1", purpose: "crisis_intervention", consented: true, granted_at: "2026-01-01T00:00:00Z", revoked_at: null, policy_version: "2023.1-DPDP" }],
    });

    // Simulate Supabase failure on insert
    const originalFrom = (await import("../../shared/lib/supabase")).supabase.from;
    const { supabase } = await import("../../shared/lib/supabase");
    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "risk_events") {
        return {
          insert: async () => ({ data: null, error: { message: "Network connection lost", code: "NETWORK_ERROR" } }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return originalFrom(table);
    });

    const result = await logChatCrisisEvent();
    expect(result).toBe("queued");

    const status = await getOutboxStatus("user-1");
    expect(status.riskEvents).toBe(1);
  });

  it("uses cached consent state when offline consent check cannot reach server", async () => {
    // Set cached consent
    setCachedCrisisConsent("user-1", true);

    // Mock offline
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    // Mock fetchActiveConsents failing
    const consentsMod = await import("../../shared/lib/api/consents");
    vi.spyOn(consentsMod, "fetchActiveConsents").mockRejectedValue(new Error("Network offline"));

    const result = await logChatCrisisEvent();
    expect(result).toBe("queued");

    const status = await getOutboxStatus("user-1");
    expect(status.riskEvents).toBe(1);
  });

  it("requestCounsellorContact throws ApiError when supabase insert fails", async () => {
    const { supabase } = await import("../../shared/lib/supabase");
    vi.spyOn(supabase, "from").mockReturnValueOnce({
      insert: async () => ({ error: { message: "Internal DB error", code: "500" } }),
    } as unknown as ReturnType<typeof supabase.from>);

    await expect(requestCounsellorContact()).rejects.toThrow(ApiError);
  });

  it("logChatCrisisEvent queues (does not insert directly) when the online consent lookup throws", async () => {
    setCachedCrisisConsent("user-1", true);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);

    const consentsMod = await import("../../shared/lib/api/consents");
    vi.spyOn(consentsMod, "fetchActiveConsents").mockRejectedValueOnce(new Error("Supabase auth timeout"));

    const result = await logChatCrisisEvent();
    expect(result).toBe("queued");
    expect(fake.tables.risk_events ?? []).toHaveLength(0);
    expect((await getOutboxStatus("user-1")).riskEvents).toBe(1);
  });
  it("handles storage exceptions gracefully in getCachedCrisisConsent and setCachedCrisisConsent", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
      throw new Error("QuotaExceeded");
    });
    expect(getCachedCrisisConsent("user-1")).toBe(false);

    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("SecurityError");
    });
    expect(() => setCachedCrisisConsent("user-1", true)).not.toThrow();
  });

  it("warmCrisisConsentCache exits early when offline and tolerates auth failures", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await expect(warmCrisisConsentCache()).resolves.toBeUndefined();

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    fake.signedIn = false;
    await expect(warmCrisisConsentCache()).resolves.toBeUndefined();
  });
});
