import type { MoodEntry } from "../../shared/lib/api/moods";
import type {
  MoodRange,
  WeekOverWeekResult,
  TagFrequency,
  ChartDataPoint,
  ComputedInsights,
} from "./types";

const DAY_MS = 86400000;

export function formatDateRange(startDate: Date, endDate: Date, locale = "en-IN"): string {
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  const startStr = new Intl.DateTimeFormat(locale, options).format(startDate);
  const endStr = new Intl.DateTimeFormat(locale, options).format(endDate);
  return `${startStr} – ${endStr}`;
}

export function formatShortDate(dateStr: string, locale = "en-IN"): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
}

export function formatFullDate(dateStr: string, locale = "en-IN"): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Computes descriptive insight metrics from mood check-ins.
 * Wording is purely descriptive with zero causal claims ("because", "led to").
 */
export function computeInsights(
  moods: MoodEntry[],
  range: MoodRange = "Week",
  referenceDate: Date = new Date(),
  locale = "en-IN"
): ComputedInsights {
  const nowTime = referenceDate.getTime();
  const windowDays = range === "Week" ? 7 : 30;
  const windowStartTime = nowTime - windowDays * DAY_MS;

  // Filter entries in selected window, sorted oldest to newest for chronological charting
  const windowMoods = moods
    .filter((entry) => {
      const entryTime = new Date(entry.created_at).getTime();
      return entryTime >= windowStartTime && entryTime <= nowTime;
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const startDate = new Date(windowStartTime);
  const dateRangeLabel = formatDateRange(startDate, referenceDate, locale);

  const totalCheckIns = windowMoods.length;
  const hasData = totalCheckIns > 0;

  // Calculate Average Mood Score
  let averageScore: number | null = null;
  if (hasData) {
    const sum = windowMoods.reduce((acc, m) => acc + m.score, 0);
    averageScore = Number((sum / totalCheckIns).toFixed(1));
  }

  // Calculate Week-over-Week Change
  // Rule: Week-over-week change ONLY when both weeks have at least 4 check-ins
  const currentWeekStart = nowTime - 7 * DAY_MS;
  const previousWeekStart = nowTime - 14 * DAY_MS;

  const currentWeekMoods = moods.filter((m) => {
    const t = new Date(m.created_at).getTime();
    return t >= currentWeekStart && t <= nowTime;
  });

  const previousWeekMoods = moods.filter((m) => {
    const t = new Date(m.created_at).getTime();
    return t >= previousWeekStart && t < currentWeekStart;
  });

  let weekOverWeek: WeekOverWeekResult;
  if (currentWeekMoods.length >= 4 && previousWeekMoods.length >= 4) {
    const currentSum = currentWeekMoods.reduce((acc, m) => acc + m.score, 0);
    const previousSum = previousWeekMoods.reduce((acc, m) => acc + m.score, 0);
    const currentAvg = Number((currentSum / currentWeekMoods.length).toFixed(1));
    const previousAvg = Number((previousSum / previousWeekMoods.length).toFixed(1));
    const percentageChange = Math.round(((currentAvg - previousAvg) / previousAvg) * 100);

    let direction: "up" | "down" | "same" = "same";
    if (percentageChange > 0) direction = "up";
    else if (percentageChange < 0) direction = "down";

    weekOverWeek = {
      status: "available",
      currentCount: currentWeekMoods.length,
      previousCount: previousWeekMoods.length,
      currentAvg,
      previousAvg,
      percentageChange,
      direction,
    };
  } else {
    weekOverWeek = {
      status: "not_enough_data",
      currentCount: currentWeekMoods.length,
      previousCount: previousWeekMoods.length,
      reason: "Requires at least 4 check-ins in each week",
    };
  }

  // Calculate Emotion Tag Frequencies from window entries
  const tagCounts: Record<string, number> = {};
  windowMoods.forEach((entry) => {
    (entry.tags || []).forEach((tag) => {
      if (tag && typeof tag === "string") {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    });
  });

  const tagFrequencies: TagFrequency[] = Object.entries(tagCounts)
    .map(([tag, count]) => ({
      tag,
      count,
      percentage: totalCheckIns > 0 ? Math.round((count / totalCheckIns) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  // Map to Chart Data
  const chartData: ChartDataPoint[] = windowMoods.map((entry) => ({
    id: entry.id,
    timestamp: entry.created_at,
    date: formatShortDate(entry.created_at, locale),
    fullDate: formatFullDate(entry.created_at, locale),
    score: entry.score,
    mood: entry.mood,
    tags: entry.tags || [],
  }));

  return {
    range,
    hasData,
    totalCheckIns,
    averageScore,
    dateRangeLabel,
    weekOverWeek,
    chartData,
    tagFrequencies,
  };
}
