import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { errorClass, fieldClass, hintClass, labelClass } from "../journal/ui";
import Icon from "../../shared/ui/Icon";
import { ACTIVITY_KEY, ActivitySchema, loadLocal, saveLocal, type Activity } from "./storage";
import { z } from "zod";

import { useVaultPassphrase } from "../journal/vault";
import VaultGate from "../journal/VaultGate";
import { toOpaqueKey } from "../../shared/lib/storage/secureStore";

const ListSchema = z.array(ActivitySchema);
const CATEGORIES = ["pleasure", "mastery", "social"] as const;

export default function ActivityPlanner() {
  const passphrase = useVaultPassphrase();
  const hasEncryptedData = Boolean(
    typeof localStorage !== "undefined" && localStorage.getItem(toOpaqueKey("cbt_activities"))
  );

  if (!passphrase && hasEncryptedData) {
    return (
      <VaultGate>
        <ActivityPlannerContent />
      </VaultGate>
    );
  }
  return <ActivityPlannerContent />;
}

function ActivityPlannerContent() {
  const { t } = useTranslation(CONTENT_NS);
  const [items, setItems] = useState<Activity[]>(() => loadLocal(ACTIVITY_KEY, ListSchema, []));
  const [name, setName] = useState("");
  const [when, setWhen] = useState("");
  const [category, setCategory] = useState<Activity["category"]>("pleasure");
  const [moodBefore, setMoodBefore] = useState(4);
  const [error, setError] = useState("");

  const commit = (next: Activity[]) => {
    setItems(next);
    saveLocal(ACTIVITY_KEY, next);
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !when) {
      setError(t("cbt.activity.required"));
      return;
    }
    setError("");
    commit([
      ...items,
      { id: crypto.randomUUID(), name: name.trim(), when, category, moodBefore, moodAfter: null, done: false },
    ]);
    setName("");
    setWhen("");
  };

  const markDone = (id: string, moodAfter: number) =>
    commit(items.map((a) => (a.id === id ? { ...a, done: true, moodAfter } : a)));

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
        <button type="submit" className="primary-btn min-h-11">
          <Icon name="plus" size={16} /> {t("cbt.activity.add")}
        </button>
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
            onDone={(m) => markDone(a.id, m)}
            onDelete={() => commit(items.filter((x) => x.id !== a.id))}
          />
        ))}
      </section>
    </div>
  );
}

function ActivityRow({
  activity,
  onDone,
  onDelete,
}: {
  activity: Activity;
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
          <button type="button" className="outline-btn min-h-6" onClick={() => onDone(after)}>
            {t("cbt.activity.markDone")}
          </button>
        </div>
      )}
    </article>
  );
}
