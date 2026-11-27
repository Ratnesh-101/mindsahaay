import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { fieldClass, errorClass, hintClass, labelClass } from "../journal/ui";
import Icon from "../../shared/ui/Icon";
import VaultGate from "../journal/VaultGate";
import { DEFAULT_WORRY, WORRY_KEY, WorryStateSchema, loadLocal, nextOccurrence, saveLocal, type WorryState } from "./storage";

/**
 * Worry time is stored encrypted on this device only, under the vault passphrase, so it is always
 * behind the vault gate. Without it a locked vault would silently drop what was typed.
 */
export default function WorryTime() {
  return (
    <VaultGate>
      <WorryTimeContent />
    </VaultGate>
  );
}

function WorryTimeContent() {
  const { t } = useTranslation(CONTENT_NS);
  const [state, setState] = useState<WorryState>(() => loadLocal(WORRY_KEY, WorryStateSchema, DEFAULT_WORRY));
  const [time, setTime] = useState(state.time ?? "19:00");
  const [duration, setDuration] = useState(state.duration);
  const [worry, setWorry] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  /** Saves the new state, and shows it only once it is really stored. Returns false (and says so) otherwise. */
  const commit = async (next: WorryState): Promise<boolean> => {
    setSaving(true);
    const ok = await saveLocal(WORRY_KEY, next);
    setSaving(false);
    if (!ok) {
      setStatus("");
      setError(t("cbt.worry.saveError"));
      return false;
    }
    setState(next);
    setError("");
    return true;
  };

  const saveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setStatus("");
    const ok = await commit({ ...state, time, duration });
    if (ok) setStatus(t("cbt.worry.scheduleSaved"));
  };

  const park = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!worry.trim() || saving) return;
    setStatus("");
    const ok = await commit({ ...state, parked: [...state.parked, { id: crypto.randomUUID(), text: worry.trim() }] });
    if (ok) {
      setWorry("");
      setStatus(t("cbt.worry.parkedSaved"));
    }
  };

  const next = state.time ? nextOccurrence(state.time) : null;

  return (
    <div className="journal-layout">
      <div className="journal-editor">
        <h2 className="text-lg font-bold">{t("cbt.worry.title")}</h2>
        <p className={hintClass}>{t("cbt.worry.intro")}</p>
        <form onSubmit={saveSchedule} className="flex flex-col gap-3" aria-label={t("cbt.worry.title")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="wt-time" className={labelClass}>
                {t("cbt.worry.time")}
              </label>
              <input id="wt-time" type="time" className={fieldClass} value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <label htmlFor="wt-duration" className={labelClass}>
                {t("cbt.worry.duration")}
              </label>
              <input
                id="wt-duration"
                type="number"
                min={5}
                max={60}
                className={fieldClass}
                value={duration}
                onChange={(e) => setDuration(Math.min(60, Math.max(5, Number(e.target.value) || 15)))}
              />
            </div>
          </div>
          <button type="submit" className="primary-btn min-h-11" disabled={saving}>
            {t("cbt.worry.saveSchedule")}
          </button>
          <p role="status" aria-live="polite" className="text-[13px] text-[var(--primary)]">
            {status}
          </p>
          {error && (
            <p role="alert" className={errorClass}>
              {error}
            </p>
          )}
        </form>
        <p className="text-sm font-semibold" data-testid="worry-next">
          {next
            ? t("cbt.worry.next", { when: next.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }) })
            : t("cbt.worry.notSet")}
        </p>
        <p className={hintClass}>{t("cbt.worry.reviewHint")}</p>
      </div>

      <section className="journal-list" aria-labelledby="wt-parked">
        <form onSubmit={park} className="flex flex-col gap-2">
          <label htmlFor="wt-worry" className={labelClass}>
            {t("cbt.worry.parkLabel")}
          </label>
          <input
            id="wt-worry"
            className={fieldClass}
            value={worry}
            placeholder={t("cbt.worry.parkPlaceholder")}
            onChange={(e) => setWorry(e.target.value)}
          />
          <button type="submit" className="outline-btn min-h-11" disabled={saving}>
            <Icon name="plus" size={16} /> {t("cbt.worry.park")}
          </button>
        </form>
        <h2 id="wt-parked" className="eyebrow">
          {t("cbt.worry.parkedTitle", { count: state.parked.length })}
        </h2>
        {state.parked.length === 0 && <p className="muted">{t("cbt.worry.parkedEmpty")}</p>}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {state.parked.map((p) => (
            <li key={p.id} className="journal-item flex-row items-center justify-between">
              <span>{p.text}</span>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 32, height: 32, border: "none" }}
                aria-label={t("cbt.worry.remove", { text: p.text })}
                disabled={saving}
                onClick={async () => {
                  setStatus("");
                  const ok = await commit({ ...state, parked: state.parked.filter((x) => x.id !== p.id) });
                  if (ok) setStatus(t("cbt.worry.removedSaved"));
                }}
              >
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
