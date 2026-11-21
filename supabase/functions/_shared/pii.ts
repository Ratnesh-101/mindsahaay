// ==============================================================================
// PII Redaction Utility for India DPDP Act 2023 Compliance
// Protects student privacy by removing identifiable information before LLM inference
// ==============================================================================

export interface RedactionResult {
  sanitized: string;
  hasRedactions: boolean;
  redactedTypes: {
    phone: number;
    email: number;
    aadhaar: number;
    rollNumber: number;
    name: number;
  };
}

// Regex Patterns
const PHONE_PATTERN = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
const AADHAAR_PATTERN = /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g;
const ROLL_NUMBER_PATTERN = /\b(?:20\d{2}[A-Za-z]{2,5}\d{2,6}|\d{2}[A-Za-z]{2,4}\d{3,5}|[A-Za-z]{2,4}\d{2}[A-Za-z]\d{3,6}|[A-Za-z]{2,4}\d{5,8})\b/g;
// Names are only redacted when introduced explicitly (self-introduction or honorific + capitalised name)
// to avoid wiping ordinary capitalised words. Full name detection needs NER and is out of scope.
const NAME_INTRO_PATTERN =
  /\b((?:[Mm]y name is|[Mm]y name's|[Mm]era naam|[Mm]era name|I am called|[Cc]all me)\s+)[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}/g;
const NAME_HONORIFIC_PATTERN = /\b(?:Dr|Prof|Mr|Mrs|Ms|Sir|Madam)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g;

/**
 * Redacts personally identifiable information (PII) from user input text.
 */
export function redactPII(input: string): RedactionResult {
  if (!input || typeof input !== "string") {
    return {
      sanitized: "",
      hasRedactions: false,
      redactedTypes: { phone: 0, email: 0, aadhaar: 0, rollNumber: 0, name: 0 },
    };
  }

  let text = input;
  let phoneCount = 0;
  let emailCount = 0;
  let aadhaarCount = 0;
  let rollCount = 0;
  let nameCount = 0;

  // 1. Redact Emails
  text = text.replace(EMAIL_PATTERN, () => {
    emailCount++;
    return "[REDACTED_EMAIL]";
  });

  // 2. Redact Indian Aadhaar Numbers
  text = text.replace(AADHAAR_PATTERN, () => {
    aadhaarCount++;
    return "[REDACTED_AADHAAR]";
  });

  // 3. Redact Indian Mobile Numbers
  text = text.replace(PHONE_PATTERN, () => {
    phoneCount++;
    return "[REDACTED_PHONE]";
  });

  // 4. Redact Student Roll/Registration Numbers
  text = text.replace(ROLL_NUMBER_PATTERN, () => {
    rollCount++;
    return "[REDACTED_ROLL_NO]";
  });

  // 5. Redact explicitly introduced names
  text = text.replace(NAME_INTRO_PATTERN, (_m, prefix: string) => {
    nameCount++;
    return `${prefix}[REDACTED_NAME]`;
  });
  text = text.replace(NAME_HONORIFIC_PATTERN, () => {
    nameCount++;
    return "[REDACTED_NAME]";
  });

  const totalRedactions = phoneCount + emailCount + aadhaarCount + rollCount + nameCount;

  return {
    sanitized: text,
    hasRedactions: totalRedactions > 0,
    redactedTypes: {
      phone: phoneCount,
      email: emailCount,
      aadhaar: aadhaarCount,
      rollNumber: rollCount,
      name: nameCount,
    },
  };
}
