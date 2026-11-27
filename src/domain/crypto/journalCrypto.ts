/**
 * MindSahaay Zero-Knowledge Journal Cryptography
 * Pure domain logic implementing client-side end-to-end encryption for student journals.
 *
 * Cryptographic Specifications (DPDP Act 2023 & OWASP Standards):
 * - Key Derivation: PBKDF2 with SHA-256 and 600,000 iterations (OWASP recommendation).
 * - Symmetric Cipher: AES-256-GCM (authenticated encryption with 128-bit authentication tag).
 * - Salt: 16 cryptographically secure random bytes (128 bits).
 * - IV (Initialization Vector): 12 cryptographically secure random bytes (96 bits recommended for GCM).
 * - Output format: Base64-encoded strings for ciphertext, iv, and salt.
 * - Recovery Code: Cryptographically secure 16-character grouped alphanumeric token (e.g., "ABCD-EFGH-JKLM-NPQR").
 *
 * Privacy Guarantee:
 * The encryption key is derived client-side solely from the student's passphrase or recovery code.
 * MindSahaay servers and databases only ever store ciphertext, IV, and salt.
 */

export const PBKDF2_ITERATIONS = 600000;
export const SALT_BYTE_LENGTH = 16;
export const IV_BYTE_LENGTH = 12;
export const AES_KEY_BIT_LENGTH = 256;

export interface EncryptedJournalPayload {
  ciphertext: string;
  iv: string;
  salt: string;
  iterations?: number;
  algorithm?: string;
}

export class JournalCryptoError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "JournalCryptoError";
  }
}

/**
 * Universal Uint8Array to Base64 encoder supporting browser and Node.js environments.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Universal Base64 to Uint8Array decoder supporting browser and Node.js environments.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof base64 !== "string" || !base64.trim()) {
    throw new JournalCryptoError("Invalid base64 input: string must not be empty.");
  }
  try {
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(base64, "base64");
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (err) {
    throw new JournalCryptoError("Failed to decode base64 string.", err);
  }
}

/**
 * Resolves the available WebCrypto instance in current runtime.
 */
function getCrypto(): Crypto {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  throw new JournalCryptoError("WebCrypto API is not available in the current environment.");
}

/**
 * Derives an AES-GCM 256-bit CryptoKey from a user passphrase and salt using PBKDF2 with 600,000 iterations.
 */
export async function deriveEncryptionKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
  keyUsages: KeyUsage[] = ["encrypt", "decrypt"]
): Promise<CryptoKey> {
  const cryptoInstance = getCrypto();
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);

  const baseKey = await cryptoInstance.subtle.importKey(
    "raw",
    passphraseBytes,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return cryptoInstance.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: AES_KEY_BIT_LENGTH },
    false,
    keyUsages
  );
}

/**
 * Encrypts student journal text using AES-256-GCM and PBKDF2 (600,000 iterations).
 * Returns base64 encoded { ciphertext, iv, salt } payload.
 */
export async function encryptJournal(
  plaintext: string,
  passphrase: string
): Promise<EncryptedJournalPayload> {
  if (typeof plaintext !== "string") {
    throw new JournalCryptoError("Plaintext must be a string.");
  }
  if (!passphrase || typeof passphrase !== "string" || !passphrase.trim()) {
    throw new JournalCryptoError("Passphrase must be a non-empty string.");
  }

  const cryptoInstance = getCrypto();
  const salt = cryptoInstance.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const iv = cryptoInstance.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));

  const key = await deriveEncryptionKey(passphrase, salt, PBKDF2_ITERATIONS, ["encrypt"]);

  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  const ciphertextBuffer = await cryptoInstance.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintextBytes
  );

  const ciphertextBytes = new Uint8Array(ciphertextBuffer);

  return {
    ciphertext: uint8ArrayToBase64(ciphertextBytes),
    iv: uint8ArrayToBase64(iv),
    salt: uint8ArrayToBase64(salt),
    iterations: PBKDF2_ITERATIONS,
    algorithm: "AES-GCM",
  };
}

/**
 * Decrypts an encrypted journal payload using AES-256-GCM with the student's passphrase.
 * Throws JournalCryptoError if passphrase is incorrect or data is tampered.
 */
export async function decryptJournal(
  payload: EncryptedJournalPayload,
  passphrase: string
): Promise<string> {
  if (!payload || typeof payload !== "object") {
    throw new JournalCryptoError("Encrypted payload must be an object.");
  }
  if (!payload.ciphertext || !payload.iv || !payload.salt) {
    throw new JournalCryptoError(
      "Missing required fields: ciphertext, iv, and salt are all required."
    );
  }
  if (!passphrase || typeof passphrase !== "string" || !passphrase.trim()) {
    throw new JournalCryptoError("Passphrase must be a non-empty string.");
  }

  const cryptoInstance = getCrypto();
  const salt = base64ToUint8Array(payload.salt);
  const iv = base64ToUint8Array(payload.iv);
  const ciphertext = base64ToUint8Array(payload.ciphertext);
  const iterations = payload.iterations || PBKDF2_ITERATIONS;

  const key = await deriveEncryptionKey(passphrase, salt, iterations, ["decrypt"]);

  try {
    const decryptedBuffer = await cryptoInstance.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    throw new JournalCryptoError(
      "Failed to decrypt journal entry: Invalid passphrase or corrupted data.",
      err
    );
  }
}

/**
 * Safe alphanumeric character set for recovery codes.
 * Excludes ambiguous visual characters (0, O, 1, I, L) to avoid transcription errors.
 */
const RECOVERY_CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Generates a cryptographically secure 16-character recovery code grouped in 4 blocks
 * (e.g., "ABCD-EFGH-JKMN-PQRS").
 */
export function generateRecoveryCode(): string {
  const cryptoInstance = getCrypto();
  const randomBytes = cryptoInstance.getRandomValues(new Uint8Array(16));
  const chars: string[] = [];

  for (let i = 0; i < 16; i++) {
    const index = randomBytes[i] % RECOVERY_CODE_CHARS.length;
    chars.push(RECOVERY_CODE_CHARS[index]);
  }

  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}`;
}

/**
 * Validates whether a recovery code conforms to the expected 4x4 alphanumeric pattern.
 */
export function validateRecoveryCode(code: string): boolean {
  if (typeof code !== "string") return false;
  const clean = code.trim().toUpperCase();
  return /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/.test(
    clean
  );
}

const journalCrypto = {
  encryptJournal,
  decryptJournal,
  generateRecoveryCode,
  validateRecoveryCode,
  uint8ArrayToBase64,
  base64ToUint8Array,
  PBKDF2_ITERATIONS,
  JournalCryptoError,
};

export default journalCrypto;
