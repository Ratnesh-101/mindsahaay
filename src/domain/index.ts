/**
 * MindSahaay Domain Logic Barrel Export
 * Pure, framework-free, fully typed domain logic for mental health screening,
 * deterministic crisis detection & triage, risk routing, and zero-knowledge encryption.
 */

// Assessment Scoring
export * from "./scoring/phq4";
export * from "./scoring/phq9";
export * from "./scoring/gad7";

// Crisis & Risk Detection
export * from "./risk/lexicon";
export * from "./risk/riskRouting";

// Zero-Knowledge Journal Cryptography
export * from "./crypto/journalCrypto";

import { scorePHQ4, validatePHQ4Answers, PHQ4_DISCLAIMER } from "./scoring/phq4";
import { scorePHQ9, validatePHQ9Answers, PHQ9_DISCLAIMER } from "./scoring/phq9";
import { scoreGAD7, validateGAD7Answers, GAD7_DISCLAIMER } from "./scoring/gad7";
import { detectRisk, normalizeText } from "./risk/lexicon";
import {
  routeRisk,
  MANDATORY_HELPLINES,
  ROUTING_DISCLAIMER,
} from "./risk/riskRouting";
import {
  encryptJournal,
  decryptJournal,
  generateRecoveryCode,
  validateRecoveryCode,
  uint8ArrayToBase64,
  base64ToUint8Array,
  PBKDF2_ITERATIONS,
  JournalCryptoError,
} from "./crypto/journalCrypto";

const domain = {
  // Scoring
  scorePHQ4,
  validatePHQ4Answers,
  PHQ4_DISCLAIMER,
  scorePHQ9,
  validatePHQ9Answers,
  PHQ9_DISCLAIMER,
  scoreGAD7,
  validateGAD7Answers,
  GAD7_DISCLAIMER,

  // Risk & Crisis
  detectRisk,
  normalizeText,
  routeRisk,
  MANDATORY_HELPLINES,
  ROUTING_DISCLAIMER,

  // Cryptography
  encryptJournal,
  decryptJournal,
  generateRecoveryCode,
  validateRecoveryCode,
  uint8ArrayToBase64,
  base64ToUint8Array,
  PBKDF2_ITERATIONS,
  JournalCryptoError,
};

export default domain;
