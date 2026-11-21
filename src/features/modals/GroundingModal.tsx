import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import "../cbt/i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";

interface GroundingModalProps {
  onClose: () => void;
}

const STEPS = [5, 4, 3, 2, 1] as const;

export default function GroundingModal({ onClose }: GroundingModalProps) {
  const { t } = useTranslation(CONTENT_NS);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggleCheck = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Modal onClose={onClose} ariaLabel={t("tools.grounding.title")} cardStyle={{ maxWidth: 580 }}>
      <div className="modal-head">
        <div>
          <span className="eyebrow green">{t("tools.grounding.eyebrow")}</span>
          <h3>{t("tools.grounding.title")}</h3>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t("tools.grounding.close")}>
          <Icon name="x" />
        </button>
      </div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
        {t("tools.grounding.intro")}
      </p>

      <div className="grounding-box">
        {STEPS.map((n) => {
          const items = t(`tools.grounding.s${n}.items`, { returnObjects: true }) as unknown as string[];
          return (
            <div key={n} className="grounding-step">
              <span className="grounding-num" aria-hidden="true">
                {n}
              </span>
              <div style={{ flex: 1 }}>
                <h4>{t(`tools.grounding.s${n}.title`)}</h4>
                <div className="grounding-items">
                  {(Array.isArray(items) ? items : []).map((item, idx) => {
                    const key = `${n}-${idx}`;
                    const isDone = !!checked[key];
                    return (
                      <button
                        type="button"
                        key={key}
                        className={`grounding-pill min-h-6 ${isDone ? "done" : ""}`}
                        onClick={() => toggleCheck(key)}
                        aria-pressed={isDone}
                      >
                        <span aria-hidden="true">{isDone ? "\u2713" : "\u25CB"}</span> {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button type="button" className="primary-btn full min-h-11" onClick={onClose}>
        {t("tools.grounding.done")}
      </button>
    </Modal>
  );
}
