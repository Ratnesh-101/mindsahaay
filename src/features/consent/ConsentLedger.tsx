import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../../shared/ui/Icon";
import {
  useActiveConsents,
  useConsents,
  useGrantConsent,
  useRevokeConsent,
  type ConsentPurpose,
  DEFAULT_POLICY_VERSION,
} from "../../shared/lib/api/consents";
import { isDemoModeActive } from "../auth/demoMode";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";

const PURPOSE_LABELS: Record<ConsentPurpose, { title: string; desc: string }> = {
  data_processing: {
    title: "Core Wellbeing Data & Storage",
    desc: "Storage of mood entries, journal notes, and self-assessment history.",
  },
  crisis_intervention: {
    title: "Emergency Crisis Intervention",
    desc: "Display of suicide prevention helplines and immediate distress assistance.",
  },
  counsellor_sharing: {
    title: "Campus Counsellor Context",
    desc: "Voluntary sharing of recent assessment trends with campus therapists when booking.",
  },
  analytics: {
    title: "Aggregated Platform Analytics",
    desc: "Strictly de-identified platform performance metrics.",
  },
  peer_support: {
    title: "Peer Community & Stories",
    desc: "Participation in campus peer story sharing under pseudonyms.",
  },
  research: {
    title: "Institutional Wellbeing Research",
    desc: "Inclusion of anonymous cohort statistics for university mental health studies.",
  },
};

