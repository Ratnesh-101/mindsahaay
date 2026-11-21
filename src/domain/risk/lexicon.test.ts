import { describe, it, expect } from "vitest";
import { normalizeText, detectRisk } from "./lexicon";

describe("Risk & Crisis Lexicon Domain Logic", () => {
  describe("normalizeText", () => {
    it("converts text to lowercase", () => {
      expect(normalizeText("I WANT TO DIE")).toBe("i want to die");
    });

    it("collapses 3 or more repeated letters to 1", () => {
      expect(normalizeText("sooooo stressed")).toBe("so stressed");
      expect(normalizeText("marrrrr jaaanaaaa")).toBe("mar jana");
      expect(normalizeText("plzzzzz help meeee")).toBe("plz help me");
    });

    it("replaces punctuation with spaces and collapses whitespace", () => {
      expect(normalizeText("Hello, world! How... are you???")).toBe(
        "hello world how are you"
      );
    });

    it("strips zero-width characters (ZWNJ, ZWJ, BOM)", () => {
      const withZW = "hello\u200Bworld\u200Ctest\u200Ddone\uFEFF";
      expect(normalizeText(withZW)).toBe("helloworldtestdone");
    });

    it("normalizes Devanagari nuktas and chandrabindu", () => {
      // ख़ुद (with nukta \u093C) -> खुद
      expect(normalizeText("ख़ुद")).toBe("खुद");
      // हूँ (with chandrabindu \u0901) -> हूं (with anusvara \u0902)
      expect(normalizeText("हूँ")).toBe("हूं");
    });

    it("returns empty string for empty or null inputs", () => {
      expect(normalizeText("")).toBe("");
      expect(normalizeText("   ")).toBe("");
      expect(normalizeText(null as unknown as string)).toBe("");
    });
  });

  describe("False Positive Protection (Idioms)", () => {
    it("evaluates 'this exam is killing me' as low risk academic stress, NOT imminent", () => {
      const result = detectRisk("This exam is killing me");
      expect(result.level).toBe("low");
      expect(result.level).not.toBe("imminent");
      expect(result.level).not.toBe("high");
      expect(result.categories).toContain("academic_stress");
    });

    it("evaluates other academic 'killing me' idioms as low risk", () => {
      const resSyllabus = detectRisk("The syllabus is literally killing me");
      expect(resSyllabus.level).toBe("low");
      expect(resSyllabus.categories).toContain("academic_stress");

      const resAssignments = detectRisk("These assignments are killing me");
      expect(resAssignments.level).toBe("low");
      expect(resAssignments.categories).toContain("academic_stress");
    });

    it("evaluates fatigue idioms as low risk", () => {
      const resHead = detectRisk("My head is killing me today");
      expect(resHead.level).toBe("low");
      expect(resHead.categories).toContain("distress");

      const resTired = detectRisk("I am dead tired after labs");
      expect(resTired.level).toBe("low");
      expect(resTired.categories).toContain("distress");

      const resBored = detectRisk("I am bored to death in this lecture");
      expect(resBored.level).toBe("low");
      expect(resBored.categories).toContain("distress");
    });

    it("evaluates positive slang and idioms as none", () => {
      const resKillingIt = detectRisk("We are killing it at the hackathon!");
      expect(resKillingIt.level).toBe("none");
      expect(resKillingIt.categories).toHaveLength(0);

      const resDyingLaughter = detectRisk("I was dying of laughter in the canteen");
      expect(resDyingLaughter.level).toBe("none");

      const resDropDead = detectRisk("She looks drop dead gorgeous");
      expect(resDropDead.level).toBe("none");
    });
  });

  describe("English Crisis & Risk Detection", () => {
    it("detects imminent suicidal intent in English", () => {
      const phrases = [
        "I want to kill myself",
        "killing myself tonight",
        "I am going to end my life",
        "I made a suicide plan",
        "Writing my suicide note",
        "I am going to hang myself",
        "I will swallow pills and die",
        "I am going to slit my wrists",
        "Want to die right now",
        "My final goodbye to everyone",
      ];

      for (const phrase of phrases) {
        const res = detectRisk(phrase);
        expect(res.level).toBe("imminent");
        expect(res.categories.length).toBeGreaterThan(0);
      }
    });

    it("detects high suicidal ideation and self-harm in English", () => {
      const phrases = [
        "I want to die",
        "I would be better off dead",
        "Wish I was never born",
        "I have no reason to live anymore",
        "Suffering from suicidal thoughts",
        "I have been cutting myself",
        "I feel like hurting myself",
      ];

      for (const phrase of phrases) {
        const res = detectRisk(phrase);
        expect(res.level).toBe("high");
      }
    });

    it("detects moderate risk (hopelessness, burden, entrapment) in English", () => {
      const phrases = [
        "I feel completely hopeless about everything",
        "I can't take this pain anymore",
        "I am just a burden to my family",
        "Trapped and overwhelmed with no way out",
        "Nobody would care if I disappeared",
      ];

      for (const phrase of phrases) {
        const res = detectRisk(phrase);
        expect(res.level).toBe("moderate");
        expect(
          res.categories.includes("hopelessness") ||
            res.categories.includes("distress")
        ).toBe(true);
      }
    });

    it("detects low risk (academic pressure, hostel loneliness) in English", () => {
      const phrases = [
        "Stressed about semester exams",
        "Placement stress is getting hard",
        "Feeling very lonely in hostel",
        "Homesick and missing family",
      ];

      for (const phrase of phrases) {
        const res = detectRisk(phrase);
        expect(res.level).toBe("low");
      }
    });
  });

  describe("Hindi (Devanagari) Crisis & Risk Detection", () => {
    it("detects imminent crisis in Devanagari", () => {
      const imminentHindi = [
        "मैं आत्महत्या करने जा रहा हूँ",
        "खुदकुशी करने का फैसला किया है",
        "मैं अपनी जान दे दूंगा",
        "खुद को खत्म करने जा रहा हूँ",
        "फांसी लगाने जा रहा हूँ",
      ];

      for (const phrase of imminentHindi) {
        const res = detectRisk(phrase);
        expect(res.level).toBe("imminent");
        expect(res.categories).toContain("suicidal_intent");
      }
    });

    it("detects high risk in Devanagari", () => {
      const highHindi = [
        "मैं मरना चाहता हूँ",
        "मर जाना चाहता हूँ",
        "अब जीना नहीं चाहता",
        "जीने की इच्छा नहीं बची",
        "खुद को नुकसान पहुँचाया है",
      ];

      for (const phrase of highHindi) {
        const res = detectRisk(phrase);
        expect(res.level).toBe("high");
      }
    });

    it("detects moderate risk in Devanagari", () => {
      const modHindi = [
        "सब कुछ व्यर्थ लग रहा है",
        "मैं अपने परिवार पर बोझ हूँ",
        "कोई उम्मीद नहीं बची",
      ];

      for (const phrase of modHindi) {
        const res = detectRisk(phrase);
        expect(res.level).toBe("moderate");
      }
    });

    it("detects low risk in Devanagari", () => {
      const lowHindi = [
        "पढ़ाई का तनाव बहुत है",
        "परीक्षा का डर लग रहा है",
        "हॉस्टल में अकेलापन लगता है",
        "घर की याद आ रही है",
      ];

      for (const phrase of lowHindi) {
        const res = detectRisk(phrase);
        expect(res.level).toBe("low");
      }
    });
  });

  describe("Romanised Hinglish Crisis & Risk Detection", () => {
    it("detects imminent crisis in romanised Hinglish", () => {
      const hinglishImminent = [
        "mar jaana chahta hoon",
        "mar jana chahti hu",
        "marne ja raha hu",
        "khud ko khatam kar dunga",
        "khudkhushi karne ka plan hai",
        "jaan de dunga aaj",
        "zehar kha lunga",
        "faasi laga lunga",
        "suicide karne ja raha hu",
      ];

      for (const phrase of hinglishImminent) {
        const res = detectRisk(phrase);
        expect(res.level).toBe("imminent");
      }
    });

    it("handles repeated letters in Hinglish crisis phrases", () => {
      const repeatedPhrases = [
        "marrrr jaaanaaaa chahtaaaa hooooon",
        "khudddd ko khatammm kar dunga",
        "jeeeeena nahi chahtaaaa",
      ];

      const res1 = detectRisk(repeatedPhrases[0]);
      expect(res1.level).toBe("imminent");

      const res2 = detectRisk(repeatedPhrases[1]);
      expect(res2.level).toBe("imminent");

      const res3 = detectRisk(repeatedPhrases[2]);
      expect(res3.level).toBe("high");
    });

    it("detects high risk in romanised Hinglish", () => {
      const hinglishHigh = [
        "jeena nahi chahta",
        "jeena nhi chahta",
        "ab aur nahi jeena",
        "marne ka mann kar raha hai",
        "khud ko harm kiya",
      ];

      for (const phrase of hinglishHigh) {
        const res = detectRisk(phrase);
        expect(res.level).toBe("high");
      }
    });

    it("detects moderate risk in romanised Hinglish", () => {
      const hinglishMod = [
        "family par bojh ban gaya hu",
        "sab par bojh hu",
        "koi umeed nahi bachi",
        "dard bardasht nahi hota",
      ];

      for (const phrase of hinglishMod) {
        const res = detectRisk(phrase);
        expect(res.level).toBe("moderate");
      }
    });

    it("detects low risk in romanised Hinglish", () => {
      const hinglishLow = [
        "exam ka tension ho raha hai",
        "padhai ka tension hai",
        "hostel me akelapan lagta hai",
        "placement ki tension hai",
      ];

      for (const phrase of hinglishLow) {
        const res = detectRisk(phrase);
        expect(res.level).toBe("low");
      }
    });
  });

  describe("Neutral & Empty Handling", () => {
    it("returns none for everyday neutral student queries", () => {
      const resHello = detectRisk("Hello, how can I practice deep breathing?");
      expect(resHello.level).toBe("none");
      expect(resHello.categories).toEqual([]);
      expect(resHello.matches).toEqual([]);

      const resNotes = detectRisk("Can you help me organize my study schedule?");
      expect(resNotes.level).toBe("none");
    });

    it("returns none for empty input", () => {
      const resEmpty = detectRisk("");
      expect(resEmpty.level).toBe("none");
      expect(resEmpty.categories).toEqual([]);
      expect(resEmpty.matches).toEqual([]);
    });
  });
});
