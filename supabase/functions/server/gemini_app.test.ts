// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { createFakeAnthropic, createFakeSupabase, type RecordedCall } from "./test_helpers.ts";
import { createGeminiClient } from "./gemini_client.ts";
import { getSafeFallbackReply } from "./claude.ts";

let counter = 0;

function setupApp(opts: {
  env?: Record<string, string>;
  anthropic?: ReturnType<typeof createFakeAnthropic>;
  gemini?: ReturnType<typeof createFakeAnthropic>;
  fetchImpl?: typeof fetch;
  adminResult?: (call: RecordedCall) => any;
  adminRpc?: (name: string, args: any) => any;
  userResult?: (call: RecordedCall) => any;
} = {}) {
  const id = `user-${++counter}`;
  const admin = createFakeSupabase(opts.adminResult, opts.adminRpc);
  const user = createFakeSupabase(opts.userResult);
  const tokens: Record<string, { id: string }> = { [`token-${id}`]: { id } };

  const app = createApp({
    env: (name) => opts.env?.[name],
    verifyJwt: async (token: string) => tokens[token] ?? null,
    getAdminClient: () => admin.client,
    getUserClient: () => user.client,
    createAnthropic: opts.anthropic?.factory,
    createGemini: opts.gemini?.factory as any,
    fetchImpl: opts.fetchImpl,
  });

  const auth = { Authorization: `Bearer token-${id}` };
  return { app, id, auth, admin, user };
}

function parseSse(text: string) {
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = JSON.parse(/^data: (.*)$/m.exec(block)![1]);
      return { event, data };
    });
}

