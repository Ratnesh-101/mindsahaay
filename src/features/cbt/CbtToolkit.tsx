import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import VaultGate from "../journal/VaultGate";
import ThoughtRecord from "./ThoughtRecord";
import ActivityPlanner from "./ActivityPlanner";
import WorryTime from "./WorryTime";

type Tool = "thought" | "activity" | "worry";
const TOOLS: Tool[] = ["thought", "activity", "worry"];

/** CBT toolkit. All tools are protected at rest by the zero-knowledge encryption vault. */
export default function CbtToolkit() {
  const { t } = useTranslation(CONTENT_NS);
  const [tool, setTool] = useState<Tool>("thought");

  const onKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const next = TOOLS[(index + (e.key === "ArrowRight" ? 1 : TOOLS.length - 1)) % TOOLS.length];
      setTool(next);
      document.getElementById(`cbt-tab-${next}`)?.focus();
    }
  };

  const label = (id: Tool) =>
    id === "thought" ? t("cbt.tabThought") : id === "activity" ? t("cbt.tabActivity") : t("cbt.tabWorry");

  return (
    <section aria-labelledby="cbt-title">
      <h2 id="cbt-title" className="text-xl font-bold">
        {t("cbt.title")}
      </h2>
      <p className="mb-3 text-sm text-[var(--muted)]">{t("cbt.intro")}</p>
      <div className="segment mb-4 w-fit" role="tablist" aria-label={t("cbt.tabsLabel")}>
        {TOOLS.map((id, i) => (
          <button
            key={id}
            id={`cbt-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tool === id}
            aria-controls={`cbt-panel-${id}`}
            tabIndex={tool === id ? 0 : -1}
            className={`min-h-6 ${tool === id ? "active" : ""}`}
            onClick={() => setTool(id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {label(id)}
          </button>
        ))}
      </div>
      <div id={`cbt-panel-${tool}`} role="tabpanel" aria-labelledby={`cbt-tab-${tool}`}>
        {tool === "thought" && (
          <VaultGate>
            <ThoughtRecord />
          </VaultGate>
        )}
        {tool === "activity" && <ActivityPlanner />}
        {tool === "worry" && <WorryTime />}
      </div>
    </section>
  );
}
