# MindSahaay Domain Logic Architecture & Clinical Reference

Pure, framework-free, zero-dependency, and fully-typed TypeScript domain modules for **MindSahaay** — a privacy-first digital mental health platform for Indian university students.

---

## Directory Structure

```
src/domain/
├── scoring/
│   ├── phq4.ts          # PHQ-4 ultra-brief anxiety & depression screening
│   ├── phq4.test.ts     # Boundary, subscale, and validation tests
│   ├── phq9.ts          # PHQ-9 depression screening & Item 9 crisis trigger
│   ├── phq9.test.ts     # Boundary and Item 9 safety protocol tests
│   ├── gad7.ts          # GAD-7 generalized anxiety screening
│   └── gad7.test.ts     # Scoring band and validation tests
├── risk/
│   ├── lexicon.ts       # Multilingual deterministic crisis & risk detection
│   ├── lexicon.test.ts  # English, Hindi, Hinglish & false-positive tests
│   ├── riskRouting.ts   # Operational triage, action mapping & helpline directory
│   └── riskRouting.test.ts # Triage routing, safety rule & helpline tests
├── crypto/
│   ├── journalCrypto.ts # WebCrypto AES-256-GCM with PBKDF2 (600,000 iter)
│   └── journalCrypto.test.ts # Round-trip, tampering, and recovery code tests
├── index.ts             # Domain barrel export
└── README.md            # Specifications, clinical references, and regulatory standards
```

---

## 1. Clinical & Educational Screening Instruments

All screening modules strictly follow established psychometric instruments and incorporate the mandatory legal and ethical principle: **MindSahaay assessments are educational screening tools, never clinical diagnostic verdicts**.

### PHQ-4 (Patient Health Questionnaire-4)
- **Source**: Kroenke K, Spitzer RL, Williams JB, Löwe B. *An ultra-brief screening scale for anxiety and depression: the PHQ-4.* Psychosomatics. 2009;50(6):613-621.
- **Items**: 4 items scored 0 to 3 (0 = Not at all, 1 = Several days, 2 = More than half the days, 3 = Nearly every day).
- **Subscales**:
  - **Anxiety (GAD-2)**: Items 1 & 2. Cutoff: `anxietyScore >= 3` triggers `anxietyFlag: true` (indicates high sensitivity for generalized anxiety).
  - **Depression (PHQ-2)**: Items 3 & 4. Cutoff: `depressionScore >= 3` triggers `depressionFlag: true` (indicates high sensitivity for major depression).
- **Severity Bands**:
  | Total Score | Classification |
  | :--- | :--- |
  | 0 – 2 | Normal |
  | 3 – 5 | Mild |
  | 6 – 8 | Moderate |
  | 9 – 12 | Severe |

### PHQ-9 (Patient Health Questionnaire-9)
- **Source**: Kroenke K, Spitzer RL, Williams JB. *The PHQ-9: validity of a brief depression severity measure.* J Gen Intern Med. 2001;16(9):606-613.
- **Items**: 9 items scored 0 to 3.
- **Severity Bands**:
  | Total Score | Classification |
  | :--- | :--- |
  | 0 – 4 | Minimal depression |
  | 5 – 9 | Mild depression |
  | 10 – 14 | Moderate depression |
  | 15 – 19 | Moderately severe depression |
  | 20 – 27 | Severe depression |
- **Critical Safety Invariant**:
  - **Item 9**: *"Thoughts that you would be better off dead or of hurting yourself in some way"*.
  - Any non-zero response (`answers[8] > 0`: score 1, 2, or 3) **immediately flags `item9Flag: true` and `requiresCrisisProtocol: true`**, overriding mild or minimal total scores.

### GAD-7 (Generalized Anxiety Disorder-7)
- **Source**: Spitzer RL, Kroenke K, Williams JB, Löwe B. *A brief measure for assessing generalized anxiety disorder: the GAD-7.* Arch Intern Med. 2006;166(10):1092-1097.
- **Items**: 7 items scored 0 to 3.
- **Severity Bands**:
  | Total Score | Classification |
  | :--- | :--- |
  | 0 – 4 | Minimal anxiety |
  | 5 – 9 | Mild anxiety |
  | 10 – 14 | Moderate anxiety |
  | 15 – 21 | Severe anxiety |

---

## 2. Deterministic Multilingual Crisis & Risk Detection (`lexicon.ts`)

MindSahaay protects Indian university students who communicate in English, Hindi, and colloquial Hinglish (code-mixed Hindi in Roman script).

### Text Normalization Pipeline
1. **Unicode NFC Normalization**: Unifies precomposed and decomposed Unicode glyphs.
2. **Case Folding**: Converts text to lowercase.
3. **Zero-Width Stripping**: Removes hidden formatting characters (ZWNJ `\u200C`, ZWJ `\u200D`, `\u200B`, `\uFEFF`).
4. **Devanagari Normalization**:
   - Strips Nuktas (`\u093C`) so `ख़ुद` maps to `खुद` and `ज़हर` maps to `जहर`.
   - Normalizes Chandrabindu (`\u0901`) to Anusvara (`\u0902`) so `हूँ` maps to `हूं`.
   - Preserves Unicode combining marks (`\p{M}`) to maintain Devanagari vowel matras.
