import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import Icon from "../../shared/ui/Icon";
import { useOnlineStatus } from "../../shared/lib/offline";
import { HELPLINES_LAST_VERIFIED } from "../../shared/lib/pwa/helplines";
import { OFFLINE_UI_NS, formatVerifiedDate } from "../offline-ui/i18n";
import {
  fetchSafetyPlan,
  saveSafetyPlan,
  type SafetyPlan,
  type EmergencyContact,
} from "../../shared/lib/api/safetyPlan";
import { isDemoModeActive } from "../auth/demoMode";
import { getVaultPassphrase } from "../journal/vault";
import { CONTENT_NS } from "../journal/registerBundle";
import "./i18n";
import {
  getSecureItemSync,
  setSecureItem,
  setMemoryCacheItem,
} from "../../shared/lib/storage/secureStore";

/**
 * A brand-new plan is EMPTY: every list starts with one blank row for the student to fill in.
 * The two national helplines are fixed public numbers, not personal data. Nothing here is a
 * placeholder person, place or reason, so a real student never sees invented content as their own plan.
 */
const EMPTY_SAFETY_PLAN: SafetyPlan = {
  warningSigns: [""],
  copingStrategies: [""],
  emergencyContacts: [{ name: "", relationship: "", phone: "" }],
  safeEnvironments: [],
  reasonsToLive: [""],
  professionalSupport: [
    { name: "Tele-MANAS (Govt of India)", role: "24/7 Crisis Helpline", phone: "14416" },
    { name: "KIRAN Mental Health", role: "24/7 National Helpline", phone: "1800-599-0019" },
  ],
  isEncrypted: false,
};

/** Makes sure every editable list has at least one blank row to type into. */
function withEditableRows(plan: SafetyPlan): SafetyPlan {
  return {
    ...plan,
    warningSigns: plan.warningSigns.length ? plan.warningSigns : [""],
    copingStrategies: plan.copingStrategies.length ? plan.copingStrategies : [""],
    emergencyContacts: plan.emergencyContacts.length ? plan.emergencyContacts : [{ name: "", relationship: "", phone: "" }],
    reasonsToLive: plan.reasonsToLive.length ? plan.reasonsToLive : [""],
  };
}

/** Drops blank rows before saving, so empty inputs are never stored as content. */
function withoutBlankRows(plan: SafetyPlan): SafetyPlan {
  const text = (list: string[]) => list.map((s) => s.trim()).filter(Boolean);
  return {
    ...plan,
    warningSigns: text(plan.warningSigns),
    copingStrategies: text(plan.copingStrategies),
    reasonsToLive: text(plan.reasonsToLive),
    emergencyContacts: plan.emergencyContacts.filter((c) => c.name.trim() || c.phone.trim() || c.relationship.trim()),
  };
}

/** True while the student has not written anything yet, so the page can say nothing is saved. */
function isPlanBlank(plan: SafetyPlan): boolean {
  const stripped = withoutBlankRows(plan);
  return (
    stripped.warningSigns.length === 0 &&
    stripped.copingStrategies.length === 0 &&
    stripped.reasonsToLive.length === 0 &&
    stripped.emergencyContacts.length === 0
  );
}

type PlanLoad = "loading" | "ready" | "locked" | "error";
type Notice = { kind: "ok" | "error"; text: string } | null;

