import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import Login from "./Login";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";
import * as AuthModule from "../../app/providers/AuthProvider";

describe("Login Authentication & Demo Mode", () => {
  const signInWithEmailMock = vi.fn();
  const signInWithGoogleMock = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    signInWithEmailMock.mockReset();
    signInWithGoogleMock.mockReset();

    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: null,
      session: null,
      profile: null,
      role: null,
      loading: false,
      error: null,
      signInWithEmail: signInWithEmailMock,
      signInWithGoogle: signInWithGoogleMock,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });
  });

  function renderLogin() {
    return render(
      <QueryProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={["/login"]}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<div>Dashboard Landed</div>} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryProvider>
    );
  }

  it("renders Google SSO, email magic link input, and Demo Mode button", () => {
    renderLogin();

    expect(screen.getByRole("button", { name: /Google/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/University or Personal Email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enter Demo as Student \(Aarav\)/i })).toBeInTheDocument();
  });

  it("submits magic link request via Supabase Auth", async () => {
    signInWithEmailMock.mockResolvedValue({ error: null });
    renderLogin();

    const emailInput = screen.getByLabelText(/University or Personal Email/i);
    fireEvent.change(emailInput, { target: { value: "student@du.ac.in" } });

    const submitBtn = screen.getByRole("button", { name: /Send Passwordless Magic Link/i });
    fireEvent.click(submitBtn);

    expect(signInWithEmailMock).toHaveBeenCalledWith("student@du.ac.in");

    await waitFor(() => {
      expect(screen.getByText(/Magic Login Link Sent!/i)).toBeInTheDocument();
    });
  });

  it("triggers Google SSO via Supabase Auth", async () => {
    signInWithGoogleMock.mockResolvedValue({ error: null });
    renderLogin();

    const googleBtn = screen.getByRole("button", { name: /Google/i });
    fireEvent.click(googleBtn);

    expect(signInWithGoogleMock).toHaveBeenCalled();
  });

  it("activates Demo Mode and navigates to dashboard on demo button click", async () => {
    renderLogin();

    const demoBtn = screen.getByRole("button", { name: /Enter Demo as Student \(Aarav\)/i });
    fireEvent.click(demoBtn);

    await waitFor(() => {
      expect(screen.getByText("Dashboard Landed")).toBeInTheDocument();
    });

    expect(localStorage.getItem("mindsahaay_demo_mode")).toBe("true");
  });

  it("opens demo role picker and allows selecting counsellor role", async () => {
    renderLogin();

    const moreRolesBtn = screen.getByRole("button", { name: /More Roles…/i });
    fireEvent.click(moreRolesBtn);

    expect(screen.getByText("Choose Demo Identity")).toBeInTheDocument();

    const counsellorRoleBtn = screen.getByRole("button", { name: /Dr. Ananya Sharma \(Counsellor\)/i });
    fireEvent.click(counsellorRoleBtn);
    expect(localStorage.getItem("mindsahaay_demo_role")).toBe("counsellor");
  });

  it("allows selecting moderator in demo role picker", () => {
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: /More Roles…/i }));
    const moderatorRoleBtn = screen.getByRole("button", { name: /Rohan Verma \(Community Moderator\)/i });
    fireEvent.click(moderatorRoleBtn);
    expect(localStorage.getItem("mindsahaay_demo_role")).toBe("moderator");
  });

  it("allows selecting institution admin in demo role picker", () => {
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: /More Roles…/i }));
    const adminRoleBtn = screen.getByRole("button", { name: /Dean of Student Welfare \(Administrator\)/i });
    fireEvent.click(adminRoleBtn);
    expect(localStorage.getItem("mindsahaay_demo_role")).toBe("institution_admin");
  });
});