describe("Gemini Edge Function Integration & Routes", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /chat/config (Item 4)", () => {
    it("returns 401 when unauthenticated", async () => {
      const { app } = setupApp();
      const res = await app.request("/chat/config", { method: "GET" });
      expect(res.status).toBe(401);
    });

    it("returns default provider (claude) and dataTier (paid) when env is unset", async () => {
      const { app, auth } = setupApp();
      const res = await app.request("/chat/config", { method: "GET", headers: auth });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ provider: "claude", dataTier: "paid" });
    });

    it("returns gemini and free tier when configured for Gemini free demo", async () => {
      const { app, auth } = setupApp({
        env: {
          AI_PROVIDER: "gemini",
          AI_DATA_TIER: "free",
          AI_ALLOW_FREE_TIER: "true",
        },
      });
      const res = await app.request("/chat/config", { method: "GET", headers: auth });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ provider: "gemini", dataTier: "free" });
    });

    it("returns gemini and paid tier when configured for Gemini paid", async () => {
      const { app, auth } = setupApp({
        env: {
          AI_PROVIDER: "gemini",
          AI_DATA_TIER: "paid",
        },
      });
      const res = await app.request("/chat/config", { method: "GET", headers: auth });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ provider: "gemini", dataTier: "paid" });
    });

    it("returns provider none when AI_PROVIDER is unknown or disabled", async () => {
      const { app, auth } = setupApp({
        env: {
          AI_PROVIDER: "disabled",
        },
      });
      const res = await app.request("/chat/config", { method: "GET", headers: auth });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ provider: "none", dataTier: "none" });
    });
  });

  describe("Provider selection and Free-tier Guard (Item 1 & 3)", () => {
    it("refuses Gemini when AI_DATA_TIER=free without AI_ALLOW_FREE_TIER=true and uses template path", async () => {
      const fakeGemini = createFakeAnthropic({ chunks: ["I am Gemini"] });
      const { app, auth } = setupApp({
        env: {
          AI_PROVIDER: "gemini",
          GEMINI_API_KEY: "test-gemini-key",
          AI_DATA_TIER: "free",
          // AI_ALLOW_FREE_TIER is omitted / false
        },
        gemini: fakeGemini,
      });

      const res = await app.request("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ message: "Feeling exam stress" }),
      });

      expect(res.status).toBe(200);
      const events = parseSse(await res.text());
      const doneEvent = events.find((e) => e.event === "done");

      // Refused Gemini -> falls back to template path, never invokes Gemini factory
      expect(fakeGemini.factory).not.toHaveBeenCalled();
      expect(doneEvent?.data.content).toContain(getSafeFallbackReply("Feeling exam stress"));
    });

    it("allows Gemini when AI_DATA_TIER=free AND AI_ALLOW_FREE_TIER=true", async () => {
      const fakeGemini = createFakeAnthropic({ chunks: ["Hello from Gemini."] });
      const { app, auth } = setupApp({
        env: {
          AI_PROVIDER: "gemini",
          GEMINI_API_KEY: "test-gemini-key",
          AI_DATA_TIER: "free",
          AI_ALLOW_FREE_TIER: "true",
        },
        gemini: fakeGemini,
      });

      const res = await app.request("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ message: "Hello there" }),
      });

      expect(res.status).toBe(200);
      const events = parseSse(await res.text());
      const doneEvent = events.find((e) => e.event === "done");

      expect(fakeGemini.factory).toHaveBeenCalledWith("test-gemini-key", expect.anything());
      expect(doneEvent?.data.content).toBe("Hello from Gemini.");
    });

    it("allows Gemini when AI_DATA_TIER=paid", async () => {
      const fakeGemini = createFakeAnthropic({ chunks: ["Hello from Paid Gemini."] });
      const { app, auth } = setupApp({
        env: {
          AI_PROVIDER: "gemini",
          GEMINI_API_KEY: "test-gemini-key",
          AI_DATA_TIER: "paid",
        },
        gemini: fakeGemini,
      });

      const res = await app.request("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ message: "Hello there" }),
      });

      expect(res.status).toBe(200);
      const events = parseSse(await res.text());
      const doneEvent = events.find((e) => e.event === "done");

      expect(fakeGemini.factory).toHaveBeenCalledWith("test-gemini-key", expect.anything());
      expect(doneEvent?.data.content).toBe("Hello from Paid Gemini.");
    });

    it("uses Claude by default when AI_PROVIDER is unset", async () => {
      const fakeClaude = createFakeAnthropic({ chunks: ["Hello from Claude."] });
      const { app, auth } = setupApp({
        env: {
          ANTHROPIC_API_KEY: "sk-ant-test",
        },
        anthropic: fakeClaude,
      });

      const res = await app.request("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ message: "Hello there" }),
      });

      expect(res.status).toBe(200);
      const events = parseSse(await res.text());
      const doneEvent = events.find((e) => e.event === "done");

      expect(fakeClaude.factory).toHaveBeenCalledWith("sk-ant-test");
      expect(doneEvent?.data.content).toBe("Hello from Claude.");
    });
  });

  describe("SSE contract byte-identical for both providers (Item 2)", () => {
    it("produces identical SSE event structure and done schema between Claude and Gemini", async () => {
      const replyText = "A warm, supportive reply that is long enough to span multiple 32-character chunks easily.";
      const fakeClaude = createFakeAnthropic({ chunks: [replyText] });
      const fakeGemini = createFakeAnthropic({ chunks: [replyText] });

      // Run with Claude
      const appClaude = setupApp({
        env: { AI_PROVIDER: "claude", ANTHROPIC_API_KEY: "test-claude" },
        anthropic: fakeClaude,
      });
      const resClaude = await appClaude.app.request("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...appClaude.auth },
        body: JSON.stringify({ message: "Need some guidance" }),
      });
      const rawTextClaude = await resClaude.text();
      const eventsClaude = parseSse(rawTextClaude);

      // Run with Gemini
      const appGemini = setupApp({
        env: {
          AI_PROVIDER: "gemini",
          GEMINI_API_KEY: "test-gemini",
          AI_DATA_TIER: "paid",
        },
        gemini: fakeGemini,
      });
      const resGemini = await appGemini.app.request("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...appGemini.auth },
        body: JSON.stringify({ message: "Need some guidance" }),
      });
      const rawTextGemini = await resGemini.text();
      const eventsGemini = parseSse(rawTextGemini);

      // Event sequence should be identical
      expect(eventsClaude.map((e) => e.event)).toEqual(eventsGemini.map((e) => e.event));

      // Each chunk size should be identical
      const chunksClaude = eventsClaude.filter((e) => e.event === "chunk").map((e) => e.data.text);
      const chunksGemini = eventsGemini.filter((e) => e.event === "chunk").map((e) => e.data.text);
      expect(chunksClaude).toEqual(chunksGemini);

      // Schema of the done event should be identical
      const doneClaude = eventsClaude.find((e) => e.event === "done")!.data;
      const doneGemini = eventsGemini.find((e) => e.event === "done")!.data;

      expect(Object.keys(doneClaude).sort()).toEqual(Object.keys(doneGemini).sort());
      expect(doneGemini).toEqual({
        content: doneClaude.content,
        isCrisis: doneClaude.isCrisis,
        redactedPII: doneClaude.redactedPII,
        riskLevel: doneClaude.riskLevel,
        degraded: doneClaude.degraded,
        tokens: doneClaude.tokens,
      });
    });
  });

  describe("Redacted Moderation (Item 3)", () => {
    it("redacts PII BEFORE sending text to classifier in /moderation/classify", async () => {
      let classifierInput = "";
      const fakeClaude = createFakeAnthropic({
        classifier: "none",
      });
      fakeClaude.create.mockImplementation(async (args: any) => {
        classifierInput = JSON.stringify(args);
        return { content: [{ type: "text", text: "none" }] };
      });

      const { app, auth } = setupApp({
        env: { ANTHROPIC_API_KEY: "test-key" },
        anthropic: fakeClaude,
      });

      const res = await app.request("/moderation/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({
          title: "Study notes query",
          content: "Please call me at 9876543210 or email me at student@iitm.ac.in regarding notes",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.containsPII).toBe(true);

      // Classifier MUST have received the sanitized text, NEVER the raw phone/email!
      expect(classifierInput).not.toContain("9876543210");
      expect(classifierInput).not.toContain("student@iitm.ac.in");
      expect(classifierInput).toContain("[REDACTED_PHONE]");
      expect(classifierInput).toContain("[REDACTED_EMAIL]");
    });
  });

  describe("Gemini rate limit / 429 during chat yields degraded template with HTTP 200 (Item 1 & 2)", () => {
    it("returns HTTP 200 and degraded template + helplines when Gemini returns 429", async () => {
      // Mock fetch returning Google 429
      const fetchImpl = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: { code: 429, message: "Resource has been exhausted", status: "RESOURCE_EXHAUSTED" },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        );
      });

      const realGeminiFactory = (key: string, opts?: any) =>
        createGeminiClient(key, { ...opts, fetchImpl });

      const { app, auth } = setupApp({
        env: {
          AI_PROVIDER: "gemini",
          GEMINI_API_KEY: "test-key",
          AI_DATA_TIER: "paid",
        },
        gemini: { factory: realGeminiFactory } as any,
      });

      const res = await app.request("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ message: "I am having extreme panic about grades" }),
      });

      // Status must NEVER be 429 to student client
      expect(res.status).toBe(200);
      const events = parseSse(await res.text());
      const doneEvent = events.find((e) => e.event === "done");

      expect(doneEvent?.data.degraded).toBe(true);
      expect(doneEvent?.data.content).toContain(getSafeFallbackReply("I am having extreme panic about grades"));
      expect(doneEvent?.data.content).toContain("14416");
    });
  });
});
