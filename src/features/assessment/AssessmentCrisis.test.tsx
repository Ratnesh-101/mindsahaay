import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Assessment from "./Assessment";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";
import * as DemoModule from "../auth/demoMode";

describe("Assessment Safety Protocol & PHQ-9 Item 9", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(true);
  });

  function renderAssessment(props = {}) {
    return render(
      <QueryProvider>
        <I18nProvider>
          <Assessment {...props} />
        </I18nProvider>
      </QueryProvider>
    );
  }

  it("renders educational-not-diagnostic disclaimer", () => {
    renderAssessment();
    expect(
      screen.getByText(/MindSahaay assessments are educational screening tools and do not constitute a clinical diagnosis/i)
    ).toBeInTheDocument();
  });

  it("triggers mandatory crisis protocol immediately when PHQ-9 Item 9 is non-zero", async () => {
    const openSafetyPlanMock = vi.fn();
    renderAssessment({ openSafetyPlan: openSafetyPlanMock });

    // Ensure on PHQ-9 (9 items)
    expect(screen.getByText("Question 1 of 9")).toBeInTheDocument();

    // Answer items 1 to 8 with 0 ("Not at all")
    for (let q = 1; q <= 8; q++) {
      const notAtAllBtn = screen.getByRole("button", { name: /Not at all \(0 points\)/i });
      fireEvent.click(notAtAllBtn);
    }

    // Now on Question 9 (Critical safety item: thoughts of self-harm)
    expect(screen.getByText("Question 9 of 9")).toBeInTheDocument();
    expect(screen.getByText(/Thoughts that you would be better off dead/i)).toBeInTheDocument();

    // Answer Item 9 with 1 ("Several days")
    const severalDaysBtn = screen.getByRole("button", { name: /Several days \(1 points\)/i });
    fireEvent.click(severalDaysBtn);

    // CRITICAL PROTOCOL VERIFICATION:
    // Crisis card must appear BEFORE or instead of standard result
    expect(
      await screen.findByText(/CRITICAL SAFETY PROTOCOL ACTIVATED/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/indicates thoughts of self-harm or being better off dead/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Item 9")).toBeInTheDocument();

    // Mandatory helplines with one-tap dialing:
    const teleManasLink = screen.getByLabelText(/Call Tele-MANAS 14416/i);
    expect(teleManasLink).toHaveAttribute("href", "tel:14416");

    const kiranLink = screen.getByLabelText(/Call KIRAN Helpline 1800-599-0019/i);
    expect(kiranLink).toHaveAttribute("href", "tel:18005990019");

    const emergencyLink = screen.getByLabelText(/Dial Emergency 112/i);
    expect(emergencyLink).toHaveAttribute("href", "tel:112");

    // Open Safety Plan button:
    const safetyPlanBtn = screen.getByRole("button", { name: /Open My Crisis Safety Plan/i });
    fireEvent.click(safetyPlanBtn);
    expect(openSafetyPlanMock).toHaveBeenCalled();
  });

  it("does not trigger crisis protocol when PHQ-9 Item 9 is zero", async () => {
    renderAssessment();

    // Answer all 9 items with 0 ("Not at all")
    for (let q = 1; q <= 9; q++) {
      const notAtAllBtn = screen.getByRole("button", { name: /Not at all \(0 points\)/i });
      fireEvent.click(notAtAllBtn);
    }

    // Displays normal result card
    await waitFor(() => {
      expect(screen.getByText(/Score Band: Minimal \(0 points\)/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/CRITICAL SAFETY PROTOCOL ACTIVATED/i)).not.toBeInTheDocument();
  });

  it("allows switching to GAD-7 and scoring anxiety symptoms", async () => {
    renderAssessment();

    // Switch to GAD-7
    const gad7Tab = screen.getByRole("button", { name: /GAD-7 Anxiety \(7 Questions\)/i });
    fireEvent.click(gad7Tab);

    expect(screen.getByText("Question 1 of 7")).toBeInTheDocument();

    // Answer 7 items with 1 ("Several days") -> total 7 -> mild anxiety
    for (let q = 1; q <= 7; q++) {
      const severalDaysBtn = screen.getByRole("button", { name: /Several days \(1 points\)/i });
      fireEvent.click(severalDaysBtn);
    }

    await waitFor(() => {
      expect(screen.getByText(/Score Band: Mild \(7 points\)/i)).toBeInTheDocument();
    });
  });
});
