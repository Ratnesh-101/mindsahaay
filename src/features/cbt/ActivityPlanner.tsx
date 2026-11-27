import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { errorClass, fieldClass, hintClass, labelClass } from "../journal/ui";
import Icon from "../../shared/ui/Icon";
import { ACTIVITY_KEY, ActivitySchema, loadLocal, saveLocal, type Activity } from "./storage";
import SyncStatusLine from "./SyncStatusLine";
import { useReloadOnRemoteChange } from "../../shared/lib/storage/useSyncStatus";
import { z } from "zod";

import VaultGate from "../journal/VaultGate";

const ListSchema = z.array(ActivitySchema);
const CATEGORIES = ["pleasure", "mastery", "social"] as const;

/**
 * Activities are encrypted under the vault passphrase, stored on this device and synced to the account as
 * ciphertext. The planner is therefore always behind the vault gate: without it a locked vault would
 * silently drop what was typed.
 */
export default function ActivityPlanner() {
  return (
    <VaultGate>
      <ActivityPlannerContent />
    </VaultGate>
  );
}

function ActivityPlannerContent() {
  const { t } = useTranslation(CONTENT_NS);
  const [items, setItems] = useState<Activity[]>(() => loadLocal(ACTIVITY_KEY, ListSchema, []));
  const [name, setName] = useState("");
  const [when, setWhen] = useState("");
  const [category, setCategory] = useState<Activity["category"]>("pleasure");
  const [moodBefore, setMoodBefore] = useState(4);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  // A newer copy from another device was pulled after unlock: show it.
  useReloadOnRemoteChange("cbt_activities", () => setItems(loadLocal(ACTIVITY_KEY, ListSchema, [])));

  /** Saves the new list, and shows it only once it is really stored. Returns false (and says so) otherwise. */
  const commit = async (next: Activity[]): Promise<boolean> => {
    setSaving(true);
    const ok = await saveLocal(ACTIVITY_KEY, next);
    setSaving(false);
    if (!ok) {
      setStatus("");
      setError(t("cbt.activity.saveError"));
      return false;
    }
    setItems(next);
    setError("");
    return true;
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim() || !when) {
      setError(t("cbt.activity.required"));
      return;
    }
    setError("");
    setStatus("");
    const ok = await commit([
      ...items,
      { id: crypto.randomUUID(), name: name.trim(), when, category, moodBefore, moodAfter: null, done: false },
    ]);
    if (ok) {
      setName("");
      setWhen("");
      setStatus(t("cbt.activity.saved"));
    }
  };

  const markDone = async (id: string, moodAfter: number) => {
    setStatus("");
    const ok = await commit(items.map((a) => (a.id === id ? { ...a, done: true, moodAfter } : a)));
    if (ok) setStatus(t("cbt.activity.saved"));
  };

  const remove = async (id: string) => {
    setStatus("");
    const ok = await commit(items.filter((x) => x.id !== id));
    if (ok) setStatus(t("cbt.activity.removed"));
  };

  return (
    <div className="journal-layout">
      <form className="journal-editor" onSubmit={add} aria-labelledby="ap-title" noValidate>
        <h2 id="ap-title" className="text-lg font-bold">
          {t("cbt.activity.title")}
        </h2>
        <p className={hintClass}>{t("cbt.activity.intro")}</p>
        <div>
          <label htmlFor="ap-name" className={labelClass}>
            {t("cbt.activity.name")}
          </label>
          <input
            id="ap-name"
            className={fieldClass}
            value={name}
            placeholder={t("cbt.activity.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="ap-when" className={labelClass}>
              {t("cbt.activity.when")}
            </label>
            <input id="ap-when" type="datetime-local" className={fieldClass} value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ap-cat" className={labelClass}>
              {t("cbt.activity.category")}
            </label>
            <select
              id="ap-cat"
              className={fieldClass}
              value={category}
              onChange={(e) => setCategory(e.target.value as Activity["category"])}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`cbt.activity.categories.${c}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="ap-mood" className={labelClass}>
            {t("cbt.activity.moodBefore")}: {moodBefore}
          </label>
          <input id="ap-mood" type="range" min={0} max={10} value={moodBefore} onChange={(e) => setMoodBefore(Number(e.target.value))} className="w-full" />
        </div>
        {error && (
          <p role="alert" className={errorClass}>
            {error}
          </p>
        )}
        <button type="submit" className="primary-btn min-h-11" disabled={saving}>
          <Icon name="plus" size={16} /> {t("cbt.activity.add")}
        </button>
        <p role="status" aria-live="polite" className="text-[13px] text-[var(--primary)]">
          {status}
        </p>
        <SyncStatusLine slot="cbt_activities" />
      </form>

      <section className="journal-list" aria-labelledby="ap-list">
        <h2 id="ap-list" className="eyebrow">
          {t("cbt.activity.listTitle")}
        </h2>
        {items.length === 0 && <p className="muted py-4">{t("cbt.activity.empty")}</p>}
        {items.map((a) => (
          <ActivityRow
            key={a.id}
            activity={a}
            busy={saving}
            onDone={(m) => void markDone(a.id, m)}
            onDelete={() => void remove(a.id)}
          />
        ))}
      </section>
    </div>
  );
}

function ActivityRow({
  activity,
  busy,
  onDone,
  onDelete,
}: {
  activity: Activity;
  busy: boolean;
  onDone: (moodAfter: number) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation(CONTENT_NS);
  const [after, setAfter] = useState(activity.moodBefore);
  const id = `ap-after-${activity.id}`;
  return (
    <article className="journal-item">
      <div className="flex items-start justify-between gap-2">
        <h3 className="m-0 text-[15px] font-bold">{activity.name}</h3>
        <button
          type="button"
          className="icon-btn"
          style={{ width: 32, height: 32, border: "none" }}
          aria-label={t("cbt.activity.delete", { name: activity.name })}
          disabled={busy}
          onClick={onDelete}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
      <small>
        {t(`cbt.activity.categories.${activity.category}`)} · {new Date(activity.when).toLocaleString()}
      </small>
      {activity.done ? (
        <p>
          {t("cbt.activity.done")}: {t("cbt.activity.change", { before: activity.moodBefore, after: activity.moodAfter ?? "-" })}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="text-[13px]">
            {t("cbt.activity.moodAfter")}: {after}
          </label>
          <input id={id} type="range" min={0} max={10} value={after} onChange={(e) => setAfter(Number(e.target.value))} />
          <button type="button" className="outline-btn min-h-6" disabled={busy} onClick={() => onDone(after)}>
            {t("cbt.activity.markDone")}
          </button>
        </div>
      )}
    </article>
  );
}
