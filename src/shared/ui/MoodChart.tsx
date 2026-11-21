import React from "react";

export interface MoodChartProps {
  range?: string;
}

export default function MoodChart({ range = "Week" }: MoodChartProps) {
  const weekVals = [48, 62, 55, 74, 68, 86, 78];
  const monthVals = [52, 60, 68, 71, 74, 79, 82];
  const vals = range === "Week" ? weekVals : monthVals;
  const labels =
    range === "Week"
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6", "Week 7"];

  return (
    <div className="chart-wrap">
      <div className="y-labels">
        <span>Great</span>
        <span>Good</span>
        <span>Okay</span>
        <span>Low</span>
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
          <path
            d="M0 132 C55 125 60 95 116 93 S180 118 233 108 S300 62 350 66 S420 82 466 75 S525 28 583 38 S640 55 700 46 L700 180 L0 180Z"
            fill="url(#area)"
          />
          <path
            d="M0 132 C55 125 60 95 116 93 S180 118 233 108 S300 62 350 66 S420 82 466 75 S525 28 583 38 S640 55 700 46"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
        <div className="chart-points">
          {vals.map((v, i) => (
            <i key={i} style={{ left: `${i * 16.66}%`, bottom: `${v}%` }} title={`Point ${i + 1}: ${v}%`} />
          ))}
        </div>
        <div className="x-labels">
          {labels.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
