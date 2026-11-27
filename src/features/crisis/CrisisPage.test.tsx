import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());

import CrisisPage from "./CrisisPage";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";
import * as DemoModule from "../auth/demoMode";
import type { SafetyPlan } from "../../shared/lib/api/safetyPlan";
import { toOpaqueKey, getMemoryCacheItem, clearSecureStoreMemory } from "../../shared/lib/storage/secureStore";
import { fake, resetFake } from "../journal/testSupport";

const onlineMock = vi.hoisted(() => ({ online: true }));
vi.mock("../../shared/lib/offline", () => ({
  useOnlineStatus: () => onlineMock.online,
}));

function renderCrisisPage() {
  return render(
    <QueryProvider>
      <I18nProvider>
        <CrisisPage />
      </I18nProvider>
    </QueryProvider>,
  );
}

describe("Crisis helplines", () => {
  beforeEach(() => {
    onlineMock.online = true;
    vi.restoreAllMocks();
    localStorage.clear();
    clearSecureStoreMemory();
    resetFake();
  });

  it("renders verified 24/7 crisis helplines with one-tap dialing", () => {
    renderCrisisPage();
    expect(screen.getByText(/Immediate 24\/7 National Crisis Helplines/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Call Tele-MANAS at 14416/i)).toHaveAttribute("href", "tel:14416");
    expect(screen.getByLabelText(/Call KIRAN Helpline at 1800-599-0019/i)).toHaveAttribute("href", "tel:18005990019");
    expect(screen.getByLabelText(/Dial Emergency 112/i)).toHaveAttribute("href", "tel:112");
  });

  it("shows when the helpline numbers were last verified and hides the offline note while online", () => {
    renderCrisisPage();
    expect(screen.getByTestId("helplines-verified")).toHaveTextContent(/Helpline numbers last verified 20 November 2026/);
    expect(screen.queryByTestId("crisis-offline-note")).toBeNull();
  });

  it("explains that the screen works without a connection when offline, numbers unchanged", () => {
    onlineMock.online = false;
    renderCrisisPage();
    expect(screen.getByTestId("crisis-offline-note")).toHaveTextContent(/works without a connection/i);
    expect(screen.getByLabelText(/Call Tele-MANAS at 14416/i)).toHaveAttribute("href", "tel:14416");
    expect(screen.getByLabelText(/Call KIRAN Helpline at 1800-599-0019/i)).toHaveAttribute("href", "tel:18005990019");
    expect(screen.getByLabelText(/Dial Emergency 112/i)).toHaveAttribute("href", "tel:112");
  });

  it("keeps the helplines visible even when the plan cannot be loaded", async () => {
    fake.failTables = ["safety_plans"];
    renderCrisisPage();
    expect(await screen.findByTestId("plan-load-error")).toHaveTextContent(/could not load your safety plan/i);
    expect(screen.getByLabelText(/Call Tele-MANAS at 14416/i)).toHaveAttribute("href", "tel:14416");
  });
});

