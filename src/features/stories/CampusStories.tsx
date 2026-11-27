import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import "../community/i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { errorClass } from "../journal/ui";
import Icon from "../../shared/ui/Icon";
import CampusCirclesHub from "./CampusCirclesHub";
import ModeratorQueue from "../community/ModeratorQueue";
import StoryDetailModal, { type StoryView } from "../modals/StoryDetailModal";
import { fetchMyRole, fetchRecentVoices, type Voice } from "../community/api";

/** A story is a real, moderator-approved peer post. */
export interface Story extends StoryView {
  excerpt: string;
  readMinutes: number;
}

interface CampusStoriesProps {
  /** Optional hook for the host app; the story also opens in the built-in dialog. */
  onSelectStory?: (story: Story) => void;
}

type SubTab = "stories" | "circles" | "moderation";
type Load = "loading" | "ready" | "error";

function toStory(v: Voice, author: string): Story {
  const words = v.content.trim().split(/\s+/).filter(Boolean).length;
  return {
    id: v.id,
    title: v.title,
    theme: v.category,
    campus: v.circleName,
    author,
    fullText: v.content,
    likes: v.likesCount,
    excerpt: v.content.length > 180 ? `${v.content.slice(0, 177).trimEnd()}...` : v.content,
    readMinutes: Math.max(1, Math.ceil(words / 200)),
  };
}

export default function CampusStories({ onSelectStory }: CampusStoriesProps) {
  const { t } = useTranslation(CONTENT_NS);
  const [stories, setStories] = useState<Story[]>([]);
  const [load, setLoad] = useState<Load>("loading");
  const [filter, setFilter] = useState("All");
  const [subTab, setSubTab] = useState<SubTab>("stories");
  const [isModerator, setIsModerator] = useState(false);
  const [open, setOpen] = useState<Story | null>(null);

  const refresh = useCallback(async () => {
    setLoad("loading");
    try {
      const voices = await fetchRecentVoices();
      const author = t("stories.anonymousPeer");
      setStories(voices.map((v) => toStory(v, author)));
      setLoad("ready");
    } catch {
      setLoad("error");
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    fetchMyRole()
      .then((role) => alive && setIsModerator(role === "moderator" || role === "super_admin"))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const categories = useMemo(() => Array.from(new Set(stories.map((s) => s.theme))).sort(), [stories]);
  const filtered = useMemo(() => (filter === "All" ? stories : stories.filter((s) => s.theme === filter)), [stories, filter]);

  const tabs: SubTab[] = isModerator ? ["stories", "circles", "moderation"] : ["stories", "circles"];
  const tabLabel = (id: SubTab) =>
    id === "stories" ? t("stories.tabVoices") : id === "circles" ? t("stories.tabCircles") : t("stories.tabModeration");

  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const next = tabs[(index + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      setSubTab(next);
      document.getElementById(`stories-tab-${next}`)?.focus();
    }
  };

  const select = (s: Story) => {
    setOpen(s);
    onSelectStory?.(s);
  };

  return (
    <div className="page">
      <div className="directory-head" style={{ marginBottom: 18 }}>
        <div>
          <h1>{subTab === "circles" ? t("stories.circlesTitle") : subTab === "moderation" ? t("moderation.title") : t("stories.voicesTitle")}</h1>
          <p>{subTab === "circles" ? t("stories.circlesSubtitle") : subTab === "moderation" ? t("moderation.subtitle") : t("stories.voicesSubtitle")}</p>
        </div>
        <div className="segment" role="tablist" aria-label={t("stories.tabsLabel")}>
          {tabs.map((id, i) => (
            <button
              key={id}
              id={`stories-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={subTab === id}
              aria-controls="stories-panel"
              tabIndex={subTab === id ? 0 : -1}
              className={`min-h-6 ${subTab === id ? "active" : ""}`}
              onClick={() => setSubTab(id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {tabLabel(id)}
            </button>
          ))}
        </div>
      </div>

      <div id="stories-panel" role="tabpanel" aria-labelledby={`stories-tab-${subTab}`}>
        {subTab === "circles" && <CampusCirclesHub />}
        {subTab === "moderation" && isModerator && <ModeratorQueue />}
        {subTab === "stories" && (
          <>
            {categories.length > 0 && (
              <div className="filters" style={{ marginBottom: 18 }} role="group" aria-label={t("stories.filtersLabel")}>
                {["All", ...categories].map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    className={`quick-pill min-h-6 ${filter === theme ? "active" : ""}`}
                    aria-pressed={filter === theme}
                    onClick={() => setFilter(theme)}
                  >
                    {theme === "All" ? t("stories.themeAll") : t(`stories.themes.${theme}`, { defaultValue: theme })}
                  </button>
                ))}
              </div>
            )}

            {load === "loading" && (
              <p role="status" className="muted">
                {t("stories.loading")}
              </p>
            )}
            {load === "error" && (
              <div role="alert" className={errorClass}>
                <p>{t("stories.loadError")}</p>
                <button type="button" className="primary-btn mt-2 min-h-11" onClick={() => void refresh()}>
                  {t("common.retry")}
                </button>
              </div>
            )}
            {load === "ready" && stories.length === 0 && <p className="muted">{t("stories.empty")}</p>}
            {load === "ready" && stories.length > 0 && filtered.length === 0 && (
              <p className="muted">{t("stories.emptyFiltered")}</p>
            )}

            <div className="stories-grid">
              {filtered.map((s) => (
                <article key={s.id} className="story-card">
                  <div className="story-header">
                    <span className="story-theme">{t(`stories.themes.${s.theme}`, { defaultValue: s.theme })}</span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {t("stories.minRead", { count: s.readMinutes })}
                    </span>
                  </div>
                  <h3>
                    <button
                      type="button"
                      className="min-h-6 text-left font-[inherit] text-[inherit]"
                      style={{ background: "none", border: 0, padding: 0, color: "inherit", font: "inherit" }}
                      aria-label={t("stories.readStory", { title: s.title })}
                      onClick={() => select(s)}
                    >
                      {s.title}
                    </button>
                  </h3>
                  <p>{s.excerpt}</p>
                  <div className="story-meta">
                    <span>{s.campus}</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      <Icon name="heart" size={14} /> {s.likes}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      {open && <StoryDetailModal story={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
