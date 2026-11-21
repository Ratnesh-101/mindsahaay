/**
 * MindSahaay Deterministic Crisis & Risk Detector
 * Pure domain logic for multilingual crisis and risk detection.
 *
 * Covers:
 * - English
 * - Hindi (Devanagari script)
 * - Romanised Hinglish (e.g., "mar jaana chahta hoon", "jeena nahi chahta", "khud ko khatam")
 *
 * Safety & Triage:
 * - Deterministic, rule-based keyword & idiom matching with regex boundaries.
 * - Handles text normalization: Unicode NFC, zero-width stripping, case folding,
 *   apostrophe stripping, Devanagari nukta/chandrabindu normalization,
 *   preserving combining marks (\p{M}), and repeated-character collapse.
 * - Rigorous false-positive handling: common student idioms like "this exam is killing me",
 *   "dead tired", "dying of laughter", "killing it" do NOT trigger imminent or high crisis.
 *
 * Educational disclaimer: MindSahaay is an educational and supportive well-being platform,
 * not a diagnostic tool or clinical emergency service.
 */

export type RiskLevel = "none" | "low" | "moderate" | "high" | "imminent";

export type RiskCategory =
  | "suicidal_intent"
  | "self_harm"
  | "hopelessness"
  | "distress"
  | "academic_stress"
  | "isolation";

export interface RiskDetectionResult {
  level: RiskLevel;
  categories: RiskCategory[];
  matches: string[];
  normalizedText: string;
}

interface DetectionRule {
  pattern: RegExp;
  category: RiskCategory;
  level: RiskLevel;
  label: string;
}

/**
 * Normalizes text for risk detection:
 * 1. Unicode NFC normalization
 * 2. Lowercasing
 * 3. Stripping zero-width characters (ZWJ, ZWNJ, BOM)
 * 4. Normalizing Devanagari nuktas (stripping \u093C) and chandrabindu to anusvara
 * 5. Stripping contraction apostrophes so "can't" becomes "cant", "i'm" becomes "im"
 * 6. Collapsing 3+ repeated characters down to 1 (e.g. "sooooo" -> "so", "marrrr" -> "mar")
 * 7. Replacing punctuation with single spaces while preserving Unicode letters (\p{L}),
 *    combining marks (\p{M} such as Devanagari matras), and digits (\p{N})
 * 8. Normalizing whitespace
 */
