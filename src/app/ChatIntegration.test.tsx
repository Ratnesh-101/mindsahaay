import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { ChatRoute, DoctorsRoute, JournalRoute } from "./routes";
import QueryProvider from "./providers/QueryProvider";
import I18nProvider from "./providers/I18nProvider";
import * as AuthModule from "./providers/AuthProvider";
import * as DemoModule from "../features/auth/demoMode";
import type { User } from "@supabase/supabase-js";

// Mock the chat stream to render chip buttons immediately
vi.mock("../shared/lib/api/chat", () => ({
  useChatStream: () => ({
    messages: [],
    isStreaming: false,
    isDegraded: false,
    isCrisis: false,
    error: null,
    sendMessage: vi.fn(),
    clearChat: vi.fn(),
  }),
}));

describe("Chat Chip Callbacks & Route Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(true);

    const mockUser = { id: "user-test-uuid", email: "student@du.ac.in" } as User;
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: mockUser,
      session: null,
      profile: { id: "user-test-uuid", role: "student", alias: "Aarav", locale: "en" },
      role: "student",
      loading: false,
      error: null,
      signInWithEmail: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });
  });

  function renderWithRouter(initialEntry: string) {
    return render(
      <QueryProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route path="/chat" element={<ChatRoute />} />
              <Route path="/crisis" element={<div>Safety Plan Editor Landed</div>} />
              <Route path="/doctors" element={<div>Doctors Directory Landed</div>} />
              <Route path="/journal" element={<JournalRoute />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryProvider>
    );
  }

  it("opens the BreathingModal when the breathing exercise chip is clicked", async () => {
    renderWithRouter("/chat");

    // The suggested chips in Chat: breathing, safety plan, booking
    const breathingChip = await screen.findByRole("button", { name: /breathing/i });
    expect(breathingChip).toBeInTheDocument();

    fireEvent.click(breathingChip);

    // Modal opens with 4-7-8 breathing exercise
    expect(await screen.findByRole("dialog", { name: /4-7-8/i })).toBeInTheDocument();
  });

  it("navigates to the Safety Plan editor (/crisis) when safety plan chip is clicked", async () => {
    renderWithRouter("/chat");

    const safetyPlanChip = await screen.findByRole("button", { name: /safety plan/i });
    expect(safetyPlanChip).toBeInTheDocument();

    fireEvent.click(safetyPlanChip);

    expect(await screen.findByText("Safety Plan Editor Landed")).toBeInTheDocument();
  });

  it("navigates to the Counsellor booking route (/doctors) when booking chip is clicked", async () => {
    renderWithRouter("/chat");

    const bookingChip = await screen.findByRole("button", { name: /suggest booking/i });
    expect(bookingChip).toBeInTheDocument();

    fireEvent.click(bookingChip);

    expect(await screen.findByText("Doctors Directory Landed")).toBeInTheDocument();
  });

  it("renders a clear demo data state without errors for Doctors and Journal in demo mode without session", async () => {
    // Test Doctors demo state
    const { unmount } = render(
      <QueryProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={["/doctors"]}>
            <Routes>
              <Route path="/doctors" element={<DoctorsRoute />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryProvider>
    );

    expect(await screen.findByTestId("demo-data-notice")).toBeInTheDocument();
    expect(screen.getByText(/simulated consultation slots/i)).toBeInTheDocument();

    unmount();

    // Test Journal demo state
    render(
      <QueryProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={["/journal"]}>
            <Routes>
              <Route path="/journal" element={<JournalRoute />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryProvider>
    );

    expect(await screen.findByTestId("demo-data-notice")).toBeInTheDocument();
    expect(screen.getByText(/viewing offline demo journal entries/i)).toBeInTheDocument();
  });
});
