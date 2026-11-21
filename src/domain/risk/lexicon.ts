/**
 * MindSahaay Deterministic Crisis & Risk Detector (lexicon v2)
 * Pure domain logic for multilingual crisis and risk detection.
 *
 * Covers English, Hindi (Devanagari) and romanised Hinglish.
 *
 * Pipeline (all deterministic, no network):
 * 1. Split into sentences and clauses (commas, "but", "lekin" ... end a clause, so negation
 *    and fiction scope cannot leak across them).
 * 2. Mask quoted spans when the sentence talks about a song, poem, novel or show.
 * 3. Per clause build three matching views (English, romanised Hinglish with spelling and gender
 *    folding, Devanagari with nukta/anusvara folding) and strip harmless idioms and "no plan" phrases.
 * 4. Apply rules. A rule hit is dropped when it is negated ("I would never hurt myself",
 *    "marna nahi chahta") or when the clause is about fiction or lyrics and the speaker is not
 *    "I". Rules that already contain their own negation ("don't want to live") are never negated.
 * 5. Graded levels: partial signals give moderate, explicit ideation gives high, ideation or a plan
 *    together with time, intent, decision, farewell or means gives imminent.
 * 6. "When unsure, escalate one level" for explicit first-person statements (rules flagged `unsure`).
 *
 * A keyword lexicon cannot understand paraphrase. It is a fast safety net that runs before and
 * alongside an LLM layer, never a replacement for it, and never a diagnosis.
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
  /** True when the level was raised by the "when unsure, escalate one level" policy. */
  escalated?: boolean;
  /** Labels of hits that were ignored (negation, fiction, lyrics) with the reason, for audit. */
  suppressed?: string[];
}

const LEVELS: RiskLevel[] = ["none", "low", "moderate", "high", "imminent"];
const rank = (l: RiskLevel): number => LEVELS.indexOf(l);
const bump = (l: RiskLevel): RiskLevel => LEVELS[Math.min(LEVELS.length - 1, rank(l) + 1)];

/**
 * Normalizes text for risk detection:
 * Unicode NFC, lowercase, zero-width stripping, Devanagari nukta removal and chandrabindu to anusvara,
 * apostrophe stripping ("can't" -> "cant"), collapse of 3+ repeated characters, punctuation to spaces
 * (keeping letters, combining marks and digits) and whitespace normalisation.
 */
