import React from "react";
import { useTranslation } from "react-i18next";
import { type UserProfile } from "../../shared/data/mockData";
import Icon from "../../shared/ui/Icon";

interface HeaderProps {
  active: string;
  currentUser: UserProfile;
  darkMode: boolean;
  toggleDarkMode: () => void;
  ambientSound: "off" | "rain" | "bowl";
  toggleAmbientSound: () => void;
  openSos: () => void;
  openNotification: () => void;
  openSettings: () => void;
  openAudioSanctuary?: () => void;
  openSafetyCard?: () => void;
  hasUnread?: boolean;
}

export default function Header({
  active,
  currentUser,
  darkMode,
  toggleDarkMode,
  ambientSound,
  toggleAmbientSound,
  openSos,
  openNotification,
  openSettings,
  openAudioSanctuary,
  openSafetyCard,
  hasUnread = false,
}: HeaderProps) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language || "en";

  const toggleLanguage = () => {
    const nextLang = currentLang.startsWith("hi") ? "en" : "hi";
    i18n.changeLanguage(nextLang);
    if (typeof document !== "undefined") {
      document.documentElement.lang = nextLang;
    }
  };
  const labels: Record<string, string> = {
    dashboard: "Your wellness overview",
    mood: "Daily Mood Check-in & Trends",
    insights: "Mood & wellbeing insights",
    assessment: "Mental health screening (PHQ-9 / GAD-7)",
    doctors: "Find a mental health professional",
    chat: "MindMate AI wellness guide",
    journal: "Private journal & self-care tools",
    stories: "Voices of courage · Campus peer stories",
    consent: "DPDP Student Consent Ledger",
    settings: "Account & Privacy Settings",
    crisis: "Crisis Support & Safety Plan",
    counsellor: "Campus Counsellor Queue",
    moderator: "Community Moderation Queue",
    admin: "Dean Institutional Aggregate",
  };

  return (
    <header className="topbar">
      <div>
        <span className="top-kicker">STUDENT WELLNESS</span>
        <h2>{labels[active] || "MindSahaay"}</h2>
      </div>
      <div className="top-actions">
        {/* Soundscapes Pill */}
        <button
          type="button"
          className={`quick-pill ${ambientSound !== "off" ? "active" : ""}`}
          onClick={openAudioSanctuary || toggleAmbientSound}
          title="Open Audio Sanctuary & Sleep Studio"
          aria-label={`Soundscapes: ${ambientSound === "off" ? "Inactive" : ambientSound}`}
        >
          <Icon name="volume" size={16} />
          <span>{ambientSound === "off" ? "Soundscapes" : ambientSound === "rain" ? "Rain" : "432Hz Bowl"}</span>
        </button>

        {/* Safety Plan Card */}
        {openSafetyCard && (
          <button
            type="button"
            className="quick-pill"
            onClick={openSafetyCard}
            title="My Sahaay Crisis Safety Card"
            aria-label="My Sahaay Crisis Safety Card"
            style={{ border: "1px dashed var(--primary)" }}
          >
            <Icon name="shield" size={15} />
            <span>Safety Card</span>
          </button>
        )}

        {/* Visible Language Toggle */}
        <button
          type="button"
          className="quick-pill language-toggle-btn"
          onClick={toggleLanguage}
          title={currentLang.startsWith("hi") ? "Switch interface to English" : "हिंदी में बदलें (Switch to Hindi)"}
          aria-label={`Language toggle: currently ${currentLang.startsWith("hi") ? "Hindi" : "English"}. Press to switch.`}
          data-testid="header-language-toggle"
          style={{ fontWeight: 600, fontSize: 13 }}
        >
          <span>{currentLang.startsWith("hi") ? "अ / EN" : "EN / अ"}</span>
        </button>

        {/* Night Mode Toggle */}
        <button
          type="button"
          className="icon-btn"
          onClick={toggleDarkMode}
          title={darkMode ? "Switch to day view" : "Switch to calming night view"}
          aria-label="Toggle dark mode"
        >
          <Icon name={darkMode ? "sun" : "moon"} size={17} />
        </button>

        {/* SOS Crisis Button (WCAG 3.2.6 consistent across all screens) */}
        <button
          type="button"
          className="sos-trigger-btn"
          onClick={openSos}
          title="24/7 National Emergency Helplines"
          aria-label="24/7 Emergency Crisis Helplines"
        >
          <Icon name="phone" size={15} /> SOS Helpline
        </button>

        {/* Notification */}
        <button type="button" className="icon-btn" aria-label="Notifications" onClick={openNotification}>
          <Icon name="bell" />
          {hasUnread && <span />}
        </button>

        {/* Avatar Button */}
        <button
          type="button"
          className="avatar"
          onClick={openSettings}
          title="Account & Privacy settings"
          aria-label="User account settings"
          style={{ cursor: "pointer", border: "none" }}
        >
          {currentUser.initials}
        </button>

        {/* User Meta Button */}
        <button
          type="button"
          className="user-meta"
          onClick={openSettings}
          aria-label="View user profile"
          style={{ background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}
        >
          <strong>{currentUser.name}</strong>
          <small>{currentUser.institution}</small>
        </button>
      </div>
    </header>
  );
}
