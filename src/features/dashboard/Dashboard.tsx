import React, { useMemo, useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { type Appointment, wellnessApi } from "../../api";
import Icon from "../../shared/ui/Icon";
import MoodChart from "../../shared/ui/MoodChart";
import DailyMicroHabits from "./DailyMicroHabits";
import EmotionExplorer from "./EmotionExplorer";
import { FollowUpCard } from "../followup";
import { addMood, useMoods, type MoodEntry } from "../../shared/lib/api/moods";
import { useAssessments } from "../../shared/lib/api/assessments";
import { fetchMyAppointments, type MyAppointment } from "../doctors/api";
import { isDemoModeActive, getDemoProfile } from "../auth/demoMode";
import { useAuth } from "../../app/providers/AuthProvider";
import { DemoDataPanel, useDemoDataStatus } from "../demo-data";
import { DASHBOARD_NS } from "./i18n";

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

const MOOD_OPTIONS = [
  { label: "Rough", face: "◡" },
  { label: "Low", face: "⌣" },
  { label: "Okay", face: "—" },
  { label: "Good", face: "◡" },
  { label: "Great", face: "◠" },
];

export default function Dashboard({
  go,
  studentId,
  openBreathing = () => alert("Guided Breathing: Inhale 4s, Hold 7s, Exhale 8s."),
  openGrounding = () => alert("Sensory Grounding: Notice 5 things you see, 4 you feel, 3 you hear, 2 you smell, 1 you taste."),
  openVideo = () => alert("Video Consultation Room is preparing. Please ensure your microphone is connected."),
  openAudioSanctuary,
  activeAppointment = null,
}: DashboardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation(DASHBOARD_NS);
  const queryClient = useQueryClient();

  const isDemo = isDemoModeActive();
  const demoProfile = getDemoProfile();
  const { hasDemo } = useDemoDataStatus();

  const effectiveGo = (path: string) => {
    if (go) {
      go(path);
    } else {
      navigate(`/${path}`);
    }
  };

  // Honest student name fallback (never fabricates Aarav for real users)
  const studentName = isDemo
    ? demoProfile.alias
    : user?.user_metadata?.name || user?.email?.split("@")[0] || "Student";

  const [range, setRange] = useState("Week");
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "queued" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string>("");

  const moodButtonsRef = useRef<HTMLDivElement | null>(null);

  // Real data queries
  const { data: dbMoods, isLoading: moodsLoading } = useMoods({ limit: 60 });
  const { data: assessments } = useAssessments();

  // Real appointments query
  const [fetchedAppointment, setFetchedAppointment] = useState<MyAppointment | null>(null);

  useEffect(() => {
    if (activeAppointment) return;
    if (isDemo || !user?.id) return;
    let mounted = true;
    fetchMyAppointments()
      .then((appts) => {
        if (!mounted) return;
        const upcoming = appts.find((a) => a.status === "confirmed" || a.status === "scheduled");
        if (upcoming) setFetchedAppointment(upcoming);
      })
      .catch(() => {
        // ignore appointment fetch error in dashboard overview
      });
    return () => {
      mounted = false;
    };
  }, [activeAppointment, isDemo, user?.id]);

  const saveMoodHandler = async (mood: string, index: number) => {
    setSelectedMood(index);
    setSaveStatus("saving");
    setSaveMessage(t("saving", "Saving…"));
    const scoreVal = (index + 1) * 2; // maps 0..4 to 2, 4, 6, 8, 10
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

    try {
      if (!isDemo) {
        const result = await addMood({
          mood,
          score: scoreVal,
          tags: ["Daily Check-in"],
        });
        queryClient.invalidateQueries({ queryKey: ["moods"] });

        if (isOffline && result?.id) {
          setSaveStatus("queued");
          setSaveMessage(t("savedOffline", "Saved on this device. It will sync when you are back online."));
          setTimeout(() => {
            setSaveStatus("idle");
            setSaveMessage("");
          }, 4000);
        } else if (result?.id) {
          setSaveStatus("saved");
          setSaveMessage(t("saved", "Saved"));
          setTimeout(() => {
            setSaveStatus("idle");
            setSaveMessage("");
          }, 2500);
        } else {
          throw new Error("No mood entry created");
        }
      } else {
        if (studentId) {
          await wellnessApi.saveMood(studentId, mood, scoreVal);
        }
        setSaveStatus("saved");
        setSaveMessage(t("saved", "Saved"));
        setTimeout(() => {
          setSaveStatus("idle");
          setSaveMessage("");
        }, 2500);
      }
    } catch {
      setSaveStatus("error");
      setSaveMessage(t("saveError", "We could not save your check-in. Please try again."));
      // Keeps user selection so they can retry
    }
  };

  const handleFocusQuickMood = () => {
    if (moodButtonsRef.current) {
      moodButtonsRef.current.scrollIntoView?.({ behavior: "smooth" });
      const firstBtn = moodButtonsRef.current.querySelector<HTMLButtonElement>("button");
      firstBtn?.focus();
    }
  };

  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
  }, []);

  // Compute real statistics from logged moods
  const nowMs = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const sevenDaysAgo = nowMs - 7 * ONE_DAY_MS;
  const fourteenDaysAgo = nowMs - 14 * ONE_DAY_MS;

  const currentWeekMoods = useMemo(() => {
    if (!dbMoods) return [];
    return dbMoods.filter((m) => {
      const t = new Date(m.created_at).getTime();
      return !isNaN(t) && t >= sevenDaysAgo;
    });
  }, [dbMoods, sevenDaysAgo]);

  const priorWeekMoods = useMemo(() => {
    if (!dbMoods) return [];
    return dbMoods.filter((m) => {
      const t = new Date(m.created_at).getTime();
      return !isNaN(t) && t >= fourteenDaysAgo && t < sevenDaysAgo;
    });
  }, [dbMoods, fourteenDaysAgo, sevenDaysAgo]);

  const moodStats = useMemo(() => {
    const totalCount = dbMoods?.length ?? 0;
    const hasMoods = totalCount > 0;
    const latestMood: MoodEntry | null = hasMoods && dbMoods ? dbMoods[0] : null;

    let avgMood7Days: string | null = null;
    let avgScoreRaw: number | null = null;
    if (currentWeekMoods.length > 0) {
      const sum = currentWeekMoods.reduce((acc, m) => acc + m.score, 0);
      avgScoreRaw = sum / currentWeekMoods.length;
      avgMood7Days = avgScoreRaw.toFixed(1);
    }

    // Week-over-week rule: ONLY when both weeks have at least 4 check-ins!
    let trendText = t("notEnoughDataTrend", "Need at least 4 check-ins in both weeks for 7-day trend");
    let canCompareWeeks = false;
    let diffPct: number | null = null;

    if (currentWeekMoods.length >= 4 && priorWeekMoods.length >= 4 && avgScoreRaw !== null) {
      canCompareWeeks = true;
      const priorSum = priorWeekMoods.reduce((acc, m) => acc + m.score, 0);
      const priorAvg = priorSum / priorWeekMoods.length;
      if (priorAvg > 0) {
        diffPct = Math.round(((avgScoreRaw - priorAvg) / priorAvg) * 100);
        if (diffPct > 0) {
          trendText = t("trendUp", "↑ {{diff}}% vs prior 7 days", { diff: Math.abs(diffPct) });
        } else if (diffPct < 0) {
          trendText = t("trendDown", "↓ {{diff}}% vs prior 7 days", { diff: Math.abs(diffPct) });
        } else {
          trendText = t("trendEqual", "No change vs prior 7 days");
        }
      }
    }

    return {
      hasMoods,
      totalCount,
      checkinsThisWeek: currentWeekMoods.length,
      avgMood7Days,
      avgScoreRaw,
      trendText,
      canCompareWeeks,
      diffPct,
      latestMood,
    };
  }, [dbMoods, currentWeekMoods, priorWeekMoods, t]);

  const latestAssessment = useMemo(() => {
    if (!assessments || assessments.length === 0) return null;
    return assessments[0];
  }, [assessments]);

  // Appointment display resolution
  const nextAppt = activeAppointment || fetchedAppointment;

  return (
    <div className="page">
      <section className="welcome">
        <div>
          <span className="eyebrow green">{todayStr}</span>
          <h1>Good morning, {studentName}.</h1>
          <p>
            {t("checkinPrompt", "Small daily check-ins create meaningful change. How are you feeling today?")}
            {" "}
            {saveStatus !== "error" && saveMessage && (
              <small className="saved-label" role="status" aria-live="polite">
                {saveMessage}
              </small>
            )}
          </p>
          {saveStatus === "error" && (
            <div
              role="alert"
              style={{
                color: "var(--danger)",
                fontSize: 13,
                fontWeight: 600,
                marginTop: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="x" size={14} />
              <span>{saveMessage}</span>
            </div>
          )}
        </div>
        <div
          className="moods"
          role="group"
          aria-label="Daily mood selection"
          ref={moodButtonsRef}
          tabIndex={-1}
        >
          {MOOD_OPTIONS.map((m, i) => (
            <button
              key={m.label}
              type="button"
              className={selectedMood === i ? "selected" : ""}
              onClick={() => saveMoodHandler(m.label, i)}
              aria-label={`Select mood: ${m.label}`}
            >
              <span>{m.face}</span>
              {m.label}
            </button>
          ))}
        </div>
      </section>

      <FollowUpCard />

      {/* Honest Empty State Banner (Shown when user has no logged check-ins) */}
      {!moodsLoading && !moodStats.hasMoods && (
        <section
          className="panel"
          style={{
            padding: "24px 28px",
            marginBottom: 24,
            border: "1px dashed var(--line)",
            background: "var(--surface)",
            borderRadius: 14,
          }}
          data-testid="dashboard-empty-state"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <span className="eyebrow green">GET STARTED</span>
              <h2 style={{ fontSize: 18, margin: "4px 0 6px" }}>
                {t("emptyStateTitle", "Welcome to your mindful space")}
              </h2>
              <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5, maxWidth: 640 }}>
                {t(
                  "emptyStateDesc",
                  "You haven't logged any check-ins yet. Take a moment to log how you feel today, or load sample data to preview features."
                )}
              </p>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="primary-btn"
                onClick={handleFocusQuickMood}
                style={{ minHeight: 38, fontSize: 13 }}
              >
                {t("logFirstCheckin", "Log your first check-in")} <Icon name="arrow" size={16} />
              </button>
              <DemoDataPanel variant="inline" />
            </div>
          </div>
        </section>
      )}

      {/* Stat Grid: 100% computed from real data */}
      <section className="stat-grid">
        {/* Stat Card 1: Average Mood (Last 7 Days) */}
        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon mint"><Icon name="heart" /></span>
            {hasDemo && (
              <span
                className="demo-chip"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 10,
                  background: "oklch(0.94 0.05 85)",
                  color: "oklch(0.35 0.09 70)",
                  border: "1px dashed oklch(0.7 0.1 70)",
                }}
              >
                {t("includesDemo", "Includes demo data")}
              </span>
            )}
            {moodStats.canCompareWeeks && (
              <span className="trend">
                {moodStats.diffPct !== null && moodStats.diffPct > 0
                  ? `↑ ${moodStats.diffPct}%`
                  : moodStats.diffPct !== null && moodStats.diffPct < 0
                  ? `↓ ${Math.abs(moodStats.diffPct)}%`
                  : "—"}
              </span>
            )}
          </div>
          <p>{t("avgMoodTitle", "Average mood (last 7 days)")}</p>
          <div className="stat-value">
            {moodStats.avgMood7Days ? (
              <>
                {moodStats.avgMood7Days}<span>/10</span>
              </>
            ) : (
              <span style={{ fontSize: 24, color: "var(--muted)" }}>— / 10</span>
            )}
          </div>
          <div className="progress">
            <i
              style={{
                width: moodStats.avgScoreRaw ? `${(moodStats.avgScoreRaw / 10) * 100}%` : "0%",
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <small className="muted">{moodStats.trendText}</small>
        </article>

        {/* Stat Card 2: Latest Check-in */}
        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon lilac"><Icon name="chart" /></span>
            {hasDemo && (
              <span
                className="demo-chip"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 10,
                  background: "oklch(0.94 0.05 85)",
                  color: "oklch(0.35 0.09 70)",
                  border: "1px dashed oklch(0.7 0.1 70)",
                }}
              >
                {t("includesDemo", "Includes demo data")}
              </span>
            )}
          </div>
          <p>{t("latestCheckin", "Latest check-in")}</p>
          <div className="stat-value" style={{ fontSize: moodStats.latestMood ? 22 : 20 }}>
            {moodStats.latestMood ? moodStats.latestMood.mood : t("noMoodsYet", "No check-ins yet")}
          </div>
          <div className="mini-row">
            {moodStats.latestMood ? (
              <small>
                Score {moodStats.latestMood.score}/10 ·{" "}
                {new Date(moodStats.latestMood.created_at).toLocaleDateString("en-IN", {
                  month: "short",
                  day: "numeric",
                })}
              </small>
            ) : (
              <small className="muted">Log your daily mood above</small>
            )}
          </div>
        </article>

        {/* Stat Card 3: Check-ins This Week */}
        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon peach"><Icon name="sparkles" /></span>
            {hasDemo && (
              <span
                className="demo-chip"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 10,
                  background: "oklch(0.94 0.05 85)",
                  color: "oklch(0.35 0.09 70)",
                  border: "1px dashed oklch(0.7 0.1 70)",
                }}
              >
                {t("includesDemo", "Includes demo data")}
              </span>
            )}
          </div>
          <p>{t("checkinsThisWeek", "Check-ins this week")}</p>
          <div className="stat-value">
            {moodStats.checkinsThisWeek}
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--muted)", marginLeft: 6 }}>
              logged
            </span>
          </div>
          <div className="progress amber">
            <i
              style={{
                width: `${Math.min(100, (moodStats.checkinsThisWeek / 7) * 100)}%`,
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <small className="muted">Total logged: {moodStats.totalCount}</small>
        </article>

        {/* Stat Card 4: Screening Navigation Button */}
        <button
          type="button"
          className="stat-card check-card interactive"
          onClick={() => effectiveGo("assessment")}
          aria-label="Start weekly mental health check-in"
          style={{ textAlign: "left", cursor: "pointer", border: "1px solid var(--line)" }}
        >
          <span className="soft-icon blue"><Icon name="test" /></span>
          <div>
            <p>{t("weeklyCheckin", "Weekly check-in")}</p>
            {latestAssessment ? (
              <>
                <strong>
                  {latestAssessment.instrument.toUpperCase()} · {latestAssessment.severity}
                </strong>
                <small>
                  Score {latestAssessment.total} ·{" "}
                  {new Date(
                    latestAssessment.created_at || latestAssessment.completed_at || Date.now()
                  ).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                </small>
              </>
            ) : (
              <>
                <strong>{t("weeklyCheckinCta", "2 minutes can help")}</strong>
                <small>{t("weeklyCheckinDesc", "Understand how you're really doing.")}</small>
              </>
            )}
          </div>
          <span aria-hidden="true" style={{ marginLeft: "auto" }}>
            <Icon name="arrow" />
          </span>
        </button>
      </section>

      {/* Main Grid: Mood Rhythm Chart & Screening/Progress Summary */}
      <section className="main-grid">
        <article className="panel mood-panel">
          <div className="panel-head">
            <div>
              <h3>{t("moodRhythm", "Your mood rhythm")}</h3>
              <p>
                {t("moodRhythmSubtitle", "Based on your real daily check-ins")}
                {hasDemo && (
                  <span
                    className="demo-chip"
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      color: "oklch(0.4 0.08 70)",
                    }}
                  >
                    ({t("includesDemo", "Includes demo data")})
                  </span>
                )}
              </p>
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
          <MoodChart range={range} entries={dbMoods ?? []} />
          <div className="insight">
            <span className="soft-icon mint small"><Icon name="sparkles" size={17} /></span>
            <p>
              {moodStats.hasMoods && moodStats.totalCount >= 4 ? (
                <>
                  <strong>Check-in summary:</strong> You have logged {moodStats.totalCount} mood{" "}
                  {moodStats.totalCount === 1 ? "entry" : "entries"}. Regular check-ins build
                  accurate emotional awareness.
                </>
              ) : (
                <>
                  <strong>Mindful note:</strong> Check in regularly throughout the week to see your
                  mood pattern and rhythm emerge over time.
                </>
              )}
            </p>
          </div>
        </article>

        {/* Honest Summary Panel */}
        <article className="panel">
          <div className="panel-head">
            <div>
              <h3>Wellness check-in summary</h3>
              <p>Your screening & reflection activity</p>
            </div>
          </div>

          <div style={{ display: "grid", gap: 14, padding: "12px 0" }}>
            <div
              className="care-step"
              style={{
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "14px 16px",
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              <span className="soft-icon blue"><Icon name="test" size={18} /></span>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 14 }}>
                  {latestAssessment
                    ? `${latestAssessment.instrument.toUpperCase()} Screening`
                    : t("noScreeningYet", "No screenings completed")}
                </strong>
                <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
                  {latestAssessment
                    ? `Result: ${latestAssessment.severity} (Score: ${latestAssessment.total})`
                    : "Screening helps evaluate mood patterns objectively."}
                </p>
              </div>
              <button
                type="button"
                className="outline-btn"
                style={{ fontSize: 12, padding: "4px 10px" }}
                onClick={() => effectiveGo("assessment")}
              >
                {latestAssessment ? "Retake" : "Start"}
              </button>
            </div>

            <div
              className="care-step"
              style={{
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "14px 16px",
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              <span className="soft-icon mint"><Icon name="sparkles" size={18} /></span>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 14 }}>
                  {moodStats.totalCount > 0
                    ? `${moodStats.totalCount} Mood ${moodStats.totalCount === 1 ? "check-in" : "check-ins"} saved`
                    : "No check-ins recorded"}
                </strong>
                <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
                  {moodStats.totalCount > 0
                    ? `${moodStats.checkinsThisWeek} check-ins logged in the last 7 days.`
                    : "Select a mood button above to log your first check-in."}
                </p>
              </div>
              <button
                type="button"
                className="outline-btn"
                style={{ fontSize: 12, padding: "4px 10px" }}
                onClick={() => effectiveGo("mood")}
              >
                View
              </button>
            </div>

            <div
              className="care-step"
              style={{
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "14px 16px",
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              <span className="soft-icon lilac"><Icon name="book" size={18} /></span>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 14 }}>Private Reflection Journal</strong>
                <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
                  Zero-knowledge encrypted journal for personal thoughts.
                </p>
              </div>
              <button
                type="button"
                className="outline-btn"
                style={{ fontSize: 12, padding: "4px 10px" }}
                onClick={() => effectiveGo("journal")}
              >
                Open
              </button>
            </div>
          </div>

          <button
            type="button"
            className="text-btn"
            onClick={() => effectiveGo("insights")}
            style={{ marginTop: 8 }}
          >
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

      {/* Lower Grid: Recommendations, Honest Upcoming Session, MindMate AI */}
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

        {/* Real Appointment or Honest Empty State (No fake Dr. Ananya Sharma) */}
        <article className="panel next-session">
          <div className="panel-head">
            <h3>{t("upcomingSession", "Upcoming session")}</h3>
            <button type="button" onClick={() => effectiveGo("doctors")}>
              {nextAppt ? "View all" : "Find support"}
            </button>
          </div>
          {nextAppt ? (
            <>
              <div className="session">
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    color: "var(--primary)",
                    fontSize: 16,
                  }}
                  aria-hidden="true"
                >
                  {("doctorName" in nextAppt && nextAppt.doctorName
                    ? nextAppt.doctorName.replace("Dr. ", "").slice(0, 2)
                    : "CC"
                  ).toUpperCase()}
                </div>
                <div>
                  <strong>
                    {"doctorName" in nextAppt
                      ? nextAppt.doctorName
                      : "Campus Counsellor"}
                  </strong>
                  <span>Counselling Psychologist</span>
                  <small>
                    <Icon name="calendar" size={14} />{" "}
                    {"scheduledFor" in nextAppt && nextAppt.scheduledFor
                      ? nextAppt.scheduledFor
                      : "scheduledAt" in nextAppt
                      ? new Date(nextAppt.scheduledAt).toLocaleDateString()
                      : "Upcoming"}
                    {"slotTime" in nextAppt && nextAppt.slotTime
                      ? ` · ${nextAppt.slotTime}`
                      : ""}
                  </small>
                </div>
              </div>
              <button type="button" className="outline-btn" onClick={openVideo}>
                {t("joinSession", "Join video session")}
              </button>
            </>
          ) : (
            <div style={{ padding: "14px 0" }}>
              <p className="muted" style={{ fontSize: 13, margin: "0 0 14px", lineHeight: 1.5 }}>
                {t(
                  "noUpcomingSession",
                  "No upcoming sessions. Need support? Book a confidential consultation with a campus counsellor."
                )}
              </p>
              <button
                type="button"
                className="primary-btn"
                onClick={() => effectiveGo("doctors")}
                style={{ fontSize: 13, minHeight: 38 }}
              >
                {t("findCounsellor", "Find a counsellor")} <Icon name="arrow" size={16} />
              </button>
            </div>
          )}
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
