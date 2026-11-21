import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type CommunityStory, wellnessApi } from "../../api";
import "../community/i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import Icon from "../../shared/ui/Icon";
import CampusCirclesHub from "./CampusCirclesHub";
import ModeratorQueue from "../community/ModeratorQueue";
import { fetchMyRole } from "../community/api";

interface CampusStoriesProps {
  onSelectStory: (story: CommunityStory) => void;
}

type SubTab = "stories" | "circles" | "moderation";
const THEMES = ["Exams & Burnout", "Social Anxiety", "Homesickness"] as const;

export default function CampusStories({ onSelectStory }: CampusStoriesProps) {
  const { t } = useTranslation(CONTENT_NS);
  const [stories, setStories] = useState<CommunityStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [subTab, setSubTab] = useState<SubTab>("stories");
  const [isModerator, setIsModerator] = useState(false);

  useEffect(() => {
    let alive = true;
    wellnessApi
      .getStories()
      .then((s) => alive && setStories(s))
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    fetchMyRole()
      .then((role) => alive && setIsModerator(role === "moderator" || role === "super_admin"))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const handleLike = async (id: string) => {
    const updated = await wellnessApi.likeStory(id);
    setStories(updated);
  };

  const filtered = useMemo(() => {
    if (filter === "All") return stories;
    return stories.filter((s) => s.theme === filter);
  }, [stories, filter]);

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
            <div className="filters" style={{ marginBottom: 18 }} role="group" aria-label={t("stories.filtersLabel")}>
              {["All", ...THEMES].map((theme) => (
                <button
                  key={theme}
                  type="button"
                  className={`quick-pill min-h-6 ${filter === theme ? "active" : ""}`}
                  aria-pressed={filter === theme}
                  onClick={() => setFilter(theme)}
                >
                  {theme === "All" ? t("stories.themeAll") : t(`stories.themes.${theme}`)}
                </button>
              ))}
            </div>

            {loading && (
              <p role="status" className="muted">
                {t("stories.loading")}
              </p>
            )}
            {!loading && filtered.length === 0 && <p className="muted">{t("stories.empty")}</p>}

            <div className="stories-grid">
              {filtered.map((s) => (
                <article key={s.id} className="story-card">
                  <div className="story-header">
                    <span className="story-theme">{t(`stories.themes.${s.theme}`, { defaultValue: s.theme })}</span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {s.readTime}
                    </span>
                  </div>
                  <h3>
                    <button
                      type="button"
                      className="min-h-6 text-left font-[inherit] text-[inherit]"
                      style={{ background: "none", border: 0, padding: 0, color: "inherit", font: "inherit" }}
                      aria-label={t("stories.readStory", { title: s.title })}
                      onClick={() => onSelectStory(s)}
                    >
                      {s.title}
                    </button>
                  </h3>
                  <p>{s.excerpt}</p>
                  <div className="story-meta">
                    <span>{s.campus}</span>
                    <button
                      type="button"
                      className="like-btn min-h-6"
                      onClick={() => void handleLike(s.id)}
                      aria-label={t("stories.like", { count: s.likes })}
                    >
                      <Icon name="heart" size={14} /> {s.likes}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