export function normalizeText(rawText: string): string {
  if (!rawText) return "";

  let text = rawText.normalize("NFC").toLowerCase();

  // Strip zero-width characters (ZWNJ \u200C, ZWJ \u200D, \u200B, \uFEFF)
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, "");

  // Devanagari normalization:
  // Remove nukta (\u093C) so ख़ुद -> खुद, ज़हर -> जहर, etc.
  text = text.replace(/\u093C/g, "");
  // Normalize chandrabindu (\u0901) to anusvara (\u0902) so हूँ -> हूं
  text = text.replace(/\u0901/g, "\u0902");

  // Strip apostrophes so "can't" -> "cant", "don't" -> "dont", "i'm" -> "im"
  text = text.replace(/['’]/g, "");

  // Collapse 3 or more repeated characters to 1 (e.g. "marrrr" -> "mar", "plzzzzz" -> "plz")
  text = text.replace(/(.)\1{2,}/gu, "$1");

  // Replace punctuation and symbols with space, keeping letters (\p{L}),
  // combining marks (\p{M} such as Devanagari matras), and numbers (\p{N})
  text = text.replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ");

  // Normalize consecutive whitespace to a single space and trim
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Harmless idioms that contain words like "kill", "dead", "dying"
 * but do NOT denote suicidal intent or self-harm.
 */
const HARMLESS_BENIGN_PATTERNS: RegExp[] = [
  /\b(?:i\s*am|im|we\s*are|were|you\s*are|youre|they\s*are|theyre|she\s*is|shes|he\s*is|hes)\s+killing\s+it\b/i,
  /\bdying\s+(?:of\s+laughter|to\s+see|to\s+know|to\s+meet|to\s+watch)\b/i,
  /\bdrop\s+dead\s+gorgeous\b/i,
];

/**
 * Idioms where words like "killing me" / "dead" represent academic pressure or fatigue,
 * correctly categorized as low risk (academic stress or mild distress).
 */
const LOW_RISK_IDIOM_RULES: DetectionRule[] = [
  {
    pattern:
      /\b(?:exam|exams|syllabus|test|tests|viva|quiz|assignment|assignments|homework|workload|pressure|routine|studies|study|classes)\s+(?:is|are|was|were)?\s*(?:literally\s+)?killing\s+me\b/i,
    category: "academic_stress",
    level: "low",
    label: "academic idiom: exam killing me",
  },
  {
    pattern:
      /\b(?:literally\s+)?killing\s+me\s*(?:this|the)?\s*(?:exam|exams|syllabus|test|assignment|homework)\b/i,
    category: "academic_stress",
    level: "low",
    label: "academic idiom: killing me (exam)",
  },
  {
    pattern:
      /\b(?:head|headache|back|neck|feet|stomach|heat|weather)\s+(?:is|are|was|were)?\s*(?:literally\s+)?killing\s+me\b/i,
    category: "distress",
    level: "low",
    label: "physical fatigue idiom: head/back killing me",
  },
  {
    pattern: /\bdead\s+tired\b/i,
    category: "distress",
    level: "low",
    label: "fatigue idiom: dead tired",
  },
  {
    pattern: /\bbored\s+to\s+death\b/i,
    category: "distress",
    level: "low",
    label: "boredom idiom: bored to death",
  },
  {
    pattern:
      /\bscared\s+to\s+death\s+(?:of\s+)?(?:the\s+)?(?:viva|exam|results?|presentation|test)\b/i,
    category: "academic_stress",
    level: "low",
    label: "academic stress idiom: scared to death of exam",
  },
];

/**
 * Imminent Crisis Rules
 * Explicit immediate intent, planning, active preparation, or lethal self-harm.
 */
const IMMINENT_RULES: DetectionRule[] = [
  // English Imminent
  {
    pattern:
      /\b(?:i\s+)?(?:want\s+to|wanna|going\s+to|gonna|will|plan\s+to|about\s+to)\s+(?:kill\s+myself|end\s+my\s+life|hang\s+myself|shoot\s+myself)\b/i,
    category: "suicidal_intent",
    level: "imminent",
    label: "explicit suicidal plan/intent",
  },
  {
    pattern: /\b(?:kill\s+myself|killing\s+myself|kil+\s+myself|kiling\s+myself)\b/i,
    category: "suicidal_intent",
    level: "imminent",
    label: "kill myself",
  },
  {
    pattern:
      /\b(?:suicide\s+(?:plan|note|attempt|letter)|commit(?:ting)?\s+suicide)\b/i,
    category: "suicidal_intent",
    level: "imminent",
    label: "suicide plan/attempt/note",
  },
  {
    pattern: /\b(?:end\s+(?:my\s+life|it\s+all)|ending\s+my\s+life)\b/i,
    category: "suicidal_intent",
    level: "imminent",
    label: "end my life/end it all",
  },
  {
    pattern:
      /\b(?:swallow(?:ing)?\s+pills\s+and\s+die|overdose\s+(?:on\s+pills|myself)|take\s+all\s+(?:my\s+)?pills)\b/i,
    category: "suicidal_intent",
    level: "imminent",
    label: "overdose/pills intent",
  },
  {
    pattern: /\b(?:slit\s+(?:my\s+)?wrists?|cut\s+(?:my\s+)?wrists?)\b/i,
    category: "self_harm",
    level: "imminent",
    label: "wrist cutting self-harm",
  },
  {
    pattern:
      /\b(?:jump(?:ing)?\s+(?:off|from)\s+(?:a\s+|the\s+)?(?:roof|bridge|balcony|terrace|building|window)|jump\s+in\s+front\s+of\s+(?:a\s+|the\s+)?train)\b/i,
    category: "suicidal_intent",
    level: "imminent",
    label: "lethal jump method",
  },
  {
    pattern:
      /\b(?:goodbye\s+(?:note|letter|world|everyone)|my\s+final\s+goodbye|this\s+is\s+my\s+goodbye)\b/i,
    category: "suicidal_intent",
    level: "imminent",
    label: "goodbye note/message",
  },
  {
    pattern: /\b(?:want\s+to|wanna)\s+die\s+right\s+now\b/i,
    category: "suicidal_intent",
    level: "imminent",
    label: "want to die right now",
  },

  // Hindi Devanagari Imminent
  {
    pattern:
      /(?:आत्महत्या\s+(?:कर(?:ने|ूंगा|ूंगी|ना)|का\s+विचार|का\s+प्लान)|खुदकुशी\s+कर)/u,
    category: "suicidal_intent",
    level: "imminent",
    label: "Devanagari: suicide action/plan",
  },
  {
    pattern:
      /(?:मरने\s+जा\s+रहा|मरने\s+जा\s+रही|जान\s+दे\s+दूंगा|जान\s+दे\s+दूंगी|अपनी\s+जान\s+ले\s+लूंगा)/u,
    category: "suicidal_intent",
    level: "imminent",
    label: "Devanagari: going to die/take life",
  },
  {
    pattern:
      /(?:खुद\s+को\s+खत्म\s+कर(?:ने|ना|ूंगा|ूंगी)|सब\s+कुछ\s+खत्म\s+करने\s+जा\s+रहा)/u,
    category: "suicidal_intent",
    level: "imminent",
    label: "Devanagari: end myself/everything",
  },
  {
    pattern:
      /(?:फांसी\s+लगा(?:ने|ना|ऊंगा|ऊंगी)|नस\s+काट(?:ने|ना|ऊंगा|ऊंगी)|जहर\s+खा(?:ने|ना|ऊंगा|ऊंगी))/u,
    category: "suicidal_intent",
    level: "imminent",
    label: "Devanagari: hanging/cutting/poison",
  },

  // Romanised Hinglish Imminent
  {
    pattern:
      /\b(?:mar\s*j[a]+n[a]+\s+c[h]*a+h?t[a|i]+\s+h[o]+n|mar\s*j[a]+n[a]+\s+c[h]*a+h?t[a|i]+\s+h[u]+|marne\s+j[a]+\s*ra+h[a|i]+\s+h[o|u]+n?)\b/i,
    category: "suicidal_intent",
    level: "imminent",
    label: "Hinglish: mar jaana chahta hoon / marne ja raha hoon",
  },
  {
    pattern: /\b(?:mar\s*j[a]+u|mar\s*j[a]+n[a]+\s+hai|mar\s+hi\s+j[a]+t[a|i]+\s+h[o|u]+n?)\b/i,
    category: "suicidal_intent",
    level: "imminent",
    label: "Hinglish: mar jau / mar jaana hai",
  },
  {
    pattern: /\b(?:khud\s*ko\s*k[h]*a+t+a+m|khud\s*k[h]?ushi)\b/i,
    category: "suicidal_intent",
    level: "imminent",
    label: "Hinglish: khud ko khatam / khudkhushi",
  },
  {
    pattern:
      /\b(?:apni\s+)?j[a]+n\s+d[e|i]+\s*d[u]+n?g[a|i]|j[a]+n\s+l[e|i]+\s*l[u]+n?g[a|i]\b/i,
    category: "suicidal_intent",
    level: "imminent",
    label: "Hinglish: jaan de dunga / apni jaan le lunga",
  },
  {
    pattern:
      /\b(?:z[e|a]+h[a]*r\s+k[h]*a|f[a]+[a]*s[i|ee]+\s+laga|nas\s+k[a]+t|h[a]+t[h]*\s+ki\s+nas)\b/i,
    category: "suicidal_intent",
    level: "imminent",
    label: "Hinglish: zehar / faasi / nas kaat",
  },
  {
    pattern:
      /\b(?:suicide\s+(?:karne|kar\s*l[u]+n?g[a|i]|kar\s*l[u]+|ka\s*plan))\b/i,
    category: "suicidal_intent",
    level: "imminent",
    label: "Hinglish: suicide karne / kar lunga",
  },
];

/**
 * High Risk Rules
 * Active suicidal ideation, desire to not exist, or non-imminent self-harm.
 */
const HIGH_RULES: DetectionRule[] = [
  // English High
  {
    pattern: /\b(?:i\s+)?(?:want\s+to|wanna)\s+die\b/i,
    category: "suicidal_intent",
    level: "high",
    label: "want to die",
  },
  {
    pattern:
      /\b(?:better\s+off\s+dead|wish\s+i\s+(?:was|were)\s+dead|wish\s+i\s+was\s+never\s+born)\b/i,
    category: "suicidal_intent",
    level: "high",
    label: "better off dead / wish never born",
  },
  {
    pattern:
      /\b(?:cant\s+go\s+on\s+living|no\s+reason\s+to\s+(?:live|stay\s+alive)|nothing\s+to\s+live\s+for|dont\s+want\s+to\s+live)\b/i,
    category: "suicidal_intent",
    level: "high",
    label: "no reason to live / can't go on living",
  },
  {
    pattern:
      /\b(?:suicidal\s+thoughts|suicidal\s+ideation|thinking\s+of\s+suicide)\b/i,
    category: "suicidal_intent",
    level: "high",
    label: "suicidal thoughts",
  },
  {
    pattern:
      /\b(?:self\s*[-]?harm(?:ing)?|cutting\s+myself|harming\s+myself|hurt\s+myself|hurting\s+myself|burn\s+myself)\b/i,
    category: "self_harm",
    level: "high",
    label: "self-harm ideation/cutting",
  },
  {
    pattern: /\b(?:dont\s+want\s+to\s+wake\s+up(?:\s+again)?)\b/i,
    category: "suicidal_intent",
    level: "high",
    label: "don't want to wake up",
  },

  // Devanagari High
  {
    pattern:
      /(?:मरना\s+चाहता\s+हूं|मरना\s+चाहती\s+हूं|मर\s*जाना\s+चाहता|मर\s*जाना\s+चाहती)/u,
    category: "suicidal_intent",
    level: "high",
    label: "Devanagari: marna chahta hoon",
  },
  {
    pattern:
      /(?:जीना\s+न(?:हीं|ही)\s+चाहता|जीना\s+न(?:हीं|ही)\s+चाहती|जीने\s+की\s+इच्छा\s+न(?:हीं|ही)|जीने\s+का\s+मन\s+न(?:हीं|ही))/u,
    category: "suicidal_intent",
    level: "high",
    label: "Devanagari: jeena nahi chahta",
  },
  {
    pattern:
      /(?:खुद\s+को\s+नुकसान|हाथ\s+काटना|चोट\s+पहुंचा(?:ना|या))/u,
    category: "self_harm",
    level: "high",
    label: "Devanagari: self harm / chot",
  },

  // Hinglish High
  {
    pattern:
      /\b(?:j[e|i]+n[a]+\s+n[a|h]*h?i+\s+c[h]*a+h?t[a|i]+|n[a|h]*h?i+\s+j[e|i]+n[a]+|ab\s+aur\s+n[a|h]*h?i+\s+j[e|i]+n[a]+|nahi\s+jeena\s+mujhe)\b/i,
    category: "suicidal_intent",
    level: "high",
    label: "Hinglish: jeena nahi chahta / ab aur nahi jeena",
  },
  {
    pattern:
      /\b(?:marne\s+ka\s+m[a]*n+|marne\s+ki\s+ic+h+[a|i]|mar\s+j[a]+u\s+to\s+ac+h+[a|i])\b/i,
    category: "suicidal_intent",
    level: "high",
    label: "Hinglish: marne ka mann / mar jau to accha",
  },
  {
    pattern: /\b(?:khud\s+ko\s+(?:harm|chot|nuksan|hurt))\b/i,
    category: "self_harm",
    level: "high",
    label: "Hinglish: khud ko harm/chot/nuksan",
  },
];

/**
 * Moderate Risk Rules
 * Deep despair, burden feelings, hopelessness, entrapment without explicit suicide keyword.
 */
const MODERATE_RULES: DetectionRule[] = [
  // English Moderate
  {
    pattern:
      /\b(?:feel(?:ing)?\s+(?:completely\s+)?hopeless|everything\s+is\s+hopeless|no\s+hope\s+left)\b/i,
    category: "hopelessness",
    level: "moderate",
    label: "hopelessness",
  },
  {
    pattern:
      /\b(?:cant\s+take\s+this\s+pain|unbearable\s+pain|pain\s+is\s+too\s+much)\b/i,
    category: "distress",
    level: "moderate",
    label: "unbearable emotional pain",
  },
  {
    pattern:
      /\b(?:everyone\s+(?:would\s+be\s+)?better\s+without\s+me|i\s+am\s+(?:just\s+)?a\s+burden|burden\s+to\s+(?:my\s+)?(?:family|everyone|parents))\b/i,
    category: "hopelessness",
    level: "moderate",
    label: "feeling like a burden",
  },
  {
    pattern:
      /\b(?:trapped\s+and\s+overwhelmed|cant\s+see\s+any\s+way\s+out|no\s+way\s+out(?:\s+of\s+this)?)\b/i,
    category: "distress",
    level: "moderate",
    label: "trapped / no way out",
  },
  {
    pattern:
      /\b(?:nobody\s+would\s+care\s+if\s+i\s+disappeared|wish\s+i\s+could\s+disappear(?:\s+forever)?)\b/i,
    category: "hopelessness",
    level: "moderate",
    label: "wish to disappear / nobody cares",
  },

  // Devanagari Moderate
  {
    pattern:
      /(?:सब\s+कुछ\s+व्यर्थ|कोई\s+उम्मीद\s+न(?:हीं|ही)|बोझ\s+हूं|बोझ\s+बन\s+गया|परिवार\s+पर\s+बोझ|दर्द\s+बर्दाश्त\s+न(?:हीं|ही)|गायब\s+हो\s+जाना)/u,
    category: "hopelessness",
    level: "moderate",
    label: "Devanagari: hopelessness / burden",
  },

  // Hinglish Moderate
  {
    pattern:
      /\b(?:sab\s+par\s+bojh|bojh\s+ban\s+gaya|family\s+par\s+bojh|koi\s+umeed\s+nahi|dard\s+bardasht\s+nahi|gayab\s+ho\s+j[a]+n[a]+|koi\s+r[a]+st[a]+\s+nahi)\b/i,
    category: "hopelessness",
    level: "moderate",
    label: "Hinglish: bojh / umeed nahi / dard bardasht nahi",
  },
];

/**
 * Low Risk Rules
 * Academic stress, hostel isolation, homesickness, exam anxiety.
 */
const LOW_RULES: DetectionRule[] = [
  // English Low
  {
    pattern:
      /\b(?:stressed\s+about\s+(?:.*?\s+)?(?:exams?|grades?|results?|college|studies|viva|placements?)|(?:exam|placement|academic|assignment|semester)\s+stress|academic\s+pressure|assignment\s+stress|viva\s+fear)\b/i,
    category: "academic_stress",
    level: "low",
    label: "academic stress / exam pressure",
  },
  {
    pattern:
      /\b(?:feeling\s+(?:very\s+)?lonely|lonely\s+in\s+hostel|homesick|missing\s+(?:home|family|parents)|isolated\s+in\s+hostel)\b/i,
    category: "isolation",
    level: "low",
    label: "hostel loneliness / homesickness",
  },
  {
    pattern:
      /\b(?:overwhelmed\s+with\s+(?:college|studies|syllabus)|tired\s+of\s+studying)\b/i,
    category: "academic_stress",
    level: "low",
    label: "studies overwhelm",
  },

  // Devanagari Low
  {
    pattern:
      /(?:(?:पढ़ाई|पढाई)\s+का\s+तनाव|परीक्षा\s+का\s+तनाव|परीक्षा\s+का\s+डर|हॉस्टल\s+में\s+अकेलापन|घर\s+की\s+याद|प्लेसमेंट\s+की\s+चिंता)/u,
    category: "academic_stress",
    level: "low",
    label: "Devanagari: academic / hostel stress",
  },

  // Hinglish Low
  {
    pattern:
      /\b(?:exam\s+ka\s+tension|padhai\s+ka\s+tension|hostel\s+m[e|n]+\s+akelapan|ghar\s+ki\s+y[a]+d|placement\s+ki\s+tension|viva\s+ka\s+dar)\b/i,
    category: "academic_stress",
    level: "low",
    label: "Hinglish: exam tension / hostel akelapan",
  },
];

/**
 * Deterministically analyzes student text for mental health crisis and risk signals.
 *
 * Checks in order of severity:
 * 1. Checks for imminent crisis indicators
 * 2. Checks for high risk indicators
 * 3. Checks for moderate risk indicators
 * 4. Checks for low risk / academic stress / idioms (e.g. "this exam is killing me" -> low)
 * 5. Returns 'none' if benign or no patterns match
 */
export function detectRisk(text: string): RiskDetectionResult {
  const normalized = normalizeText(text);

  if (!normalized) {
    return {
      level: "none",
      categories: [],
      matches: [],
      normalizedText: "",
    };
  }

  // 1. Check for Imminent Crisis
  const imminentMatches: string[] = [];
  const imminentCategories = new Set<RiskCategory>();
  for (const rule of IMMINENT_RULES) {
    if (rule.pattern.test(normalized)) {
      imminentMatches.push(rule.label);
      imminentCategories.add(rule.category);
    }
  }
  if (imminentMatches.length > 0) {
    return {
      level: "imminent",
      categories: Array.from(imminentCategories),
      matches: imminentMatches,
      normalizedText: normalized,
    };
  }

  // 2. Check for High Risk
  const highMatches: string[] = [];
  const highCategories = new Set<RiskCategory>();
  for (const rule of HIGH_RULES) {
    if (rule.pattern.test(normalized)) {
      highMatches.push(rule.label);
      highCategories.add(rule.category);
    }
  }
  if (highMatches.length > 0) {
    return {
      level: "high",
      categories: Array.from(highCategories),
      matches: highMatches,
      normalizedText: normalized,
    };
  }

  // 3. Check for Moderate Risk
  const modMatches: string[] = [];
  const modCategories = new Set<RiskCategory>();
  for (const rule of MODERATE_RULES) {
    if (rule.pattern.test(normalized)) {
      modMatches.push(rule.label);
      modCategories.add(rule.category);
    }
  }
  if (modMatches.length > 0) {
    return {
      level: "moderate",
      categories: Array.from(modCategories),
      matches: modMatches,
      normalizedText: normalized,
    };
  }

  // 4. Check for low risk idioms (e.g. "this exam is killing me")
  const lowMatches: string[] = [];
  const lowCategories = new Set<RiskCategory>();
  for (const rule of LOW_RISK_IDIOM_RULES) {
    if (rule.pattern.test(normalized)) {
      lowMatches.push(rule.label);
      lowCategories.add(rule.category);
    }
  }

  // Check for general low risk patterns (academic stress, loneliness)
  for (const rule of LOW_RULES) {
    if (rule.pattern.test(normalized)) {
      lowMatches.push(rule.label);
      lowCategories.add(rule.category);
    }
  }
  if (lowMatches.length > 0) {
    return {
      level: "low",
      categories: Array.from(lowCategories),
      matches: lowMatches,
      normalizedText: normalized,
    };
  }

  // 5. Check if text is a purely benign idiom (e.g. "killing it", "dying of laughter")
  for (const pattern of HARMLESS_BENIGN_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        level: "none",
        categories: [],
        matches: [],
        normalizedText: normalized,
      };
    }
  }

  return {
    level: "none",
    categories: [],
    matches: [],
    normalizedText: normalized,
  };
}

export default detectRisk;
