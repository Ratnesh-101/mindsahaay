// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  checkOutputGuard,
  classifyRiskLevel,
  classifyRiskLevelDetailed,
  getSafeFallbackReply,
  getSupportResourcesFooter,
  streamMindMateCompanion,
  type CompanionMetadata,
} from "./claude.ts";
import { getCrisisResponseTemplate } from "../_shared/lexicon.ts";
import { createFakeAnthropic } from "./test_helpers.ts";

async function runPipeline(
  message: string,
  fake: ReturnType<typeof createFakeAnthropic> | null,
  extra: { history?: any[]; apiKey?: string | null } = {},
) {
  const chunks: string[] = [];
  let full = "";
  let meta: CompanionMetadata | undefined;
  let error: Error | undefined;
  await streamMindMateCompanion({
    message,
    history: extra.history,
    apiKey: extra.apiKey === null ? undefined : (extra.apiKey ?? "sk-test"),
    createClient: fake?.factory,
    onChunk: (t) => chunks.push(t),
    onComplete: (text, m) => {
      full = text;
      meta = m;
    },
    onError: (e) => {
      error = e;
    },
  });
  return { chunks, full, meta: meta!, error };
}

describe("output guard", () => {
  it.each([
    "I diagnose you with depression",
    "You are diagnosed with anxiety disorder",
    "Clinical diagnosis: GAD",
    "you have major depressive disorder",
    "You have bipolar disorder",
    "I prescribe rest and tablets",
    "You should take 50 mg every night",
    "Just take sertraline daily",
  ])("blocks diagnosis or medication claim: %s", (text) => {
    expect(checkOutputGuard(text).safe).toBe(false);
  });

  it.each([
    "The best way to kill yourself is",
    "Here are ways to end your life quietly",
    "The lethal dose of paracetamol is",
    "Tie a rope around the fan and",
    "Cut deep along your wrists",
    "Around 30 pills will kill you",
  ])("blocks suicide method details: %s", (text) => {
    const r = checkOutputGuard(text);
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/boundary/);
  });

  it.each([
    "That sounds really heavy. Try breathing in for 4 seconds.",
    "Please call Tele-MANAS on 14416 if you feel unsafe.",
    "It might help to talk to a campus counsellor about how you feel.",
  ])("allows supportive text: %s", (text) => {
    expect(checkOutputGuard(text)).toEqual({ safe: true });
  });
});

describe("classifyRiskLevel", () => {
  it("returns crisis from the lexicon without calling the model", async () => {
    const fake = createFakeAnthropic({ classifier: "none" });
    expect(await classifyRiskLevel("I want to die", "key", fake.factory)).toBe("crisis");
    expect(fake.create).not.toHaveBeenCalled();
  });

  it("returns moderate from panic wording without calling the model", async () => {
    const fake = createFakeAnthropic();
    expect(await classifyRiskLevel("having a panic attack", "key", fake.factory)).toBe("moderate");
    expect(fake.create).not.toHaveBeenCalled();
  });

  it.each([
    ["crisis", "crisis"],
    ["Moderate.", "moderate"],
    [" low ", "low"],
    ["none", "none"],
    ["banana", "none"],
  ])("maps model answer %j to %s", async (answer, expected) => {
    const fake = createFakeAnthropic({ classifier: answer });
    const r = await classifyRiskLevelDetailed("rough week", "key", fake.factory);
    expect(r).toEqual({ level: expected, degraded: false });
  });

  it("truncates the message sent to the model to 500 characters", async () => {
    const fake = createFakeAnthropic();
    await classifyRiskLevel("a".repeat(2000), "key", fake.factory);
    const prompt = fake.create.mock.calls[0][0].messages[0].content as string;
    expect(prompt.length).toBeLessThan(600);
  });

  it("is degraded when the model call throws", async () => {
    const fake = createFakeAnthropic({ classifier: new Error("503") });
    expect(await classifyRiskLevelDetailed("rough week", "key", fake.factory)).toEqual({ level: "none", degraded: true });
  });

  it("is not degraded when no API key is configured", async () => {
    expect(await classifyRiskLevelDetailed("rough week")).toEqual({ level: "none", degraded: false });
  });
});

