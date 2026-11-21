import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { errorClass, fieldClass, hintClass, labelClass, noticeClass } from "../journal/ui";
import { HELPLINES } from "../../shared/lib/pwa/helplines";
import {
  CLOSURE_REASONS,
  FOLLOWUP_STEPS,
  NOTE_MAX_LENGTH,
  advanceFollowup,
  eventTypeLabelKey,
  fetchMySlots,
  fetchRiskQueue,
  isEventOverdue,
  nextStep,
  offerHandoffSlot,
  runOverdueEscalation,
  sortRiskQueue,
  subscribeRiskEvents,
  type ClosureReason,
  type FollowupStep,
  type RiskEvent,
} from "./api";
import type { Slot } from "../doctors/api";

interface RiskQueueProps {
  /** Maps a student id to a display name. */
  nameFor: (studentId: string) => string;
}

/** While the queue is open the database is asked to escalate overdue events this often. */
export const ESCALATION_INTERVAL_MS = 5 * 60 * 1000;
const CLOCK_TICK_MS = 30 * 1000;

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "3h 05m", "45m" or "under 1m". Exported for tests. */
export function formatElapsed(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return "<1m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Permanent, always-visible reminder of what this queue can and cannot do. */
function SafetyBanner() {
  const { t } = useTranslation(CONTENT_NS);
  return (
    <aside role="note" aria-labelledby="risk-banner-title" data-testid="risk-banner" className="mt-2 rounded-xl border-2 border-[var(--danger)] bg-[var(--amber-soft)] p-3 text-sm text-[var(--ink)]">
      <strong id="risk-banner-title" className="block">
        {t("counsellor.bannerTitle")}
      </strong>
      <p className="m-0 mt-1 font-semibold">{t("counsellor.bannerText")}</p>
      <p className="m-0 mt-2 text-xs font-bold">{t("counsellor.bannerHelplines")}</p>
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-2 p-0">
        {HELPLINES.map((h) => (
          <li key={h.id}>
            <a href={h.tel} className="inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] bg-[var(--canvas)] px-3 font-bold underline" aria-label={t("counsellor.helplineCall", { name: h.name, number: h.number })}>
              {h.name} {h.number}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

interface EventCardProps {
  event: RiskEvent;
  name: string;
  now: Date;
  busy: boolean;
  onAdvance: (event: RiskEvent, step: FollowupStep, reason: ClosureReason | null, note: string) => Promise<boolean>;
}

function EventCard({ event, name, now, busy, onAdvance }: EventCardProps) {
  const { t } = useTranslation(CONTENT_NS);
  const uid = useId();
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<ClosureReason | "">("");
  const [showOffer, setShowOffer] = useState(false);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [offerNote, setOfferNote] = useState("");
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerError, setOfferError] = useState("");
  const [offerSuccess, setOfferSuccess] = useState("");
  // Set synchronously (state is not), so two clicks in the same tick cannot send two requests.
  const advanceLock = useRef(false);
  const offerLock = useRef(false);
  const slotsRequest = useRef(0);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const slotSelectRef = useRef<HTMLSelectElement>(null);
  const restoreFocus = useRef(false);

  const next = nextStep(event.currentStep);
  const overdue = isEventOverdue(event, now);
  const elapsed = formatElapsed(now.getTime() - new Date(event.createdAt).getTime());
  const closing = next === "closed";
  const needsReason = closing && reason === "";
  const when = (iso: string) => new Date(iso).toLocaleString();

  // Move focus into the slot picker when it opens, so a keyboard user lands on the new controls.
  useEffect(() => {
    if (showOffer && !slotsLoading && slots && slots.length > 0) slotSelectRef.current?.focus();
  }, [showOffer, slotsLoading, slots]);

  useEffect(() => {
    if (!offerBusy && restoreFocus.current) {
      restoreFocus.current = false;
      toggleRef.current?.focus();
    }
  }, [offerBusy]);

  /** Loads the counsellor's current free slots. Only the newest request may write its result. */
  const loadSlots = async (): Promise<Slot[] | null> => {
    const request = ++slotsRequest.current;
    setSlotsLoading(true);
    try {
      const res = await fetchMySlots();
      if (request !== slotsRequest.current) return null;
      setSlots(res);
      setSelectedSlotId(res.length > 0 ? res[0].id : "");
      return res;
    } catch {
      if (request === slotsRequest.current) setOfferError(t("counsellor.offerError"));
      return null;
    } finally {
      if (request === slotsRequest.current) setSlotsLoading(false);
    }
  };

  const closeOffer = () => {
    setShowOffer(false);
    toggleRef.current?.focus();
  };

  const toggleOffer = async () => {
    if (showOffer) {
      closeOffer();
      return;
    }
    setShowOffer(true);
    setOfferError("");
    setOfferSuccess("");
    // Always reload: slots can be booked, or pass, while the panel is closed.
    await loadSlots();
  };

  const submitOffer = async () => {
    if (!selectedSlotId || offerLock.current) return;
    offerLock.current = true;
    setOfferBusy(true);
    setOfferError("");
    try {
      await offerHandoffSlot(event.id, selectedSlotId, offerNote);
      setOfferSuccess(t("counsellor.offerSent", { name }));
      setShowOffer(false);
      setOfferNote("");
      setSlots((prev) => (prev ? prev.filter((s) => s.id !== selectedSlotId) : []));
      setSelectedSlotId("");
      restoreFocus.current = true; // the toggle is disabled while sending, so focus it once sending is over
    } catch {
      setOfferError(t("counsellor.offerError"));
      // The slot may have been taken or the event moved on: show the counsellor what is really free now.
      const taken = selectedSlotId;
      const fresh = await loadSlots();
      if (fresh === null) {
        setSlots((prev) => (prev ? prev.filter((s) => s.id !== taken) : prev));
        setSelectedSlotId("");
      }
    } finally {
      offerLock.current = false;
      setOfferBusy(false);
    }
  };

  const submit = async () => {
    if (!next || needsReason || advanceLock.current) return;
    advanceLock.current = true;
    try {
      const ok = await onAdvance(event, next, closing ? (reason as ClosureReason) : null, note);
      if (ok) {
        setNote("");
        setReason("");
      }
    } finally {
      advanceLock.current = false;
    }
  };

  return (
    <li data-testid="risk-event" data-severity={event.severity} className={`rounded-xl border p-3 ${overdue ? "border-[var(--danger)] bg-[var(--amber-soft)]" : "border-[var(--line)]"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="m-0 font-semibold">{name}</p>
        <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-bold text-[var(--primary-dark)]">{t(`counsellor.severity.${event.severity}`)}</span>
        {overdue && (
          <span data-testid="overdue-badge" className="rounded-full border border-[var(--danger)] px-2 py-0.5 text-xs font-bold text-[var(--ink)]">
            {t("counsellor.overdue")}
          </span>
        )}
      </div>
      <p className={`m-0 ${hintClass}`}>{t("counsellor.riskItem", { severity: t(`counsellor.severity.${event.severity}`), type: t(eventTypeLabelKey(event.eventType)) })}</p>
      <p className={`m-0 ${hintClass}`}>
        <time dateTime={event.createdAt} data-testid="elapsed">
          {t("counsellor.elapsed", { duration: elapsed })}
        </time>
        {" · "}
        {when(event.createdAt)}
      </p>
      {overdue && event.overdueThresholdHours != null && <p className={`m-0 ${hintClass}`}>{t("counsellor.overdueDetail", { hours: event.overdueThresholdHours })}</p>}
      {event.reopened && <p className={`m-0 mt-1 ${hintClass}`}>{t("counsellor.reopened")}</p>}
      {event.offline && event.detectedAt && (
        <p data-testid="offline-line" className={`m-0 mt-1 ${hintClass}`}>
          {t("counsellor.offlineLine", { detected: when(event.detectedAt), received: when(event.createdAt) })}
        </p>
      )}

      <ol aria-label={t("counsellor.stepsLabel", { name })} className="m-0 mt-2 grid list-none grid-cols-5 gap-1 p-0">
        {FOLLOWUP_STEPS.map((step, i) => {
          const idx = FOLLOWUP_STEPS.indexOf(event.currentStep);
          const state = i < idx ? "done" : i === idx ? "current" : "pending";
          const stamp = event.stepTimes[step] ?? (state === "current" ? event.currentStepAt : null);
          return (
            <li
              key={step}
              data-step={step}
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
              className={`rounded-lg border px-1 py-1 text-center text-xs ${state === "current" ? "border-[var(--primary)] bg-[var(--primary-soft)] font-bold" : state === "done" ? "border-[var(--line)]" : "border-dashed border-[var(--line)] text-[var(--muted)]"}`}
            >
              <span className="block">{t(`counsellor.step.${step}`)}</span>
              <span className="sr-only">{state === "current" ? t("counsellor.stepCurrent") : state === "done" ? t("counsellor.stepDone") : t("counsellor.stepPending")}</span>
              {stamp && <span className="block text-[11px] font-normal">{when(stamp)}</span>}
            </li>
          );
        })}
      </ol>

      {next && (
        <div className="mt-3 flex flex-col gap-2">
          {closing && (
            <div>
              <label htmlFor={`${uid}-reason`} className={labelClass}>
                {t("counsellor.closureLabel")}
              </label>
              <select id={`${uid}-reason`} className={fieldClass} value={reason} onChange={(e) => setReason(e.target.value as ClosureReason | "")} disabled={busy} aria-required="true" aria-describedby={needsReason ? `${uid}-reason-hint` : undefined}>
                <option value="">{t("counsellor.closureChoose")}</option>
                {CLOSURE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`counsellor.closure.${r}`)}
                  </option>
                ))}
              </select>
              {needsReason && (
                <p id={`${uid}-reason-hint`} className={`m-0 mt-1 ${hintClass}`}>
                  {t("counsellor.closureRequired")}
                </p>
              )}
            </div>
          )}
          <div>
            <label htmlFor={`${uid}-note`} className={labelClass}>
              {t("counsellor.followupNoteLabel", { name })}
            </label>
            <textarea
              id={`${uid}-note`}
              className={fieldClass}
              rows={2}
              maxLength={NOTE_MAX_LENGTH}
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby={`${uid}-note-help`}
            />
            <p id={`${uid}-note-help`} className={`m-0 ${hintClass}`}>
              {t("counsellor.noteWarning")} <span data-testid="note-counter">{t("counsellor.noteCounter", { used: note.length, max: NOTE_MAX_LENGTH })}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="primary-btn min-h-11"
              disabled={busy || needsReason}
              aria-label={t("counsellor.actLabel", { action: t(`counsellor.act.${next}`), name })}
              onClick={() => void submit()}
            >
              {busy ? t("counsellor.actBusy") : t(`counsellor.act.${next}`)}
            </button>
            <button
              ref={toggleRef}
              type="button"
              className="outline-btn min-h-11"
              disabled={busy || offerBusy}
              aria-expanded={showOffer}
              onClick={() => void toggleOffer()}
            >
              {t("counsellor.offerSession")}
            </button>
          </div>

          {showOffer && (
            // Escape closes the picker from any control inside it; the controls themselves are the interactive elements.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
            <div
              className="mt-2 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-3"
              role="group"
              aria-label={t("counsellor.offerSessionTitle", { name })}
              onKeyDown={(e) => {
                if (e.key === "Escape" && !offerBusy) {
                  e.stopPropagation();
                  closeOffer();
                }
              }}
            >
              <p className="m-0 font-semibold">{t("counsellor.offerSessionTitle", { name })}</p>
              {slotsLoading && (
                <p role="status" className={`m-0 mt-1 ${hintClass}`}>
                  {t("counsellor.loading")}
                </p>
              )}
              {!slotsLoading && slots && slots.length === 0 && (
                <p className={`m-0 mt-1 ${hintClass}`}>{t("counsellor.offerNoSlots")}</p>
              )}
              {!slotsLoading && slots && slots.length > 0 && (
                <div className="mt-2 flex flex-col gap-2">
                  <div>
                    <label htmlFor={`${uid}-slot`} className={labelClass}>
                      {t("counsellor.offerChooseSlot")}
                    </label>
                    <select
                      ref={slotSelectRef}
                      id={`${uid}-slot`}
                      className={fieldClass}
                      value={selectedSlotId}
                      onChange={(e) => setSelectedSlotId(e.target.value)}
                      disabled={offerBusy}
                    >
                      <option value="">{t("counsellor.offerSlotChoose")}</option>
                      {slots.map((s) => (
                        <option key={s.id} value={s.id}>
                          {new Date(s.startTime).toLocaleString("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${uid}-offer-note`} className={labelClass}>
                      {t("counsellor.offerNoteLabel")}
                    </label>
                    <textarea
                      id={`${uid}-offer-note`}
                      className={fieldClass}
                      rows={2}
                      maxLength={NOTE_MAX_LENGTH}
                      value={offerNote}
                      disabled={offerBusy}
                      onChange={(e) => setOfferNote(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="primary-btn min-h-11"
                      disabled={offerBusy || !selectedSlotId}
                      onClick={() => void submitOffer()}
                    >
                      {offerBusy ? t("counsellor.offerSending") : t("counsellor.offerSend")}
                    </button>
                    <button
                      type="button"
                      className="outline-btn min-h-11"
                      disabled={offerBusy}
                      onClick={closeOffer}
                    >
                      {t("counsellor.offerCancel")}
                    </button>
                  </div>
                </div>
              )}
              {offerError && (
                <p role="alert" className={`${errorClass} mt-2`}>
                  {offerError}
                </p>
              )}
            </div>
          )}
          <p role="status" aria-live="polite" data-testid="offer-status" className={offerSuccess ? `${noticeClass} mt-2` : "sr-only"}>
            {offerSuccess}
          </p>
        </div>
      )}
    </li>
  );
}

/** Open risk events for consented students, kept current with Realtime and a read-time overdue check. */
export default function RiskQueue({ nameFor }: RiskQueueProps) {
  const { t } = useTranslation(CONTENT_NS);
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [error, setError] = useState(false);
  const [live, setLive] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const now = useNow(CLOCK_TICK_MS);

  const load = useCallback(async () => {
    try {
      setEvents(await fetchRiskQueue());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  // Open: load the queue, ask the database to escalate overdue events, then repeat every 5 minutes.
  useEffect(() => {
    let cancelled = false;
    const escalate = async () => {
      const created = await runOverdueEscalation();
      if (!cancelled && created > 0) await load();
    };
    void load();
    void escalate();
    const id = setInterval(() => {
      void escalate();
      void load();
    }, ESCALATION_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [load]);

  useEffect(() => {
    const unsubscribe = subscribeRiskEvents({
      onInsert: () => {
        setAnnounce(t("counsellor.riskNew"));
        void load();
      },
      onUpdate: () => void load(),
      onStatus: setLive,
    });
    return unsubscribe;
  }, [load, t]);

  const advance = async (event: RiskEvent, step: FollowupStep, reason: ClosureReason | null, note: string): Promise<boolean> => {
    setBusyId(event.id);
    setActionError("");
    try {
      const row = await advanceFollowup(event.id, step, reason, note);
      const name = nameFor(event.studentId);
      setEvents((prev) =>
        sortRiskQueue(
          step === "closed"
            ? prev.filter((e) => e.id !== event.id)
            : prev.map((e) =>
                e.id === event.id
                  ? { ...e, currentStep: step, currentStepAt: row.createdAt || null, isOverdue: false, stepTimes: { ...e.stepTimes, [step]: row.createdAt || new Date().toISOString() } }
                  : e,
              ),
        ),
      );
      setAnnounce(t("counsellor.advanced", { name, step: t(`counsellor.step.${step}`) }));
      return true;
    } catch {
      setActionError(t("counsellor.advanceError"));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="panel" aria-labelledby="risk-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="risk-title" className="text-lg font-bold">
          {t("counsellor.riskTitle")}
        </h2>
        {live ? (
          <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-bold text-[var(--primary-dark)]">{t("counsellor.riskLive")}</span>
        ) : (
          <span className={hintClass}>{t("counsellor.riskLiveOff")}</span>
        )}
      </div>
      <SafetyBanner />
      <div role="status" aria-live="polite" className={announce ? `${noticeClass} mt-2` : "sr-only"}>
        {announce}
      </div>
      {(error || actionError) && (
        <p role="alert" className={`${errorClass} mt-2`}>
          {error ? t("counsellor.riskError") : actionError}
        </p>
      )}
      {!error && events.length === 0 && <p className="muted mt-2">{t("counsellor.riskEmpty")}</p>}
      <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
        {events.map((e) => (
          <EventCard key={e.id} event={e} name={nameFor(e.studentId)} now={now} busy={busyId === e.id} onAdvance={advance} />
        ))}
      </ul>
    </section>
  );
}
