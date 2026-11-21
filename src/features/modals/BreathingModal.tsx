import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "../cbt/i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";

interface BreathingModalProps {
  onClose: () => void;
  openGrounding: () => void;
}

type Phase = "inhale" | "hold" | "exhale";
const PHASE_SECONDS: Record<Phase, number> = { inhale: 4, hold: 7, exhale: 8 };
const NEXT: Record<Phase, Phase> = { inhale: "hold", hold: "exhale", exhale: "inhale" };
const TOTAL_CYCLES = 4;

interface Tick {
  phase: Phase;
  count: number;
  cycle: number;
  finished: boolean;
}

/** Pure state step for one second of the 4-7-8 exercise. */
export function nextTick(s: Tick): Tick {
  if (s.finished) return s;
  if (s.count > 1) return { ...s, count: s.count - 1 };
  if (s.phase === "exhale") {
    if (s.cycle >= TOTAL_CYCLES) return { ...s, count: 0, finished: true };
    return { phase: "inhale", count: PHASE_SECONDS.inhale, cycle: s.cycle + 1, finished: false };
  }
  const phase = NEXT[s.phase];
  return { ...s, phase, count: PHASE_SECONDS[phase] };
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

export default function BreathingModal({ onClose, openGrounding }: BreathingModalProps) {
  const { t } = useTranslation(CONTENT_NS);
  const reduced = usePrefersReducedMotion();
  const [tick, setTick] = useState<Tick>({ phase: "inhale", count: PHASE_SECONDS.inhale, cycle: 1, finished: false });
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running || tick.finished) return;
    const timer = window.setInterval(() => setTick((s) => nextTick(s)), 1000);
    return () => window.clearInterval(timer);
  }, [running, tick.finished]);

  const guidance =
    tick.phase === "inhale" ? t("tools.breathing.guideInhale") : tick.phase === "hold" ? t("tools.breathing.guideHold") : t("tools.breathing.guideExhale");

  const circleStyle: React.CSSProperties = reduced ? { transition: "none", animation: "none", transform: "none" } : {};

  return (
    <Modal onClose={onClose} ariaLabel={t("tools.breathing.title")} className="breathing-card">
      <div className="modal-head">
        <div>
          <span className="eyebrow green">{t("tools.breathing.eyebrow")}</span>
          <h3>{t("tools.breathing.title")}</h3>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t("tools.breathing.close")}>
          <Icon name="x" />
        </button>
      </div>
      <div className="breathing-display">
        <div className={`breath-circle ${tick.phase}`} style={circleStyle}>
          <span className="phase-title">{t(`tools.breathing.${tick.phase}`)}</span>
          <span className="phase-count" aria-hidden="true">
            {tick.finished ? "" : `${tick.count}s`}
          </span>
        </div>
        <p className="breath-guidance" role="status" aria-live="polite">
          {tick.finished ? t("tools.breathing.complete") : `${t(`tools.breathing.${tick.phase}`)}. ${guidance}`}
        </p>
        <span className="cycle-badge">{t("tools.breathing.cycle", { current: tick.cycle, total: TOTAL_CYCLES })}</span>
        {reduced && <p className="muted text-xs">{t("tools.breathing.reducedMotion")}</p>}
        <p className="muted text-xs">{t("tools.breathing.medical")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!tick.finished && (
          <button type="button" className="outline-btn min-h-11" aria-pressed={!running} onClick={() => setRunning((r) => !r)}>
            {running ? t("tools.breathing.pause") : t("tools.breathing.resume")}
          </button>
        )}
        <button type="button" className="primary-btn min-h-11 flex-1" onClick={onClose}>
          {t("tools.breathing.finish")}
        </button>
      </div>
      <button
        type="button"
        className="text-btn min-h-6"
        onClick={() => {
          onClose();
          openGrounding();
        }}
        style={{ justifyContent: "center", width: "100%", marginTop: 12 }}
      >
        {t("tools.breathing.tryGrounding")}
      </button>
    </Modal>
  );
}