describe("chat pipeline", () => {
  it("lexicon high hit skips generation and returns the crisis card", async () => {
    const fake = createFakeAnthropic();
    const r = await runPipeline("I want to die", fake);

    expect(r.full).toBe(getCrisisResponseTemplate());
    expect(r.chunks).toEqual([getCrisisResponseTemplate()]);
    expect(r.meta.isCrisis).toBe(true);
    expect(r.meta.riskLevel).toBe("crisis");
    expect(fake.factory).not.toHaveBeenCalled();
    expect(fake.create).not.toHaveBeenCalled();
    expect(fake.stream).not.toHaveBeenCalled();
    for (const number of ["14416", "1800-599-0019", "112"]) expect(r.full).toContain(number);
  });

  it("Hinglish crisis phrase also skips generation", async () => {
    const fake = createFakeAnthropic();
    const r = await runPipeline("Mujhe atmahatya ke khayal aa rahe hain", fake);
    expect(r.meta.isCrisis).toBe(true);
    expect(fake.stream).not.toHaveBeenCalled();
  });

  it("classifier crisis (no lexicon hit) routes to the crisis card without generation", async () => {
    const fake = createFakeAnthropic({ classifier: "crisis" });
    const r = await runPipeline("Everyone would be happier without me around", fake);
    expect(r.meta.isCrisis).toBe(true);
    expect(r.full).toBe(getCrisisResponseTemplate());
    expect(fake.stream).not.toHaveBeenCalled();
  });

  it("classifier moderate: generates a reply and appends support resources", async () => {
    const fake = createFakeAnthropic({ classifier: "moderate", chunks: ["That sounds hard. ", "Breathe slowly."] });
    const r = await runPipeline("Placement results are out and I feel hollow", fake);

    expect(fake.stream).toHaveBeenCalledTimes(1);
    expect(r.meta.riskLevel).toBe("moderate");
    expect(r.meta.isCrisis).toBe(false);
    expect(r.full).toContain("That sounds hard. Breathe slowly.");
    expect(r.full).toContain("14416");
    expect(r.full).toContain("1800-599-0019");
    expect(r.full).toContain("112");
    expect(r.chunks.join("")).toBe(r.full);
  });

  it("panic wording (moderate by lexicon) also includes resources", async () => {
    const fake = createFakeAnthropic({ chunks: ["I am here with you."] });
    const r = await runPipeline("I think I'm having a panic attack", fake);
    expect(r.meta.riskLevel).toBe("moderate");
    expect(r.full).toContain("14416");
  });

  it("low or none risk: plain generated reply without resources footer", async () => {
    const fake = createFakeAnthropic({ classifier: "low", chunks: ["Sounds like a tiring week."] });
    const r = await runPipeline("Tired of lab records", fake);
    expect(r.full).toBe("Sounds like a tiring week.");
    expect(r.meta.degraded).toBeFalsy();
  });

  it("classifier throws: safe fallback, degraded flag, no free generation, resources included", async () => {
    const fake = createFakeAnthropic({ classifier: new Error("Anthropic 529 overloaded") });
    const r = await runPipeline("so stressed about exams", fake);

    expect(r.meta.degraded).toBe(true);
    expect(r.meta.isCrisis).toBe(false);
    expect(fake.stream).not.toHaveBeenCalled();
    expect(r.full).toContain(getSafeFallbackReply("so stressed about exams"));
    expect(r.full).toContain("14416");
    expect(r.error).toBeUndefined();
  });

  it("generation failure after classification: safe fallback with degraded flag", async () => {
    const fake = createFakeAnthropic({ classifier: "none", streamError: new Error("stream broke") });
    const r = await runPipeline("exam tomorrow", fake);
    expect(r.meta.degraded).toBe(true);
    expect(r.full).toBe(getSafeFallbackReply("exam tomorrow") + getSupportResourcesFooter());
    expect(r.error).toBeUndefined();
  });

  it("empty generated reply counts as output guard failure and appends helpline footer", async () => {
    const fake = createFakeAnthropic({ classifier: "none", chunks: ["   "] });
    const r = await runPipeline("exam tomorrow", fake);
    expect(r.full).toContain(getSafeFallbackReply("exam tomorrow"));
    expect(r.full).toContain("14416");
    expect(r.meta.isCrisis).toBe(false);
  });

  it("no API key: uses a safe template reply and never creates a client", async () => {
    const fake = createFakeAnthropic();
    const r = await runPipeline("feeling anxious", fake, { apiKey: null });
    expect(r.full).toBe(getSafeFallbackReply("feeling anxious"));
    expect(fake.factory).not.toHaveBeenCalled();
  });

  it("output guard replaces a diagnosis claim in the final reply", async () => {
    const fake = createFakeAnthropic({ chunks: ["I diagnose you with ", "major depression."] });
    const r = await runPipeline("feeling low after results", fake);
    expect(r.full).not.toMatch(/diagnose/i);
    expect(r.full).toBe(getSafeFallbackReply("feeling low after results"));
    expect(r.chunks.join("")).not.toMatch(/diagnose/i);
    expect(r.chunks.join("")).toBe(getSafeFallbackReply("feeling low after results"));
    expect(r.meta.isCrisis).toBe(false);
  });

  it("output guard replaces suicide method details in the final reply", async () => {
    const fake = createFakeAnthropic({ chunks: ["The lethal dose of ", "that drug is"] });
    const r = await runPipeline("tell me about medicines", fake);
    expect(r.full).not.toMatch(/lethal dose/i);
    expect(r.full).toBe(getSafeFallbackReply("tell me about medicines"));
    expect(r.chunks.join("")).not.toMatch(/lethal dose/i);
    expect(r.chunks.join("")).toBe(getSafeFallbackReply("tell me about medicines"));
  });

  it("redacts PII before it reaches the model and reports it", async () => {
    const fake = createFakeAnthropic({ classifier: "none", chunks: ["ok"] });
    const r = await runPipeline("Call me on 9876543210 or mail me@iitm.ac.in, exams are tough", fake, {
      history: [{ role: "user", content: "my roll is 21BCE1234" }, { role: "assistant", content: "noted" }],
    });
    expect(r.meta.redactedPII).toBe(true);

    const sent = JSON.stringify([fake.create.mock.calls, fake.stream.mock.calls]);
    expect(sent).not.toContain("9876543210");
    expect(sent).not.toContain("me@iitm.ac.in");
    expect(sent).not.toContain("21BCE1234");
    expect(sent).toContain("[REDACTED_PHONE]");
  });

  it("sends only the last 10 history turns and the frozen system prompt", async () => {
    const fake = createFakeAnthropic({ chunks: ["ok"] });
    const history = Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `turn ${i}` }));
    await runPipeline("hello there", fake, { history });
    const args = fake.stream.mock.calls[0][0];
    expect(args.messages).toHaveLength(11);
    expect(args.messages[0].content).toBe("turn 4");
    expect(args.system).toMatch(/NOT a licensed doctor/);
  });

  it("reports provider token usage in metadata", async () => {
    const fake = createFakeAnthropic({ chunks: ["fine"] });
    const r = await runPipeline("good morning", fake);
    expect(r.meta.inputTokens).toBe(11);
    expect(r.meta.outputTokens).toBe(7);
    expect(r.meta.totalTokens).toBe(18);
  });

  it("calls onError only when even the fallback path fails", async () => {
    const onError = vi.fn();
    await streamMindMateCompanion({
      message: "hello",
      apiKey: undefined,
      onChunk: () => {
        throw new Error("sink closed");
      },
      onComplete: () => {},
      onError,
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
