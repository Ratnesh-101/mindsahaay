export * from "./types";
export * from "./outbox";
export * from "./useOnlineStatus";
export * from "./useOutboxStatus";
export * from "./registerBackgroundSync";

import {
  enqueueRiskEvent,
  enqueueMood,
  getOutboxStatus,
  subscribeOutbox,
  flushOutbox,
  hasUnsynced,
  resolveUnsyncedOnLogout,
  purgeExpired,
} from "./outbox";
import type { OutboxApi } from "./types";

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
