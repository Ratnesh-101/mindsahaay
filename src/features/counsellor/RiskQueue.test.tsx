import React from "react";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  fetchRiskQueue: vi.fn(),
  advanceFollowup: vi.fn(),
  runOverdueEscalation: vi.fn(),
  subscribeRiskEvents: vi.fn(),
  fetchMySlots: vi.fn(),
  offerHandoffSlot: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), ...mocks }));
vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());

import { setupI18n } from "../journal/testSupport";
import RiskQueue, { ESCALATION_INTERVAL_MS, formatElapsed } from "./RiskQueue";
import type { FollowupStep, RiskEvent } from "./api";

const BANNER = "In-app alerts only. This is not monitored 24/7. If a student may be in immediate danger, use emergency services.";

function ev(over: Partial<RiskEvent> = {}): RiskEvent {
  const createdAt = over.createdAt ?? new Date(Date.now() - 10 * 60 * 1000).toISOString();
  return {
    id: "ev-1",
    studentId: "st-1",
    eventType: "phq9_item9",
    severity: "crisis",
    createdAt,
    resolved: false,
    currentStep: "open",
    currentStepAt: createdAt,
    isOverdue: false,
    overdueThresholdHours: 4,
    offline: false,
    detectedAt: null,
    stepTimes: {},
    reopened: false,
    ...over,
  };
}

const nameFor = () => "Calm River";

beforeAll(async () => {
  await setupI18n("en");
});

