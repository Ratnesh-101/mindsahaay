import { describe, it, expect } from "vitest";
import { computeInsights } from "./computeInsights";
import type { MoodEntry } from "../../shared/lib/api/moods";

describe("computeInsights math and honesty rules", () => {
  const refDate = new Date("2026-11-20T12:00:00.000Z");
  const DAY_MS = 86400000;

  it("handles empty moods list with honest empty state", () => {
    const res = computeInsights([], "Week", refDate);
    expect(res.hasData).toBe(false);
    expect(res.totalCheckIns).toBe(0);
    expect(res.averageScore).toBeNull();
    expect(res.weekOverWeek.status).toBe("not_enough_data");
    expect(res.tagFrequencies).toEqual([]);
    expect(res.chartData).toEqual([]);
  });

  it("computes exact average score and check-in count from fixture entries", () => {
    const fixtureMoods: MoodEntry[] = [
      { id: "1", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 1 * DAY_MS).toISOString() },
      { id: "2", mood: "Okay", score: 6, tags: ["Focused"], created_at: new Date(refDate.getTime() - 2 * DAY_MS).toISOString() },
      { id: "3", mood: "Good", score: 7, tags: ["Calm", "Focused"], created_at: new Date(refDate.getTime() - 3 * DAY_MS).toISOString() },
      { id: "4", mood: "Great", score: 9, tags: ["Grateful"], created_at: new Date(refDate.getTime() - 4 * DAY_MS).toISOString() },
    ];

    const res = computeInsights(fixtureMoods, "Week", refDate);
    expect(res.hasData).toBe(true);
    expect(res.totalCheckIns).toBe(4);
    // (8 + 6 + 7 + 9) / 4 = 30 / 4 = 7.5
    expect(res.averageScore).toBe(7.5);
    expect(res.chartData).toHaveLength(4);

    // Tags: Calm (2), Focused (2), Grateful (1)
    expect(res.tagFrequencies).toEqual([
      { tag: "Calm", count: 2, percentage: 50 },
      { tag: "Focused", count: 2, percentage: 50 },
      { tag: "Grateful", count: 1, percentage: 25 },
    ]);
  });

  it("enforces the < 4 check-ins rule for week-over-week comparison (current week < 4)", () => {
    // Current week has 3 entries, previous week has 4 entries
    const moods: MoodEntry[] = [
      // Current week (3)
      { id: "c1", mood: "Good", score: 8, tags: [], created_at: new Date(refDate.getTime() - 1 * DAY_MS).toISOString() },
      { id: "c2", mood: "Good", score: 8, tags: [], created_at: new Date(refDate.getTime() - 2 * DAY_MS).toISOString() },
      { id: "c3", mood: "Good", score: 8, tags: [], created_at: new Date(refDate.getTime() - 3 * DAY_MS).toISOString() },
      // Previous week (4)
      { id: "p1", mood: "Okay", score: 6, tags: [], created_at: new Date(refDate.getTime() - 8 * DAY_MS).toISOString() },
      { id: "p2", mood: "Okay", score: 6, tags: [], created_at: new Date(refDate.getTime() - 9 * DAY_MS).toISOString() },
      { id: "p3", mood: "Okay", score: 6, tags: [], created_at: new Date(refDate.getTime() - 10 * DAY_MS).toISOString() },
      { id: "p4", mood: "Okay", score: 6, tags: [], created_at: new Date(refDate.getTime() - 11 * DAY_MS).toISOString() },
    ];

    const res = computeInsights(moods, "Week", refDate);
    expect(res.weekOverWeek.status).toBe("not_enough_data");
    if (res.weekOverWeek.status === "not_enough_data") {
      expect(res.weekOverWeek.currentCount).toBe(3);
      expect(res.weekOverWeek.previousCount).toBe(4);
    }
  });

  it("enforces the < 4 check-ins rule for week-over-week comparison (previous week < 4)", () => {
    // Current week has 4 entries, previous week has 3 entries
    const moods: MoodEntry[] = [
      // Current week (4)
      { id: "c1", mood: "Good", score: 8, tags: [], created_at: new Date(refDate.getTime() - 1 * DAY_MS).toISOString() },
      { id: "c2", mood: "Good", score: 8, tags: [], created_at: new Date(refDate.getTime() - 2 * DAY_MS).toISOString() },
      { id: "c3", mood: "Good", score: 8, tags: [], created_at: new Date(refDate.getTime() - 3 * DAY_MS).toISOString() },
      { id: "c4", mood: "Good", score: 8, tags: [], created_at: new Date(refDate.getTime() - 4 * DAY_MS).toISOString() },
      // Previous week (3)
      { id: "p1", mood: "Okay", score: 6, tags: [], created_at: new Date(refDate.getTime() - 8 * DAY_MS).toISOString() },
      { id: "p2", mood: "Okay", score: 6, tags: [], created_at: new Date(refDate.getTime() - 9 * DAY_MS).toISOString() },
      { id: "p3", mood: "Okay", score: 6, tags: [], created_at: new Date(refDate.getTime() - 10 * DAY_MS).toISOString() },
    ];

    const res = computeInsights(moods, "Week", refDate);
    expect(res.weekOverWeek.status).toBe("not_enough_data");
    if (res.weekOverWeek.status === "not_enough_data") {
      expect(res.weekOverWeek.currentCount).toBe(4);
      expect(res.weekOverWeek.previousCount).toBe(3);
    }
  });

  it("calculates exact week-over-week percentage change when both weeks have >= 4 check-ins", () => {
    // Current week: 4 entries, all score 8 (avg 8.0)
    // Previous week: 4 entries, all score 6 (avg 6.0)
    // Change: ((8 - 6) / 6) * 100 = 33.33% -> 33% up
    const moods: MoodEntry[] = [
      // Current week (4)
      { id: "c1", mood: "Good", score: 8, tags: [], created_at: new Date(refDate.getTime() - 1 * DAY_MS).toISOString() },
      { id: "c2", mood: "Good", score: 8, tags: [], created_at: new Date(refDate.getTime() - 2 * DAY_MS).toISOString() },
      { id: "c3", mood: "Good", score: 8, tags: [], created_at: new Date(refDate.getTime() - 3 * DAY_MS).toISOString() },
      { id: "c4", mood: "Good", score: 8, tags: [], created_at: new Date(refDate.getTime() - 4 * DAY_MS).toISOString() },
      // Previous week (4)
      { id: "p1", mood: "Okay", score: 6, tags: [], created_at: new Date(refDate.getTime() - 8 * DAY_MS).toISOString() },
      { id: "p2", mood: "Okay", score: 6, tags: [], created_at: new Date(refDate.getTime() - 9 * DAY_MS).toISOString() },
      { id: "p3", mood: "Okay", score: 6, tags: [], created_at: new Date(refDate.getTime() - 10 * DAY_MS).toISOString() },
      { id: "p4", mood: "Okay", score: 6, tags: [], created_at: new Date(refDate.getTime() - 11 * DAY_MS).toISOString() },
    ];

    const res = computeInsights(moods, "Week", refDate);
    expect(res.weekOverWeek.status).toBe("available");
    if (res.weekOverWeek.status === "available") {
      expect(res.weekOverWeek.currentAvg).toBe(8);
      expect(res.weekOverWeek.previousAvg).toBe(6);
      expect(res.weekOverWeek.percentageChange).toBe(33);
      expect(res.weekOverWeek.direction).toBe("up");
    }
  });

  it("filters correctly between Week (7 days) and Month (30 days)", () => {
    const moods: MoodEntry[] = [
      { id: "1", mood: "Good", score: 8, tags: [], created_at: new Date(refDate.getTime() - 2 * DAY_MS).toISOString() },
      { id: "2", mood: "Okay", score: 6, tags: [], created_at: new Date(refDate.getTime() - 15 * DAY_MS).toISOString() },
      { id: "3", mood: "Low", score: 4, tags: [], created_at: new Date(refDate.getTime() - 45 * DAY_MS).toISOString() }, // Out of month
    ];

    const weekRes = computeInsights(moods, "Week", refDate);
    expect(weekRes.totalCheckIns).toBe(1);

    const monthRes = computeInsights(moods, "Month", refDate);
    expect(monthRes.totalCheckIns).toBe(2);
  });
});
