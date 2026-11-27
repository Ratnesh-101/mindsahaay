import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";
import { fetchReminders, type Reminder } from "../doctors/api";
import { isDemoModeActive } from "../auth/demoMode";

interface NotificationModalProps {
  onClose: () => void;
}

export default function NotificationModal({ onClose }: NotificationModalProps) {
  const { t } = useTranslation(CONTENT_NS);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (isDemoModeActive()) {
      setLoading(false);
      return () => undefined;
    }
    let mounted = true;
    setLoading(true);
    setFailed(false);
    fetchReminders()
      .then((data) => {
        if (mounted) {
          setReminders(data);
          setLoading(false);
        }
      })
      .catch(() => {
        // A failed load must not read as "no notifications".
        if (mounted) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => load(), [load]);

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

      {loading ? (
        <p className="muted" role="status" style={{ padding: "16px 0", fontSize: 13 }}>Loading updates…</p>
      ) : failed ? (
        <div role="alert" style={{ padding: "16px 0" }}>
          <p style={{ color: "var(--danger)", fontWeight: 600, fontSize: 13 }}>{t("notifications.loadError")}</p>
          <button type="button" className="primary-btn" style={{ marginTop: 8 }} onClick={() => void load()}>
            {t("notifications.retry")}
          </button>
        </div>
      ) : reminders.length > 0 ? (
        <div className="care-plan-list">
          {reminders.map((r) => (
            <div key={r.id} className="care-step">
              <span className="soft-icon mint"><Icon name="check" /></span>
              <div>
                <strong>{r.title}</strong>
                <p>{r.body}</p>
                <small className="muted">{new Date(r.createdAt).toLocaleDateString()}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "28px 16px" }}>
          <span className="soft-icon mint large" style={{ margin: "0 auto 12px" }}>
            <Icon name="bell" size={24} />
          </span>
          <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 4px" }}>No new notifications</p>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {"You're all caught up with your appointments and campus updates."}
          </p>
        </div>
      )}

      <button type="button" className="primary-btn full" onClick={onClose} style={{ marginTop: 16 }}>Close</button>
    </Modal>
  );
}
