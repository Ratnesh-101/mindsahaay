import React, { useMemo } from "react";
import type { MoodEntry } from "../lib/api/moods";

export interface MoodChartProps {
  range?: string;
  entries?: MoodEntry[];
}

export default function MoodChart({ range = "Week", entries = [] }: MoodChartProps) {
  // Sort entries chronologically (oldest to newest)
  const filtered = useMemo(() => {
    if (!entries || entries.length === 0) return [];
    const now = Date.now();
    const cutoffDays = range === "Week" ? 7 : 30;
    const cutoffTime = now - cutoffDays * 24 * 60 * 60 * 1000;

    const inRange = entries.filter((e) => {
      const t = new Date(e.created_at).getTime();
      return !isNaN(t) && t >= cutoffTime;
    });

    // If within cutoff we have items, sort ascending; otherwise take up to 7 or 14 items
    const selected = inRange.length > 0 ? inRange : entries.slice(0, range === "Week" ? 7 : 14);

    return [...selected].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [entries, range]);

  if (filtered.length === 0) {
    return (
      <div className="chart-wrap" style={{ minHeight: 180, display: "grid", placeItems: "center" }}>
        <p className="muted" style={{ fontSize: 13, textAlign: "center", margin: "24px 0" }}>
          No mood entries recorded yet. Complete a daily check-in above to begin tracking your mood rhythm.
        </p>
      </div>
    );
  }

  // Width: 700, Height: 180
  const points = filtered.map((entry, idx) => {
    const x =
      filtered.length === 1
        ? 350
        : 40 + (idx / (filtered.length - 1)) * 620;
    // Map score 1..10 to y 150..30
    const clampedScore = Math.max(1, Math.min(10, entry.score));
    const y = 150 - ((clampedScore - 1) / 9) * 120;
    const label = new Date(entry.created_at).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
    });
    return { x, y, score: clampedScore, mood: entry.mood, label, date: entry.created_at };
  });

  const lineD =
    points.length === 1
      ? `M ${points[0].x - 30} ${points[0].y} L ${points[0].x + 30} ${points[0].y}`
      : points.reduce((acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), "");

  const areaD =
    points.length === 1
      ? `M ${points[0].x - 30} ${points[0].y} L ${points[0].x + 30} ${points[0].y} L ${points[0].x + 30} 180 L ${points[0].x - 30} 180 Z`
      : `${lineD} L ${points[points.length - 1].x} 180 L ${points[0].x} 180 Z`;

  return (
    <div className="chart-wrap">
      <div className="y-labels">
        <span>Great (9-10)</span>
        <span>Good (7-8)</span>
        <span>Okay (5-6)</span>
        <span>Low (1-4)</span>
      </div>
      <div className="chart">
        <div className="grid-lines">
          <i />
          <i />
          <i />
          <i />
        </div>
        <svg viewBox="0 0 700 180" preserveAspectRatio="none" role="img" aria-label="Mood trend chart">
          <defs>
            <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--primary)" stopOpacity=".22" />
              <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#area)" />
          <path
            d={lineD}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="chart-points">
          {points.map((p, i) => (
            <i
              key={i}
              style={{
                left: `${(p.x / 700) * 100}%`,
                bottom: `${((180 - p.y) / 180) * 100}%`,
              }}
              title={`${p.label}: ${p.mood} (${p.score}/10)`}
            />
          ))}
        </div>
        <div className="x-labels">
          {points.map((p, i) => (
            <span key={i}>{p.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