export default function ConsentLedger() {
  const { t } = useTranslation();
  const {
    data: activeConsents,
    isLoading: loadingActive,
    refetch: refetchActive,
  } = useActiveConsents();
  const { data: ledger, isLoading: loadingLedger, isError: ledgerFailed } = useConsents();
  const grantMutation = useGrantConsent();
  const revokeMutation = useRevokeConsent();
  const { t: tc } = useTranslation(CONTENT_NS);
  const [toggleNotice, setToggleNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // Local fallback state for demo mode
  const [demoActiveConsents, setDemoActiveConsents] = useState<Record<ConsentPurpose, boolean>>(() => {
    const stored = localStorage.getItem("mindsahaay_demo_consents");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return {
          data_processing: Boolean(parsed.data_processing ?? true),
          crisis_intervention: Boolean(parsed.crisis_intervention ?? true),
          counsellor_sharing: Boolean(parsed.counsellor_sharing ?? false),
          analytics: Boolean(parsed.analytics ?? false),
          peer_support: Boolean(parsed.peer_support ?? true),
          research: Boolean(parsed.research ?? false),
        };
      } catch {
        // fallback
      }
    }
    return {
      data_processing: true,
      crisis_intervention: true,
      counsellor_sharing: false,
      analytics: false,
      peer_support: true,
      research: false,
    };
  });

  const [demoAuditEvents, setDemoAuditEvents] = useState<
    Array<{ id: string; purpose: ConsentPurpose; consented: boolean; policy_version: string; granted_at: string }>
  >([]);

  const isDemo = isDemoModeActive();

  const handleToggle = async (purpose: ConsentPurpose, isCurrentlyActive: boolean) => {
    setToggleNotice(null);
    if (isDemo) {
      const nextConsented = !isCurrentlyActive;
      const updated = { ...demoActiveConsents, [purpose]: nextConsented };
      setDemoActiveConsents(updated);
      localStorage.setItem("mindsahaay_demo_consents", JSON.stringify(updated));

      setDemoAuditEvents((prev) => [
        {
          id: `demo-event-${Date.now()}`,
          purpose,
          consented: nextConsented,
          policy_version: DEFAULT_POLICY_VERSION,
          granted_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      return;
    }

    // The change is real only once the ledger row was written: mutateAsync throws otherwise, and the
    // toggle then stays as it was while the student is told so.
    const title = PURPOSE_LABELS[purpose].title;
    try {
      if (isCurrentlyActive) {
        await revokeMutation.mutateAsync({ purpose, policyVersion: DEFAULT_POLICY_VERSION });
        setToggleNotice({ kind: "ok", text: tc("consentPage.revoked", { title }) });
      } else {
        await grantMutation.mutateAsync({ purpose, policyVersion: DEFAULT_POLICY_VERSION });
        setToggleNotice({ kind: "ok", text: tc("consentPage.granted", { title }) });
      }
    } catch {
      setToggleNotice({ kind: "error", text: tc("consentPage.toggleError", { title }) });
    }
  };

  // Real accounts only ever show what the ledger says. Until it has loaded, or if it cannot be read,
  // no toggle is shown at all, so default values can never pass for the student's real choices.
  const effectiveConsents: Record<ConsentPurpose, boolean> | undefined = isDemo ? demoActiveConsents : activeConsents;
  const effectiveLedger = isDemo ? demoAuditEvents : (ledger ?? []);
  const isUpdating = grantMutation.isPending || revokeMutation.isPending;

  return (
    <div className="page consent-page" style={{ maxWidth: 960, margin: "0 auto" }}>
      <header className="directory-head" style={{ marginBottom: 24 }}>
        <div>
          <span className="eyebrow green">DPDP ACT 2023 · SECTION 6</span>
          <h1>{t("consent.title")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Under India DPDP Act 2023, your mental health data cannot be processed without your express,
            granular consent. You have the absolute right to revoke any consent at any time.
          </p>
        </div>
      </header>

      {/* DPDP Legal Rights Highlights */}
      <section className="stat-grid" style={{ marginBottom: 28 }}>
        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon mint"><Icon name="shield" /></span>
          </div>
          <strong>{t("consent.purposeTitle")}</strong>
          <small>{t("consent.purposeDesc")}</small>
        </article>

        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon lilac"><Icon name="shield" /></span>
          </div>
          <strong>{t("consent.cryptoTitle")}</strong>
          <small>{t("consent.cryptoDesc")}</small>
        </article>

        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon peach"><Icon name="download" /></span>
          </div>
          <strong>{t("consent.portabilityTitle")}</strong>
          <small>{t("consent.portabilityDesc")}</small>
        </article>
      </section>

      {/* Active Granular Consents */}
      <section className="panel" style={{ marginBottom: 28 }}>
        <div className="panel-head">
          <div>
            <h3>Active Consent Status</h3>
            <p className="muted">Toggle switches write directly to the append-only audit ledger.</p>
          </div>
          {isUpdating && <span className="saved-label">Updating ledger…</span>}
        </div>

        {!isDemo && loadingActive ? (
          <p className="muted" role="status">Loading consent ledger status…</p>
        ) : !effectiveConsents ? (
          <div role="alert" data-testid="consent-load-error">
            <p style={{ color: "var(--danger)", fontWeight: 600 }}>{tc("consentPage.loadError")}</p>
            <button type="button" className="primary-btn" style={{ marginTop: 8 }} onClick={() => void refetchActive()}>
              {tc("common.retry")}
            </button>
          </div>
        ) : (
          <div className="care-plan-list">
            {(Object.keys(PURPOSE_LABELS) as ConsentPurpose[]).map((purpose) => {
              const info = PURPOSE_LABELS[purpose];
              const isActive = Boolean(effectiveConsents[purpose]);

              return (
                <div
                  key={purpose}
                  className="care-step"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 20px",
                  }}
                >
                  <div style={{ flex: 1, paddingRight: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <strong>{info.title}</strong>
                      <span
                        className={`tag ${isActive ? "calm" : "mild"}`}
                        style={{ fontSize: 11, padding: "2px 8px" }}
                      >
                        {isActive ? t("consent.statusActive") : t("consent.statusRevoked")}
                      </span>
                    </div>
                    <p className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
                      {info.desc}
                    </p>
                  </div>

                  <button
                    type="button"
                    className={isActive ? "outline-btn" : "primary-btn"}
                    onClick={() => handleToggle(purpose, isActive)}
                    disabled={isUpdating}
                    aria-label={`${isActive ? t("consent.revokeConsent") : t("consent.grantConsent")} for ${info.title}`}
                    style={{ minWidth: 130, height: 40, fontSize: 13 }}
                  >
                    {isActive ? t("consent.revokeConsent") : t("consent.grantConsent")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p role="status" aria-live="polite" className={toggleNotice?.kind === "ok" ? "saved-label" : "sr-only"} style={{ marginTop: 10 }}>
          {toggleNotice?.kind === "ok" ? toggleNotice.text : ""}
        </p>
        {toggleNotice?.kind === "error" && (
          <p role="alert" style={{ color: "var(--danger)", fontWeight: 600, marginTop: 10 }}>
            {toggleNotice.text}
          </p>
        )}
      </section>

      {/* Immutable Append-Only Ledger History */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Immutable Append-Only Audit Ledger</h3>
            <p className="muted">
              Tamper-evident log of all consent grants and revocations with policy versions.
            </p>
          </div>
        </div>

        {loadingLedger && !isDemo ? (
          <p className="muted" role="status">Loading audit entries…</p>
        ) : !isDemo && ledgerFailed ? (
          <p role="alert" style={{ color: "var(--danger)", fontWeight: 600 }}>{tc("consentPage.ledgerError")}</p>
        ) : (
          <div
            style={{ overflowX: "auto" }}
            /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- WCAG 2.1.1 scrollable region must be focusable */
            tabIndex={0}
            role="region"
            aria-label="Consent audit ledger history"
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                textAlign: "left",
              }}
              aria-label="Immutable consent audit trail"
            >
              <thead>
                <tr style={{ borderBottom: "2px solid var(--line)", color: "var(--muted)" }}>
                  <th style={{ padding: "10px 12px" }}>Timestamp</th>
                  <th style={{ padding: "10px 12px" }}>Purpose</th>
                  <th style={{ padding: "10px 12px" }}>Action</th>
                  <th style={{ padding: "10px 12px" }}>Policy Version</th>
                </tr>
              </thead>
              <tbody>
                {effectiveLedger.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>
                      No ledger events recorded yet.
                    </td>
                  </tr>
                ) : (
                  effectiveLedger.map((record) => (
                    <tr key={record.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "12px", fontFamily: "monospace" }}>
                        {new Date(record.granted_at).toLocaleString()}
                      </td>
                      <td style={{ padding: "12px", fontWeight: 600 }}>
                        {PURPOSE_LABELS[record.purpose]?.title || record.purpose}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span
                          className={`tag ${record.consented ? "calm" : "mild"}`}
                          style={{ fontSize: 11 }}
                        >
                          {record.consented ? "Granted" : "Revoked"}
                        </span>
                      </td>
                      <td style={{ padding: "12px", color: "var(--muted)", fontFamily: "monospace" }}>
                        {record.policy_version}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
