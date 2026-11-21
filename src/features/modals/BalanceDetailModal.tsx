import React, { useState } from "react";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";

interface BalanceDetailModalProps {
  habit: [string, string, string, string];
  onClose: () => void;
}

export default function BalanceDetailModal({
  habit,
  onClose,
}: BalanceDetailModalProps) {
  const [val, setVal] = useState(habit[1]);

  return (
    <Modal onClose={onClose} ariaLabel={`${habit[0]} Check-in`}>
      <div className="modal-head">
        <div>
          <span className="eyebrow green">WELLNESS BUILDING BLOCK</span>
          <h3>{habit[0]} Check-in</h3>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
          <Icon name="x" />
        </button>
      </div>
      <div className="session-preview">
        <div className="care-step">
          <span className="soft-icon mint"><Icon name="sparkles" /></span>
          <div>
            <strong>Current: {val}</strong>
            <p>Score: {habit[3]}/100 · Status: {habit[2]}</p>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          Regular {habit[0].toLowerCase()} supports neurochemical equilibrium, reduces exam-period cortisol, and improves cognitive focus.
        </p>
      </div>
      <button
        type="button"
        className="primary-btn full"
        onClick={() => {
          setVal("Updated ✓");
          setTimeout(onClose, 600);
        }}
      >
        + Log 15m {habit[0]} Activity
      </button>
    </Modal>
  );
}
