import React from "react";
import { useTranslation } from "react-i18next";
import "../community/i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";

/** What the story dialog needs. A student-written circle post and the legacy story type both fit. */
export interface StoryView {
  id: string;
  title: string;
  theme: string;
  campus: string;
  author: string;
  fullText: string;
  likes: number;
}

interface StoryDetailModalProps {
  story: StoryView;
  onClose: () => void;
  /** Ignored. Helpful counts come from the server and cannot be changed from here, so no fake like button is shown. */
  onLike?: (id: string) => void;
}

export default function StoryDetailModal({ story, onClose }: StoryDetailModalProps) {
  const { t } = useTranslation(CONTENT_NS);
  return (
    <Modal onClose={onClose} ariaLabel={story.title} cardStyle={{ maxWidth: 620 }}>
      <div className="modal-head">
        <div>
          <span className="story-theme">{t(`stories.themes.${story.theme}`, { defaultValue: story.theme })}</span>
          <h3 style={{ marginTop: 8 }}>{story.title}</h3>
          <small className="muted">
            {story.campus} · {story.author}
          </small>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t("stories.close")}>
          <Icon name="x" />
        </button>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--ink)", margin: "16px 0 24px", whiteSpace: "pre-wrap" }}>
        {story.fullText}
      </div>
      <div style={{ display: "flex", justifyContent: story.likes && story.likes > 0 ? "space-between" : "flex-end", alignItems: "center" }}>
        {Boolean(story.likes && story.likes > 0) && (
          <span className="muted" style={{ fontSize: 13 }}>
            <Icon name="heart" size={14} /> {t("stories.likesOnly", { count: story.likes })}
          </span>
        )}
        <button type="button" className="outline-btn min-h-11" onClick={onClose}>
          {t("stories.back")}
        </button>
      </div>
    </Modal>
  );
}
