import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { OFFLINE_UI_NS } from "./i18n";

export const SW_UPDATE_EVENT = "mindsahaay:sw-update";

interface SwUpdateDetail {
  apply?: () => void;
}

/**
 * Tells the student a new version is ready. "Refresh now" calls detail.apply(), which asks the
 * waiting worker to take over; register.ts reloads the page once on controllerchange.
 *
 * Fixed bottom-left. The SOS button lives in the top bar and the offline banner is in the page flow,
 * so the toast covers neither.
 */
export default function UpdateToast() {
  const { t } = useTranslation(OFFLINE_UI_NS);
  const [apply, setApply] = useState<(() => void) | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<SwUpdateDetail>).detail;
      // Wrap in a function so React does not treat it as a state updater.
      setApply(() => (typeof detail?.apply === "function" ? detail.apply : () => undefined));
      setApplying(false);
    };
    window.addEventListener(SW_UPDATE_EVENT, onUpdate);
    return () => window.removeEventListener(SW_UPDATE_EVENT, onUpdate);
  }, []);

  const refresh = useCallback(() => {
    if (!apply) return;
    setApplying(true);
    try {
      apply();
    } catch {
      setApplying(false);
    }
  }, [apply]);

  if (!apply) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="update-toast"
      style={{
        position: "fixed",
        left: 16,
        bottom: 16,
                zIndex: 40,
        maxWidth: "min(24rem, calc(100vw - 8rem))",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 16px",
        borderRadius: 12,
        border: "1px solid var(--line)",
        borderLeft: "4px solid var(--primary)",
        background: "var(--canvas)",
        color: "var(--ink, inherit)",
        boxShadow: "0 2px 8px rgba(0,0,0,.15)",
        lineHeight: 1.6,
        fontSize: 14,
      }}
    >
      <p style={{ margin: 0 }}>{applying ? t("update.applying") : t("update.message")}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="primary-btn"
          onClick={refresh}
          disabled={applying}
          style={{ minHeight: 32, minWidth: 32, padding: "4px 14px", fontSize: 14 }}
        >
          {t("update.refresh")}
        </button>
        <button
          type="button"
          className="text-btn"
          onClick={() => setApply(null)}
          disabled={applying}
          style={{ minHeight: 32, minWidth: 32, padding: "4px 14px", fontSize: 14 }}
        >
          {t("update.later")}
        </button>
      </div>
    </div>
  );
}
