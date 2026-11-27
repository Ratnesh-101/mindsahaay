import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useOnlineStatus, isOnline } from "./useOnlineStatus";
import { useOutboxStatus } from "./useOutboxStatus";
import { registerBackgroundSync } from "./registerBackgroundSync";
import { enqueueMood, clearAllOutboxDbs } from "./outbox";
import { createVault, generateRecoveryCode, lockVault } from "../../../features/journal/vault";

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.setItem("mindsahaay_demo_mode", "true"); // the preview flag is session-scoped
  lockVault();
  await clearAllOutboxDbs();
});

afterEach(() => {
  lockVault();
  vi.restoreAllMocks();
});

describe("Offline Hooks & Utilities", () => {
  describe("useOnlineStatus", () => {
    it("reports navigator.onLine and reacts to window online/offline events", () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
      expect(isOnline()).toBe(true);

      const { result } = renderHook(() => useOnlineStatus());
      expect(result.current).toBe(true);

      // Trigger offline
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });
      expect(result.current).toBe(false);

      // Trigger online
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      expect(result.current).toBe(true);
    });
  });

  describe("useOutboxStatus", () => {
    it("returns default status for empty user id and updates when items are enqueued", async () => {
      const { result } = renderHook(() => useOutboxStatus(""));
      expect(result.current.pending).toBe(0);

      await createVault("test-passphrase-hooks-2026", generateRecoveryCode());

      const { result: userHook } = renderHook(() => useOutboxStatus("user-hook-test"));
      expect(userHook.current.pending).toBe(0);

      await act(async () => {
        await enqueueMood({
          id: "mood-hook-1",
          student_id: "user-hook-test",
          mood: "Serene",
          score: 8,
        });
      });

      await waitFor(() => {
        expect(userHook.current.pending).toBe(1);
        expect(userHook.current.moods).toBe(1);
      });
    });
  });

  describe("registerBackgroundSync", () => {
    it("returns false when Background Sync API is unavailable", async () => {
      const res = await registerBackgroundSync();
      expect(res).toBe(false);
    });

    it("registers sync tag when SyncManager is available", async () => {
      const mockRegister = vi.fn().mockResolvedValue(undefined);
      (window as unknown as { SyncManager?: unknown }).SyncManager = {};
      const mockReady = Promise.resolve({
        sync: {
          register: mockRegister,
        },
      });

      Object.defineProperty(navigator, "serviceWorker", {
        value: { ready: mockReady },
        configurable: true,
      });

      const res = await registerBackgroundSync();
      expect(res).toBe(true);
      expect(mockRegister).toHaveBeenCalledWith("mindsahaay-outbox");

      delete (window as unknown as { SyncManager?: unknown }).SyncManager;
      delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    });
  });
});
