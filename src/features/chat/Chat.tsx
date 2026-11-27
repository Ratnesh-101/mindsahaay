import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { streamChat } from "../../shared/lib/api/chat";
import { detectRisk } from "../../domain/risk/lexicon";
import Icon from "../../shared/ui/Icon";
import BreathingModal from "../modals/BreathingModal";
import GroundingModal from "../modals/GroundingModal";
import SafetyCardModal from "../modals/SafetyCardModal";
import CrisisCard from "./CrisisCard";
import { logChatCrisisEvent } from "./api";
import { useVaultPassphrase } from "../journal/vault";
import { isDemoModeActive } from "../auth/demoMode";
import {
  canSaveChats,
  createSession,
  loadSession,
  saveMessage,
  deleteSession,
} from "./history";
import PastConversationsModal from "./PastConversationsModal";
import type { ApiError } from "../../shared/lib/api/errors";

interface ChatProps {
  studentId: string;
  /** Optional hooks so the host app can route the suggested-action chips. Sensible in-component fallbacks exist. */
  onOpenBreathing?: () => void;
  onOpenSafetyPlan?: () => void;
  onBookCounsellor?: () => void;
  onMessageCounsellor?: () => void | Promise<void>;
}

type LocalModal = "breathing" | "grounding" | "safety" | "history" | null;

interface MessageItem {
  id: string;
  seq?: number;
  role: "user" | "assistant";
  content: string;
  saveFailed?: boolean;
}

