import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { fieldClass, hintClass, labelClass } from "../journal/ui";
import Icon from "../../shared/ui/Icon";
import { useVaultPassphrase } from "../journal/vault";
import VaultGate from "../journal/VaultGate";
import { toOpaqueKey } from "../../shared/lib/storage/secureStore";
import { DEFAULT_WORRY, WORRY_KEY, WorryStateSchema, loadLocal, nextOccurrence, saveLocal, type WorryState } from "./storage";

export default function WorryTime() {
  const passphrase = useVaultPassphrase();
  const hasEncryptedData = Boolean(
    typeof localStorage !== "undefined" && localStorage.getItem(toOpaqueKey("cbt_worry"))
  );

  if (!passphrase && hasEncryptedData) {
    return (
      <VaultGate>
        <WorryTimeContent />
      </VaultGate>
    );
  }
  return <WorryTimeContent />;
}

function WorryTimeContent() {
  const { t } = useTranslation(CONTENT_NS);
  const [state, setState] = useState<WorryState>(() => loadLocal(WORRY_KEY, WorryStateSchema, DEFAULT_WORRY));
  const [time, setTime] = useState(state.time ?? "19:00");
  const [duration, setDuration] = useState(state.duration);
  const [worry, setWorry] = useState("");
  const [status, setStatus] = useState("");

  const commit = (next: WorryState) => {
    setState(next);
    saveLocal(WORRY_KEY, next);
  };

  const saveSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    commit({ ...state, time, duration });
    setStatus(t("cbt.worry.scheduleSaved"));
  };

  const park = (e: React.FormEvent) => {
    e.preventDefault();
    if (!worry.trim()) return;
    commit({ ...state, parked: [...state.parked, { id: crypto.randomUUID(), text: worry.trim() }] });
    setWorry("");
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
          <button type="submit" className="primary-btn min-h-11">
            {t("cbt.worry.saveSchedule")}
          </button>
          <p role="status" className="text-[13px] text-[var(--primary)]">
            {status}
          </p>
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
          <button type="submit" className="outline-btn min-h-11">
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
                onClick={() => commit({ ...state, parked: state.parked.filter((x) => x.id !== p.id) })}
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
