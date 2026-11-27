import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getSyncSnapshot, subscribeSync, acknowledgeConflict, type SyncSnapshot } from "./remoteSync";
import type { SyncedKey } from "./secureStore";

/**
 * Sync status of one synced slot, shown separately from the local save result:
 * "synced" | "pending" ("Waiting to sync") | "off" (preview mode, nothing is synced).
 * `revision` changes when a newer server copy replaced the local one, so screens can reload.
 */
export function useSyncStatus(key: SyncedKey): SyncSnapshot & { dismissConflict: () => void } {
  const snapshot = useSyncExternalStore(
    subscribeSync,
    () => getSyncSnapshot(key),
    () => getSyncSnapshot(key)
  );
  const dismissConflict = useCallback(() => acknowledgeConflict(key), [key]);
  return { ...snapshot, dismissConflict };
}

/** Runs `reload` whenever a pull replaced the local data of this slot. */
export function useReloadOnRemoteChange(key: SyncedKey, reload: () => void): void {
  const { revision } = useSyncStatus(key);
  useEffect(() => {
    if (revision > 0) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);
}
