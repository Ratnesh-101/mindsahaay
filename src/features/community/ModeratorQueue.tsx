import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import "../chat/i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { errorClass, hintClass, noticeClass } from "../journal/ui";
import { decideQueueItem, fetchMyRole, fetchModerationQueue, type ModerationDecision, type QueueItem } from "./api";

type State = "loading" | "ready" | "error" | "forbidden";

/** Moderator queue: reported and AI-flagged posts. Only moderators and super admins can use it (RLS enforces this too). */
export default function ModeratorQueue() {
  const { t } = useTranslation(CONTENT_NS);
  const [state, setState] = useState<State>("loading");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState("loading");
    try {
      const role = await fetchMyRole();
      if (role !== "moderator" && role !== "super_admin") {
        setState("forbidden");
        return;
      }
      setItems(await fetchModerationQueue());
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decide = async (item: QueueItem, decision: ModerationDecision) => {
    setBusyKey(item.key);
    try {
      await decideQueueItem(item, decision);
      setItems((prev) => prev.filter((i) => i.key !== item.key));
      setMessage({ error: false, text: t("moderation.actionDone") });
    } catch {
      setMessage({ error: true, text: t("moderation.actionError") });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section aria-labelledby="mod-title">
      <h2 id="mod-title" className="text-2xl font-bold">
        {t("moderation.title")}
      </h2>
      <p className={hintClass}>{t("moderation.subtitle")}</p>

      {state === "loading" && (
        <p role="status" className="muted mt-3">
          {t("moderation.loading")}
        </p>
      )}
      {state === "forbidden" && (
        <p role="alert" className={`${errorClass} mt-3`}>
          {t("moderation.notAllowed")}
        </p>
      )}
      {state === "error" && (
        <div role="alert" className={`${errorClass} mt-3`}>
          <p>{t("moderation.loadError")}</p>
          <button type="button" className="primary-btn mt-2 min-h-11" onClick={() => void refresh()}>
            {t("common.retry")}
          </button>
        </div>
      )}

      <div role="status" aria-live="polite" className="mt-3">
        {message && <p className={message.error ? errorClass : noticeClass}>{message.text}</p>}
      </div>

      {state === "ready" && items.length === 0 && <p className="muted mt-3">{t("moderation.empty")}</p>}
      {state === "ready" && items.length > 0 && (
        <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0" aria-label={t("moderation.listLabel")}>
          {items.map((item) => (
            <li key={item.key} className="panel">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--primary)]">
                {item.kind === "report" ? t("moderation.kindReport") : t("moderation.kindFlagged")}
              </p>
              <h3 className="font-bold">{item.title}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm">{item.content}</p>
              {item.reason && <p className={hintClass}>{t("moderation.reason", { reason: item.reason })}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="primary-btn min-h-11"
                  disabled={busyKey === item.key}
                  onClick={() => void decide(item, "approve")}
                >
                  {t("moderation.approve")}
                </button>
                <button
                  type="button"
                  className="outline-btn min-h-11"
                  disabled={busyKey === item.key}
                  onClick={() => void decide(item, "remove")}
                >
                  {t("moderation.remove")}
                </button>
                {item.kind === "report" && (
                  <button
                    type="button"
                    className="text-btn min-h-6"
                    disabled={busyKey === item.key}
                    onClick={() => void decide(item, "dismiss")}
                  >
                    {t("moderation.dismiss")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
