// ==============================================================================
// Google Gemini Client (Plain REST fetch, no SDK)
// MindSahaay Platform - India Higher Educational Institutions
// Implements AnthropicLike interface so the claude.ts safety pipeline is reused.
// Compliance: India DPDP Act 2023, Mental Healthcare Act 2017
// ==============================================================================

import { checkRateLimit } from "./rate_limiter.ts";
import type { AnthropicLike } from "./claude.ts";

/**
 * Default Gemini model identifier.
 * NOTE: UNVERIFIED against the live API (advisor suggested "gemini-3.8-flash"
 * with "gemini-3.5-flash-lite" as the low-quota alternative). Put in this single constant.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export const GEMINI_CLASSIFIER_SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

export const GEMINI_COMPANION_SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
];

export class GeminiDegradedError extends Error {
  public readonly status?: number;
  public readonly errorStatus?: string;

  constructor(message: string, status?: number, errorStatus?: string) {
    super(message);
    this.name = "GeminiDegradedError";
    this.status = status;
    this.errorStatus = errorStatus;
  }
}

export interface GeminiClientOptions {
  model?: string;
  env?: (name: string) => string | undefined;
  adminClient?: any;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type GeminiFactory = (apiKey: string, options?: GeminiClientOptions) => AnthropicLike;

/**
 * Validates whether the server environment allows using Gemini according to AI_DATA_TIER.
 * Free tier is refused unless AI_ALLOW_FREE_TIER=true.
 */
export function isGeminiAllowed(env: (name: string) => string | undefined): boolean {
  const dataTier = (env("AI_DATA_TIER") || "").toLowerCase().trim();
  const allowFreeTier = (env("AI_ALLOW_FREE_TIER") || "").toLowerCase().trim() === "true";

  if (dataTier === "paid") return true;
  if (dataTier === "free" && allowFreeTier) return true;
  return false;
}

/**
 * Checks shared project-wide limits for Gemini (keys llm:gemini:min and llm:gemini:day).
 * Over the limit results in degraded template + helplines, never an unhandled error.
 */
export async function checkGeminiQuota(
  env?: (name: string) => string | undefined,
  adminClient?: any,
): Promise<{ allowed: boolean; reason?: string }> {
  if (!env) return { allowed: true };

  const rawMin = env("GEMINI_CALLS_PER_MIN");
  const rawDay = env("GEMINI_CALLS_PER_DAY");

  const callsPerMin = rawMin !== undefined ? parseInt(rawMin, 10) : 15;
  const callsPerDay = rawDay !== undefined ? parseInt(rawDay, 10) : 1500;

  if (Number.isFinite(callsPerMin) && callsPerMin > 0) {
    const minCheck = await checkRateLimit("llm:gemini:min", callsPerMin, 60_000, adminClient);
    if (!minCheck.allowed) {
      return { allowed: false, reason: "gemini_rate_limit_per_minute" };
    }
  }

  if (Number.isFinite(callsPerDay) && callsPerDay > 0) {
    const dayCheck = await checkRateLimit("llm:gemini:day", callsPerDay, 86_400_000, adminClient);
    if (!dayCheck.allowed) {
      return { allowed: false, reason: "gemini_rate_limit_per_day" };
    }
  }

  return { allowed: true };
}

function isDangerousBlock(ratings?: Array<{ category?: string; blocked?: boolean; probability?: string }>): boolean {
  if (!ratings || !Array.isArray(ratings)) return false;
  return ratings.some(
    (r) =>
      r?.category === "HARM_CATEGORY_DANGEROUS_CONTENT" &&
      (r?.blocked === true || r?.probability === "HIGH" || r?.probability === "MEDIUM"),
  );
}

