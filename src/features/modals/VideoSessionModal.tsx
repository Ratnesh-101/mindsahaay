import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "../doctors/i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { buildDailyEmbedUrl, requestVideoToken, type Appointment } from "../doctors/api";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";

interface VideoSessionModalProps {
  appointment?: Appointment | null;
  onClose: () => void;
}

type RoomState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; src: string }
  | { kind: "invalid" }
  | { kind: "error" };

/** Daily.co prebuilt room inside an iframe, opened with a short-lived token from POST /appointments/:id/video-token. */
export default function VideoSessionModal({ appointment, onClose }: VideoSessionModalProps) {
  const { t } = useTranslation(CONTENT_NS);
  const [room, setRoom] = useState<RoomState>(appointment?.id ? { kind: "loading" } : { kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const appointmentId = appointment?.id;

  const connect = useCallback(async () => {
    if (!appointmentId) return;
    setRoom({ kind: "loading" });
    try {
      const { roomUrl, token } = await requestVideoToken(appointmentId);
      const src = buildDailyEmbedUrl(roomUrl, token);
      setRoom(src ? { kind: "ready", src } : { kind: "invalid" });
    } catch {
      setRoom({ kind: "error" });
    }
  }, [appointmentId]);

  useEffect(() => {
    void connect();
  }, [connect, attempt]);

  const backup = appointment?.meetingUrl && /^https:\/\//.test(appointment.meetingUrl) ? appointment.meetingUrl : null;

  return (
    <Modal onClose={onClose} ariaLabel={t("video.title")} cardStyle={{ maxWidth: 760 }}>
      <div className="modal-head">
        <div>
          <span className="eyebrow green">{t("video.eyebrow")}</span>
          <h3>{t("video.title")}</h3>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t("video.close")}>
          <Icon name="x" />
        </button>
      </div>

      {appointment && (
        <p className="mb-3 text-sm">
          <strong>{appointment.doctorName}</strong> ·{" "}
          {t("video.scheduled", { date: appointment.scheduledFor, time: appointment.slotTime })}
        </p>
      )}

      {room.kind === "idle" && <p className="muted">{t("video.noAppointment")}</p>}

      {room.kind === "loading" && (
        <p role="status" aria-live="polite" className="muted">
          {t("video.preparing")}
        </p>
      )}

      {room.kind === "ready" && (
        <iframe
          title={t("video.iframeTitle", { name: appointment?.doctorName ?? "" })}
          src={room.src}
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          className="h-[420px] w-full rounded-xl border border-[var(--line)] bg-[var(--canvas)]"
        />
      )}

      {(room.kind === "error" || room.kind === "invalid") && (
        <div role="alert" className="rounded-xl border border-[var(--danger)] bg-[var(--amber-soft)] p-3 text-sm">
          <p>{room.kind === "invalid" ? t("video.invalidRoom") : t("video.error")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="primary-btn min-h-11" onClick={() => setAttempt((n) => n + 1)}>
              {t("video.retry")}
            </button>
            {backup && (
              <a href={backup} target="_blank" rel="noreferrer noopener" className="outline-btn inline-flex min-h-11 items-center no-underline">
                {t("video.backupLink")}
              </a>
            )}
          </div>
        </div>
      )}

      <p className="muted mt-3 text-xs">{t("video.privacy")}</p>
    </Modal>
  );
}
