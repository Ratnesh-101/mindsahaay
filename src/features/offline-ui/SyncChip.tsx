import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { flushOutbox, useOutboxStatus } from "../../shared/lib/offline";
import { OFFLINE_UI_NS } from "./i18n";

const SYNCED_VISIBLE_MS = 4000;

const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

interface SyncChipProps {
  userId: string;
}

/**
 * Shows how many items wait to sync. Hidden when nothing is pending, except for a short
 * "Synced just now" after a successful flush. The wrapper is always mounted so screen readers
 * announce changes politely.
 */
export default function SyncChip({ userId }: SyncChipProps) {
  const { t } = useTranslation(OFFLINE_UI_NS);
  const status = useOutboxStatus(userId);
  const [justSynced, setJustSynced] = useState(false);
  const [partial, setPartial] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeen = useRef<string | null>(status.lastSyncAt);

  const showSynced = () => {
    setJustSynced(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setJustSynced(false), SYNCED_VISIBLE_MS);
  };

  // A flush finished elsewhere (automatic sync): lastSyncAt moved forward.
  useEffect(() => {
    if (status.lastSyncAt && status.lastSyncAt !== lastSeen.current) {
      lastSeen.current = status.lastSyncAt;
      if (status.pending === 0) {
        setPartial(false);
        showSynced();
      }
    }
  }, [status.lastSyncAt, status.pending]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const handleSyncNow = async () => {
    setBusy(true);
    setPartial(false);
    try {
      const result = await flushOutbox(userId);
      if (result.failed > 0) setPartial(true);
      else if (result.sent > 0) showSynced();
    } catch {
      setPartial(true);
    } finally {
      setBusy(false);
    }
  };

  const working = busy || status.syncing;
  const hasPending = status.pending > 0;
  const visible = hasPending || justSynced;

  let message = "";
  if (hasPending) message = t("sync.pending", { count: status.pending });
  else if (justSynced) message = t("sync.synced");

  return (
    <div
      className="sync-chip-region"
      role="status"
      aria-live="polite"
      aria-label={t("sync.label")}
      style={visible ? { display: "block" } : SR_ONLY}
      data-testid="sync-chip-region"
    >
      {visible && (
        <div
          className="sync-chip"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 6px 4px 12px",
            borderRadius: 999,
            border: "1px solid var(--line)",
            background: "var(--canvas)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span>{message}</span>
          {hasPending && (
            <button
              type="button"
              className="outline-btn"
              onClick={handleSyncNow}
              disabled={working}
              style={{ minHeight: 28, minWidth: 28, padding: "2px 12px", fontSize: 13 }}
            >
              {working ? t("sync.syncing") : t("sync.syncNow")}
            </button>
          )}
        </div>
      )}
      {partial && hasPending && (
        <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
          {t("sync.partial")}
        </p>
      )}
    </div>
  );
}
