import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MoodCheckIn from "./MoodCheckIn";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";
import * as DemoModule from "../auth/demoMode";
import * as MoodsApi from "../../shared/lib/api/moods";
import type { MoodEntry } from "../../shared/lib/api/moods";

function mockMoods(rows: MoodEntry[]) {
  vi.spyOn(MoodsApi, "useMoods").mockReturnValue({
    data: rows,
    isLoading: false,
  } as unknown as ReturnType<typeof MoodsApi.useMoods>);
}

function iso(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 86400000).toISOString();
}

describe("MoodCheckIn demo-row labelling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(false);
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  function renderPage() {
    return render(
      <QueryProvider>
        <I18nProvider>
          <MoodCheckIn />
        </I18nProvider>
      </QueryProvider>,
    );
  }

  it("badges demo rows and shows the notice", () => {
    mockMoods([
      { id: "r", mood: "Good", score: 8, tags: [], created_at: iso(1) },
      { id: "d", mood: "Low", score: 4, tags: [], created_at: iso(2), is_demo: true },
    ]);
    renderPage();
    expect(screen.getByText("Includes demo data")).toBeInTheDocument();
    expect(screen.getAllByTestId("demo-badge")).toHaveLength(1);
  });

  it("shows neither badge nor notice for real rows only", () => {
    mockMoods([{ id: "r", mood: "Good", score: 8, tags: [], created_at: iso(1) }]);
    renderPage();
    expect(screen.queryByTestId("demo-badge")).toBeNull();
    expect(screen.queryByTestId("demo-notice")).toBeNull();
  });
});
