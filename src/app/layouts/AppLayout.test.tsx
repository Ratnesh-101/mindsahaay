import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import AppLayout from "./AppLayout";
import * as AuthProviderModule from "../providers/AuthProvider";
import * as DemoModeModule from "../../features/auth/demoMode";
import * as OfflineModule from "../../shared/lib/offline";
import * as ChatApiModule from "../../features/chat/api";

vi.mock("../../audio/EnhancedAudioEngine", () => ({
  audioEngine: {
    startRain: vi.fn(),
    startSingingBowl: vi.fn(),
    stop: vi.fn(),
  },
}));

describe("AppLayout Shell & Offline Wiring Contract", () => {
  const stopOutboxMock = vi.fn();
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    stopOutboxMock.mockClear();

    addEventListenerSpy = vi.spyOn(window, "addEventListener");
    removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    vi.spyOn(OfflineModule, "initOutbox").mockReturnValue(stopOutboxMock);
    vi.spyOn(ChatApiModule, "warmCrisisConsentCache").mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("starts the outbox and warms consent cache for a signed-in user, and cleans up on unmount", () => {
    vi.spyOn(DemoModeModule, "isDemoModeActive").mockReturnValue(false);
    vi.spyOn(AuthProviderModule, "useAuth").mockReturnValue({
      user: { id: "student-user-999", email: "student@du.ac.in" } as unknown as AuthProviderModule.AuthContextValue["user"],
      session: null,
      profile: { id: "student-user-999", alias: "Priya", role: "student", locale: "en" },
      role: "student",
      loading: false,
      error: null,
      signInWithEmail: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppLayout />
      </MemoryRouter>
    );

    // Verifies initOutbox was called with the student's ID
    expect(OfflineModule.initOutbox).toHaveBeenCalledWith("student-user-999");

    // Verifies warmCrisisConsentCache was called
    expect(ChatApiModule.warmCrisisConsentCache).toHaveBeenCalled();

    // Verifies window.addEventListener("online", ...) was called
    expect(addEventListenerSpy).toHaveBeenCalledWith("online", expect.any(Function));

    // When unmounted, cleans up listener and stops the outbox
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(stopOutboxMock).toHaveBeenCalled();
  });

  it("does nothing for demo mode (does not start outbox or warm consent cache)", () => {
    vi.spyOn(DemoModeModule, "isDemoModeActive").mockReturnValue(true);
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

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppLayout />
      </MemoryRouter>
    );

    // AppLayout outbox effect must NOT run when user is null (demo mode)
    expect(OfflineModule.initOutbox).not.toHaveBeenCalled();
    expect(ChatApiModule.warmCrisisConsentCache).not.toHaveBeenCalled();
  });

  it("renders WCAG skip link and application layout shell", () => {
    vi.spyOn(DemoModeModule, "isDemoModeActive").mockReturnValue(true);
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

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppLayout />
      </MemoryRouter>
    );

    expect(screen.getByText("Skip to main content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");
  });
});