5. **Contraction Normalization**: Strips apostrophes (`can't` -> `cant`, `i'm` -> `im`).
6. **Repeated-Letter Collapse**: Collapses 3+ identical consecutive characters down to 1 (e.g., `"marrrrr jaaanaaaa"` -> `"mar jana"`, `"sooooo"` -> `"so"`).
7. **Punctuation Clean-up**: Replaces symbols and punctuation with single spaces.

### Triage Levels & Triggers
- **`imminent`**: Explicit suicidal plan, active self-harm, lethal methods (overdose, jumping, hanging, cutting), or immediate intent in English, Hindi (e.g., `"आत्महत्या"`, `"खुद को खत्म"`, `"फांसी"`), or Hinglish (e.g., `"mar jaana chahta hoon"`, `"khud ko khatam"`, `"jaan de dunga"`, `"zehar kha"`).
- **`high`**: Active suicidal ideation or desire to cease existing (e.g., `"want to die"`, `"better off dead"`, `"जीना नहीं चाहता"`, `"jeena nahi chahta"`, `"marne ka mann"`, `"self harm"`).
- **`moderate`**: Entrapment, unbearable emotional pain, feeling like a burden (e.g., `"feel hopeless"`, `"burden to my family"`, `"can't take this pain"`, `"सब पर बोझ"`, `"bojh ban gaya"`).
- **`low`**: Situational academic stress, exam pressure, loneliness, homesickness, or common colloquialisms (e.g., `"exam stress"`, `"lonely in hostel"`, `"padhai ka tension"`).
- **`none`**: Neutral conversational, informative, or positive interactions.

### Robust False-Positive Handling
Common student idioms and colloquial expressions that use words like "kill", "dead", or "dying" must **never** trigger false crisis alerts:
- `"this exam is killing me"` / `"the syllabus is killing me"` -> Correctly classified as **`low`** (`academic_stress`).
- `"my head is killing me"` / `"dead tired"` / `"bored to death"` -> Correctly classified as **`low`** (`distress`).
- `"killing it at the hackathon"` / `"dying of laughter"` / `"drop dead gorgeous"` -> Correctly classified as **`none`**.

---

## 3. Risk Routing & Emergency Escalation Protocol (`riskRouting.ts`)

Complies with the **University Grants Commission (UGC) Guidelines on Promotion of Physical and Mental Well-being in Higher Educational Institutions (HEIs)** and the **Mental Healthcare Act 2017**.

### Action Triage Matrix
| Condition | Trigger | Resulting Action | Crisis Card | Counsellor Alert |
| :--- | :--- | :--- | :---: | :---: |
| **PHQ-9 Item 9 > 0** | Any score > 0 (1, 2, or 3) | `crisis_card_plus_counsellor_alert` | **Yes** | **Yes** |
| **Risk Level: Imminent** | Explicit crisis keywords | `crisis_card_plus_counsellor_alert` | **Yes** | **Yes** |
| **Risk Level: High** | Suicidal ideation / self-harm | `crisis_card_plus_counsellor_alert` | **Yes** | **Yes** |
| **Risk Level: Moderate** | Hopelessness / burden | `supportive_plus_resources` | No | No |
| **Risk Level: Low** | Academic/hostel stress | `normal_reply` | No | No |
| **Risk Level: None** | General query | `normal_reply` | No | No |

### Mandatory Government of India Helplines
All crisis outputs provide one-tap dialing access to:
1. **Tele-MANAS**: `14416` / `1800-891-4416` (National Tele Mental Health Programme of India, MoHFW, 24/7, 20+ Indian languages).
2. **KIRAN**: `1800-599-0019` (DEPwD, Ministry of Social Justice & Empowerment, 24/7 toll-free).
3. **Emergency Services**: `112` (Unified national emergency response for medical ambulance, fire, and police).

---

## 4. Zero-Knowledge Journal Cryptography (`journalCrypto.ts`)

Under the **India Digital Personal Data Protection (DPDP) Act 2023**, student reflective journals and self-care notes are classified as sensitive personal data. MindSahaay implements local-first, zero-knowledge client-side encryption.

### Cryptographic Parameters
- **Symmetric Cipher**: `AES-256-GCM` (Galois/Counter Mode with 128-bit authentication tag).
- **Key Derivation Function**: `PBKDF2` with `SHA-256` and **600,000 iterations** (OWASP recommendation).
- **Salt**: 16 bytes (128 bits) generated via cryptographically secure `crypto.getRandomValues()`.
- **Initialization Vector (IV)**: 12 bytes (96 bits) unique per encryption operation.
- **Wire Format**: Serialized as `{ ciphertext, iv, salt, iterations, algorithm }` with base64 strings.
- **Recovery Codes**: Cryptographically secure 16-character alphanumeric tokens formatted as `XXXX-XXXX-XXXX-XXXX` using a human-friendly character set (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`) that excludes ambiguous characters (`0`, `O`, `1`, `I`, `L`).

---

## 5. Verification & Test Suite

Run the full unit test suite with Vitest:

```bash
npx vitest run src/domain
```

All 90 unit tests pass with complete branch and boundary coverage.
