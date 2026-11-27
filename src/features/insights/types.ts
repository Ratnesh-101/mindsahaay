export type MoodRange = "Week" | "Month";

export type WeekOverWeekResult =
  | {
      status: "available";
      currentCount: number;
      previousCount: number;
      currentAvg: number;
      previousAvg: number;
      percentageChange: number;
      direction: "up" | "down" | "same";
    }
  | {
      status: "not_enough_data";
      currentCount: number;
      previousCount: number;
      reason: string;
    };

export interface TagFrequency {
  tag: string;
  count: number;
  percentage: number;
  /** Number of the counted check-ins that are labelled sample rows; present only when above 0. */
  demoCount?: number;
}

export interface ChartDataPoint {
  id: string;
  timestamp: string;
  date: string;
  fullDate: string;
  score: number;
  mood: string;
  tags: string[];
  /** Present (true) only for labelled sample rows. */
  isDemo?: boolean;
}

export interface ComputedInsights {
  range: MoodRange;
  hasData: boolean;
  totalCheckIns: number;
  averageScore: number | null;
  dateRangeLabel: string;
  weekOverWeek: WeekOverWeekResult;
  chartData: ChartDataPoint[];
  tagFrequencies: TagFrequency[];
}
