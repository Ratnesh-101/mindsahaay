import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { type Appointment, wellnessApi } from "../../api";
import { doctors } from "../../shared/data/mockData";
import Icon from "../../shared/ui/Icon";
import MoodChart from "../../shared/ui/MoodChart";
import DailyMicroHabits from "./DailyMicroHabits";
import EmotionExplorer from "./EmotionExplorer";
import { FollowUpCard } from "../followup";
import { addMood } from "../../shared/lib/api/moods";
import { isDemoModeActive, getDemoProfile } from "../auth/demoMode";
import { useAuth } from "../../app/providers/AuthProvider";

interface DashboardProps {
  go?: (v: string) => void;
  studentId?: string;
  openBreathing?: () => void;
  openGrounding?: () => void;
  openVideo?: () => void;
  openAudioSanctuary?: () => void;
  activeAppointment?: Appointment | null;
  onSelectHabit?: (habit: [string, string, string, string]) => void;
}

export default function Dashboard({
  go,
  studentId,
  openBreathing = () => alert("Guided Breathing: Inhale 4s, Hold 7s, Exhale 8s."),
  openGrounding = () => alert("Sensory Grounding: Notice 5 things you see, 4 you feel, 3 you hear, 2 you smell, 1 you taste."),
  openVideo = () => alert("Video Consultation Room is preparing. Please ensure your microphone is connected."),
  openAudioSanctuary,
  activeAppointment = null,
  onSelectHabit = () => {},
}: DashboardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isDemo = isDemoModeActive();
  const demoProfile = getDemoProfile();

  const effectiveGo = (path: string) => {
    if (go) {
      go(path);
    } else {
      navigate(`/${path}`);
    }
  };

  const studentName = isDemo
    ? demoProfile.alias
    : user?.user_metadata?.name || user?.email?.split("@")[0] || "Aarav";

  const [range, setRange] = useState("Week");
  const [selectedMood, setSelectedMood] = useState(3);
  const [saveState, setSaveState] = useState("");

  const saveMoodHandler = async (mood: string, index: number) => {
    setSelectedMood(index);
    setSaveState("Saving…");
    const scoreVal = (index + 1) * 2; // maps 0..4 to 2, 4, 6, 8, 10
    try {
      if (!isDemo) {
        await addMood({
          mood,
          score: scoreVal,
          tags: ["Daily Check-in"],
        });
      } else if (studentId) {
        await wellnessApi.saveMood(studentId, mood, scoreVal);
      }
      setSaveState("Saved");
      setTimeout(() => setSaveState(""), 2500);
    } catch {
      setSaveState("Saved locally");
      setTimeout(() => setSaveState(""), 2500);
    }
  };

  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
  }, []);

  const habits: [string, string, string, string][] = [
    ["Sleep", "7h 20m", "Good", "82"],
    ["Mindfulness", "10 min", "On track", "64"],
    ["Movement", "3,420 steps", "Keep going", "43"],
    ["Social connection", "1 check-in", "Good", "70"],
  ];

  return (
    <div className="page">
      <section className="welcome">
        <div>
          <span className="eyebrow green">{todayStr}</span>
          <h1>Good morning, {studentName}.</h1>
          <p>
            {"Small daily check-ins create meaningful change. How are you feeling today? "}
            {saveState && <small className="saved-label">{saveState}</small>}
          </p>
        </div>
        <div className="moods" role="group" aria-label="Daily mood selection">
          {["Rough", "Low", "Okay", "Good", "Great"].map((m, i) => (
            <button
              key={m}
              type="button"
              className={i === selectedMood ? "selected" : ""}
              onClick={() => saveMoodHandler(m, i)}
              aria-label={`Select mood: ${m}`}
            >
              <span>{["◡", "⌣", "—", "◡", "◠"][i]}</span>
              {m}
            </button>
          ))}
        </div>
      </section>

      <FollowUpCard />

      <section className="stat-grid">
        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon mint"><Icon name="heart" /></span>
            <span className="trend">↑ 8%</span>
          </div>
          <p>Wellbeing score</p>
          <div className="stat-value">78<span>/100</span></div>
          <div className="progress"><i style={{ width: "78%" }} /></div>
          <small>{"You're doing well this week"}</small>
        </article>

        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon lilac"><Icon name="chart" /></span>
            <span className="tag calm">Steady</span>
          </div>
          <p>Current mood</p>
          <div className="stat-value">{["Rough", "Low", "Okay", "Good", "Great"][selectedMood]}</div>
          <div className="mini-row">
            <span className="mini-face">⌣</span>
            <small>4-day positive streak</small>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon peach"><Icon name="sparkles" /></span>
            <span className="tag mild">Mild</span>
          </div>
          <p>Stress level</p>
          <div className="stat-value">24<span>/100</span></div>
          <div className="progress amber"><i style={{ width: "24%" }} /></div>
          <small>12 points lower than last week</small>
        </article>

        {/* Weekly Check-in Action Button (Replaces non-semantic clickable div) */}
        <button
          type="button"
          className="stat-card check-card interactive"
          onClick={() => effectiveGo("assessment")}
          aria-label="Start weekly mental health check-in"
          style={{ textAlign: "left", cursor: "pointer", border: "1px solid var(--line)" }}
        >
          <span className="soft-icon blue"><Icon name="test" /></span>
          <div>
            <p>Weekly check-in</p>
            <strong>2 minutes can help</strong>
            <small>{"Understand how you're really doing."}</small>
          </div>
          <span aria-hidden="true" style={{ marginLeft: "auto" }}>
            <Icon name="arrow" />
          </span>
        </button>
      </section>

      <section className="main-grid">
        <article className="panel mood-panel">
          <div className="panel-head">
            <div>
              <h3>Your mood rhythm</h3>
              <p>Based on your daily check-ins</p>
            </div>
            <div className="segment">
              {["Week", "Month"].map((v) => (
                <button
                  type="button"
                  className={range === v ? "active" : ""}
                  onClick={() => setRange(v)}
                  key={v}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <MoodChart range={range} />
          <div className="insight">
            <span className="soft-icon mint small"><Icon name="sparkles" size={17} /></span>
            <p>
              <strong>A gentle insight:</strong> Your mood lifts toward the weekend. Consider bringing one enjoyable weekend activity into a weekday.
            </p>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h3>{"Today's balance"}</h3>
              <p>Your wellness building blocks</p>
            </div>
          </div>
          <div className="balance-list">
            {habits.map((item) => (
              <button
                type="button"
                className="balance interactive"
                key={item[0]}
                onClick={() => onSelectHabit(item)}
                aria-label={`View ${item[0]} details: ${item[1]}, score ${item[3]}`}
                style={{ textAlign: "left", cursor: "pointer", border: "none", width: "100%", background: "none" }}
              >
                <div>
                  <strong>{item[0]}</strong>
                  <span>{item[1]}</span>
                </div>
                <div className="slim-progress"><i style={{ width: `${item[3]}%` }} /></div>
                <small>{item[2]} · Click to view/log</small>
              </button>
            ))}
          </div>
          <button type="button" className="text-btn" onClick={() => effectiveGo("insights")}>
            View detailed insights <Icon name="arrow" size={17} />
          </button>
        </article>
      </section>

      {/* Daily Micro-Habits & Feeling Explorer */}
      <section className="lower-grid">
        <DailyMicroHabits />
        <EmotionExplorer
          openBreathing={openBreathing}
          openGrounding={openGrounding}
          openAudio={openAudioSanctuary || (() => alert("Audio Sanctuary available in topbar."))}
          goChat={() => effectiveGo("chat")}
          goJournal={() => effectiveGo("journal")}
        />
      </section>

      <section className="lower-grid">
        <article className="panel recommendation">
          <span className="rec-art"><Icon name="sparkles" size={28} /></span>
          <div>
            <span className="eyebrow green">RECOMMENDED FOR YOU</span>
            <h3>A 5-minute reset between classes</h3>
            <p>Try a guided 4-7-8 breathing exercise to help clear your mind and lower cortisol.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="primary-btn" onClick={openBreathing}>
                4-7-8 Breathing <Icon name="arrow" size={17} />
              </button>
              <button type="button" className="outline-btn" onClick={openGrounding}>
                5-4-3-2-1 Sensory
              </button>
              {openAudioSanctuary && (
                <button type="button" className="outline-btn" onClick={openAudioSanctuary}>
                  <Icon name="volume" size={16} /> Audio Sanctuary
                </button>
              )}
            </div>
          </div>
        </article>

        <article className="panel next-session">
          <div className="panel-head">
            <h3>Upcoming session</h3>
            <button type="button" onClick={() => effectiveGo("doctors")}>View all</button>
          </div>
          <div className="session">
            <img src={doctors[0].image} alt="Doctor" />
            <div>
              <strong>{activeAppointment?.doctorName || doctors[0].name}</strong>
              <span>Clinical Psychologist</span>
              <small>
                <Icon name="calendar" size={14} /> {activeAppointment?.scheduledFor || "Tue, 25 June"} · {activeAppointment?.slotTime || "4:30 PM"}
              </small>
            </div>
          </div>
          <button type="button" className="outline-btn" onClick={openVideo}>Join video session</button>
        </article>

        <article className="ai-card">
          <span className="ai-orb"><Icon name="sparkles" /></span>
          <div>
            <span className="eyebrow">MINDMATE AI</span>
            <h3>{"Whatever's on your mind, I'm here."}</h3>
            <p>Chat privately for reflection, calming tools, or evidence-based guidance.</p>
            <button type="button" onClick={() => effectiveGo("chat")}>
              Start a conversation <Icon name="arrow" size={17} />
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}
