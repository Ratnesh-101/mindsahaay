import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Insights from "./Insights";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";
import * as DemoModule from "../auth/demoMode";
import type { MoodEntry } from "../../shared/lib/api/moods";

describe("Insights Component - Honesty and Accessibility", () => {
  const refDate = new Date("2026-11-20T12:00:00.000Z");
  const DAY_MS = 86400000;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(false);

    // Mock ResizeObserver for Recharts in JSDOM
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  function renderInsights(props: React.ComponentProps<typeof Insights> = {}) {
    return render(
      <QueryProvider>
        <I18nProvider>
          <Insights referenceDate={refDate} {...props} />
        </I18nProvider>
      </QueryProvider>
    );
  }

  it("renders honest empty state when there are zero check-ins", () => {
    renderInsights({ initialMoods: [] });

    expect(
      screen.getByText("Log a few check-ins to see your trends")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /As you record your daily moods and tags, your personal patterns and averages will appear here\./i
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Log a check-in/i })).toHaveAttribute(
      "href",
      "/mood"
    );

    // Fabricated strings must NOT exist in empty state
    expect(screen.queryByText(/18%/i)).toBeNull();
    expect(screen.queryByText(/June 2025/i)).toBeNull();
    expect(screen.queryByText(/88%/i)).toBeNull();
  });

  it("renders enough-data state with exact computed numbers from fixtures", () => {
    const fixtureMoods: MoodEntry[] = [
      {
        id: "m1",
        mood: "Good",
        score: 8,
        tags: ["Calm"],
        notes: "Restful evening",
        created_at: new Date(refDate.getTime() - 1 * DAY_MS).toISOString(),
      },
      {
        id: "m2",
        mood: "Okay",
        score: 6,
        tags: ["Focused"],
        notes: "Study session",
        created_at: new Date(refDate.getTime() - 2 * DAY_MS).toISOString(),
      },
      {
        id: "m3",
        mood: "Good",
        score: 7,
        tags: ["Calm", "Focused"],
        notes: "Group discussion",
        created_at: new Date(refDate.getTime() - 3 * DAY_MS).toISOString(),
      },
      {
        id: "m4",
        mood: "Great",
        score: 9,
        tags: ["Grateful"],
        notes: "Campus walk",
        created_at: new Date(refDate.getTime() - 4 * DAY_MS).toISOString(),
      },
      {
        id: "m5",
        mood: "Good",
        score: 8,
        tags: ["Calm"],
        notes: "Good sleep",
        created_at: new Date(refDate.getTime() - 5 * DAY_MS).toISOString(),
      },
    ];

    renderInsights({ initialMoods: fixtureMoods });

    // Check-in count: 5 check-ins logged
    expect(screen.getByText(/5 check-ins logged/i)).toBeInTheDocument();

    // Average score: (8 + 6 + 7 + 9 + 8) / 5 = 38 / 5 = 7.6
    expect(screen.getByText(/Average mood score: 7\.6 \/ 10/i)).toBeInTheDocument();

    // Emotion tags: Calm (3), Focused (2), Grateful (1)
    expect(screen.getByText("Calm")).toBeInTheDocument();
    expect(screen.getByText("Focused")).toBeInTheDocument();
    expect(screen.getByText("Grateful")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("enforces the less-than-4-check-ins rule for weekly comparison", () => {
    // Current week has 3 entries (< 4)
    const partialMoods: MoodEntry[] = [
      {
        id: "c1",
        mood: "Good",
        score: 8,
        tags: ["Calm"],
        created_at: new Date(refDate.getTime() - 1 * DAY_MS).toISOString(),
      },
      {
        id: "c2",
        mood: "Good",
        score: 8,
        tags: ["Calm"],
        created_at: new Date(refDate.getTime() - 2 * DAY_MS).toISOString(),
      },
      {
        id: "c3",
        mood: "Good",
        score: 8,
        tags: ["Calm"],
        created_at: new Date(refDate.getTime() - 3 * DAY_MS).toISOString(),
      },
    ];

    renderInsights({ initialMoods: partialMoods });

    expect(
      screen.getByText(
        /Not enough data for weekly comparison \(requires at least 4 check-ins in each week\)/i
      )
    ).toBeInTheDocument();

    // Should NOT show any percentage indicator for weekly change
    expect(screen.queryByText(/↑/)).toBeNull();
    expect(screen.queryByText(/↓/)).toBeNull();
  });

  it("displays week-over-week percentage change when both weeks have at least 4 check-ins", () => {
    // Current week (4 entries avg 8.0), previous week (4 entries avg 6.0) -> +33%
    const fullMoods: MoodEntry[] = [
      // Current week (4)
      { id: "c1", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 1 * DAY_MS).toISOString() },
      { id: "c2", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 2 * DAY_MS).toISOString() },
      { id: "c3", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 3 * DAY_MS).toISOString() },
      { id: "c4", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 4 * DAY_MS).toISOString() },
      // Previous week (4)
      { id: "p1", mood: "Okay", score: 6, tags: ["Focused"], created_at: new Date(refDate.getTime() - 8 * DAY_MS).toISOString() },
      { id: "p2", mood: "Okay", score: 6, tags: ["Focused"], created_at: new Date(refDate.getTime() - 9 * DAY_MS).toISOString() },
      { id: "p3", mood: "Okay", score: 6, tags: ["Focused"], created_at: new Date(refDate.getTime() - 10 * DAY_MS).toISOString() },
      { id: "p4", mood: "Okay", score: 6, tags: ["Focused"], created_at: new Date(refDate.getTime() - 11 * DAY_MS).toISOString() },
    ];

    renderInsights({ initialMoods: fullMoods });

    expect(screen.getByText(/↑ 33% compared to previous week/i)).toBeInTheDocument();
  });

  it("displays week-over-week downward and flat percentage changes", () => {
    // Current week lower than previous week (current: 6, prev: 8 -> -25%)
    const downMoods: MoodEntry[] = [
      { id: "cd1", mood: "Okay", score: 6, tags: ["Tired"], created_at: new Date(refDate.getTime() - 1 * DAY_MS).toISOString() },
      { id: "cd2", mood: "Okay", score: 6, tags: ["Tired"], created_at: new Date(refDate.getTime() - 2 * DAY_MS).toISOString() },
      { id: "cd3", mood: "Okay", score: 6, tags: ["Tired"], created_at: new Date(refDate.getTime() - 3 * DAY_MS).toISOString() },
      { id: "cd4", mood: "Okay", score: 6, tags: ["Tired"], created_at: new Date(refDate.getTime() - 4 * DAY_MS).toISOString() },
      { id: "pd1", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 8 * DAY_MS).toISOString() },
      { id: "pd2", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 9 * DAY_MS).toISOString() },
      { id: "pd3", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 10 * DAY_MS).toISOString() },
      { id: "pd4", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 11 * DAY_MS).toISOString() },
    ];

    const { rerender } = renderInsights({ initialMoods: downMoods });
    expect(screen.getByText(/↓ 25% compared to previous week/i)).toBeInTheDocument();

    // Equal weeks -> No change
    const sameMoods: MoodEntry[] = [
      { id: "cs1", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 1 * DAY_MS).toISOString() },
      { id: "cs2", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 2 * DAY_MS).toISOString() },
      { id: "cs3", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 3 * DAY_MS).toISOString() },
      { id: "cs4", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 4 * DAY_MS).toISOString() },
      { id: "ps1", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 8 * DAY_MS).toISOString() },
      { id: "ps2", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 9 * DAY_MS).toISOString() },
      { id: "ps3", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 10 * DAY_MS).toISOString() },
      { id: "ps4", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 11 * DAY_MS).toISOString() },
    ];

    rerender(
      <QueryProvider>
        <I18nProvider>
          <Insights referenceDate={refDate} initialMoods={sameMoods} />
        </I18nProvider>
      </QueryProvider>
    );
    expect(screen.getByText(/No change compared to previous week/i)).toBeInTheDocument();
  });

  it("asserts that fabricated literals never appear in the DOM", () => {
    // Render with multiple check-ins
    const fixtureMoods: MoodEntry[] = [
      { id: "m1", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 1 * DAY_MS).toISOString() },
      { id: "m2", mood: "Okay", score: 6, tags: ["Focused"], created_at: new Date(refDate.getTime() - 2 * DAY_MS).toISOString() },
    ];

    renderInsights({ initialMoods: fixtureMoods });

    // Old fabricated claims MUST NOT appear anywhere
    expect(screen.queryByText(/18%/)).toBeNull();
    expect(screen.queryByText(/June 2025/)).toBeNull();
    expect(screen.queryByText(/88%/)).toBeNull();
    expect(screen.queryByText(/On days with 7\+ hours of sleep/i)).toBeNull();
    expect(screen.queryByText(/Quality sleep \(7h\+\)/i)).toBeNull();
    expect(screen.queryByText(/because/i)).toBeNull();
    expect(screen.queryByText(/led to/i)).toBeNull();
  });

  it("supports accessible data table alternative toggling (WCAG 2.2 AA)", () => {
    const fixtureMoods: MoodEntry[] = [
      { id: "m1", mood: "Good", score: 8, tags: ["Calm"], created_at: new Date(refDate.getTime() - 1 * DAY_MS).toISOString() },
    ];

    renderInsights({ initialMoods: fixtureMoods });

    const tableTab = screen.getByRole("tab", { name: /Data Table/i });
    fireEvent.click(tableTab);

    // Table is visible with accessible headers
    expect(screen.getByRole("table", { name: /Mood trend data table/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Date" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Mood" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Score" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Tags" })).toBeInTheDocument();
    expect(screen.getByText("8 / 10")).toBeInTheDocument();
  });

  it("renders labeled demo data notice when demo mode is active", () => {
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(true);

    renderInsights(); // No initialMoods, triggers demo fallback

    expect(screen.getByTestId("demo-data-badge")).toBeInTheDocument();
    expect(screen.getByText(/Demo data/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Viewing sample demonstration check-ins/i)
    ).toBeInTheDocument();
  });
});
