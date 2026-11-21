import React from "react";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";

interface NotificationModalProps {
  onClose: () => void;
}

export default function NotificationModal({ onClose }: NotificationModalProps) {
  return (
    <Modal onClose={onClose} ariaLabel="Notifications">
      <div className="modal-head">
        <div>
          <span className="eyebrow green">CAMPUS UPDATES</span>
          <h3>Notifications</h3>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
          <Icon name="x" />
        </button>
      </div>
      <div className="care-plan-list">
        <div className="care-step">
          <span className="soft-icon mint"><Icon name="check" /></span>
          <div>
            <strong>Weekly Screening Scheduled</strong>
            <p>Your weekly wellbeing screening is available every Friday.</p>
          </div>
        </div>
        <div className="care-step">
          <span className="soft-icon lilac"><Icon name="volume" /></span>
          <div>
            <strong>Sleep Soundscapes Active</strong>
            <p>Use the ambient rain / 432Hz soundscape in the top bar to aid study focus or nighttime sleep.</p>
          </div>
        </div>
      </div>
      <button type="button" className="primary-btn full" onClick={onClose}>Close</button>
    </Modal>
  );
}
