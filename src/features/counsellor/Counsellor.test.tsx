import React from "react";
import { act } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("../../shared/lib/supabase", async () => {
  const m = (await import("../journal/testSupport")).supabaseModule();
  // Prototype-linked so vi.spyOn(fakeSupabase, "from") still takes effect.
  const client = Object.assign(Object.create(m.supabase), { rpc: rpcMock });
  return { ...m, supabase: client, default: client };
});
vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div data-testid="chart-part">{children}</div>;
  return {
    ResponsiveContainer: Pass,
    LineChart: ({ data, children }: { data: unknown[]; children?: React.ReactNode }) => (
      <div data-testid="line-chart" data-points={data.length}>
        {children}
      </div>
    ),
    Line: () => null,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    BarChart: Pass,
    Bar: () => null,
  };
});

import { fake, fakeSupabase, resetFake, setupI18n } from "../journal/testSupport";
import { createVault, generateRecoveryCode, lockVault } from "../journal/vault";
import { decryptJournal } from "../../domain/crypto/journalCrypto";
import CounsellorDashboard from "./CounsellorDashboard";
import { fetchSessionNotes, isShareCurrent, packNote, saveSessionNote, sortRiskQueue, unpackNote, type RiskEvent } from "./api";

const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

function seed() {
  resetFake(
    {
      care_shares: [
        { id: "cs-1", student_id: "st-1", counsellor_id: "co-1", active: true, scope: ["assessments", "risk_events"], expires_at: future, revoked_at: null, profiles: { alias: "Calm River" } },
        { id: "cs-2", student_id: "st-2", counsellor_id: "co-1", active: true, scope: ["moods"], expires_at: past, revoked_at: null, profiles: { alias: "Expired Student" } },
        { id: "cs-3", student_id: "st-3", counsellor_id: "co-1", active: false, scope: ["assessments"], expires_at: null, revoked_at: past, profiles: { alias: "Revoked Student" } },
        { id: "cs-4", student_id: "st-4", counsellor_id: "other-counsellor", active: true, scope: ["assessments"], expires_at: null, revoked_at: null, profiles: { alias: "Someone Else's" } },
        { id: "cs-5", student_id: "st-5aaa", counsellor_id: "co-1", active: true, scope: ["all"], expires_at: null, revoked_at: null, profiles: null },
      ],
      assessments: [
        { id: "as-1", student_id: "st-1", instrument: "phq9", total: 14, completed_at: "2026-01-05T10:00:00Z" },
        { id: "as-2", student_id: "st-1", instrument: "phq9", total: 9, completed_at: "2026-02-05T10:00:00Z" },
        { id: "as-3", student_id: "st-1", instrument: "gad7", total: 11, completed_at: "2026-02-06T10:00:00Z" },
        { id: "as-4", student_id: "st-1", instrument: "phq4", total: 5, completed_at: "2026-02-07T10:00:00Z" },
      ],
      risk_queue: [
        { id: "re-1", student_id: "st-1", event_type: "phq9_item9", severity_level: "crisis", resolved: false, created_at: "2026-02-08T09:00:00Z", current_step: "open", current_step_at: "2026-02-08T09:00:00Z", is_overdue: false, overdue_threshold_hours: 4, payload: {} },
        { id: "re-2", student_id: "st-1", event_type: "lexicon_match", severity_level: "medium", resolved: false, created_at: "2026-02-08T08:00:00Z", current_step: "open", current_step_at: "2026-02-08T08:00:00Z", is_overdue: false, overdue_threshold_hours: null, payload: {} },
        { id: "re-3", student_id: "st-1", event_type: "old", severity_level: "low", resolved: true, created_at: "2026-02-01T08:00:00Z", current_step: "closed", current_step_at: "2026-02-02T08:00:00Z", is_overdue: false, overdue_threshold_hours: null, payload: {} },
      ],
      risk_followups: [],
      appointments: [{ id: "ap-1", student_id: "st-1", counsellor_id: "co-1", scheduled_at: "2026-02-10T10:00:00Z" }],
      session_notes: [],
      audit_log: [],
    },
    "co-1",
  );
}

