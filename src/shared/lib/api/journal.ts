import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { getAuthenticatedSession } from "./sessionHelper";
import { ApiError, ValidationError } from "./errors";
import {
  encryptJournal,
  decryptJournal,
  JournalCryptoError,
  type EncryptedJournalPayload,
} from "../../../domain/crypto/journalCrypto";

export const JournalInputSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content cannot be empty"),
  mood: z.string().optional().default(""),
  prompt: z.string().optional().default(""),
  passphrase: z.string().min(1, "Passphrase is required for zero-knowledge encryption"),
});
export type JournalInput = z.input<typeof JournalInputSchema>;

export const DecryptedJournalEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  mood: z.string(),
  prompt: z.string(),
  createdAt: z.string(),
  isEncrypted: z.boolean().optional(),
});
export type DecryptedJournalEntry = z.infer<typeof DecryptedJournalEntrySchema>;

export const EncryptedJournalRowSchema = z.object({
  id: z.string(),
  student_id: z.string().optional(),
  ciphertext: z.string(),
  iv: z.string(),
  salt: z.string(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});
export type EncryptedJournalRow = z.infer<typeof EncryptedJournalRowSchema>;

/**
 * Saves a new journal entry:
 * Pure client-side zero-knowledge encryption using AES-256-GCM + PBKDF2 (600,000 iterations).
 * The server only receives and stores ciphertext, iv, and salt.
 */
export async function saveJournal(input: JournalInput): Promise<DecryptedJournalEntry> {
  const validated = JournalInputSchema.safeParse(input);
  if (!validated.success) {
    throw new ValidationError("Invalid journal payload", { issues: validated.error.issues });
  }

  const { user } = await getAuthenticatedSession();

  const payloadToEncrypt = JSON.stringify({
    title: validated.data.title,
    content: validated.data.content,
    mood: validated.data.mood,
    prompt: validated.data.prompt,
  });

  let encrypted: EncryptedJournalPayload;
  try {
    encrypted = await encryptJournal(payloadToEncrypt, validated.data.passphrase);
  } catch (err) {
    throw new ApiError(
      `Zero-knowledge encryption failed: ${err instanceof Error ? err.message : "Unknown crypto error"}`,
      500,
      "CRYPTO_ERROR",
    );
  }

  const { data, error } = await supabase
    .from("journal_entries")
    .insert({
      student_id: user.id,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      salt: encrypted.salt,
    })
    .select()
    .single();

  if (error) {
    throw new ApiError(error.message, 500, error.code, { original: error });
  }

  return {
    id: data.id,
    title: validated.data.title,
    content: validated.data.content,
    mood: validated.data.mood,
    prompt: validated.data.prompt,
    createdAt: data.created_at,
    isEncrypted: false,
  };
}

/**
 * Retrieves and decrypts journal entries using the student's passphrase.
 * If no passphrase is provided, metadata is returned with locked placeholder content.
 */
export async function fetchJournals(passphrase?: string): Promise<DecryptedJournalEntry[]> {
  await getAuthenticatedSession();

  const { data, error } = await supabase
    .from("journal_entries")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError(error.message, 500, error.code, { original: error });
  }

  const rows = data ?? [];
  const decryptedList: DecryptedJournalEntry[] = [];

  for (const row of rows) {
    if (!passphrase) {
      decryptedList.push({
        id: row.id,
        title: "Encrypted Entry",
        content: "[Passphrase required to decrypt]",
        mood: "",
        prompt: "",
        createdAt: row.created_at,
        isEncrypted: true,
      });
      continue;
    }

    try {
      const plaintext = await decryptJournal(
        {
          ciphertext: row.ciphertext,
          iv: row.iv,
          salt: row.salt,
        },
        passphrase,
      );

      const parsedJson = JSON.parse(plaintext);
      decryptedList.push({
        id: row.id,
        title: parsedJson.title || "Untitled",
        content: parsedJson.content || "",
        mood: parsedJson.mood || "",
        prompt: parsedJson.prompt || "",
        createdAt: row.created_at,
        isEncrypted: false,
      });
    } catch (err) {
      if (err instanceof JournalCryptoError) {
        throw new ApiError("Failed to decrypt journal entries. Incorrect passphrase.", 401, "CRYPTO_DECRYPT_FAILED");
      }
      throw new ApiError(
        `Decryption error: ${err instanceof Error ? err.message : "Unknown error"}`,
        500,
        "CRYPTO_ERROR",
      );
    }
  }

  return decryptedList;
}

export async function deleteJournal(id: string): Promise<{ success: boolean; id: string }> {
  await getAuthenticatedSession();

  const { error } = await supabase.from("journal_entries").delete().eq("id", id);
  if (error) {
    throw new ApiError(error.message, 500, error.code, { original: error });
  }

  return { success: true, id };
}

export function useJournals(passphrase?: string) {
  return useQuery({
    queryKey: ["journals", passphrase ? "decrypted" : "locked"],
    queryFn: () => fetchJournals(passphrase),
  });
}

export function useSaveJournal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: JournalInput) => saveJournal(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journals"] });
    },
  });
}

export function useDeleteJournal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteJournal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journals"] });
    },
  });
}