export default function Chat({
  onOpenBreathing,
  onOpenSafetyPlan,
  onBookCounsellor,
  onMessageCounsellor,
}: ChatProps) {
  const { t } = useTranslation(CONTENT_NS);
  const passphrase = useVaultPassphrase();
  const isDemo = isDemoModeActive();
  const canSave = canSaveChats();

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dontSave, setDontSave] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDegraded, setIsDegraded] = useState(false);
  const [isCrisis, setIsCrisis] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const [text, setText] = useState("");
  const [crisisSticky, setCrisisSticky] = useState(false);
  const [crisisAcknowledged, setCrisisAcknowledged] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeleteActive, setConfirmDeleteActive] = useState(false);
  const [modal, setModal] = useState<LocalModal>(null);
  const [notice, setNotice] = useState("");

  const logRef = useRef<HTMLDivElement>(null);
  const loggedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastOutgoingRef = useRef("");
  const nextSeqRef = useRef(1);
  const prevPassphraseRef = useRef<string | null>(passphrase);
  const abortControllerRef = useRef<AbortController | null>(null);

  const crisisVisible = crisisSticky || isCrisis;

  // Clear chat helper
  const clearChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setSessionId(null);
    nextSeqRef.current = 1;
    setError(null);
    setIsDegraded(false);
    setIsCrisis(false);
    setIsStreaming(false);
  }, []);

  // Handle vault locking & unlocking mid-chat
  useEffect(() => {
    const prev = prevPassphraseRef.current;
    prevPassphraseRef.current = passphrase;

    // Lock clears keys AND the on-screen saved transcript
    if (prev !== null && passphrase === null) {
      clearChat();
      return;
    }

    // Unlocking mid-chat saves the conversation so far from that point
    if (prev === null && passphrase !== null && !dontSave && !isDemo && messages.length > 0 && !sessionId) {
      void (async () => {
        try {
          const newId = await createSession();
          setSessionId(newId);
          let seq = 1;
          for (const msg of messages) {
            try {
              await saveMessage(newId, seq, msg.role, msg.content);
              msg.seq = seq;
              msg.saveFailed = false;
            } catch {
              msg.seq = seq;
              msg.saveFailed = true;
            }
            seq++;
          }
          nextSeqRef.current = seq;
          setMessages([...messages]);
        } catch {
          // If session creation failed, leave messages marked unsaved
        }
      })();
    }
  }, [passphrase, dontSave, isDemo, messages, sessionId, clearChat]);

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

  const send = async (override?: string) => {
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

    const userMsgId = crypto.randomUUID();
    const userMsg: MessageItem = { id: userMsgId, role: "user", content: outgoing };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    setIsStreaming(true);
    setError(null);

    // Retrying previously failed saves on next turn
    let activeSessionId = sessionId;
    if (canSave && !dontSave) {
      if (!activeSessionId) {
        try {
          activeSessionId = await createSession();
          setSessionId(activeSessionId);
        } catch {
          userMsg.seq = nextSeqRef.current++;
          userMsg.saveFailed = true;
        }
      }

      if (activeSessionId) {
        // Retry any unsaved prior messages
        for (const m of messages) {
          if (m.saveFailed && m.seq) {
            try {
              await saveMessage(activeSessionId, m.seq, m.role, m.content);
              m.saveFailed = false;
            } catch {
              // remains unsaved
            }
          }
        }

        // Save current user message
        const seq = nextSeqRef.current++;
        userMsg.seq = seq;
        try {
          await saveMessage(activeSessionId, seq, "user", outgoing);
          userMsg.saveFailed = false;
        } catch {
          userMsg.saveFailed = true;
        }
      }
    }

    const assistantId = crypto.randomUUID();
    let assistantContent = "";

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Last 30 turns sent as history
    const history = messages.slice(-30).map((m) => ({ role: m.role, content: m.content }));

    try {
      await streamChat({
        message: outgoing,
        history,
        signal: controller.signal,
        onToken: (token) => {
          assistantContent += token;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.id === assistantId) {
              return [...prev.slice(0, -1), { ...last, content: assistantContent }];
            }
            return [
              ...prev,
              {
                id: assistantId,
                role: "assistant",
                content: assistantContent,
              },
            ];
          });
        },
        onComplete: async (fullReply, detectedCrisis) => {
          setIsStreaming(false);
          if (detectedCrisis) {
            setIsCrisis(true);
          }
          const finalReply = fullReply || assistantContent;
          if (finalReply) {
            let assistantSeq: number | undefined;
            let saveFailed = false;

            if (canSave && !dontSave && activeSessionId) {
              assistantSeq = nextSeqRef.current++;
              try {
                await saveMessage(activeSessionId, assistantSeq, "assistant", finalReply);
              } catch {
                saveFailed = true;
              }
            }

            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.id === assistantId) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: finalReply, seq: assistantSeq, saveFailed },
                ];
              }
              return [
                ...prev,
                {
                  id: assistantId,
                  role: "assistant",
                  content: finalReply,
                  seq: assistantSeq,
                  saveFailed,
                },
              ];
            });
          }
        },
        onError: (err) => {
          setError(err);
          setIsStreaming(false);
        },
        onDegraded: (degraded) => {
          setIsDegraded(degraded);
        },
      });
    } catch (err) {
      setIsStreaming(false);
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      if (err && typeof err === "object" && "code" in err) {
        setError(err as ApiError);
      }
    }
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

  const handleSelectPastSession = async (id: string) => {
    const loaded = await loadSession(id);
    setSessionId(id);
    const mapped: MessageItem[] = loaded.map((m) => ({
      id: `saved-${m.seq}`,
      seq: m.seq,
      role: m.role,
      content: m.text,
    }));
    setMessages(mapped);
    nextSeqRef.current = Math.max(...loaded.map((m) => m.seq), 0) + 1;
    setNotice("");
  };

  const handleDeleteActiveSession = async () => {
    if (!sessionId) return;
    try {
      await deleteSession(sessionId);
      clearChat();
      setConfirmDeleteActive(false);
      setNotice(t("chat.deletedNotice"));
    } catch {
      // ignore
    }
  };

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

  // Determine notice text for disclaimer
  let noticeText = t("chat.notSaved");
  if (isDemo) {
    noticeText = t("chat.demoNotice");
  } else if (!canSave) {
    noticeText = t("chat.lockedBanner");
  } else if (dontSave) {
    noticeText = t("chat.notSavedThisConvo");
  }

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

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="past-conversations-btn"
              className="text-btn min-h-6 text-xs flex items-center gap-1"
              onClick={() => setModal("history")}
            >
              <Icon name="clock" size={14} />
              {t("chat.pastConversations")}
            </button>

            {sessionId && (
              confirmDeleteActive ? (
                <div className="flex gap-1 items-center" role="alertdialog">
                  <button
                    type="button"
                    className="outline-btn min-h-6 text-xs text-[var(--danger)]"
                    onClick={() => void handleDeleteActiveSession()}
                  >
                    {t("chat.deleteConfirm")}
                  </button>
                  <button
                    type="button"
                    className="text-btn min-h-6 text-xs"
                    onClick={() => setConfirmDeleteActive(false)}
                  >
                    {t("chat.deleteCancel")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="delete-conversation-btn"
                  className="text-btn min-h-6 text-xs text-[var(--danger)]"
                  onClick={() => setConfirmDeleteActive(true)}
                >
                  <Icon name="trash" size={14} />
                  {t("chat.deleteConvo")}
                </button>
              )
            )}

            {messages.length > 0 && (
              confirmClear ? (
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
              )
            )}
          </div>
        </div>

        {/* Locked banner */}
        {!canSave && !isDemo && (
          <div
            role="status"
            data-testid="chat-locked-banner"
            className="mx-3 mt-3 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-3 text-xs text-[var(--ink)]"
          >
            {t("chat.lockedBanner")}
          </div>
        )}

        {/* Demo banner */}
        {isDemo && (
          <div
            role="status"
            data-testid="chat-demo-banner"
            className="mx-3 mt-3 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-3 text-xs text-[var(--muted)]"
          >
            {t("chat.demoNotice")}
          </div>
        )}

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
          /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- WCAG 2.1.1 scrollable region must be focusable */
          tabIndex={0}
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
                saveFailed={m.saveFailed}
                saveFailedLabel={t("chat.notSavedYet")}
              />
            ) : (
              <div key={m.id} className="message mine">
                <p>
                  <span className="sr-only">{t("chat.youLabel")}: </span>
                  {m.content}
                  {m.saveFailed && (
                    <span
                      data-testid="not-saved-yet"
                      className="ml-2 inline-block rounded bg-[var(--amber-soft)] px-1.5 py-0.5 text-[10px] text-[var(--amber-dark,#b45309)]"
                    >
                      {t("chat.notSavedYet")}
                    </span>
                  )}
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

        {/* Per-conversation toggle when saving is available */}
        {canSave && (
          <div className="px-5 pb-1 flex justify-end">
            <label
              className="flex items-center gap-1.5 text-xs text-[var(--muted)] cursor-pointer select-none"
              data-testid="dont-save-toggle-label"
            >
              <input
                type="checkbox"
                data-testid="dont-save-toggle"
                checked={dontSave}
                onChange={(e) => setDontSave(e.target.checked)}
                className="rounded"
              />
              <span>{t("chat.dontSaveToggle")}</span>
            </label>
          </div>
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
              <button key={k} type="button" onClick={() => void send(t(`chat.starters.${k}`))}>
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
              void send();
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
                  void send();
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
          <Icon name="clock" size={14} /> {noticeText}
        </p>
      </section>

      {modal === "breathing" && (
        <BreathingModal onClose={() => setModal(null)} openGrounding={() => setModal("grounding")} />
      )}
      {modal === "grounding" && <GroundingModal onClose={() => setModal(null)} />}
      {modal === "safety" && (
        <SafetyCardModal student={{ name: "MindSahaay student", institution: "" }} onClose={() => setModal(null)} />
      )}
      {modal === "history" && (
        <PastConversationsModal
          isOpen={true}
          onClose={() => setModal(null)}
          onSelectSession={handleSelectPastSession}
          onDeletedCurrentSession={clearChat}
          currentSessionId={sessionId}
          isVaultLocked={!canSave}
        />
      )}
    </div>
  );
}

function BotMessage({
  label,
  content,
  busy,
  saveFailed,
  saveFailedLabel,
}: {
  label: string;
  content: string;
  busy?: boolean;
  saveFailed?: boolean;
  saveFailedLabel?: string;
}) {
  return (
    <div className="message bot" aria-busy={busy || undefined}>
      <span className="tiny-orb">
        <Icon name="sparkles" size={14} />
      </span>
      <div>
        <div className="flex items-center gap-2">
          <span
            className="mb-1 inline-block rounded-md border border-[var(--line)] bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--primary-dark)] dark:text-[oklch(0.88_0.03_170)]"
            data-testid="ai-label"
          >
            {label}
          </span>
          {saveFailed && (
            <span
              data-testid="not-saved-yet"
              className="mb-1 inline-block rounded bg-[var(--amber-soft)] px-1.5 py-0.5 text-[10px] text-[var(--amber-dark,#b45309)]"
            >
              {saveFailedLabel}
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
