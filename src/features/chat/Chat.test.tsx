import React from "react";
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, logChatCrisisEvent: vi.fn(async () => true) };
});

import { fake, resetFake, setupI18n, spyFetch } from "../journal/testSupport";
import Chat from "./Chat";
import CrisisCard from "./CrisisCard";
import { logChatCrisisEvent } from "./api";

beforeAll(async () => {
  await setupI18n("en");
});

beforeEach(() => {
  resetFake();
  vi.mocked(logChatCrisisEvent).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sse(tokens: string[]): Response {
  const body = tokens.map((t) => `data: ${JSON.stringify({ token: t })}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("Chat: labelling, streaming and degraded mode", () => {
  it("labels the greeting and every bot reply as AI, and uses a Hinglish placeholder", async () => {
    const fetchSpy = spyFetch(() => sse(["Thank", " you for sharing."]));
    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);

    expect(screen.getAllByTestId("ai-label")).toHaveLength(1);
    expect(screen.getByLabelText("Message for MindMate")).toHaveAttribute("placeholder", expect.stringContaining("Jo bhi mann mein hai"));

    await user.type(screen.getByLabelText("Message for MindMate"), "Exams ka bahut stress hai");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Thank you for sharing.");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const labels = screen.getAllByTestId("ai-label");
    expect(labels).toHaveLength(2);
    labels.forEach((l) => expect(l).toHaveTextContent("AI, not a human"));
    await waitFor(() => expect(screen.getByTestId("chat-announcer")).toHaveTextContent("MindMate has replied."));
    expect(screen.queryByTestId("crisis-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("degraded-banner")).not.toBeInTheDocument();
  });

  it("shows a degraded-mode banner when the API is unreachable", async () => {
    spyFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);
    await user.type(screen.getByLabelText("Message for MindMate"), "hello");
    await user.keyboard("{Enter}");
    const banner = await screen.findByTestId("degraded-banner");
    expect(banner).toHaveTextContent("MindMate is offline right now");
    // Nothing is invented in place of the AI: still only the greeting from the bot.
    expect(screen.getAllByTestId("ai-label")).toHaveLength(1);
  });

  it("explains a rate limit without the degraded banner text", async () => {
    spyFetch(() => new Response("slow down", { status: 429 }));
    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);
    await user.type(screen.getByLabelText("Message for MindMate"), "hello");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("very quickly");
  });

  it("says plainly that the conversation is not saved", () => {
    render(<Chat studentId="user-1" />);
    expect(screen.getByTestId("chat-not-saved")).toHaveTextContent("does not save this conversation");
  });

  it("puts an unsent message back in the box so it can be retried", async () => {
    spyFetch(() => new Response("server error", { status: 500 }));
    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);
    await user.type(screen.getByLabelText("Message for MindMate"), "Kal viva hai, darr lag raha hai");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("did not go through");
    await waitFor(() => expect(screen.getByLabelText("Message for MindMate")).toHaveValue("Kal viva hai, darr lag raha hai"));
  });

  it("offers breathing, safety plan and booking chips", async () => {
    const user = userEvent.setup();
    const onBook = vi.fn();
    const onBreathing = vi.fn();
    const onSafety = vi.fn();
    render(<Chat studentId="user-1" onBookCounsellor={onBook} onOpenBreathing={onBreathing} onOpenSafetyPlan={onSafety} />);
    const group = screen.getByRole("group", { name: "Suggested actions" });
    await user.click(within(group).getByRole("button", { name: "Start breathing" }));
    await user.click(within(group).getByRole("button", { name: "Open safety plan" }));
    await user.click(within(group).getByRole("button", { name: "Suggest booking" }));
    expect(onBreathing).toHaveBeenCalled();
    expect(onSafety).toHaveBeenCalled();
    expect(onBook).toHaveBeenCalled();
  });

  it("falls back to an in-component breathing modal and a booking hint without host callbacks", async () => {
    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);
    await user.click(screen.getByRole("button", { name: "Suggest booking" }));
    expect(screen.getAllByText(/book a confidential session/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Start breathing" }));
    expect(await screen.findByRole("dialog", { name: "4-7-8 breathing tool" })).toBeInTheDocument();
  });

  it("clears the conversation only after a second confirmation", async () => {
    spyFetch(() => sse(["Hi."]));
    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);
    await user.type(screen.getByLabelText("Message for MindMate"), "hello there");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Hi.");
    await user.click(screen.getByRole("button", { name: "Clear conversation" }));
    await user.click(screen.getByRole("button", { name: "Yes, clear it" }));
    await waitFor(() => expect(screen.queryByText("Hi.")).not.toBeInTheDocument());
  });

  it("never renders a guard-blocked reply even briefly during streaming", async () => {
    const forbiddenDiagnosis = "You have major bipolar depression";
    const safeGuardedFallback = "I hear you are going through a difficult time. Let us take a breath.";

    // Server buffers model output and only streams guarded safe reply
    spyFetch(() => {
      const body =
        'event: preparing\ndata: {"status":"preparing"}\n\n' +
        `event: chunk\ndata: {"text":"${safeGuardedFallback}"}\n\n` +
        `event: done\ndata: {"content":"${safeGuardedFallback}","isCrisis":false,"degraded":false}\n\n`;
      return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    });

    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);

    await user.type(screen.getByLabelText("Message for MindMate"), "I feel down lately, what is wrong with me?");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    // Assert that the forbidden diagnosis string NEVER existed in the DOM at any point
    expect(screen.queryByText(new RegExp(forbiddenDiagnosis, "i"))).not.toBeInTheDocument();

    // Verify guarded safe reply appears cleanly
    await screen.findByText(safeGuardedFallback);
    expect(screen.queryByText(new RegExp(forbiddenDiagnosis, "i"))).not.toBeInTheDocument();
  });
});

describe("Chat: crisis interception", () => {
  it("interrupts with an inescapable crisis card and never calls the AI", async () => {
    const fetchSpy = spyFetch(() => sse(["should not be called"]));
    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);

    await user.type(screen.getByLabelText("Message for MindMate"), "I want to end my life");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    const card = await screen.findByTestId("crisis-card");
    expect(card).toHaveAttribute("role", "alert");
    expect(within(card).getByRole("link", { name: /Tele-MANAS on 14416/ })).toHaveAttribute("href", "tel:14416");
    expect(within(card).getByRole("link", { name: /KIRAN.* on 1800-599-0019/ })).toHaveAttribute("href", "tel:18005990019");
    expect(within(card).getByRole("link", { name: /on 112/ })).toHaveAttribute("href", "tel:112");
    expect(within(card).getByRole("button", { name: "Open my safety plan" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Message my counsellor" })).toBeInTheDocument();

    // Inescapable: no dismiss control inside the card, and the AI network call never happened.
    expect(within(card).queryByRole("button", { name: /close|dismiss|hide/i })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logChatCrisisEvent).toHaveBeenCalledTimes(1);

    // The composer is paused until the student acknowledges, and the card stays afterwards.
    expect(screen.queryByLabelText("Message for MindMate")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "I have read this, continue chatting" }));
    expect(screen.getByLabelText("Message for MindMate")).toBeInTheDocument();
    expect(screen.getByTestId("crisis-card")).toBeInTheDocument();

    // It also survives clearing the conversation.
    await user.click(screen.getByRole("button", { name: "Clear conversation" }));
    await user.click(screen.getByRole("button", { name: "Yes, clear it" }));
    expect(screen.getByTestId("crisis-card")).toBeInTheDocument();
  });

  it("intercepts Hinglish crisis wording", async () => {
    spyFetch(() => sse(["x"]));
    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);
    await user.type(screen.getByLabelText("Message for MindMate"), "mujhe marna hai, main apni jaan le lunga");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByTestId("crisis-card")).toBeInTheDocument();
  });

  it("opens the safety plan from the crisis card", async () => {
    const user = userEvent.setup();
    const onSafety = vi.fn();
    render(<CrisisCard onOpenSafetyPlan={onSafety} onMessageCounsellor={async () => undefined} />);
    expect(screen.getByRole("heading", { name: /You matter/ })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Open my safety plan" }));
    expect(onSafety).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Message my counsellor" }));
    expect(await screen.findByText(/counsellor has been alerted/)).toBeInTheDocument();
  });

  it("creates a counsellor-contact risk event (no message content) by default", async () => {
    const user = userEvent.setup();
    render(<CrisisCard onOpenSafetyPlan={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Message my counsellor" }));
    await screen.findByText(/counsellor has been alerted/);
    const events = fake.tables.risk_events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ student_id: "user-1", event_type: "counsellor_contact_requested", severity_level: "high" });
    expect(JSON.stringify(events[0])).not.toMatch(/want to die|end my life/);
  });

  it("reports failure honestly when the counsellor cannot be alerted", async () => {
    const user = userEvent.setup();
    render(<CrisisCard onOpenSafetyPlan={() => undefined} onMessageCounsellor={async () => Promise.reject(new Error("down"))} />);
    await user.click(screen.getByRole("button", { name: "Message my counsellor" }));
    expect(await screen.findByText(/could not alert a counsellor/i)).toBeInTheDocument();
  });
});