export function createGeminiClient(
  apiKey: string,
  options: GeminiClientOptions = {},
): AnthropicLike {
  const model = options.model || (options.env ? options.env("GEMINI_MODEL") : undefined) || DEFAULT_GEMINI_MODEL;
  const fetchFn = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;

  async function executeCall(
    body: Record<string, any>,
    isClassifier: boolean,
  ): Promise<{
    text: string;
    isDangerousBlock?: boolean;
    usage: { input_tokens: number; output_tokens: number };
  }> {
    // 1. Enforce shared project-wide quota before outbound fetch
    if (options.env) {
      const quota = await checkGeminiQuota(options.env, options.adminClient);
      if (!quota.allowed) {
        console.warn(`[Gemini] Quota exceeded: ${quota.reason}`);
        throw new GeminiDegradedError(`Quota exceeded: ${quota.reason}`, 429);
      }
    }

    // 2. Key is strictly in header x-goog-api-key, never in the URL
    const url = `${GEMINI_BASE_URL}/${model}:generateContent`;

    let res: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        res = await fetchFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (fetchErr: any) {
      // Log only status / error name, never request bodies, URL, or API key
      console.warn(`[Gemini] Network error: ${fetchErr?.name || "FetchError"}`);
      throw new GeminiDegradedError("Gemini request timeout or network failure");
    }

    if (!res.ok) {
      let errorStatus = "";
      try {
        const errJson = await res.json();
        errorStatus = errJson?.error?.status || "";
      } catch {
        // Body was non-json or consumed
      }
      // Log only status code and Google's error status, never request/response bodies or URL
      console.warn(`[Gemini] HTTP ${res.status}${errorStatus ? ` ${errorStatus}` : ""}`);
      throw new GeminiDegradedError(`Gemini HTTP ${res.status}`, res.status, errorStatus);
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      console.warn("[Gemini] Malformed JSON response");
      throw new GeminiDegradedError("Gemini malformed JSON response");
    }

    // 3. Safety blocks inspection
    const promptBlockReason = data?.promptFeedback?.blockReason;
    const candidate = data?.candidates?.[0];
    const candidateFinishReason = candidate?.finishReason;

    const isBlocked =
      promptBlockReason === "SAFETY" ||
      candidateFinishReason === "SAFETY" ||
      candidateFinishReason === "BLOCKED";

    const allSafetyRatings = [
      ...(data?.promptFeedback?.safetyRatings || []),
      ...(candidate?.safetyRatings || []),
    ];

    if (isBlocked) {
      if (isClassifier && isDangerousBlock(allSafetyRatings)) {
        // Dangerous content block in classifier is treated as CRISIS
        return {
          text: "crisis",
          isDangerousBlock: true,
          usage: { input_tokens: 0, output_tokens: 0 },
        };
      }
      // Any other block = degraded
      throw new GeminiDegradedError("Gemini response blocked by safety filter");
    }

    // 4. Multi-part candidate join
    const parts = candidate?.content?.parts || [];
    const text = parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");

    // 5. Usage counts from usageMetadata
    const promptTokens = data?.usageMetadata?.promptTokenCount;
    const candidateTokens = data?.usageMetadata?.candidatesTokenCount;

    const usage = {
      input_tokens: typeof promptTokens === "number" ? promptTokens : 0,
      output_tokens: typeof candidateTokens === "number" ? candidateTokens : 0,
    };

    return { text, usage };
  }

  return {
    messages: {
      create: async (args: any) => {
        const systemPrompt = args.system || "";
        const contents = (args.messages || []).map((m: any) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content || "" }],
        }));

        const body: Record<string, any> = {
          contents,
          generationConfig: {
            temperature: 0,
            maxOutputTokens: args.max_tokens ?? 30,
            responseMimeType: "application/json",
            responseSchema: {
              type: "STRING",
              enum: ["crisis", "moderate", "low", "none"],
            },
          },
          safetySettings: GEMINI_CLASSIFIER_SAFETY_SETTINGS,
        };

        if (systemPrompt) {
          body.systemInstruction = { parts: [{ text: systemPrompt }] };
        }

        const result = await executeCall(body, true);

        // Parse json string enum if needed
        let cleanText = result.text.trim();
        try {
          const parsed = JSON.parse(cleanText);
          if (typeof parsed === "string") cleanText = parsed;
          else if (parsed && typeof parsed.risk === "string") cleanText = parsed.risk;
          else if (parsed && typeof parsed.level === "string") cleanText = parsed.level;
        } catch {
          // cleanText remains as is
        }

        return {
          content: [{ type: "text", text: cleanText }],
          usage: result.usage,
        };
      },

      stream: async (args: any) => {
        const systemPrompt = args.system || "";
        const contents = (args.messages || []).map((m: any) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content || "" }],
        }));

        const body: Record<string, any> = {
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
          safetySettings: GEMINI_COMPANION_SAFETY_SETTINGS,
        };

        if (systemPrompt) {
          body.systemInstruction = { parts: [{ text: systemPrompt }] };
        }

        const result = await executeCall(body, false);

        return {
          async *[Symbol.asyncIterator]() {
            if (result.text) {
              yield {
                type: "content_block_delta",
                delta: { type: "text_delta", text: result.text },
              };
            }
          },
          finalMessage: async () => ({
            usage: result.usage,
          }),
        };
      },
    },
  };
}
