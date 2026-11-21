import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Dashboard from "./Dashboard";
import * as AuthProviderModule from "../../app/providers/AuthProvider";
import * as DemoModeModule from "../auth/demoMode";
import * as MoodsApi from "../../shared/lib/api/moods";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";

vi.mock("../followup", () => ({
  FollowUpCard: () => <div data-testid="mock-followup-card">FollowUpCard</div>,
}));

describe("Dashboard Main Screen Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
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
    });
  });

  it("handles navigation callbacks when go prop is provided", () => {
    const goMock = vi.fn();
    renderDashboard({ go: goMock });

    const checkInBtn = screen.getByRole("button", { name: /Start weekly mental health check-in/i });
    fireEvent.click(checkInBtn);

    expect(goMock).toHaveBeenCalledWith("assessment");
  });
});
