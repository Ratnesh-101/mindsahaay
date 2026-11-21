import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("../../shared/lib/supabase", async () => {
  const m = (await import("../journal/testSupport")).supabaseModule();
  const client = Object.assign(Object.create(m.supabase), { rpc: rpcMock });
  return { ...m, supabase: client, default: client };
});

import { fake, resetFake } from "../journal/testSupport";
import {
  advanceFollowup,
  fetchMySlots,
  fetchRiskQueue,
  foldStepTimes,
  isEventOverdue,
  nextStep,
  offerHandoffSlot,
  resolveRiskEvent,
  runOverdueEscalation,
  subscribeRiskEvents,
  type RiskEvent,
} from "./api";

const base = {
  severity_level: "crisis",
  event_type: "phq9_item9",
  trigger_source: "phq9_item9",
  resolved: false,
  current_step: "open",
  current_step_at: "2026-02-08T09:00:00Z",
  is_overdue: false,
  overdue_threshold_hours: 4,
  student_id: "st-1",
  alias: "Calm River",
};

beforeEach(() => {
  resetFake({ risk_queue: [], risk_followups: [] }, "co-1");
  rpcMock.mockReset();
});

describe("nextStep", () => {
  it("moves exactly one step forward and stops at closed", () => {
    expect(nextStep("open")).toBe("acknowledged");
    expect(nextStep("acknowledged")).toBe("contacted");
    expect(nextStep("contacted")).toBe("handed_off");
    expect(nextStep("handed_off")).toBe("closed");
    expect(nextStep("closed")).toBeNull();
  });
});

describe("foldStepTimes", () => {
  it("keeps the first timestamp per step and starts a new cycle on a reopen", () => {
    const one = foldStepTimes([
      { step: "acknowledged", created_at: "2026-02-08T10:00:00Z" },
      { step: "open", created_at: "2026-02-08T09:00:00Z" },
    ]);
    expect(one.times).toEqual({ open: "2026-02-08T09:00:00Z", acknowledged: "2026-02-08T10:00:00Z" });
    expect(one.reopened).toBe(false);
    const two = foldStepTimes([
      { step: "open", created_at: "2026-02-08T09:00:00Z" },
      { step: "acknowledged", created_at: "2026-02-08T10:00:00Z" },
      { step: "open", created_at: "2026-02-09T10:00:00Z" },
    ]);
    expect(two.times).toEqual({ open: "2026-02-09T10:00:00Z" });
    expect(two.reopened).toBe(true);
  });
});

describe("isEventOverdue", () => {
  const e = (over: Partial<RiskEvent>) => ({ isOverdue: false, currentStep: "open" as const, createdAt: "2026-02-08T00:00:00Z", overdueThresholdHours: 4, ...over });
  const now = new Date("2026-02-08T05:00:00Z");
  it("trusts the server flag and checks open events against their threshold", () => {
    expect(isEventOverdue(e({ isOverdue: true }), now)).toBe(true);
    expect(isEventOverdue(e({}), now)).toBe(true);
    expect(isEventOverdue(e({}), new Date("2026-02-08T03:00:00Z"))).toBe(false);
    expect(isEventOverdue(e({ currentStep: "acknowledged" }), now)).toBe(false);
    expect(isEventOverdue(e({ overdueThresholdHours: null }), now)).toBe(false);
    // A reopened event is measured from when the current open step began.
    expect(isEventOverdue(e({ currentStepAt: "2026-02-08T04:00:00Z" }), now)).toBe(false);
    expect(isEventOverdue(e({ currentStepAt: "2026-02-08T00:30:00Z" }), now)).toBe(true);
  });
});

