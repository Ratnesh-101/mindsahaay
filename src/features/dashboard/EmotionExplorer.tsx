import React, { useState } from "react";
import Icon from "../../shared/ui/Icon";

export interface EmotionDescriptor {
  tag: string;
  category: "High Distress" | "Low Energy" | "Cognitive Strain" | "Grounded";
  validation: string;
  actionLabel: string;
  actionType: "breathing" | "grounding" | "audio" | "chat" | "journal";
}

export const EMOTIONS_CATALOG: EmotionDescriptor[] = [
  {
    tag: "Overwhelmed",
    category: "High Distress",
    validation: "Overwhelm is not inadequacy; it is your nervous system signaling that demands currently exceed temporary working memory. You only need to navigate the next 30 minutes.",
    actionLabel: "Launch 4-7-8 Breath Reset",
    actionType: "breathing",
  },
  {
    tag: "Exhausted",
    category: "Low Energy",
    validation: "Academic and cognitive fatigue cannot be cured by willpower. Rest is not a reward you earn; it is a biological prerequisite for memory consolidation.",
    actionLabel: "Play Monsoon Rain Soundscape",
    actionType: "audio",
  },
  {
    tag: "Homesick",
    category: "Low Energy",
    validation: "Missing familiar food, family, and your home room is deeply human. Adapting to hostel life takes immense emotional bandwidth. Be gentle with yourself today.",
    actionLabel: "Explore Campus Peer Circles",
    actionType: "chat",
  },
  {
    tag: "Imposter Syndrome",
    category: "Cognitive Strain",
    validation: "Comparing your internal raw thoughts with everyone else's polished external performance creates a false deficit. You earned your seat at your university.",
    actionLabel: "Unload in Private Journal",
    actionType: "journal",
  },
  {
    tag: "Panicky / Racing Heart",
    category: "High Distress",
    validation: "Your amygdala has triggered a false fire alarm. You are physically safe right here. Let's redirect attention to your 5 physical senses right now.",
    actionLabel: "Launch 5-4-3-2-1 Sensory Grounding",
    actionType: "grounding",
  },
  {
    tag: "Hopeful & Resilient",
    category: "Grounded",
    validation: "Acknowledge this lightness. Small moments of hope replenish your emotional reserves. Anchor this feeling with a quick gratitude note.",
    actionLabel: "Save Gratitude Reflection",
    actionType: "journal",
  },
];

interface EmotionExplorerProps {
  openBreathing: () => void;
  openGrounding: () => void;
  openAudio: () => void;
  goChat: () => void;
  goJournal: () => void;
}

export default function EmotionExplorer({
  openBreathing,
  openGrounding,
  openAudio,
  goChat,
  goJournal,
}: EmotionExplorerProps) {
  const [selectedTag, setSelectedTag] = useState<string>("Overwhelmed");
  const activeEmotion = EMOTIONS_CATALOG.find((e) => e.tag === selectedTag) || EMOTIONS_CATALOG[0];

  const handleAction = (type: EmotionDescriptor["actionType"]) => {
    if (type === "breathing") openBreathing();
    else if (type === "grounding") openGrounding();
    else if (type === "audio") openAudio();
    else if (type === "chat") goChat();
    else if (type === "journal") goJournal();
  };

  return (
    <article className="panel emotion-explorer-panel" aria-labelledby="explorer-heading">
      <div className="panel-head">
        <div>
          <span className="eyebrow green">FEELING EXPLORER</span>
          <h3 id="explorer-heading">Name It to Tame It</h3>
          <p>Unpack complex emotional states with instant validating clinical guidance.</p>
        </div>
      </div>

      <div className="emotion-tag-matrix" role="group" aria-label="Select your present emotional state">
        {EMOTIONS_CATALOG.map((item) => (
          <button
            key={item.tag}
            type="button"
            className={`emotion-tag ${selectedTag === item.tag ? "active" : ""}`}
            onClick={() => setSelectedTag(item.tag)}
            aria-pressed={selectedTag === item.tag}
          >
            <span className={`tag-dot ${item.category.toLowerCase().replace(" ", "-")}`} />
            {item.tag}
          </button>
        ))}
      </div>

      <div className="validating-card" aria-live="polite">
        <div className="validation-top">
          <span className="soft-icon mint"><Icon name="sparkles" size={18} /></span>
          <div>
            <strong>You are experiencing: {activeEmotion.tag}</strong>
            <span className="emotion-category-tag">{activeEmotion.category}</span>
          </div>
        </div>
        <p className="validation-quote">“{activeEmotion.validation}”</p>
        <div className="validation-action-row">
          <button type="button" className="primary-btn" onClick={() => handleAction(activeEmotion.actionType)}>
            {activeEmotion.actionLabel} <Icon name="arrow" size={16} />
          </button>
          <span className="muted-hint">💡 2-minute evidence-based micro-coping</span>
        </div>
      </div>
    </article>
  );
}
