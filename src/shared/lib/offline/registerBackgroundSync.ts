/**
/**
 * MindSahaay Background Sync Registration
 * Registers the 'mindsahaay-outbox' sync tag with the Service Worker Background Sync API
 * if supported by the browser (Chrome, Edge). Safely no-ops on browsers without support (Safari/iOS).
 */
export async function registerBackgroundSync(): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "SyncManager" in window
  ) {
    try {
      const registration = await navigator.serviceWorker.ready;
      interface SyncRegistration {
        sync?: {
          register(tag: string): Promise<void>;
        };
      }
      const syncReg = registration as unknown as SyncRegistration;
      if (syncReg.sync && typeof syncReg.sync.register === "function") {
        await syncReg.sync.register("mindsahaay-outbox");
        return true;
      }
    } catch {
      // Background Sync registration failed or permission denied
    }
  }
  return false;
}

export default registerBackgroundSync;
