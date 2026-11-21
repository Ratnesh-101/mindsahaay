import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DailyMicroHabits from "./DailyMicroHabits";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";
import * as SecureStoreModule from "../../shared/lib/storage/secureStore";
import type { MoodEntry } from "../../shared/lib/api/moods";

describe("DailyMicroHabits Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  function renderDailyMicroHabits(props: React.ComponentProps<typeof DailyMicroHabits> = {}) {
    return render(
      <QueryProvider>
        <I18nProvider>
          <DailyMicroHabits {...props} />
        </I18nProvider>
      </QueryProvider>
    );
  }

  it("starts with habits unticked (0 of 5 completed) and 0% progress", () => {
    renderDailyMicroHabits();

    expect(screen.getByText("0 of 5 Completed")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "0");

    // All habit items are marked not completed
    const morningBtn = screen.getByRole("button", {
      name: /Morning Sunlight & Hydration: Not completed/i,
    });
    expect(morningBtn).toBeInTheDocument();
    expect(morningBtn).not.toHaveClass("done");
  });

  it("has no default streak and does not render punitive streak badges or loss-framing", () => {
    renderDailyMicroHabits();

    // No default "4-Day Streak" or "4" flame badge
    expect(screen.queryByText(/4-Day Streak/i)).toBeNull();
    expect(screen.queryByText(/Streak/i)).toBeNull();
    expect(screen.queryByText(/lose your streak/i)).toBeNull();
    expect(localStorage.getItem("mindsahaay-habit-streak")).toBeNull();
  });

  it("computes non-punitive 'days checked in this fortnight' from real data and hides when 0", () => {
    // Case 1: Zero moods -> badge is hidden
    const { unmount } = renderDailyMicroHabits({ mockMoods: [] });
    expect(screen.queryByText(/checked in this fortnight/i)).toBeNull();
    unmount();

    // Case 2: Mood entries across 3 distinct days in the last fortnight
    const now = Date.now();
    const DAY_MS = 86400000;
    const testMoods: MoodEntry[] = [
      { id: "1", mood: "Good", score: 8, tags: [], created_at: new Date(now - 1 * DAY_MS).toISOString() },
      { id: "2", mood: "Good", score: 8, tags: [], created_at: new Date(now - 2 * DAY_MS).toISOString() },
      { id: "3", mood: "Good", score: 8, tags: [], created_at: new Date(now - 5 * DAY_MS).toISOString() },
    ];

    renderDailyMicroHabits({ mockMoods: testMoods });
    expect(screen.getByText(/3 days checked in this fortnight/i)).toBeInTheDocument();
  });

  it("toggles a habit on click and persists via session storage when vault is locked", async () => {
    vi.spyOn(SecureStoreModule, "isVaultLocked").mockReturnValue(true);

    renderDailyMicroHabits();

    const habitBtn = screen.getByRole("button", {
      name: /Morning Sunlight & Hydration: Not completed/i,
    });
    fireEvent.click(habitBtn);

    // Now completed
    expect(screen.getByText("1 of 5 Completed")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();

    const todayKey = new Date().toISOString().slice(0, 10);
    const sessionSaved = sessionStorage.getItem(`mindsahaay_session_habits_${todayKey}`);
    expect(sessionSaved).not.toBeNull();
    expect(JSON.parse(sessionSaved!)).toEqual(["h1"]);
  });

  it("persists to secure store when vault is unlocked", async () => {
    vi.spyOn(SecureStoreModule, "isVaultLocked").mockReturnValue(false);
    const setSecureItemSpy = vi
      .spyOn(SecureStoreModule, "setSecureItem")
      .mockResolvedValue({ status: "ok" });

    renderDailyMicroHabits();

    const habitBtn = screen.getByRole("button", {
      name: /Academic Pomodoro Stretch: Not completed/i,
    });
    fireEvent.click(habitBtn);

    const todayKey = new Date().toISOString().slice(0, 10);
    expect(setSecureItemSpy).toHaveBeenCalledWith(`habits_${todayKey}`, ["h2"]);
  });

  it("celebrates when all 5 habits are completed without modifying any streaks", async () => {
    renderDailyMicroHabits();

    const buttons = [
      screen.getByRole("button", { name: /Morning Sunlight & Hydration/i }),
      screen.getByRole("button", { name: /Academic Pomodoro Stretch/i }),
      screen.getByRole("button", { name: /4-7-8 Mindful Breath Reset/i }),
      screen.getByRole("button", { name: /Campus Peer Check-in/i }),
      screen.getByRole("button", { name: /Digital Sunset Wind-Down/i }),
    ];

    buttons.forEach((btn) => fireEvent.click(btn));

    await waitFor(() => {
      expect(screen.getByText("5 of 5 Completed")).toBeInTheDocument();
      expect(screen.getByText("100%")).toBeInTheDocument();
      expect(screen.getByText("Daily Balance Unlocked!")).toBeInTheDocument();
      expect(
        screen.getByText(/You prioritized every dimension of your mind today/i)
      ).toBeInTheDocument();
    });

    // Confirms NO streak was set or incremented
    expect(localStorage.getItem("mindsahaay-habit-streak")).toBeNull();
  });
});
