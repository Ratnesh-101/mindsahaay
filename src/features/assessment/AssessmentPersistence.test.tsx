import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());

import Assessment from "./Assessment";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";
import { fake, resetFake } from "../journal/testSupport";

function renderAssessment() {
  return render(
    <QueryProvider>
      <I18nProvider>
        <Assessment />
      </I18nProvider>
    </QueryProvider>,
  );
}

function answerGad7(points: 0 | 1) {
  fireEvent.click(screen.getByRole("button", { name: /GAD-7 Anxiety \(7 Questions\)/i }));
  const label = points === 0 ? /Not at all \(0 points\)/i : /Several days \(1 points\)/i;
  for (let q = 1; q <= 7; q++) fireEvent.click(screen.getByRole("button", { name: label }));
}

beforeEach(() => {
  resetFake();
  localStorage.clear();
  // The edge function is unreachable in tests, so submitAssessment falls back to the RLS-protected table insert.
  vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Assessment results are really saved (U3 audit)", () => {
  it("a brand-new account has no invented past screenings", async () => {
    renderAssessment();
    expect(await screen.findByText("Question 1 of 9")).toBeInTheDocument();
    expect(screen.queryByText(/Your Past Screenings/)).not.toBeInTheDocument();
  });

  it("says saved only after the backend stored it, and the result is in the history after a reload", async () => {
    const first = renderAssessment();
    answerGad7(1);
    expect(await screen.findByText(/Score Band: Mild \(7 points\)/i)).toBeInTheDocument();
    expect(await screen.findByText(/saved to your private history/i)).toBeInTheDocument();
    expect(fake.tables.assessments).toHaveLength(1);
    expect(fake.tables.assessments[0]).toMatchObject({ student_id: "user-1", instrument: "gad7", total: 7 });
    first.unmount();

    renderAssessment();
    expect(await screen.findByText(/Your Past Screenings/)).toBeInTheDocument();
    expect(screen.getByText(/GAD7 · Score 7/)).toBeInTheDocument();
  });

  it("when the save fails it says the result was NOT saved, and retry saves it once", async () => {
    renderAssessment();
    fake.failTables = ["assessments"];
    answerGad7(0);
    expect(await screen.findByText(/Score Band: Minimal \(0 points\)/i)).toBeInTheDocument();
    expect(await screen.findByTestId("assessment-save-failed")).toHaveTextContent(/NOT saved/);
    expect(screen.queryByText(/saved to your private history/i)).not.toBeInTheDocument();

    fake.failTables = [];
    fireEvent.click(screen.getByRole("button", { name: "Try saving again" }));
    expect(await screen.findByText(/saved to your private history/i)).toBeInTheDocument();
    expect(fake.tables.assessments).toHaveLength(1);
  });

  it("PHQ-9 item 9 still triggers the crisis protocol even when saving fails", async () => {
    renderAssessment();
    fake.failTables = ["assessments"];
    for (let q = 1; q <= 8; q++) fireEvent.click(screen.getByRole("button", { name: /Not at all \(0 points\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /Several days \(1 points\)/i }));
    expect(await screen.findByText(/CRITICAL SAFETY PROTOCOL ACTIVATED/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Call Tele-MANAS 14416/i)).toHaveAttribute("href", "tel:14416");
  });
});
