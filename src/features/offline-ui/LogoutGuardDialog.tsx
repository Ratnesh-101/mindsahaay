import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { hasUnsynced, resolveUnsyncedOnLogout } from "../../shared/lib/offline";
import { HELPLINES } from "../../shared/lib/pwa/helplines";
import { OFFLINE_UI_NS } from "./i18n";

interface LogoutGuardDialogProps {
  userId: string;
  /** Number of unsynced entries, always > 0 when the dialog is rendered. */
  count: number;
  /** Called when the student chooses "Stay signed in". */
  onCancel: () => void;
  /** Called after the unsynced entries were resolved (keep or discard). Continue logout here. */
  onResolved: () => void;
}

const FOCUSABLE = "button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

/**
 * Modal shown at logout while entries are unsynced. Nothing is ever deleted without an explicit
 * choice, and discarding needs a second confirmation. It is NOT a trap: Escape always works and
 * means the SAFE option ("Stay signed in", or "Go back" on the discard confirmation), and the
 * three helplines are shown inside the dialog, because a student in acute distress may press
 * logout and must never be walled in behind a data-management choice (independent review
 * finding G6-SEC-03). Clicking outside does nothing, to avoid an accidental dismissal.
 * Session expiry is out of scope: an expired session does not pass through this dialog, and the
 * encrypted items simply stay on the device until the 7-day purge.
 */
export default function LogoutGuardDialog({ userId, count, onCancel, onResolved }: LogoutGuardDialogProps) {
  const { t } = useTranslation(OFFLINE_UI_NS);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Focus the safe option on open and on step change; restore focus when closed.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, []);

  useEffect(() => {
    const first = cardRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    first?.focus();
  }, [confirming]);

  // Escape = the safe option. Kept in refs so the single key listener always sees the current step.
  const confirmingRef = useRef(confirming);
  confirmingRef.current = confirming;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (busyRef.current) return;
        if (confirmingRef.current) setConfirming(false);
        else onCancelRef.current();
        return;
      }
      if (e.key !== "Tab" || !cardRef.current) return;
      const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!cardRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const resolve = useCallback(
    async (choice: "keep" | "discard") => {
      setBusy(true);
      try {
        await resolveUnsyncedOnLogout(userId, choice);
        onResolved();
      } catch {
        // Nothing was deleted if this failed; let the student try again or stay signed in.
        setBusy(false);
      }
    },
    [userId, onResolved],
  );

  const btn: React.CSSProperties = { width: "100%", minHeight: 44, textAlign: "center" };

  const helplineBlock = (
    <div
      data-testid="logout-guard-helplines"
      style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--line)" }}
    >
      <p style={{ margin: "0 0 8px", fontWeight: 700 }}>{t("logout.helplinesTitle")}</p>
      <ul style={{ display: "grid", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
        {HELPLINES.map((h) => (
          <li key={h.id}>
            <a href={h.tel} className="outline-btn" style={{ ...btn, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
              {h.name} {h.number}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="modal-backdrop" data-testid="logout-guard-backdrop">
      <div
        ref={cardRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-guard-title"
        aria-describedby="logout-guard-desc"
        tabIndex={-1}
        className="modal-card"
      >
        {!confirming ? (
          <>
            <h3 id="logout-guard-title">{t("logout.title", { count })}</h3>
            <p id="logout-guard-desc" className="muted" style={{ margin: "8px 0 16px", lineHeight: 1.6 }}>
              {t("logout.body")}
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              <button type="button" className="primary-btn" style={btn} data-autofocus disabled={busy} onClick={onCancel}>
                {t("logout.stay")}
              </button>
              <button type="button" className="outline-btn" style={btn} disabled={busy} onClick={() => resolve("keep")}>
                {t("logout.keep")}
              </button>
              <button type="button" className="outline-btn" style={btn} disabled={busy} onClick={() => setConfirming(true)}>
                {t("logout.discard")}
              </button>
            </div>
            {helplineBlock}
          </>
        ) : (
          <>
            <h3 id="logout-guard-title">{t("logout.confirmTitle")}</h3>
            <p id="logout-guard-desc" className="muted" style={{ margin: "8px 0 16px", lineHeight: 1.6 }}>
              {t("logout.confirmBody")}
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              <button type="button" className="primary-btn" style={btn} data-autofocus disabled={busy} onClick={() => setConfirming(false)}>
                {t("logout.back")}
              </button>
              <button type="button" className="outline-btn" style={btn} disabled={busy} onClick={() => resolve("discard")}>
                {busy ? t("logout.working") : t("logout.confirmDiscard")}
              </button>
            </div>
            {helplineBlock}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Wraps a logout handler. requestLogout() runs `proceed` straight away when nothing is unsynced;
 * otherwise it opens the guard dialog (render `dialog` somewhere in the tree).
 */
export function useLogoutGuard(userId: string, proceed: () => void | Promise<void>) {
  const [pending, setPending] = useState<number>(0);

  const requestLogout = useCallback(async () => {
    let count = 0;
    try {
      count = await hasUnsynced(userId);
    } catch {
      count = 0; // Outbox unreadable: do not trap the student; nothing is deleted either way.
    }
    if (count > 0) {
      setPending(count);
      return;
    }
    await proceed();
  }, [userId, proceed]);

  const dialog =
    pending > 0 ? (
      <LogoutGuardDialog
        userId={userId}
        count={pending}
        onCancel={() => setPending(0)}
        onResolved={() => {
          setPending(0);
          void proceed();
        }}
      />
    ) : null;

  return { requestLogout, dialog };
}
