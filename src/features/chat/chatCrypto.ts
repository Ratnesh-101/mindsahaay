/**
 * Chat message encryption. One non-extractable AES-GCM key per saved conversation, derived from the
 * vault passphrase and a random per-session salt. Each message has a fresh 12-byte IV and binds
 * `${sessionId}|${senderRole}|${seq}` as AAD, so rows cannot be swapped between positions or sessions.
 * Kept free of vault/supabase imports so vault.ts can clear the key cache without an import cycle.
 */
import {
  deriveEncryptionKey,
  base64ToUint8Array,
  uint8ArrayToBase64,
  IV_BYTE_LENGTH,
  SALT_BYTE_LENGTH,
  JournalCryptoError,
} from "../../domain/crypto/journalCrypto";

export type ChatRole = "user" | "assistant";

const keyCache = new Map<string, Promise<CryptoKey>>();

/** Drops every cached session key. Called when the vault locks or is cleared. */
export function clearChatKeys(): void {
  keyCache.clear();
}

export function generateSessionSalt(): string {
  return uint8ArrayToBase64(globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH)));
}

/** Returns the cached key for a session, deriving it on first use. */
export function getSessionKey(sessionId: string, passphrase: string, saltB64: string): Promise<CryptoKey> {
  let pending = keyCache.get(sessionId);
  if (!pending) {
    pending = deriveEncryptionKey(passphrase, base64ToUint8Array(saltB64));
    keyCache.set(sessionId, pending);
    pending.catch(() => {
      if (keyCache.get(sessionId) === pending) keyCache.delete(sessionId);
    });
  }
  return pending;
}

function aad(sessionId: string, role: ChatRole, seq: number): BufferSource {
  return new TextEncoder().encode(`${sessionId}|${role}|${seq}`) as BufferSource;
}

export async function encryptChatMessage(
  key: CryptoKey,
  sessionId: string,
  role: ChatRole,
  seq: number,
  text: string,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
  const buf = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(sessionId, role, seq) },
    key,
    new TextEncoder().encode(text),
  );
  return { ciphertext: uint8ArrayToBase64(new Uint8Array(buf)), iv: uint8ArrayToBase64(iv) };
}

export async function decryptChatMessage(
  key: CryptoKey,
  sessionId: string,
  role: ChatRole,
  seq: number,
  ciphertext: string,
  iv: string,
): Promise<string> {
  try {
    const buf = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToUint8Array(iv) as BufferSource, additionalData: aad(sessionId, role, seq) },
      key,
      base64ToUint8Array(ciphertext) as BufferSource,
    );
    return new TextDecoder().decode(buf);
  } catch (err) {
    throw new JournalCryptoError("Could not decrypt chat message: wrong passphrase or tampered data.", err);
  }
}
