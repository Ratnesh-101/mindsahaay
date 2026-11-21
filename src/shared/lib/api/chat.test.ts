import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { streamChat } from "./chat";
import { ValidationError, DegradedModeError } from "./errors";
import { supabase } from "../supabase";
import { testServer, mockSession } from "./testMocks";

beforeAll(() => testServer.listen());
afterEach(() => {
  testServer.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => testServer.close());

describe("chat API module (SSE streaming + crisis triage + degraded mode)", () => {
  it("triggers deterministic crisis protocol immediately for suicidal intent without network", async () => {
    // Note: Do not need valid session because safety check runs before network
    const tokens: string[] = [];
    let completedReply = "";
    let completedCrisis = false;

    const result = await streamChat({
      message: "I feel hopeless and I want to kill myself tonight",
      onToken: (t) => tokens.push(t),
      onComplete: (reply, isCrisis) => {
        completedReply = reply;
        completedCrisis = isCrisis;
      },
    });

    expect(result.isCrisis).toBe(true);
    expect(result.isDegraded).toBe(false);
    expect(completedCrisis).toBe(true);

    // Mandatory helpline check
    expect(result.reply).toContain("Tele-MANAS");
    expect(result.reply).toContain("14416");
    expect(result.reply).toContain("KIRAN");
    expect(result.reply).toContain("1800-599-0019");
    expect(result.reply).toContain("112");
    expect(completedReply).toBe(result.reply);
  });

  it("handles multilingual Hinglish crisis phrases deterministically", async () => {
    const result = await streamChat({
      message: "Mujhe mar jaana chahta hoon sab khatam ho gaya",
    });

    expect(result.isCrisis).toBe(true);
    expect(result.reply).toContain("14416");
    expect(result.reply).toContain("1800-599-0019");
  });

  it("validates input: empty message or overly long message throws ValidationError", async () => {
    await expect(streamChat({ message: "" })).rejects.toThrow(ValidationError);
    await expect(streamChat({ message: "a".repeat(3001) })).rejects.toThrow(ValidationError);
  });

  it("streams tokens via SSE for non-crisis queries when authenticated", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const receivedTokens: string[] = [];
    const result = await streamChat({
      message: "How can I manage midterm exam anxiety?",
      onToken: (tok) => receivedTokens.push(tok),
    });

    expect(result.isCrisis).toBe(false);
    expect(result.isDegraded).toBe(false);
    expect(result.reply).toBe("Hello there student");
    expect(receivedTokens).toEqual(["Hello", " there", " student"]);
  });

  it("sets visible degraded mode flag when companion API is unreachable (no silent fallback)", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    // Simulate network error on chat stream
    testServer.use(
      http.post("*/chat/stream", () => {
        return HttpResponse.error();
      }),
    );

    let degradedCalled = false;
    let errorCalled = false;

    await expect(
      streamChat({
        message: "Can you help me breathe?",
        onDegraded: (deg) => {
          if (deg) degradedCalled = true;
        },
        onError: () => {
          errorCalled = true;
        },
      }),
    ).rejects.toThrow(DegradedModeError);

    expect(degradedCalled).toBe(true);
    expect(errorCalled).toBe(true);
  });

  it("handles buffered preparing event and delivers guarded text safely", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    testServer.use(
      http.post("*/chat/stream", () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('event: preparing\ndata: {"status":"preparing"}\n\n'));
            controller.enqueue(encoder.encode('event: chunk\ndata: {"text":"I hear you."}\n\n'));
            controller.enqueue(encoder.encode('event: chunk\ndata: {"text":" Take a slow breath."}\n\n'));
            controller.enqueue(
              encoder.encode(
                'event: done\ndata: {"content":"I hear you. Take a slow breath.","isCrisis":false,"degraded":false}\n\n',
              ),
            );
            controller.close();
          },
        });
        return new HttpResponse(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    let preparingCalled = false;
    const receivedTokens: string[] = [];

    const result = await streamChat({
      message: "I am feeling stressed about grades",
      onPreparing: () => {
        preparingCalled = true;
      },
      onToken: (tok) => receivedTokens.push(tok),
    });

    expect(preparingCalled).toBe(true);
    expect(result.reply).toBe("I hear you. Take a slow breath.");
    expect(receivedTokens).toEqual(["I hear you.", " Take a slow breath."]);
    expect(result.isCrisis).toBe(false);
  });

  it("ensures a guard-blocked reply is never passed to onToken or returned in reply", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const safeFallback = "I hear how heavy things feel right now. Let's take a slow breath together.";

    // Simulate server where model produced a clinical diagnosis, output guard intercepted it,
    // and buffered safe fallback was delivered in chunks.
    testServer.use(
      http.post("*/chat/stream", () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('event: preparing\ndata: {"status":"preparing"}\n\n'));
            controller.enqueue(encoder.encode(`event: chunk\ndata: {"text":"${safeFallback}"}\n\n`));
            controller.enqueue(
              encoder.encode(
                `event: done\ndata: {"content":"${safeFallback}","isCrisis":false,"degraded":false}\n\n`,
              ),
            );
            controller.close();
          },
        });
        return new HttpResponse(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    const receivedTokens: string[] = [];
    const result = await streamChat({
      message: "Do I have major depressive disorder?",
      onToken: (t) => receivedTokens.push(t),
    });

    // Verify forbidden clinical claims never appeared in any token
    const allStreamedText = receivedTokens.join("");
    expect(allStreamedText).not.toMatch(/diagnos|disorder|bipolar|depression/i);
    expect(allStreamedText).toBe(safeFallback);
    expect(result.reply).toBe(safeFallback);
  });
});
