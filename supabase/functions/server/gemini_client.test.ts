// @vitest-environment node
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_BASE_URL,
  GEMINI_CLASSIFIER_SAFETY_SETTINGS,
  GEMINI_COMPANION_SAFETY_SETTINGS,
  GeminiDegradedError,
  checkGeminiQuota,
  createGeminiClient,
  isGeminiAllowed,
} from "./gemini_client.ts";
import {
  checkOutputGuard,
  classifyRiskLevelDetailed,
  streamMindMateCompanion,
  getSafeFallbackReply,
  getSupportResourcesFooter,
} from "./claude.ts";

function mockGeminiResponse(data: any, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("gemini_client unit tests", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has a single default model identifier constant", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.8-flash");
  });

  describe("API key and URL handling (Item 2)", () => {
    it("puts key ONLY in header x-goog-api-key and NEVER in the URL", async () => {
      let capturedUrl = "";
      let capturedHeaders: HeadersInit | undefined;

      const fetchImpl = vi.fn(async (url: any, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "Hello student" }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const client = createGeminiClient("secret-gemini-key-12345", { fetchImpl });
      const stream = await client.messages.stream({
        system: "test prompt",
        messages: [{ role: "user", content: "hi" }],
      });

      for await (const _ of stream) {
        // consume
      }

      // Verify URL
      expect(capturedUrl).toBe(`${GEMINI_BASE_URL}/gemini-3.8-flash:generateContent`);
      expect(capturedUrl).not.toContain("secret-gemini-key-12345");
      expect(capturedUrl).not.toContain("key=");

      // Verify header
      const headers = capturedHeaders as Record<string, string>;
      expect(headers["x-goog-api-key"]).toBe("secret-gemini-key-12345");
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("Role and system-prompt mapping (Item 2)", () => {
    it("maps system prompt to systemInstruction.parts[0].text and assistant role to model", async () => {
      let capturedBody: any;

      const fetchImpl = vi.fn(async (_url: any, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "response" }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const client = createGeminiClient("test-key", { fetchImpl });
      const stream = await client.messages.stream({
        system: "You are MindMate companion",
        messages: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi, how are you?" },
          { role: "user", content: "stressed about exams" },
        ],
      });

      for await (const _ of stream) {}

      expect(capturedBody.systemInstruction).toEqual({
        parts: [{ text: "You are MindMate companion" }],
      });
      expect(capturedBody.contents).toEqual([
        { role: "user", parts: [{ text: "hello" }] },
        { role: "model", parts: [{ text: "hi, how are you?" }] },
        { role: "user", parts: [{ text: "stressed about exams" }] },
      ]);
      expect(capturedBody.generationConfig).toEqual({
        maxOutputTokens: 1024,
        temperature: 0.7,
      });
      expect(capturedBody.safetySettings).toEqual(GEMINI_COMPANION_SAFETY_SETTINGS);
    });

    it("maps classifier call with temperature 0, responseMimeType json and responseSchema", async () => {
      let capturedBody: any;

      const fetchImpl = vi.fn(async (_url: any, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "none" }] } }],
            usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 2 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const client = createGeminiClient("test-key", { fetchImpl });
      const res = await client.messages.create({
        system: "Triage classifier",
        max_tokens: 30,
        messages: [{ role: "user", content: "Classify this student message" }],
      });

      expect(capturedBody.generationConfig).toEqual({
        maxOutputTokens: 30,
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: "STRING",
          enum: ["crisis", "moderate", "low", "none"],
        },
      });
      expect(capturedBody.safetySettings).toEqual(GEMINI_CLASSIFIER_SAFETY_SETTINGS);
      expect(res.content[0].text).toBe("none");
      expect(res.usage).toEqual({ input_tokens: 15, output_tokens: 2 });
    });
  });

  describe("Safety settings (Item 2)", () => {
    it("configures BLOCK_NONE for all 4 categories in classifier", () => {
      expect(GEMINI_CLASSIFIER_SAFETY_SETTINGS).toHaveLength(4);
      for (const s of GEMINI_CLASSIFIER_SAFETY_SETTINGS) {
        expect(s.threshold).toBe("BLOCK_NONE");
      }
      const categories = GEMINI_CLASSIFIER_SAFETY_SETTINGS.map((s) => s.category);
      expect(categories).toContain("HARM_CATEGORY_HARASSMENT");
      expect(categories).toContain("HARM_CATEGORY_HATE_SPEECH");
      expect(categories).toContain("HARM_CATEGORY_SEXUALLY_EXPLICIT");
      expect(categories).toContain("HARM_CATEGORY_DANGEROUS_CONTENT");
    });

    it("configures BLOCK_ONLY_HIGH for all 4 categories in companion", () => {
      expect(GEMINI_COMPANION_SAFETY_SETTINGS).toHaveLength(4);
      for (const s of GEMINI_COMPANION_SAFETY_SETTINGS) {
        expect(s.threshold).toBe("BLOCK_ONLY_HIGH");
      }
      const categories = GEMINI_COMPANION_SAFETY_SETTINGS.map((s) => s.category);
      expect(categories).toContain("HARM_CATEGORY_HARASSMENT");
      expect(categories).toContain("HARM_CATEGORY_HATE_SPEECH");
      expect(categories).toContain("HARM_CATEGORY_SEXUALLY_EXPLICIT");
      expect(categories).toContain("HARM_CATEGORY_DANGEROUS_CONTENT");
    });
  });

  describe("Multi-part candidate join and usage counts (Item 2)", () => {
    it("joins text from all candidate parts and captures usageMetadata", async () => {
      const fetchImpl = mockGeminiResponse({
        candidates: [
          {
            content: {
              parts: [{ text: "Take a deep breath. " }, { text: "We can take this " }, { text: "one step at a time." }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 42,
          candidatesTokenCount: 18,
          totalTokenCount: 60,
        },
      });

      const client = createGeminiClient("test-key", { fetchImpl });
      const stream = await client.messages.stream({
        messages: [{ role: "user", content: "I feel overwhelmed" }],
      });

      let fullText = "";
      for await (const chunk of stream) {
        fullText += chunk.delta.text;
      }
      const finalMsg = await stream.finalMessage();

      expect(fullText).toBe("Take a deep breath. We can take this one step at a time.");
      expect(finalMsg.usage).toEqual({ input_tokens: 42, output_tokens: 18 });
    });
  });

  describe("Block-to-crisis and block-to-fallback rules (Item 2)", () => {
    it("treats classifier block for dangerous content as CRISIS", async () => {
      const fetchImpl = mockGeminiResponse({
        promptFeedback: {
          blockReason: "SAFETY",
          safetyRatings: [
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", probability: "HIGH", blocked: true },
          ],
        },
        candidates: [],
      });

      const client = createGeminiClient("test-key", { fetchImpl });
      const res = await client.messages.create({
        system: "classifier",
        messages: [{ role: "user", content: "dangerous message" }],
      });

      expect(res.content[0].text).toBe("crisis");
    });

    it("treats classifier candidate block for dangerous content as CRISIS", async () => {
      const fetchImpl = mockGeminiResponse({
        candidates: [
          {
            finishReason: "SAFETY",
            safetyRatings: [
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", probability: "HIGH", blocked: true },
            ],
          },
        ],
      });

      const client = createGeminiClient("test-key", { fetchImpl });
      const res = await client.messages.create({
        system: "classifier",
        messages: [{ role: "user", content: "dangerous message" }],
      });

      expect(res.content[0].text).toBe("crisis");
    });

    it("treats classifier block for non-dangerous content (e.g. hate) as degraded (throws error)", async () => {
      const fetchImpl = mockGeminiResponse({
        promptFeedback: {
          blockReason: "SAFETY",
          safetyRatings: [
            { category: "HARM_CATEGORY_HATE_SPEECH", probability: "HIGH", blocked: true },
          ],
        },
        candidates: [],
      });

      const client = createGeminiClient("test-key", { fetchImpl });
      await expect(
        client.messages.create({
          system: "classifier",
          messages: [{ role: "user", content: "hate speech" }],
        }),
      ).rejects.toThrow(GeminiDegradedError);
    });

    it("treats companion block as degraded and pipeline falls back with helplines footer", async () => {
      const fetchImpl = mockGeminiResponse({
        candidates: [
          {
            finishReason: "SAFETY",
            safetyRatings: [
              { category: "HARM_CATEGORY_HARASSMENT", probability: "HIGH", blocked: true },
            ],
          },
        ],
      });

      const client = createGeminiClient("test-key", { fetchImpl });
      let full = "";
      let completedMeta: any;

      await streamMindMateCompanion({
        message: "just feeling lonely",
        apiKey: "test-key",
        createClient: () => client,
        onChunk: (t) => (full += t),
        onComplete: (t, m) => {
          full = t;
          completedMeta = m;
        },
        onError: () => {},
      });

      expect(completedMeta.degraded).toBe(true);
      expect(full).toContain(getSafeFallbackReply("just feeling lonely"));
      expect(full).toContain("14416");
    });

    it("treats companion empty response as output-guard failure and falls back with support footer", async () => {
      const fetchImpl = mockGeminiResponse({
        candidates: [
          {
            content: { parts: [{ text: "   " }] },
          },
        ],
      });

      const client = createGeminiClient("test-key", { fetchImpl });
      let full = "";
      let completedMeta: any;

      await streamMindMateCompanion({
        message: "stressed out tonight",
        apiKey: "test-key",
        createClient: () => client,
        onChunk: (t) => (full += t),
        onComplete: (t, m) => {
          full = t;
          completedMeta = m;
        },
        onError: () => {},
      });

      expect(full).toContain(getSafeFallbackReply("stressed out tonight"));
      expect(full).toContain("14416");
    });
  });

  describe("429/500/timeout/malformed become degraded (Item 2)", () => {
    it("handles 429 RESOURCE_EXHAUSTED as degraded error", async () => {
      const fetchImpl = mockGeminiResponse(
        { error: { code: 429, message: "Resource exhausted", status: "RESOURCE_EXHAUSTED" } },
        429,
      );

      const client = createGeminiClient("test-key", { fetchImpl });
      await expect(
        client.messages.create({ messages: [{ role: "user", content: "test" }] }),
      ).rejects.toThrow("Gemini HTTP 429");
    });

    it("handles 500 INTERNAL as degraded error", async () => {
      const fetchImpl = mockGeminiResponse(
        { error: { code: 500, message: "Internal error", status: "INTERNAL" } },
        500,
      );

      const client = createGeminiClient("test-key", { fetchImpl });
      await expect(
        client.messages.create({ messages: [{ role: "user", content: "test" }] }),
      ).rejects.toThrow("Gemini HTTP 500");
    });

    it("handles network failure or timeout as degraded error", async () => {
      const fetchImpl = vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      });

      const client = createGeminiClient("test-key", { fetchImpl });
      await expect(
        client.messages.create({ messages: [{ role: "user", content: "test" }] }),
      ).rejects.toThrow("Gemini request timeout or network failure");
    });

    it("handles malformed JSON body as degraded error", async () => {
      const fetchImpl = vi.fn(async () => {
        return new Response("Not valid json {{{", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const client = createGeminiClient("test-key", { fetchImpl });
      await expect(
        client.messages.create({ messages: [{ role: "user", content: "test" }] }),
      ).rejects.toThrow("Gemini malformed JSON response");
    });
  });

  describe("No message text, API key, URL or response body in console (Item 2 & 3)", () => {
    it("never logs user message text, full URL or API key when request fails", async () => {
      const warnSpy = vi.spyOn(console, "warn");
      const errorSpy = vi.spyOn(console, "error");
      const logSpy = vi.spyOn(console, "log");

      const sensitiveUserMessage = "SENSITIVE_STUDENT_MESSAGE_12345";
      const sensitiveKey = "SUPER_SECRET_KEY_99999";

      const fetchImpl = mockGeminiResponse(
        { error: { code: 429, message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" } },
        429,
      );

      const client = createGeminiClient(sensitiveKey, { fetchImpl });

      try {
        await client.messages.create({
          messages: [{ role: "user", content: sensitiveUserMessage }],
        });
      } catch {
        // Expected error
      }

      const allLoggedText = [
        ...warnSpy.mock.calls.flat(),
        ...errorSpy.mock.calls.flat(),
        ...logSpy.mock.calls.flat(),
      ].join(" ");

      expect(allLoggedText).not.toContain(sensitiveUserMessage);
      expect(allLoggedText).not.toContain(sensitiveKey);
      expect(allLoggedText).not.toContain(GEMINI_BASE_URL);
      expect(allLoggedText).toContain("HTTP 429 RESOURCE_EXHAUSTED");
    });
  });

  describe("Shared project-wide limits (Item 1)", () => {
    it("enforces GEMINI_CALLS_PER_MIN and GEMINI_CALLS_PER_DAY across calls", async () => {
      const env = (k: string) => {
        if (k === "GEMINI_CALLS_PER_MIN") return "2";
        if (k === "GEMINI_CALLS_PER_DAY") return "10";
        return undefined;
      };

      const fetchImpl = mockGeminiResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      });

      const client = createGeminiClient("test-key", { env, fetchImpl });

      // Call 1: allowed
      await client.messages.create({ messages: [{ role: "user", content: "m1" }] });
      // Call 2: allowed
      await client.messages.create({ messages: [{ role: "user", content: "m2" }] });

      // Call 3: exceeds per-minute quota of 2
      await expect(
        client.messages.create({ messages: [{ role: "user", content: "m3" }] }),
      ).rejects.toThrow("Quota exceeded: gemini_rate_limit_per_minute");
    });
  });

  describe("Free-tier guard (Item 1)", () => {
    it("allows paid tier regardless of AI_ALLOW_FREE_TIER", () => {
      expect(isGeminiAllowed((k) => (k === "AI_DATA_TIER" ? "paid" : undefined))).toBe(true);
    });

    it("allows free tier only when AI_ALLOW_FREE_TIER is true", () => {
      expect(
        isGeminiAllowed((k) => {
          if (k === "AI_DATA_TIER") return "free";
          if (k === "AI_ALLOW_FREE_TIER") return "true";
          return undefined;
        }),
      ).toBe(true);

      expect(
        isGeminiAllowed((k) => {
          if (k === "AI_DATA_TIER") return "free";
          if (k === "AI_ALLOW_FREE_TIER") return "false";
          return undefined;
        }),
      ).toBe(false);

      expect(
        isGeminiAllowed((k) => {
          if (k === "AI_DATA_TIER") return "free";
          return undefined;
        }),
      ).toBe(false);
    });

    it("refuses when AI_DATA_TIER is unset or other", () => {
      expect(isGeminiAllowed(() => undefined)).toBe(false);
      expect(isGeminiAllowed((k) => (k === "AI_DATA_TIER" ? "unknown" : undefined))).toBe(false);
    });
  });

  describe("Integration with claude.ts pipeline", () => {
    it("runs deterministic lexicon crisis check before Gemini is ever invoked", async () => {
      const fetchImpl = vi.fn();
      const client = createGeminiClient("test-key", { fetchImpl });

      let full = "";
      let meta: any;

      await streamMindMateCompanion({
        message: "I want to kill myself tonight",
        apiKey: "test-key",
        createClient: () => client,
        onChunk: (t) => (full += t),
        onComplete: (t, m) => {
          full = t;
          meta = m;
        },
        onError: () => {},
      });

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(meta.isCrisis).toBe(true);
      expect(full).toContain("Tele-MANAS");
    });

    it("redacts PII before message reaches Gemini", async () => {
      let capturedBody: any;
      const fetchImpl = vi.fn(async (_url: any, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "Hello, I am here." }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const client = createGeminiClient("test-key", { fetchImpl });
      let meta: any;

      await streamMindMateCompanion({
        message: "My phone number is 9876543210 and roll is 21BCE1234, feeling stressed",
        apiKey: "test-key",
        createClient: () => client,
        onChunk: () => {},
        onComplete: (_t, m) => {
          meta = m;
        },
        onError: () => {},
      });

      expect(meta.redactedPII).toBe(true);
      const requestText = JSON.stringify(capturedBody);
      expect(requestText).not.toContain("9876543210");
      expect(requestText).toContain("[REDACTED_PHONE]");
    });
  });

  describe.skipIf(!process.env.GEMINI_API_KEY || process.env.RUN_LIVE_AI !== "1")(
    "Item 5: Live smoke test (skipped unless GEMINI_API_KEY and RUN_LIVE_AI=1)",
    () => {
      it("calls live Gemini endpoint with synthetic text only", async () => {
        const liveKey = process.env.GEMINI_API_KEY!;
        const client = createGeminiClient(liveKey);

        const syntheticMessage = "SYNTHETIC_TEST: Feeling exam anxiety, what is one small grounding step?";
        const res = await client.messages.create({
          system: "You are a crisis triage classifier. Output crisis, moderate, low, or none.",
          max_tokens: 30,
          messages: [{ role: "user", content: syntheticMessage }],
        });

        expect(res.content[0].text).toBeTruthy();
      });
    },
  );
});
