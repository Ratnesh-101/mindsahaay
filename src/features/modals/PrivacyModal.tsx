import React, { useState } from "react";
import { wellnessApi } from "../../api";
import { exportStudentData, deleteStudentAccount } from "../../shared/lib/api/account";
import { isDemoModeActive } from "../auth/demoMode";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";

interface PrivacyModalProps {
  studentId: string;
  onClose: () => void;
}

export default function PrivacyModal({ studentId, onClose }: PrivacyModalProps) {
  const [exported, setExported] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const isDemo = isDemoModeActive();

  const handleExport = async () => {
    try {
      let data;
      if (!isDemo) {
        data = await exportStudentData();
      } else {
        data = await wellnessApi.exportStudentData(studentId);
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mindsahaay-data-${studentId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExported(true);
    } catch {
      alert("Export failed. Please check connection.");
    }
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to permanently erase all your data from this device and server? This action cannot be undone under DPDP Act 2023.")) {
      try {
        if (!isDemo) {
          await deleteStudentAccount();
        } else {
          await wellnessApi.deleteStudentData(studentId);
        }
        setDeleted(true);
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch {
        alert("Deletion failed. Please try again.");
      }
    }
  };

  return (
    <Modal onClose={onClose} ariaLabel="Privacy and Data Rights">
      <div className="modal-head">
        <div>
          <span className="eyebrow green">DPDP ACT 2023 COMPLIANCE</span>
          <h3>Privacy & Data Rights</h3>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close modal">
          <Icon name="x" />
        </button>
      </div>
      <div className="care-plan-list">
        <div className="care-step">
          <span className="soft-icon mint"><Icon name="shield" /></span>
          <div>
            <strong>Strict Confidentiality</strong>
            <p>Under Section 23 of the Mental Healthcare Act 2017, all assessment scores, notes, and therapist appointments are legally protected.</p>
          </div>
        </div>
        <div className="care-step">
          <span className="soft-icon lilac"><Icon name="download" /></span>
          <div>
            <strong>Right to Data Portability (Sec. 11)</strong>
            <p>Download an export of all your wellness check-ins, mood logs, and appointments in JSON format.</p>
            <button type="button" className="text-btn" onClick={handleExport} style={{ marginTop: 6 }}>
              {exported ? "✓ Data Exported" : "Download My Wellness Archive"}
            </button>
          </div>
        </div>
        <div className="care-step">
          <span className="soft-icon peach"><Icon name="trash" /></span>
          <div>
            <strong>Right to Erasure (Right to be Forgotten)</strong>
            <p>Permanently delete all records of your assessments, chat history, and identity from this device and server.</p>
            <button
              type="button"
              className="text-btn"
              onClick={handleDelete}
              style={{ color: "var(--danger)", marginTop: 6 }}
            >
              {deleted ? "Records Erased..." : "Permanently Erase All My Data"}
            </button>
          </div>
        </div>
      </div>
      <button type="button" className="primary-btn full" onClick={onClose}>Close</button>
    </Modal>
  );
}
