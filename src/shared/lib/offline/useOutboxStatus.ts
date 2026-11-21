import { useState, useEffect } from "react";
import type { OutboxStatus } from "./types";
import { getOutboxStatus, subscribeOutbox } from "./outbox";

const DEFAULT_STATUS: OutboxStatus = {
  pending: 0,
  riskEvents: 0,
  moods: 0,
  lastSyncAt: null,
  syncing: false,
};

export function useOutboxStatus(userId: string): OutboxStatus {
  const [status, setStatus] = useState<OutboxStatus>(DEFAULT_STATUS);

  useEffect(() => {
    if (!userId) {
      setStatus(DEFAULT_STATUS);
      return;
    }

    let active = true;

    // Fetch initial status
    void getOutboxStatus(userId).then((s) => {
      if (active) setStatus(s);
    });

    // Subscribe to ongoing updates
    const unsubscribe = subscribeOutbox(userId, (s) => {
      if (active) setStatus(s);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  return status;
}

export default useOutboxStatus;