describe("fetchRiskQueue", () => {
  it("reads the risk_queue view, attaches step times and exposes only the two payload fields", async () => {
    fake.tables.risk_queue = [
      { ...base, id: "a", created_at: "2026-02-08T09:00:00Z", payload: { offline: true, detected_at: "2026-02-08T05:00:00Z", message: "SECRET STUDENT WORDS" } },
      { ...base, id: "b", created_at: "2026-02-08T08:00:00Z", severity_level: "high", payload: { detected_at: "not a date", note: "SECRET" } },
      { ...base, id: "c", created_at: "2026-02-07T08:00:00Z", resolved: true },
    ];
    fake.tables.risk_followups = [
      { risk_event_id: "a", step: "open", created_at: "2026-02-08T09:00:00Z" },
      { risk_event_id: "a", step: "acknowledged", created_at: "2026-02-08T09:30:00Z" },
    ];
    const events = await fetchRiskQueue();
    expect(events.map((e) => e.id)).toEqual(["a", "b"]); // crisis before high, resolved excluded
    expect(events[0]).toMatchObject({ offline: true, detectedAt: "2026-02-08T05:00:00Z", stepTimes: { acknowledged: "2026-02-08T09:30:00Z" } });
    expect(events[1]).toMatchObject({ offline: false, detectedAt: null });
    expect(JSON.stringify(events)).not.toContain("SECRET");
  });

  it("still returns events when step timestamps cannot be read", async () => {
    fake.tables.risk_queue = [{ ...base, id: "a", created_at: "2026-02-08T09:00:00Z", payload: {} }];
    delete (fake.tables as Record<string, unknown>).risk_followups;
    const events = await fetchRiskQueue();
    expect(events).toHaveLength(1);
    expect(events[0].currentStep).toBe("open");
  });

  it("defaults the step from the resolved flag when the view gives none", async () => {
    fake.tables.risk_queue = [{ ...base, id: "a", created_at: "x", current_step: null, payload: null }];
    expect((await fetchRiskQueue())[0].currentStep).toBe("open");
  });
});

describe("advanceFollowup", () => {
  const row = { id: "fu", risk_event_id: "ev", step: "closed", actor_id: "co-1", closure_reason: "false_alarm", note: "n", created_at: "2026-02-08T10:00:00Z" };

  it("calls the RPC with the contract parameter names and maps the row", async () => {
    rpcMock.mockResolvedValue({ data: row, error: null });
    const out = await advanceFollowup("ev", "closed", "false_alarm", "  n  ");
    expect(rpcMock).toHaveBeenCalledWith("advance_risk_followup", { p_event_id: "ev", p_step: "closed", p_closure_reason: "false_alarm", p_note: "n" });
    expect(out).toMatchObject({ eventId: "ev", step: "closed", closureReason: "false_alarm", note: "n" });
  });

  it("does not send a reason for non-closing steps and accepts array results", async () => {
    rpcMock.mockResolvedValue({ data: [{ ...row, step: "acknowledged", closure_reason: null }], error: null });
    await advanceFollowup("ev", "acknowledged", "false_alarm");
    expect(rpcMock).toHaveBeenCalledWith("advance_risk_followup", { p_event_id: "ev", p_step: "acknowledged", p_closure_reason: null, p_note: null });
  });

  it("refuses to close without a reason, with an unknown reason, or with a note over 500 characters", async () => {
    await expect(advanceFollowup("ev", "closed")).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await expect(advanceFollowup("ev", "closed", "because" as never)).rejects.toMatchObject({ code: "BAD_REASON" });
    await expect(advanceFollowup("ev", "acknowledged", null, "x".repeat(501))).rejects.toMatchObject({ code: "NOTE_TOO_LONG" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("surfaces database errors and empty responses", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "illegal transition", code: "P0001" } });
    await expect(advanceFollowup("ev", "contacted")).rejects.toMatchObject({ code: "P0001" });
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(advanceFollowup("ev", "contacted")).rejects.toMatchObject({ code: "EMPTY_RESPONSE" });
  });

  it("keeps resolveRiskEvent as a deprecated close-as-false-alarm wrapper", async () => {
    rpcMock.mockResolvedValue({ data: row, error: null });
    await resolveRiskEvent("ev");
    expect(rpcMock).toHaveBeenCalledWith("advance_risk_followup", expect.objectContaining({ p_step: "closed", p_closure_reason: "false_alarm" }));
  });
});

