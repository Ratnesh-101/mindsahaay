// ==============================================================================
// Claude Opus 5.5 AI Companion Pipeline
// MindSahaay Platform - India Higher Educational Institutions
// Pipeline:
// 1. Deterministic Lexicon Pre-Screen
// 2. Structured Risk Classifier & Routing
// 3. PII Redaction
// 4. Frozen System Prompt Companion (Hinglish/English, non-clinical, supportive)
// 5. Streaming Token Delivery via SSE
// 6. Output Guard & Safe Template Fallback
// ==============================================================================

import { checkCrisisLexicon, getCrisisResponseTemplate } from "../_shared/lexicon.ts";
import { redactPII } from "../_shared/pii.ts";

// Minimal structural type of the Anthropic SDK client used here. Keeps this module free of
// Deno-only specifiers (npm:) so it runs under Vitest in Node with an injected fake client.
// The real client is wired in server/anthropic_client.ts.
export interface AnthropicLike {
  messages: {
    create: (args: any) => Promise<any>;
    stream: (args: any) => any;
  };
}
export type AnthropicFactory = (apiKey: string) => AnthropicLike;

export const FROZEN_COMPANION_SYSTEM_PROMPT = `You are MindMate, a warm, compassionate, and non-judgmental digital well-being companion for university students in India. You are an integral part of the MindSahaay platform, operating under the Mental Healthcare Act 2017 and India DPDP Act 2023.

ABSOLUTE CLINICAL & SAFETY BOUNDARIES:
1. You are a supportive peer well-being companion, NOT a licensed doctor, therapist, psychologist, or psychiatrist.
2. NEVER provide clinical or medical diagnoses. Never label the student with disorders (e.g., do NOT say "You have major depressive disorder", "You have ADHD", "You are bipolar").
3. NEVER prescribe, recommend, or discuss specific pharmaceutical medications, dosages, or chemical remedies.
4. Always maintain that the app is an educational well-being aid, not a clinical treatment facility.
5. If at any point the conversation reveals crisis or suicidal intent, immediately encourage dialing Tele-MANAS (14416) or KIRAN (1800-599-0019).

CULTURAL CONTEXT & LANGUAGE MIRRORING:
1. Indian Higher Education Environment: Understand the authentic reality of Indian campus life—academic burnout, relative grading, CGPA pressure, placement anxiety, backlog stress, hostel food and homesickness, competitive entrance exams (JEE, NEET, GATE, CAT, UPSC), and parental expectations.
2. Language Mirroring: Match the language and tone of the student.
   - If they write in English, reply in empathetic, warm, grounded English.
   - If they write in Hinglish (colloquial Hindi written in Latin script, e.g., "Bahut tension ho rahi hai", "Hostel me lonely feel ho raha hai", "Exam me fail ho jaunga"), reply in natural, soothing Hinglish (e.g., "Main samajh sakta hoon ki is waqt dimag me kitni sari cheezein chal rahi hain... Sab kuch ek saath sambhalna zaroori nahi hai. Ek gehri saans lein").
   - If they write in regional Indian languages (Hindi, Tamil, Telugu, Bengali, Marathi, etc.), respond respectfully in that language.
3. Grounding & Micro-steps: Offer actionable, gentle grounding tools (4-7-8 breathing, 5-4-3-2-1 sensory awareness, the 5-minute study micro-start, progressive muscle release).
4. Tone: Validating, calm, warm, and concise. Never lecture, scold, or invalidate student struggles.`;

// Forbidden clinical expressions for Output Guard
const FORBIDDEN_CLINICAL_PATTERNS = [
  /i diagnose you with/i,
  /you are diagnosed with/i,
  /clinical diagnosis:/i,
  /you have major depressive disorder/i,
  /you have bipolar/i,
  /you have schizophrenia/i,
  /i prescribe/i,
  /you should take \d+\s?mg/i,
  /take escitalopram|sertraline|fluoxetine|alprazolam|clonazepam/i,
  // Suicide / self-harm method details (never provide means, quantities or instructions)
  /(how to|ways to|steps to|best way to|easiest way to)\s+(kill yourself|end your life|commit suicide|hang yourself|overdose|slit)/i,
  /lethal dose/i,
  /(tie|use|make)\s+(a\s+)?(noose|rope)\s+(around|to)/i,
  /(cut|slit)\s+(deeply|deep|vertically)(\s+along)?\s+(your|the)\s+(wrists?|arms?|veins?)/i,
  /\d+\s*(pills|tablets)\s+(will|would|can|should)\s+(kill|be fatal|be enough)/i,
];

/**
 * Validates text against Output Guard.
 */
export function checkOutputGuard(text: string): { safe: boolean; reason?: string } {
  for (const pattern of FORBIDDEN_CLINICAL_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, reason: "Output violated clinical non-diagnostic boundary." };
    }
  }
  return { safe: true };
}

