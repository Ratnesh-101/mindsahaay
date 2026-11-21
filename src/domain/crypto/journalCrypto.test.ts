import { describe, it, expect } from "vitest";
import {
  encryptJournal,
  decryptJournal,
  generateRecoveryCode,
  validateRecoveryCode,
  uint8ArrayToBase64,
  base64ToUint8Array,
  PBKDF2_ITERATIONS,
  JournalCryptoError,
  type EncryptedJournalPayload,
} from "./journalCrypto";

describe("Journal Cryptography Domain Logic (AES-256-GCM + PBKDF2)", () => {
  const passphrase = "student-super-secure-passphrase-2026!";
  const sampleEntry =
    "Today was really overwhelming with lab submissions and midsem preparation. Practiced 4-7-8 breathing.";

  describe("Encryption & Decryption Round-trip", () => {
    it("encrypts and decrypts journal text accurately", async () => {
      const encrypted = await encryptJournal(sampleEntry, passphrase);

      expect(encrypted.ciphertext).toBeTypeOf("string");
      expect(encrypted.iv).toBeTypeOf("string");
      expect(encrypted.salt).toBeTypeOf("string");
      expect(encrypted.iterations).toBe(PBKDF2_ITERATIONS);
      expect(encrypted.algorithm).toBe("AES-GCM");

      const decrypted = await decryptJournal(encrypted, passphrase);
      expect(decrypted).toBe(sampleEntry);
    });

    it("handles multilingual text and Unicode emojis properly", async () => {
      const unicodeText =
        "आज बहुत तनाव था लेकिन मैंने ध्यान लगाया। 🌸 Calm Mind & Peace 🌿";
      const encrypted = await encryptJournal(unicodeText, passphrase);
      const decrypted = await decryptJournal(encrypted, passphrase);

      expect(decrypted).toBe(unicodeText);
    });

    it("handles empty plaintext journal entry", async () => {
      const encrypted = await encryptJournal("", passphrase);
      const decrypted = await decryptJournal(encrypted, passphrase);
      expect(decrypted).toBe("");
    });
  });

  describe("Security, Tamper & Authentication Verification", () => {
    it("fails decryption when an incorrect passphrase is used", async () => {
      const encrypted = await encryptJournal(sampleEntry, passphrase);

      await expect(
        decryptJournal(encrypted, "wrong-password-attempt")
      ).rejects.toThrow(JournalCryptoError);
    });

    it("fails decryption when ciphertext is tampered with", async () => {
      const encrypted = await encryptJournal(sampleEntry, passphrase);

      // Tamper with the base64 ciphertext
      const tamperedBytes = base64ToUint8Array(encrypted.ciphertext);
      tamperedBytes[0] ^= 0xff; // Flip bits
      const tamperedPayload = {
        ...encrypted,
        ciphertext: uint8ArrayToBase64(tamperedBytes),
      };

      await expect(
        decryptJournal(tamperedPayload, passphrase)
      ).rejects.toThrow(JournalCryptoError);
    });

    it("fails decryption when IV is tampered with", async () => {
      const encrypted = await encryptJournal(sampleEntry, passphrase);

      const tamperedIvBytes = base64ToUint8Array(encrypted.iv);
      tamperedIvBytes[0] ^= 0x01;
      const tamperedPayload = {
        ...encrypted,
        iv: uint8ArrayToBase64(tamperedIvBytes),
      };

      await expect(
        decryptJournal(tamperedPayload, passphrase)
      ).rejects.toThrow(JournalCryptoError);
    });

    it("produces distinct ciphertexts and salts for identical plaintexts (IND-CPA)", async () => {
      const enc1 = await encryptJournal(sampleEntry, passphrase);
      const enc2 = await encryptJournal(sampleEntry, passphrase);

      expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
      expect(enc1.salt).not.toBe(enc2.salt);
      expect(enc1.iv).not.toBe(enc2.iv);

      // Both must still decrypt to the exact same plaintext
      expect(await decryptJournal(enc1, passphrase)).toBe(sampleEntry);
      expect(await decryptJournal(enc2, passphrase)).toBe(sampleEntry);
    });
  });

  describe("Input Validation & Error Handling", () => {
    it("rejects empty or whitespace-only passphrases", async () => {
      await expect(encryptJournal("Hello", "")).rejects.toThrow(
        JournalCryptoError
      );
      await expect(encryptJournal("Hello", "   ")).rejects.toThrow(
        JournalCryptoError
      );
    });

    it("rejects invalid payload structures on decryption", async () => {
      await expect(
        decryptJournal(null as unknown as EncryptedJournalPayload, passphrase)
      ).rejects.toThrow(JournalCryptoError);

      await expect(
        decryptJournal({} as unknown as EncryptedJournalPayload, passphrase)
      ).rejects.toThrow(JournalCryptoError);

      await expect(
        decryptJournal(
          { ciphertext: "abc", iv: "", salt: "def" } as unknown as EncryptedJournalPayload,
          passphrase
        )
      ).rejects.toThrow(JournalCryptoError);
    });
  });

  describe("Base64 Helpers", () => {
    it("correctly round-trips byte arrays to base64 and back", () => {
      const sampleBytes = new Uint8Array([0, 15, 240, 255, 42, 128, 99]);
      const base64 = uint8ArrayToBase64(sampleBytes);
      const decoded = base64ToUint8Array(base64);

      expect(Array.from(decoded)).toEqual(Array.from(sampleBytes));
    });

    it("throws JournalCryptoError on empty base64 string", () => {
      expect(() => base64ToUint8Array("")).toThrow(JournalCryptoError);
      expect(() => base64ToUint8Array("   ")).toThrow(JournalCryptoError);
    });
  });

  describe("Recovery Code Generation & Validation", () => {
    it("generates a valid 16-character recovery code in 4x4 format", () => {
      const code = generateRecoveryCode();

      expect(code).toMatch(
        /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/
      );
      expect(validateRecoveryCode(code)).toBe(true);
    });

    it("does not contain visually ambiguous characters (0, O, 1, I, L)", () => {
      for (let i = 0; i < 20; i++) {
        const code = generateRecoveryCode();
        expect(code).not.toMatch(/[01IOL]/);
      }
    });

    it("generates unique recovery codes across subsequent invocations", () => {
      const code1 = generateRecoveryCode();
      const code2 = generateRecoveryCode();
      expect(code1).not.toBe(code2);
    });

    it("validates valid codes and rejects malformed codes", () => {
      const valid = generateRecoveryCode();
      expect(validateRecoveryCode(valid)).toBe(true);

      expect(validateRecoveryCode("ABCD-EFGH-JKMN-PQRS")).toBe(true);
      expect(validateRecoveryCode("abcd-efgh-jkmn-pqrs")).toBe(true); // case-insensitive check
      expect(validateRecoveryCode("ABCD-EFGH-JKMN")).toBe(false); // too short
      expect(validateRecoveryCode("ABCDEFGHJKMNPQRS")).toBe(false); // missing hyphens
      expect(validateRecoveryCode("0000-1111-IIII-OOOO")).toBe(false); // forbidden chars
      expect(validateRecoveryCode("")).toBe(false);
      expect(validateRecoveryCode(null as unknown as string)).toBe(false);
    });
  });
});
