import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { useChatStream } from "../../shared/lib/api/chat";
import { detectRisk } from "../../domain/risk/lexicon";
import Icon from "../../shared/ui/Icon";
import BreathingModal from "../modals/BreathingModal";
import GroundingModal from "../modals/GroundingModal";
import SafetyCardModal from "../modals/SafetyCardModal";
import CrisisCard from "./CrisisCard";
import { logChatCrisisEvent } from "./api";

interface ChatProps {
  studentId: string;
  /** Optional hooks so the host app can route the suggested-action chips. Sensible in-component fallbacks exist. */
  onOpenBreathing?: () => void;
  onOpenSafetyPlan?: () => void;
  onBookCounsellor?: () => void;
  onMessageCounsellor?: () => void | Promise<void>;
}

type LocalModal = "breathing" | "grounding" | "safety" | null;

export default function Chat({
  onOpenBreathing,
  onOpenSafetyPlan,
  onBookCounsellor,
  onMessageCounsellor,
}: ChatProps) {
  const { t } = useTranslation(CONTENT_NS);
  const { messages, isStreaming, isDegraded, isCrisis, error, sendMessage, clearChat } = useChatStream();
  const [text, setText] = useState("");
  const [crisisSticky, setCrisisSticky] = useState(false);
  const [crisisAcknowledged, setCrisisAcknowledged] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [modal, setModal] = useState<LocalModal>(null);
  const [notice, setNotice] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const loggedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastOutgoingRef = useRef("");

  const crisisVisible = crisisSticky || isCrisis;

  useEffect(() => {
    if (isCrisis) setCrisisSticky(true);
  }, [isCrisis]);

  useEffect(() => {
    if (crisisVisible && !loggedRef.current) {
      loggedRef.current = true;
      void logChatCrisisEvent();
    }
  }, [crisisVisible]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  const send = (override?: string) => {
    const outgoing = (override ?? text).trim();
    if (!outgoing || isStreaming || (crisisVisible && !crisisAcknowledged)) return;
    // Deterministic pre-screen so the card appears at once, before any network round trip.
    const risk = detectRisk(outgoing);
    if (risk.level === "high" || risk.level === "imminent") {
      setCrisisSticky(true);
      setCrisisAcknowledged(false);
    }
    setText("");
    setNotice("");
    lastOutgoingRef.current = outgoing;
    void sendMessage(outgoing);
  };

  // If a message did not go through, put the words back in the box so the student can retry without retyping.
  useEffect(() => {
    if (error && lastOutgoingRef.current) {
      setText((current) => current || lastOutgoingRef.current);
    }
  }, [error]);

  const openSafetyPlan = () => (onOpenSafetyPlan ? onOpenSafetyPlan() : setModal("safety"));
  const openBreathing = () => (onOpenBreathing ? onOpenBreathing() : setModal("breathing"));
  const suggestBooking = () => (onBookCounsellor ? onBookCounsellor() : setNotice(t("chat.chips.bookingHint")));

  const degraded = isDegraded || error?.code === "DEGRADED_MODE";
  let errorText = "";
  if (error && error.code !== "DEGRADED_MODE") {
    errorText = error.code === "RATE_LIMITED" ? t("chat.rateLimited") : t("chat.sendError");
  }

  const lastMessage = messages[messages.length - 1];
  let announcement = "";
  if (isStreaming) announcement = t("chat.thinking");
  else if (lastMessage?.role === "assistant") announcement = t("chat.replied");

  const composerLocked = crisisVisible && !crisisAcknowledged;
  const showStarters = messages.length === 0;

  return (
    <div className="chat-page">
      <section className="chat-window" aria-label={t("chat.title")}>
        <div className="chat-intro">
          <div className="chat-intro-left">
            <span className="ai-orb">
              <Icon name="sparkles" />
            </span>
            <div>
              <h1 className="text-base font-bold">{t("chat.title")}</h1>
              <span>
                <i /> {t("chat.status")} · {isStreaming ? t("chat.statusThinking") : t("chat.statusIdle")}
              </span>
            </div>
          </div>
          {confirmClear ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="outline-btn min-h-6"
                onClick={() => {
                  clearChat();
                  setConfirmClear(false);
                  setNotice(t("chat.cleared"));
                }}
              >
                {t("chat.clearConfirm")}
              </button>
              <button type="button" className="text-btn min-h-6" onClick={() => setConfirmClear(false)}>
                {t("chat.clearCancel")}
              </button>
            </div>
          ) : (
            <button type="button" className="text-btn min-h-6" onClick={() => setConfirmClear(true)}>
              {t("chat.clear")}
            </button>
          )}
        </div>

        {crisisVisible && <CrisisCard onOpenSafetyPlan={openSafetyPlan} onMessageCounsellor={onMessageCounsellor} />}

        {degraded && (
          <div
            role="status"
            data-testid="degraded-banner"
            className="mx-3 mt-3 rounded-xl border border-[var(--amber)] bg-[var(--amber-soft)] p-3 text-sm text-[var(--ink)]"
          >
            <strong>{t("chat.degradedTitle")}</strong>
            <p>{t("chat.degradedBody")}</p>
          </div>
        )}

        <div
          className="chat-body"
          ref={logRef}
          role="log"
          aria-label={t("chat.logLabel")}
          aria-live="polite"
          aria-relevant="additions"
        >
          <BotMessage label={t("chat.aiLabel")} content={t("chat.greeting")} />
          {messages.map((m) =>
            m.role === "assistant" ? (
              <BotMessage
                key={m.id}
                label={t("chat.aiLabel")}
                content={m.content}
                busy={isStreaming && m.id === lastMessage?.id}
              />
            ) : (
              <div key={m.id} className="message mine">
                <p>
                  <span className="sr-only">{t("chat.youLabel")}: </span>
                  {m.content}
                </p>
              </div>
            ),
          )}
          {isStreaming && lastMessage?.role === "user" && (
            <div className="message bot">
              <span className="tiny-orb">
                <Icon name="sparkles" size={14} />
              </span>
              <p style={{ color: "var(--muted)" }}>{t("chat.thinking")}</p>
            </div>
          )}
        </div>

        <div role="status" aria-live="polite" className="sr-only" data-testid="chat-announcer">
          {announcement}
          {notice && ` ${notice}`}
        </div>
        {notice && <p className="px-6 text-[13px] text-[var(--muted)]">{notice}</p>}
        {errorText && (
          <p role="alert" className="px-6 pb-2 text-[13px] text-[var(--danger)]">
            {errorText}
          </p>
        )}

        <div className="flex flex-wrap gap-2 px-5 pb-2" role="group" aria-label={t("chat.chips.label")}>
          <button type="button" className="quick-pill min-h-6" onClick={openBreathing}>
            {t("chat.chips.breathing")}
          </button>
          <button type="button" className="quick-pill min-h-6" onClick={openSafetyPlan}>
            {t("chat.chips.safetyPlan")}
          </button>
          <button type="button" className="quick-pill min-h-6" onClick={suggestBooking}>
            {t("chat.chips.booking")}
          </button>
        </div>

        {showStarters && !composerLocked && (
          <div className="suggestions" role="group" aria-label={t("chat.starters.label")}>
            {(["overwhelmed", "focus", "relax"] as const).map((k) => (
              <button key={k} type="button" onClick={() => send(t(`chat.starters.${k}`))}>
                {t(`chat.starters.${k}`)}
              </button>
            ))}
          </div>
        )}

        {composerLocked ? (
          <div className="mx-5 mb-3 flex flex-wrap items-center gap-3">
            <p className="text-[13px] text-[var(--muted)]">{t("chat.crisis.paused")}</p>
            <button
              type="button"
              className="outline-btn min-h-11"
              onClick={() => {
                setCrisisAcknowledged(true);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
            >
              {t("chat.crisis.continue")}
            </button>
          </div>
        ) : (
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label htmlFor="chat-message" className="sr-only">
              {t("chat.inputLabel")}
            </label>
            <textarea
              id="chat-message"
              ref={inputRef}
              rows={1}
              value={text}
              maxLength={3000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={t("chat.placeholder")}
              className="min-h-11 flex-1 resize-none border-0 bg-transparent py-2 text-sm outline-none"
              style={{ color: "var(--ink)" }}
            />
            <button type="submit" aria-label={t("chat.send")} disabled={isStreaming || !text.trim()}>
              <Icon name="send" />
            </button>
          </form>
        )}
        <p className="chat-disclaimer">
          <Icon name="shield" size={14} /> {t("chat.disclaimer")}
        </p>
        <p className="chat-disclaimer" data-testid="chat-not-saved">
          <Icon name="clock" size={14} /> {t("chat.notSaved")}
        </p>
      </section>

      {modal === "breathing" && (
        <BreathingModal onClose={() => setModal(null)} openGrounding={() => setModal("grounding")} />
      )}
      {modal === "grounding" && <GroundingModal onClose={() => setModal(null)} />}
      {modal === "safety" && (
        <SafetyCardModal student={{ name: "MindSahaay student", institution: "" }} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function BotMessage({ label, content, busy }: { label: string; content: string; busy?: boolean }) {
  return (
    <div className="message bot" aria-busy={busy || undefined}>
      <span className="tiny-orb">
        <Icon name="sparkles" size={14} />
      </span>
      <div>
        <span
          className="mb-1 inline-block rounded-md border border-[var(--line)] bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--primary-dark)] dark:text-[oklch(0.88_0.03_170)]"
          data-testid="ai-label"
        >
          {label}
        </span>
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
