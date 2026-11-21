import React from "react";
import { useTranslation } from "react-i18next";
import "../doctors/i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import type { Appointment } from "../doctors/api";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";

interface BookingConfirmationModalProps {
  appointment: Appointment;
  onClose: () => void;
}

export default function BookingConfirmationModal({ appointment, onClose }: BookingConfirmationModalProps) {
  const { t } = useTranslation(CONTENT_NS);
  return (
    <Modal onClose={onClose} ariaLabel={t("booking.title")}>
      <div className="modal-head">
        <div>
          <span className="eyebrow green">{t("booking.eyebrow")}</span>
          <h3>{t("booking.title")}</h3>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t("booking.close")}>
          <Icon name="x" />
        </button>
      </div>
      <div className="session-preview">
        <div className="care-step" style={{ background: "var(--primary-soft)" }}>
          <span className="soft-icon mint">
            <Icon name="check" />
          </span>
          <div>
            <strong>{t("booking.ref", { id: appointment.id })}</strong>
            <p>
              {t("booking.details", {
                name: appointment.doctorName,
                date: appointment.scheduledFor,
                time: appointment.slotTime,
              })}
            </p>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          {t("booking.privacy")}
        </p>
      </div>
      <button type="button" className="primary-btn full min-h-11" onClick={onClose}>
        {t("booking.done")}
      </button>
    </Modal>
  );
}
