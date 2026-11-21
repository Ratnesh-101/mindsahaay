import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { errorClass, fieldClass, hintClass, labelClass, noticeClass } from "../journal/ui";
import Icon from "../../shared/ui/Icon";
import VideoSessionModal from "../modals/VideoSessionModal";
import {
  bookAppointment,
  cancelAppointment,
  canCancel,
  fetchCounsellors,
  fetchMyAppointments,
  fetchReminders,
  fetchSlots,
  toHostAppointment,
  type Appointment,
  type Counsellor,
  type MyAppointment,
  type Reminder,
  type Slot,
} from "./api";

interface DoctorsProps {
  /** Kept for compatibility; identity comes from the Supabase session. */
  studentId?: string;
  onBookSuccess: (appt: Appointment) => void;
}

type Load = "loading" | "ready" | "error";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default function Doctors({ onBookSuccess }: DoctorsProps) {
  const { t } = useTranslation(CONTENT_NS);
  const [counsellors, setCounsellors] = useState<Counsellor[]>([]);
  const [load, setLoad] = useState<Load>("loading");
  const [filter, setFilter] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotLoad, setSlotLoad] = useState<Load>("ready");
  const [slotId, setSlotId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [appointments, setAppointments] = useState<MyAppointment[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [pendingCancel, setPendingCancel] = useState<string | null>(null);
  const [videoFor, setVideoFor] = useState<Appointment | null>(null);

  const loadCounsellors = useCallback(async () => {
    setLoad("loading");
    try {
      const list = await fetchCounsellors();
      setCounsellors(list);
      setSelectedId((cur) => cur ?? list[0]?.id ?? null);
      setLoad("ready");
    } catch {
      setLoad("error");
    }
  }, []);

  const loadMine = useCallback(async () => {
    try {
      const [mine, notes2] = await Promise.all([fetchMyAppointments(), fetchReminders()]);
      setAppointments(mine);
      setReminders(notes2);
    } catch {
      // The directory stays usable; the appointments panel simply shows its empty state.
    }
  }, []);

  useEffect(() => {
    void loadCounsellors();
    void loadMine();
  }, [loadCounsellors, loadMine]);

  const loadSlots = useCallback(async (id: string) => {
    setSlotLoad("loading");
    setSlotId(null);
    try {
      setSlots(await fetchSlots(id));
      setSlotLoad("ready");
    } catch {
      setSlotLoad("error");
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadSlots(selectedId);
  }, [selectedId, loadSlots]);

  const specialisations = useMemo(
    () => Array.from(new Set(counsellors.flatMap((c) => c.specializations))).sort(),
    [counsellors],
  );
  const visible = useMemo(
    () => counsellors.filter((c) => filter === "All" || c.specializations.includes(filter)),
    [counsellors, filter],
  );
  const current = counsellors.find((c) => c.id === selectedId) ?? null;
  const chosenSlot = slots.find((s) => s.id === slotId) ?? null;

  const nameFor = (id: string) => counsellors.find((c) => c.id === id)?.name ?? t("doctors.counsellorFallback");

  const book = async () => {
    if (!current || !chosenSlot || booking) return;
    setBooking(true);
    setMessage(null);
    try {
      const appt = await bookAppointment({ counsellorId: current.id, slot: chosenSlot, notes });
      setMessage({ kind: "ok", text: t("doctors.booked") });
      setNotes("");
      onBookSuccess(toHostAppointment(appt, current.name));
      void loadSlots(current.id);
      void loadMine();
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      setMessage({ kind: "error", text: status === 409 ? t("doctors.conflict") : t("doctors.bookError") });
      if (status === 409) void loadSlots(current.id);
    } finally {
      setBooking(false);
    }
  };

  const cancel = async (appt: MyAppointment) => {
    try {
      await cancelAppointment(appt);
      setMessage({ kind: "ok", text: t("doctors.cancelled") });
      await loadMine();
    } catch {
      setMessage({ kind: "error", text: t("doctors.cancelError") });
    } finally {
      setPendingCancel(null);
    }
  };

  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const upcoming = appointments.filter((a) => a.status !== "completed");

  return (
    <div className="page doctors-page">
      <div className="directory-head">
        <div>
          <h1>{t("doctors.title")}</h1>
          <p>{t("doctors.subtitle")}</p>
        </div>
        <div className="filters">
          <label htmlFor="doctor-filter" className="sr-only">
            {t("doctors.filterLabel")}
          </label>
          <select
            id="doctor-filter"
            className="filter-select min-h-11"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="All">{t("doctors.filterAll")}</option>
            {specialisations.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {load === "loading" && (
        <p role="status" className="muted">
          {t("doctors.loading")}
        </p>
      )}
      {load === "error" && (
        <div role="alert" className={errorClass}>
          <p>{t("doctors.loadError")}</p>
          <button type="button" className="primary-btn mt-2 min-h-11" onClick={() => void loadCounsellors()}>
            {t("common.retry")}
          </button>
        </div>
      )}
      {load === "ready" && counsellors.length === 0 && <p className={noticeClass}>{t("doctors.noneYet")}</p>}

      {load === "ready" && counsellors.length > 0 && (
        <div className="directory-grid">
          <ul className="doctor-list m-0 list-none p-0" aria-label={t("doctors.listLabel")}>
            {visible.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={selectedId === c.id ? "doctor-row selected" : "doctor-row"}
                  aria-pressed={selectedId === c.id}
                  onClick={() => {
                    setSelectedId(c.id);
                    setMessage(null);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="grid h-12 w-12 place-items-center rounded-full bg-[var(--primary-soft)] font-bold text-[var(--primary-dark)]"
                  >
                    {initials(c.name)}
                  </span>
                  <div>
                    <strong>{c.name}</strong>
                    <span>{c.specializations.slice(0, 2).join(", ")}</span>
                  </div>
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="muted py-4">{t("doctors.empty")}</li>}
          </ul>

          {current && (
            <article className="doctor-profile" aria-labelledby="doctor-name">
              <div className="profile-hero">
                <span
                  aria-hidden="true"
                  className="grid h-20 w-20 place-items-center rounded-full bg-[var(--primary-soft)] text-2xl font-bold text-[var(--primary-dark)]"
                >
                  {initials(current.name)}
                </span>
                <div>
                  <span className="available">{t("doctors.verified")}</span>
                  <h2 id="doctor-name">{current.name}</h2>
                </div>
              </div>
              <div className="profile-section">
                <h3>{t("doctors.specialisations")}</h3>
                <p>{current.specializations.join(", ")}</p>
              </div>
              <div className="profile-section">
                <h3>{t("doctors.about")}</h3>
                <p>{current.bio || t("doctors.noBio")}</p>
              </div>

              <div className="profile-section">
                <h3>{t("doctors.slotsTitle")}</h3>
                {slotLoad === "loading" && (
                  <p role="status" className="muted">
                    {t("doctors.slotsLoading")}
                  </p>
                )}
                {slotLoad === "error" && (
                  <p role="alert" className={errorClass}>
                    {t("doctors.slotsError")}
                  </p>
                )}
                {slotLoad === "ready" && slots.length === 0 && <p className="muted">{t("doctors.noSlots")}</p>}
                <div role="group" aria-label={t("doctors.slotsLabel")} className="mt-2 grid grid-cols-2 gap-2">
                  {slots.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={slotId === s.id}
                      onClick={() => setSlotId(s.id)}
                      className={`min-h-11 rounded-lg border px-2 text-xs font-bold ${
                        slotId === s.id
                          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-dark)]"
                          : "border-[var(--line)] bg-[var(--white)] text-[var(--ink)]"
                      }`}
                    >
                      {fmtDay(s.startTime)}, {fmtTime(s.startTime)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="profile-section">
                <label htmlFor="booking-notes" className={labelClass}>
                  {t("doctors.notesLabel")}
                </label>
                <textarea
                  id="booking-notes"
                  className={`${fieldClass} min-h-20`}
                  maxLength={300}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  aria-describedby="booking-notes-hint"
                />
                <p id="booking-notes-hint" className={hintClass}>
                  {t("doctors.notesHint")}
                </p>
              </div>

              <div className="slot">
                <div>
                  <small>{t("doctors.selectedSlot")}</small>
                  <strong>
                    {chosenSlot ? `${fmtDay(chosenSlot.startTime)}, ${fmtTime(chosenSlot.startTime)}` : t("doctors.noSlotSelected")}
                  </strong>
                </div>
                <button type="button" className="primary-btn min-h-11" onClick={() => void book()} disabled={!chosenSlot || booking}>
                  <Icon name="calendar" size={17} /> {booking ? t("doctors.booking") : t("doctors.book")}
                </button>
              </div>
              <p className={`${hintClass} mt-2`}>{t("doctors.disclaimer")}</p>
            </article>
          )}
        </div>
      )}

      <div role="status" aria-live="polite" className="mt-3">
        {message && <p className={message.kind === "error" ? errorClass : noticeClass}>{message.text}</p>}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="panel" aria-labelledby="my-appts">
          <h2 id="my-appts" className="text-lg font-bold">
            {t("doctors.yourAppointments")}
          </h2>
          {upcoming.length === 0 && <p className="muted mt-2">{t("doctors.noAppointments")}</p>}
          <ul className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
            {upcoming.map((a) => {
              const name = nameFor(a.counsellorId);
              const cancellable = a.status !== "cancelled" && canCancel(a.scheduledAt);
              return (
                <li key={a.id} className="rounded-xl border border-[var(--line)] p-3">
                  <p className="font-semibold">
                    {fmtDay(a.scheduledAt)}, {fmtTime(a.scheduledAt)} · {t("doctors.withCounsellor", { name })}
                  </p>
                  <p className={hintClass}>{t(`doctors.status.${a.status}`)}</p>
                  {a.status !== "cancelled" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="primary-btn min-h-11"
                        onClick={() => setVideoFor(toHostAppointment(a, name))}
                      >
                        <Icon name="video" size={16} /> {t("doctors.joinVideo")}
                      </button>
                      {pendingCancel === a.id ? (
                        <>
                          <button type="button" className="outline-btn min-h-11" onClick={() => void cancel(a)}>
                            {t("doctors.confirmCancel")}
                          </button>
                          <button type="button" className="text-btn min-h-6" onClick={() => setPendingCancel(null)}>
                            {t("doctors.keep")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="outline-btn min-h-11"
                          disabled={!cancellable}
                          aria-describedby={cancellable ? undefined : `cancel-hint-${a.id}`}
                          onClick={() => setPendingCancel(a.id)}
                        >
                          {t("doctors.cancel")}
                        </button>
                      )}
                    </div>
                  )}
                  {a.status !== "cancelled" && !cancellable && (
                    <p id={`cancel-hint-${a.id}`} className={hintClass}>
                      {t("doctors.cancelTooLate")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel" aria-labelledby="my-reminders">
          <h2 id="my-reminders" className="text-lg font-bold">
            {t("doctors.remindersTitle")}
          </h2>
          {reminders.length === 0 && <p className="muted mt-2">{t("doctors.remindersEmpty")}</p>}
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {reminders.map((r) => (
              <li key={r.id} className="rounded-xl border border-[var(--line)] p-3">
                <p className="font-semibold">{r.title}</p>
                <p className="text-[13px]">{r.body}</p>
                <p className={hintClass}>{new Date(r.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {videoFor && <VideoSessionModal appointment={videoFor} onClose={() => setVideoFor(null)} />}
    </div>
  );
}