describe("runOverdueEscalation", () => {
  it("returns the number of notifications created", async () => {
    rpcMock.mockResolvedValue({ data: 3, error: null });
    expect(await runOverdueEscalation()).toBe(3);
    expect(rpcMock).toHaveBeenCalledWith("escalate_overdue_risk");
  });

  it("never throws: an error, odd result or signed-out user gives 0", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "nope" } });
    expect(await runOverdueEscalation()).toBe(0);
    rpcMock.mockResolvedValueOnce({ data: "x", error: null });
    expect(await runOverdueEscalation()).toBe(0);
    fake.signedIn = false;
    expect(await runOverdueEscalation()).toBe(0);
  });
});

describe("subscribeRiskEvents", () => {
  it("forwards only id and severity, ignores malformed payloads, and reports status", () => {
    const onInsert = vi.fn();
    const onUpdate = vi.fn();
    const onStatus = vi.fn();
    const off = subscribeRiskEvents({ onInsert, onUpdate, onStatus });
    expect(onStatus).toHaveBeenCalledWith(true);
    const handler = fake.channelHandlers[0];
    handler({ eventType: "INSERT", new: { id: "x", severity_level: "high", payload: { secret: 1 } } });
    handler({ eventType: "UPDATE", new: { id: "x", severity_level: "high" } });
    handler({ eventType: "DELETE", new: { id: "x" } });
    handler({ eventType: "INSERT", new: {} });
    expect(onInsert).toHaveBeenCalledWith({ id: "x", severity: "high" });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    off();
    expect(fake.removedChannels).toBe(1);
  });
});

describe("offerHandoffSlot", () => {
  it("calls RPC offer_handoff_slot and returns success with notification ID", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { success: true, notification_id: "notif-123" },
      error: null,
    });
    const res = await offerHandoffSlot("ev-1", "slot-1", "Handoff note");
    expect(res).toEqual({ success: true, notificationId: "notif-123" });
    expect(rpcMock).toHaveBeenCalledWith("offer_handoff_slot", {
      p_event_id: "ev-1",
      p_slot_id: "slot-1",
      p_note: "Handoff note",
    });
  });

  it("throws ApiError if note exceeds 500 characters", async () => {
    const longNote = "a".repeat(501);
    await expect(offerHandoffSlot("ev-1", "slot-1", longNote)).rejects.toMatchObject({
      code: "NOTE_TOO_LONG",
    });
  });

  it("throws ApiError if RPC returns error", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Slot already booked", code: "P0001" },
    });
    await expect(offerHandoffSlot("ev-1", "slot-1")).rejects.toMatchObject({
      code: "P0001",
    });
  });
});

describe("fetchMySlots", () => {
  it("fetches slots for the signed-in counsellor", async () => {
    resetFake(
      {
        availability_slots: [
          {
            id: "s-1",
            counsellor_id: "co-1",
            start_time: "2026-11-21T10:00:00Z",
            end_time: "2026-11-21T11:00:00Z",
            is_booked: false,
          },
        ],
      },
      "co-1",
    );
    const slots = await fetchMySlots(new Date("2026-11-20T00:00:00Z"));
    expect(slots).toHaveLength(1);
    expect(slots[0].id).toBe("s-1");
  });
});

describe("G6-SEC-08: only intended, known values reach the counsellor UI", () => {
  it("maps known event types to their own label key and anything else to 'other'", async () => {
    const { eventTypeLabelKey } = await import("./api");
    expect(eventTypeLabelKey("phq9_item9")).toBe("counsellor.eventType.phq9_item9");
    expect(eventTypeLabelKey("chat_crisis")).toBe("counsellor.eventType.chat_crisis");
    expect(eventTypeLabelKey("FALSE ALARM - RESOLVED")).toBe("counsellor.eventType.other");
    expect(eventTypeLabelKey("<img src=x>")).toBe("counsellor.eventType.other");
  });

  it("treats an unknown severity as high instead of passing it through", async () => {
    resetFake({ risk_queue: [{ ...base, id: "e1", created_at: "2026-02-08T09:00:00Z", severity_level: "ALL CLEAR", payload: {} }], risk_followups: [] }, "co-1");
    const [event] = await fetchRiskQueue();
    expect(event.severity).toBe("high");
  });
});