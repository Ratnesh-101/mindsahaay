import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Settings from "./Settings";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";
import * as AuthModule from "../../app/providers/AuthProvider";
import * as DemoModule from "../auth/demoMode";
import type { User } from "@supabase/supabase-js";

describe("Settings mounts the demo data card", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(true);
    const user = { id: "u", email: "s@du.ac.in" } as User;
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user,
      session: null,
      profile: { id: "u", role: "student", alias: "Aarav", locale: "en" },
      role: "student",
      loading: false,
      error: null,
      signInWithEmail: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    } as unknown as ReturnType<typeof AuthModule.useAuth>);
  });

  it("renders a Demo data heading in Settings and creates nothing by itself", () => {
    render(
      <QueryProvider>
        <I18nProvider>
          <MemoryRouter>
            <Settings />
          </MemoryRouter>
        </I18nProvider>
      </QueryProvider>,
    );
    expect(screen.getByRole("heading", { name: "Demo data" })).toBeInTheDocument();
    // Offline preview: honest note, no load button.
    expect(screen.getByText("This preview already uses sample data")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load demo data/i })).toBeNull();
  });
});
