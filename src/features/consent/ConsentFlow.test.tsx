import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import Onboarding from "../onboarding/Onboarding";
import ConsentLedger from "./ConsentLedger";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";
import * as DemoModule from "../auth/demoMode";
import { i18n } from "../../app/providers/I18nProvider";

describe("DPDP Consent & Onboarding Flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    i18n.changeLanguage("en");
    if (typeof document !== "undefined") {
      document.documentElement.lang = "en";
    }
  });

  function renderWithProviders(ui: React.ReactElement, initialEntry = "/") {
    return render(
      <QueryProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
        </I18nProvider>
      </QueryProvider>
    );
  }

  it("generates anonymous alias and toggles language in onboarding", () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<Onboarding />} />
      </Routes>
    );

    // Language toggle
    const langBtn = screen.getByRole("button", { name: /Toggle language between English and Hindi/i });
    fireEvent.click(langBtn);
    expect(document.documentElement.lang).toBe("hi");

    // Anonymous alias generator
    const aliasBtn = screen.getByRole("button", { name: /Generate Anonymous Alias/i });
    fireEvent.click(aliasBtn);
    expect(screen.getByText(/Pseudonym active/i)).toBeInTheDocument();
  });

  it("prevents completing onboarding without age confirmation or without essential data processing", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<Onboarding />} />
      </Routes>
    );

    const submitBtn = screen.getByRole("button", { name: /Accept & Enter MindSahaay/i });
    fireEvent.click(submitBtn);

    // Age confirmation unchecked should trigger error notice
    expect(
      await screen.findByText(/You must confirm you are 18 years of age or older/i)
    ).toBeInTheDocument();

    // Check age, but uncheck data processing
    const ageCheckbox = screen.getByLabelText(/Age Confirmation \(18\+\)/i);
    fireEvent.click(ageCheckbox);

    const dataProcessingCheckbox = screen.getByLabelText(/Core wellbeing data processing/i);
    fireEvent.click(dataProcessingCheckbox); // uncheck

    fireEvent.click(submitBtn);

    expect(
      await screen.findByText(/Essential data processing consent is required/i)
    ).toBeInTheDocument();
  });

  it("completes onboarding when 18+ is confirmed and records consents", async () => {
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(true);

    renderWithProviders(
      <Routes>
        <Route path="/" element={<Onboarding />} />
        <Route path="/dashboard" element={<div>Dashboard Landed</div>} />
      </Routes>
    );

    // Confirm age
    const ageCheckbox = screen.getByLabelText(/Age Confirmation \(18\+\)/i);
    fireEvent.click(ageCheckbox);

    // Toggle counsellor sharing, research, and crisis
    const counsellorCheckbox = screen.getByLabelText(/Counsellor context sharing/i);
    fireEvent.click(counsellorCheckbox);

    const researchCheckbox = screen.getByLabelText(/Anonymized research analytics/i);
    fireEvent.click(researchCheckbox);

    const crisisCheckbox = screen.getByLabelText(/Emergency crisis intervention assistance/i);
    fireEvent.click(crisisCheckbox); // toggle off
    fireEvent.click(crisisCheckbox); // toggle back on

    // Submit
    const submitBtn = screen.getByRole("button", { name: /Accept & Enter MindSahaay/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Dashboard Landed")).toBeInTheDocument();
    });

    // Check localStorage stored demo consents
    const stored = localStorage.getItem("mindsahaay_demo_consents");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.data_processing).toBe(true);
    expect(parsed.counsellor_sharing).toBe(true);
  });

  it("renders active consent ledger and handles consent revocation", async () => {
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(true);

    renderWithProviders(
      <Routes>
        <Route path="/" element={<ConsentLedger />} />
      </Routes>
    );

    expect(screen.getByText(/Active Consent Status/i)).toBeInTheDocument();
    expect(screen.getByText(/Immutable Append-Only Audit Ledger/i)).toBeInTheDocument();

    // Revoke Core Wellbeing Data
    const revokeBtn = screen.getByRole("button", {
      name: /Revoke Consent for Core Wellbeing Data & Storage/i,
    });
    fireEvent.click(revokeBtn);

    // Status changes to Grant Consent
    expect(
      await screen.findByRole("button", {
        name: /Grant Consent for Core Wellbeing Data & Storage/i,
      })
    ).toBeInTheDocument();
  });
});
