import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());

import { resetFake, setupI18n, fake } from "../journal/testSupport";
import SafetyCardModal from "./SafetyCardModal";
import NotificationModal from "./NotificationModal";
import { createVault, generateRecoveryCode, lockVault, readVaultMeta, unlockVault } from "../journal/vault";
import { clearSecureStoreMemory, toOpaqueKey } from "../../shared/lib/storage/secureStore";

const PASS = "safety card passphrase";
const student = { name: "Student", institution: "Campus" };

beforeAll(async () => {
  await setupI18n("en");
});

beforeEach(() => {
  resetFake();
  localStorage.clear();
  clearSecureStoreMemory();
  lockVault();
});

afterEach(() => {
  vi.restoreAllMocks();
  lockVault();
});

describe("Safety card anchors (encrypted on this device)", () => {
  it("never shows an invented friend or phone number", () => {
    render(<SafetyCardModal student={student} onClose={() => undefined} />);
    expect(document.body.textContent).not.toMatch(/Kabir|98765/);
    expect(screen.getByText("Campus Counsellor / Peer Support")).toBeInTheDocument();
  });

  it("confirms a save only after it is stored, and the anchors come back after a reload and unlock", async () => {
    await createVault(PASS, generateRecoveryCode());
    const first = render(<SafetyCardModal student={student} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/Anchor 1/), { target: { value: "Splash cold water" } });
    fireEvent.change(screen.getByLabelText(/Trusted Roommate/), { target: { value: "Meera, 90000 00000" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Anchors/ }));
    expect(await screen.findByText(/Anchors encrypted and saved on this device/)).toBeInTheDocument();
    const raw = localStorage.getItem(toOpaqueKey("safety_card"));
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("Meera");
    first.unmount();

    clearSecureStoreMemory();
    lockVault();
    const meta = await readVaultMeta();
    await unlockVault(PASS, meta!);
    render(<SafetyCardModal student={student} onClose={() => undefined} />);
    expect(await screen.findByDisplayValue("Splash cold water")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Meera, 90000 00000")).toBeInTheDocument();
  });

  it("when the device refuses the write: alert, no 'saved' message, and the typed anchors stay", async () => {
    await createVault(PASS, generateRecoveryCode());
    render(<SafetyCardModal student={student} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/Anchor 1/), { target: { value: "Walk to the lawn" } });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Anchors/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save your anchors/);
    expect(screen.queryByText(/Anchors encrypted and saved/)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Walk to the lawn")).toBeInTheDocument();
  });
});

describe("Notification modal", () => {
  it("says it could not load instead of 'No new notifications' when the request fails", async () => {
    fake.failTables = ["notifications"];
    render(<NotificationModal onClose={() => undefined} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load your notifications/);
    expect(screen.queryByText("No new notifications")).not.toBeInTheDocument();
  });

  it("shows real reminders from the backend", async () => {
    resetFake({
      notifications: [
        { id: "n1", user_id: "user-1", title: "Session tomorrow", body: "10 AM", type: "appointment_reminder", read: false, created_at: "2026-01-01T00:00:00Z" },
      ],
    });
    render(<NotificationModal onClose={() => undefined} />);
    expect(await screen.findByText("Session tomorrow")).toBeInTheDocument();
  });
});
