import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";
import { exportStudentData, deleteStudentAccount } from "../../shared/lib/api/account";
import { useAuth } from "../../app/providers/AuthProvider";
import { isDemoModeActive, getDemoProfile } from "../auth/demoMode";
import { clearAllLocalUserData, getSecureItemSync } from "../../shared/lib/storage/secureStore";
import { fetchConsentLedger } from "../../shared/lib/api/consents";
import { CONTENT_NS } from "../journal/registerBundle";
import { DemoDataPanel } from "../demo-data";
import "./i18n";

export default function Settings() {
  const { i18n } = useTranslation();
  const { t: tc } = useTranslation(CONTENT_NS);
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const isDemo = isDemoModeActive();
  const currentProfile = isDemo ? getDemoProfile() : profile;

  // Language state
  const currentLang = i18n.language || "en";
  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
  };

  // Theme state
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("mindsahaay-theme") === "dark";
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("mindsahaay-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("mindsahaay-theme", "light");
    }
  }, [darkMode]);

  // Data Export state
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setExportSuccess(false);
    setExportError(null);
    try {
      let exportData: Record<string, unknown>;
      if (!isDemo) {
        const [realConsents, studentData] = await Promise.all([
          fetchConsentLedger(),
          exportStudentData(),
        ]);
        exportData = {
          ...studentData,
          consents: realConsents,
        };
      } else {
        exportData = {
          metadata: {
            platform: "MindSahaay Student Wellbeing (Demo Mode)",
            exportedAt: new Date().toISOString(),
            regulations: "India DPDP Act 2023 & Mental Healthcare Act 2017",
            studentId: currentProfile?.id || "demo-student-id",
          },
          profile: currentProfile,
          consents: (() => {
            try {
              const raw = sessionStorage.getItem("mindsahaay_demo_consents");
              return raw ? JSON.parse(raw) : {};
            } catch {
              return {};
            }
          })(),
          moods: (() => {
            const res = getSecureItemSync<unknown[]>("demo_moods");
            if (res.status === "unlocked" && res.value) return res.value;
            try {
              return JSON.parse(sessionStorage.getItem("mindsahaay_demo_moods") || "[]");
            } catch {
              return [];
            }
          })(),
          safetyPlan: (() => {
            const res = getSecureItemSync<unknown>("demo_safety_plan");
            if (res.status === "unlocked" && res.value) return res.value;
            try {
              return JSON.parse(sessionStorage.getItem("mindsahaay_demo_safety_plan") || "{}");
            } catch {
              return {};
            }
          })(),
          journals: [
            {
              note: "Exported as ciphertext only",
              ciphertext: "U2FsdGVkX19DemoEncryptedCiphertextOnly==",
            },
          ],
        };
      }

      // Explicit note that journals are exported as ciphertext only
      exportData.journal_encryption_notice =
        "Note: In accordance with zero-knowledge encryption under the India DPDP Act 2023, all journal entries are exported as ciphertext only. Decryption is performed exclusively in the student browser using their private passphrase.";

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mindsahaay-health-archive-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 4000);
    } catch {
      setExportError(tc("settings.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  // Account Erasure state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [erasing, setErasing] = useState(false);

  const handleDeleteAccount = async () => {
    if (typedConfirmation.trim().toUpperCase() !== "DELETE") {
      return;
    }
    setErasing(true);
    try {
      // 1. Delete the account on the server FIRST. If this fails (for example the student is
      //    offline) nothing local has been wiped yet, so the student can simply retry.
      if (!isDemo) {
        await deleteStudentAccount();
      }

      // 2. Then the central local cleanup. Erasure means erasure: also DISCARD any encrypted
      //    entries still waiting in the offline outbox (a normal logout keeps them for up to 7
      //    days; account erasure must not leave a student's data on the device).
      await clearAllLocalUserData({ discardOutbox: true, userId: user?.id });

      // 3. Sign out
      await signOut();

      // 6. Close modal & redirect to goodbye screen
      setShowDeleteModal(false);
      navigate("/goodbye", { replace: true });
    } catch {
      alert("Failed to erase account. Please retry.");
      setErasing(false);
    }
  };

  return (
    <div className="page settings-page" style={{ maxWidth: 840, margin: "0 auto" }}>
      <header className="directory-head" style={{ marginBottom: 24 }}>
        <div>
          <span className="eyebrow green">ACCOUNT & PRIVACY</span>
          <h1>Settings & Student Rights</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Control your language, visual comfort, consent ledger, and exercise DPDP Act data rights.
          </p>
        </div>
      </header>

      {/* Profile Overview Card */}
      <section className="panel" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div className="avatar" style={{ width: 52, height: 52, fontSize: 18, margin: 0 }}>
            {currentProfile?.alias?.slice(0, 2).toUpperCase() || "ST"}
          </div>
          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>{currentProfile?.alias || "Student"}</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              Role: <strong>{currentProfile?.role || "student"}</strong> · {user?.email || "Anonymous Local Session"}
            </p>
          </div>
        </div>
      </section>

      {/* 1. Language & Localization */}
      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-head">
          <div>
            <h3>Language / भाषा</h3>
            <p className="muted">Choose your preferred language for interfaces, screeners, and crisis notices.</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            className={currentLang === "en" ? "primary-btn" : "outline-btn"}
            onClick={() => handleLanguageChange("en")}
            aria-pressed={currentLang === "en"}
          >
            English (English)
          </button>
          <button
            type="button"
            className={currentLang === "hi" ? "primary-btn" : "outline-btn"}
            onClick={() => handleLanguageChange("hi")}
            aria-pressed={currentLang === "hi"}
          >
            हिंदी (Hindi)
          </button>
        </div>
      </section>

      {/* 2. Visual Theme & Night Mode */}
      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-head">
          <div>
            <h3>Visual Theme</h3>
            <p className="muted">
              Melatonin-friendly night mode reduces blue light during late-night study or 2 AM anxiety.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            className={!darkMode ? "primary-btn" : "outline-btn"}
            onClick={() => setDarkMode(false)}
            aria-pressed={!darkMode}
          >
            <Icon name="sun" size={16} /> Day View (Botanical Paper)
          </button>
          <button
            type="button"
            className={darkMode ? "primary-btn" : "outline-btn"}
            onClick={() => setDarkMode(true)}
            aria-pressed={darkMode}
          >
            <Icon name="moon" size={16} /> Calming Night View (Slate & Moss)
          </button>
        </div>
      </section>

      {/* 3. Consent Management */}
      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-head">
          <div>
            <h3>DPDP Consent Ledger</h3>
            <p className="muted">
              Manage your granular consent for data storage, counsellor sharing, and research.
            </p>
          </div>
          <button
            type="button"
            className="outline-btn"
            onClick={() => navigate("/consent")}
          >
            Open Full Ledger <Icon name="arrow" size={15} />
          </button>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.5 }} className="muted">
          Under the India DPDP Act 2023, you can grant or revoke consent for any purpose at any time without
          affecting your access to core safety services.
        </p>
      </section>

      {/* 4. Data Portability (Export) */}
      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-head">
          <div>
            <h3>Data Portability (DPDP Act Sec. 11)</h3>
            <p className="muted">
              Download a complete, machine-readable JSON copy of all your mood logs, assessments, and profile data.
            </p>
          </div>
          <button
            type="button"
            className="primary-btn"
            onClick={handleExport}
            disabled={exporting}
          >
            <Icon name="download" size={16} />
            {exporting ? "Generating Archive…" : "Export My Data Archive"}
          </button>
        </div>
        {exportSuccess && (
          <p className="saved-label" style={{ marginTop: 8 }} role="status">
            ✓ Archive downloaded successfully.
          </p>
        )}
        {exportError && (
          <p
            role="alert"
            data-testid="export-error-alert"
            style={{ color: "var(--danger)", fontWeight: 600, marginTop: 8 }}
          >
            {exportError}
          </p>
        )}
        <p className="muted" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
          <strong>Zero-Knowledge Note:</strong> Personal journals are exported as encrypted ciphertext only (AES-256-GCM). MindSahaay servers never hold your decryption passphrase.
        </p>
      </section>

      {/* 4b. Demo data (sample rows; only ever created by the button) */}
      <DemoDataPanel variant="card" />

      {/* 5. Right to Erasure (Delete Account) */}
      <section className="panel" style={{ border: "1px solid var(--danger)", background: "color-mix(in oklch, var(--danger) 4%, var(--white))" }}>
        <div className="panel-head">
          <div>
            <h3 style={{ color: "var(--danger)" }}>Permanent Account Erasure (Right to be Forgotten)</h3>
            <p className="muted">
              Instantly wipe all local and server health data, encrypted journals, and account identity.
            </p>
          </div>
          <button
            type="button"
            className="primary-btn"
            style={{ background: "#c9222b", borderColor: "#c9222b", color: "#ffffff" }}
            onClick={() => setShowDeleteModal(true)}
          >
            <Icon name="trash" size={16} /> Permanently Erase All Data
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>
          Under Section 12 of the DPDP Act 2023, account deletion is irrevocable and requires no administrative approval.
        </p>
      </section>

      {/* Typed Confirmation Modal for Erasure */}
      {showDeleteModal && (
        <Modal onClose={() => setShowDeleteModal(false)} ariaLabel="Confirm Permanent Account Erasure">
          <div className="modal-head">
            <div>
              <span className="eyebrow" style={{ color: "var(--danger)" }}>IRREVOCABLE ACTION</span>
              <h3 style={{ color: "var(--danger)" }}>Permanently Erase MindSahaay Account?</h3>
            </div>
            <button className="icon-btn" onClick={() => setShowDeleteModal(false)} aria-label="Close modal">
              <Icon name="x" />
            </button>
          </div>

          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink)", margin: "14px 0" }}>
            <p>
              This action will permanently delete all your mood check-ins, assessment history, encrypted
              journals, safety plans, and account credentials from all databases.
            </p>
            <p style={{ marginTop: 10, fontWeight: 700, color: "var(--danger)" }}>
              This cannot be undone. To proceed, please type <strong>DELETE</strong> below:
            </p>
          </div>

          <label htmlFor="confirm-delete-input" className="field-label">
            Type DELETE to confirm:
          </label>
          <input
            id="confirm-delete-input"
            className="social-btn"
            style={{ textAlign: "left", width: "100%", padding: "0 14px", marginBottom: 16 }}
            value={typedConfirmation}
            onChange={(e) => setTypedConfirmation(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
          />

          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              className="primary-btn full"
              style={{
                background: typedConfirmation.trim().toUpperCase() === "DELETE" ? "#c9222b" : "var(--muted)",
                borderColor: typedConfirmation.trim().toUpperCase() === "DELETE" ? "#c9222b" : "var(--muted)",
                color: "#ffffff",
                cursor: typedConfirmation.trim().toUpperCase() === "DELETE" ? "pointer" : "not-allowed",
              }}
              disabled={typedConfirmation.trim().toUpperCase() !== "DELETE" || erasing}
              onClick={handleDeleteAccount}
            >
              {erasing ? "Wiping Records…" : "Confirm Irrevocable Erasure"}
            </button>
            <button
              type="button"
              className="outline-btn full"
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
