import React from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { useSyncStatus } from "../../shared/lib/storage/useSyncStatus";
import type { SyncedKey } from "../../shared/lib/storage/secureStore";

/**
 * Account sync status of one synced slot. It is separate from the "saved on this device" message:
 * saving locally succeeds first, syncing may still be waiting. Nothing is shown in preview mode,
 * because preview data is never synced.
 */
export default function SyncStatusLine({ slot }: { slot: SyncedKey }) {
  const { t } = useTranslation(CONTENT_NS);
  const { status, conflict, dismissConflict } = useSyncStatus(slot);
  if (status === "off") return null;
  return (
    <div className="flex flex-col gap-1" data-testid={`sync-${slot}`}>
      <p role="status" aria-live="polite" className="text-[13px] text-[var(--muted)]" data-sync-status={status}>
        {status === "synced" ? t("cbt.sync.synced") : t("cbt.sync.waiting")}
      </p>
      {conflict && (
        <p role="status" className="text-[13px] text-[var(--primary)]">
          {t("cbt.sync.conflict")}{" "}
          <button type="button" className="underline" onClick={dismissConflict}>
            {t("cbt.sync.dismiss")}
          </button>
        </p>
      )}
    </div>
  );
}
