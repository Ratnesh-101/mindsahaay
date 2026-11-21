// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  OFFICIAL_HELPLINES,
  checkCrisisLexicon,
  getCrisisResponseTemplate,
} from "./lexicon.ts";

describe("server checkCrisisLexicon", () => {
  it.each([
    "I want to die",
    "thinking about suicide",
    "I will kill myself tonight",
    "mujhe marna chahti hoon",
    "main apni jaan de dunga",
    "main apni jaan le lunga",
    "sab kuch khatam kar dunga",
    "आत्महत्या करना चाहता हूं",
    "मरने जा रहा हूं",
  ])("flags %j as crisis", (text) => {
    const r = checkCrisisLexicon(text);
    expect(r.isCrisis).toBe(true);
    expect(r.severity).toBe("crisis");
    expect(r.matchedTerms.length).toBeGreaterThan(0);
  });

  it("is case-insensitive and treats newlines as spaces", () => {
    expect(checkCrisisLexicon("I WANT\nTO DIE").isCrisis).toBe(true);
    expect(checkCrisisLexicon("I want to DIE").isCrisis).toBe(true);
    expect(checkCrisisLexicon("i want\tto die").isCrisis).toBe(true);
  });

  it("returns moderate (not crisis) for acute panic wording", () => {
    const r = checkCrisisLexicon("I think I am having a panic attack");
    expect(r.isCrisis).toBe(false);
    expect(r.severity).toBe("moderate");
  });

  it("returns none for everyday stress and for empty or invalid input", () => {
    expect(checkCrisisLexicon("Exam tomorrow, feeling stressed").severity).toBe("none");
    expect(checkCrisisLexicon("").severity).toBe("none");
    expect(checkCrisisLexicon(undefined as any).isCrisis).toBe(false);
  });

  it("gives crisis precedence over panic wording", () => {
    expect(checkCrisisLexicon("panic attack and I want to die").severity).toBe("crisis");
  });
});

describe("crisis response template and helplines", () => {
  it("lists the official Indian helplines", () => {
    const numbers = OFFICIAL_HELPLINES.map((h) => h.number);
    expect(numbers).toEqual(expect.arrayContaining(["14416", "1800-891-4416", "1800-599-0019", "112"]));
  });

  it("includes Tele-MANAS, KIRAN and 112 in the crisis card", () => {
    const card = getCrisisResponseTemplate();
    expect(card).toContain("14416");
    expect(card).toContain("1800-599-0019");
    expect(card).toContain("112");
  });

  it("personalises the greeting only when an alias is given", () => {
    expect(getCrisisResponseTemplate()).toMatch(/^I hear you,/);
    expect(getCrisisResponseTemplate({ userAlias: "Asha" })).toMatch(/^Dear Asha,/);
  });
});