export default function CrisisPage() {
  const { t, i18n } = useTranslation(OFFLINE_UI_NS);
  const { t: tc } = useTranslation(CONTENT_NS);
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const [passphrase, setPassphrase] = useState<string>("");
  const [encryptEnabled, setEncryptEnabled] = useState<boolean>(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [unlockPass, setUnlockPass] = useState("");

  const isDemo = isDemoModeActive();

  // Editor state. Real accounts load it from the backend on mount; the offline preview reads this tab's memory.
  const [plan, setPlan] = useState<SafetyPlan>(() => {
    if (isDemo) {
      const cached = getSecureItemSync<SafetyPlan>("demo_safety_plan");
      if (cached.status === "unlocked" && cached.value) {
        return withEditableRows(cached.value);
      }
    }
    return EMPTY_SAFETY_PLAN;
  });
  const [planLoad, setPlanLoad] = useState<PlanLoad>(isDemo ? "ready" : "loading");

  const loadPlan = useCallback(async () => {
    if (isDemo) return;
    setPlanLoad("loading");
    try {
      const stored = await fetchSafetyPlan();
      if (!stored) {
        setPlan(EMPTY_SAFETY_PLAN);
        setPlanLoad("ready");
      } else if (stored.isEncrypted) {
        setPlanLoad("locked");
      } else {
        setPlan(withEditableRows(stored));
        setEncryptEnabled(false);
        setPlanLoad("ready");
      }
    } catch {
      setPlanLoad("error");
    }
  }, [isDemo]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const unlockPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockPass.trim()) return;
    setUnlockError("");
    try {
      const decrypted = await fetchSafetyPlan(unlockPass);
      if (!decrypted || decrypted.isEncrypted) {
        setUnlockError(tc("crisisPlan.wrongPassphrase"));
        return;
      }
      setPlan(withEditableRows(decrypted));
      setPassphrase(unlockPass);
      setEncryptEnabled(true);
      setUnlockPass("");
      setPlanLoad("ready");
    } catch (err) {
      const code = (err as { code?: string }).code;
      setUnlockError(code === "CRYPTO_DECRYPT_FAILED" ? tc("crisisPlan.wrongPassphrase") : tc("crisisPlan.loadError"));
    }
  };

  const startNewPlan = () => {
    setPlan(EMPTY_SAFETY_PLAN);
    setEncryptEnabled(false);
    setPassphrase("");
    setUnlockError("");
    setPlanLoad("ready");
  };

  const activePlan = plan;

  // Helper updates
  const updateWarningSign = (idx: number, val: string) => {
    const updated = [...activePlan.warningSigns];
    updated[idx] = val;
    setPlan({ ...activePlan, warningSigns: updated });
  };

  const addWarningSign = () => {
    setPlan({ ...activePlan, warningSigns: [...activePlan.warningSigns, ""] });
  };

  const updateCoping = (idx: number, val: string) => {
    const updated = [...activePlan.copingStrategies];
    updated[idx] = val;
    setPlan({ ...activePlan, copingStrategies: updated });
  };

  const addCoping = () => {
    setPlan({ ...activePlan, copingStrategies: [...activePlan.copingStrategies, ""] });
  };

  const updateContact = (idx: number, field: keyof EmergencyContact, val: string) => {
    const updated = [...activePlan.emergencyContacts];
    updated[idx] = { ...updated[idx], [field]: val };
    setPlan({ ...activePlan, emergencyContacts: updated });
  };

  const addContact = () => {
    setPlan({
      ...activePlan,
      emergencyContacts: [
        ...activePlan.emergencyContacts,
        { name: "", relationship: "", phone: "" },
      ],
    });
  };

  const updateReason = (idx: number, val: string) => {
    const updated = [...activePlan.reasonsToLive];
    updated[idx] = val;
    setPlan({ ...activePlan, reasonsToLive: updated });
  };

  const addReason = () => {
    setPlan({ ...activePlan, reasonsToLive: [...activePlan.reasonsToLive, ""] });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setNotice(null);
    const wantsEncryption = encryptEnabled;
    if (wantsEncryption && !passphrase.trim()) {
      setNotice({ kind: "error", text: tc("crisisPlan.needPassphrase") });
      return;
    }
    setSaving(true);
    const toSave = withoutBlankRows(activePlan);
    try {
      if (!isDemo) {
        // saveSafetyPlan throws unless the backend confirmed the write, so the success notice below is truthful.
        await saveSafetyPlan(toSave, wantsEncryption ? passphrase : undefined);
        await queryClient.invalidateQueries({ queryKey: ["safety_plan"] });
        setPlan(withEditableRows(toSave));
        setNotice({ kind: "ok", text: tc("crisisPlan.saved") });
      } else {
        const vaultPass = getVaultPassphrase();
        const activePass = (wantsEncryption && passphrase.trim()) || vaultPass || "";
        if (activePass) {
          const result = await setSecureItem("demo_safety_plan", toSave, activePass);
          if (result.status !== "ok") {
            setNotice({ kind: "error", text: tc("crisisPlan.saveError") });
            return;
          }
          setNotice({ kind: "ok", text: tc("crisisPlan.savedDevice") });
        } else {
          setMemoryCacheItem("demo_safety_plan", toSave);
          setNotice({ kind: "ok", text: tc("crisisPlan.savedPreview") });
        }
        try {
          if (typeof localStorage !== "undefined") {
            localStorage.removeItem("mindsahaay_demo_safety_plan");
          }
        } catch {
          // ignore
        }
      }
    } catch {
      setNotice({ kind: "error", text: tc("crisisPlan.saveError") });
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="page crisis-page" style={{ maxWidth: 960, margin: "0 auto" }}>
      <header className="directory-head" style={{ marginBottom: 20 }}>
        <div>
          <span className="eyebrow" style={{ color: "var(--danger)", fontWeight: 800 }}>
            STANLEY-BROWN CRISIS PROTOCOL
          </span>
          <h1>Crisis Assistance & Safety Plan</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            In moments of acute overwhelm or distress, conscious problem solving drops. Having pre-identified
            anchors and one-tap helplines protects you.
          </p>
        </div>
      </header>

      {/* 24/7 Verified One-Tap Helplines Card */}
      <section className="panel" style={{ borderLeft: "4px solid var(--danger)", marginBottom: 28 }}>
        <div className="panel-head">
          <div>
            <h3 style={{ color: "var(--danger)" }}>Immediate 24/7 National Crisis Helplines</h3>
            <p className="muted">All calls are toll-free, confidential, and completely independent of your university.</p>
          </div>
        </div>

        <p className="muted" style={{ fontSize: 13, marginTop: 8 }} data-testid="helplines-verified">
          {t("crisis.verified", { date: formatVerifiedDate(HELPLINES_LAST_VERIFIED, i18n.language) })}
        </p>
        {!online && (
          <p role="status" style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }} data-testid="crisis-offline-note">
            {t("crisis.offlineNote")}
          </p>
        )}

        <div className="sos-hotline-list" style={{ marginTop: 12 }}>
          <div className="sos-item" style={{ background: "var(--canvas)", borderColor: "var(--danger)" }}>
            <div>
              <strong style={{ fontSize: 16 }}>Tele-MANAS (Ministry of Health & Family Welfare)</strong>
              <p>24/7 Comprehensive Mental Health Support in 20+ Indian Languages</p>
            </div>
            <a href="tel:14416" className="sos-call-btn" aria-label="Call Tele-MANAS at 14416">
              <Icon name="phone" size={15} /> Call 14416
            </a>
          </div>

          <div className="sos-item" style={{ background: "var(--canvas)", borderColor: "var(--danger)" }}>
            <div>
              <strong style={{ fontSize: 16 }}>Tele-MANAS Alternate Toll-Free</strong>
              <p>Toll-free national landline & mobile backup number</p>
            </div>
            <a href="tel:18008914416" className="sos-call-btn" aria-label="Call Tele-MANAS toll free at 1800-891-4416">
              <Icon name="phone" size={15} /> 1800-891-4416
            </a>
          </div>

          <div className="sos-item" style={{ background: "var(--canvas)", borderColor: "var(--danger)" }}>
            <div>
              <strong style={{ fontSize: 16 }}>KIRAN Mental Health Rehabilitation Helpline</strong>
              <p>Department of Empowerment of Persons with Disabilities (DEPwD), 24/7</p>
            </div>
            <a href="tel:18005990019" className="sos-call-btn" aria-label="Call KIRAN Helpline at 1800-599-0019">
              <Icon name="phone" size={15} /> 1800-599-0019
            </a>
          </div>

          <div className="sos-item" style={{ background: "var(--canvas)", borderColor: "var(--danger)" }}>
            <div>
              <strong style={{ fontSize: 16 }}>National Emergency Services (All-in-One)</strong>
              <p>Immediate police, ambulance, or medical emergency dispatch</p>
            </div>
            <a
              href="tel:112"
              className="sos-call-btn"
              style={{ background: "#111c18", color: "#ffffff" }}
              aria-label="Dial Emergency 112"
            >
              <Icon name="phone" size={15} /> Dial 112
            </a>
          </div>
        </div>
      </section>

      {/* Stanley-Brown Safety Plan Editor */}
      <section className="panel" style={{ marginBottom: 28 }}>
        <div className="panel-head">
          <div>
            <h3>Stanley-Brown Evidence-Based Safety Plan</h3>
            <p className="muted">
              Step-by-step coping hierarchy designed to de-escalate crisis episodes and keep you safe.
            </p>
          </div>
          <button type="button" className="outline-btn" onClick={handlePrint} aria-label="Print wallet card">
            <Icon name="download" size={16} /> Print Wallet Card
          </button>
        </div>

        {planLoad === "loading" ? (
          <p className="muted" role="status">{tc("crisisPlan.loading")}</p>
        ) : planLoad === "error" ? (
          <div role="alert" data-testid="plan-load-error">
            <p style={{ color: "var(--danger)", fontWeight: 600 }}>{tc("crisisPlan.loadError")}</p>
            <button type="button" className="primary-btn" style={{ marginTop: 8 }} onClick={() => void loadPlan()}>
              {tc("common.retry")}
            </button>
          </div>
        ) : planLoad === "locked" ? (
          <form onSubmit={(e) => void unlockPlan(e)} aria-labelledby="plan-locked-title" data-testid="plan-locked">
            <h4 id="plan-locked-title" style={{ fontWeight: 700 }}>{tc("crisisPlan.lockedTitle")}</h4>
            <p className="muted" style={{ margin: "6px 0 12px" }}>{tc("crisisPlan.lockedBody")}</p>
            <label className="field-label" htmlFor="plan-unlock-pass">{tc("crisisPlan.unlockLabel")}</label>
            <input
              id="plan-unlock-pass"
              type="password"
              autoComplete="current-password"
              value={unlockPass}
              onChange={(e) => setUnlockPass(e.target.value)}
              className="social-btn"
              style={{ textAlign: "left", width: "100%", padding: "0 14px" }}
            />
            {unlockError && (
              <p role="alert" style={{ color: "var(--danger)", fontWeight: 600, marginTop: 8 }}>{unlockError}</p>
            )}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
              <button type="submit" className="primary-btn">{tc("crisisPlan.unlock")}</button>
              <button type="button" className="text-btn" onClick={startNewPlan}>{tc("crisisPlan.startNew")}</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{tc("crisisPlan.startNewNote")}</p>
          </form>
        ) : (
          <form onSubmit={handleSave}>
            {isPlanBlank(activePlan) && (
              <p className="muted" style={{ marginBottom: 14 }} data-testid="plan-empty-hint">
                {tc("crisisPlan.emptyHint")}
              </p>
            )}
            <fieldset style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <legend style={{ fontWeight: 700, fontSize: 13, padding: "0 8px" }}>
                Step 1: My Personal Warning Signs (Thoughts, images, mood, behavior)
              </legend>
              {activePlan.warningSigns.map((sign, idx) => (
                <div key={idx} style={{ marginBottom: 8 }}>
                  <input
                    className="social-btn"
                    style={{ textAlign: "left", width: "100%", padding: "0 14px", fontWeight: "normal" }}
                    value={sign}
                    onChange={(e) => updateWarningSign(idx, e.target.value)}
                    placeholder={`Warning sign ${idx + 1}`}
                    aria-label={`Warning sign ${idx + 1}`}
                  />
                </div>
              ))}
              <button type="button" className="text-btn" onClick={addWarningSign} style={{ fontSize: 13 }}>
                + Add another warning sign
              </button>
            </fieldset>

            {/* Step 2: Internal Coping Strategies */}
            <fieldset style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <legend style={{ fontWeight: 700, fontSize: 13, padding: "0 8px" }}>
                Step 2: Internal Coping Strategies (Things I can do without contacting another person)
              </legend>
              {activePlan.copingStrategies.map((coping, idx) => (
                <div key={idx} style={{ marginBottom: 8 }}>
                  <input
                    className="social-btn"
                    style={{ textAlign: "left", width: "100%", padding: "0 14px", fontWeight: "normal" }}
                    value={coping}
                    onChange={(e) => updateCoping(idx, e.target.value)}
                    placeholder={`Coping strategy ${idx + 1}`}
                    aria-label={`Coping strategy ${idx + 1}`}
                  />
                </div>
              ))}
              <button type="button" className="text-btn" onClick={addCoping} style={{ fontSize: 13 }}>
                + Add another coping strategy
              </button>
            </fieldset>

            {/* Step 3: Emergency Contacts / Trusted Peers */}
            <fieldset style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <legend style={{ fontWeight: 700, fontSize: 13, padding: "0 8px" }}>
                Step 3: Trusted People I Can Call (Roommates, friends, family)
              </legend>
              {activePlan.emergencyContacts.map((contact, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr", gap: 10, marginBottom: 10 }}>
                  <input
                    className="social-btn"
                    style={{ textAlign: "left", width: "100%", padding: "0 12px", fontWeight: "normal" }}
                    value={contact.name}
                    onChange={(e) => updateContact(idx, "name", e.target.value)}
                    placeholder="Contact Name"
                    aria-label={`Contact ${idx + 1} Name`}
                  />
                  <input
                    className="social-btn"
                    style={{ textAlign: "left", width: "100%", padding: "0 12px", fontWeight: "normal" }}
                    value={contact.relationship}
                    onChange={(e) => updateContact(idx, "relationship", e.target.value)}
                    placeholder="Relationship (e.g. Roommate)"
                    aria-label={`Contact ${idx + 1} Relationship`}
                  />
                  <input
                    className="social-btn"
                    style={{ textAlign: "left", width: "100%", padding: "0 12px", fontWeight: "normal" }}
                    value={contact.phone}
                    onChange={(e) => updateContact(idx, "phone", e.target.value)}
                    placeholder="Phone number"
                    aria-label={`Contact ${idx + 1} Phone`}
                  />
                </div>
              ))}
              <button type="button" className="text-btn" onClick={addContact} style={{ fontSize: 13 }}>
                + Add another contact
              </button>
            </fieldset>

            {/* Step 4: Reasons for Living */}
            <fieldset style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <legend style={{ fontWeight: 700, fontSize: 13, padding: "0 8px" }}>
                Step 4: Reasons for Living (The things that are most important to me)
              </legend>
              {activePlan.reasonsToLive.map((reason, idx) => (
                <div key={idx} style={{ marginBottom: 8 }}>
                  <input
                    className="social-btn"
                    style={{ textAlign: "left", width: "100%", padding: "0 14px", fontWeight: "normal" }}
                    value={reason}
                    onChange={(e) => updateReason(idx, e.target.value)}
                    placeholder={`Reason ${idx + 1}`}
                    aria-label={`Reason for living ${idx + 1}`}
                  />
                </div>
              ))}
              <button type="button" className="text-btn" onClick={addReason} style={{ fontSize: 13 }}>
                + Add another reason to live
              </button>
            </fieldset>

            {/* Client-Side Encryption Option */}
            <div
              style={{
                background: "var(--canvas)",
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={encryptEnabled}
                  onChange={(e) => setEncryptEnabled(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: "var(--primary)" }}
                />
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  Enable Zero-Knowledge AES-256-GCM Encryption on this plan
                </span>
              </label>

              {encryptEnabled && (
                <div style={{ marginTop: 12 }}>
                  <label className="field-label" htmlFor="plan-passphrase">
                    Encryption Passphrase (Never sent to the server)
                  </label>
                  <input
                    id="plan-passphrase"
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Enter private passphrase to decrypt plan"
                    className="social-btn"
                    style={{ textAlign: "left", width: "100%", padding: "0 14px" }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button type="submit" className="primary-btn" disabled={saving}>
                <Icon name="check" size={16} />
                {saving ? tc("crisisPlan.saving") : "Save Safety Plan"}
              </button>
            </div>
            <p role="status" aria-live="polite" className={notice?.kind === "ok" ? "saved-label" : "sr-only"} style={{ marginTop: 10 }}>
              {notice?.kind === "ok" ? "\u2713 " + notice.text : ""}
            </p>
            {notice?.kind === "error" && (
              <p role="alert" style={{ color: "var(--danger)", fontWeight: 600, marginTop: 10 }}>
                {notice.text}
              </p>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
