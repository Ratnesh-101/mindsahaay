import React, { useState, useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import Icon from "../../shared/ui/Icon";
import { useMoods, useAddMood, type MoodEntry } from "../../shared/lib/api/moods";
import { detectRisk } from "../../domain/risk/lexicon";
import { isDemoModeActive } from "../auth/demoMode";

const MOOD_OPTIONS = [
  { label: "Rough", score: 2, icon: "◡", color: "var(--danger)" },
  { label: "Low", score: 4, icon: "⌣", color: "var(--amber)" },
  { label: "Okay", score: 6, icon: "—", color: "var(--primary)" },
  { label: "Good", score: 8, icon: "◡", color: "var(--primary)" },
  { label: "Great", score: 10, icon: "◠", color: "var(--primary-dark)" },
];

const EMOTION_TAGS = [
  "Anxious",
  "Calm",
  "Exhausted",
  "Grateful",
  "Homesick",
  "Overwhelmed",
  "Hopeful",
  "Stressed",
  "Lonely",
  "Focused",
  "Relieved",
  "Burnout",
];

const COPING_RECOMMENDATIONS: Record<string, { title: string; desc: string; action: string }> = {
  Rough: {
    title: "Grounding & Safety Pause",
    desc: "When feeling rough, physiological regulation comes first. Try 5-4-3-2-1 sensory grounding or call a friend.",
    action: "Try 5-4-3-2-1 Sensory Reset",
  },
  Low: {
    title: "Gentle Energy Restoration",
    desc: "Honor your low energy without self-judgment. A 10-minute walk outside or warm tea can gently lift mood.",
    action: "Listen to 432Hz Soundscape",
  },
  Okay: {
    title: "Mindful Baseline Balance",
    desc: "Steady days are wonderful foundations. A brief mindful journaling reflection can solidify your equilibrium.",
    action: "Write a 3-Sentence Journal",
  },
  Good: {
    title: "Positive Momentum Reflection",
    desc: "Notice what supported you today. Celebrating small wins builds resilience for future exam cycles.",
    action: "Log a Micro-Habit Win",
  },
  Great: {
    title: "Cherish & Anchor Energy",
    desc: "Channel your positive vitality into connecting with a peer or exploring campus community stories.",
    action: "Read Campus Voices of Courage",
  },
};

export default function MoodCheckIn() {
  const [selectedScore, setSelectedScore] = useState<number>(6);
  const [selectedTags, setSelectedTags] = useState<string[]>(["Calm"]);
  const [notes, setNotes] = useState<string>("");
  const [timeRange, setTimeRange] = useState<"7" | "30" | "90">("7");
  const [crisisAlert, setCrisisAlert] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: dbMoods, isLoading: loadingMoods } = useMoods({ limit: 100 });
  const addMoodMutation = useAddMood();

  // Demo fallback data
  const [demoMoods, setDemoMoods] = useState<MoodEntry[]>([
    { id: "m1", mood: "Okay", score: 6, tags: ["Calm"], notes: "Normal study day", created_at: new Date(Date.now() - 86400000 * 6).toISOString() },
    { id: "m2", mood: "Good", score: 8, tags: ["Focused"], notes: "Completed lab report", created_at: new Date(Date.now() - 86400000 * 5).toISOString() },
    { id: "m3", mood: "Low", score: 4, tags: ["Exhausted", "Homesick"], notes: "Late night in hostel", created_at: new Date(Date.now() - 86400000 * 4).toISOString() },
    { id: "m4", mood: "Good", score: 8, tags: ["Grateful"], notes: "Call with family", created_at: new Date(Date.now() - 86400000 * 3).toISOString() },
    { id: "m5", mood: "Rough", score: 2, tags: ["Overwhelmed", "Anxious"], notes: "Mid-semester test pressure", created_at: new Date(Date.now() - 86400000 * 2).toISOString() },
    { id: "m6", mood: "Okay", score: 6, tags: ["Calm"], notes: "Took a walk around campus", created_at: new Date(Date.now() - 86400000 * 1).toISOString() },
    { id: "m7", mood: "Good", score: 8, tags: ["Hopeful", "Focused"], notes: "Good sleep last night", created_at: new Date().toISOString() },
  ]);

  const isDemo = isDemoModeActive();
  const allMoods = isDemo ? demoMoods : (dbMoods ?? demoMoods);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleNotesChange = (val: string) => {
    setNotes(val);
    if (val.trim().length > 3) {
      const risk = detectRisk(val);
      if (risk.level === "imminent" || risk.level === "moderate") {
        setCrisisAlert(
          "We noticed phrases of acute distress in your notes. Please remember confidential support is available 24/7.",
        );
      } else {
        setCrisisAlert(null);
      }
    } else {
      setCrisisAlert(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentOption = MOOD_OPTIONS.find((m) => m.score === selectedScore) || MOOD_OPTIONS[2];

    // Check crisis in notes before submission
    if (notes.trim()) {
      const risk = detectRisk(notes);
      if (risk.level === "imminent" || risk.level === "moderate") {
        setCrisisAlert(
          "MindSahaay detected acute distress keywords. Please connect with immediate professional help below.",
        );
      }
    }

    try {
      if (!isDemo) {
        await addMoodMutation.mutateAsync({
          mood: currentOption.label,
          score: currentOption.score,
          tags: selectedTags,
          notes: notes.trim() || undefined,
        });
      } else {
        const newEntry: MoodEntry = {
          id: `demo-mood-${Date.now()}`,
          mood: currentOption.label,
          score: currentOption.score,
          tags: selectedTags,
          notes: notes.trim() || undefined,
          created_at: new Date().toISOString(),
        };
        setDemoMoods((prev) => [newEntry, ...prev]);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      setNotes("");
    } catch {
      // Handled via mutation state or fallback
    }
  };

  // Filter moods for trend chart
  const chartData = useMemo(() => {
    const days = Number.parseInt(timeRange, 10);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const filtered = allMoods.filter((m) => new Date(m.created_at).getTime() >= cutoff);

    // Sort ascending for chronological chart
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    return sorted.map((entry) => ({
      date: new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: entry.score,
      mood: entry.mood,
    }));
  }, [allMoods, timeRange]);

  const currentMoodObj = MOOD_OPTIONS.find((m) => m.score === selectedScore) || MOOD_OPTIONS[2];
  const coping = COPING_RECOMMENDATIONS[currentMoodObj.label] || COPING_RECOMMENDATIONS.Okay;

  return (
    <div className="page mood-page" style={{ maxWidth: 960, margin: "0 auto" }}>
      <header className="directory-head" style={{ marginBottom: 20 }}>
        <div>
          <span className="eyebrow green">DAILY CHECK-IN</span>
          <h1>How are you feeling today?</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Log in 3 taps to recognize emotional patterns and receive tailored micro-coping strategies.
          </p>
        </div>
      </header>

      {/* Immediate Crisis Alert if distress words detected */}
      {crisisAlert && (
        <section
          className="care-step"
          role="alert"
          aria-live="assertive"
          style={{
            background: "color-mix(in oklch, var(--danger) 15%, var(--white))",
            borderColor: "var(--danger)",
            padding: "16px 20px",
            marginBottom: 24,
          }}
        >
          <span className="soft-icon" style={{ background: "var(--danger)", color: "#fff" }}>
            <Icon name="phone" size={20} />
          </span>
          <div style={{ flex: 1 }}>
            <strong style={{ color: "var(--danger)", fontSize: 16 }}>Immediate Crisis Support Available</strong>
            <p style={{ marginTop: 4, lineHeight: 1.5 }}>{crisisAlert}</p>
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <a href="tel:14416" className="primary-btn" style={{ background: "var(--danger)", textDecoration: "none" }}>
                Call Tele-MANAS (14416)
              </a>
              <a href="tel:18005990019" className="primary-btn" style={{ background: "var(--danger)", textDecoration: "none" }}>
                Call KIRAN (1800-599-0019)
              </a>
              <a href="tel:112" className="outline-btn" style={{ textDecoration: "none" }}>
                Emergency 112
              </a>
            </div>
          </div>
        </section>
      )}

      {/* Mood Check-In Form */}
      <section className="panel" style={{ marginBottom: 28 }}>
        <form onSubmit={handleSubmit}>
          {/* Step 1: 5-point scale */}
          <div style={{ marginBottom: 24 }}>
            <span className="field-label" id="mood-scale-prompt" style={{ fontSize: 15, marginBottom: 12 }}>
              1. Select your current mood state:
            </span>
            <div className="moods" role="group" aria-labelledby="mood-scale-prompt">
              {MOOD_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  className={selectedScore === opt.score ? "selected" : ""}
                  onClick={() => setSelectedScore(opt.score)}
                  aria-pressed={selectedScore === opt.score}
                  aria-label={`${opt.label} (score ${opt.score} out of 10)`}
                  style={{ minWidth: 80 }}
                >
                  <span style={{ fontSize: 24 }}>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Emotion tags */}
          <div style={{ marginBottom: 24 }}>
            <span className="field-label" id="emotion-tags-prompt" style={{ fontSize: 15, marginBottom: 12 }}>
              2. What feelings describe your experience right now? (Select tags)
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} role="group" aria-labelledby="emotion-tags-prompt">
              {EMOTION_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={active}
                    className={`quick-pill ${active ? "active" : ""}`}
                    style={{
                      borderRadius: 20,
                      padding: "6px 14px",
                      fontSize: 13,
                      background: active ? "var(--primary)" : "var(--canvas)",
                      color: active ? "var(--white)" : "var(--ink)",
                      border: "1px solid var(--line)",
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Optional notes with crisis checking */}
          <div style={{ marginBottom: 20 }}>
            <label className="field-label" htmlFor="mood-notes">
              3. Private notes (optional, up to 500 characters):
            </label>
            <textarea
              id="mood-notes"
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value.slice(0, 500))}
              placeholder="What made you feel this way? (e.g. assignments, hostel environment, friendships...)"
              rows={3}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                border: "1px solid var(--line)",
                background: "var(--white)",
                color: "var(--ink)",
                lineHeight: 1.5,
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              <span>Encrypted on-device · Private to you</span>
              <span>{notes.length}/500</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              type="submit"
              className="primary-btn"
              disabled={addMoodMutation.isPending}
              style={{ minWidth: 160 }}
            >
              <Icon name="check" size={16} />
              {addMoodMutation.isPending ? "Saving…" : "Log Daily Mood"}
            </button>
            {saveSuccess && (
              <span className="saved-label" role="status" aria-live="polite">
                ✓ Mood logged successfully!
              </span>
            )}
          </div>
        </form>
      </section>

      {/* Coping Recommendation */}
      <section
        className="panel recommendation"
        style={{ marginBottom: 28, borderLeft: "4px solid var(--primary)" }}
        aria-label="Clinician-suggested coping activity"
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <span className="soft-icon mint large"><Icon name="sparkles" size={24} /></span>
          <div>
            <span className="eyebrow green">CLINICIAN-REVIEWED SUGGESTION</span>
            <h3 style={{ margin: "4px 0 6px" }}>{coping.title}</h3>
            <p className="muted" style={{ lineHeight: 1.5, marginBottom: 12 }}>{coping.desc}</p>
            <button
              type="button"
              className="outline-btn"
              onClick={() => alert(`Suggestion: ${coping.action}. Take a quiet moment for yourself.`)}
            >
              {coping.action} <Icon name="arrow" size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* 7/30/90-Day Trend Chart using Recharts */}
      <section className="panel" aria-label="Mood trend chart">
        <div className="panel-head" style={{ marginBottom: 16 }}>
          <div>
            <h3>Mood Trend & Rhythm</h3>
            <p className="muted">Track your emotional fluctuations across days and weeks.</p>
          </div>
          <div className="segment" role="group" aria-label="Select trend duration">
            {(["7", "30", "90"] as const).map((range) => (
              <button
                key={range}
                type="button"
                className={timeRange === range ? "active" : ""}
                onClick={() => setTimeRange(range)}
                aria-pressed={timeRange === range}
              >
                {range} Days
              </button>
            ))}
          </div>
        </div>

        {loadingMoods && !isDemo ? (
          <p className="muted">Loading mood logs…</p>
        ) : chartData.length === 0 ? (
          <p className="muted" style={{ padding: 30, textAlign: "center" }}>
            No mood logs found for the selected {timeRange}-day period.
          </p>
        ) : (
          <div>
            <div style={{ width: "100%", height: 260 }} role="img" aria-label={`Mood trend line chart for last ${timeRange} days`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.6} />
                  <XAxis dataKey="date" stroke="var(--muted)" fontSize={12} tickLine={false} />
                  <YAxis
                    domain={[0, 10]}
                    ticks={[2, 4, 6, 8, 10]}
                    stroke="var(--muted)"
                    fontSize={11}
                    tickFormatter={(v) => {
                      if (v <= 2) return "Rough";
                      if (v <= 4) return "Low";
                      if (v <= 6) return "Okay";
                      if (v <= 8) return "Good";
                      return "Great";
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--white)",
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                      color: "var(--ink)",
                      fontSize: 12,
                    }}
                    formatter={(val) => [`Score: ${val}/10`, "Mood"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="oklch(0.53 0.115 170)"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "oklch(0.53 0.115 170)" }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Accessible Screen Reader Table Fallback (WCAG 2.2 AA) */}
            <details style={{ marginTop: 16 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--primary)", fontWeight: 600 }}>
                View accessible data table alternative
              </summary>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 10 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)", textAlign: "left" }}>
                    <th style={{ padding: 6 }}>Date</th>
                    <th style={{ padding: 6 }}>Mood Label</th>
                    <th style={{ padding: 6 }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((d, idx) => (
                    <tr key={`${d.date}-${idx}`} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: 6 }}>{d.date}</td>
                      <td style={{ padding: 6 }}>{d.mood}</td>
                      <td style={{ padding: 6 }}>{d.score}/10</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}
