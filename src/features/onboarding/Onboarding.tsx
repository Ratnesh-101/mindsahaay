import React, { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import Icon from "../../shared/ui/Icon";
import { grantConsent, DEFAULT_POLICY_VERSION, type ConsentPurpose } from "../../shared/lib/api/consents";
import { isDemoModeActive } from "../auth/demoMode";

export default function Onboarding() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [alias, setAlias] = useState("Aarav");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  // Granular consent states
  const [consents, setConsents] = useState<{
    data_processing: boolean;
    counsellor_sharing: boolean;
    research: boolean;
    crisis_intervention: boolean;
  }>({
    data_processing: true,
    counsellor_sharing: false,
    research: false,
    crisis_intervention: true,
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggleConsent = (key: keyof typeof consents) => {
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleLanguage = () => {
    const nextLang = i18n.language === "hi" ? "en" : "hi";
    i18n.changeLanguage(nextLang);
    document.documentElement.lang = nextLang;
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ageConfirmed) {
      setErrorMessage("You must confirm you are 18 years of age or older to use MindSahaay.");
      return;
    }
    if (!consents.data_processing) {
      setErrorMessage("Essential data processing consent is required to create your private account.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      if (!isDemoModeActive()) {
        // Record each granular consent in the append-only ledger
        const activePurposes: ConsentPurpose[] = (
          Object.keys(consents) as (keyof typeof consents)[]
        ).filter((k) => consents[k]) as ConsentPurpose[];

        for (const purpose of activePurposes) {
          try {
            await grantConsent(purpose, DEFAULT_POLICY_VERSION);
          } catch {
            // Non-blocking in case of offline or local testing
          }
        }
      } else {
        localStorage.setItem("mindsahaay_demo_consents", JSON.stringify(consents));
        localStorage.setItem("mindsahaay_demo_alias", alias);
      }

      localStorage.setItem("mindsahaay_onboarding_completed", "true");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to record consent. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-shell" lang={i18n.language}>
      {/* Top right persistent SOS Helpline */}
      <div style={{ position: "fixed", top: 20, right: 24, zIndex: 50, display: "flex", gap: 10 }}>
        <button
          type="button"
          className="quick-pill"
          onClick={toggleLanguage}
          aria-label="Toggle language between English and Hindi"
        >
          🌐 {i18n.language === "hi" ? "English" : "हिंदी"}
        </button>
        <a
          href="tel:14416"
          className="sos-trigger-btn"
          title="24/7 National Emergency Helplines"
          aria-label="24/7 Emergency Crisis Helplines - Call 14416"
        >
          <Icon name="phone" size={15} /> SOS 14416
        </a>
      </div>

      <section className="login-story" aria-label="MindSahaay Privacy Commitment">
        <div className="brand brand-light">
          <span className="brand-mark"><Icon name="heart" /></span>
          <span>MindSahaay</span>
        </div>
        <div className="story-copy">
          <span className="eyebrow green">DPDP ACT 2023 COMPLIANCE</span>
          <h1>Privacy-first wellbeing.<br />Zero university surveillance.</h1>
          <p>
            {t("consent.dpdpHeading")}.
          </p>
          <div className="trust-row" style={{ flexDirection: "column", gap: 14, marginTop: 24 }}>
            <span><Icon name="shield" size={18} /> {t("consent.purposeTitle")}: {t("consent.purposeDesc")}</span>
            <span><Icon name="clock" size={18} /> {t("consent.cryptoTitle")}: {t("consent.cryptoDesc")}</span>
          </div>
        </div>
      </section>

      <section className="login-panel" style={{ overflowY: "auto", maxHeight: "100vh" }}>
        <div className="login-box" style={{ width: "min(520px, 100%)", padding: "24px 0" }}>
          <div className="mobile-brand brand">
            <span className="brand-mark"><Icon name="heart" /></span>
            <span>MindSahaay</span>
          </div>
          <span className="eyebrow green">STEP 1 OF 1 · PRIVACY & CONSENT</span>
          <h2>{t("consent.title")}</h2>
          <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
            Under India DPDP Act 2023, your consent must be specific, informed, and revocable at any time.
          </p>

          {errorMessage && (
            <div
              className="care-step"
              role="alert"
              style={{
                background: "color-mix(in oklch, var(--danger) 12%, var(--white))",
                borderColor: "var(--danger)",
                marginBottom: 16,
              }}
            >
              <span className="soft-icon" style={{ background: "var(--danger)", color: "#fff" }}>
                <Icon name="x" size={16} />
              </span>
              <p style={{ color: "var(--danger)", fontWeight: 600 }}>{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleComplete}>
            {/* Alias / Identity Choice */}
            <div style={{ marginBottom: 20 }}>
              <label className="field-label" htmlFor="alias-input">
                How should we address you? (Anonymous alias mode)
              </label>
              <input
                id="alias-input"
                className="social-btn"
                style={{ textAlign: "left", width: "100%", padding: "0 14px", fontWeight: "normal" }}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="Enter a preferred name or alias"
                required
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="quick-pill"
                  onClick={() => {
                    setIsAnonymous(true);
                    setAlias(`Student-${Math.floor(1000 + Math.random() * 9000)}`);
                  }}
                >
                  Generate Anonymous Alias
                </button>
                {isAnonymous && <span style={{ fontSize: 12, color: "var(--primary)" }}>✓ Pseudonym active</span>}
              </div>
            </div>

            {/* Age Confirmation (18+) */}
            <div
              style={{
                background: "var(--canvas)",
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: "14px 16px",
                marginBottom: 20,
              }}
            >
              <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  id="age-confirm"
                  checked={ageConfirmed}
                  onChange={(e) => setAgeConfirmed(e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--primary)" }}
                />
                <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                  <strong>Age Confirmation (18+):</strong> I confirm that I am at least 18 years of age and
                  legally competent to grant consent for mental wellbeing self-care services.
                </span>
              </label>
            </div>

            {/* Granular Consents */}
            <fieldset style={{ border: "1px solid var(--line)", borderRadius: 14, padding: "16px", marginBottom: 20 }}>
              <legend style={{ padding: "0 8px", fontWeight: 700, fontSize: 13, color: "var(--primary-dark)" }}>
                Granular Consent Toggles (DPDP Sec. 6)
              </legend>

              {/* Data Processing */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <div>
                  <strong style={{ fontSize: 14, display: "block" }}>1. Core Wellbeing & Mood Tracking</strong>
                  <p className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                    Store mood check-ins, journal entries, and assessment history. Encrypted on your device.
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="consent-data-processing"
                  checked={consents.data_processing}
                  onChange={() => toggleConsent("data_processing")}
                  style={{ width: 20, height: 20, accentColor: "var(--primary)" }}
                  aria-label="Core wellbeing data processing"
                />
              </div>

              {/* Counsellor Sharing */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <div>
                  <strong style={{ fontSize: 14, display: "block" }}>2. Campus Counsellor Context</strong>
                  <p className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                    Optionally share PHQ/GAD screening score bands with campus psychologists when booking an appointment.
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="consent-counsellor"
                  checked={consents.counsellor_sharing}
                  onChange={() => toggleConsent("counsellor_sharing")}
                  style={{ width: 20, height: 20, accentColor: "var(--primary)" }}
                  aria-label="Counsellor context sharing"
                />
              </div>

              {/* Research Analytics */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <div>
                  <strong style={{ fontSize: 14, display: "block" }}>3. Anonymized Wellbeing Research</strong>
                  <p className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                    Include de-identified score aggregates in campus-wide student mental health trend studies.
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="consent-research"
                  checked={consents.research}
                  onChange={() => toggleConsent("research")}
                  style={{ width: 20, height: 20, accentColor: "var(--primary)" }}
                  aria-label="Anonymized research analytics"
                />
              </div>

              {/* Crisis Intervention */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "10px 0" }}>
                <div>
                  <strong style={{ fontSize: 14, display: "block" }}>4. Emergency Crisis Intervention</strong>
                  <p className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                    Allow safety prompts and helpline shortcuts if thoughts of distress or self-harm are detected.
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="consent-crisis"
                  checked={consents.crisis_intervention}
                  onChange={() => toggleConsent("crisis_intervention")}
                  style={{ width: 20, height: 20, accentColor: "var(--primary)" }}
                  aria-label="Emergency crisis intervention assistance"
                />
              </div>
            </fieldset>

            <button
              type="submit"
              className="primary-btn full"
              disabled={submitting}
              style={{ minHeight: 48, fontSize: 15 }}
            >
              {submitting ? "Writing to Consent Ledger…" : "Accept & Enter MindSahaay"} <Icon name="arrow" size={18} />
            </button>
          </form>

          <p className="terms" style={{ marginTop: 16 }}>
            You may review, update, or withdraw any consent anytime in <strong>Settings → Consent Ledger</strong>.
          </p>
        </div>
      </section>
    </div>
  );
}
