import { describe, it, expect } from "vitest";
import { detectRisk } from "./lexicon";
import type { RiskLevel } from "./lexicon";

const order: RiskLevel[] = ["none", "low", "moderate", "high", "imminent"];
const atLeast = (got: RiskLevel, want: RiskLevel): boolean => order.indexOf(got) >= order.indexOf(want);

describe("lexicon v2: independent paraphrases (not taken from the eval dataset)", () => {
  describe("imminent: intent plus time, plan, farewell or means", () => {
    const cases = [
      "I'm going to end it all tonight",
      "I am gonna unalive myself tomorrow",
      "tonight is the night, I'm ending my life",
      "I wrote a goodbye letter to my family and I'm ready",
      "I've decided to kill myself after my viva",
      "Said goodbye to everyone and gave away my laptop",
      "Don't try to find me, I won't be around after tonight",
      "main aaj raat suicide kar lunga",
      "mai aaj hi apni jaan le lunga",
      "mujhe dhundhna mat, alvida",
      "main aaj raat sab khatam kar dunga",
      "मैं कल रात फांसी लगा लूंगा",
      "आज रात मैं सब खत्म करना चाहता हूँ",
      "मेरा आखिरी अलविदा, सबको धन्यवाद",
    ];
    for (const c of cases) it(`imminent: ${c}`, () => expect(detectRisk(c).level).toBe("imminent"));
  });

  describe("high: ideation and self-harm without plan or time", () => {
    const cases = [
      "I want to die",
      "I wish I had never been born",
      "I've been thinking about killing myself",
      "I don't want to live anymore",
      "I wish I could go to sleep and never wake up",
      "I keep cutting my arms when I'm stressed",
      "sometimes I think about unaliving myself",
      "mujhe jeena nhi hai ab",
      "mrna chahti hu",
      "sucide ke baare me sochti hoon",
      "मैं अब जीना नहीं चाहती",
      "मुझे मरने का ख्याल आता है",
      "मैंने खुद को नुकसान पहुँचाया",
    ];
    for (const c of cases) it(`high or above: ${c}`, () => expect(atLeast(detectRisk(c).level, "high")).toBe(true));
  });

  describe("moderate: partial signals", () => {
    const cases = [
      "I feel so empty and numb these days",
      "I'm a burden on everyone around me",
      "I feel hopeless about everything",
      "Everyone would be better without me",
      "mujhe lagta hai sab kuch hopeless hai",
      "koi rasta nahi dikhta",
    ];
    for (const c of cases) it(`moderate or above: ${c}`, () => expect(atLeast(detectRisk(c).level, "moderate")).toBe(true));
  });

  describe("hard negatives must stay below high", () => {
    const cases = [
      "I would never kill myself, I just need sleep",
      "I'm not suicidal, just very tired of this assignment",
      "I don't want to die, I want to graduate!",
      "She wrote a song with the lyrics 'I wanna disappear tonight'",
      "The protagonist in the movie decides to kill himself in the last scene",
      "In this novel the villain ends it all at the end",
      "Our professor discussed suicide prevention awareness today",
      "Dying to see the results of the hackathon",
      "I almost died laughing at that meme",
      "I'm dead tired after the lab, going to sleep",
      "Goodbye everyone, graduation day is finally here!",
      "I accidentally cut myself while chopping onions",
      "He is killing it at the gym",
      "main marna nahi chahta, bas result chahiye",
      "main khud ko kabhi nuksan nahi pahunchaunga",
      "मैं खुद को कभी नुकसान नहीं पहुँचाऊँगा",
      "गाने की लाइन 'जीना नहीं है तेरे बिना' दिमाग में है",
      "उपन्यास का नायक आत्महत्या कर लेता है, कल चर्चा है",
      "I have a study plan for the weekend and I'm going to do it today",
    ];
    for (const c of cases) it(`not high: ${c}`, () => expect(atLeast(detectRisk(c).level, "high")).toBe(false));
  });

  describe("negation scope limits", () => {
    it("does not let 'won't lie' negate a real statement", () => {
      expect(atLeast(detectRisk("I won't lie, I want to die").level, "high")).toBe(true);
    });
    it("negation does not cross a comma or 'but'", () => {
      expect(atLeast(detectRisk("I don't know what to do, I want to kill myself").level, "high")).toBe(true);
      expect(atLeast(detectRisk("I never said it but I want to die").level, "high")).toBe(true);
    });
    it("self-negating phrases are not cancelled by negation words", () => {
      expect(atLeast(detectRisk("I don't want to live anymore").level, "high")).toBe(true);
    });
  });

  describe("first-person fiction does not suppress", () => {
    it("keeps a real statement even when a novel is mentioned", () => {
      expect(atLeast(detectRisk("I'm reading a novel and honestly I want to die").level, "high")).toBe(true);
    });
  });

  describe("graded levels and escalation", () => {
    it("explicit ideation is high, not imminent", () => {
      expect(detectRisk("I want to die").level).toBe("high");
    });
    it("a bare mention of suicide is escalated for first-person speakers", () => {
      const r = detectRisk("I keep seeing the word suicide in my head");
      expect(atLeast(r.level, "high")).toBe(true);
      expect(r.escalated).toBe(true);
    });
    it("'no plan' does not raise ideation to imminent", () => {
      expect(detectRisk("I think about ending things but I have no plan").level).toBe("high");
    });
    it("records suppressed hits for audit", () => {
      const r = detectRisk("I would never hurt myself");
      expect(r.level).toBe("none");
      expect(r.suppressed?.some((s) => s.includes("negated"))).toBe(true);
    });
  });

  describe("morphology and spelling variants", () => {
    const hing = ["marna chahta hoon", "marna chahti hu", "mrna chahta hun", "marna chahta hooon", "jeena nahi chahti", "jeena nhi chahta", "jeena nahin chahta"];
    for (const c of hing) it(`Hinglish variant: ${c}`, () => expect(atLeast(detectRisk(c).level, "high")).toBe(true));
    it("handles Devanagari with and without nukta and chandrabindu", () => {
      expect(atLeast(detectRisk("मैं मरना चाहता हूँ").level, "high")).toBe(true);
      expect(atLeast(detectRisk("मैं मरना चाहता हूं").level, "high")).toBe(true);
      expect(atLeast(detectRisk("मैं खुद को ख़त्म कर लूँगा").level, "imminent")).toBe(true);
    });
  });
});
