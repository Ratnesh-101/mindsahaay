import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CrisisPage from "./CrisisPage";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";
import * as DemoModule from "../auth/demoMode";
import type { SafetyPlan } from "../../shared/lib/api/safetyPlan";
import { toOpaqueKey, getMemoryCacheItem, clearSecureStoreMemory } from "../../shared/lib/storage/secureStore";

const onlineMock = vi.hoisted(() => ({ online: true }));
vi.mock("../../shared/lib/offline", () => ({
  useOnlineStatus: () => onlineMock.online,
}));

describe("Crisis Assistance & Stanley-Brown Safety Plan", () => {
  beforeEach(() => {
    onlineMock.online = true;
    vi.restoreAllMocks();
    localStorage.clear();
    clearSecureStoreMemory();
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(true);
  });

  function renderCrisisPage() {
    return render(
      <QueryProvider>
        <I18nProvider>
          <CrisisPage />
        </I18nProvider>
      </QueryProvider>
    );
  }

  it("renders verified 24/7 crisis helplines with one-tap dialing", () => {
    renderCrisisPage();

    expect(screen.getByText(/Immediate 24\/7 National Crisis Helplines/i)).toBeInTheDocument();

    const teleManas = screen.getByLabelText(/Call Tele-MANAS at 14416/i);
    expect(teleManas).toHaveAttribute("href", "tel:14416");

    const kiran = screen.getByLabelText(/Call KIRAN Helpline at 1800-599-0019/i);
    expect(kiran).toHaveAttribute("href", "tel:18005990019");

    const emergency = screen.getByLabelText(/Dial Emergency 112/i);
    expect(emergency).toHaveAttribute("href", "tel:112");
  });

  it("shows when the helpline numbers were last verified and hides the offline note while online", () => {
    renderCrisisPage();
    expect(screen.getByTestId("helplines-verified")).toHaveTextContent(
      /Helpline numbers last verified 20 November 2026/,
    );
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

  it("allows editing and adding warning signs and saving the safety plan", async () => {
    renderCrisisPage();

    // Edit warning sign 1
    const signInput = screen.getByLabelText("Warning sign 1");
    fireEvent.change(signInput, { target: { value: "Severe insomnia before midterms" } });

    // Add a new warning sign
    const addSignBtn = screen.getByRole("button", { name: /\+ Add another warning sign/i });
    fireEvent.click(addSignBtn);

    const signInput4 = screen.getByLabelText("Warning sign 4");
    fireEvent.change(signInput4, { target: { value: "Loss of interest in music" } });

    // Save
    const saveBtn = screen.getByRole("button", { name: /Save Safety Plan/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Safety Plan saved securely!/i)).toBeInTheDocument();
    });

    // Plaintext legacy key must NEVER exist
    expect(localStorage.getItem("mindsahaay_demo_safety_plan")).toBeNull();

    // Data is safely held in memory cache without persisting plaintext
    const cached = getMemoryCacheItem<SafetyPlan>("demo_safety_plan");
    expect(cached?.warningSigns).toContain("Severe insomnia before midterms");
    expect(cached?.warningSigns).toContain("Loss of interest in music");
  });

  it("encrypts safety plan with AES-GCM when encryption is enabled, ensuring zero plaintext in localStorage", async () => {
    renderCrisisPage();

    const signInput = screen.getByLabelText("Warning sign 1");
    fireEvent.change(signInput, { target: { value: "Intrusive thought spikes" } });

    const encryptCheckbox = screen.getByLabelText(/Enable Zero-Knowledge AES-256-GCM Encryption/i);
    fireEvent.click(encryptCheckbox);

    const passInput = screen.getByLabelText(/Encryption Passphrase/i);
    fireEvent.change(passInput, { target: { value: "my-vault-passphrase-2026" } });

    const saveBtn = screen.getByRole("button", { name: /Save Safety Plan/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Safety Plan saved securely!/i)).toBeInTheDocument();
    });

    // Plaintext key must NEVER exist
    expect(localStorage.getItem("mindsahaay_demo_safety_plan")).toBeNull();

    // Raw storage under opaque key has ciphertext only
    const raw = localStorage.getItem(toOpaqueKey("demo_safety_plan"));
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("Intrusive thought spikes");
    const parsed = JSON.parse(raw!);
    expect(parsed.algorithm).toBe("AES-GCM");
    expect(parsed.ciphertext).toBeTruthy();
  });

  it("handles client-side passphrase encryption toggle", () => {
    renderCrisisPage();

    const encryptCheckbox = screen.getByLabelText(/Enable Zero-Knowledge AES-256-GCM Encryption/i);
    expect(screen.queryByLabelText(/Encryption Passphrase/i)).not.toBeInTheDocument();

    fireEvent.click(encryptCheckbox);
    expect(screen.getByLabelText(/Encryption Passphrase/i)).toBeInTheDocument();

    const passInput = screen.getByLabelText(/Encryption Passphrase/i);
    fireEvent.change(passInput, { target: { value: "super-secret-vault-key" } });
  });

  it("updates coping strategies, contacts, and reasons to live", () => {
    renderCrisisPage();

    // Add and update coping strategy
    const addCopingBtn = screen.getByRole("button", { name: /\+ Add another coping strategy/i });
    fireEvent.click(addCopingBtn);
    const coping4 = screen.getByLabelText("Coping strategy 4");
    fireEvent.change(coping4, { target: { value: "Listen to lo-fi beats" } });

    // Add and update contact
    const addContactBtn = screen.getByRole("button", { name: /\+ Add another contact/i });
    fireEvent.click(addContactBtn);
    const contactName = screen.getByLabelText("Contact 3 Name");
    fireEvent.change(contactName, { target: { value: "Aunt Maya" } });

    // Add and update reason to live
    const addReasonBtn = screen.getByRole("button", { name: /\+ Add another reason to live/i });
    fireEvent.click(addReasonBtn);
    const reason4 = screen.getByLabelText("Reason for living 4");
    fireEvent.change(reason4, { target: { value: "Adopt a golden retriever" } });
  });
});
