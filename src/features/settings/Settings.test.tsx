import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import Settings from "./Settings";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";
import * as AuthModule from "../../app/providers/AuthProvider";
import * as DemoModule from "../auth/demoMode";
import * as AccountApiModule from "../../shared/lib/api/account";
import * as SecureStoreModule from "../../shared/lib/storage/secureStore";
import type { User } from "@supabase/supabase-js";

describe("Settings & Student Rights", () => {
  const mockSignOut = vi.fn().mockResolvedValue({ error: null });

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(true);

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
      signOut: mockSignOut,
      refreshProfile: vi.fn(),
    });
  });

  function renderSettings() {
    return render(
      <QueryProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={["/settings"]}>
            <Routes>
              <Route path="/settings" element={<Settings />} />
              <Route path="/goodbye" element={<div>Goodbye Screen Landed</div>} />
              <Route path="/login" element={<div>Login Page Landed</div>} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryProvider>
    );
  }

  it("switches language between English and Hindi", () => {
    renderSettings();

    const hindiBtn = screen.getByRole("button", { name: "हिंदी (Hindi)" });
    fireEvent.click(hindiBtn);
    expect(document.documentElement.lang).toBe("hi");

    const englishBtn = screen.getByRole("button", { name: "English (English)" });
    fireEvent.click(englishBtn);
    expect(document.documentElement.lang).toBe("en");
  });

  it("toggles calming night mode and updates data-theme attribute", () => {
    renderSettings();

    const nightBtn = screen.getByRole("button", { name: /Calming Night View/i });
    fireEvent.click(nightBtn);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    const dayBtn = screen.getByRole("button", { name: /Day View/i });
    fireEvent.click(dayBtn);
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("handles machine-readable JSON data export under DPDP Act Sec. 11 with ciphertext note", async () => {
    renderSettings();

    expect(screen.getByText(/Personal journals are exported as encrypted ciphertext only/i)).toBeInTheDocument();

    const exportBtn = screen.getByRole("button", { name: /Export My Data Archive/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByText(/Archive downloaded successfully/i)).toBeInTheDocument();
    });
  });

  it("enforces typed confirmation, clears storage via central clearAllLocalUserData, signs out and redirects to goodbye screen", async () => {
    const clearAllSpy = vi.spyOn(SecureStoreModule, "clearAllLocalUserData");

    localStorage.setItem("mindsahaay-theme", "dark");
    localStorage.setItem("mindsahaay-cbt-activities", JSON.stringify([{ id: "1" }]));
    localStorage.setItem("mindsahaay-habit-streak", "5");

    renderSettings();

    const eraseTriggerBtn = screen.getByRole("button", { name: /Permanently Erase All Data/i });
    fireEvent.click(eraseTriggerBtn);

    // Modal opens
    expect(screen.getByText(/Permanently Erase MindSahaay Account\?/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /Confirm Irrevocable Erasure/i });
    expect(confirmBtn).toBeDisabled();

    // Type incorrect string
    const input = screen.getByLabelText(/Type DELETE to confirm:/i);
    fireEvent.change(input, { target: { value: "CANCEL" } });
    expect(confirmBtn).toBeDisabled();

    // Type DELETE
    fireEvent.change(input, { target: { value: "DELETE" } });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(clearAllSpy).toHaveBeenCalled();
      expect(mockSignOut).toHaveBeenCalled();
      expect(screen.getByText("Goodbye Screen Landed")).toBeInTheDocument();
    });

    expect(localStorage.getItem("mindsahaay-habit-streak")).toBeNull();
    // Theme preference is explicitly preserved
    expect(localStorage.getItem("mindsahaay-theme")).toBe("dark");
  });

  it("calls deleteStudentAccount API in authenticated non-demo mode", async () => {
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(false);
    const deleteAccountSpy = vi.spyOn(AccountApiModule, "deleteStudentAccount").mockResolvedValue({
      success: true,
      erasedAt: new Date().toISOString(),
    });
    const clearAllSpy = vi.spyOn(SecureStoreModule, "clearAllLocalUserData");

    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: /Permanently Erase All Data/i }));
    const input = screen.getByLabelText(/Type DELETE to confirm:/i);
    fireEvent.change(input, { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm Irrevocable Erasure/i }));

    await waitFor(() => {
      expect(deleteAccountSpy).toHaveBeenCalled();
      expect(clearAllSpy).toHaveBeenCalled();
      expect(mockSignOut).toHaveBeenCalled();
      expect(screen.getByText("Goodbye Screen Landed")).toBeInTheDocument();
    });
  });

  it("account erasure DISCARDS the offline outbox (erasure must not leave queued data on the device)", async () => {
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(false);
    vi.spyOn(AccountApiModule, "deleteStudentAccount").mockResolvedValue({
      success: true,
      erasedAt: new Date().toISOString(),
    });
    const clearAllSpy = vi.spyOn(SecureStoreModule, "clearAllLocalUserData");

    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: /Permanently Erase All Data/i }));
    fireEvent.change(screen.getByLabelText(/Type DELETE to confirm:/i), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm Irrevocable Erasure/i }));

    await waitFor(() => expect(clearAllSpy).toHaveBeenCalled());
    expect(clearAllSpy).toHaveBeenCalledWith(expect.objectContaining({ discardOutbox: true }));
  });

  it("if the server-side erasure fails, NOTHING local is wiped and the student is not signed out (so they can retry)", async () => {
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(false);
    vi.spyOn(AccountApiModule, "deleteStudentAccount").mockRejectedValue(new Error("offline"));
    const clearAllSpy = vi.spyOn(SecureStoreModule, "clearAllLocalUserData");
    vi.spyOn(window, "alert").mockImplementation(() => {});
    localStorage.setItem("mindsahaay-habit-streak", "5");
    mockSignOut.mockClear();

    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: /Permanently Erase All Data/i }));
    fireEvent.change(screen.getByLabelText(/Type DELETE to confirm:/i), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm Irrevocable Erasure/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(clearAllSpy).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(localStorage.getItem("mindsahaay-habit-streak")).toBe("5");
  });
});
