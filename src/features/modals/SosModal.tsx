import React from "react";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";

interface SosModalProps {
  onClose: () => void;
  openSafetyCard?: () => void;
}

export default function SosModal({ onClose, openSafetyCard }: SosModalProps) {
  return (
    <Modal onClose={onClose} ariaLabel="24/7 Emergency Crisis Support">
      <div className="modal-head">
        <div>
          <span className="eyebrow" style={{ color: "var(--danger)" }}>IMMEDIATE CRISIS ASSISTANCE</span>
          <h3>24/7 Emergency Support</h3>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
          <Icon name="x" />
        </button>
      </div>

      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        If you or someone around you is in immediate danger, experiencing acute distress, or having thoughts of self-harm, please connect with a trained, compassionate professional right now. All calls are free and confidential.
      </p>

      <div className="sos-hotline-list">
        <div className="sos-item">
          <div>
            <strong>Tele-MANAS (Govt. of India)</strong>
            <p>24/7 National Tele Mental Health (20+ Languages)</p>
          </div>
          <a href="tel:14416" className="sos-call-btn" aria-label="Call Tele-MANAS 14416">
            <Icon name="phone" size={14} /> Call 14416
          </a>
        </div>

        <div className="sos-item">
          <div>
            <strong>KIRAN Helpline</strong>
            <p>Ministry of Social Justice & Empowerment (Toll-Free)</p>
          </div>
          <a href="tel:18005990019" className="sos-call-btn" aria-label="Call KIRAN Helpline 1800-599-0019">
            <Icon name="phone" size={14} /> 1800-599-0019
          </a>
        </div>

        <div className="sos-item">
          <div>
            <strong>Vandrevala Foundation</strong>
            <p>24/7 Free Psychological First Aid & Counselling</p>
          </div>
          <a
            href="tel:9999666555"
            className="sos-call-btn"
            style={{ background: "var(--primary-dark)" }}
            aria-label="Call Vandrevala Foundation 9999-666-555"
          >
            <Icon name="phone" size={14} /> 9999-666-555
          </a>
        </div>

        <div className="sos-item">
          <div>
            <strong>Emergency Services</strong>
            <p>Immediate police, ambulance, or medical dispatch</p>
          </div>
          <a
            href="tel:112"
            className="sos-call-btn"
            style={{ background: "#111c18", color: "#ffffff" }}
            aria-label="Dial Emergency Services 112"
          >
            <Icon name="phone" size={14} /> Dial 112
          </a>
        </div>
      </div>

      <div className="care-step" style={{ background: "var(--primary-soft)", marginTop: 12 }}>
        <span className="soft-icon mint"><Icon name="heart" /></span>
        <div>
          <strong>You are not alone</strong>
          <p>Crisis moments are temporary, even when they feel unending. Reaching out is a sign of immense courage.</p>
        </div>
      </div>

      {openSafetyCard && (
        <button
          type="button"
          className="primary-btn full"
          style={{ marginTop: 14 }}
          onClick={() => {
            onClose();
            openSafetyCard();
          }}
        >
          ⭐ View & Print My Sahaay Safety Card
        </button>
      )}

      <button
        type="button"
        className="outline-btn full"
        onClick={onClose}
        style={{ marginTop: openSafetyCard ? 8 : 14 }}
      >
        Close
      </button>
    </Modal>
  );
}