export function normalizeText(rawText: string): string {
  if (!rawText) return "";
  let text = rawText.normalize("NFC").toLowerCase();
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, "");
  text = text.replace(/\u093C/g, "");
  text = text.replace(/\u0901/g, "\u0902");
  text = text.replace(/['’]/g, "");
  text = text.replace(/(.)\1{2,}/gu, "$1");
  text = text.replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ");
  return text.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const RM_WORDS: Record<string, string> = {
  nhi: "nahi", nahin: "nahi", nhin: "nahi", nehi: "nahi", nahe: "nahi", nai: "nahi",
  hu: "hun", hoon: "hun", hon: "hun", ho: "ho",
  chahti: "chahta", chahte: "chahta", chata: "chahta", chti: "chahta", chahata: "chahta", chahati: "chahta", chahtha: "chahta", chahthi: "chahta",
  rha: "raha", rhi: "raha", rahi: "raha", rahe: "raha",
  gya: "gaya", gyi: "gaya", gayi: "gaya", gaye: "gaya",
  mrna: "marna", mrne: "marne", mrjana: "marjana",
  khtm: "khatam", khatm: "khatam", khtam: "khatam", khatham: "khatam",
  alwida: "alvida", alvidaa: "alvida", gudbye: "goodbye", gdbye: "goodbye",
  zahar: "zehar", jehar: "zehar", jahar: "zehar", zeher: "zehar", zahr: "zehar",
  phansi: "fansi", fasi: "fansi", phasi: "fansi",
  jinda: "zinda", zindaa: "zinda", jida: "zinda", zida: "zinda",
  kash: "kaash", kaash: "kaash",
  bt: "but", pr: "par",
  dungi: "dunga", lungi: "lunga", karungi: "karunga", jaungi: "jaunga", rahungi: "rahunga", dega: "dega",
  sochti: "sochta", sochte: "sochta", karti: "karta", karte: "karta",
  wali: "wala", wale: "wala",
  nuksaan: "nuksan", nuksaan_: "nuksan", bojh: "bojh", bhoj: "bojh", boj: "bojh",
  hopless: "hopeless", hopelss: "hopeless",
};

/** English view: expand slang contractions and fold common typos of "suicide". */
function toEnglishView(n: string): string {
  return n
    .replace(/\bwan+a\b/g, "want to")
    .replace(/\bgon+a\b/g, "going to")
    .replace(/\bgotta\b/g, "got to")
    .replace(/\bsu[ie]?[cs]i?d(e|al)\b/g, (_m, s: string) => (s === "al" ? "suicidal" : "suicide"))
    .replace(/\bun\s?aliv(?:e|ed|es|ing)\b/g, "unalive")
    .replace(/\bkms\b/g, "kill myself")
    .replace(/\bkil+\s+(my|him|her|them)(self|selves)\b/g, "kill $1$2");
}

/** Romanised Hinglish view: vowel-run folding, spelling variants and gender forms mapped to one canonical token. */
function toRomanView(n: string): string {
  let t = toEnglishView(n)
    .replace(/khud\s*k(?:h)?u?(?:s|sh)(?:h)?i\b/g, "khudkushi")
    .replace(/\bmar\s*jana\b/g, "mar jana");
  t = t
    .split(" ")
    .map((w) => {
      if (!/^[a-z]+$/.test(w)) return w;
      let x = w.replace(/aa+/g, "a").replace(/ee+/g, "i").replace(/oo+/g, "u").replace(/ii+/g, "i").replace(/uu+/g, "u");
      x = RM_WORDS[x] ?? x;
      if (/^[a-z]+(?:ungi|unga)$/.test(x) && x.endsWith("ungi")) x = x.slice(0, -1) + "a";
      return x;
    })
    .join(" ");
  return t.replace(/\bmar jana\b/g, "mar jana");
}

/** Devanagari view: nasal conjuncts to anusvara so जिन्दा and ज़िंदा compare equal. */
function toDevanagariView(n: string): string {
  return n
    .replace(/न्(?=[दधतथ])/g, "ं")
    .replace(/म्(?=[बप])/g, "ं")
    .replace(/ण्(?=[डट])/g, "ं")
    .replace(/ङ्(?=[कग])/g, "ं");
}

/** Normalise a Devanagari rule source the same way inputs are normalised. */
const dvSrc = (s: string): string => toDevanagariView(s.normalize("NFC").replace(/\u093C/g, "").replace(/\u0901/g, "\u0902"));

type View = "en" | "rm" | "dv";
const DV_B = String.raw`(?<![\p{L}\p{M}])`;
const DV_E = String.raw`(?![\p{L}\p{M}])`;
const wrap = (view: View, src: string): RegExp =>
  view === "dv" ? new RegExp(`${DV_B}(?:${dvSrc(src)})${DV_E}`, "iu") : new RegExp(String.raw`\b(?:${src})\b`, "iu");

// ---------------------------------------------------------------------------
// Rule model
// ---------------------------------------------------------------------------

interface Rule {
  view: View;
  re: RegExp;
  level: RiskLevel;
  category: RiskCategory;
  label: string;
  /** Hit is dropped if negated in the same clause (e.g. "never hurt myself"). */
  negatable: boolean;
  /** Expresses desire or intent to act. Combined with time, plan, decision, intent -> imminent. */
  active: boolean;
  /** Ambiguous but concerning. Escalated one level when the speaker is "I". */
  unsure: boolean;
  /** Farewell rules are ignored in graduation, holiday and similar contexts. */
  farewell: boolean;
}

interface RuleOpts { negatable?: boolean; active?: boolean; unsure?: boolean; farewell?: boolean }
const mk = (view: View, level: RiskLevel, category: RiskCategory, label: string, src: string, o: RuleOpts = {}): Rule => ({
  view, re: wrap(view, src), level, category, label,
  negatable: o.negatable ?? true, active: o.active ?? false, unsure: o.unsure ?? false, farewell: o.farewell ?? false,
});

type Signal = "time" | "plan" | "decision" | "doit" | "future" | "waiting" | "goodbye_say" | "giveaway" | "dontlook" | "absence" | "finality" | "empty_place" | "opportunity";
interface SignalRule { view: View; re: RegExp; signal: Signal }
const sg = (view: View, signal: Signal, src: string): SignalRule => ({ view, re: wrap(view, src), signal });

const SELF = String.raw`(?:my|him|her|them)sel(?:f|ves)`;

// --- Strips: harmless idioms and phrases that must not carry signals ------------------
const STRIPS: { view: View; re: RegExp }[] = [
  { view: "en", re: /\b(?:die|dying|died|dead)\s+(?:of|from|laughing|with)\s+(?:embarrassment|laughter|laughing|shame|boredom|hunger|thirst|curiosity|cringe|awkwardness|heat|fatigue|excitement|jealousy|joy|happiness)\b/giu },
  { view: "en", re: /\bdying\s+(?:to|for)\s+(?:see|know|meet|watch|go|try|eat|hear|get|visit|play|have|a|some|the|your|more|chai|coffee)\b/giu },
  { view: "en", re: /\b(?:killing|kill|killed|crushing|crushed|smashing|nailing)\s+it\b/giu },
  { view: "en", re: /\b(?:no|without|dont\s+have\s+(?:a|any)|do\s+not\s+have\s+(?:a|any)|havent\s+(?:got\s+)?(?:a|any)|not\s+have\s+(?:a|any))\s+(?:real\s+|actual\s+|specific\s+|concrete\s+|clear\s+)?(?:plan|plans|method|means)\b(?:\s+(?:yet|right\s+now|at\s+the\s+moment))?/giu },
  { view: "en", re: /\b(?:right\s+now|currently|at\s+the\s+moment|for\s+now)\s+(?:i\s+)?(?:have|got)\s+no\s+plans?\b/giu },
  { view: "en", re: /\b(?:study|revision|exam|travel|trip|party|birthday|business|project|placement|career|dinner|movie|weekend|holiday|vacation|lunch|outing|backup)\s+plans?\b/giu },
  { view: "en", re: /\bsuicide\s+(?:prevention|awareness|helpline|hotline|rates?|statistics|research|policy|survivors?|squad|watch)\b/giu },
  { view: "en", re: /\b(?:accidentally|accidentaly|by\s+accident)\s+(?:cut|hurt|burned|burnt|harmed)\s+\w+self\b/giu },
  { view: "en", re: /\b(?:cut|hurt|burned|burnt)\s+(?:my)self\s+(?:while|when|cooking|shaving|chopping|playing|in\s+the\s+(?:kitchen|gym|lab)|on\s+(?:a|the))\b/giu },
  { view: "en", re: /\bhopeless\s+romantic\b/giu },
  { view: "rm", re: /\b(?:thakan|thakawat|hasi|hansi|sharm|bhookh|bhuk|garmi|neend|boredom|bore|dar)\s+(?:se|ke\s+mare)\s+mar(?:a|i|\s+gaya|\s+gayi|\s+raha|\s+rahi|ne\s+ja)\b/giu },
  { view: "rm", re: /\b(?:abhi\s+)?koi\s+(?:plan|yojana)\s+nahi\b/giu },
  { view: "rm", re: /\b(?:plan|yojana)\s+nahi\s+(?:hai|he|h)\b/giu },
  { view: "rm", re: /\b(?:exam|paper|padhai|viva|interview|placement|test|result)\s+(?:ki|ka)\s+(?:tayari|taiyari)\b/giu },
  { view: "rm", re: /\bsuicide\s+(?:prevention|awareness|helpline|hotline)\b/giu },
  { view: "dv", re: new RegExp(dvSrc(String.raw`(?:अभी\s+)?कोई\s+(?:योजना|प्लान)\s+न(?:हीं|ही)(?:\s+है)?`), "giu") },
  { view: "dv", re: new RegExp(dvSrc(String.raw`(?:योजना|प्लान)\s+न(?:हीं|ही)\s+है`), "giu") },
  { view: "dv", re: new RegExp(dvSrc(String.raw`(?:परीक्षा|एग्जाम|पेपर|पढ़ाई|वाइवा|इंटरव्यू|प्लेसमेंट|टेस्ट)\s+(?:की|का)\s+तैयारी`), "giu") },
  { view: "dv", re: new RegExp(dvSrc(String.raw`(?:थकान|हंसी|हँसी|शर्म|भूख|गर्मी|नींद|बोरियत)\s+(?:से|के\s+मारे)\s+मर(?:ा|ी|\s+गया|\s+गई|\s+रहा|\s+रही)`), "giu") },
];

// --- Context lexicons ------------------------------------------------------------------
const FICTION_EN = /\b(?:song|songs|lyrics?|chorus|verse|track|album|band|playlist|poem|poetry|quote|quotes|caption|movie|film|novel|story|stories|book|character|narrator|protagonist|villain|series|episode|anime|drama|dialogue|chapter|plot|screenplay|script|rap|ghazal|shayari|fiction|show|sitcom|netflix)\b/iu;
const FICTION_RM = /\b(?:gaana|gane|gaane|gana|geet|film|kahani|upanyas|novel|kirdar|character|shayari|series|episode|villain|hero|dialogue|lyrics|playlist|nazm|ghazal|kitab|book|movie|web\s*series)\b/iu;
const FICTION_DV = new RegExp(DV_B + dvSrc(String.raw`(?:गाना|गाने|गीत|उपन्यास|किरदार|कहानी|फिल्म|शायरी|ग़ज़ल|गजल|सीरीज|सीरीज़|एपिसोड|नॉवेल|कविता|संवाद|डायलॉग|किताब|खलनायक|विलेन|हीरो|अध्याय|नाटक|धारावाहिक)`) + DV_E, "iu");
const THIRD_EN = /\b(?:he|she|they|his|her|their|friend|roommate|roomie|brother|sister|cousin|classmate|batchmate|girlfriend|boyfriend|someone|somebody|student)\b/iu;
const THIRD_RM = /\b(?:wo|woh|usne|usko|uska|uski|dost|doston|friend|bhai|behen|didi|roommate|classmate|sahpathi|koi)\b/iu;
const THIRD_DV = new RegExp(dvSrc(String.raw`(?:वह|वो|उसने|उसको|उसका|उसकी|दोस्त|भाई|बहन|रूममेट|सहपाठी|कोई)`), "iu");
const FP_EN = /\b(?:i|im|ive|id|ill|me|myself|mine)\b/iu;
const FP_RM = /\b(?:main|mai|mujhe|mujhko|maine|mene|myself|i|im)\b/iu;
const FP_DV = new RegExp(dvSrc(String.raw`(?:मैं|मै|मैंने|मुझे|मुझको)`), "iu");
const FP_SENT_EN = /\b(?:i|im|ive|id|ill|me|my|myself|mine)\b/iu;
const FP_SENT_RM = /\b(?:main|mai|mujhe|mujhko|maine|mene|mera|meri|mere|me|my|i|im)\b/iu;
const FP_SENT_DV = new RegExp(dvSrc(String.raw`(?:मैं|मै|मैंने|मुझे|मुझको|मेरा|मेरी|मेरे)`), "iu");
const BENIGN_GOODBYE = /\b(?:graduat\w*|vacation|holidays?|summer|break|farewell\s+party|internship|going\s+home|leaving\s+college|last\s+day\s+of|semester\s+end|batch|chhutti|ghar\s+ja)\b/iu;

/** Negators allowed to stand just before a hit, with only filler words in between. */
const NEG_BEFORE_EN = /(?:\bnever|\bnot|\bdont|\bdo\s+not|\bdidnt|\bwont|\bwouldnt|\bcant|\bcannot|\bshouldnt|\bno\s+intention\s+of|\bnot\s+going\s+to|\bnot\s+gonna|\bnobody|\bno\s+way)\s+(?:(?:ever|really|actually|even|would|will|want|wanna|wish|going|to|planning|plan|thinking|of|about|intend|try|trying|need|i|ill|id|ive|a|the|so|gonna)\s+){0,4}$/iu;
const NEG_AFTER_RM = /^\s*(?:(?:kabhi|bilkul|ab|bhi|hi|chahta|karta|hun|hai|karunga|mai|main|se|ko|ka|ki|ke|to|toh)\s+){0,3}(?:nahi|mat|never)\b/iu;
const NEG_BEFORE_RM = /\b(?:kabhi\s+nahi|bilkul\s+nahi|never|not|dont)\s+(?:(?:ever|really|want|to)\s+){0,2}$/iu;
const NEG_AFTER_DV = new RegExp(dvSrc(String.raw`^\s*(?:(?:कभी|बिल्कुल|अब|भी|ही|चाहता|चाहती|चाहते|करता|करती|हूं|है|करूंगा|करूंगी|मैं|तो)\s+){0,3}(?:नहीं|नही|मत)(?![\p{L}\p{M}])`), "iu");

// --- Level rules -----------------------------------------------------------------------
const RULES: Rule[] = [
  // ===== English: imminent (means, explicit self-killing, notes) =====
  mk("en", "imminent", "suicidal_intent", "kill myself", String.raw`kill(?:s|ed|ing)?\s+${SELF}`, { active: true }),
  mk("en", "imminent", "suicidal_intent", "suicide plan/attempt/note", String.raw`(?:suicide\s+(?:plan|note|attempt|letter|pact)|commit(?:ting|ted)?\s+suicide|attempt(?:ed|ing)?\s+suicide)`, { active: true }),
  mk("en", "imminent", "suicidal_intent", "end/take my life", String.raw`(?:end(?:ing)?|take|taking|took)\s+(?:my\s+own|my|his|her|their)\s+life|end(?:ing)?\s+${SELF}|off\s+myself`, { active: true }),
  mk("en", "imminent", "suicidal_intent", "hang/shoot/drown myself", String.raw`(?:hang|hanging|shoot|shooting|drown|drowning|poison|poisoning|stab|stabbing)\s+${SELF}`, { active: true }),
  mk("en", "imminent", "suicidal_intent", "overdose/pills", String.raw`(?:swallow(?:ing)?\s+(?:a\s+lot\s+of\s+|all\s+(?:my\s+|the\s+)?|my\s+)?pills(?:\s+and\s+die)?|overdos(?:e|ing)\s+(?:on\s+\w+|myself)|take\s+all\s+(?:my\s+|the\s+)?pills|drink(?:ing)?\s+(?:bleach|poison|acid|phenyl))`, { active: true }),
  mk("en", "imminent", "self_harm", "cut wrists/throat", String.raw`(?:slit(?:ting)?|cut(?:ting)?)\s+(?:my\s+)?(?:wrists?|throat|veins)`, { active: true }),
  mk("en", "imminent", "suicidal_intent", "lethal jump", String.raw`(?:jump(?:ing)?\s+(?:off|from|out\s+of)\s+(?:a\s+|the\s+|my\s+)?(?:roof|rooftop|bridge|balcony|terrace|building|window|cliff|ledge|hostel)|jump\s+in\s+front\s+of\s+(?:a\s+|the\s+)?(?:train|metro|bus|truck)|throw(?:ing)?\s+myself\s+(?:off|in\s+front|under))`, { active: true }),
  mk("en", "imminent", "suicidal_intent", "goodbye note/last goodbye", String.raw`(?:(?:goodbye|good\s+bye|farewell|final|last)\s+(?:note|letter|message\s+to\s+(?:my\s+)?(?:family|parents)))|(?:final|last)\s+(?:goodbye|good\s+bye|farewell)|this\s+is\s+my\s+(?:goodbye|good\s+bye)|goodbye\s+(?:world|everyone|cruel\s+world)`, { negatable: false, farewell: true }),
  mk("en", "imminent", "suicidal_intent", "letter/note for family", String.raw`(?:wrote|written|writing|left|leaving|made)\s+(?:a\s+|my\s+|the\s+)?(?:letter|note|message)\s+(?:for|to)\s+(?:my\s+)?(?:mom|mum|dad|parents|family|friends|everyone)`, { negatable: false, farewell: true }),
  mk("en", "imminent", "suicidal_intent", "dont look for me", String.raw`(?:dont|do\s+not)\s+(?:look|search|come\s+looking)\s+for\s+me\s+(?:tomorrow|anymore|after|again|tonight|when)|(?:dont|do\s+not)\s+try\s+to\s+find\s+me`, { negatable: false }),

  // ===== English: high (active ideation) =====
  mk("en", "high", "suicidal_intent", "want to die", String.raw`(?:want(?:s|ed)?|wish(?:es|ed)?|need(?:s)?|ready|decided|plan(?:s|ning)?|tempted|feel(?:s|ing)?\s+like|think(?:s|ing)?\s+(?:of|about)|thoughts?\s+(?:of|about)|ideas?\s+(?:of|about)|keep\s+thinking\s+(?:of|about))\s+(?:to\s+|of\s+|about\s+)?(?:be(?:ing)?\s+)?(?:just\s+)?(?:die|dying|dead)(?!\s+(?:of|laughing|from\s+laughing))`, { active: true }),
  mk("en", "high", "suicidal_intent", "end it all / end things", String.raw`(?:end(?:ing)?\s+it\s+all|end(?:ing)?\s+things(?!\s+with)|want(?:s)?\s+to\s+end\s+it|make\s+it\s+(?:all\s+)?stop\s+forever|permanent\s+solution)`, { active: true }),
  mk("en", "high", "suicidal_intent", "unalive / log out of life", String.raw`(?:unalive|log(?:ging)?\s+out\s+of\s+(?:life|this\s+life|existence|the\s+world)|check(?:ing)?\s+out\s+(?:of\s+life|early|permanently)|sleep(?:ing)?\s+forever|(?:go|going)\s+to\s+sleep\s+and\s+never\s+wake|leave\s+(?:this|the)\s+(?:world|life)|not\s+be\s+(?:here|alive|in\s+this\s+world)\s+(?:anymore|any\s+more|tomorrow))`, { active: true }),
  mk("en", "high", "suicidal_intent", "wish dead / never born", String.raw`(?:better\s+off\s+dead|wish\s+(?:that\s+)?i\s+(?:was|were|am|could\s+be|had\s+been)\s+(?:just\s+)?(?:dead|gone|not\s+alive|never\s+born)|wish\s+(?:that\s+)?i\s+(?:was|were|had)\s+(?:never|not)\s+(?:been\s+)?born|wish\s+i\s+(?:didnt|did\s+not|wasnt|was\s+not|werent|never)\s+(?:exist|existed|born|alive|here|wake\s+up|woke\s+up)|(?:wish|hope)\s+(?:i|that\s+i)\s+(?:would|could)\s+(?:just\s+)?(?:never|not)\s+wake\s+up|better\s+off\s+if\s+i\s+(?:was|were)\s+(?:dead|gone|not\s+here|never\s+born))`),
  mk("en", "high", "suicidal_intent", "dont want to live/exist", String.raw`(?:(?:dont|do\s+not|no\s+longer|never)\s+want\s+to\s+(?:live|be\s+alive|exist|wake\s+up|go\s+on\s+living|keep\s+living|be\s+around\s+anymore)|want\s+to\s+not\s+exist|no\s+(?:reason|point|purpose|will)\s+(?:to|in|for)\s+(?:live|living|go\s+on|going\s+on|stay\s+alive|being\s+alive|exist|existing|life|my\s+life)|nothing\s+to\s+live\s+for|(?:cant|cannot)\s+(?:go\s+on\s+living|keep\s+living|live\s+like\s+this)|whats\s+the\s+point\s+of\s+(?:living|life|being\s+alive)|(?:dont|do\s+not)\s+want\s+to\s+be\s+here\s+(?:anymore|any\s+more))`, { negatable: false }),
  mk("en", "high", "suicidal_intent", "suicidal thoughts", String.raw`(?:suicidal|suicide)\s+(?:thoughts?|ideation|feelings?|urges?|ideas?|tendenc(?:y|ies))|thinking\s+(?:of|about)\s+suicide|(?:i\s+am|im|feel(?:ing)?|been)\s+suicidal|thoughts?\s+(?:of|about)\s+(?:suicide|killing\s+myself|ending\s+(?:it|my\s+life))`, { active: true }),
  mk("en", "high", "self_harm", "self-harm", String.raw`(?:self[\s-]?harm(?:ing|ed)?|self[\s-]?injur\w+|cut(?:ting|s)?\s+(?:${SELF}|my\s+(?:arms?|wrists?|thighs?|legs?|skin))|(?:hurt|hurting|hurts|harm|harming|harmed|burn|burning|burned|burnt|hit|hitting|punish|punishing|scratch|scratching|bruise|bruising)\s+${SELF}|cut\s+${SELF})`),
  // ===== English: moderate / partial =====
  mk("en", "moderate", "suicidal_intent", "mentions suicide", String.raw`(?:suicide|suicidal)`, { unsure: true }),
  mk("en", "moderate", "hopelessness", "hopelessness", String.raw`(?:feel(?:ing)?\s+(?:completely\s+|so\s+|totally\s+)?hop(?:e)?le?ss?|everything\s+is\s+hop(?:e)?le?ss?|hop(?:e)?le?ss?|no\s+hope(?:\s+left)?|lost\s+all\s+hope|nothing\s+(?:will|wil|is\s+going\s+to)\s+(?:ever\s+)?(?:get\s+better|change|improve|work\s+out)|(?:never|wont\s+ever)\s+get\s+better|no\s+point\s+in\s+(?:anything|trying|going\s+on|continuing)|whats\s+the\s+point\s+(?:of|in)\s+(?:anything|it\s+all|going\s+on)|life\s+(?:is|feels|seems)\s+(?:pointless|meaningless|worthless|empty))`, { negatable: false }),
  mk("en", "moderate", "distress", "unbearable pain / cant go on", String.raw`(?:(?:cant|cannot|can\s+not)\s+(?:take|bear|handle|stand|endure)\s+(?:this|it|the)\s+(?:pain|anymore|any\s+more|much\s+longer)|unbearable\s+pain|pain\s+is\s+too\s+much|cant\s+(?:do\s+this|go\s+on|keep\s+going|continue)\s+(?:anymore|any\s+more)|(?:tired|sick|fed\s+up|done)\s+(?:of|with)\s+(?:living|life|being\s+alive|everything|this\s+world|fighting|pretending)|(?:give|giving|gave)\s+up\s+on\s+(?:life|everything|living))`, { negatable: false }),
  mk("en", "moderate", "hopelessness", "burden / better without me", String.raw`(?:everyone\s+(?:would\s+be\s+)?better\s+(?:off\s+)?without\s+me|(?:am|feel(?:ing)?\s+like|being|feels\s+like)\s+(?:just\s+)?(?:a\s+|such\s+a\s+)?burden|burden\s+(?:to|on|for)\s+(?:my\s+|the\s+)?\w+|(?:world|everyone|everybody|they|people|life|everything|college|family|parents)\s+(?:would|will|can|could)\s+(?:go|carry|keep|move)\s+on\s+(?:just\s+)?(?:fine|okay|ok|well)?\s*without\s+me|(?:nobody|no\s+one)\s+(?:would|will)\s+(?:even\s+)?(?:notice|miss|care|cry|mind)|nobody\s+needs\s+me|(?:i|im)\s+(?:dont|do\s+not)\s+matter)`, { negatable: false }),
  mk("en", "moderate", "distress", "trapped / no way out", String.raw`(?:trapped(?:\s+and\s+overwhelmed)?|(?:cant|cannot)\s+see\s+(?:any|a)\s+(?:way\s+out|future|light|hope|exit)|no\s+(?:way|exit|escape)\s+(?:out|from\s+this)(?:\s+of\s+this)?)`, { negatable: false }),
  mk("en", "moderate", "hopelessness", "wish to disappear", String.raw`(?:(?:wish|want|wanna)\s+(?:i|to)\s+(?:could\s+)?(?:just\s+)?(?:disappear|vanish|fade\s+away|go\s+away|be\s+invisible)|nobody\s+would\s+care\s+if\s+i\s+(?:disappeared|vanished|was\s+gone)|if\s+i\s+(?:disappeared|vanished))`, { negatable: false }),
  mk("en", "moderate", "distress", "numbness / empty", String.raw`(?:(?:feel|feeling|am|im|been)\s+(?:so\s+|very\s+|completely\s+|totally\s+|just\s+)?(?:empty|numb|hollow|dead\s+inside|lifeless)|like\s+(?:i|im|i\s+am)\s+(?:already\s+)?(?:gone|dead|a\s+ghost)|(?:feel|feeling|am|im)\s+(?:so\s+)?(?:worthless|useless)|(?:am|im)\s+a\s+failure)`, { negatable: false }),
  mk("en", "moderate", "suicidal_intent", "not be around", String.raw`(?:wont|will\s+not)\s+be\s+(?:around|here|there|alive)(?:\s+(?:anymore|tomorrow|after))?|(?:wont|will\s+not)\s+(?:exist|be\s+a\s+problem)\s+(?:anymore|for\s+long)`, { negatable: false }),
  mk("en", "moderate", "suicidal_intent", "farewell: said goodbye", String.raw`(?:told|said|saying|say|bid)\s+(?:my\s+|all\s+my\s+)?(?:friends|everyone|family|parents|them|all)\s+(?:goodbye|good\s+bye|farewell)|(?:say(?:ing)?|said)\s+(?:goodbye|good\s+bye|farewell)\s+to\s+(?:everyone|all|my\s+(?:friends|family|parents))`, { negatable: false, farewell: true }),
  mk("en", "moderate", "suicidal_intent", "farewell: gave away possessions", String.raw`(?:gave|given|giving|give)\s+away\s+(?:all\s+)?(?:my\s+)?(?:books?|things|stuff|belongings|clothes|laptop|phone|possessions|notes|games|items|savings|money|guitar|pets?)`, { negatable: false, farewell: true }),
  mk("en", "moderate", "hopelessness", "wont bother anyone anymore", String.raw`(?:wont|will\s+not|never)\s+(?:bother|trouble|disturb|burden)\s+(?:anyone|anybody|you|everyone)(?:\s+(?:anymore|again|ever\s+again))?|you\s+(?:wont|will\s+not)\s+have\s+to\s+(?:deal|worry|put\s+up)\s+with\s+me|last\s+time\s+(?:you|youll)\s+(?:hear|see)`, { negatable: false }),

  // ===== English: low =====
  mk("en", "low", "academic_stress", "academic stress", String.raw`(?:(?:stressed|stress|anxious|worried|nervous|panicking|tense|overwhelmed|pressure|scared|afraid)\s+(?:about|over|with|of|for)\s+(?:my\s+|the\s+|our\s+)?(?:semester\s+)?(?:exams?|finals?|midterms?|papers?|tests?|grades?|results?|cgpa|gpa|backlogs?|college|studies|study|viva|placements?|assignments?|deadlines?|syllabus|semester|interview|marks|attendance|projects?)|(?:exam|placement|academic|assignment|semester|study|deadline|backlog|result)s?\s+(?:stress|pressure|anxiety|tension|fear)|academic\s+pressure|viva\s+fear|(?:syllabus|workload|backlog)\s+is\s+(?:huge|too\s+much|piling|heavy|endless)|tired\s+of\s+studying)`, { negatable: false }),
  mk("en", "low", "isolation", "loneliness / homesick / low mood", String.raw`(?:(?:feel|feeling|am|im)\s+(?:so\s+|very\s+|really\s+|a\s+bit\s+)?(?:lonely|isolated|alone|left\s+out|homesick|sad|down|low|blue|upset|anxious|stressed|overwhelmed|behind|drained|burnt\s+out|burned\s+out)|lonely\s+in\s+hostel|homesick|(?:missing|miss)\s+(?:home|family|mom|dad|parents|my\s+(?:mom|dad|family|friends))|isolated\s+in\s+hostel|overwhelmed\s+with\s+(?:college|studies|syllabus)|(?:cried|crying|cry)\s+(?:a\s+bit|a\s+lot|today|again|last\s+night)|(?:everyone|everybody|all)\s+(?:in\s+my\s+\w+\s+)?(?:seems?|looks?|is|are)\s+(?:so\s+)?(?:ahead|better|smarter)|behind\s+(?:everyone|my\s+(?:batch|peers|friends|classmates)|the\s+others)|disappoint(?:ing)?\s+(?:my\s+)?(?:parents|family|everyone|them|mom|dad))`, { negatable: false }),

  // ===== Hinglish (romanised, folded view) =====
  mk("rm", "imminent", "suicidal_intent", "Hinglish: mar jana chahta / marne ja raha", String.raw`(?:mar\s*jana\s+chahta\s+hun|mar\s*jana\s+chahta|marne\s+ja\s+raha\s+hun|marne\s+ja\s+raha|marne\s+jaa?\s+raha|mar\s*jana\s+hai)`, { active: true }),
  mk("rm", "imminent", "suicidal_intent", "Hinglish: mar jaun", String.raw`(?:mar\s*ja(?:u|un|oon)\s*(?:ga)?|mar\s+hi\s+jata\s+h(?:u|un)?)`, { active: true }),
  mk("rm", "imminent", "suicidal_intent", "Hinglish: khud ko khatam", String.raw`khud\s*ko\s+(?:\w+\s+){0,2}?khatam|khudkushi\s+(?:kar|karne|karna|karunga|ka\s+plan|ki\s+(?:koshish|tayari))`, { active: true }),
  mk("rm", "imminent", "suicidal_intent", "Hinglish: jaan de dunga / le lunga", String.raw`(?:apni\s+)?jan\s+(?:de\s+d|le\s+l)(?:u|un)?n?g[ae]`, { active: true }),
  mk("rm", "imminent", "suicidal_intent", "Hinglish: zehar / fansi / nas kaat", String.raw`(?:zehar\s+(?:kha|pi|le)\w*|fansi\s+(?:laga|le|par|pe)\w*|nas\s+kat\w*|hath\s+ki\s+nas|kalai\s+kat\w*|(?:chhat|chat|terrace|balcony|building|bridge|pul)\s+(?:se|pe|par)\s+kud\w*|neend\s+ki\s+goli\w*\s+kha\w*)`, { active: true }),
  mk("rm", "imminent", "suicidal_intent", "Hinglish: suicide karne", String.raw`suicide\s+(?:karne|kar\s*l(?:u|un)n?g?[ae]?|kar\s*l[ue]|kar\s*d[ue]nga|ka\s+plan|ki\s+(?:tayari|koshish)|attempt)`, { active: true }),
  mk("rm", "imminent", "suicidal_intent", "Hinglish: alvida letter / last goodbye", String.raw`(?:alvida|goodbye)\s+(?:ka|ki)\s+(?:letter|khat|note|message|chitthi|chiththi)|(?:aakhri|akhiri|akhri|aakhiri|akhir|last|final)\s+(?:alvida|goodbye|salaam|salam)|suicide\s+note|(?:mujhe|mujhko)\s+(?:dhundhna|dhundna|dhoondhna|dundhna)\s+mat`, { negatable: false, farewell: true }),
  mk("rm", "high", "suicidal_intent", "Hinglish: marna chahta / marne ka mann", String.raw`(?:mar(?:na|ne)\s+chahta(?:\s+hun)?|mar(?:na|ne)\s+(?:ka|ki|ke)\s+(?:mann?|khayal|khyal|vichar|iccha|ichha|dil)|mar(?:na|ne)\s+(?:ke\s+)?ba+re\s+(?:me|mein)\s+(?:soch|socha)\w*|mar\s*jau\s+to\s+(?:acha|achha|behtar|theek|sahi)|kaash\s+(?:main\s+)?mar\s+(?:jata|jaun|gaya|jaata))`, { active: true }),
  mk("rm", "high", "suicidal_intent", "Hinglish: jeena nahi", String.raw`(?:j[ei]n[ae]\s+nahi\s+(?:chahta|hai|he|h)|(?:ab\s+(?:aur\s+)?)?nahi\s+j[ei]n[ae]|j[ei]n[ae]\s+(?:ka|ki|ke)\s+(?:mann?|iccha|ichha|wajah|vajah|reason|matlab|maqsad|koi\s+(?:wajah|vajah|matlab|maqsad))\s+(?:nahi|nahi\s+(?:bacha|raha))|zinda\s+nahi\s+r[ae]hn[ae]|ab\s+aur\s+zinda|zinda\s+r[ae]hne\s+(?:ki|ka)\s+(?:wajah|vajah|iccha|mann?)\s+nahi)`, { negatable: false }),
  mk("rm", "high", "suicidal_intent", "Hinglish: khudkushi / suicide thoughts", String.raw`(?:khudkushi|suicide\s+(?:ke|ka|ki)\s+(?:khayal|khyal|vichar|thoughts?|ba+re|soch|baat)|suicidal)`, { active: true }),
  mk("rm", "high", "suicidal_intent", "Hinglish: sab khatam kar", String.raw`(?:sab\s+(?:kuch\s+)?khatam\s+kar\s*(?:d[ue]n?|l[ue]n?|d[ue]nga|l[ue]nga|na|ne|doon)|sab\s+khatam\s+(?:karna|karne))`, { active: true }),
  mk("rm", "high", "suicidal_intent", "Hinglish: wish not to wake / never born", String.raw`(?:kaash\s+(?:\w+\s+){0,4}hi\s+na\b|(?:paida|janam)\s+(?:hi\s+)?(?:na|nahi)\s+(?:hua|hui|hota|hoti|liya))`, { negatable: false }),
  mk("rm", "high", "self_harm", "Hinglish: khud ko hurt/harm", String.raw`(?:khud\s*ko\s+(?:(?:kabhi|bhi|phir|dobara|roz|bahut|khud)\s+)*(?:hurt|harm|nuksan|chot|cut|kat|jala|saza)|blade\s+se|hath\s+kat\w*|self\s*harm)`),
  mk("rm", "moderate", "suicidal_intent", "Hinglish: mentions suicide", String.raw`suicide`, { unsure: true }),
  mk("rm", "moderate", "hopelessness", "Hinglish: hopeless / umeed nahi", String.raw`(?:(?:koi\s+)?um[ei]+d\s+nahi|sab\s+kuch\s+(?:hopeless|bekar|vyarth|bekaam)|hopeless|(?:kuch|kuchh)\s+bhi\s+(?:acha|achha|theek|thik|sahi|accha)\s+nahi\s+(?:hoga|hota)|sab\s+(?:par|upar)\s+bojh|(?:family|ghar\s+walo|mummy\s+papa|sabke\s+upar)\s+(?:par\s+)?(?:ek\s+)?bojh|bojh\s+ban\s+gaya|main\s+bojh\s+hun|bekar\s+hun)`, { negatable: false }),
  mk("rm", "moderate", "distress", "Hinglish: dard / rasta nahi / khaali", String.raw`(?:dard\s+(?:ab\s+)?bardasht\s+nahi|bardasht\s+nahi\s+(?:hota|ho\s+raha)|(?:koi\s+)?rasta\s+nahi(?:\s+(?:dikhta|dikh|dikhai))?|andar\s+se\s+(?:sab\s+)?(?:khali|khaali|sunn|sun|khokhla|mar\s+chuka)|(?:khali|khaali)\s+(?:aur\s+)?(?:sunn|numb)|sunn\s+lagta|j[ei]n[ae]\s+se\s+(?:thak|tang))`, { negatable: false }),
  mk("rm", "moderate", "hopelessness", "Hinglish: gayab / mere bina", String.raw`(?:gayab\s+ho\s+j(?:a|aun|au|aoon)\w*|sab\s+mere\s+bina\s+(?:better|behtar|accha|achha|khush|theek)|(?:duniya|sab|zindagi|log)\s+mere\s+bina\s+(?:bhi\s+)?chal\w*|mere\s+bina\s+(?:bhi\s+)?(?:duniya|sab|sab\s+kuch|zindagi|log)\s+(?:chal|chalti|chalta|chalegi)\w*|kisi\s+ko\s+fark\s+nahi\s+(?:padega|padta)|nahi\s+rahunga|nahi\s+rahunga\s+main)`, { negatable: false }),
  mk("rm", "moderate", "suicidal_intent", "Hinglish: farewell said / gave away", String.raw`(?:(?:alvida|goodbye)\s+(?:bol|bola|keh|kaha|kah)\w*|(?:apni\s+|sab\s+)?(?:books?|kitabein|kitaben|cheezein|chizen|saman|kapde|laptop|phone)\s+(?:baant|bant|baat)\s+di\w*)`, { negatable: false, farewell: true }),
  mk("rm", "moderate", "hopelessness", "Hinglish: kisi ko pareshan nahi karunga", String.raw`kisi\s+ko\s+(?:pareshan|tang|disturb)\s+nahi\s+karunga|ab\s+kisi\s+ko\s+(?:bojh|pareshani)\s+nahi`, { negatable: false }),
  mk("rm", "low", "academic_stress", "Hinglish: exam tension", String.raw`(?:(?:padhai|exam|paper|viva|result|placement|backlog|syllabus)\s+(?:ka|ki|ke)\s+(?:tension|dar|stress|pressure|bojh)|tension\s+(?:bahut|zyada|ho|hai)|(?:backlog|syllabus)\s+(?:badh|bahut|zyada)\w*|dhyan\s+nahi\s+lag\w*|exam\s+ka\s+tension|hostel\s+m[ei]n?\s+akelapan|ghar\s+ki\s+yad|placement\s+ki\s+tension|viva\s+ka\s+dar|dar\s+lag\w*|ghabrahat)`, { negatable: false }),
  mk("rm", "low", "isolation", "Hinglish: akelapan / udas", String.raw`(?:akelapan|akela\s+(?:feel|lag)\w*|alag\s*thalag|sunsan|mann?\s+udas|udas|rona\s+aa\w*|nirash\s+kar|(?:feel|lag)\w*\s+(?:low|down|sad))`, { negatable: false }),
  mk("rm", "low", "academic_stress", "Hinglish: exam jaan le lega (idiom)", String.raw`(?:exam|paper|syllabus|padhai|viva|test|assignment|project)\s+(?:\w+\s+){0,3}?jan\s+le\s+(?:lega|legi|rahi|raha)`, { negatable: false }),

  // ===== Hindi (Devanagari) =====
  mk("dv", "imminent", "suicidal_intent", "Devanagari: suicide action/plan", String.raw`(?:आत्महत्या\s+(?:कर[\p{L}\p{M}]*|का\s+(?:प्लान|इरादा|फैसला)|की\s+(?:तैयारी|योजना|कोशिश|प्लानिंग))|खुदकुशी\s+कर[\p{L}\p{M}]*|खुदखुशी|सुसाइड\s+(?:कर[\p{L}\p{M}]*|नोट|प्लान)|suicide\s+कर[\p{L}\p{M}]*)`, { active: true }),
  mk("dv", "imminent", "suicidal_intent", "Devanagari: going to die/take life", String.raw`(?:मरने\s+जा\s+रह[ाीे]|जान\s+दे\s+दूंग[ाी]|(?:अपनी\s+)?जान\s+ले\s+लूंग[ाी]|मर\s*जाऊं(?:गा|गी)?|मर\s*जाना\s+है)`, { active: true }),
  mk("dv", "imminent", "suicidal_intent", "Devanagari: khud ko khatam", String.raw`(?:खुद\s*को\s+(?:\p{L}+\s+){0,2}?(?:खत्म|समाप्त)|सब\s+(?:कुछ\s+)?खत्म\s+करने\s+जा\s+रह[ाीे])`, { active: true }),
  mk("dv", "imminent", "suicidal_intent", "Devanagari: hanging/cutting/poison/jump", String.raw`(?:फांसी\s+लगा[\p{L}\p{M}]*|नस\s+काट[\p{L}\p{M}]*|कलाई\s+काट[\p{L}\p{M}]*|जहर\s+(?:खा|पी)[\p{L}\p{M}]*|(?:छत|बिल्डिंग|ब्रिज|पुल|बालकनी)\s+से\s+कूद[\p{L}\p{M}]*|नींद\s+की\s+गोलियां\s+खा[\p{L}\p{M}]*)`, { active: true }),
  mk("dv", "imminent", "suicidal_intent", "Devanagari: alvida / dhundhna mat", String.raw`(?:अलविदा\s+का\s+(?:खत|पत्र|नोट|लेटर|संदेश|मैसेज|चिट्ठी)|(?:आखिरी|अंतिम|लास्ट)\s+(?:अलविदा|सलाम|गुडबाय)|ढूंढना\s+मत|ढूँढना\s+मत|मुझे\s+मत\s+ढूंढ[\p{L}\p{M}]*)`, { negatable: false, farewell: true }),
  mk("dv", "high", "suicidal_intent", "Devanagari: marna chahta", String.raw`(?:मर(?:ना|ने)\s+चाह(?:ता|ती|ते)\s+ह[ूु]ं?|मर\s*जाना\s+चाह(?:ता|ती)|मर(?:ना|ने)\s+(?:का|की|के)\s+(?:मन|इच्छा|ख्याल|विचार)|मर(?:ने)\s+के\s+बारे\s+में\s+सोच[\p{L}\p{M}]*|मर\s*जाऊं\s+तो\s+(?:अच्छा|बेहतर)|काश\s+(?:मैं\s+)?मर\s+(?:जाता|जाती|जाऊं))`, { active: true }),
  mk("dv", "high", "suicidal_intent", "Devanagari: jeena nahi", String.raw`(?:जीना\s+न(?:हीं|ही)\s+चाह(?:ता|ती)|जीने\s+(?:की|का)\s+(?:इच्छा|मन|कोई\s+वजह|वजह|कोई\s+कारण|कारण|कोई\s+मतलब|मतलब|चाह|कोई\s+मकसद)\s+(?:न(?:हीं|ही))|(?:ज़िंदा|जिंदा)\s+न(?:हीं|ही)\s+रह[\p{L}\p{M}]*|अब\s+और\s+(?:ज़िंदा|जिंदा)|जीने\s+का\s+मन\s+न(?:हीं|ही))`, { negatable: false }),
  mk("dv", "high", "suicidal_intent", "Devanagari: wish not to be / never born", String.raw`(?:काश\s+(?:[\p{L}\p{M}]+\s+){0,4}ही\s+न(?![\p{L}\p{M}])|(?:पैदा|जन्म)\s+ही\s+न\s+(?:हुआ|हुई|होता|होती))`, { negatable: false }),
  mk("dv", "high", "suicidal_intent", "Devanagari: suicide thoughts / sab khatam", String.raw`(?:(?:आत्महत्या|सुसाइड|suicide)\s+(?:के|का|की)\s+(?:बारे|विचार|ख्याल)[\p{L}\p{M}\s]{0,12}|सब\s+(?:कुछ\s+)?खत्म\s+कर\s+(?:दूं|दूंगा|दूंगी|लूं|देना|दें)|सब\s+(?:कुछ\s+)?खत्म\s+करना\s+(?:है|चाहता))`, { active: true }),
  mk("dv", "high", "self_harm", "Devanagari: self harm", String.raw`(?:खुद\s+को\s+(?:नुकसान|चोट|काट|जला|हानि)[\p{L}\p{M}]*|हाथ\s+काट[\p{L}\p{M}]*|सेल्फ\s*हार्म)`),
  mk("dv", "moderate", "suicidal_intent", "Devanagari: mentions suicide", String.raw`(?:आत्महत्या|खुदकुशी|सुसाइड)`, { unsure: true }),
  mk("dv", "moderate", "hopelessness", "Devanagari: hopelessness / burden", String.raw`(?:सब\s+कुछ\s+(?:व्यर्थ|बेकार|निराशाजनक|बेमतलब)|निराशाजनक|कोई\s+उम्मीद\s+न(?:हीं|ही)|उम्मीद\s+न(?:हीं|ही)|बोझ\s+(?:हूं|बन)|परिवार\s+पर\s+बोझ|कुछ\s+भी\s+ठीक\s+न(?:हीं|ही)\s+होगा|बेकार\s+हूं)`, { negatable: false }),
  mk("dv", "moderate", "distress", "Devanagari: pain / no way / empty", String.raw`(?:दर्द\s+(?:अब\s+)?(?:बर्दाश्त|सहन)\s+न(?:हीं|ही)|बर्दाश्त\s+न(?:हीं|ही)\s+(?:होता|हो\s+रहा)|(?:कोई\s+)?(?:रास्ता|राह|उपाय)\s+(?:नजर|दिख)\s*न(?:हीं|ही)|कोई\s+रास्ता\s+न(?:हीं|ही)|अंदर\s+से\s+(?:सब\s+)?(?:खाली|सुन्न|खोखला)|जीने\s+से\s+(?:थक|तंग|ऊब)[\p{L}\p{M}]*)`, { negatable: false }),
  mk("dv", "moderate", "hopelessness", "Devanagari: gayab / mere bina", String.raw`(?:गायब\s+हो\s+जा[\p{L}\p{M}]*|मेरे\s+बिना\s+(?:सब\s+)?(?:बेहतर|अच्छे|ठीक|खुश)|(?:दुनिया|सब|जिंदगी)\s+मेरे\s+बिना\s+(?:भी\s+)?चल[\p{L}\p{M}\s]{0,8}|मेरे\s+बिना\s+(?:भी\s+)?(?:दुनिया|सब\s+कुछ|जिंदगी|लोग)\s+चल[\p{L}\p{M}\s]{0,8}|किसी\s+को\s+फर्क\s+न(?:हीं|ही)\s+पडेगा|अब\s+नहीं\s+रहूंग[ाी]|नहीं\s+रहूंग[ाी])`, { negatable: false }),
  mk("dv", "moderate", "suicidal_intent", "Devanagari: farewell said / gave away", String.raw`(?:अलविदा\s+(?:कह|बोल)[\p{L}\p{M}]*|(?:किताबें|किताबें|सामान|चीजें|कपड़े|कपडे)\s+(?:\p{L}+\s+){0,2}?(?:बांट|दे)\s*(?:दी|दीं|दिया|दिए)|किसी\s+को\s+(?:परेशान|तंग)\s+न(?:हीं|ही)\s+करूंग[ाी])`, { negatable: false, farewell: true }),
  mk("dv", "low", "academic_stress", "Devanagari: academic / hostel stress", String.raw`(?:(?:पढाई|परीक्षा|वाइवा|एग्जाम|इम्तिहान|पेपर|रिजल्ट|प्लेसमेंट|बैकलॉग)\s+(?:का|की|के)\s+(?:बोझ|तनाव|डर|चिंता|टेंशन|दबाव)|(?:डर|घबराहट)\s+लग[\p{L}\p{M}]*|हॉस्टल\s+(?:में\s+)?(?:अकेलापन|सुनसान|अकेला)|अकेला(?:पन)?\s+(?:महसूस|लग)[\p{L}\p{M}]*|अलग\s*-?\s*थलग|घर\s+की\s+याद|प्लेसमेंट\s+की\s+चिंता|ध्यान\s+न(?:हीं|ही)\s+लग[\p{L}\p{M}]*|मन\s+उदास|उदास|रोना\s+आ[\p{L}\p{M}]*|निराश\s+कर[\p{L}\p{M}]*)`, { negatable: false }),
  mk("dv", "low", "academic_stress", "Devanagari: exam jaan le legi (idiom)", String.raw`(?:परीक्षा|एग्जाम|पेपर|पढाई|सिलेबस|वाइवा|टेस्ट|असाइनमेंट)\s+(?:[\p{L}\p{M}]+\s+){0,3}?जान\s+ले\s+ल(?:ेगी|ेगा)`, { negatable: false }),
];

// --- Signal rules (no level of their own; combined per sentence) ---------------------------
const SIGNALS: SignalRule[] = [
  sg("en", "time", String.raw`(?:today|tonight|tonite|2nite|tomorrow|tmrw|tmr|right\s+now|this\s+(?:weekend|evening|night|week|afternoon|morning|friday|saturday|sunday)|later\s+(?:today|tonight)|after\s+(?:the\s+|my\s+|this\s+)?(?:exams?|results?|finals?|viva|semester|midterms?|graduation|today|tonight)|before\s+(?:the\s+)?(?:results?|exams?|sunrise|morning)|when\s+(?:everyone|they)\s+(?:sleeps?|leaves?|is\s+asleep|are\s+asleep)|next\s+(?:week|month)|soon|in\s+a\s+(?:few|couple\s+of)\s+(?:hours|days|minutes)|by\s+(?:morning|tonight|tomorrow|friday|sunday))`),
  sg("rm", "time", String.raw`(?:aj|aj\s+rat|aj\s+hi|aj\s+shaam|aj\s+sham|kal|kal\s+rat|abhi|abhi\s+hi|jald|jaldi|jald\s+hi|is\s+(?:weekend|hafte|raat|rat)|(?:result|results?|exam|exams|paper|papers|viva|semester|finals?)\s+ke\s+ba+d|(?:aj|kal)\s+ke\s+ba+d|bas\s+(?:ek|kuch)\s+(?:din|ghante)|subah\s+tak)`),
  sg("dv", "time", String.raw`(?:आज|आज\s+रात|आज\s+ही|कल|अभी|अभी\s+ही|जल्द|जल्दी|इस\s+(?:वीकेंड|हफ्ते|रात|सप्ताह)|(?:रिजल्ट|नतीजे|परीक्षा|एग्जाम|पेपर|वाइवा|सेमेस्टर)\s+के\s+बाद|आज\s+के\s+बाद|कल\s+रात|बस\s+(?:एक|कुछ)\s+(?:दिन|घंटे)|सुबह\s+तक)`),
  sg("en", "plan", String.raw`(?:plan|plans|planned|planning)`),
  sg("rm", "plan", String.raw`(?:plan|yojana|tayari|taiyari)`),
  sg("dv", "plan", String.raw`(?:योजना|प्लान|तैयारी|इंतजाम)`),
  sg("en", "decision", String.raw`(?:made\s+up\s+my\s+mind|made\s+(?:my|the|a)\s+(?:final\s+)?decision|decided|decision\s+(?:is\s+)?(?:made|final)|my\s+mind\s+is\s+made\s+up|final\s+decision|its\s+decided)`),
  sg("rm", "decision", String.raw`(?:decide\s+kar\s+li\w*|faisla\s+(?:kar\s+liya|ho\s+chuka|le\s+liya|ho\s+gaya|kar\s+chuka)|final\s+decision|tay\s+kar\s+liya|mann?\s+bana\s+liya|pakka\s+kar\s+liya)`),
  sg("dv", "decision", String.raw`(?:तय\s+कर\s+लिया|फैसला\s+(?:कर\s+लिया|हो\s+चुका|ले\s+लिया|हो\s+गया)|फाइनल\s+डिसीजन|डिसाइड\s+कर|मन\s+बना\s+लिया|पक्का\s+कर\s+लिया|final\s+decision)`),
  sg("en", "doit", String.raw`(?:(?:do|doing|go\s+through\s+with|follow\s+through\s+with|carry\s+out|act\s+on)\s+(?:it|this|that|the\s+plan))`),
  sg("rm", "doit", String.raw`(?:karne\s+wala|kar\s+(?:dunga|lunga)|amal\s+karunga)`),
  sg("dv", "doit", String.raw`(?:करने\s+वाला|करने\s+वाली)`),
  sg("en", "future", String.raw`(?:going\s+to|gonna|about\s+to|ready\s+to|decided\s+to|plan(?:ning)?\s+to|intend\s+to|will)`),
  sg("rm", "future", String.raw`(?:dunga|lunga|karunga|jaunga|rahunga|ja\s+raha|karne\s+wala|karne\s+ja)`),
  sg("dv", "future", String.raw`(?:दूंगा|दूंगी|लूंगा|लूंगी|करूंगा|करूंगी|जाऊंगा|जाऊंगी|जा\s+रहा|जा\s+रही|करने\s+वाला|करने\s+वाली)`),
  sg("en", "waiting", String.raw`(?:waiting\s+(?:for\s+)?(?:the\s+)?(?:right|perfect)\s+(?:moment|time|chance|opportunity))`),
  sg("rm", "waiting", String.raw`(?:sahi\s+(?:samay|waqt|mauka|time)\s+ka\s+(?:intezaar|intezar|wait))`),
  sg("dv", "waiting", String.raw`(?:सही\s+(?:समय|वक्त|मौका)\s+का\s+इंतजार)`),
  sg("en", "goodbye_say", String.raw`(?:(?:told|said|say|saying)\s+(?:my\s+|all\s+my\s+)?(?:friends|everyone|family|parents|them|all)\s+(?:goodbye|good\s+bye|farewell)|(?:said|say|saying)\s+(?:goodbye|good\s+bye|farewell)\s+to\s+(?:everyone|all|my\s+(?:friends|family|parents)))`),
  sg("rm", "goodbye_say", String.raw`(?:alvida|goodbye)\s+(?:bol|bola|keh|kaha|kah)\w*`),
  sg("dv", "goodbye_say", String.raw`अलविदा\s+(?:कह|बोल)[\p{L}\p{M}]*`),
  sg("en", "giveaway", String.raw`(?:gave|given|giving|give)\s+away\s+(?:all\s+)?(?:my\s+)?(?:books?|things|stuff|belongings|clothes|laptop|phone|possessions|notes|games|items|savings|money|guitar|pets?)`),
  sg("rm", "giveaway", String.raw`(?:books?|kitabein|kitaben|cheezein|chizen|saman|kapde|laptop|phone)\s+(?:baant|bant|baat)\s+di\w*`),
  sg("dv", "giveaway", String.raw`(?:किताबें|सामान|चीजें|कपड़े|कपडे)\s+(?:\p{L}+\s+){0,2}?(?:बांट|दे)\s*(?:दी|दीं|दिया|दिए)`),
  sg("en", "dontlook", String.raw`(?:dont|do\s+not)\s+(?:look|search|come\s+looking)\s+for\s+me`),
  sg("rm", "dontlook", String.raw`(?:mujhe|mujhko)\s+(?:dhundhna|dhundna|dhoondhna|dundhna)\s+mat`),
  sg("dv", "dontlook", String.raw`(?:ढूंढना|ढूँढना)\s+मत`),
  sg("en", "absence", String.raw`(?:wont|will\s+not)\s+be\s+(?:around|here|there|alive)`),
  sg("rm", "absence", String.raw`nahi\s+rahunga`),
  sg("dv", "absence", String.raw`(?:नहीं|नही)\s+रहूंग[ाी]`),
  sg("en", "finality", String.raw`(?:wont|will\s+not|never)\s+(?:bother|trouble|disturb|burden)\s+(?:anyone|anybody|you|everyone)`),
  sg("rm", "finality", String.raw`kisi\s+ko\s+(?:pareshan|tang|disturb)\s+nahi\s+karunga`),
  sg("dv", "finality", String.raw`किसी\s+को\s+(?:परेशान|तंग)\s+न(?:हीं|ही)\s+करूंग[ाी]`),
  sg("en", "empty_place", String.raw`(?:(?:hostel|room|house|flat|home)\s+(?:is\s+)?(?:empty|deserted)|(?:no\s+one|nobody)\s+(?:is\s+)?(?:home|around|here|in\s+the\s+hostel))`),
  sg("rm", "empty_place", String.raw`(?:hostel|room|ghar|flat)\s+(?:\w+\s+){0,2}?(?:khali|khaali)`),
  sg("dv", "empty_place", String.raw`(?:हॉस्टल|कमरा|घर|फ्लैट)\s+(?:[\p{L}\p{M}]+\s+){0,2}?खाली`),
  sg("en", "opportunity", String.raw`(?:(?:right|perfect|only|best|opportunity|chance)\s+(?:i\s+(?:was|have\s+been)\s+waiting\s+for|chance|opportunity|moment))|(?:opportunity|chance)\s+i\s+(?:was|have\s+been)\s+waiting\s+for`),
  sg("rm", "opportunity", String.raw`(?:sahi|perfect)\s+mauka|mauka\s+(?:hai|mil)`),
  sg("dv", "opportunity", String.raw`(?:सही|यही\s+सही)\s+मौका|मौका\s+(?:है|मिल)`),
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface Hit { rule: Rule; negated?: boolean; thirdPerson: boolean; firstPerson: boolean; level: RiskLevel }

const QUOTE_RE = /(?<![\p{L}\p{N}])(['‘"“])([^'’"”]{4,200}?)['’"”](?![\p{L}\p{N}])/gu;

function splitSentences(raw: string): string[] {
  return raw.split(/[.!?।;\n]+/u).map((s) => s.trim()).filter(Boolean);
}
function splitClauses(sentence: string): string[] {
  return sentence
    .split(/,|:|\s[-–—]\s|\b(?:but|however|though|although)\b|\b(?:lekin|magar|parantu)\b|(?:लेकिन|मगर|परंतु|किंतु)/iu)
    .map((s) => s.trim())
    .filter(Boolean);
}

function maskQuotes(sentence: string): string {
  const outside = sentence.replace(QUOTE_RE, " ");
  const cue = FICTION_EN.test(outside) || FICTION_RM.test(normalizeText(outside)) || FICTION_DV.test(normalizeText(outside));
  return cue ? outside : sentence;
}

function stripIdioms(view: View, text: string): string {
  let t = text;
  for (const s of STRIPS) if (s.view === view || s.view === "en") t = t.replace(s.re, " ");
  return t.replace(/\s+/g, " ").trim();
}

function tokenWindowBefore(text: string, index: number, n: number): string {
  return text.slice(0, index).split(" ").filter(Boolean).slice(-n).join(" ");
}

export function detectRisk(text: string): RiskDetectionResult {
  const normalized = normalizeText(text);
  if (!normalized) return { level: "none", categories: [], matches: [], normalizedText: "" };

  const matches: string[] = [];
  const categories = new Set<RiskCategory>();
  const suppressed: string[] = [];
  let level: RiskLevel = "none";
  let escalated = false;
  const raise = (l: RiskLevel, cat: RiskCategory | null, label: string) => {
    if (rank(l) > rank(level)) level = l;
    if (cat) categories.add(cat);
    if (!matches.includes(label)) matches.push(label);
  };

  for (const rawSentence of splitSentences(text)) {
    const sentence = maskQuotes(rawSentence);
    const hits: Hit[] = [];
    const signals = new Set<Signal>();
    const clauseSignals: Set<Signal>[] = [];
    let sentenceFirstPerson = false;
    let benignGoodbye = false;

    for (const clauseRaw of splitClauses(sentence)) {
      const n = normalizeText(clauseRaw);
      if (!n) continue;
      const views: Record<View, string> = {
        en: stripIdioms("en", toEnglishView(n)),
        rm: stripIdioms("rm", toRomanView(n)),
        dv: stripIdioms("dv", toDevanagariView(n)),
      };
      const fictionClause = FICTION_EN.test(views.en) || FICTION_RM.test(views.rm) || FICTION_DV.test(views.dv);
      if (FP_SENT_EN.test(views.en) || FP_SENT_RM.test(views.rm) || FP_SENT_DV.test(views.dv)) sentenceFirstPerson = true;
      if (BENIGN_GOODBYE.test(views.en)) benignGoodbye = true;
      const cs = new Set<Signal>();

      for (const rule of RULES) {
        const v = views[rule.view];
        const m = rule.re.exec(v);
        if (!m) continue;
        const start = m.index;
        const end = start + m[0].length;
        const before = tokenWindowBefore(v, start, 4);
        const matchAndBefore = `${before} ${m[0]}`;
        const firstPerson =
          rule.view === "en" ? FP_EN.test(matchAndBefore) || /sel(?:f|ves)\b/.test(m[0]) && /\bmyself\b/.test(m[0])
          : rule.view === "rm" ? FP_RM.test(matchAndBefore)
          : FP_DV.test(matchAndBefore);
        const third = (rule.view === "en" ? THIRD_EN : rule.view === "rm" ? THIRD_RM : THIRD_DV).test(before) || /\b(?:him|her|them)sel/.test(m[0]);

        if (fictionClause && !firstPerson) { suppressed.push(`${rule.label} [fiction/lyrics context]`); continue; }
        if (rule.negatable) {
          let neg = false;
          if (rule.view === "en") neg = NEG_BEFORE_EN.test(v.slice(0, start) + " ");
          else if (rule.view === "rm") neg = NEG_AFTER_RM.test(v.slice(end)) || NEG_BEFORE_RM.test(v.slice(0, start) + " ");
          else neg = NEG_AFTER_DV.test(v.slice(end));
          if (neg) { suppressed.push(`${rule.label} [negated]`); continue; }
        }
        let lvl = rule.level;
        if (third && !firstPerson && rank(lvl) > rank("high")) lvl = "high";
        hits.push({ rule, thirdPerson: third && !firstPerson, firstPerson, level: lvl });
      }

      for (const s of SIGNALS) {
        if (s.re.test(views[s.view])) cs.add(s.signal);
      }
      clauseSignals.push(cs);
      for (const s of cs) signals.add(s);
    }

    // Farewell rules do not fire in graduation / holiday contexts.
    const live = hits.filter((h) => !(h.rule.farewell && benignGoodbye));
    for (const h of hits) if (!live.includes(h)) suppressed.push(`${h.rule.label} [benign goodbye context]`);

    let sentLevel: RiskLevel = "none";
    for (const h of live) {
      let l = h.level;
      if (h.rule.unsure && (h.firstPerson || sentenceFirstPerson) && rank(l) < rank("high")) { l = bump(l); escalated = true; }
      if (rank(l) > rank(sentLevel)) sentLevel = l;
      raise(l, h.rule.category, h.rule.label);
    }

    // Composite: active ideation + time/plan/decision/intent/waiting/farewell -> imminent.
    const hasActive = live.some((h) => h.rule.active && rank(h.level) >= rank("high"));
    const actionSignals: Signal[] = ["time", "plan", "decision", "doit", "waiting", "finality", "goodbye_say", "giveaway", "dontlook", "absence"];
    if (hasActive && (actionSignals.some((s) => signals.has(s)) || clauseSignals.some((c) => c.has("future")))) {
      if (rank(sentLevel) < rank("imminent")) {
        const thirdOnly = live.filter((h) => h.rule.active).every((h) => h.thirdPerson) && !sentenceFirstPerson;
        if (!thirdOnly || signals.has("time")) { raise("imminent", "suicidal_intent", "composite: intent plus time/plan/decision/farewell"); sentLevel = "imminent"; escalated = true; }
      }
    }
    // Composite: plan statement with action, time or waiting.
    if (sentenceFirstPerson && signals.has("plan") && (signals.has("doit") || signals.has("waiting") || (signals.has("time") && signals.has("future")))) {
      raise("imminent", "suicidal_intent", "composite: plan plus action/time");
    }
    if (!benignGoodbye) {
      if (signals.has("giveaway") && signals.has("goodbye_say")) raise("imminent", "suicidal_intent", "composite: farewell plus giving away possessions");
      if (signals.has("dontlook") && (signals.has("absence") || signals.has("time"))) raise("imminent", "suicidal_intent", "composite: dont look for me");
      else if (signals.has("dontlook")) raise("high", "suicidal_intent", "dont look for me");
    }
    if (signals.has("finality") && (signals.has("decision") || signals.has("time"))) raise("imminent", "suicidal_intent", "composite: finality plus decision/time");
    if (signals.has("empty_place") && signals.has("opportunity") && signals.has("time")) raise("moderate", "distress", "composite: empty place plus opportunity plus time");
  }

  // Low-risk idioms and benign handling only matter when nothing worse was found.
  if (level === "none" || level === "low") {
    for (const rule of LOW_IDIOMS) {
      if (rule.re.test(normalized)) raise("low", rule.category, rule.label);
    }
  }

  const out: RiskDetectionResult = { level, categories: Array.from(categories), matches, normalizedText: normalized };
  if (escalated) out.escalated = true;
  if (suppressed.length) out.suppressed = suppressed;
  return out;
}

/**
 * Idioms where "killing me" or "dead" mean academic pressure or tiredness: low risk, never high.
 */
const LOW_IDIOMS: { re: RegExp; category: RiskCategory; label: string }[] = [
  { re: /\b(?:exam|exams|syllabus|test|tests|viva|quiz|assignment|assignments|homework|workload|pressure|routine|studies|study|classes)\s+(?:is|are|was|were)?\s*(?:literally\s+)?killing\s+me\b/iu, category: "academic_stress", label: "academic idiom: exam killing me" },
  { re: /\b(?:literally\s+)?killing\s+me\s*(?:this|the)?\s*(?:exam|exams|syllabus|test|assignment|homework)\b/iu, category: "academic_stress", label: "academic idiom: killing me (exam)" },
  { re: /\b(?:head|headache|back|neck|feet|stomach|heat|weather)\s+(?:is|are|was|were)?\s*(?:literally\s+)?killing\s+me\b/iu, category: "distress", label: "physical fatigue idiom" },
  { re: /\bdead\s+tired\b/iu, category: "distress", label: "fatigue idiom: dead tired" },
  { re: /\bbored\s+to\s+death\b/iu, category: "distress", label: "boredom idiom: bored to death" },
  { re: /\bscared\s+to\s+death\s+(?:of\s+)?(?:the\s+)?(?:viva|exam|results?|presentation|test)\b/iu, category: "academic_stress", label: "academic stress idiom: scared to death" },
];

export default detectRisk;



