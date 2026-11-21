import React from "react";
import { useTranslation } from "react-i18next";
import "../cbt/i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import Icon, { type IconName } from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";

interface CarePlanModalProps {
  onClose: () => void;
  goDoctors: () => void;
}

const STEPS: { key: "step1" | "step2" | "step3"; icon: IconName; tone: string }[] = [
  { key: "step1", icon: "heart", tone: "mint" },
  { key: "step2", icon: "clock", tone: "lilac" },
  { key: "step3", icon: "doctors", tone: "peach" },
];

export default function CarePlanModal({ onClose, goDoctors }: CarePlanModalProps) {
  const { t } = useTranslation(CONTENT_NS);
  return (
    <Modal onClose={onClose} ariaLabel={t("tools.carePlan.title")}>
      <div className="modal-head">
        <div>
          <span className="eyebrow green">{t("tools.carePlan.eyebrow")}</span>
          <h3>{t("tools.carePlan.title")}</h3>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t("tools.carePlan.close")}>
          <Icon name="x" />
        </button>
      </div>
      <div className="care-plan-list">
        {STEPS.map((s) => (
          <div key={s.key} className="care-step">
            <span className={`soft-icon ${s.tone}`}>
              <Icon name={s.icon} />
            </span>
            <div>
              <strong>{t(`tools.carePlan.${s.key}Title`)}</strong>
              <p>{t(`tools.carePlan.${s.key}`)}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="muted text-xs">{t("tools.carePlan.disclaimer")}</p>
      <div className="care-actions">
        <button
          type="button"
          className="primary-btn full min-h-11"
          onClick={() => {
            onClose();
            goDoctors();
          }}
        >
          {t("tools.carePlan.connect")} <Icon name="arrow" size={17} />
        </button>
      </div>
    </Modal>
  );
}
