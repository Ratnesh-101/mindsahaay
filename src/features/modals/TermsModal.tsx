import React from "react";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";

interface TermsModalProps {
  onClose: () => void;
}

export default function TermsModal({ onClose }: TermsModalProps) {
  return (
    <Modal onClose={onClose} ariaLabel="Terms of Care">
      <div className="modal-head">
        <div>
          <span className="eyebrow green">TERMS OF CARE</span>
          <h3>MindSahaay Guidelines</h3>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
          <Icon name="x" />
        </button>
      </div>
      <div style={{ maxHeight: 360, overflowY: "auto", fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>
        <p><strong>1. Educational & Supportive Purpose:</strong> MindSahaay provides psychological wellbeing check-ins, guided grounding tools, and appointment facilitation. It does not replace emergency clinical hospitalisation.</p>
        <p style={{ marginTop: 12 }}><strong>2. 24/7 Crisis Response:</strong> If you are experiencing acute thoughts of self-harm, immediately dial the National Tele-MANAS helpline (14416) or KIRAN (1800-599-0019).</p>
        <p style={{ marginTop: 12 }}><strong>3. Strict University Isolation:</strong> University administration, academic boards, and hostel wardens have zero access to your individual responses.</p>
      </div>
      <button type="button" className="primary-btn full" onClick={onClose} style={{ marginTop: 20 }}>I Understand</button>
    </Modal>
  );
}
