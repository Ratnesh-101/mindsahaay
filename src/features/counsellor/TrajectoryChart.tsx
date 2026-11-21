import React from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import type { ScorePoint } from "./api";

interface TrajectoryChartProps {
  instrument: "phq9" | "gad7";
  points: ScorePoint[];
}

const MAX_SCORE = { phq9: 27, gad7: 21 } as const;

/** Line chart of one instrument's total over time, with a keyboard-reachable data table as the accessible alternative. */
export default function TrajectoryChart({ instrument, points }: TrajectoryChartProps) {
  const { t } = useTranslation(CONTENT_NS);
  const name = t(`counsellor.${instrument}`);
  const data = points
    .filter((p) => p.instrument === instrument)
    .map((p) => ({ date: new Date(p.completedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }), score: p.total }));

  if (data.length === 0) return null;

  return (
    <figure className="m-0 rounded-xl border border-[var(--line)] p-3" aria-label={t("counsellor.chartLabel", { name })}>
      <figcaption className="mb-2 font-bold">{name}</figcaption>
      <div style={{ width: "100%", height: 200 }} role="img" aria-label={t("counsellor.chartLabel", { name })}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, MAX_SCORE[instrument]]} tick={{ fontSize: 11 }} width={28} />
            <Tooltip />
            <Line type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2">
        <summary className="min-h-6 cursor-pointer text-[13px] font-semibold">{t("counsellor.tableToggle", { name })}</summary>
        <table className="mt-2 w-full text-left text-[13px]">
          <caption className="sr-only">{t("counsellor.chartLabel", { name })}</caption>
          <thead>
            <tr>
              <th scope="col">{t("counsellor.date")}</th>
              <th scope="col">{t("counsellor.score")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={`${d.date}-${i}`}>
                <td>{d.date}</td>
                <td>{d.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
