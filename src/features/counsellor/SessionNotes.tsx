import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { useVaultPassphrase } from "../journal/vault";
import { errorClass, fieldClass, hintClass, labelClass, noticeClass } from "../journal/ui";
import {
  fetchAppointmentsWithStudent,
  fetchSessionNotes,
  saveSessionNote,
  type AppointmentOption,
  type SessionNote,
} from "./api";

/** Encrypted session notes for one student. Render inside a VaultGate so a passphrase is available. */
export default function SessionNotes({ studentId }: { studentId: string }) {
  const { t } = useTranslation(CONTENT_NS);
  const passphrase = useVaultPassphrase();
  const [appointments, setAppointments] = useState<AppointmentOption[]>([]);
  const [appointmentId, setAppointmentId] = useState("");
  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!passphrase) return;
    try {
      const [appts, existing] = await Promise.all([fetchAppointmentsWithStudent(studentId), fetchSessionNotes(studentId, passphrase)]);
      setAppointments(appts);
      setAppointmentId((cur) => cur || appts[0]?.id || "");
      setNotes(existing);
      setError("");
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code === "CRYPTO_DECRYPT_FAILED" ? t("counsellor.noteLoadError") : t("counsellor.noteFetchError"));
    }
  }, [studentId, passphrase, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase || saving) return;
    if (!text.trim() || !appointmentId) {
      setError(t("counsellor.noteRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const note = await saveSessionNote({ appointmentId, studentId, text: text.trim() }, passphrase);
      setNotes((prev) => [note, ...prev]);
      setText("");
      setStatus(t("counsellor.noteSaved"));
    } catch {
      setError(t("counsellor.noteError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="notes-title">
      <h3 id="notes-title" className="font-bold">
        {t("counsellor.notesTitle")}
      </h3>
      <p className={hintClass}>{t("counsellor.notesIntro")}</p>

      {appointments.length === 0 ? (
        <p className="muted mt-2">{t("counsellor.noteAppointmentNone")}</p>
      ) : (
        <form className="mt-2 flex flex-col gap-2" onSubmit={(e) => void save(e)} noValidate>
          <label htmlFor="note-appt" className={labelClass}>
            {t("counsellor.noteAppointment")}
          </label>
          <select id="note-appt" className={fieldClass} value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)}>
            {appointments.map((a) => (
              <option key={a.id} value={a.id}>
                {new Date(a.scheduledAt).toLocaleString()}
              </option>
            ))}
          </select>
          <label htmlFor="note-text" className={labelClass}>
            {t("counsellor.noteLabel")}
          </label>
          <textarea id="note-text" className={`${fieldClass} min-h-24`} value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="primary-btn min-h-11 self-start" disabled={saving}>
            {saving ? t("counsellor.noteSaving") : t("counsellor.noteSave")}
          </button>
        </form>
      )}
      <p role="status" aria-live="polite" className={status ? `${noticeClass} mt-2` : "sr-only"}>
        {status}
      </p>
      {error && (
        <p role="alert" className={`${errorClass} mt-2`}>
          {error}
        </p>
      )}
      <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl border border-[var(--line)] p-3">
            <p className={hintClass}>{new Date(n.createdAt).toLocaleString()}</p>
            <p className="whitespace-pre-wrap text-sm">{n.text}</p>
          </li>
        ))}
      </ul>
      {notes.length === 0 && !error && <p className="muted mt-2">{t("counsellor.noteEmpty")}</p>}
    </section>
  );
}
