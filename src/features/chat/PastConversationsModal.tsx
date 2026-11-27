import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CONTENT_NS } from "../journal/registerBundle";
import { listSessions, deleteSession, deleteAllSessions, type SavedSession } from "./history";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";

interface PastConversationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (sessionId: string) => Promise<void>;
  onDeletedCurrentSession?: () => void;
  currentSessionId: string | null;
  isVaultLocked: boolean;
}

export default function PastConversationsModal({
  isOpen,
  onClose,
  onSelectSession,
  onDeletedCurrentSession,
  currentSessionId,
  isVaultLocked,
}: PastConversationsModalProps) {
  const { t } = useTranslation(CONTENT_NS);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listSessions();
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchSessions();
      setConfirmDeleteId(null);
      setConfirmDeleteAll(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDeleteOne = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setConfirmDeleteId(null);
      if (currentSessionId === id && onDeletedCurrentSession) {
        onDeletedCurrentSession();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete conversation");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAll = async () => {
    setBusy(true);
    setError("");
    try {
      await deleteAllSessions();
      setSessions([]);
      setConfirmDeleteAll(false);
      if (onDeletedCurrentSession) {
        onDeletedCurrentSession();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete all conversations");
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = async (id: string) => {
    try {
      await onSelectSession(id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open conversation");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} ariaLabel={t("chat.pastChatsTitle")}>
      <div className="modal-head">
        <h3 id="past-chats-title" className="text-lg font-bold">
          {t("chat.pastChatsTitle")}
        </h3>
        <button
          type="button"
          className="text-btn p-1"
          onClick={onClose}
          aria-label={t("chat.closeHistory")}
        >
          <Icon name="x" size={18} />
        </button>
      </div>

      {isVaultLocked && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-3 text-xs text-[var(--muted)]"
        >
          {t("chat.lockedBanner")}
        </div>
      )}

      {error && (
        <p role="alert" className="mb-3 text-xs text-[var(--danger)]">
          {error}
        </p>
      )}

      {confirmDeleteAll ? (
        <div className="mb-4 rounded-xl border border-[var(--danger)] bg-[var(--canvas)] p-3" role="alertdialog">
          <p className="text-xs font-semibold text-[var(--danger)]">{t("chat.deleteAllChatsConfirm")}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="primary-btn min-h-7 text-xs bg-[var(--danger)]"
              disabled={busy}
              onClick={() => void handleDeleteAll()}
            >
              {t("chat.deleteConfirm")}
            </button>
            <button
              type="button"
              className="text-btn min-h-7 text-xs"
              disabled={busy}
              onClick={() => setConfirmDeleteAll(false)}
            >
              {t("chat.deleteCancel")}
            </button>
          </div>
        </div>
      ) : (
        sessions.length > 0 && (
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              data-testid="delete-all-chats-btn"
              className="text-btn min-h-6 text-xs text-[var(--danger)]"
              onClick={() => setConfirmDeleteAll(true)}
            >
              <Icon name="trash" size={14} /> {t("chat.deleteAllChats")}
            </button>
          </div>
        )
      )}

      {loading ? (
        <p className="py-8 text-center text-xs text-[var(--muted)]">Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="py-8 text-center text-xs text-[var(--muted)]" data-testid="no-past-chats">
          {t("chat.noPastConversations")}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {sessions.map((session) => {
            const dateStr = new Date(session.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            const isDeleting = confirmDeleteId === session.id;

            return (
              <li key={session.id} className="py-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{dateStr}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {t("chat.messagesCount", { count: session.messageCount })}
                      {session.id === currentSessionId && " · Active"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid={`open-session-${session.id}`}
                      className="outline-btn min-h-7 text-xs px-2"
                      disabled={isVaultLocked}
                      onClick={() => void handleOpen(session.id)}
                    >
                      {t("chat.openPastChat")}
                    </button>
                    <button
                      type="button"
                      data-testid={`delete-session-${session.id}`}
                      className="text-btn p-1 text-[var(--danger)]"
                      aria-label={`${t("chat.deleteConvo")} ${dateStr}`}
                      onClick={() => setConfirmDeleteId(session.id)}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </div>

                {isDeleting && (
                  <div
                    className="mt-1 rounded-lg border border-[var(--danger)] bg-[var(--canvas)] p-2"
                    role="alertdialog"
                  >
                    <p className="text-xs text-[var(--danger)]">{t("chat.deleteConvoConfirm")}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="primary-btn min-h-6 text-xs bg-[var(--danger)]"
                        disabled={busy}
                        onClick={() => void handleDeleteOne(session.id)}
                      >
                        {t("chat.deleteConfirm")}
                      </button>
                      <button
                        type="button"
                        className="text-btn min-h-6 text-xs"
                        disabled={busy}
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        {t("chat.deleteCancel")}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
