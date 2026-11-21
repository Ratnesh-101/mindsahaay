import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import ProtectedRoute from "./ProtectedRoute";
import * as AuthModule from "../../app/providers/AuthProvider";
import * as DemoModule from "./demoMode";
import type { User } from "@supabase/supabase-js";

describe("ProtectedRoute Guard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("redirects unauthenticated users to /login", () => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: null,
      session: null,
      profile: null,
      role: null,
      loading: false,
      error: null,
      signInWithEmail: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/login" element={<div>Login Page Screen</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Private Dashboard Screen</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login Page Screen")).toBeInTheDocument();
    expect(screen.queryByText("Private Dashboard Screen")).not.toBeInTheDocument();
  });

  it("allows authenticated student to access protected route", () => {
    const mockUser = { id: "user-1", email: "student@du.ac.in" } as User;
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: mockUser,
      session: { access_token: "tok", refresh_token: "ref", expires_in: 3600, token_type: "bearer", user: mockUser },
      profile: { id: "user-1", role: "student", alias: "Aarav", locale: "en" },
      role: "student",
      loading: false,
      error: null,
      signInWithEmail: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Private Dashboard Screen</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Private Dashboard Screen")).toBeInTheDocument();
  });

  it("blocks student role from accessing counsellor-only route with 403 message", () => {
    const mockUser = { id: "user-1", email: "student@du.ac.in" } as User;
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: mockUser,
      session: { access_token: "tok", refresh_token: "ref", expires_in: 3600, token_type: "bearer", user: mockUser },
      profile: { id: "user-1", role: "student", alias: "Aarav", locale: "en" },
      role: "student",
      loading: false,
      error: null,
      signInWithEmail: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={["/counsellor"]}>
        <Routes>
          <Route
            path="/counsellor"
            element={
              <ProtectedRoute allowedRoles={["counsellor"]}>
                <div>Counsellor Portal Queue</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Role Permission Required")).toBeInTheDocument();
    expect(screen.getByText(/This area requires one of/i)).toBeInTheDocument();
    expect(screen.getByText("counsellor")).toBeInTheDocument();
    expect(screen.queryByText("Counsellor Portal Queue")).not.toBeInTheDocument();
  });

  it("permits counsellor role to access counsellor-guarded route", () => {
    const mockCounsellor = { id: "couns-1", email: "ananya@du.ac.in" } as User;
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: mockCounsellor,
      session: { access_token: "tok", refresh_token: "ref", expires_in: 3600, token_type: "bearer", user: mockCounsellor },
      profile: { id: "couns-1", role: "counsellor", alias: "Dr. Ananya", locale: "en" },
      role: "counsellor",
      loading: false,
      error: null,
      signInWithEmail: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={["/counsellor"]}>
        <Routes>
          <Route
            path="/counsellor"
            element={
              <ProtectedRoute allowedRoles={["counsellor"]}>
                <div>Counsellor Portal Queue</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Counsellor Portal Queue")).toBeInTheDocument();
  });

  it("allows access in Demo Mode even without live Supabase session", () => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: null,
      session: null,
      profile: null,
      role: null,
      loading: false,
      error: null,
      signInWithEmail: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(true);
    vi.spyOn(DemoModule, "getDemoRole").mockReturnValue("student");

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Offline Demo Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Offline Demo Dashboard")).toBeInTheDocument();
  });
});
