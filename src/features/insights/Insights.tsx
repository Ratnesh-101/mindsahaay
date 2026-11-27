import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useTranslation } from "react-i18next";
import Icon from "../../shared/ui/Icon";
import { useMoods, type MoodEntry } from "../../shared/lib/api/moods";
import { isDemoModeActive } from "../auth/demoMode";
import { computeInsights } from "./computeInsights";
import { getDemoMoodEntries } from "./demoMoods";
import type { MoodRange } from "./types";
import { INSIGHTS_NS } from "./i18n";
import { DemoBadge, DemoDataNotice } from "../demo-data";

export interface InsightsProps {
  initialMoods?: MoodEntry[];
  referenceDate?: Date;
}

export default function Insights({ initialMoods, referenceDate }: InsightsProps = {}) {
  const { t, i18n } = useTranslation(INSIGHTS_NS);
  const [range, setRange] = useState<MoodRange>("Month");
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");

  // Determine current active language for date formatting
  const activeLocale = i18n.language?.startsWith("hi") ? "hi-IN" : "en-IN";

  // Data fetching: Live Supabase hook (read-only)
  const { data: dbMoods, isLoading, error } = useMoods({ limit: 100 });

  const isDemo = isDemoModeActive();

  // Reference date: real current date by default, injectable for tests
  const refDate = useMemo(() => referenceDate || new Date(), [referenceDate]);

  // Demo fallback entries generated relative to refDate
  const demoFallback = useMemo(() => getDemoMoodEntries(refDate), [refDate]);

  // Select effective moods
  const effectiveMoods = useMemo<MoodEntry[]>(() => {
    if (initialMoods) {
      return initialMoods;
    }
    if (isDemo && (!dbMoods || dbMoods.length === 0)) {
      return demoFallback;
    }
    return dbMoods ?? [];
  }, [initialMoods, isDemo, dbMoods, demoFallback]);

  // Compute honest insights purely from data
  const insights = useMemo(() => {
    return computeInsights(effectiveMoods, range, refDate, activeLocale);
  }, [effectiveMoods, range, refDate, activeLocale]);

  const effectiveLoading = !initialMoods && !isDemo && isLoading;
  const isDemoDataActive = isDemo && (!dbMoods || dbMoods.length === 0) && !initialMoods;

  return (
    <div className="page insights-page" style={{ maxWidth: 1040, margin: "0 auto" }}>
      {/* Demo Mode Notice */}
      {isDemoDataActive && (
        <div
          role="status"
          data-testid="demo-data-badge"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            marginBottom: 20,
            borderRadius: 12,
            background: "var(--surface, #ffffff)",
            border: "1px solid var(--border, #e2dacd)",
            borderLeft: "4px solid var(--primary, #19443c)",
            color: "var(--ink, #1a2a24)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <span className="soft-icon mint" style={{ width: 28, height: 28, flexShrink: 0 }}>
            <Icon name="sparkles" size={15} />
          </span>
          <div>
            <strong>{t("demoBadge", "Demo data")}</strong> ·{" "}
            {t(
              "demoNotice",
              "Viewing sample demonstration check-ins. Real patterns will reflect your logged check-ins."
            )}
          </div>
        </div>
      )}

      {/* Header and Range Filter */}
      <div className="directory-head">
        <div>
          <h1>{t("title", "Your wellbeing patterns")}</h1>
          <p>
            {t(
              "subtitle",
              "A view of the check-ins and routines that shape how you feel."
            )}
          </p>
        </div>
        <div className="segment" role="group" aria-label="Select time range">
          <button
            type="button"
            className={range === "Week" ? "active" : ""}
            onClick={() => setRange("Week")}
            aria-pressed={range === "Week"}
          >
            {t("week", "Week")}
          </button>
          <button
            type="button"
            className={range === "Month" ? "active" : ""}
            onClick={() => setRange("Month")}
            aria-pressed={range === "Month"}
          >
            {t("month", "Month")}
          </button>
        </div>
      </div>

      {effectiveLoading && (
        <div role="status" aria-live="polite" style={{ padding: 40, textAlign: "center" }}>
          <p className="muted">{t("loading", "Loading check-in history…")}</p>
        </div>
      )}

      {error && !isDemo && !initialMoods && (
        <div role="alert" style={{ padding: 24, textAlign: "center" }}>
          <p className="muted">
            {t("error", "Unable to load check-ins right now. Please try again later.")}
          </p>
        </div>
      )}

      {/* Honest Empty State when too little data */}
      {!insights.hasData && !effectiveLoading && (
        <section
          className="panel"
          style={{
            padding: "48px 24px",
            textAlign: "center",
            display: "grid",
            placeItems: "center",
            gap: 16,
          }}
          aria-label="Empty insights state"
        >
          <span className="soft-icon mint large" style={{ width: 56, height: 56 }}>
            <Icon name="sparkles" size={28} />
          </span>
          <div style={{ maxWidth: 440 }}>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>
              {t("emptyTitle", "Log a few check-ins to see your trends")}
            </h2>
            <p className="muted" style={{ lineHeight: 1.6, margin: 0 }}>
              {t(
                "emptyDescription",
                "As you record your daily moods and tags, your personal patterns and averages will appear here."
              )}
            </p>
          </div>
          <a
            href="/mood"
            className="primary-btn"
            style={{
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
            }}
          >
            <Icon name="check" size={16} />
            <span>{t("logCheckIn", "Log a check-in")}</span>
          </a>
        </section>
      )}

      {/* Content when data exists */}
      {insights.hasData && (
        <section className="main-grid">
          {/* Main Trend Panel */}
          <article className="panel mood-panel">
            <div className="panel-head" style={{ marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
              <div>
                <h3>
                  {range === "Week"
                    ? t("weeklyTrend", "Weekly mood trend")
                    : t("monthlyTrend", "Monthly mood trend")}
                </h3>
                <p>
                  {insights.totalCheckIns === 1
                    ? t("checkinsLogged_one", "{{count}} check-in logged", {
                        count: insights.totalCheckIns,
                      })
                    : t("checkinsLogged_other", "{{count}} check-ins logged", {
                        count: insights.totalCheckIns,
                      })}{" "}
                  · {insights.dateRangeLabel}
                </p>
              </div>

              {/* Week-over-week Trend Badge */}
              <div style={{ textAlign: "right" }}>
                {insights.weekOverWeek.status === "available" ? (
                  <span
                    className={`trend ${insights.weekOverWeek.direction === "up" ? "trend-up" : "trend-flat"}`}
                    style={{
                      display: "inline-block",
                      fontWeight: 700,
                      fontSize: 13,
                      padding: "4px 10px",
                      borderRadius: 8,
                    }}
                  >
                    {insights.weekOverWeek.direction === "up" &&
                      t("weekOverWeekUp", "↑ {{pct}}% compared to previous week", {
                        pct: insights.weekOverWeek.percentageChange,
                      })}
                    {insights.weekOverWeek.direction === "down" &&
                      t("weekOverWeekDown", "↓ {{pct}}% compared to previous week", {
                        pct: Math.abs(insights.weekOverWeek.percentageChange),
                      })}
                    {insights.weekOverWeek.direction === "same" &&
                      t("weekOverWeekSame", "No change compared to previous week")}
                  </span>
                ) : (
                  <span
                    className="muted"
                    style={{ fontSize: 12, display: "inline-block", maxWidth: 220, textAlign: "right" }}
                    title={insights.weekOverWeek.reason}
                  >
                    {t(
                      "notEnoughDataWeekly",
                      "Not enough data for weekly comparison (requires at least 4 check-ins in each week)"
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* View Mode Toggle: Chart vs Table (WCAG 2.2 AA) */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              {insights.averageScore !== null && (
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  <span className="muted" style={{ marginRight: 6 }}>
                    {t("averageScore", "Average mood score: {{score}} / 10", {
                      score: insights.averageScore,
                    })}
                  </span>
                </div>
              )}

              <div
                className="segment small"
                role="tablist"
                aria-label="View representation"
                style={{ marginLeft: "auto" }}
              >
                <button
                  type="button"
                  className={viewMode === "chart" ? "active" : ""}
                  onClick={() => setViewMode("chart")}
                  role="tab"
                  aria-selected={viewMode === "chart"}
                >
                  {t("viewChart", "Trend Chart")}
                </button>
                <button
                  type="button"
                  className={viewMode === "table" ? "active" : ""}
                  onClick={() => setViewMode("table")}
                  role="tab"
                  aria-selected={viewMode === "table"}
                >
                  {t("viewTable", "Data Table")}
                </button>
              </div>
            </div>

            {/* Trend Chart (Recharts) */}
            {insights.chartData.some((row) => row.isDemo) && <DemoDataNotice />}
            {viewMode === "chart" ? (
              <div
                style={{ width: "100%", height: 220 }}
                role="img"
                aria-label={`Mood score chart over ${range.toLowerCase()} period`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={insights.chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line, #e2dacd)" opacity={0.6} />
                    <XAxis dataKey="date" stroke="var(--muted)" fontSize={11} tickLine={false} />
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
                        background: "var(--white, #ffffff)",
                        border: "1px solid var(--line, #e2dacd)",
                        borderRadius: 8,
                        color: "var(--ink, #1a2a24)",
                        fontSize: 12,
                      }}
                      formatter={(val) => [`${val} / 10`, "Mood Score"]}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="var(--primary, #19443c)"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "var(--primary, #19443c)" }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              /* Accessible Table Alternative (WCAG 2.2 AA) */
              <div style={{ overflowX: "auto", maxHeight: 240 }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                    textAlign: "left",
                  }}
                  aria-label={t("tableAriaLabel", "Mood trend data table")}
                >
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--line, #e2dacd)" }}>
                      <th style={{ padding: "8px 6px" }}>{t("date", "Date")}</th>
                      <th style={{ padding: "8px 6px" }}>{t("mood", "Mood")}</th>
                      <th style={{ padding: "8px 6px" }}>{t("score", "Score")}</th>
                      <th style={{ padding: "8px 6px" }}>{t("tags", "Tags")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.chartData.map((row) => (
                      <tr key={row.id} style={{ borderBottom: "1px solid var(--line, #e2dacd)" }}>
                        <td style={{ padding: "8px 6px" }}>
                          {row.fullDate}
                          {row.isDemo && <DemoBadge />}
                        </td>
                        <td style={{ padding: "8px 6px" }}>{row.mood}</td>
                        <td style={{ padding: "8px 6px", fontWeight: 700 }}>{row.score} / 10</td>
                        <td style={{ padding: "8px 6px" }}>
                          {row.tags.length > 0 ? row.tags.join(", ") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Descriptive Insight note (No causal wording, no sleep claim) */}
            <div className="insight" style={{ marginTop: 18 }}>
              <span className="soft-icon mint small">
                <Icon name="sparkles" size={17} />
              </span>
              <p>
                <strong>
                  {insights.tagFrequencies.length > 0
                    ? `Most frequent tag: ${insights.tagFrequencies[0].tag}`
                    : "Logged check-in summary"}
                  :
                </strong>{" "}
                {insights.tagFrequencies.length > 0
                  ? `Logged in ${insights.tagFrequencies[0].count} of ${insights.totalCheckIns} check-ins in this period.`
                  : `${insights.totalCheckIns} check-ins recorded with an average score of ${insights.averageScore} / 10.`}
              </p>
            </div>
          </article>

          {/* Real Emotion Tag Frequencies Panel (Replacing fabricated support bars) */}
          <article className="panel">
            <h3>{t("frequentTags", "Frequent Emotion Tags")}</h3>
            <p className="muted">
              {t("frequentTagsSubtitle", "Most frequently logged emotions in this period")}
            </p>

            {insights.tagFrequencies.length > 0 ? (
              <div className="support-bars">
                {insights.tagFrequencies.map((item) => (
                  <div key={item.tag}>
                    <span>
                      {item.tag}
                      {item.demoCount ? <DemoBadge count={item.demoCount} /> : null}
                    </span>
                    <div
                      className="progress"
                      role="progressbar"
                      aria-valuenow={item.percentage}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${item.tag}: ${item.count} check-ins (${item.percentage}%)`}
                    >
                      <i style={{ width: `${item.percentage}%` }} />
                    </div>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ padding: "20px 0", textAlign: "center" }}>
                {t("noTags", "No emotion tags recorded in this window")}
              </p>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
