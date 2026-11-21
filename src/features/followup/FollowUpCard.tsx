import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { errorClass, hintClass, noticeClass } from "../journal/ui";
import { HELPLINES } from "../../shared/lib/pwa/helplines";
import {
  acceptHandoffOffer,
  answerCheckback,
  declineHandoffOffer,
  fetchMyFollowups,
  setServerCheckbackOptOut,
  type CheckbackAnswer,
  type CheckbackPrompt,
  type HandoffOffer,
  type MyFollowupState,
} from "./api";

/**
 * Student-facing status of the crisis follow-up loop and warm handoff offers. Shows only the signed-in
 * student's own data, always carries the helplines, and renders nothing when there is nothing to show.
 */
export default function FollowUpCard() {
  const { t } = useTranslation(CONTENT_NS);
  const uid = useId();
  const [state, setState] = useState<MyFollowupState | null>(null);
  const [optedOut, setOptedOut] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Set synchronously, unlike state, so two clicks in the same tick cannot both start a request.
  const lockRef = useRef<string | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  /**
   * Reloads the card. Returns false when it could not. A failed reload leaves what is on screen as it
   * was (so the helplines never disappear mid-crisis); only the very first load shows nothing on failure
   * (signed out, demo mode or offline: better nothing than a half-true status).
   */
  const load = useCallback(async (): Promise<boolean> => {
    try {
      const next = await fetchMyFollowups();
      setState(next);
      setOptedOut(next.optedOut);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The button that was just pressed usually disappears once the action is done. Move focus to the
  // confirmation so keyboard and screen-reader users are not dropped back to the top of the page.
  useEffect(() => {
    if (message) statusRef.current?.focus();
  }, [message]);

  if (!state || (state.events.length === 0 && state.offers.length === 0 && !message)) return null;

  const begin = (id: string): boolean => {
    if (lockRef.current) return false;
    lockRef.current = id;
    setBusyId(id);
    setError("");
    return true;
  };
  const end = () => {
    lockRef.current = null;
    setBusyId(null);
  };
  const reload = async () => {
    if (!(await load())) setError(t("followup.refreshError"));
  };

  const answer = async (prompt: CheckbackPrompt, value: CheckbackAnswer) => {
    if (!begin(prompt.id)) return;
    try {
      await answerCheckback(prompt.id, value, prompt.eventId);
      // Never say a counsellor was told when no counsellor can see risk alerts.
      const talk = state.alertsShared ? t("followup.answeredTalk") : t("followup.answeredTalkNotShared");
      setMessage(value === "okay" ? t("followup.answeredOkay") : talk);
      await reload();
    } catch {
      setError(t("followup.answerError"));
    } finally {
      end();
    }
  };

  const acceptOffer = async (offer: HandoffOffer) => {
    if (!begin(offer.id)) return;
    try {
      // The card may have been open for hours: check the offer is still live and its event still open.
      const fresh = await fetchMyFollowups();
      setState(fresh);
      setOptedOut(fresh.optedOut);
      if (!fresh.offers.some((o) => o.id === offer.id)) {
        setError(t("followup.offerGone"));
        return;
      }
      await acceptHandoffOffer(offer.id);
      setMessage(t("followup.offerAccepted"));
      await reload();
    } catch {
      setError(t("followup.offerError"));
    } finally {
      end();
    }
  };

  const declineOffer = async (offer: HandoffOffer) => {
    if (!begin(offer.id)) return;
    try {
      await declineHandoffOffer(offer.id);
      setMessage(t("followup.offerDeclined"));
      await reload();
    } catch {
      setError(t("followup.offerError"));
    } finally {
      end();
    }
  };

  const toggleOptOut = async (checked: boolean) => {
    if (!begin("optout")) return;
    const previous = optedOut;
    setOptedOut(checked);
    try {
      await setServerCheckbackOptOut(checked);
      await reload();
    } catch {
      setOptedOut(previous);
      setError(t("followup.optOutError"));
    } finally {
      end();
    }
  };

  const visible = state.events.slice(0, 2);
  const prominent = !state.alertsShared;

  const helplines = (
    <div
      className={prominent ? "mt-3 rounded-xl border-2 border-[var(--danger)] bg-[var(--amber-soft)] p-3 text-[var(--ink)]" : "mt-3"}
      data-testid="followup-helplines"
      data-prominent={prominent ? "true" : undefined}
    >
      <h3 className={prominent ? "m-0 text-base font-bold" : "m-0 text-sm font-bold"}>{t("followup.helplinesTitle")}</h3>
      <p className={`m-0 ${hintClass}`}>{t("followup.helplinesNote")}</p>
      <ul className={`m-0 mt-1 flex list-none gap-2 p-0 ${prominent ? "flex-col sm:flex-row sm:flex-wrap" : "flex-wrap"}`}>
        {HELPLINES.map((h) => (
          <li key={h.id} className={prominent ? "sm:flex-1" : undefined}>
            <a
              href={h.tel}
              className={
                prominent
                  ? "inline-flex min-h-14 w-full items-center justify-center rounded-lg border-2 border-[var(--ink)] bg-[var(--canvas)] px-4 text-lg font-bold underline"
                  : "inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] px-3 font-bold underline"
              }
              aria-label={t("followup.call", { name: h.name, number: h.number })}
            >
              {h.name} {h.number}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section aria-labelledby={`${uid}-title`} data-testid="followup-card" className="panel mb-4 border-2 border-[var(--primary)]">
      <h2 id={`${uid}-title`} className="text-lg font-bold">
        {t("followup.title")}
      </h2>
      {/* When no counsellor can see the alert the helplines are the only help on offer, so they come first. */}
      {prominent && helplines}
      <p className={`m-0 mt-2 ${hintClass}`}>{t("followup.intro")}</p>

      {visible.length > 0 && (
        <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
          {visible.map((e) => {
            const notSharedOpen = e.currentStep === "open" && prominent;
            return (
              <li key={e.eventId} className="rounded-xl border border-[var(--line)] p-3" data-step={e.currentStep}>
                <p className="m-0 font-semibold">{t(notSharedOpen ? "followup.status.openNotShared" : `followup.status.${e.currentStep}`)}</p>
                {!notSharedOpen && <p className={`m-0 ${hintClass}`}>{t(`followup.statusHint.${e.currentStep}`)}</p>}
                {e.currentStep !== "closed" && prominent && <p className="m-0 mt-1 text-[13px] text-[var(--ink)]">{t("followup.notShared")}</p>}
                <p className={`m-0 ${hintClass}`}>{t("followup.since", { when: new Date(e.createdAt).toLocaleString() })}</p>
              </li>
            );
          })}
        </ul>
      )}

      <div ref={statusRef} tabIndex={-1} data-testid="followup-status" role="status" aria-live="polite" className={message ? `${noticeClass} mt-2` : "sr-only"}>
        {message}
      </div>
      {error && (
        <p role="alert" className={`${errorClass} mt-2`}>
          {error}
        </p>
      )}

      {/* Warm Handoff Session Offers */}
      {state.offers.slice(0, 1).map((offer) => (
        <div
          key={offer.id}
          data-testid="handoff-offer-card"
          className="mt-3 rounded-xl border-2 border-[var(--primary)] bg-[var(--primary-soft)] p-3 text-[var(--ink)]"
          role="group"
          aria-labelledby={`${uid}-offer-title-${offer.id}`}
        >
          <p id={`${uid}-offer-title-${offer.id}`} className="m-0 font-semibold">
            {t("followup.offerTitle", { name: offer.counsellorAlias })}
          </p>
          <p className={`m-0 mt-1 ${hintClass}`}>
            {t("followup.offerTime", { time: new Date(offer.startsAt).toLocaleString() })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="primary-btn min-h-11"
              disabled={busyId !== null}
              aria-busy={busyId === offer.id}
              onClick={() => void acceptOffer(offer)}
            >
              {busyId === offer.id ? t("followup.saving") : t("followup.acceptOffer")}
            </button>
            <button
              type="button"
              className="outline-btn min-h-11"
              disabled={busyId !== null}
              onClick={() => void declineOffer(offer)}
            >
              {t("followup.declineOffer")}
            </button>
          </div>
        </div>
      ))}

      {state.prompts.slice(0, 1).map((p) => (
        <div key={p.id} className="mt-3 rounded-xl bg-[var(--primary-soft)] p-3" role="group" aria-labelledby={`${uid}-cb-${p.id}`}>
          <p id={`${uid}-cb-${p.id}`} className="m-0 font-semibold">
            {t("followup.checkbackTitle")}: {t("followup.checkbackQuestion")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="outline-btn min-h-11" disabled={busyId !== null} onClick={() => void answer(p, "okay")}>
              {t("followup.okay")}
            </button>
            <button type="button" className="primary-btn min-h-11" disabled={busyId !== null} onClick={() => void answer(p, "want_to_talk")}>
              {t("followup.wantToTalk")}
            </button>
          </div>
        </div>
      ))}

      {!prominent && helplines}

      <div className="mt-3">
        <label className="flex min-h-6 cursor-pointer items-start gap-2 text-sm" htmlFor={`${uid}-optout`}>
          <input id={`${uid}-optout`} type="checkbox" className="mt-1 h-5 w-5" checked={optedOut} disabled={busyId !== null} onChange={(e) => void toggleOptOut(e.target.checked)} aria-describedby={`${uid}-optout-hint`} />
          <span>{t("followup.optOut")}</span>
        </label>
        <p id={`${uid}-optout-hint`} className={`m-0 ml-7 ${hintClass}`}>
          {t("followup.optOutHint")}
        </p>
      </div>
      <p className={`m-0 mt-2 ${hintClass}`}>{t("followup.disclaimer")}</p>
    </section>
  );
}