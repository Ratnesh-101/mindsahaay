import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import HelplineLinks from "./HelplineLinks";
import { requestCounsellorContact } from "./api";

interface CrisisCardProps {
  /** Opens the student's safety plan. */
  onOpenSafetyPlan: () => void;
  /** Optional override for "message my counsellor". Defaults to creating a counsellor-contact risk event. */
  onMessageCounsellor?: () => void | Promise<void>;
}

/**
 * Inescapable crisis card: it has no close button and stays on screen for the rest of the session.
 * It takes focus when it appears and is announced assertively.
 */
export default function CrisisCard({ onOpenSafetyPlan, onMessageCounsellor }: CrisisCardProps) {
  const { t } = useTranslation(CONTENT_NS);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [counsellorState, setCounsellorState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const messageCounsellor = async () => {
    setCounsellorState("sending");
    try {
      await (onMessageCounsellor ? onMessageCounsellor() : requestCounsellorContact());
      setCounsellorState("sent");
    } catch {
      setCounsellorState("failed");
    }
  };

  return (
    <section
      role="alert"
      aria-live="assertive"
      aria-labelledby="crisis-card-title"
      data-testid="crisis-card"
      className="m-3 rounded-2xl border-2 border-[var(--danger)] bg-[var(--amber-soft)] p-4 text-[var(--ink)]"
    >
      <h2 id="crisis-card-title" ref={headingRef} tabIndex={-1} className="text-lg font-bold">
        {t("chat.crisis.title")}
      </h2>
      <p className="mt-1 text-sm leading-relaxed">{t("chat.crisis.body")}</p>
      <h3 className="mt-3 text-[13px] font-bold uppercase tracking-wide">{t("chat.crisis.helplines")}</h3>
      <div className="mt-1">
        <HelplineLinks />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="outline-btn min-h-11" onClick={onOpenSafetyPlan}>
          {t("chat.crisis.safetyPlan")}
        </button>
        <button
          type="button"
          className="outline-btn min-h-11"
          onClick={() => void messageCounsellor()}
          disabled={counsellorState === "sending" || counsellorState === "sent"}
        >
          {t("chat.crisis.messageCounsellor")}
        </button>
      </div>
      <p role="status" className="mt-2 text-[13px]">
        {counsellorState === "sent" && t("chat.crisis.counsellorSent")}
        {counsellorState === "failed" && t("chat.crisis.counsellorFailed")}
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">{t("chat.crisis.pinned")}</p>
    </section>
  );
}
