import React from "react";
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, logChatCrisisEvent: vi.fn(async () => true) };
});

import { resetFake, setupI18n, spyFetch } from "../journal/testSupport";
import Chat from "./Chat";
import { CHAT_CONFIG_TIMEOUT_MS, FREE_TIER_ACK_KEY, fetchChatConfig } from "./config";

beforeAll(async () => {
  await setupI18n("en");
});

beforeEach(() => {
  resetFake();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function sse(tokens: string[]): Response {
  const body = tokens.map((t) => `data: ${JSON.stringify({ token: t })}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

/** Routes the mocked config fetch and the stream fetch separately. */
function routeFetch(config: () => Response | Promise<Response>) {
  return spyFetch((url) => (url.endsWith("/chat/config") ? config() : sse(["Hello there."])));
}

const BANNER = /messages go to Google's free Gemini service/;

describe("fetchChatConfig", () => {
  it("sends an authenticated GET to /chat/config and returns the parsed config", async () => {
    const spy = routeFetch(() => json({ provider: "gemini", dataTier: "free" }));
    await expect(fetchChatConfig()).resolves.toEqual({ provider: "gemini", dataTier: "free" });
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/chat\/config$/);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("returns null on a server error, a malformed body, or a network failure", async () => {
    routeFetch(() => json({ error: "x" }, 500));
    await expect(fetchChatConfig()).resolves.toBeNull();
    routeFetch(() => json({ nope: true }));
    await expect(fetchChatConfig()).resolves.toBeNull();
    routeFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetchChatConfig()).resolves.toBeNull();
  });
});

describe("Chat: free-tier demo banner and acknowledgement gate", () => {
  it("shows the red banner and holds the composer behind the gate until acknowledged", async () => {
    const spy = routeFetch(() => json({ provider: "gemini", dataTier: "free" }));
    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);

    const banner = await screen.findByTestId("free-tier-banner");
    expect(banner).toHaveTextContent(BANNER);
    expect(banner).toHaveTextContent("Do not enter real or identifying information.");
    expect(banner).toHaveClass("bg-red-700");
    expect(screen.queryByRole("button", { name: /Send message/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Message for MindMate")).not.toBeInTheDocument();

    const gate = screen.getByTestId("free-tier-gate");
    expect(gate).toHaveTextContent("14416");
    await user.click(within(gate).getByRole("button", { name: "I understand, continue" }));

    expect(sessionStorage.getItem(FREE_TIER_ACK_KEY)).toBe("1");
    expect(localStorage.getItem(FREE_TIER_ACK_KEY)).toBeNull();
    expect(screen.queryByTestId("free-tier-gate")).not.toBeInTheDocument();
    // The banner cannot be dismissed.
    expect(screen.getByTestId("free-tier-banner")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Message for MindMate"), "made up test message");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Hello there.");
    expect(spy.mock.calls.filter(([u]) => String(u).endsWith("/chat/stream"))).toHaveLength(1);
  });

  it("skips the gate when this session already acknowledged, but keeps the banner", async () => {
    sessionStorage.setItem(FREE_TIER_ACK_KEY, "1");
    routeFetch(() => json({ provider: "gemini", dataTier: "free" }));
    render(<Chat studentId="user-1" />);
    await screen.findByTestId("free-tier-banner");
    expect(screen.queryByTestId("free-tier-gate")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Message for MindMate")).toBeInTheDocument();
  });

  it("shows no banner and no gate for the paid tier", async () => {
    const spy = routeFetch(() => json({ provider: "claude", dataTier: "paid" }));
    render(<Chat studentId="user-1" />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText("Message for MindMate")).toBeInTheDocument());
    expect(screen.queryByTestId("free-tier-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("free-tier-gate")).not.toBeInTheDocument();
  });

  it("behaves as before when the config call fails", async () => {
    routeFetch(() => json({ error: "boom" }, 500));
    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);
    await user.type(screen.getByLabelText("Message for MindMate"), "hello");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Hello there.");
    expect(screen.queryByTestId("free-tier-banner")).not.toBeInTheDocument();
  });
});

describe("Chat: composer is held while /chat/config is pending", () => {
  function deferredConfig() {
    let resolve!: (r: Response) => void;
    const promise = new Promise<Response>((r) => {
      resolve = r;
    });
    const spy = routeFetch(() => promise);
    return { spy, resolve };
  }

  const streamCalls = (spy: ReturnType<typeof routeFetch>) =>
    spy.mock.calls.filter(([u]) => String(u).endsWith("/chat/stream"));

  it("disables sending with a busy status while pending, refuses Enter, and enables after resolve", async () => {
    const { spy, resolve } = deferredConfig();
    const user = userEvent.setup();
    const { container } = render(<Chat studentId="user-1" />);

    const box = screen.getByLabelText("Message for MindMate");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(container.querySelector("form.chat-input")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("chat-config-pending")).toHaveTextContent("Checking AI service...");
    expect(screen.queryByRole("group", { name: /start/i })).not.toBeInTheDocument();

    await user.type(box, "hello{Enter}");
    expect(streamCalls(spy)).toHaveLength(0);
    expect(screen.queryByText("Hello there.")).not.toBeInTheDocument();

    await act(async () => {
      resolve(json({ provider: "claude", dataTier: "paid" }));
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled());
    expect(screen.queryByTestId("chat-config-pending")).not.toBeInTheDocument();
    expect(container.querySelector("form.chat-input")).not.toHaveAttribute("aria-busy");

    await user.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Hello there.");
    expect(streamCalls(spy)).toHaveLength(1);
  });

  it("shows the gate instead of the composer when the pending request resolves as free tier", async () => {
    const { resolve } = deferredConfig();
    render(<Chat studentId="user-1" />);
    expect(screen.queryByTestId("free-tier-gate")).not.toBeInTheDocument();
    await act(async () => {
      resolve(json({ provider: "gemini", dataTier: "free" }));
    });
    expect(await screen.findByTestId("free-tier-gate")).toBeInTheDocument();
    expect(screen.getByTestId("free-tier-banner")).toBeInTheDocument();
    expect(screen.queryByLabelText("Message for MindMate")).not.toBeInTheDocument();
  });

  it("enables chat after the config request fails", async () => {
    routeFetch(() => json({ error: "boom" }, 500));
    render(<Chat studentId="user-1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled());
    await userEvent.setup().type(screen.getByLabelText("Message for MindMate"), "hi");
    await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled());
    expect(screen.queryByTestId("chat-config-pending")).not.toBeInTheDocument();
    expect(screen.queryByTestId("free-tier-banner")).not.toBeInTheDocument();
  });

  it("enables chat after the timeout when the config request never settles", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const spy = routeFetch(() => new Promise<Response>(() => {}));
      render(<Chat studentId="user-1" />);
      fireEvent.change(screen.getByLabelText("Message for MindMate"), { target: { value: "hello" } });
      expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(CHAT_CONFIG_TIMEOUT_MS - 1);
      });
      expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
      expect(screen.queryByTestId("chat-config-pending")).not.toBeInTheDocument();
      expect(screen.queryByTestId("free-tier-banner")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Send message" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(streamCalls(spy).length).toBeGreaterThanOrEqual(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still shows the crisis card and helplines while pending, without sending anything", async () => {
    const { spy } = deferredConfig();
    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);

    await user.type(screen.getByLabelText("Message for MindMate"), "I want to die{Enter}");

    const card = await screen.findByTestId("crisis-card");
    expect(card).toHaveTextContent("14416");
    expect(card.querySelector('a[href^="tel:"]')).not.toBeNull();
    expect(streamCalls(spy)).toHaveLength(0);
  });
});