describe("Safety plan for a real account (saved to the backend)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    clearSecureStoreMemory();
    resetFake();
  });

  it("a brand-new account sees an empty plan with an honest hint, never invented people or places", async () => {
    renderCrisisPage();
    expect(await screen.findByLabelText("Warning sign 1")).toHaveValue("");
    expect(screen.getByLabelText("Coping strategy 1")).toHaveValue("");
    expect(screen.getByLabelText("Contact 1 Name")).toHaveValue("");
    expect(screen.getByLabelText("Reason for living 1")).toHaveValue("");
    expect(screen.getByTestId("plan-empty-hint")).toHaveTextContent(/Nothing is saved yet/);
    expect(document.body.textContent).not.toMatch(/Kabir|Priya|Ananya|98765/);
  });

  it("saves the plan, confirms only after the backend accepted it, and shows it again after a reload", async () => {
    const first = renderCrisisPage();
    fireEvent.change(await screen.findByLabelText("Warning sign 1"), { target: { value: "Cannot sleep before vivas" } });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add another warning sign/i }));
    fireEvent.change(screen.getByLabelText("Warning sign 2"), { target: { value: "Skipping meals" } });
    fireEvent.change(screen.getByLabelText("Contact 1 Name"), { target: { value: "Meera" } });
    fireEvent.change(screen.getByLabelText("Contact 1 Phone"), { target: { value: "+91 90000 00000" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Safety Plan/i }));

    expect(await screen.findByText(/Safety plan saved to your account/)).toBeInTheDocument();
    const rows = fake.tables.safety_plans;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ student_id: "user-1", warning_signs: ["Cannot sleep before vivas", "Skipping meals"] });
    first.unmount();

    renderCrisisPage();
    expect(await screen.findByDisplayValue("Cannot sleep before vivas")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Skipping meals")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Meera")).toBeInTheDocument();
  });

  it("when the save fails: role=alert, no success message, and the typed plan stays on screen", async () => {
    renderCrisisPage();
    fireEvent.change(await screen.findByLabelText("Warning sign 1"), { target: { value: "Racing thoughts at 2 AM" } });
    fake.failTables = ["safety_plans"];
    fireEvent.click(screen.getByRole("button", { name: /Save Safety Plan/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save your safety plan/i);
    expect(screen.queryByText(/saved to your account/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Warning sign 1")).toHaveValue("Racing thoughts at 2 AM");
    expect(fake.tables.safety_plans ?? []).toHaveLength(0);
  });

  it("an encrypted plan stays hidden after a reload until the passphrase is entered, then it decrypts", async () => {
    const first = renderCrisisPage();
    fireEvent.change(await screen.findByLabelText("Warning sign 1"), { target: { value: "Intrusive thought spikes" } });
    fireEvent.click(screen.getByLabelText(/Enable Zero-Knowledge AES-256-GCM Encryption/i));
    fireEvent.change(screen.getByLabelText(/Encryption Passphrase/i), { target: { value: "plan-passphrase-2026" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Safety Plan/i }));
    expect(await screen.findByText(/Safety plan saved to your account/)).toBeInTheDocument();
    expect(JSON.stringify(fake.tables.safety_plans[0])).not.toContain("Intrusive");
    first.unmount();

    renderCrisisPage();
    expect(await screen.findByTestId("plan-locked")).toHaveTextContent(/Nothing has been lost/);
    expect(screen.queryByLabelText("Warning sign 1")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Safety plan passphrase"), { target: { value: "wrong passphrase" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/did not open your plan/);

    fireEvent.change(screen.getByLabelText("Safety plan passphrase"), { target: { value: "plan-passphrase-2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock plan" }));
    expect(await screen.findByDisplayValue("Intrusive thought spikes")).toBeInTheDocument();
  });

  it("asks for a passphrase instead of claiming success when encryption is on but empty", async () => {
    renderCrisisPage();
    fireEvent.change(await screen.findByLabelText("Warning sign 1"), { target: { value: "x" } });
    fireEvent.click(screen.getByLabelText(/Enable Zero-Knowledge AES-256-GCM Encryption/i));
    fireEvent.click(screen.getByRole("button", { name: /Save Safety Plan/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Enter a passphrase/);
    expect(fake.tables.safety_plans ?? []).toHaveLength(0);
  });
});

describe("Safety plan in the offline preview (no backend)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    clearSecureStoreMemory();
    resetFake();
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(true);
  });

  it("says plainly that a preview plan without a passphrase is kept for this tab only", async () => {
    renderCrisisPage();
    fireEvent.change(screen.getByLabelText("Warning sign 1"), { target: { value: "Severe insomnia before midterms" } });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add another warning sign/i }));
    fireEvent.change(screen.getByLabelText("Warning sign 2"), { target: { value: "Loss of interest in music" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Safety Plan/i }));

    expect(await screen.findByText(/kept for this tab only|keeps the plan for this tab only/i)).toBeInTheDocument();
    expect(localStorage.getItem("mindsahaay_demo_safety_plan")).toBeNull();
    const cached = getMemoryCacheItem<SafetyPlan>("demo_safety_plan");
    expect(cached?.warningSigns).toEqual(["Severe insomnia before midterms", "Loss of interest in music"]);
  });

  it("encrypts the preview plan with AES-GCM when a passphrase is given, with zero plaintext in localStorage", async () => {
    renderCrisisPage();
    fireEvent.change(screen.getByLabelText("Warning sign 1"), { target: { value: "Intrusive thought spikes" } });
    fireEvent.click(screen.getByLabelText(/Enable Zero-Knowledge AES-256-GCM Encryption/i));
    fireEvent.change(screen.getByLabelText(/Encryption Passphrase/i), { target: { value: "my-vault-passphrase-2026" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Safety Plan/i }));

    expect(await screen.findByText(/encrypted and saved on this device/i)).toBeInTheDocument();
    const raw = localStorage.getItem(toOpaqueKey("demo_safety_plan"));
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("Intrusive thought spikes");
    expect(JSON.parse(raw!).algorithm).toBe("AES-GCM");
  });

  it("adds coping strategies, contacts and reasons to live", async () => {
    renderCrisisPage();
    fireEvent.click(screen.getByRole("button", { name: /\+ Add another coping strategy/i }));
    fireEvent.change(screen.getByLabelText("Coping strategy 2"), { target: { value: "Listen to lo-fi beats" } });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add another contact/i }));
    fireEvent.change(screen.getByLabelText("Contact 2 Name"), { target: { value: "Aunt Maya" } });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add another reason to live/i }));
    fireEvent.change(screen.getByLabelText("Reason for living 2"), { target: { value: "Adopt a golden retriever" } });
    await waitFor(() => expect(screen.getByDisplayValue("Aunt Maya")).toBeInTheDocument());
  });
});
