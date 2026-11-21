// ==============================================================================
// Shared Crisis Lexicon & Emergency Response Protocols
// MindSahaay Platform - India Higher Educational Institutions
// Single source of truth: generated from src/domain/risk/lexicon.ts via scripts/sync-lexicon.mjs
// ==============================================================================

import detectRisk, {
  normalizeText,
  type RiskCategory,
  type RiskDetectionResult,
  type RiskLevel,
} from "./lexicon.generated.ts";

export { detectRisk, normalizeText };
export default detectRisk;
export type { RiskCategory, RiskDetectionResult, RiskLevel };

export interface HelplineResource {
  name: string;
  number: string;
  description: string;
  available: string;
  languages: string;
}

export const OFFICIAL_HELPLINES: HelplineResource[] = [
  {
    name: "Tele-MANAS",
    number: "14416",
    description: "National Tele Mental Health Programme of India (MoHFW)",
    available: "24/7, Toll-Free",
    languages: "20+ Indian Languages including Hindi, English, Tamil, Telugu, Bengali, Marathi, etc.",
  },
  {
    name: "Tele-MANAS (Alternate Toll-Free)",
    number: "1800-891-4416",
    description: "Alternate national direct access dialer",
    available: "24/7, Toll-Free",
    languages: "Pan-India",
  },
  {
    name: "KIRAN Mental Health Helpline",
    number: "1800-599-0019",
    description: "Department of Empowerment of Persons with Disabilities (DEPwD), Govt. of India",
    available: "24/7, Toll-Free",
    languages: "13 Languages",
  },
  {
    name: "National Emergency Services",
    number: "112",
    description: "All-in-one emergency response (Ambulance, Police, Fire)",
    available: "24/7, Toll-Free",
    languages: "Pan-India",
  },
  {
    name: "Vandrevala Foundation",
    number: "9999-666-555",
    description: "Free 24/7 Mental Health Support & Crisis Intervention",
    available: "24/7",
    languages: "Hindi, English, Gujarati, etc.",
  },
];

// Severe Acute Distress / Panic Keywords for moderate tier pre-screening
export const SEVERE_PANIC_KEYWORDS = [
  "panic attack",
  "cannot breathe",
  "cant breathe",
  "chest pain panic",
  "heart pounding out of chest",
  "passing out from anxiety",
  "losing my mind",
  "going crazy from stress",
  "shaking violently",
  "hyperventilating",
  "choking sensation",
];

// Romanised suicide terms that map to Devanagari आत्महत्या in v2 lexicon
const ROMAN_CRISIS_KEYWORDS = [
  "atmahatya",
  "aatmhatya",
  "aatm hatya",
];

export interface CrisisLexiconResult {
  isCrisis: boolean;
  matchedTerms: string[];
  severity: "none" | "moderate" | "crisis";
  level: RiskLevel;
  categories: RiskCategory[];
}

const LEVELS: RiskLevel[] = ["none", "low", "moderate", "high", "imminent"];
const rank = (l: RiskLevel): number => LEVELS.indexOf(l);

/**
 * Deterministic Pre-Screen: checks incoming text using the synchronized v2 crisis lexicon.
 * Returns crisis if level is high or imminent.
 * Returns moderate if level is moderate or matches acute panic keywords.
 */
export function checkCrisisLexicon(text: string): CrisisLexiconResult {
  if (!text || typeof text !== "string") {
    return {
      isCrisis: false,
      matchedTerms: [],
      severity: "none",
      level: "none",
      categories: [],
    };
  }

  let result = detectRisk(text);
  if (result.level !== "high" && result.level !== "imminent" && /[\r\n]/.test(text)) {
    const flattened = detectRisk(text.replace(/[\r\n]+/g, " "));
    if (rank(flattened.level) > rank(result.level)) {
      result = flattened;
    }
  }

  let isCrisis = result.level === "high" || result.level === "imminent";
  const matchedTerms = [...result.matches];

  const lower = text.toLowerCase();
  if (!isCrisis) {
    if (lower.trim() === "suicide" || lower.trim() === "suicidal") {
      isCrisis = true;
      matchedTerms.push("suicide");
    } else {
      for (const kw of ROMAN_CRISIS_KEYWORDS) {
        if (lower.includes(kw)) {
          isCrisis = true;
          matchedTerms.push(kw);
          break;
        }
      }
    }
  }

  if (isCrisis) {
    return {
      isCrisis: true,
      matchedTerms: matchedTerms.length > 0 ? matchedTerms : ["crisis_detected"],
      severity: "crisis",
      level: result.level === "none" || result.level === "low" ? "high" : result.level,
      categories: result.categories.length > 0 ? result.categories : ["suicidal_intent"],
    };
  }

  if (result.level === "moderate") {
    return {
      isCrisis: false,
      matchedTerms: result.matches,
      severity: "moderate",
      level: "moderate",
      categories: result.categories,
    };
  }

  // Check severe acute panic keywords as moderate tier
  const matchedPanic: string[] = [];
  for (const pw of SEVERE_PANIC_KEYWORDS) {
    if (lower.includes(pw)) {
      matchedPanic.push(pw);
    }
  }

  if (matchedPanic.length > 0) {
    return {
      isCrisis: false,
      matchedTerms: matchedPanic,
      severity: "moderate",
      level: result.level,
      categories: result.categories,
    };
  }

  return {
    isCrisis: false,
    matchedTerms: result.matches,
    severity: "none",
    level: result.level,
    categories: result.categories,
  };
}

/**
 * Pre-formatted, culturally safe, compassionate crisis response template.
 */
export function getCrisisResponseTemplate(options?: { userAlias?: string }): string {
  const greeting = options?.userAlias ? `Dear ${options.userAlias}` : "I hear you";

  return `${greeting}, I hear how deeply overwhelming and painful things feel right now, but please know with certainty that you do not have to carry this alone. Your life and your presence matter tremendously.

Because your safety and well-being are the absolute priority, please connect immediately with these free, confidential, 24/7 Indian crisis support services:

* 📞 **Tele-MANAS**: **14416** or **1800-891-4416** (Toll-Free, 24/7, Govt. of India, available in 20+ Indian languages)
* 📞 **KIRAN Helpline**: **1800-599-0019** (Toll-Free, 24/7, Ministry of Social Justice & Empowerment)
* 🚨 **National Emergency Services**: **112** (Immediate police, ambulance, medical support)
* 💬 **Vandrevala Foundation**: **9999-666-555** (24/7 mental health crisis support)

If you are currently on campus, please reach out to your **Hostel Warden, Campus Health Centre, or University Counsellor**. 

Take one gentle breath right now. Trained, compassionate people are awake and ready to listen without judgment. Please dial **14416** right now.`;
}
