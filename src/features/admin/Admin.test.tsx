import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());
vi.mock("../doctors/http", () => ({ callFunction: vi.fn() }));
vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass,
    BarChart: ({ data, children }: { data: { name: string; value: number }[]; children?: React.ReactNode }) => (
      <ul data-testid="bar-chart">
        {data.map((d) => (
          <li key={d.name}>{`${d.name}=${d.value}`}</li>
        ))}
        {children}
      </ul>
    ),
    Bar: () => null,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
  };
});

import { resetFake, setupI18n } from "../journal/testSupport";
import { callFunction } from "../doctors/http";
import { ApiError } from "../../shared/lib/api/errors";
import AdminDashboard from "./AdminDashboard";
import { fetchAnalytics, type Analytics } from "./api";
import { assessmentMatrix, isSuppressed, moodMatrix, riskMatrix, totalsByColumn, weightedMeanByColumn, weightedMeanByRow } from "./aggregate";

const mockCall = vi.mocked(callFunction);

const analytics: Analytics = {
  institutionId: "inst-1",
  kAnonymityThreshold: 10,
  assessmentAggregates: [
    { instrument: "phq9", severity: "mild", report_month: "2026-01-01", sample_size: 40, mean_score: 7, crisis_indicators: 0 },
    { instrument: "phq9", severity: "moderate", report_month: "2026-01-01", sample_size: 10, mean_score: 12, crisis_indicators: 1 },
    { instrument: "phq9", severity: "mild", report_month: "2026-02-01", sample_size: 30, mean_score: 6, crisis_indicators: 0 },
    // A leaky response: must never be drawn or shown.
    { instrument: "phq9", severity: "severe", report_month: "2026-02-01", sample_size: 3, mean_score: 22, crisis_indicators: 3 },
    { instrument: "gad7", severity: "mild", report_month: "2026-01-01", sample_size: 25, mean_score: 5, crisis_indicators: 0 },
  ],
  moodAggregates: [
    { mood: "Calm", report_week: "2026-01-05", sample_size: 20, avg_intensity: 6 },
    { mood: "Anxious", report_week: "2026-01-05", sample_size: 12, avg_intensity: 4 },
    { mood: "Anxious", report_week: "2026-01-12", sample_size: 9, avg_intensity: 8 },
  ],
  riskAggregates: [
    { severity_level: "high", report_month: "2026-01-01", incident_count: 14 },
    { severity_level: "crisis", report_month: "2026-01-01", incident_count: 2 },
  ],
};

beforeAll(async () => {
  await setupI18n("en");
});

beforeEach(() => {
  resetFake({ profiles: [{ id: "user-1", role: "institution_admin", institution_id: "inst-1" }] });
  mockCall.mockReset();
});

