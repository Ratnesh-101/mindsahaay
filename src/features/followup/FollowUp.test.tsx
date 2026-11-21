import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("../../shared/lib/supabase", async () => {
  const m = (await import("../journal/testSupport")).supabaseModule();
  const client = Object.assign(Object.create(m.supabase), { rpc: rpcMock });
  return { ...m, supabase: client, default: client };
});

import i18n from "i18next";
import { fake, resetFake, setupI18n } from "../journal/testSupport";
import FollowUpCard from "./FollowUpCard";
import * as followupApi from "./api";
import {
  acceptHandoffOffer,
  answerCheckback,
  declineHandoffOffer,
  fetchMyFollowups,
  getCheckbackOptOut,
  isPromptHidden,
  setCheckbackOptOut,
  setServerCheckbackOptOut,
} from "./api";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();
const hoursAhead = (h: number) => new Date(Date.now() + h * 3600 * 1000).toISOString();
const future = hoursAhead(24 * 7);

function event(over: Record<string, unknown> = {}) {
  return { id: "ev-1", student_id: "me", severity_level: "crisis", created_at: hoursAgo(30), current_step: "open", current_step_at: hoursAgo(30), resolved: false, ...over };
}
const share = { id: "cs", student_id: "me", counsellor_id: "co", active: true, scope: ["risk_events"], expires_at: future, revoked_at: null };
const prompt24 = { id: "pr-24", risk_event_id: "ev-1", student_id: "me", kind: "h24", due_at: hoursAgo(1) };
const notifOffer = {
  id: "notif-1",
  user_id: "me",
  type: "handoff_offer",
  read: false,
  metadata: {
    risk_event_id: "ev-1",
    slot_id: "slot-99",
    starts_at: hoursAhead(24),
    counsellor_alias: "Dr. Ananya",
  },
  created_at: hoursAgo(2),
};

function seed(extra: Record<string, Record<string, unknown>[]> = {}) {
  resetFake(
    {
      risk_queue: [event(), event({ id: "ev-other", student_id: "someone-else", current_step: "contacted" })],
      risk_checkback_prompts: [prompt24],
      risk_checkbacks: [],
      care_shares: [share],
      profiles: [{ id: "me", checkback_opt_out: false }],
      notifications: [],
      ...extra,
    },
    "me",
  );
}

beforeAll(async () => {
  await setupI18n("en");
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  localStorage.clear();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: null, error: null });
  seed();
});

