import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import "../chat/i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { useVaultPassphrase } from "../journal/vault";
import { errorClass, fieldClass, hintClass, labelClass } from "../journal/ui";
import HelplineLinks from "../chat/HelplineLinks";
import { detectRisk } from "../../domain/risk/lexicon";
import Icon from "../../shared/ui/Icon";
import {
  DISTORTION_KEYS,
  deleteThoughtRecord,
  fetchThoughtRecords,
  saveThoughtRecord,
  type DistortionKey,
  type ThoughtRecord as ThoughtRecordItem,
} from "./api";

const EMPTY = {
  situation: "",
  automaticThought: "",
  emotion: "",
  evidenceFor: "",
  evidenceAgainst: "",
  balancedThought: "",
};

/** Must be rendered while the vault is unlocked (wrap in VaultGate). */
export default function ThoughtRecord() {
  const { t } = useTranslation(CONTENT_NS);
  const passphrase = useVaultPassphrase();
  const [form, setForm] = useState(EMPTY);
  const [distortions, setDistortions] = useState<DistortionKey[]>([]);
  const [before, setBefore] = useState(60);
  const [after, setAfter] = useState(40);
  const [records, setRecords] = useState<ThoughtRecordItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [crisis, setCrisis] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!passphrase) return;
    try {
      setRecords(await fetchThoughtRecords(passphrase));
    } catch {
      setError(t("cbt.thought.loadError"));
    }
  }, [passphrase, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggle = (key: DistortionKey) =>
    setDistortions((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase || saving) return;
    setError("");
    setStatus("");
    if (!form.situation.trim() || !form.automaticThought.trim() || !form.balancedThought.trim()) {
      setError(t("cbt.thought.required"));
      return;
    }
    setSaving(true);
    const risk = detectRisk(Object.values(form).join(". "));
    try {
      const saved = await saveThoughtRecord(
        { ...form, distortions, intensityBefore: before, intensityAfter: after },
        passphrase,
      );
      setRecords((prev) => [saved, ...prev]);
      setForm(EMPTY);
      setDistortions([]);
      setStatus(t("cbt.thought.saved"));
      setCrisis(risk.level === "high" || risk.level === "imminent");
    } catch {
      setError(t("cbt.thought.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteThoughtRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setError(t("cbt.thought.saveError"));
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="journal-layout">
      <form className="journal-editor" onSubmit={(e) => void submit(e)} aria-labelledby="tr-title" noValidate>
        <h2 id="tr-title" className="text-lg font-bold">
          {t("cbt.thought.title")}
        </h2>
        <p className={hintClass}>{t("cbt.thought.intro")}</p>

        <div>
          <label htmlFor="tr-situation" className={labelClass}>
            {t("cbt.thought.situation")}
          </label>
          <textarea id="tr-situation" value={form.situation} onChange={set("situation")} aria-describedby="tr-situation-hint" required />
          <p id="tr-situation-hint" className={hintClass}>
            {t("cbt.thought.situationHint")}
          </p>
        </div>

        <div>
          <label htmlFor="tr-auto" className={labelClass}>
            {t("cbt.thought.automaticThought")}
          </label>
          <textarea id="tr-auto" value={form.automaticThought} onChange={set("automaticThought")} aria-describedby="tr-auto-hint" required />
          <p id="tr-auto-hint" className={hintClass}>
            {t("cbt.thought.automaticThoughtHint")}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="tr-emotion" className={labelClass}>
              {t("cbt.thought.emotion")}
            </label>
            <input id="tr-emotion" className={fieldClass} value={form.emotion} onChange={set("emotion")} />
          </div>
          <div>
            <label htmlFor="tr-before" className={labelClass}>
              {t("cbt.thought.intensityBefore")}: {before}
            </label>
            <input id="tr-before" type="range" min={0} max={100} value={before} onChange={(e) => setBefore(Number(e.target.value))} className="w-full" />
          </div>
        </div>

        <fieldset className="m-0 border-0 p-0">
          <legend className={labelClass}>{t("cbt.thought.distortions")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {DISTORTION_KEYS.map((k) => (
              <label
                key={k}
                className={`quick-pill min-h-6 cursor-pointer ${distortions.includes(k) ? "active" : ""}`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={distortions.includes(k)}
                  onChange={() => toggle(k)}
                />
                {t(`cbt.distortion.${k}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="tr-for" className={labelClass}>
            {t("cbt.thought.evidenceFor")}
          </label>
          <textarea id="tr-for" value={form.evidenceFor} onChange={set("evidenceFor")} />
        </div>
        <div>
          <label htmlFor="tr-against" className={labelClass}>
            {t("cbt.thought.evidenceAgainst")}
          </label>
          <textarea id="tr-against" value={form.evidenceAgainst} onChange={set("evidenceAgainst")} />
        </div>
        <div>
          <label htmlFor="tr-balanced" className={labelClass}>
            {t("cbt.thought.balancedThought")}
          </label>
          <textarea id="tr-balanced" value={form.balancedThought} onChange={set("balancedThought")} aria-describedby="tr-balanced-hint" required />
          <p id="tr-balanced-hint" className={hintClass}>
            {t("cbt.thought.balancedHint")}
          </p>
        </div>
        <div>
          <label htmlFor="tr-after" className={labelClass}>
            {t("cbt.thought.intensityAfter")}: {after}
          </label>
          <input id="tr-after" type="range" min={0} max={100} value={after} onChange={(e) => setAfter(Number(e.target.value))} className="w-full" />
        </div>

        <button type="submit" className="primary-btn min-h-11" disabled={saving}>
          <Icon name="check" size={16} /> {saving ? t("cbt.thought.saving") : t("cbt.thought.save")}
        </button>
        <p role="status" aria-live="polite" className="text-[13px] text-[var(--primary)]">
          {status}
        </p>
        {error && (
          <p role="alert" className={errorClass}>
            {error}
          </p>
        )}
        {crisis && (
          <section role="alert" className="rounded-xl border-2 border-[var(--danger)] bg-[var(--amber-soft)] p-3" data-testid="cbt-crisis">
            <h3 className="font-bold">{t("cbt.thought.crisisTitle")}</h3>
            <p className="my-1 text-[13px]">{t("cbt.thought.crisisBody")}</p>
            <HelplineLinks />
          </section>
        )}
      </form>

      <section className="journal-list" aria-labelledby="tr-list-title">
        <h2 id="tr-list-title" className="eyebrow">
          {t("cbt.thought.pastTitle", { count: records.length })}
        </h2>
        {records.map((r) => {
          const date = new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          return (
            <article key={r.id} className="journal-item">
              <div className="flex items-start justify-between gap-2">
                <h3 className="m-0 text-[15px] font-bold">{r.automaticThought}</h3>
                {pendingDelete === r.id ? (
                  <span className="flex gap-2">
                    <button type="button" className="outline-btn min-h-6" onClick={() => void remove(r.id)}>
                      {t("cbt.thought.confirmDelete")}
                    </button>
                    <button type="button" className="text-btn min-h-6" onClick={() => setPendingDelete(null)}>
                      {t("cbt.thought.cancelDelete")}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 32, height: 32, border: "none" }}
                    aria-label={t("cbt.thought.delete", { date })}
                    onClick={() => setPendingDelete(r.id)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
              <small>
                {date} · {t("cbt.thought.shift", { before: r.intensityBefore, after: r.intensityAfter })}
              </small>
              <p>{r.balancedThought}</p>
              {r.distortions.length > 0 && (
                <p className={hintClass}>{r.distortions.map((d) => t(`cbt.distortion.${d}`)).join(", ")}</p>
              )}
            </article>
          );
        })}
        {records.length === 0 && <p className="muted py-4">{t("cbt.thought.empty")}</p>}
      </section>
    </div>
  );
}
