import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";
import { AuthRequiredError } from "../../shared/lib/api/errors";
import { isDemoModeActive } from "../auth/demoMode";
import { DemoDataUnavailableError, useClearDemoData, useDemoDataCounts, useLoadDemoData } from "./api";
import { DEMO_DATA_NS } from "./i18n";

export interface DemoDataPanelProps {
  variant?: "card" | "inline";
}

type Feedback = { kind: "success" | "error"; text: string } | null;

const BUTTON_STYLE: React.CSSProperties = { minHeight: 44, minWidth: 44 };

/**
 * "Load demo data" / "Clear demo data". Nothing here runs on its own: the load RPC is only called
 * from the button's click handler, never on render or mount.
 */
export default function DemoDataPanel({ variant = "card" }: DemoDataPanelProps) {
  const { t } = useTranslation(DEMO_DATA_NS);
  const previewActive = isDemoModeActive();

  const counts = useDemoDataCounts();
  const loadMutation = useLoadDemoData();
  const clearMutation = useClearDemoData();

  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const busy = loadMutation.isPending || clearMutation.isPending;
  const hasDemo = counts.data ? counts.data.moods + counts.data.assessments > 0 : false;

  const errorText = (error: unknown, fallbackKey: "errorLoad" | "errorClear"): string => {
    if (error instanceof AuthRequiredError) return t("errorAuth");
    if (error instanceof DemoDataUnavailableError) return t("errorUnavailable");
    return t(fallbackKey);
  };

  const handleLoad = () => {
    setFeedback(null);
    loadMutation.mutate(undefined, {
      onSuccess: (result) =>
        setFeedback({
          kind: "success",
          text: t("loadSuccess", { moods: result.moods, assessments: result.assessments }),
        }),
      onError: (error) => setFeedback({ kind: "error", text: errorText(error, "errorLoad") }),
    });
  };

  const handleConfirmClear = () => {
    setConfirmOpen(false);
    setFeedback(null);
    clearMutation.mutate(undefined, {
      onSuccess: (result) =>
        setFeedback({
          kind: "success",
          text: t("clearSuccess", { moods: result.moods, assessments: result.assessments }),
        }),
      onError: (error) => setFeedback({ kind: "error", text: errorText(error, "errorClear") }),
    });
  };

  const Heading = variant === "card" ? "h3" : "h4";
  const headingId = `demo-data-heading-${variant}`;

  const body = previewActive ? (
    <div data-testid="demo-data-preview">
      <p style={{ fontWeight: 700, margin: "0 0 4px" }}>{t("previewTitle")}</p>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
        {t("previewBody")}
      </p>
    </div>
  ) : counts.isLoading ? (
    <p className="muted" role="status" style={{ margin: 0 }}>
      {t("checking")}
    </p>
  ) : counts.isError ? (
    <div>
      <p className="muted" role="alert" style={{ margin: "0 0 10px" }}>
        {counts.error instanceof AuthRequiredError ? t("errorAuth") : t("errorStatus")}
      </p>
      <button type="button" className="outline-btn" style={BUTTON_STYLE} onClick={() => counts.refetch()}>
        {t("retry")}
      </button>
    </div>
  ) : hasDemo ? (
    <div>
      <p style={{ fontWeight: 700, margin: "0 0 4px" }}>{t("loadedTitle")}</p>
      <p style={{ fontSize: 13, margin: "0 0 4px" }} data-testid="demo-data-counts">
        {t("counts", { moods: counts.data?.moods ?? 0, assessments: counts.data?.assessments ?? 0 })}
      </p>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: "0 0 12px" }}>
        {t("loadedHelp")}
      </p>
      <button
        type="button"
        className="outline-btn"
        style={BUTTON_STYLE}
        disabled={busy}
        aria-busy={clearMutation.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        <Icon name="trash" size={16} /> {clearMutation.isPending ? t("clearing") : t("clear")}
      </button>
    </div>
  ) : (
    <div>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: "0 0 12px" }}>
        {t("description")}
      </p>
      <button
        type="button"
        className="primary-btn"
        style={BUTTON_STYLE}
        disabled={busy}
        aria-busy={loadMutation.isPending}
        onClick={handleLoad}
      >
        <Icon name="plus" size={16} /> {loadMutation.isPending ? t("loading") : t("load")}
      </button>
    </div>
  );

  const content = (
    <>
      <Heading id={headingId} style={{ margin: "0 0 8px" }}>
        {t("heading")}
      </Heading>
      {body}
      {/* Always-mounted live regions so screen readers announce changes reliably. */}
      <div role="status" aria-live="polite" style={{ marginTop: feedback?.kind === "success" ? 10 : 0 }}>
        {feedback?.kind === "success" && (
          <p className="saved-label" style={{ margin: 0 }}>
            ✓ {feedback.text}
          </p>
        )}
      </div>
      <div role="alert" style={{ marginTop: feedback?.kind === "error" ? 10 : 0 }}>
        {feedback?.kind === "error" && (
          <p style={{ margin: 0, color: "var(--danger)", fontWeight: 600 }}>{feedback.text}</p>
        )}
      </div>

      {confirmOpen && (
        <Modal onClose={() => setConfirmOpen(false)} ariaLabel={t("confirmTitle")}>
          <div className="modal-head">
            <h3 style={{ margin: 0 }}>{t("confirmTitle")}</h3>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setConfirmOpen(false)}
              aria-label={t("close")}
            >
              <Icon name="x" />
            </button>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: "14px 0" }}>{t("confirmBody")}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="button" className="primary-btn" style={BUTTON_STYLE} onClick={handleConfirmClear}>
              {t("confirmClear")}
            </button>
            <button
              type="button"
              className="outline-btn"
              style={BUTTON_STYLE}
              onClick={() => setConfirmOpen(false)}
            >
              {t("cancel")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );

  if (variant === "inline") {
    return (
      <div className="demo-data-panel demo-data-inline" aria-labelledby={headingId} role="group">
        {content}
      </div>
    );
  }

  return (
    <section
      className="panel demo-data-panel"
      style={{ marginBottom: 24 }}
      aria-labelledby={headingId}
    >
      {content}
    </section>
  );
}