describe("Institution admin dashboard", () => {
  it("calls GET /institutions/:id/analytics for the admin's own institution", async () => {
    mockCall.mockResolvedValueOnce(analytics);
    render(<AdminDashboard />);
    await screen.findByRole("heading", { name: "Screening scores by month" });
    expect(mockCall).toHaveBeenCalledWith("GET", "/institutions/inst-1/analytics");
  });

  it("shows hidden cells as 'fewer than 10 students' and never draws or prints small groups", async () => {
    mockCall.mockResolvedValueOnce(analytics);
    render(<AdminDashboard institutionId="inst-1" />);
    const table = await screen.findByRole("table", { name: "Number of students per severity band and month" });

    // The severe group (3 students) is dropped; its cells read as suppressed.
    const severeRow = within(table).getByRole("rowheader", { name: "severe" }).closest("tr") as HTMLElement;
    expect(within(severeRow).getAllByText("fewer than 10 students")).toHaveLength(2);
    expect(within(table).getByText("40 students")).toBeInTheDocument();
    expect(within(table).getByText("10 students")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b22\b/);
    expect(document.body.textContent).not.toContain("3 students");

    // The chart carries only the weighted means of published groups: (7*40+12*10)/50 = 8 and 6.
    const chart = screen.getAllByTestId("bar-chart")[0];
    expect(chart).toHaveTextContent("2026-01-01=8");
    expect(chart).toHaveTextContent("2026-02-01=6");

    // Mood week with only 9 students is hidden.
    const moodTable = screen.getByRole("table", { name: "Number of students per mood and week" });
    expect(within(moodTable).getAllByText("fewer than 10 students").length).toBeGreaterThanOrEqual(2);
    expect(within(moodTable).queryByText("9 students")).not.toBeInTheDocument();
  });

  it("states the privacy guarantee and contains no individual identifiers", async () => {
    mockCall.mockResolvedValueOnce(analytics);
    render(<AdminDashboard institutionId="inst-1" />);
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent("Only groups of 10 or more students are shown");
    expect(note).toHaveTextContent("no names");
    expect(document.body.textContent).not.toMatch(/student_id|alias|@/);
  });

  it("switches instrument", async () => {
    mockCall.mockResolvedValueOnce(analytics);
    const user = userEvent.setup();
    render(<AdminDashboard institutionId="inst-1" />);
    await user.selectOptions(await screen.findByLabelText("Assessment instrument"), "gad7");
    expect(screen.getByRole("heading", { name: "Screening scores by month" })).toBeInTheDocument();
    expect(screen.getAllByTestId("bar-chart")[0]).toHaveTextContent("2026-01-01=5");
  });

  it("handles an empty response, forbidden access, a missing institution and errors", async () => {
    mockCall.mockResolvedValueOnce({ assessmentAggregates: [], moodAggregates: [], riskAggregates: [] });
    const first = render(<AdminDashboard institutionId="inst-1" />);
    expect(await screen.findByText(/No group is large enough/)).toBeInTheDocument();
    first.unmount();

    mockCall.mockRejectedValueOnce(new ApiError("no", 403, "FORBIDDEN"));
    const second = render(<AdminDashboard institutionId="inst-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Only institution admins");
    second.unmount();

    resetFake({ profiles: [{ id: "user-1", role: "institution_admin", institution_id: null }] });
    const third = render(<AdminDashboard />);
    expect(await screen.findByRole("alert")).toHaveTextContent("not linked to an institution");
    third.unmount();

    mockCall.mockRejectedValueOnce(new ApiError("boom", 500, "REQUEST_FAILED"));
    mockCall.mockResolvedValueOnce(analytics);
    const user = userEvent.setup();
    render(<AdminDashboard institutionId="inst-1" />);
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Support-needed events by month" })).toBeInTheDocument();
  });

  it("rejects malformed analytics responses", async () => {
    mockCall.mockResolvedValueOnce({ assessmentAggregates: "nope" });
    await expect(fetchAnalytics("inst-1")).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });
});

describe("k-anonymity helpers", () => {
  it("suppresses small, missing and invalid sizes", () => {
    expect(isSuppressed(9, 10)).toBe(true);
    expect(isSuppressed(10, 10)).toBe(false);
    expect(isSuppressed(null, 10)).toBe(true);
    expect(isSuppressed(Number.NaN, 10)).toBe(true);
    expect(isSuppressed(undefined, 10)).toBe(true);
  });

  it("builds matrices without small groups", () => {
    const a = assessmentMatrix(analytics, "phq9", 10);
    expect(a.cells.severe["2026-02-01"]).toBeUndefined();
    expect(a.cells.mild["2026-01-01"]).toEqual({ size: 40, value: 7 });
    expect(weightedMeanByColumn(a)).toEqual([
      { col: "2026-01-01", value: 8 },
      { col: "2026-02-01", value: 6 },
    ]);
    const m = moodMatrix(analytics, 10);
    expect(weightedMeanByRow(m)).toEqual([
      { row: "Anxious", value: 4 },
      { row: "Calm", value: 6 },
    ]);
    const r = riskMatrix(analytics, 10);
    expect(r.cells.crisis["2026-01-01"]).toBeUndefined();
    expect(totalsByColumn(r)).toEqual([{ col: "2026-01-01", value: 14 }]);
  });
});
