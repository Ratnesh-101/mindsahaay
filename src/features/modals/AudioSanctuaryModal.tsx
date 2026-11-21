import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "../cbt/i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { enhancedAudio, type SoundscapeType } from "../../audio/EnhancedAudioEngine";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";

interface AudioSanctuaryModalProps {
  onClose: () => void;
}

const TRACKS: { id: Exclude<SoundscapeType, "off">; icon: string }[] = [
  { id: "rain", icon: "\u{1F327}\uFE0F" },
  { id: "bowl", icon: "\u{1F963}" },
  { id: "solfeggio", icon: "\u2728" },
  { id: "delta", icon: "\u{1F319}" },
];

const TIMER_CHOICES = [0, 15, 30, 45, 60];

export default function AudioSanctuaryModal({ onClose }: AudioSanctuaryModalProps) {
  const { t } = useTranslation(CONTENT_NS);
  const [current, setCurrent] = useState<SoundscapeType>(enhancedAudio.getCurrentTrack());
  const [volume, setVolume] = useState(70);
  const [timerMinutes, setTimerMinutes] = useState<number>(0);
  const [remainingSecs, setRemainingSecs] = useState<number>(0);

  const handleSelectTrack = (id: SoundscapeType) => {
    if (current === id) {
      enhancedAudio.stop();
      setCurrent("off");
      setRemainingSecs(0);
      return;
    }
    const vol = volume / 100;
    if (id === "rain") enhancedAudio.playMonsoonRain(vol);
    if (id === "bowl") enhancedAudio.playTibetanBowl(vol);
    if (id === "solfeggio") enhancedAudio.playSolfeggio528(vol);
    if (id === "delta") enhancedAudio.playDeltaBinaural(vol);
    setCurrent(id);
    if (timerMinutes > 0) {
      setRemainingSecs(timerMinutes * 60);
      enhancedAudio.setSleepTimer(timerMinutes, () => {
        setCurrent("off");
        setRemainingSecs(0);
      });
    }
  };

  const handleTimerSelect = (mins: number) => {
    setTimerMinutes(mins);
    if (mins === 0) {
      setRemainingSecs(0);
      enhancedAudio.setSleepTimer(0);
    } else {
      setRemainingSecs(mins * 60);
      if (current !== "off") {
        enhancedAudio.setSleepTimer(mins, () => {
          setCurrent("off");
          setRemainingSecs(0);
        });
      }
    }
  };

  useEffect(() => {
    if (remainingSecs <= 0 || current === "off") return;
    const interval = window.setInterval(() => {
      setRemainingSecs((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [remainingSecs, current]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const activeTrack = TRACKS.find((x) => x.id === current);

  return (
    <Modal onClose={onClose} ariaLabel={t("tools.audio.title")} className="audio-studio-card">
      <div className="modal-head">
        <div>
          <span className="eyebrow green">{t("tools.audio.eyebrow")}</span>
          <h3>{t("tools.audio.title")}</h3>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t("tools.audio.close")}>
          <Icon name="x" />
        </button>
      </div>

      <div className="soundwave-display">
        <div className={`soundwave-aura ${current !== "off" ? "active" : ""}`} aria-hidden="true">
          <span className="ring ring-1" />
          <span className="ring ring-2" />
          <span className="ring ring-3" />
          <div className="center-mandala">
            <span className="mandala-icon">{activeTrack ? activeTrack.icon : "\u{1F3B5}"}</span>
          </div>
        </div>
        <div className="soundwave-status" role="status" aria-live="polite">
          <strong>{activeTrack ? t(`tools.audio.tracks.${activeTrack.id}.title`) : t("tools.audio.inactive")}</strong>
          <p className="muted">{activeTrack ? t(`tools.audio.tracks.${activeTrack.id}.freq`) : t("tools.audio.selectPrompt")}</p>
          {remainingSecs > 0 && current !== "off" && (
            <span className="sleep-countdown-pill">{t("tools.audio.sleepFade", { time: formatTimer(remainingSecs) })}</span>
          )}
        </div>
      </div>

      <ul className="soundscape-list m-0 list-none p-0" aria-label={t("tools.audio.tracksLabel")}>
        {TRACKS.map((track) => {
          const title = t(`tools.audio.tracks.${track.id}.title`);
          const playing = current === track.id;
          return (
            <li key={track.id} className={`soundscape-item ${playing ? "selected" : ""}`}>
              <span className="sound-emoji" aria-hidden="true">
                {track.icon}
              </span>
              <div className="sound-info">
                <strong>{title}</strong>
                <small>{t(`tools.audio.tracks.${track.id}.freq`)}</small>
                <p>{t(`tools.audio.tracks.${track.id}.desc`)}</p>
              </div>
              <button
                type="button"
                className={`play-toggle-btn min-h-11 ${playing ? "active" : ""}`}
                aria-pressed={playing}
                aria-label={playing ? t("tools.audio.stopTrack", { title }) : t("tools.audio.playTrack", { title })}
                onClick={() => handleSelectTrack(track.id)}
              >
                {playing ? t("tools.audio.stop") : t("tools.audio.play")}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="audio-studio-controls">
        <div className="volume-slider-box">
          <label htmlFor="volume-slider" className="control-label" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="volume" size={16} /> {t("tools.audio.volume", { value: volume })}
          </label>
          <input
            id="volume-slider"
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => {
              const val = Number(e.target.value);
              setVolume(val);
              enhancedAudio.setVolume(val / 100);
            }}
          />
        </div>

        <div className="sleep-timer-box" role="group" aria-label={t("tools.audio.timerLabel")}>
          <span className="control-label" style={{ fontSize: 13 }}>
            {t("tools.audio.timerLabel")}:
          </span>
          <div className="timer-pill-group">
            {TIMER_CHOICES.map((mins) => (
              <button
                key={mins}
                type="button"
                className={`quick-pill min-h-6 ${timerMinutes === mins ? "active" : ""}`}
                aria-pressed={timerMinutes === mins}
                onClick={() => handleTimerSelect(mins)}
                aria-label={mins === 0 ? t("tools.audio.continuousLabel") : t("tools.audio.minutesLabel", { count: mins })}
              >
                {mins === 0 ? t("tools.audio.continuous") : t("tools.audio.minutes", { count: mins })}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button type="button" className="primary-btn full min-h-11" onClick={onClose}>
        {current !== "off" ? t("tools.audio.keepPlaying") : t("tools.audio.closeButton")}
      </button>
    </Modal>
  );
}