describe("FollowUpCard", () => {
  it("renders nothing when the student has no follow-up", async () => {
    resetFake({ risk_queue: [event({ student_id: "someone-else" })], risk_checkback_prompts: [], risk_checkbacks: [], care_shares: [] }, "me");
    const { container } = render(<FollowUpCard />);
    await new Promise((r) => setTimeout(r, 30));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for events without a follow-up row (low or medium) and when signed out", async () => {
    resetFake({ risk_queue: [event({ current_step: null, severity_level: "medium" })] }, "me");
    const a = render(<FollowUpCard />);
    await new Promise((r) => setTimeout(r, 30));
    expect(a.container).toBeEmptyDOMElement();
    a.unmount();
    seed();
    fake.signedIn = false;
    const b = render(<FollowUpCard />);
    await new Promise((r) => setTimeout(r, 30));
    expect(b.container).toBeEmptyDOMElement();
  });

  it("states in plain language that the counsellor has been told, without overpromising", async () => {
    render(<FollowUpCard />);
    expect(await screen.findByText("Your counsellor has been told")).toBeInTheDocument();
    expect(screen.getByText(/Nobody watches the app around the clock/)).toBeInTheDocument();
    expect(screen.queryByText(/not shared risk alerts/)).not.toBeInTheDocument();
  });

  it.each([
    ["acknowledged", "Your counsellor has seen this"],
    ["contacted", "Your counsellor reached out"],
    ["handed_off", "Your counsellor is arranging more support for you"],
    ["closed", "This follow-up has been closed"],
  ])("shows %s as '%s'", async (step, text) => {
    resetFake({ risk_queue: [event({ current_step: step, current_step_at: hoursAgo(1) })], risk_checkback_prompts: [], risk_checkbacks: [], care_shares: [share] }, "me");
    render(<FollowUpCard />);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  describe("G6-SEC-05: no false reassurance when alerts are not shared", () => {
    const NOT_SHARED_HEADER = "Alert recorded. It was not shared with a counsellor.";

    it("says plainly that the alert was not shared and never claims a counsellor has been told", async () => {
      seed({ care_shares: [{ ...share, scope: ["moods"] }] });
      render(<FollowUpCard />);
      expect(await screen.findByText(NOT_SHARED_HEADER)).toBeInTheDocument();
      expect(screen.queryByText(/counsellor has been told/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Nobody watches the app around the clock/)).not.toBeInTheDocument();
      expect(screen.getByText(/No counsellor can see this alert/)).toBeInTheDocument();
    });

    it("puts the helplines first, before the status, when nothing was shared", async () => {
      seed({ care_shares: [] });
      render(<FollowUpCard />);
      const header = await screen.findByText(NOT_SHARED_HEADER);
      const helplines = screen.getByTestId("followup-helplines");
      expect(helplines.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(helplines).toHaveAttribute("data-prominent", "true");
      for (const link of within(helplines).getAllByRole("link")) expect(link.className).toContain("min-h-14");
    });

    it("keeps the current wording and order when alerts ARE shared", async () => {
      render(<FollowUpCard />);
      const header = await screen.findByText("Your counsellor has been told");
      const helplines = screen.getByTestId("followup-helplines");
      expect(header.compareDocumentPosition(helplines) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(helplines).not.toHaveAttribute("data-prominent");
      expect(screen.queryByText(NOT_SHARED_HEADER)).not.toBeInTheDocument();
    });

    it("does not tell the student a counsellor was told after 'I want to talk' when nothing is shared", async () => {
      const user = userEvent.setup();
      seed({ care_shares: [] });
      render(<FollowUpCard />);
      await user.click(await screen.findByRole("button", { name: "I want to talk" }));
      const status = await screen.findByText(/Your answer is saved, but no counsellor can see it/);
      expect(status).toBeInTheDocument();
      expect(screen.queryByText(/We have told your counsellor/)).not.toBeInTheDocument();
    });

    it("renders the not-shared state in Hindi", async () => {
      await i18n.changeLanguage("hi");
      seed({ care_shares: [] });
      render(<FollowUpCard />);
      expect(await screen.findByText("चेतावनी दर्ज हो गई है। इसे किसी काउंसलर के साथ साझा नहीं किया गया।")).toBeInTheDocument();
      expect(screen.queryByText("आपके काउंसलर को बता दिया गया है")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Tele-MANAS 14416 पर कॉल करें" })).toBeInTheDocument();
      await i18n.changeLanguage("en");
    });
  });

  it("treats an expired or revoked care share as not shared", async () => {
    seed({ care_shares: [{ ...share, expires_at: hoursAgo(1) }, { ...share, id: "cs2", revoked_at: hoursAgo(2) }] });
    render(<FollowUpCard />);
    expect(await screen.findByText(/No counsellor can see this alert/)).toBeInTheDocument();
    expect(screen.queryByText("Your counsellor has been told")).not.toBeInTheDocument();
  });
  it("always shows the three helplines as call links", async () => {
    render(<FollowUpCard />);
    const box = await screen.findByTestId("followup-helplines");
    expect(within(box).getByRole("link", { name: "Call Tele-MANAS 14416" })).toHaveAttribute("href", "tel:14416");
    expect(within(box).getByRole("link", { name: "Call KIRAN 1800-599-0019" })).toHaveAttribute("href", "tel:18005990019");
    expect(within(box).getByRole("link", { name: "Call Emergency 112" })).toHaveAttribute("href", "tel:112");
  });

  it("never shows another student's follow-up", async () => {
    render(<FollowUpCard />);
    await screen.findByText("Your counsellor has been told");
    expect(screen.queryByText("Your counsellor reached out")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem").filter((li) => li.hasAttribute("data-step"))).toHaveLength(1);
  });

  it("answers 'I'm okay' and records it for the student's own prompt", async () => {
    const user = userEvent.setup();
    render(<FollowUpCard />);
    await user.click(await screen.findByRole("button", { name: "I'm okay" }));
    expect(await screen.findByText(/Thanks for letting us know/)).toBeInTheDocument();
    expect(fake.tables.risk_checkbacks).toHaveLength(1);
    expect(fake.tables.risk_checkbacks[0]).toMatchObject({ prompt_id: "pr-24", student_id: "me", risk_event_id: "ev-1", answer: "okay" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "I'm okay" })).not.toBeInTheDocument());
    // helplines stay after answering
    expect(screen.getByTestId("followup-helplines")).toBeInTheDocument();
  });

  it("answers 'I want to talk' and says plainly it is an in-app alert", async () => {
    const user = userEvent.setup();
    render(<FollowUpCard />);
    await user.click(await screen.findByRole("button", { name: "I want to talk" }));
    expect(await screen.findByText(/may not be seen right away/)).toBeInTheDocument();
    expect(fake.tables.risk_checkbacks[0]).toMatchObject({ answer: "want_to_talk" });
  });

  it("shows an alert and keeps the buttons when saving the answer fails", async () => {
    const user = userEvent.setup();
    render(<FollowUpCard />);
    const button = await screen.findByRole("button", { name: "I'm okay" });
    const spy = vi.spyOn(await import("../../shared/lib/supabase").then((m) => m.supabase), "from").mockImplementationOnce(() => {
      throw new Error("offline");
    });
    await user.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not save your answer");
    expect(screen.getByRole("button", { name: "I'm okay" })).toBeEnabled();
    spy.mockRestore();
  });

  it("does not offer prompts that are not due, already answered, or belong to a closed event", async () => {
    seed({
      risk_checkback_prompts: [
        { ...prompt24, id: "later", due_at: hoursAhead(40) },
        { ...prompt24, id: "done", due_at: hoursAgo(2) },
      ],
      risk_checkbacks: [{ id: "a", prompt_id: "done", student_id: "me", answer: "okay" }],
    });
    const a = render(<FollowUpCard />);
    await screen.findByText("Your counsellor has been told");
    expect(screen.queryByRole("button", { name: "I'm okay" })).not.toBeInTheDocument();
    a.unmount();

    resetFake({ risk_queue: [event({ current_step: "closed", current_step_at: hoursAgo(1) })], risk_checkback_prompts: [prompt24], risk_checkbacks: [], care_shares: [share] }, "me");
    render(<FollowUpCard />);
    await screen.findByText("This follow-up has been closed");
    expect(screen.queryByRole("button", { name: "I'm okay" })).not.toBeInTheDocument();
  });

  it("hides follow-ups closed more than a week ago", async () => {
    resetFake({ risk_queue: [event({ current_step: "closed", current_step_at: hoursAgo(24 * 9) })], risk_checkback_prompts: [], risk_checkbacks: [], care_shares: [share] }, "me");
    const { container } = render(<FollowUpCard />);
    await new Promise((r) => setTimeout(r, 30));
    expect(container).toBeEmptyDOMElement();
  });

  it("opts out of FUTURE check-backs only, keeps helplines, and can opt back in", async () => {
    const user = userEvent.setup();
    render(<FollowUpCard />);
    const box = await screen.findByLabelText("Do not show me future check-in questions on this device");
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(box).toBeChecked();
    expect(getCheckbackOptOut("me")).not.toBeNull();
    expect(screen.getByTestId("followup-helplines")).toBeInTheDocument();
    expect(screen.getByText(/helplines on this card always stay here/)).toBeInTheDocument();
    await user.click(box);
    expect(box).not.toBeChecked();
    expect(getCheckbackOptOut("me")).toBeNull();
  });

  it("is keyboard operable and uses real controls and a labelled region", async () => {
    const user = userEvent.setup();
    render(<FollowUpCard />);
    const region = await screen.findByRole("region", { name: "Following up on your recent alert" });
    expect(within(region).getAllByRole("button")).toHaveLength(2);
    await user.tab();
    expect(document.activeElement?.tagName).toBe("BUTTON");
    expect(within(region).getByRole("group")).toBeInTheDocument();
  });

  it("renders in Hindi", async () => {
    await i18n.changeLanguage("hi");
    render(<FollowUpCard />);
    expect(await screen.findByText("आपके काउंसलर को बता दिया गया है")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tele-MANAS 14416 पर कॉल करें" })).toBeInTheDocument();
    await i18n.changeLanguage("en");
  });
});

describe("followup api", () => {
  it("only hides prompts due at or after the opt-out time", () => {
    const optOut = "2026-02-08T10:00:00Z";
    expect(isPromptHidden("2026-02-08T09:00:00Z", optOut)).toBe(false);
    expect(isPromptHidden("2026-02-08T10:00:00Z", optOut)).toBe(true);
    expect(isPromptHidden("2026-02-09T10:00:00Z", optOut)).toBe(true);
    expect(isPromptHidden("2026-02-09T10:00:00Z", null)).toBe(false);
  });

  it("excludes prompts due after an opt-out made earlier", async () => {
    setCheckbackOptOut("me", true, new Date(Date.now() - 3600 * 1000));
    seed({ risk_checkback_prompts: [{ ...prompt24, id: "after", due_at: hoursAgo(0.5) }, { ...prompt24, id: "before", due_at: hoursAgo(5) }] });
    const state = await fetchMyFollowups();
    expect(state.prompts.map((p) => p.id)).toEqual(["before"]);
  });

  it("looks up the event for a prompt when only the prompt id is given", async () => {
    await answerCheckback("pr-24", "okay");
    expect(fake.tables.risk_checkbacks[0]).toMatchObject({ risk_event_id: "ev-1", prompt_id: "pr-24", student_id: "me" });
  });

  it("will not answer a prompt that is not the student's own", async () => {
    await expect(answerCheckback("pr-missing", "okay")).rejects.toMatchObject({ code: "PROMPT_NOT_FOUND" });
    expect(fake.tables.risk_checkbacks).toHaveLength(0);
  });

  it("tolerates unreadable local storage", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getCheckbackOptOut("me")).toBeNull();
    expect(() => setCheckbackOptOut("me", true)).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });

  it("server-side opt-out hides all prompts completely", async () => {
    seed({
      profiles: [{ id: "me", checkback_opt_out: true }],
      risk_checkback_prompts: [prompt24],
    });
    const state = await fetchMyFollowups();
    expect(state.optedOut).toBe(true);
    expect(state.prompts).toHaveLength(0);
  });

  it("migrates local storage opt-out to server profile once", async () => {
    localStorage.setItem("mindsahaay-followup-optout:me", new Date().toISOString());
    seed({
      profiles: [{ id: "me", checkback_opt_out: false }],
    });
    const state = await fetchMyFollowups();
    expect(state.optedOut).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("set_checkback_opt_out", { p_opt_out: true });
  });

  it("setServerCheckbackOptOut calls RPC and updates localStorage", async () => {
    await setServerCheckbackOptOut(true);
    expect(rpcMock).toHaveBeenCalledWith("set_checkback_opt_out", { p_opt_out: true });
    expect(getCheckbackOptOut("me")).not.toBeNull();
  });

  it("setServerCheckbackOptOut puts the local preference back when the server rejects the change", async () => {
    const { supabase } = await import("../../shared/lib/supabase");
    rpcMock.mockResolvedValue({ data: null, error: { message: "rpc down" } });
    vi.spyOn(supabase, "from").mockImplementationOnce(
      () => ({ update: () => ({ eq: async () => ({ error: { message: "denied", code: "42501" } }) }) }) as unknown as ReturnType<typeof supabase.from>,
    );
    await expect(setServerCheckbackOptOut(true)).rejects.toThrow();
    expect(getCheckbackOptOut("me")).toBeNull();
    vi.restoreAllMocks();
  });

  it("acceptHandoffOffer and declineHandoffOffer call their respective RPCs", async () => {
    await acceptHandoffOffer("notif-1");
    expect(rpcMock).toHaveBeenCalledWith("accept_handoff_offer", { p_notification_id: "notif-1" });

    await declineHandoffOffer("notif-1");
    expect(rpcMock).toHaveBeenCalledWith("decline_handoff_offer", { p_notification_id: "notif-1" });
  });
});

describe("FollowUpCard warm handoff flow", () => {
  it("renders handoff offer with counsellor alias, time, accept and decline buttons", async () => {
    seed({ notifications: [notifOffer] });
    render(<FollowUpCard />);
    expect(await screen.findByTestId("handoff-offer-card")).toBeInTheDocument();
    expect(screen.getByText(/Dr. Ananya offered you a session slot/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept this session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
    expect(screen.getByTestId("followup-helplines")).toBeInTheDocument();
  });

  it("accepts handoff offer, calls RPC, and shows confirmation message", async () => {
    const user = userEvent.setup();
    seed({ notifications: [notifOffer] });
    render(<FollowUpCard />);
    const acceptBtn = await screen.findByRole("button", { name: "Accept this session" });
    await user.click(acceptBtn);
    expect(rpcMock).toHaveBeenCalledWith("accept_handoff_offer", { p_notification_id: "notif-1" });
    expect(await screen.findByText(/Session confirmed! Check your appointments tab for details./)).toBeInTheDocument();
    expect(screen.getByTestId("followup-helplines")).toBeInTheDocument();
  });

  it("declines handoff offer, calls decline RPC, and shows declined message", async () => {
    const user = userEvent.setup();
    seed({ notifications: [notifOffer] });
    render(<FollowUpCard />);
    const declineBtn = await screen.findByRole("button", { name: "Not now" });
    await user.click(declineBtn);
    expect(rpcMock).toHaveBeenCalledWith("decline_handoff_offer", { p_notification_id: "notif-1" });
    expect(await screen.findByText(/Offer declined. You can still reach out or book a session whenever you're ready./)).toBeInTheDocument();
  });

  it("shows role=alert if accepting offer fails", async () => {
    const user = userEvent.setup();
    seed({ notifications: [notifOffer] });
    rpcMock.mockRejectedValueOnce(new Error("Accept failed"));
    render(<FollowUpCard />);
    const acceptBtn = await screen.findByRole("button", { name: "Accept this session" });
    await user.click(acceptBtn);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not process the session offer/i);
  });
});

describe("FollowUpCard review fixes", () => {
  const acceptCalls = () => rpcMock.mock.calls.filter((c) => c[0] === "accept_handoff_offer");

  it("sends one request when the accept button is activated twice before the first finishes", async () => {
    seed({ notifications: [notifOffer] });
    rpcMock.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ data: null, error: null }), 40)));
    render(<FollowUpCard />);
    const btn = await screen.findByRole("button", { name: "Accept this session" });
    act(() => {
      fireEvent.click(btn);
      fireEvent.click(btn);
    });
    expect(await screen.findByText(/Session confirmed/)).toBeInTheDocument();
    expect(acceptCalls()).toHaveLength(1);
  });

  it("sends one answer when 'I'm okay' is activated twice quickly", async () => {
    render(<FollowUpCard />);
    const btn = await screen.findByRole("button", { name: "I'm okay" });
    act(() => {
      fireEvent.click(btn);
      fireEvent.click(btn);
    });
    await screen.findByText(/Thanks for letting us know/);
    expect(fake.tables.risk_checkbacks).toHaveLength(1);
  });

  it("does not show an offer for an event that is already closed", async () => {
    seed({ risk_queue: [event({ current_step: "closed", current_step_at: hoursAgo(1) })], notifications: [notifOffer] });
    render(<FollowUpCard />);
    await screen.findByText("This follow-up has been closed");
    expect(screen.queryByTestId("handoff-offer-card")).not.toBeInTheDocument();
  });

  it("refuses to accept an offer whose event was closed after the card loaded, and removes the offer", async () => {
    const user = userEvent.setup();
    seed({ notifications: [notifOffer] });
    render(<FollowUpCard />);
    const btn = await screen.findByRole("button", { name: "Accept this session" });
    fake.tables.risk_queue = [event({ current_step: "closed", current_step_at: hoursAgo(0.1) })];
    await user.click(btn);
    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer available/i);
    expect(acceptCalls()).toHaveLength(0);
    expect(screen.queryByTestId("handoff-offer-card")).not.toBeInTheDocument();
    expect(screen.getByTestId("followup-helplines")).toBeInTheDocument();
  });

  it("refuses to accept an offer that expired while the page stayed open", async () => {
    const user = userEvent.setup();
    seed({ notifications: [notifOffer] });
    render(<FollowUpCard />);
    const btn = await screen.findByRole("button", { name: "Accept this session" });
    fake.tables.notifications = [{ ...notifOffer, metadata: { ...notifOffer.metadata, starts_at: hoursAgo(1) } }];
    await user.click(btn);
    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer available/i);
    expect(acceptCalls()).toHaveLength(0);
  });

  it("keeps the card, and says so, when the refresh after an action fails", async () => {
    const user = userEvent.setup();
    seed({ notifications: [notifOffer] });
    render(<FollowUpCard />);
    const decline = await screen.findByRole("button", { name: "Not now" });
    vi.spyOn(followupApi, "fetchMyFollowups").mockRejectedValueOnce(new Error("offline"));
    await user.click(decline);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not refresh/i);
    expect(screen.getByTestId("followup-card")).toBeInTheDocument();
    expect(screen.getByTestId("followup-helplines")).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("puts the opt-out checkbox back and says so when saving the choice fails", async () => {
    const user = userEvent.setup();
    render(<FollowUpCard />);
    const box = await screen.findByLabelText("Do not show me future check-in questions on this device");
    vi.spyOn(followupApi, "setServerCheckbackOptOut").mockRejectedValueOnce(new Error("offline"));
    await user.click(box);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save that choice/i);
    expect(box).not.toBeChecked();
    vi.restoreAllMocks();
  });

  it("moves focus to the status message after an action removes the button that had it", async () => {
    const user = userEvent.setup();
    seed({ notifications: [notifOffer] });
    render(<FollowUpCard />);
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    const status = await screen.findByText(/Offer declined/);
    await waitFor(() => expect(status).toHaveFocus());
    expect(status).toHaveAttribute("role", "status");
  });

  it("shows a counsellor name from the server as plain, bounded text", async () => {
    const hostile = `<img src=x onerror=alert(1)>\u202E${"x".repeat(200)}`;
    seed({ notifications: [{ ...notifOffer, metadata: { ...notifOffer.metadata, counsellor_alias: hostile } }] });
    const state = await fetchMyFollowups();
    expect(state.offers[0].counsellorAlias.length).toBeLessThanOrEqual(40);
    expect(state.offers[0].counsellorAlias).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/);
    render(<FollowUpCard />);
    const card = await screen.findByTestId("handoff-offer-card");
    expect(card.querySelector("img")).toBeNull();
  });
});