export interface RiskClassification {
  level: "crisis" | "moderate" | "low" | "none";
  /** True when an LLM classifier was expected but failed, so the level could not be trusted. */
  degraded: boolean;
}

export async function classifyRiskLevelDetailed(
  message: string,
  anthropicApiKey?: string,
  createClient?: AnthropicFactory,
): Promise<RiskClassification> {
  // 1. Fast deterministic check
  const lexiconResult = checkCrisisLexicon(message);
  if (lexiconResult.isCrisis) {
    return { level: "crisis", degraded: false };
  }
  if (lexiconResult.severity === "moderate") {
    return { level: "moderate", degraded: false };
  }

  // 2. If API key is available, run lightweight structured classifier
  if (anthropicApiKey) {
    try {
      if (!createClient) throw new Error("No Anthropic client factory configured");
      const client = createClient(anthropicApiKey);
      const response = await client.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 30,
        temperature: 0,
        system: "You are a crisis triage classifier for Indian students. Output exactly one word: 'crisis', 'moderate', 'low', or 'none'. 'crisis' = suicidal thoughts, self-harm, imminent violence. Otherwise assess emotional distress level.",
        messages: [{ role: "user", content: `Classify this student message: "${message.slice(0, 500)}"` }],
      });

      const firstBlock = response?.content?.[0];
      const answer = (firstBlock && "text" in firstBlock ? String(firstBlock.text) : "").trim().toLowerCase();
      if (answer.includes("crisis")) return { level: "crisis", degraded: false };
      if (answer.includes("moderate")) return { level: "moderate", degraded: false };
      if (answer.includes("low")) return { level: "low", degraded: false };
      return { level: "none", degraded: false };
    } catch {
      // The lexicon found nothing and the classifier is unavailable: report "none" but flag it
      // as degraded so callers can avoid free-form generation.
      return { level: "none", degraded: true };
    }
  }

  return { level: "none", degraded: false };
}

export async function classifyRiskLevel(
  message: string,
  anthropicApiKey?: string,
  createClient?: AnthropicFactory,
): Promise<"crisis" | "moderate" | "low" | "none"> {
  return (await classifyRiskLevelDetailed(message, anthropicApiKey, createClient)).level;
}

/**
 * Support resources appended to replies when risk is moderate or could not be assessed.
 */
export function getSupportResourcesFooter(): string {
  return "\n\nIf things feel heavy, you can talk to someone right now, free and confidential, 24/7: Tele-MANAS 14416 (or 1800-891-4416), KIRAN 1800-599-0019. In an emergency call 112. MindSahaay is an educational well-being aid, not a clinical service.";
}
/**
 * Safe fallback template when Claude is unavailable or output guard trips.
 */
export function getSafeFallbackReply(userMessage: string): string {
  const lower = userMessage.toLowerCase();
  if (lower.includes("stress") || lower.includes("anxious") || lower.includes("tension") || lower.includes("panic")) {
    return "It sounds like you are carrying a lot on your shoulders right now. Take a quiet breath with me: breathe in for 4 seconds, hold gently for 4, and breathe out slowly for 6. You do not have to solve every single problem today. What is the one small task you can set aside for tonight?";
  }
  if (lower.includes("exam") || lower.includes("study") || lower.includes("fail") || lower.includes("cgpa")) {
    return "Academic pressure in university can make everything feel like an emergency. Remember that your worth is not defined by any single semester or exam grade. Try a 5-minute micro-start: pick just one paragraph or problem, set a timer, and let go of perfection.";
  }
  return "Thank you for sharing that with me. It takes real courage to pause and notice what you are experiencing. How can we make the next hour feel a little lighter and more manageable for you?";
}

/**
 * Main Streaming Handler for MindMate Companion.
 */