beforeAll(async () => {
  await setupI18n("en");
});

beforeEach(() => {
  seed();
  rpcMock.mockReset();
  rpcMock.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "escalate_overdue_risk") return { data: 0, error: null };
    const row = { id: "fu-1", risk_event_id: args.p_event_id, step: args.p_step, actor_id: "co-1", closure_reason: args.p_closure_reason, note: args.p_note, created_at: "2026-02-08T10:00:00Z" };
    fake.tables.risk_followups.push(row);
    const ev = fake.tables.risk_queue.find((r) => r.id === args.p_event_id);
    if (ev) Object.assign(ev, { current_step: args.p_step, resolved: args.p_step === "closed" });
    return { data: row, error: null };
  });
  lockVault();
});

describe("Counsellor dashboard", () => {
  it("shows the audit notice and only consented, unexpired students", async () => {
    render(<CounsellorDashboard />);
    expect(screen.getByTestId("audit-notice")).toHaveTextContent("Every access is logged");
    expect(await screen.findByRole("button", { name: "Open Calm River" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Student ST-5" })).toBeInTheDocument();
    expect(screen.queryByText("Expired Student")).not.toBeInTheDocument();
    expect(screen.queryByText("Revoked Student")).not.toBeInTheDocument();
    expect(screen.queryByText(/Someone Else/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Consented caseload (2)" })).toBeInTheDocument();
    // Loading the caseload is itself audited.
    await waitFor(() => expect(fake.tables.audit_log.some((a) => a.action === "COUNSELLOR_VIEWED_CASELOAD")).toBe(true));
  });

  it("charts PHQ-9 and GAD-7 trajectories for the selected student and audits the access", async () => {
    const user = userEvent.setup();
    render(<CounsellorDashboard />);
    await user.click(await screen.findByRole("button", { name: "Open Calm River" }));
    await screen.findByRole("heading", { name: "Viewing Calm River" });
    await waitFor(() => expect(screen.getAllByTestId("line-chart")).toHaveLength(2));
    const charts = screen.getAllByTestId("line-chart");
    expect(charts.map((c) => c.getAttribute("data-points"))).toEqual(["2", "1"]);
    expect(screen.getAllByText(/Show PHQ-9 data as a table|Show GAD-7 data as a table/)).toHaveLength(2);
    expect(screen.getByText(/not diagnoses/)).toBeInTheDocument();

    const audit = fake.tables.audit_log.find((a) => a.action === "COUNSELLOR_VIEWED_ASSESSMENTS");
    expect(audit).toMatchObject({ actor_id: "co-1", resource_type: "student", resource_id: "st-1" });
  });

  it("lists open risk events by severity and refetches the queue when Realtime reports a change", async () => {
    render(<CounsellorDashboard />);
    const queue = (await screen.findByRole("heading", { name: "Risk-event queue" })).closest("section") as HTMLElement;
    await waitFor(() => expect(within(queue).getAllByTestId("risk-event")).toHaveLength(2));
    const items = within(queue).getAllByTestId("risk-event");
    expect(items[0]).toHaveTextContent(/Crisis/);
    expect(items[1]).toHaveTextContent(/Medium/);
    expect(within(queue).getByText("Live")).toBeInTheDocument();
    expect(fake.channelHandlers).toHaveLength(1);

    fake.tables.risk_queue.push({ id: "re-9", student_id: "st-1", event_type: "chat_crisis", severity_level: "high", resolved: false, created_at: "2026-02-09T09:00:00Z", current_step: "open", current_step_at: "2026-02-09T09:00:00Z", is_overdue: false, overdue_threshold_hours: 12, payload: {} });
    act(() => {
      fake.channelHandlers[0]({ eventType: "INSERT", new: { id: "re-9", severity_level: "high" } });
    });
    await waitFor(() => expect(within(queue).getAllByTestId("risk-event")).toHaveLength(3));
    expect(within(queue).getByText(/A new risk event arrived/)).toBeInTheDocument();
    expect(within(queue).getAllByTestId("risk-event")[1]).toHaveTextContent(/High/);

    // An UPDATE (closed elsewhere) removes it.
    Object.assign(fake.tables.risk_queue.find((r) => r.id === "re-9")!, { resolved: true, current_step: "closed" });
    act(() => {
      fake.channelHandlers[0]({ eventType: "UPDATE", new: { id: "re-9", severity_level: "high" } });
    });
    await waitFor(() => expect(within(queue).getAllByTestId("risk-event")).toHaveLength(2));
  });

  it("walks an event through the steps through the RPC and unsubscribes on unmount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<CounsellorDashboard />);
    await user.click((await screen.findAllByRole("button", { name: "Acknowledge for Calm River" }))[0]);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith("advance_risk_followup", expect.objectContaining({ p_event_id: "re-1", p_step: "acknowledged" })));
    expect(await screen.findByText(/Calm River: moved to Acknowledged/)).toBeInTheDocument();
    unmount();
    expect(fake.removedChannels).toBe(1);
  });
  it("shows an empty state when nobody has shared data, and an error with retry when loading fails", async () => {
    delete (fake.tables as Record<string, unknown>).care_shares;
    const user = userEvent.setup();
    const { unmount } = render(<CounsellorDashboard />);
    expect(await screen.findByText(/No students have shared data/)).toBeInTheDocument();
    unmount();

    seed();
    const spy = vi.spyOn(fakeSupabase, "from").mockImplementationOnce(() => {
      throw new Error("boom");
    });
    render(<CounsellorDashboard />);
    expect(await screen.findByText(/could not load your dashboard/i)).toBeInTheDocument();
    spy.mockRestore();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Open Calm River" })).toBeInTheDocument();
  });
});

describe("Encrypted session notes", () => {
  it("encrypts notes with the counsellor's own vault passphrase", { timeout: 60000 }, async () => {
    const PASS = "counsellor private pass";
    await createVault(PASS, generateRecoveryCode());
    const user = userEvent.setup();
    render(<CounsellorDashboard />);
    await user.click(await screen.findByRole("button", { name: "Open Calm River" }));
    await user.type(await screen.findByLabelText("Session note"), "Student reports poor sleep before exams.");
    await user.click(screen.getByRole("button", { name: "Encrypt and save note" }));
    expect(await screen.findByText("Note encrypted and saved.")).toBeInTheDocument();
    expect(screen.getByText("Student reports poor sleep before exams.")).toBeInTheDocument();

    const row = fake.tables.session_notes[0];
    expect(JSON.stringify(row)).not.toContain("poor sleep");
    expect(row).toMatchObject({ appointment_id: "ap-1", counsellor_id: "co-1", student_id: "st-1" });
    const { salt, ciphertext } = unpackNote(String(row.ciphertext));
    expect(await decryptJournal({ ciphertext, iv: String(row.iv), salt }, PASS)).toBe("Student reports poor sleep before exams.");
    expect(fake.tables.audit_log.some((a) => a.action === "COUNSELLOR_WROTE_SESSION_NOTE")).toBe(true);

    await expect(fetchSessionNotes("st-1", "wrong passphrase!!")).rejects.toMatchObject({ code: "CRYPTO_DECRYPT_FAILED" });
    const notes = await fetchSessionNotes("st-1", PASS);
    expect(notes).toHaveLength(1);
  });

  it("requires a note before saving", { timeout: 60000 }, async () => {
    await createVault("counsellor private pass", generateRecoveryCode());
    const user = userEvent.setup();
    render(<CounsellorDashboard />);
    await user.click(await screen.findByRole("button", { name: "Open Calm River" }));
    await user.click(await screen.findByRole("button", { name: "Encrypt and save note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("write a note");
    expect(fake.tables.session_notes).toHaveLength(0);
  });

  it("a saved note is shown again after a reload once the counsellor unlocks the vault", { timeout: 60000 }, async () => {
    const PASS = "counsellor private pass";
    await createVault(PASS, generateRecoveryCode());
    const user = userEvent.setup();
    const first = render(<CounsellorDashboard />);
    await user.click(await screen.findByRole("button", { name: "Open Calm River" }));
    await user.type(await screen.findByLabelText("Session note"), "Follow up on sleep in two weeks.");
    await user.click(screen.getByRole("button", { name: "Encrypt and save note" }));
    await screen.findByText("Note encrypted and saved.");
    first.unmount();

    lockVault();
    render(<CounsellorDashboard />);
    await user.click(await screen.findByRole("button", { name: "Open Calm River" }));
    expect(await screen.findByRole("heading", { name: "Unlock your private vault" })).toBeInTheDocument();
    expect(screen.queryByText("Follow up on sleep in two weeks.")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Passphrase"), PASS);
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText("Follow up on sleep in two weeks.")).toBeInTheDocument();
  });

  it("a failed note save shows an alert, no success message, and keeps the text", { timeout: 60000 }, async () => {
    await createVault("counsellor private pass", generateRecoveryCode());
    const user = userEvent.setup();
    render(<CounsellorDashboard />);
    await user.click(await screen.findByRole("button", { name: "Open Calm River" }));
    await user.type(await screen.findByLabelText("Session note"), "Keep this note text.");
    fake.failTables = ["session_notes"];
    await user.click(screen.getByRole("button", { name: "Encrypt and save note" }));
    expect(await screen.findByText("We could not save the note.")).toBeInTheDocument();
    expect(screen.queryByText("Note encrypted and saved.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Session note")).toHaveValue("Keep this note text.");
  });
});

describe("counsellor helpers", () => {
  it("evaluates care-share currency", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    expect(isShareCurrent({ active: true, expires_at: null }, now)).toBe(true);
    expect(isShareCurrent({ active: true, expires_at: "2026-03-02T00:00:00Z" }, now)).toBe(true);
    expect(isShareCurrent({ active: true, expires_at: "2026-02-28T00:00:00Z" }, now)).toBe(false);
    expect(isShareCurrent({ active: false }, now)).toBe(false);
    expect(isShareCurrent({ active: true, revoked_at: "2026-02-01T00:00:00Z" }, now)).toBe(false);
  });

  it("sorts the risk queue by severity, then overdue, then age", () => {
    const mk = (id: string, severity: RiskEvent["severity"], createdAt: string, isOverdue = false): RiskEvent => ({
      id, studentId: "s", eventType: "x", severity, createdAt, resolved: false, currentStep: "open", currentStepAt: createdAt, isOverdue, overdueThresholdHours: null, offline: false, detectedAt: null, stepTimes: {}, reopened: false,
    });
    const sorted = sortRiskQueue([mk("a", "low", "1"), mk("b", "crisis", "3"), mk("c", "crisis", "2"), mk("d", "high", "1"), mk("e", "crisis", "4", true)]);
    expect(sorted.map((e) => e.id)).toEqual(["e", "c", "b", "d", "a"]);
  });
  it("packs and unpacks salt with ciphertext", async () => {
    expect(unpackNote(packNote({ salt: "SALT==", ciphertext: "a+b/c==" }))).toEqual({ salt: "SALT==", ciphertext: "a+b/c==" });
    expect(() => unpackNote("nodothere")).toThrow();
    expect(() => unpackNote(".leading")).toThrow();
    await expect(saveSessionNote({ appointmentId: "a", studentId: "s", text: "t" }, "")).rejects.toThrow();
  });
});
