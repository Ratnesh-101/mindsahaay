import { useSyncExternalStore } from "react";
import { z } from "zod";
import { supabase } from "../../shared/lib/supabase";
import { getAuthenticatedSession } from "../../shared/lib/api/sessionHelper";
import { ApiError } from "../../shared/lib/api/errors";
import {
  encryptJournal,
  decryptJournal,
  generateRecoveryCode,
  validateRecoveryCode,
  JournalCryptoError,
} from "../../domain/crypto/journalCrypto";
import { isDemoModeActive } from "../auth/demoMode";
import { clearChatKeys } from "../chat/chatCrypto";
import { migrateSensitiveStorage } from "../../shared/lib/storage/secureStore";

/**
 * Journal vault: the passphrase never leaves the browser and is held in memory only.
 * To prove a passphrase is correct before any entry exists, and to allow recovery, the vault
 * stores two ciphertext blobs in the user's auth metadata:
 *   check    = encrypt(SENTINEL, passphrase)
 *   recovery = encrypt(passphrase, recoveryCode)
 * The server therefore sees only ciphertext. Losing both the passphrase and the recovery code
 * makes the entries unreadable for everyone, including MindSahaay.
 */
export const VAULT_SENTINEL = "mindsahaay-vault-v1";
export const MIN_PASSPHRASE_LENGTH = 8;

const payloadSchema = z.object({
  ciphertext: z.string(),
  iv: z.string(),
  salt: z.string(),
  iterations: z.number().optional(),
  algorithm: z.string().optional(),
});

const metaSchema = z.object({
  v: z.literal(1),
  check: payloadSchema,
  recovery: payloadSchema,
});
export type VaultMeta = z.infer<typeof metaSchema>;

let currentPassphrase: string | null = null;
let demoVaultMeta: VaultMeta | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVaultPassphrase(): string | null {
  return currentPassphrase;
}

export function lockVault(): void {
  currentPassphrase = null;
  clearChatKeys();
  emit();
}

export function clearVaultState(): void {
  currentPassphrase = null;
  clearChatKeys();
  demoVaultMeta = null;
  emit();
}

/** React hook: the in-memory passphrase, or null while the vault is locked. */
export function useVaultPassphrase(): string | null {
  return useSyncExternalStore(subscribe, getVaultPassphrase, getVaultPassphrase);
}

export function normaliseRecoveryCode(code: string): string {
  return code.trim().toUpperCase();
}

export { generateRecoveryCode, validateRecoveryCode };

/** Reads the vault metadata from the signed-in user's auth profile. Returns null if no vault exists yet. */
export async function readVaultMeta(): Promise<VaultMeta | null> {
  if (isDemoModeActive()) {
    try {
      const stored = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("mindsahaay_demo_vault_meta") : null;
      if (stored) {
        const parsed = metaSchema.safeParse(JSON.parse(stored));
        if (parsed.success) return parsed.data;
      }
    } catch {
      // ignore
    }
    return demoVaultMeta;
  }

  const { user } = await getAuthenticatedSession();
  let metadata: Record<string, unknown> | undefined = user.user_metadata;
  try {
    const fresh = await supabase.auth.getUser();
    if (fresh.data?.user?.user_metadata) metadata = fresh.data.user.user_metadata;
  } catch {
    // fall back to the session copy
  }
  const parsed = metaSchema.safeParse(metadata?.journal_vault);
  return parsed.success ? parsed.data : null;
}

/** Creates the vault: stores the check and recovery blobs, then unlocks it for this tab. */
export async function createVault(passphrase: string, recoveryCode: string): Promise<void> {
  if (passphrase.trim().length < MIN_PASSPHRASE_LENGTH) {
    throw new ApiError(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`, 422, "WEAK_PASSPHRASE");
  }
  if (!validateRecoveryCode(recoveryCode)) {
    throw new ApiError("Invalid recovery code.", 422, "INVALID_RECOVERY_CODE");
  }

  const check = await encryptJournal(VAULT_SENTINEL, passphrase);
  const recovery = await encryptJournal(passphrase, normaliseRecoveryCode(recoveryCode));
  const newMeta: VaultMeta = { v: 1, check, recovery };

  if (isDemoModeActive()) {
    demoVaultMeta = newMeta;
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem("mindsahaay_demo_vault_meta", JSON.stringify(newMeta));
      }
    } catch {
      // ignore
    }
    try {
      await migrateSensitiveStorage(passphrase);
    } catch {
      // ignore
    }
    currentPassphrase = passphrase;
    emit();
    return;
  }

  await getAuthenticatedSession();
  const { error } = await supabase.auth.updateUser({ data: { journal_vault: newMeta } });
  if (error) {
    throw new ApiError(error.message, 500, "VAULT_SAVE_FAILED");
  }
  try {
    await migrateSensitiveStorage(passphrase);
  } catch {
    // ignore
  }
  currentPassphrase = passphrase;
  emit();
}

/** Verifies the passphrase against the check blob and unlocks the vault. */
export async function unlockVault(passphrase: string, meta: VaultMeta): Promise<void> {
  try {
    const sentinel = await decryptJournal(meta.check, passphrase);
    if (sentinel !== VAULT_SENTINEL) throw new JournalCryptoError("Sentinel mismatch");
  } catch {
    throw new ApiError("Incorrect passphrase.", 401, "WRONG_PASSPHRASE");
  }
  try {
    await migrateSensitiveStorage(passphrase);
  } catch {
    // ignore
  }
  currentPassphrase = passphrase;
  emit();
}

/** Unlocks the vault with the recovery code. Returns the recovered passphrase so the student can note it. */
export async function recoverVault(code: string, meta: VaultMeta): Promise<string> {
  if (!validateRecoveryCode(code)) {
    throw new ApiError("That recovery code is not in the expected format.", 422, "INVALID_RECOVERY_CODE");
  }
  let recovered: string;
  try {
    recovered = await decryptJournal(meta.recovery, normaliseRecoveryCode(code));
  } catch {
    throw new ApiError("Incorrect recovery code.", 401, "WRONG_RECOVERY_CODE");
  }
  await unlockVault(recovered, meta);
  return recovered;
}
