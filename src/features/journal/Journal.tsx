import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import "../chat/i18n";
import { CONTENT_NS } from "./registerBundle";
import { deleteJournal, fetchJournals, saveJournal, type DecryptedJournalEntry } from "../../shared/lib/api/journal";
import { detectRisk } from "../../domain/risk/lexicon";
import Icon from "../../shared/ui/Icon";
import HelplineLinks from "../chat/HelplineLinks";
import CbtToolkit from "../cbt/CbtToolkit";
import VaultGate from "./VaultGate";
import { JOURNAL_PROMPT_KEYS, MOOD_KEYS } from "./prompts";
import { lockVault, useVaultPassphrase } from "./vault";
import { errorClass, fieldClass, labelClass } from "./ui";
import { isDemoModeActive } from "../auth/demoMode";

interface JournalProps {
  /** Kept for compatibility with the host app; identity comes from the Supabase session. */
  studentId?: string;
}

type Tab = "journal" | "cbt";

export default function Journal(_props: JournalProps) {
  const { t } = useTranslation(CONTENT_NS);
  const [tab, setTab] = useState<Tab>("journal");
  const passphrase = useVaultPassphrase();
  const tabs: Tab[] = ["journal", "cbt"];

  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const next = tabs[(index + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      setTab(next);
      document.getElementById(`journal-tab-${next}`)?.focus();
    }
  };

  return (
    <div className="page">
      <div className="directory-head">
        <div>
          <h1>{t("journal.title")}</h1>
          <p>{t("journal.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="segment" role="tablist" aria-label={t("journal.tabsLabel")}>
            {tabs.map((id, i) => (
              <button
                key={id}
                id={`journal-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={`journal-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                className={`min-h-6 ${tab === id ? "active" : ""}`}
                onClick={() => setTab(id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {id === "journal" ? t("journal.tabJournal") : t("journal.tabCbt")}
              </button>
            ))}
          </div>
          {passphrase && (
            <button type="button" className="outline-btn min-h-6" onClick={() => lockVault()}>
              {t("journal.lock")}
            </button>
          )}
        </div>
      </div>

      <div id={`journal-panel-${tab}`} role="tabpanel" aria-labelledby={`journal-tab-${tab}`}>
        {tab === "journal" ? (
          <VaultGate>
            <JournalWorkspace />
          </VaultGate>
        ) : (
          <CbtToolkit />
        )}
      </div>
    </div>
  );
}

const DEMO_ENTRIES_DEFAULT: DecryptedJournalEntry[] = [
  {
    id: "demo-journal-1",
    title: "Mid-semester test reflections (Demo Data)",
    content:
      "Took a 15-minute walk around campus after the data structures exam. Practiced 4-7-8 breathing when thoughts of perfectionism arose. Feeling more grounded now.",
    mood: "Calm",
    prompt: "Write about a small moment of peace you experienced today.",
    createdAt: new Date().toISOString(),
    isEncrypted: false,
  },
  {
    id: "demo-journal-2",
    title: "Hostel evening quiet time (Demo Data)",
    content:
      "Listened to the 432Hz singing bowl soundscape in my room. Grateful for a supportive chat with my roommate Kabir over chai.",
    mood: "Peaceful",
    prompt: "Who or what helped you feel supported this week, even a little?",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    isEncrypted: false,
  },
];

let demoEntriesStore: DecryptedJournalEntry[] = [...DEMO_ENTRIES_DEFAULT];

function JournalWorkspace() {
  const { t } = useTranslation(CONTENT_NS);
  const passphrase = useVaultPassphrase();
  const [entries, setEntries] = useState<DecryptedJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<string>(MOOD_KEYS[0]);
  const [promptKey, setPromptKey] = useState<string>(JOURNAL_PROMPT_KEYS[0]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [crisis, setCrisis] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!passphrase) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      if (isDemoModeActive()) {
        setEntries([...demoEntriesStore]);
        setError("");
      } else {
        setEntries(await fetchJournals(passphrase));
        setError("");
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      setLoadFailed(true);
      setError(code === "CRYPTO_DECRYPT_FAILED" ? t("journal.decryptError") : t("journal.loadError"));
    } finally {
      setLoading(false);
    }
  }, [passphrase, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const promptText = t(`journal.prompts.${promptKey}`);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !passphrase || saving) return;
    setSaving(true);
    setError("");
    setStatus("");
    const risk = detectRisk(content);
    try {
      if (isDemoModeActive()) {
        const saved: DecryptedJournalEntry = {
          id: `demo-entry-${Date.now()}`,
          title: title.trim() ? `${title.trim()} (Demo Data)` : `${t("journal.defaultTitle")} (Demo Data)`,
          content,
          mood: t(`journal.moods.${mood}`),
          prompt: promptText,
          createdAt: new Date().toISOString(),
          isEncrypted: false,
        };
        demoEntriesStore = [saved, ...demoEntriesStore];
        setEntries((prev) => [saved, ...prev]);
        setTitle("");
        setContent("");
        setStatus(t("journal.saved"));
        setCrisis(risk.level === "high" || risk.level === "imminent");
      } else {
        const saved = await saveJournal({
          title: title.trim() || t("journal.defaultTitle"),
          content,
          mood: t(`journal.moods.${mood}`),
          prompt: promptText,
          passphrase,
        });
        setEntries((prev) => [saved, ...prev]);
        setTitle("");
        setContent("");
        setStatus(t("journal.saved"));
        setCrisis(risk.level === "high" || risk.level === "imminent");
      }
    } catch {
      setError(t("journal.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      if (isDemoModeActive()) {
        demoEntriesStore = demoEntriesStore.filter((j) => j.id !== id);
        setEntries((prev) => prev.filter((j) => j.id !== id));
        setStatus(t("journal.deleted"));
      } else {
        await deleteJournal(id);
        setEntries((prev) => prev.filter((j) => j.id !== id));
        setStatus(t("journal.deleted"));
      }
    } catch {
      setError(t("journal.deleteError"));
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="journal-layout">
      <form className="journal-editor" onSubmit={(e) => void handleSave(e)} aria-labelledby="journal-new-title">
        <div className="flex items-center justify-between">
          <h2 id="journal-new-title" className="eyebrow green">
            {t("journal.newReflection")}
          </h2>
          <span className="muted text-xs">
            <Icon name="shield" size={13} /> {t("journal.encryptedLocally")}
          </span>
        </div>

        <div role="group" aria-label={t("journal.promptsLabel")} className="mb-1 flex flex-wrap gap-1.5">
          {JOURNAL_PROMPT_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`quick-pill min-h-6 ${promptKey === k ? "active" : ""}`}
              aria-pressed={promptKey === k}
              onClick={() => setPromptKey(k)}
            >
              {t(`journal.prompts.${k}`)}
            </button>
          ))}
        </div>
        <p className="text-[13px] italic text-[var(--primary)]">{t("journal.promptSelected", { prompt: promptText })}</p>

        <div>
          <label htmlFor="journal-title" className={labelClass}>
            {t("journal.titleLabel")}
          </label>
          <input
            id="journal-title"
            className={fieldClass}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="journal-mood" className={labelClass}>
            {t("journal.moodLabel")}
          </label>
          <select id="journal-mood" className={fieldClass} value={mood} onChange={(e) => setMood(e.target.value)}>
            {MOOD_KEYS.map((m) => (
              <option key={m} value={m}>
                {t(`journal.moods.${m}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="journal-content" className={labelClass}>
            {t("journal.contentLabel")}
          </label>
          <textarea
            id="journal-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("journal.contentPlaceholder")}
          />
        </div>

        <button type="submit" className="primary-btn min-h-11" disabled={saving || !content.trim()}>
          <Icon name="check" size={16} /> {saving ? t("journal.saving") : t("journal.save")}
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
          <section role="alert" className="rounded-xl border-2 border-[var(--danger)] bg-[var(--amber-soft)] p-3" data-testid="journal-crisis">
            <h3 className="font-bold">{t("journal.crisisTitle")}</h3>
            <p className="my-1 text-[13px]">{t("journal.crisisBody")}</p>
            <HelplineLinks />
          </section>
        )}
      </form>

      <section className="journal-list" aria-labelledby="journal-list-title">
        <h2 id="journal-list-title" className="eyebrow">
          {t("journal.pastReflections", { count: entries.length })}
        </h2>
        {loading && (
          <p className="muted" role="status">
            {t("common.loading")}
          </p>
        )}
        {entries.map((j) => (
          <article key={j.id} className="journal-item">
            <div className="flex items-start justify-between gap-2">
              <h3 className="m-0 text-[15px] font-bold">{j.title}</h3>
              {pendingDelete === j.id ? (
                <span className="flex gap-2">
                  <button type="button" className="outline-btn min-h-6" onClick={() => void handleDelete(j.id)}>
                    {t("journal.confirmDelete")}
                  </button>
                  <button type="button" className="text-btn min-h-6" onClick={() => setPendingDelete(null)}>
                    {t("journal.cancelDelete")}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 32, height: 32, border: "none" }}
                  onClick={() => setPendingDelete(j.id)}
                  aria-label={t("journal.deleteEntry", { title: j.title })}
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
            <small>
              {new Date(j.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              {j.mood ? ` · ${j.mood}` : ""}
            </small>
            <p className="whitespace-pre-wrap">{j.content}</p>
          </article>
        ))}
        {!loading && !loadFailed && entries.length === 0 && <p className="muted py-4">{t("journal.empty")}</p>}
      </section>
    </div>
  );
}
