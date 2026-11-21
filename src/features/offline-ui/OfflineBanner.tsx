import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOnlineStatus } from "../../shared/lib/offline";
import { HELPLINES } from "../../shared/lib/pwa/helplines";
import { OFFLINE_UI_NS } from "./i18n";

/**
 * Calm, non-blocking notice shown while offline. Dismissible for the session; a new offline
 * event (going online and offline again) shows it again.
 */
export default function OfflineBanner() {
  const { t } = useTranslation(OFFLINE_UI_NS);
  const online = useOnlineStatus();
  const [dismissed, setDismissed] = useState(false);

  // Reset the dismissal on every browser "online" or "offline" event, not only when the React
  // state flips: if the connection drops and returns inside one render batch, the state never
  // shows online = true, and a state-only reset would leave a stale dismissal in place.
  useEffect(() => {
    if (online) setDismissed(false);
  }, [online]);

  useEffect(() => {
    const reset = () => setDismissed(false);
    window.addEventListener("offline", reset);
    window.addEventListener("online", reset);
    return () => {
      window.removeEventListener("offline", reset);
      window.removeEventListener("online", reset);
    };
  }, []);

  if (online || dismissed) return null;

  return (
    <div
      className="offline-banner"
      role="status"
      data-testid="offline-banner"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        flexWrap: "wrap",
        padding: "12px 16px",
        marginBottom: 16,
        borderRadius: 12,
        border: "1px solid var(--line)",
        borderLeft: "4px solid var(--primary)",
        background: "var(--canvas)",
        color: "var(--ink, inherit)",
        lineHeight: 1.6,
        fontSize: 14,
      }}
    >
      <div style={{ flex: "1 1 320px" }}>
        <p style={{ margin: 0 }}>{t("banner.message")}</p>
        <ul
          aria-label={t("banner.helplinesLabel")}
          style={{ display: "flex", gap: 8, flexWrap: "wrap", listStyle: "none", padding: 0, margin: "8px 0 0" }}
        >
          {HELPLINES.map((h) => {
            const name = h.id === "emergency" ? t("banner.emergency") : h.name;
            return (
              <li key={h.id}>
                <a
                  href={h.tel}
                  className="outline-btn"
                  aria-label={t("banner.call", { name, number: h.number })}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: 32,
                    minWidth: 32,
                    padding: "4px 12px",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  {name} {h.number}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
      <button
        type="button"
        className="text-btn"
        onClick={() => setDismissed(true)}
        style={{ minHeight: 32, minWidth: 32, fontSize: 13 }}
      >
        {t("banner.dismiss")}
      </button>
    </div>
  );
}
