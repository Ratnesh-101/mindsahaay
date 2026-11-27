import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Dashboard from "./Dashboard";
import * as AuthProviderModule from "../../app/providers/AuthProvider";
import * as DemoModeModule from "../auth/demoMode";
import * as MoodsApi from "../../shared/lib/api/moods";
import * as AssessmentsApi from "../../shared/lib/api/assessments";
import * as DoctorsApi from "../doctors/api";
import * as DemoDataModule from "../demo-data";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";

vi.mock("../followup", () => ({
  FollowUpCard: () => <div data-testid="mock-followup-card">FollowUpCard</div>,
}));

describe("Dashboard Main Screen Component", () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    vi.spyOn(AuthProviderModule, "useAuth").mockReturnValue({
      user: null,
      session: null,
      profile: null,
      role: "student",
      loading: false,
      error: null,
      signInWithEmail: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });

    vi.spyOn(DemoDataModule, "useDemoDataStatus").mockReturnValue({
      hasDemo: false,
      loading: false,
    });

    vi.spyOn(DoctorsApi, "fetchMyAppointments").mockResolvedValue([]);
  });

  function renderDashboard(props: React.ComponentProps<typeof Dashboard> = {}) {
    return render(
      <QueryProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={["/dashboard"]}>
            <Dashboard {...props} />
          </MemoryRouter>
        </I18nProvider>
      </QueryProvider>
    );
  }

  it("renders student greeting and daily mood options in demo mode", () => {
    vi.spyOn(DemoModeModule, "isDemoModeActive").mockReturnValue(true);
    vi.spyOn(DemoModeModule, "getDemoProfile").mockReturnValue({
      id: "demo-id",
      alias: "Aarav",
      role: "student",
      locale: "en",
    });

    renderDashboard();

    expect(screen.getByText(/Good morning, Aarav\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Select mood: Great/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Select mood: Rough/i })).toBeInTheDocument();
  });

  it("saves selected mood via addMood when signed in as real user", async () => {
    vi.spyOn(DemoModeModule, "isDemoModeActive").mockReturnValue(false);
    vi.spyOn(AuthProviderModule, "useAuth").mockReturnValue({
      user: { id: "student-1", email: "student@iitd.ac.in", user_metadata: { name: "Priya" } } as unknown as AuthProviderModule.AuthContextValue["user"],
      session: null,
      profile: { id: "student-1", alias: "Priya", role: "student", locale: "en" },
      role: "student",
      loading: false,
      error: null,
      signInWithEmail: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });

    const addMoodSpy = vi.spyOn(MoodsApi, "addMood").mockResolvedValue({
      id: "mood-new-1",
      student_id: "student-1",
      mood: "Good",
      score: 8,
      tags: ["Daily Check-in"],
      notes: null,
      created_at: new Date().toISOString(),
    });

    renderDashboard();

    const goodBtn = screen.getByRole("button", { name: /Select mood: Good/i });
    fireEvent.click(goodBtn);

    await waitFor(() => {
      expect(addMoodSpy).toHaveBeenCalledWith({
        mood: "Good",
        score: 8,
        tags: ["Daily Check-in"],
      });
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
  });

  it("handles navigation callbacks when go prop is provided", () => {
    const goMock = vi.fn();
    renderDashboard({ go: goMock });

    const checkInBtn = screen.getByRole("button", { name: /Start weekly mental health check-in/i });
    fireEvent.click(checkInBtn);

    expect(goMock).toHaveBeenCalledWith("assessment");
  });

  it("shows clean honest empty state for new account with zero check-ins and none of the old fabricated values", () => {
    vi.spyOn(MoodsApi, "useMoods").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof MoodsApi.useMoods>);

    vi.spyOn(AssessmentsApi, "useAssessments").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof AssessmentsApi.useAssessments>);

    const { container } = renderDashboard();

    // Verify clean honest empty state is shown
    expect(screen.getByTestId("dashboard-empty-state")).toBeInTheDocument();
    expect(screen.getByText(/Welcome to your mindful space/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Log your first check-in/i })).toBeInTheDocument();

    // Verify all old fabricated literals DO NOT appear
    const text = container.textContent || "";
    expect(text).not.toContain("78/100");
    expect(text).not.toContain("24/100");
    expect(text).not.toContain("7h 20m");
    expect(text).not.toContain("3,420 steps");
    expect(text).not.toContain("4-day positive streak");
    expect(text).not.toContain("Keep going");
    expect(text).not.toContain("Dr. Ananya Sharma");
    expect(text).not.toContain("Saved locally");

    // Clicking 'Log your first check-in' focuses the mood selector
    const logBtn = screen.getByRole("button", { name: /Log your first check-in/i });
    fireEvent.click(logBtn);
    const roughBtn = screen.getByRole("button", { name: /Select mood: Rough/i });
    expect(roughBtn).toBeInTheDocument();
  });

  it("computes accurate values and week-over-week trend from fixtures when >= 4 check-ins in both weeks", () => {
    const now = Date.now();
    // 4 check-ins in the current 7 days: scores 8, 8, 8, 8 -> avg 8.0
    const currentWeek: MoodsApi.MoodEntry[] = [
      { id: "c1", mood: "Great", score: 8, tags: [], created_at: new Date(now - 1 * ONE_DAY_MS).toISOString() },
      { id: "c2", mood: "Great", score: 8, tags: [], created_at: new Date(now - 2 * ONE_DAY_MS).toISOString() },
      { id: "c3", mood: "Great", score: 8, tags: [], created_at: new Date(now - 3 * ONE_DAY_MS).toISOString() },
      { id: "c4", mood: "Great", score: 8, tags: [], created_at: new Date(now - 4 * ONE_DAY_MS).toISOString() },
    ];
    // 4 check-ins in the prior week (7-14 days ago): scores 4, 4, 4, 4 -> avg 4.0
    const priorWeek: MoodsApi.MoodEntry[] = [
      { id: "p1", mood: "Low", score: 4, tags: [], created_at: new Date(now - 8 * ONE_DAY_MS).toISOString() },
      { id: "p2", mood: "Low", score: 4, tags: [], created_at: new Date(now - 9 * ONE_DAY_MS).toISOString() },
      { id: "p3", mood: "Low", score: 4, tags: [], created_at: new Date(now - 10 * ONE_DAY_MS).toISOString() },
      { id: "p4", mood: "Low", score: 4, tags: [], created_at: new Date(now - 11 * ONE_DAY_MS).toISOString() },
    ];

    vi.spyOn(MoodsApi, "useMoods").mockReturnValue({
      data: [...currentWeek, ...priorWeek],
      isLoading: false,
    } as unknown as ReturnType<typeof MoodsApi.useMoods>);

    renderDashboard();

    // Average mood (last 7 days) should be 8.0 / 10
    expect(screen.getByText("8.0")).toBeInTheDocument();
    expect(screen.getByText("/10")).toBeInTheDocument();

    // Trend should be calculated: (8.0 - 4.0)/4.0 * 100 = 100%
    expect(screen.getByText("↑ 100% vs prior 7 days")).toBeInTheDocument();

    // Check-ins this week should be 4
    expect(screen.getByText("4")).toBeInTheDocument();

    // Latest check-in should show Great
    expect(screen.getByText("Great", { selector: ".stat-value" })).toBeInTheDocument();
  });

  it("enforces the less-than-4 rule: shows 'Need at least 4 check-ins' instead of percentage trend", () => {
    const now = Date.now();
    // Only 2 check-ins in current week, 2 in prior week (< 4 entries in each)
    const sparseMoods: MoodsApi.MoodEntry[] = [
      { id: "s1", mood: "Good", score: 8, tags: [], created_at: new Date(now - 1 * ONE_DAY_MS).toISOString() },
      { id: "s2", mood: "Okay", score: 6, tags: [], created_at: new Date(now - 2 * ONE_DAY_MS).toISOString() },
      { id: "s3", mood: "Low", score: 4, tags: [], created_at: new Date(now - 9 * ONE_DAY_MS).toISOString() },
    ];

    vi.spyOn(MoodsApi, "useMoods").mockReturnValue({
      data: sparseMoods,
      isLoading: false,
    } as unknown as ReturnType<typeof MoodsApi.useMoods>);

    renderDashboard();

    // Enforces the less-than-4 rule text
    expect(screen.getByText(/Need at least 4 check-ins in both weeks for 7-day trend/i)).toBeInTheDocument();
    // Does NOT render percentage trend
    expect(screen.queryByText(/↑ \d+%/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/↓ \d+%/i)).not.toBeInTheDocument();
  });

  it("handles honest mood save: shows queued notice when offline and successfully queued in outbox", async () => {
    vi.spyOn(DemoModeModule, "isDemoModeActive").mockReturnValue(false);
    vi.spyOn(AuthProviderModule, "useAuth").mockReturnValue({
      user: { id: "student-1", email: "student@du.ac.in" } as unknown as AuthProviderModule.AuthContextValue["user"],
      session: null,
      profile: { id: "student-1", alias: "Priya", role: "student", locale: "en" },
      role: "student",
      loading: false,
      error: null,
      signInWithEmail: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });

    // Simulate browser offline
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    vi.spyOn(MoodsApi, "addMood").mockResolvedValue({
      id: "queued-uuid-123",
      student_id: "student-1",
      mood: "Low",
      score: 4,
      tags: ["Daily Check-in"],
      notes: null,
      created_at: new Date().toISOString(),
    });

    renderDashboard();

    const lowBtn = screen.getByRole("button", { name: /Select mood: Low/i });
    fireEvent.click(lowBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Saved on this device. It will sync when you are back online.")
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Saved locally")).not.toBeInTheDocument();

    // Restore online property
    Object.defineProperty(navigator, "onLine", { value: originalOnline, configurable: true });
  });

  it("handles honest mood save: displays role=alert on failure and retains selection for retry", async () => {
    vi.spyOn(DemoModeModule, "isDemoModeActive").mockReturnValue(false);
    vi.spyOn(AuthProviderModule, "useAuth").mockReturnValue({
      user: { id: "student-1", email: "student@du.ac.in" } as unknown as AuthProviderModule.AuthContextValue["user"],
      session: null,
      profile: { id: "student-1", alias: "Priya", role: "student", locale: "en" },
      role: "student",
      loading: false,
      error: null,
      signInWithEmail: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });

    vi.spyOn(MoodsApi, "addMood").mockRejectedValue(new Error("Supabase insert error"));

    renderDashboard();

    const roughBtn = screen.getByRole("button", { name: /Select mood: Rough/i });
    fireEvent.click(roughBtn);

    await waitFor(
      () => {
        const errorText = screen.getByText("We could not save your check-in. Please try again.");
        expect(errorText).toBeInTheDocument();
        expect(errorText.closest('[role="alert"]')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Selection remains selected so user can retry
    expect(roughBtn).toHaveClass("selected");
    expect(screen.queryByText("Saved locally")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("shows 'Includes demo data' chip when hasDemo is true and hides it when false", () => {
    vi.spyOn(DemoDataModule, "useDemoDataStatus").mockReturnValue({
      hasDemo: true,
      loading: false,
    });

    const { rerender } = renderDashboard();
    expect(screen.getAllByText("Includes demo data").length).toBeGreaterThan(0);

    vi.spyOn(DemoDataModule, "useDemoDataStatus").mockReturnValue({
      hasDemo: false,
      loading: false,
    });

    rerender(
      <QueryProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={["/dashboard"]}>
            <Dashboard />
          </MemoryRouter>
        </I18nProvider>
      </QueryProvider>
    );

    expect(screen.queryByText("Includes demo data")).not.toBeInTheDocument();
  });
});
