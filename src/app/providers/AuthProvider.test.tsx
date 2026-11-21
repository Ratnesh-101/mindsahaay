import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import AuthProvider, { useAuth } from "./AuthProvider";
import { supabase } from "../../shared/lib/supabase";
import { mockSession, mockUser } from "../../shared/lib/api/testMocks";

function TestConsumer() {
  const { user, profile, role, loading, signOut, signInWithEmail, signInWithGoogle } = useAuth();
  return (
    <div>
      <span data-testid="loading">{loading ? "loading" : "ready"}</span>
      <span data-testid="user-email">{user?.email ?? "no-user"}</span>
      <span data-testid="profile-alias">{profile?.alias ?? "no-profile"}</span>
      <span data-testid="role">{role ?? "no-role"}</span>
      <button data-testid="btn-signout" onClick={() => signOut()}>
        Sign Out
      </button>
      <button data-testid="btn-email" onClick={() => signInWithEmail("test@du.ac.in")}>
        Sign In Email
      </button>
      <button data-testid="btn-google" onClick={() => signInWithGoogle()}>
        Sign In Google
      </button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({
      data: {
        subscription: {
          id: "sub-1",
          callback: () => {},
          unsubscribe: vi.fn(),
        },
      },
    });
  });

  it("throws error if useAuth is consumed outside AuthProvider", () => {
    // Suppress console.error during expected throw
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow("useAuth must be used within an AuthProvider");
    consoleSpy.mockRestore();
  });

  it("loads user and profile from active session", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    vi.spyOn(supabase, "from").mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: mockUser.id,
              role: "student",
              alias: "Aarav Singh",
              locale: "en",
            },
            error: null,
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    // Wait for auth to initialize
    expect(await screen.findByText("aarav.singh@du.ac.in")).toBeInTheDocument();
    expect(screen.getByTestId("role")).toHaveTextContent("student");
    expect(screen.getByTestId("profile-alias")).toHaveTextContent("Aarav Singh");
  });

  it("calls supabase.auth.signInWithOtp on signInWithEmail", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    });
    const otpSpy = vi.spyOn(supabase.auth, "signInWithOtp").mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await screen.findByTestId("loading");
    await act(async () => {
      screen.getByTestId("btn-email").click();
    });

    expect(otpSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@du.ac.in",
      }),
    );
  });

  it("calls supabase.auth.signInWithOAuth on signInWithGoogle", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    });
    const oauthSpy = vi.spyOn(supabase.auth, "signInWithOAuth").mockResolvedValue({
      data: { provider: "google", url: "https://auth.google.com" },
      error: null,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await screen.findByTestId("loading");
    await act(async () => {
      screen.getByTestId("btn-google").click();
    });

    expect(oauthSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
      }),
    );
  });

  it("calls supabase.auth.signOut on signOut", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    const signOutSpy = vi.spyOn(supabase.auth, "signOut").mockResolvedValue({
      error: null,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await screen.findByText("aarav.singh@du.ac.in");
    await act(async () => {
      screen.getByTestId("btn-signout").click();
    });

    expect(signOutSpy).toHaveBeenCalledTimes(1);
  });
});
