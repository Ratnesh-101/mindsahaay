import React from "react";
import { useTranslation } from "react-i18next";
import { type CommunityStory } from "../../api";
import "../community/i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";

interface StoryDetailModalProps {
  story: CommunityStory;
  onClose: () => void;
  onLike: (id: string) => void;
}

export default function StoryDetailModal({ story, onClose, onLike }: StoryDetailModalProps) {
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
      <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--ink)", margin: "16px 0 24px" }}>{story.fullText}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" className="like-btn min-h-11" onClick={() => onLike(story.id)}>
          <Icon name="heart" size={16} /> {t("stories.helpful", { count: story.likes })}
        </button>
        <button type="button" className="outline-btn min-h-11" onClick={onClose}>
          {t("stories.back")}
        </button>
      </div>
    </Modal>
  );
}