beforeEach(() => {
  mocks.fetchRiskQueue.mockReset().mockResolvedValue([]);
  mocks.advanceFollowup.mockReset().mockResolvedValue({ id: "f", eventId: "ev-1", step: "acknowledged", actorId: "co", closureReason: null, note: null, createdAt: "2026-02-08T10:00:00Z" });
  mocks.runOverdueEscalation.mockReset().mockResolvedValue(0);
  mocks.subscribeRiskEvents.mockReset().mockReturnValue(() => {});
  mocks.fetchMySlots.mockReset().mockResolvedValue([]);
  mocks.offerHandoffSlot.mockReset().mockResolvedValue({ success: true, notificationId: "notif-1" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RiskQueue safety banner", () => {
  it("is always present with the exact wording and the three helplines", async () => {
    const { rerender } = render(<RiskQueue nameFor={nameFor} />);
    expect(await screen.findByText(BANNER)).toBeInTheDocument(); // empty state
    expect(screen.getByRole("link", { name: "Call Tele-MANAS 14416" })).toHaveAttribute("href", "tel:14416");
    expect(screen.getByRole("link", { name: "Call KIRAN 1800-599-0019" })).toHaveAttribute("href", "tel:18005990019");
    expect(screen.getByRole("link", { name: "Call Emergency 112" })).toHaveAttribute("href", "tel:112");

    mocks.fetchRiskQueue.mockResolvedValue([ev()]);
    rerender(<RiskQueue nameFor={nameFor} />);
    expect(screen.getByText(BANNER)).toBeInTheDocument();
  });

  it("stays visible when the queue fails to load", async () => {
    mocks.fetchRiskQueue.mockRejectedValue(new Error("down"));
    render(<RiskQueue nameFor={nameFor} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not load the risk queue");
    expect(screen.getByText(BANNER)).toBeInTheDocument();
  });

  it("appears above the event list", async () => {
    mocks.fetchRiskQueue.mockResolvedValue([ev()]);
    render(<RiskQueue nameFor={nameFor} />);
    const banner = screen.getByTestId("risk-banner");
    const list = await screen.findByTestId("risk-event");
    expect(banner.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("RiskQueue step actions", () => {
  const LABELS: Record<FollowupStep, string | null> = {
    open: "Acknowledge",
    acknowledged: "Mark contacted",
    contacted: "Hand off",
    handed_off: "Close event",
    closed: null,
  };

  it.each(Object.entries(LABELS) as [FollowupStep, string | null][])("offers only the next legal step from %s", async (step, label) => {
    mocks.fetchRiskQueue.mockResolvedValue([ev({ currentStep: step })]);
    render(<RiskQueue nameFor={nameFor} />);
    const card = await screen.findByTestId("risk-event");
    if (label === null) {
      expect(within(card).queryAllByRole("button")).toHaveLength(0);
    } else {
      const stepButtons = within(card).queryAllByRole("button", { name: new RegExp(label, "i") });
      expect(stepButtons).toHaveLength(1);
      expect(stepButtons[0]).toHaveTextContent(label);
      expect(within(card).getByRole("button", { name: "Offer a session" })).toBeInTheDocument();
    }
    // The five-step progress marks exactly the current step.
    const current = within(card).getAllByRole("listitem").filter((li) => li.getAttribute("aria-current") === "step");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("data-step", step);
  });

  it("advances one step, announces it politely and shows the new timestamp", async () => {
    const user = userEvent.setup();
    mocks.fetchRiskQueue.mockResolvedValue([ev()]);
    render(<RiskQueue nameFor={nameFor} />);
    await user.click(await screen.findByRole("button", { name: "Acknowledge for Calm River" }));
    expect(mocks.advanceFollowup).toHaveBeenCalledWith("ev-1", "acknowledged", null, "");
    const status = await screen.findByText(/Calm River: moved to Acknowledged/);
    expect(status.closest("[role=status]")).toHaveAttribute("aria-live", "polite");
    const card = screen.getByTestId("risk-event");
    expect(within(card).getByRole("button", { name: /Mark contacted/ })).toBeInTheDocument();
    expect(card.querySelector('[data-step="acknowledged"]')).toHaveAttribute("aria-current", "step");
  });

  it("sends the optional note, counts characters and warns about message content", async () => {
    const user = userEvent.setup();
    mocks.fetchRiskQueue.mockResolvedValue([ev()]);
    render(<RiskQueue nameFor={nameFor} />);
    const note = await screen.findByLabelText(/Optional note for the record/);
    expect(note).toHaveAttribute("maxlength", "500");
    expect(screen.getByText(/Do not write what the student said or wrote/)).toBeInTheDocument();
    expect(screen.getByTestId("note-counter")).toHaveTextContent("0 of 500 characters");
    await user.type(note, "Called hostel warden");
    expect(screen.getByTestId("note-counter")).toHaveTextContent("20 of 500 characters");
    await user.click(screen.getByRole("button", { name: /Acknowledge/ }));
    expect(mocks.advanceFollowup).toHaveBeenCalledWith("ev-1", "acknowledged", null, "Called hostel warden");
  });

  it("requires a closure reason from the fixed list before closing", async () => {
    const user = userEvent.setup();
    mocks.advanceFollowup.mockResolvedValue({ id: "f", eventId: "ev-1", step: "closed", actorId: "co", closureReason: "false_alarm", note: null, createdAt: "2026-02-08T10:00:00Z" });
    mocks.fetchRiskQueue.mockResolvedValue([ev({ currentStep: "handed_off" })]);
    render(<RiskQueue nameFor={nameFor} />);
    const close = await screen.findByRole("button", { name: "Close event for Calm River" });
    expect(close).toBeDisabled();
    expect(screen.getByText("Choose a closure reason to close this event.")).toBeInTheDocument();
    const select = screen.getByLabelText("Closure reason");
    expect(within(select).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual([
      "",
      "student_reached_safe",
      "referred_to_counsellor_session",
      "referred_to_emergency_services",
      "unable_to_reach_documented",
      "false_alarm",
    ]);
    await user.click(close);
    expect(mocks.advanceFollowup).not.toHaveBeenCalled();
    await user.selectOptions(select, "false_alarm");
    expect(close).toBeEnabled();
    await user.click(close);
    expect(mocks.advanceFollowup).toHaveBeenCalledWith("ev-1", "closed", "false_alarm", "");
    await waitFor(() => expect(screen.queryByTestId("risk-event")).not.toBeInTheDocument());
    expect(screen.getByText(/moved to Closed/)).toBeInTheDocument();
  });

  it("surfaces a failed step in a role=alert and keeps the action available", async () => {
    const user = userEvent.setup();
    mocks.advanceFollowup.mockRejectedValue(new Error("illegal transition"));
    mocks.fetchRiskQueue.mockResolvedValue([ev()]);
    render(<RiskQueue nameFor={nameFor} />);
    await user.click(await screen.findByRole("button", { name: /Acknowledge/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not save that step");
    expect(screen.getByRole("button", { name: /Acknowledge/ })).toBeEnabled();
  });

  it("disables the form while a step is being saved", async () => {
    const user = userEvent.setup();
    let release: (v: unknown) => void = () => {};
    mocks.advanceFollowup.mockReturnValue(new Promise((r) => (release = r)));
    mocks.fetchRiskQueue.mockResolvedValue([ev()]);
    render(<RiskQueue nameFor={nameFor} />);
    await user.click(await screen.findByRole("button", { name: /Acknowledge/ }));
    const btn = await screen.findByRole("button", { name: /Acknowledge/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Saving...");
    await act(async () => release({ id: "f", eventId: "ev-1", step: "acknowledged", actorId: "co", closureReason: null, note: null, createdAt: "2026-02-08T10:00:00Z" }));
  });
});

describe("RiskQueue overdue, timer and offline line", () => {
  it("shows the overdue badge from the server flag", async () => {
    mocks.fetchRiskQueue.mockResolvedValue([ev({ isOverdue: true })]);
    render(<RiskQueue nameFor={nameFor} />);
    expect(await screen.findByTestId("overdue-badge")).toHaveTextContent("Overdue");
  });

  it("also flags an event still open past its threshold on the client", async () => {
    const old = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
    mocks.fetchRiskQueue.mockResolvedValue([ev({ createdAt: old, overdueThresholdHours: 4 })]);
    render(<RiskQueue nameFor={nameFor} />);
    expect(await screen.findByTestId("overdue-badge")).toBeInTheDocument();
    expect(screen.getByText(/within 4 hours/)).toBeInTheDocument();
  });

  it("does not flag fresh or already-acknowledged events", async () => {
    const old = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
    mocks.fetchRiskQueue.mockResolvedValue([ev({ id: "a" }), ev({ id: "b", createdAt: old, currentStep: "acknowledged" })]);
    render(<RiskQueue nameFor={nameFor} />);
    await screen.findAllByTestId("risk-event");
    expect(screen.queryByTestId("overdue-badge")).not.toBeInTheDocument();
  });

  it("shows a live timer since created_at that keeps ticking", async () => {
    vi.useFakeTimers();
    mocks.fetchRiskQueue.mockResolvedValue([ev({ createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() })]);
    render(<RiskQueue nameFor={nameFor} />);
    await act(async () => {});
    expect(screen.getByTestId("elapsed")).toHaveTextContent("Open for 5m");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    });
    expect(screen.getByTestId("elapsed")).toHaveTextContent("Open for 7m");
  });

  it("formats elapsed time", () => {
    expect(formatElapsed(10_000)).toBe("<1m");
    expect(formatElapsed(45 * 60_000)).toBe("45m");
    expect(formatElapsed(3 * 3600_000 + 5 * 60_000)).toBe("3h 05m");
    expect(formatElapsed(50 * 3600_000)).toBe("2d 2h");
    expect(formatElapsed(-5)).toBe("<1m");
  });

  it("shows when an event was detected offline and when it arrived", async () => {
    mocks.fetchRiskQueue.mockResolvedValue([ev({ offline: true, detectedAt: "2026-02-08T06:00:00Z", createdAt: "2026-02-08T09:00:00Z" })]);
    render(<RiskQueue nameFor={nameFor} />);
    const line = await screen.findByTestId("offline-line");
    expect(line).toHaveTextContent(/Detected .+ while the student was offline, received .+/);
    expect(line.textContent).toContain(new Date("2026-02-08T06:00:00Z").toLocaleString());
    expect(line.textContent).toContain(new Date("2026-02-08T09:00:00Z").toLocaleString());
  });

  it("shows no offline line for ordinary events", async () => {
    mocks.fetchRiskQueue.mockResolvedValue([ev()]);
    render(<RiskQueue nameFor={nameFor} />);
    await screen.findByTestId("risk-event");
    expect(screen.queryByTestId("offline-line")).not.toBeInTheDocument();
  });

  it("notes when the student reopened the event from a check-back", async () => {
    mocks.fetchRiskQueue.mockResolvedValue([ev({ reopened: true })]);
    render(<RiskQueue nameFor={nameFor} />);
    expect(await screen.findByText(/asked to talk in a check-back/)).toBeInTheDocument();
  });
});

describe("RiskQueue escalation and realtime", () => {
  it("runs the overdue escalation on open and every 5 minutes, reloading when notifications were created", async () => {
    vi.useFakeTimers();
    mocks.runOverdueEscalation.mockResolvedValueOnce(2).mockResolvedValue(0);
    render(<RiskQueue nameFor={nameFor} />);
    await act(async () => {});
    expect(mocks.runOverdueEscalation).toHaveBeenCalledTimes(1);
    const loadsAfterOpen = mocks.fetchRiskQueue.mock.calls.length;
    expect(loadsAfterOpen).toBe(2); // initial load plus reload after escalation created notifications
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESCALATION_INTERVAL_MS);
    });
    expect(mocks.runOverdueEscalation).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESCALATION_INTERVAL_MS);
    });
    expect(mocks.runOverdueEscalation).toHaveBeenCalledTimes(3);
  });

  it("stops the escalation timer and the subscription on unmount", async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    mocks.subscribeRiskEvents.mockReturnValue(unsubscribe);
    const { unmount } = render(<RiskQueue nameFor={nameFor} />);
    await act(async () => {});
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ESCALATION_INTERVAL_MS * 2);
    expect(mocks.runOverdueEscalation).toHaveBeenCalledTimes(1);
  });

  it("announces new events from Realtime and reloads", async () => {
    let handlers: { onInsert: (c: unknown) => void; onUpdate: (c: unknown) => void; onStatus?: (live: boolean) => void } | undefined;
    mocks.subscribeRiskEvents.mockImplementation((h) => {
      handlers = h;
      return () => {};
    });
    render(<RiskQueue nameFor={nameFor} />);
    await screen.findByText("No open risk events.");
    mocks.fetchRiskQueue.mockResolvedValue([ev()]);
    act(() => {
      handlers?.onStatus?.(true);
      handlers?.onInsert({ id: "ev-1", severity: "crisis" });
    });
    expect(await screen.findByTestId("risk-event")).toBeInTheDocument();
    expect(screen.getByText("A new risk event arrived.")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    mocks.fetchRiskQueue.mockResolvedValue([]);
    act(() => handlers?.onUpdate({ id: "ev-1", severity: "crisis" }));
    await waitFor(() => expect(screen.queryByTestId("risk-event")).not.toBeInTheDocument());
  });
});

describe("RiskQueue accessibility", () => {
  it("uses labelled controls, a polite status region and a labelled progress list", async () => {
    mocks.fetchRiskQueue.mockResolvedValue([ev({ currentStep: "handed_off" })]);
    render(<RiskQueue nameFor={nameFor} />);
    await screen.findByTestId("risk-event");
    expect(screen.getByRole("region", { name: "Risk-event queue" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Follow-up progress for Calm River" })).toBeInTheDocument();
    expect(screen.getByLabelText("Closure reason")).toBeInTheDocument();
    expect(screen.getByLabelText(/Optional note for the record/)).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((s) => s.getAttribute("aria-live") === "polite")).toBe(true);
    expect(screen.getByRole("note", { name: "Read this first" })).toBeInTheDocument();
  });
});

describe("RiskQueue offer session flow", () => {
  it("allows counsellor to open offer form, choose slot, and submit offer", async () => {
    const user = userEvent.setup();
    const slot = {
      id: "slot-1",
      counsellorId: "co-1",
      startTime: "2026-11-21T10:00:00Z",
      endTime: "2026-11-21T11:00:00Z",
    };
    mocks.fetchRiskQueue.mockResolvedValue([ev({ currentStep: "acknowledged" })]);
    mocks.fetchMySlots.mockResolvedValue([slot]);
    render(<RiskQueue nameFor={nameFor} />);

    const offerBtn = await screen.findByRole("button", { name: "Offer a session" });
    await user.click(offerBtn);

    expect(await screen.findByText(/Offer an appointment slot to Calm River/)).toBeInTheDocument();
    expect(mocks.fetchMySlots).toHaveBeenCalled();

    const sendBtn = screen.getByRole("button", { name: "Send offer" });
    expect(sendBtn).toBeEnabled();

    await user.click(sendBtn);
    expect(mocks.offerHandoffSlot).toHaveBeenCalledWith("ev-1", "slot-1", "");
    expect(await screen.findByText("Session slot offered to Calm River.")).toBeInTheDocument();
  });

  it("shows an alert when offering a slot fails", async () => {
    const user = userEvent.setup();
    const slot = {
      id: "slot-1",
      counsellorId: "co-1",
      startTime: "2026-11-21T10:00:00Z",
      endTime: "2026-11-21T11:00:00Z",
    };
    mocks.fetchRiskQueue.mockResolvedValue([ev({ currentStep: "acknowledged" })]);
    mocks.fetchMySlots.mockResolvedValue([slot]);
    mocks.offerHandoffSlot.mockRejectedValue(new Error("RPC failed"));
    render(<RiskQueue nameFor={nameFor} />);

    await user.click(await screen.findByRole("button", { name: "Offer a session" }));
    await user.click(await screen.findByRole("button", { name: "Send offer" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not offer that slot/i);
  });

  it("displays no slots message when no unbooked slots are available", async () => {
    const user = userEvent.setup();
    mocks.fetchRiskQueue.mockResolvedValue([ev({ currentStep: "acknowledged" })]);
    mocks.fetchMySlots.mockResolvedValue([]);
    render(<RiskQueue nameFor={nameFor} />);

    await user.click(await screen.findByRole("button", { name: "Offer a session" }));
    expect(await screen.findByText(/No upcoming unbooked availability slots found/)).toBeInTheDocument();
  });
});

describe("RiskQueue review fixes", () => {
  const slot = (id: string) => ({ id, counsellorId: "co-1", startTime: "2026-11-21T10:00:00Z", endTime: "2026-11-21T11:00:00Z" });

  it("never shows free text from the event type (G6-SEC-08)", async () => {
    mocks.fetchRiskQueue.mockResolvedValue([ev({ eventType: "FALSE ALARM - RESOLVED" }), ev({ id: "ev-2", eventType: "phq9_item9" })]);
    render(<RiskQueue nameFor={nameFor} />);
    const cards = await screen.findAllByTestId("risk-event");
    expect(cards).toHaveLength(2);
    expect(screen.queryByText(/FALSE ALARM/i)).not.toBeInTheDocument();
    expect(cards[0].textContent).toContain("Other alert");
    expect(cards[1].textContent).toContain("PHQ-9 item 9 answer");
  });

  it("sends one step when the button is activated twice in the same tick", async () => {
    mocks.fetchRiskQueue.mockResolvedValue([ev()]);
    render(<RiskQueue nameFor={nameFor} />);
    const btn = await screen.findByRole("button", { name: /Acknowledge/ });
    act(() => {
      fireEvent.click(btn);
      fireEvent.click(btn);
    });
    await screen.findByText(/moved to Acknowledged/);
    expect(mocks.advanceFollowup).toHaveBeenCalledTimes(1);
  });

  it("sends one offer when 'Send offer' is activated twice in the same tick", async () => {
    const user = userEvent.setup();
    mocks.fetchRiskQueue.mockResolvedValue([ev({ currentStep: "acknowledged" })]);
    mocks.fetchMySlots.mockResolvedValue([slot("slot-1")]);
    render(<RiskQueue nameFor={nameFor} />);
    await user.click(await screen.findByRole("button", { name: "Offer a session" }));
    const send = await screen.findByRole("button", { name: "Send offer" });
    act(() => {
      fireEvent.click(send);
      fireEvent.click(send);
    });
    await screen.findByText("Session slot offered to Calm River.");
    expect(mocks.offerHandoffSlot).toHaveBeenCalledTimes(1);
  });

  it("reloads the slot list every time the offer panel opens, so it is never stale", async () => {
    const user = userEvent.setup();
    mocks.fetchRiskQueue.mockResolvedValue([ev({ currentStep: "acknowledged" })]);
    mocks.fetchMySlots.mockResolvedValueOnce([slot("slot-1")]).mockResolvedValueOnce([slot("slot-2")]);
    render(<RiskQueue nameFor={nameFor} />);
    const toggle = await screen.findByRole("button", { name: "Offer a session" });
    await user.click(toggle);
    await screen.findByRole("button", { name: "Send offer" });
    await user.click(toggle);
    await user.click(toggle);
    await waitFor(() => expect(mocks.fetchMySlots).toHaveBeenCalledTimes(2));
    await user.click(await screen.findByRole("button", { name: "Send offer" }));
    expect(mocks.offerHandoffSlot).toHaveBeenCalledWith("ev-1", "slot-2", "");
  });

  it("when the offer fails the slot list is refreshed so a taken slot cannot be re-sent", async () => {
    const user = userEvent.setup();
    mocks.fetchRiskQueue.mockResolvedValue([ev({ currentStep: "acknowledged" })]);
    mocks.fetchMySlots.mockResolvedValueOnce([slot("slot-1")]).mockResolvedValueOnce([]);
    mocks.offerHandoffSlot.mockRejectedValueOnce(new Error("slot taken"));
    render(<RiskQueue nameFor={nameFor} />);
    await user.click(await screen.findByRole("button", { name: "Offer a session" }));
    await user.click(await screen.findByRole("button", { name: "Send offer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not offer that slot/i);
    expect(await screen.findByText(/No upcoming unbooked availability slots found/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send offer" })).not.toBeInTheDocument();
  });

  it("returns focus to the 'Offer a session' button after sending, and on Escape", async () => {
    const user = userEvent.setup();
    mocks.fetchRiskQueue.mockResolvedValue([ev({ currentStep: "acknowledged" })]);
    mocks.fetchMySlots.mockResolvedValue([slot("slot-1"), slot("slot-2")]);
    render(<RiskQueue nameFor={nameFor} />);
    const toggle = await screen.findByRole("button", { name: "Offer a session" });
    await user.click(toggle);
    const select = await screen.findByLabelText("Select an available slot");
    await waitFor(() => expect(select).toHaveFocus());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Send offer" })).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();

    await user.click(toggle);
    await user.click(await screen.findByRole("button", { name: "Send offer" }));
    await screen.findByText("Session slot offered to Calm River.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Offer a session" })).toHaveFocus());
  });

  it("announces the offer result through a live region that already exists", async () => {
    const user = userEvent.setup();
    mocks.fetchRiskQueue.mockResolvedValue([ev({ currentStep: "acknowledged" })]);
    mocks.fetchMySlots.mockResolvedValue([slot("slot-1")]);
    render(<RiskQueue nameFor={nameFor} />);
    const card = await screen.findByTestId("risk-event");
    const region = within(card).getByTestId("offer-status");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toBeEmptyDOMElement();
    await user.click(within(card).getByRole("button", { name: "Offer a session" }));
    await user.click(await screen.findByRole("button", { name: "Send offer" }));
    await waitFor(() => expect(region).toHaveTextContent("Session slot offered to Calm River."));
  });

  it("tells a counsellor the queue refresh failed after it had loaded, without hiding the events", async () => {
    vi.useFakeTimers();
    mocks.fetchRiskQueue.mockResolvedValueOnce([ev()]).mockRejectedValue(new Error("down"));
    render(<RiskQueue nameFor={nameFor} />);
    await act(async () => {});
    expect(screen.getByTestId("risk-event")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESCALATION_INTERVAL_MS);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("could not load the risk queue");
    expect(screen.getByTestId("risk-event")).toBeInTheDocument();
  });
});