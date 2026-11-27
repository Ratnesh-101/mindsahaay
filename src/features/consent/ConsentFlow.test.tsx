import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";

vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());

import Onboarding from "../onboarding/Onboarding";
import ConsentLedger from "./ConsentLedger";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";
import * as DemoModule from "../auth/demoMode";
import { i18n } from "../../app/providers/I18nProvider";
import { fake, resetFake } from "../journal/testSupport";

function renderWithProviders(ui: React.ReactElement, initialEntry = "/") {
  return render(
    <QueryProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
      </I18nProvider>
    </QueryProvider>,
  );
}

function renderOnboarding() {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<Onboarding />} />
      <Route path="/dashboard" element={<div>Dashboard Landed</div>} />
    </Routes>,
  );
}

describe("DPDP Consent & Onboarding Flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    resetFake({ profiles: [{ id: "user-1", role: "student", alias: "student" }] });
    i18n.changeLanguage("en");
    if (typeof document !== "undefined") {
      document.documentElement.lang = "en";
    }
  });

  it("starts with no invented name, generates an anonymous alias and toggles language", () => {
    renderOnboarding();
    expect(screen.getByLabelText(/How should we address you/i)).toHaveValue("");

    const langBtn = screen.getByRole("button", { name: /Toggle language between English and Hindi/i });
    fireEvent.click(langBtn);
    expect(document.documentElement.lang).toBe("hi");

    fireEvent.click(screen.getByRole("button", { name: /Generate Anonymous Alias/i }));
    expect(screen.getByText(/Pseudonym active/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/How should we address you/i) as HTMLInputElement).value).toMatch(/^Student-\d{4}$/);
  });

  it("prevents completing onboarding without age confirmation or without essential data processing", async () => {
    renderOnboarding();
    const submitBtn = screen.getByRole("button", { name: /Accept & Enter MindSahaay/i });
    fireEvent.click(submitBtn);
    expect(await screen.findByText(/You must confirm you are 18 years of age or older/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Age Confirmation \(18\+\)/i));
    fireEvent.click(screen.getByLabelText(/Core wellbeing data processing/i)); // uncheck
    fireEvent.click(submitBtn);
    expect(await screen.findByText(/Essential data processing consent is required/i)).toBeInTheDocument();
  });

  it("asks for a name or alias before saving anything", async () => {
    renderOnboarding();
    fireEvent.click(screen.getByLabelText(/Age Confirmation \(18\+\)/i));
    fireEvent.click(screen.getByRole("button", { name: /Accept & Enter MindSahaay/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/enter a name or alias/i);
    expect(fake.tables.consents ?? []).toHaveLength(0);
  });

  it("preview mode: completes onboarding and keeps the choices for the preview", async () => {
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(true);
    renderOnboarding();
    fireEvent.change(screen.getByLabelText(/How should we address you/i), { target: { value: "Aarav" } });
    fireEvent.click(screen.getByLabelText(/Age Confirmation \(18\+\)/i));
    fireEvent.click(screen.getByLabelText(/Counsellor context sharing/i));
    fireEvent.click(screen.getByRole("button", { name: /Accept & Enter MindSahaay/i }));
    await waitFor(() => expect(screen.getByText("Dashboard Landed")).toBeInTheDocument());
    const parsed = JSON.parse(localStorage.getItem("mindsahaay_demo_consents")!);
    expect(parsed.data_processing).toBe(true);
    expect(parsed.counsellor_sharing).toBe(true);
  });

  it("real account: writes each chosen consent and the alias, then continues", async () => {
    renderOnboarding();
    fireEvent.change(screen.getByLabelText(/How should we address you/i), { target: { value: "Night Owl" } });
    fireEvent.click(screen.getByLabelText(/Age Confirmation \(18\+\)/i));
    fireEvent.click(screen.getByLabelText(/Counsellor context sharing/i));
    fireEvent.click(screen.getByRole("button", { name: /Accept & Enter MindSahaay/i }));
    await waitFor(() => expect(screen.getByText("Dashboard Landed")).toBeInTheDocument());

    const purposes = (fake.tables.consents ?? []).map((r) => r.purpose).sort();
    expect(purposes).toEqual(["counsellor_sharing", "crisis_intervention", "data_processing"]);
    expect(fake.tables.profiles[0].alias).toBe("Night Owl");
  });

  it("real account: when a consent cannot be recorded it stays on the page with an alert, and a retry does not duplicate rows", async () => {
    renderOnboarding();
    fireEvent.change(screen.getByLabelText(/How should we address you/i), { target: { value: "Night Owl" } });
    fireEvent.click(screen.getByLabelText(/Age Confirmation \(18\+\)/i));
    fake.failTables = ["consents"];
    fireEvent.click(screen.getByRole("button", { name: /Accept & Enter MindSahaay/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not record your choices/i);
    expect(screen.queryByText("Dashboard Landed")).not.toBeInTheDocument();
    expect(localStorage.getItem("mindsahaay_onboarding_completed")).toBeNull();
    expect(screen.getByLabelText(/How should we address you/i)).toHaveValue("Night Owl");

    fake.failTables = [];
    fireEvent.click(screen.getByRole("button", { name: /Accept & Enter MindSahaay/i }));
    await waitFor(() => expect(screen.getByText("Dashboard Landed")).toBeInTheDocument());
    expect((fake.tables.consents ?? []).filter((r) => r.purpose === "data_processing")).toHaveLength(1);
  });

  it("real account: when the alias cannot be saved it says so and does not continue", async () => {
    renderOnboarding();
    fireEvent.change(screen.getByLabelText(/How should we address you/i), { target: { value: "Night Owl" } });
    fireEvent.click(screen.getByLabelText(/Age Confirmation \(18\+\)/i));
    fake.failTables = ["profiles"];
    fireEvent.click(screen.getByRole("button", { name: /Accept & Enter MindSahaay/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save your display name/i);
    expect(screen.queryByText("Dashboard Landed")).not.toBeInTheDocument();
  });
});

describe("Consent ledger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    resetFake({ profiles: [{ id: "user-1", role: "student", alias: "student" }] });
    i18n.changeLanguage("en");
  });

  it("preview mode: renders the ledger and handles revocation", async () => {
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(true);
    renderWithProviders(<ConsentLedger />);
    expect(screen.getByText(/Active Consent Status/i)).toBeInTheDocument();
    expect(screen.getByText(/Immutable Append-Only Audit Ledger/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Revoke Consent for Core Wellbeing Data & Storage/i }));
    expect(await screen.findByRole("button", { name: /Grant Consent for Core Wellbeing Data & Storage/i })).toBeInTheDocument();
  });

  it("real account: shows exactly what the ledger holds, with no invented history", async () => {
    resetFake({
      profiles: [{ id: "user-1", role: "student", alias: "student" }],
      consents: [
        { id: "c1", student_id: "user-1", purpose: "data_processing", consented: true, policy_version: "2023.1-DPDP", granted_at: "2026-01-01T00:00:00Z" },
      ],
    });
    renderWithProviders(<ConsentLedger />);
    expect(await screen.findByRole("button", { name: /Revoke Consent for Core Wellbeing Data & Storage/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Grant Consent for Peer Community & Stories/i })).toBeInTheDocument();
    const rows = await screen.findAllByRole("row");
    expect(rows).toHaveLength(2); // header + the single real ledger entry
  });

  it("real account: a granted consent is in the ledger and still granted after a reload", async () => {
    const first = renderWithProviders(<ConsentLedger />);
    fireEvent.click(await screen.findByRole("button", { name: /Grant Consent for Peer Community & Stories/i }));
    expect(await screen.findByText(/Consent recorded in your ledger: granted/)).toBeInTheDocument();
    expect(fake.tables.consents.some((r) => r.purpose === "peer_support" && r.consented === true)).toBe(true);
    first.unmount();

    renderWithProviders(<ConsentLedger />);
    expect(await screen.findByRole("button", { name: /Revoke Consent for Peer Community & Stories/i })).toBeInTheDocument();
  });

  it("real account: a failed toggle shows an alert and leaves the consent as it was", async () => {
    renderWithProviders(<ConsentLedger />);
    const grant = await screen.findByRole("button", { name: /Grant Consent for Peer Community & Stories/i });
    fake.failTables = ["consents"];
    fireEvent.click(grant);
    expect(await screen.findByText(/could not record this change/i)).toBeInTheDocument();
    expect(screen.queryByText(/Consent recorded in your ledger/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Grant Consent for Peer Community & Stories/i })).toBeInTheDocument();
  });

  it("real account: when the ledger cannot be read no toggles are shown, only an alert with retry", { timeout: 20000 }, async () => {
    fake.failTables = ["consents"];
    renderWithProviders(<ConsentLedger />);
    expect(await screen.findByTestId("consent-load-error", {}, { timeout: 10000 })).toHaveTextContent(/could not load your consent choices/i);
    expect(screen.queryByRole("button", { name: /Revoke Consent for/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Grant Consent for/i })).not.toBeInTheDocument();
  });
});