export interface CompanionMetadata {
  isCrisis: boolean;
  redactedPII: boolean;
  riskLevel: "crisis" | "moderate" | "low" | "none";
  /** True when the risk classifier failed and a safe template reply was used instead of generation. */
  degraded?: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export async function streamMindMateCompanion(options: {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  apiKey?: string;
  createClient?: AnthropicFactory;
  onPreparing?: () => void;
  onChunk: (text: string) => void;
  onComplete: (fullText: string, metadata: CompanionMetadata) => void;
  onError: (err: Error) => void;
}): Promise<void> {
  const { message, history = [], apiKey, createClient, onPreparing, onChunk, onComplete, onError } = options;

  try {
    // 1. Pipeline Stage 1: Deterministic Lexicon Pre-Screen
    const lexiconCheck = checkCrisisLexicon(message);
    if (lexiconCheck.isCrisis) {
      const crisisTemplate = getCrisisResponseTemplate();
      const inTokens = Math.ceil(message.length / 4);
      const outTokens = Math.ceil(crisisTemplate.length / 4);
      onChunk(crisisTemplate);
      onComplete(crisisTemplate, {
        isCrisis: true,
        redactedPII: false,
        riskLevel: "crisis",
        inputTokens: inTokens,
        outputTokens: outTokens,
        totalTokens: inTokens + outTokens,
      });
      return;
    }

    // 2. Pipeline Stage 2: PII Redaction
    const { sanitized, hasRedactions } = redactPII(message);

    // 3. Pipeline Stage 3: Structured Risk Classifier & Routing
    const { level: riskLevel, degraded } = await classifyRiskLevelDetailed(sanitized, apiKey, createClient);
    const resourcesFooter = riskLevel === "moderate" || degraded ? getSupportResourcesFooter() : "";
    if (riskLevel === "crisis") {
      const crisisTemplate = getCrisisResponseTemplate();
      const inTokens = Math.ceil(sanitized.length / 4);
      const outTokens = Math.ceil(crisisTemplate.length / 4);
      onChunk(crisisTemplate);
      onComplete(crisisTemplate, {
        isCrisis: true,
        redactedPII: hasRedactions,
        riskLevel: "crisis",
        inputTokens: inTokens,
        outputTokens: outTokens,
        totalTokens: inTokens + outTokens,
      });
      return;
    }

    // 4. If the classifier failed, or no Anthropic API key is configured, fallback safely
    if (degraded || !apiKey || !createClient) {
      const fallback = getSafeFallbackReply(sanitized) + resourcesFooter;
      const inTokens = Math.ceil(sanitized.length / 4);
      const outTokens = Math.ceil(fallback.length / 4);
      onChunk(fallback);
      onComplete(fallback, {
        isCrisis: false,
        redactedPII: hasRedactions,
        riskLevel: riskLevel || "none",
        degraded,
        inputTokens: inTokens,
        outputTokens: outTokens,
        totalTokens: inTokens + outTokens,
      });
      return;
    }

    // 5. Pipeline Stage 4: Frozen System Prompt Companion with Claude Opus 5.5
    const client = createClient(apiKey);
    onPreparing?.();

    // Format sanitized history
    const anthropicMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const item of history.slice(-10)) {
      anthropicMessages.push({
        role: item.role,
        content: redactPII(item.content).sanitized,
      });
    }
    anthropicMessages.push({
      role: "user",
      content: sanitized,
    });

    // Stream generation from Claude Opus 5.5 (buffered server-side to guarantee output guard runs before any text reaches student)
    const stream = await client.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 1024,
      temperature: 0.7,
      system: FROZEN_COMPANION_SYSTEM_PROMPT,
      messages: anthropicMessages,
    });

    let fullGenerated = "";

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
        const text = chunk.delta.text || "";
        fullGenerated += text;
      }
    }

    // Estimate or retrieve usage tokens
    let inputTokens = Math.ceil(sanitized.length / 4);
    let outputTokens = Math.ceil(fullGenerated.length / 4);
    try {
      const finalMsg = await stream.finalMessage();
      if (finalMsg?.usage) {
        inputTokens = finalMsg.usage.input_tokens;
        outputTokens = finalMsg.usage.output_tokens;
      }
    } catch {
      // Keep estimated token count
    }

    // 6. Pipeline Stage 5: Output Guard Check (Mandatory safety verification before delivery)
    const guardResult = checkOutputGuard(fullGenerated);
    let finalDeliveryText: string;
    let finalOutputTokens: number;

    if (!guardResult.safe) {
      finalDeliveryText = getSafeFallbackReply(sanitized) + resourcesFooter;
      finalOutputTokens = Math.ceil(finalDeliveryText.length / 4);
    } else {
      finalDeliveryText = fullGenerated + resourcesFooter;
      finalOutputTokens = outputTokens + (resourcesFooter ? Math.ceil(resourcesFooter.length / 4) : 0);
    }

    // Deliver guarded content in chunks
    const CHUNK_SIZE = 32;
    for (let i = 0; i < finalDeliveryText.length; i += CHUNK_SIZE) {
      onChunk(finalDeliveryText.slice(i, i + CHUNK_SIZE));
    }

    onComplete(finalDeliveryText, {
      isCrisis: false,
      redactedPII: hasRedactions,
      riskLevel: riskLevel || "none",
      inputTokens,
      outputTokens: finalOutputTokens,
      totalTokens: inputTokens + finalOutputTokens,
    });
  } catch (err: any) {
    // Pipeline Stage 6: Safe Template Fallback on any failure
    try {
      const fallback = getSafeFallbackReply(message);
      const inTokens = Math.ceil(message.length / 4);
      const outTokens = Math.ceil(fallback.length / 4);
      onChunk(fallback);
      onComplete(fallback, {
        isCrisis: false,
        redactedPII: false,
        riskLevel: "none",
        degraded: true,
        inputTokens: inTokens,
        outputTokens: outTokens,
        totalTokens: inTokens + outTokens,
      });
    } catch {
      onError(err);
    }
  }
}
