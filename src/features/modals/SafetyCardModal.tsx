import React, { useState, useEffect } from "react";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";
import { useVaultPassphrase } from "../journal/vault";
import VaultGate from "../journal/VaultGate";
import {
  getSecureItemSync,
  setSecureItemSync,
} from "../../shared/lib/storage/secureStore";

interface SafetyCardModalProps {
  student: { name: string; institution: string };
  onClose: () => void;
}

interface SafetyCardData {
  anchor1: string;
  anchor2: string;
  anchor3: string;
  trustedFriend: string;
}

const GENERIC_ANCHOR_1 = "Ice water on face & wrists + 4-7-8 breathing";
const GENERIC_ANCHOR_2 = "Step outside hostel block to the campus lawn";
const GENERIC_ANCHOR_3 = "Play 432Hz Tibetan Bowl soundscape with eyes closed";
const GENERIC_FRIEND = "Campus Counsellor / Peer Support";

export default function SafetyCardModal({ student, onClose }: SafetyCardModalProps) {
  const passphrase = useVaultPassphrase();
  const isUnlocked = Boolean(passphrase);

  const [showUnlockFlow, setShowUnlockFlow] = useState(false);

  // In-memory anchor state
  const [anchor1, setAnchor1] = useState(GENERIC_ANCHOR_1);
  const [anchor2, setAnchor2] = useState(GENERIC_ANCHOR_2);
  const [anchor3, setAnchor3] = useState(GENERIC_ANCHOR_3);
  const [trustedFriend, setTrustedFriend] = useState(GENERIC_FRIEND);
  const [saved, setSaved] = useState(false);

  // Synchronize with secureStore when vault is unlocked
  useEffect(() => {
    if (isUnlocked) {
      const cached = getSecureItemSync<SafetyCardData>("safety_card");
      if (cached.status === "unlocked" && cached.value) {
        setAnchor1(cached.value.anchor1 || GENERIC_ANCHOR_1);
        setAnchor2(cached.value.anchor2 || GENERIC_ANCHOR_2);
        setAnchor3(cached.value.anchor3 || GENERIC_ANCHOR_3);
        setTrustedFriend(cached.value.trustedFriend || "Kabir (Roommate) · +91 98765 43210");
      }
    } else {
      // Revert to generic safe defaults when locked
      setAnchor1(GENERIC_ANCHOR_1);
      setAnchor2(GENERIC_ANCHOR_2);
      setAnchor3(GENERIC_ANCHOR_3);
      setTrustedFriend(GENERIC_FRIEND);
    }
  }, [isUnlocked]);

  const handleSave = () => {
    if (!isUnlocked) return;
    const cardData: SafetyCardData = {
      anchor1,
      anchor2,
      anchor3,
      trustedFriend,
    };
    setSecureItemSync("safety_card", cardData);

    // Purge legacy plaintext keys from localStorage
    try {
      localStorage.removeItem("mindsahaay-anchor1");
      localStorage.removeItem("mindsahaay-anchor2");
      localStorage.removeItem("mindsahaay-anchor3");
      localStorage.removeItem("mindsahaay-friend");
    } catch {
      // ignore
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal onClose={onClose} ariaLabel="My Sahaay Safety Card" className="safety-card-modal-body">
      <div className="modal-head">
        <div>
          <span className="eyebrow" style={{ color: "var(--danger)" }}>STANLEY-BROWN CRISIS PROTOCOL</span>
          <h3>My Sahaay Safety Card</h3>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
          <Icon name="x" />
        </button>
      </div>

      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        {"When acute panic or crisis sets in, prefrontal cognitive thinking decreases. Keep your personalized crisis coping anchors saved or folded in your wallet."}
      </p>

      {/* Safety Card Wallet Preview: Always accessible even with locked vault */}
      <div className="wallet-card-preview" id="safety-wallet-card" aria-label="Physical wallet safety card format">
        <div className="card-top-header">
          <div className="card-logo">
            <span className="card-heart" aria-hidden="true">❤️</span>
            <div>
              <strong>MindSahaay Crisis Safety Card</strong>
              <small>National Student Mental Health Protocol</small>
            </div>
          </div>
          <div className="chip-graphic" aria-hidden="true" />
        </div>

        <div className="card-student-row">
          <span>Student: <strong>{student.name}</strong></span>
          <span>Campus: <strong>{student.institution}</strong></span>
        </div>

        <div className="card-anchors-section">
          <span className="card-section-label">MY 3 IMMEDIATE GROUNDING ANCHORS:</span>
          <ol className="anchors-list">
            <li>{anchor1}</li>
            <li>{anchor2}</li>
            <li>{anchor3}</li>
          </ol>
        </div>

        {/* 24/7 Verified Helplines: Always static in code, never stored in storage */}
        <div className="card-hotlines-grid">
          <div className="hotline-box">
            <span className="box-title">Tele-MANAS (Govt of India 24/7)</span>
            <strong>Dial 14416</strong>
          </div>
          <div className="hotline-box">
            <span className="box-title">KIRAN Mental Health</span>
            <strong>1800-599-0019</strong>
          </div>
          <div className="hotline-box">
            <span className="box-title">Campus Security / Police</span>
            <strong>Dial 112</strong>
          </div>
          <div className="hotline-box friend">
            <span className="box-title">Trusted Peer / Emergency Contact</span>
            <strong>{trustedFriend}</strong>
          </div>
        </div>
      </div>

      {/* Customization Section: Locked gate or Unlocked Edit Form */}
      {!isUnlocked ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-4 my-4">
          {!showUnlockFlow ? (
            <div className="flex flex-col items-start gap-2">
              <span className="eyebrow green">PERSONAL CRISIS ANCHORS</span>
              <p className="text-sm font-semibold">
                {"Your personal anchors and roommate contact are encrypted in your vault."}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {"You can use the generic grounding anchors and 24/7 helplines above immediately without unlocking."}
              </p>
              <button
                type="button"
                className="outline-btn min-h-11 mt-1"
                onClick={() => setShowUnlockFlow(true)}
              >
                <Icon name="shield" size={16} /> {"Unlock Vault for Personal Anchors"}
              </button>
            </div>
          ) : (
            <div className="mt-2">
              <VaultGate>
                <p className="text-sm font-semibold text-[var(--primary)] py-2">
                  {"Vault unlocked! Your personal anchors are loaded below."}
                </p>
              </VaultGate>
            </div>
          )}
        </div>
      ) : (
        <div className="safety-card-form">
          <span className="eyebrow green">CUSTOMIZE YOUR PERSONAL ANCHORS</span>
          <div className="field-group">
            <label className="field-label" htmlFor="a1">Anchor 1 (Somatic / Physical Shock)</label>
            <input id="a1" value={anchor1} onChange={(e) => setAnchor1(e.target.value)} placeholder="e.g. Ice water on face + 4-7-8 breathing" />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="a2">Anchor 2 (Environment Shift)</label>
            <input id="a2" value={anchor2} onChange={(e) => setAnchor2(e.target.value)} placeholder="e.g. Step outside hostel to campus lawn" />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="a3">Anchor 3 (Cognitive / Audio Anchor)</label>
            <input id="a3" value={anchor3} onChange={(e) => setAnchor3(e.target.value)} placeholder="e.g. Play 432Hz Tibetan Bowl soundscape" />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="friend">Trusted Roommate / Campus Contact</label>
            <input id="friend" value={trustedFriend} onChange={(e) => setTrustedFriend(e.target.value)} placeholder="Name & Contact number" />
          </div>
        </div>
      )}

      <div className="safety-actions-row">
        {isUnlocked && (
          <button type="button" className="primary-btn" onClick={handleSave}>
            <Icon name="check" size={16} /> {saved ? "Saved to Card!" : "Save Anchors"}
          </button>
        )}
        <button type="button" className="outline-btn" onClick={handlePrint}>
          <Icon name="download" size={16} /> Print Wallet Card
        </button>
      </div>
    </Modal>
  );
}
