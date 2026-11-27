import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import Insights from "./Insights";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";
import * as DemoModule from "../auth/demoMode";
import type { MoodEntry } from "../../shared/lib/api/moods";

const refDate = new Date("2026-11-20T12:00:00.000Z");
const DAY_MS = 86400000;

function entry(id: string, daysAgo: number, extra: Partial<MoodEntry> = {}): MoodEntry {
  return {
    id,
    mood: "Okay",
    score: 6,
    tags: ["Calm"],
    created_at: new Date(refDate.getTime() - daysAgo * DAY_MS).toISOString(),
    ...extra,
  };
}

function renderInsights(initialMoods: MoodEntry[]) {
  return render(
    <QueryProvider>
      <I18nProvider>
        <Insights referenceDate={refDate} initialMoods={initialMoods} />
      </I18nProvider>
    </QueryProvider>,
  );
}

describe("Insights demo-row labelling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(false);
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it("shows no badge and no notice when no row is demo data", () => {
    renderInsights([entry("a", 1), entry("b", 2)]);
    fireEvent.click(screen.getByRole("tab", { name: /Data Table/i }));
    expect(screen.queryByTestId("demo-badge")).toBeNull();
    expect(screen.queryByTestId("demo-notice")).toBeNull();
  });

  it("badges only the demo rows in the table and shows the notice", () => {
    renderInsights([entry("real", 1), entry("demo1", 2, { is_demo: true }), entry("demo2", 3, { is_demo: true })]);
    expect(screen.getByText("Includes demo data")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Data Table/i }));
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    const badged = rows.filter((r) => within(r).queryByTestId("demo-badge"));
    expect(badged).toHaveLength(2);
  });

  it("shows the number of demo check-ins next to the tag count", () => {
    renderInsights([entry("real", 1), entry("demo1", 2, { is_demo: true })]);
    const tagBar = screen.getByRole("progressbar", { name: /Calm: 2 check-ins/ });
    const row = tagBar.parentElement as HTMLElement;
    expect(within(row).getByTestId("demo-badge")).toHaveTextContent("1 Demo");
  });
});
