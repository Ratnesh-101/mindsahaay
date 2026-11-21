import { z } from "zod";
import { supabase } from "../../shared/lib/supabase";
import { getAuthenticatedSession } from "../../shared/lib/api/sessionHelper";
import { ApiError, ValidationError } from "../../shared/lib/api/errors";
import { decryptJournal, encryptJournal } from "../../domain/crypto/journalCrypto";

export const DISTORTION_KEYS = [
  "allOrNothing",
  "catastrophising",
  "mindReading",
  "fortuneTelling",
  "emotionalReasoning",
  "shouldStatements",
  "labelling",
  "personalisation",
  "overgeneralising",
  "mentalFilter",
] as const;
export type DistortionKey = (typeof DISTORTION_KEYS)[number];

export const ThoughtRecordInputSchema = z.object({
  situation: z.string().trim().min(1),
  automaticThought: z.string().trim().min(1),
  emotion: z.string().default(""),
  intensityBefore: z.number().min(0).max(100).default(50),
  distortions: z.array(z.enum(DISTORTION_KEYS)).default([]),
  evidenceFor: z.string().default(""),
  evidenceAgainst: z.string().default(""),
  balancedThought: z.string().trim().min(1),
  intensityAfter: z.number().min(0).max(100).default(50),
});
export type ThoughtRecordInput = z.input<typeof ThoughtRecordInputSchema>;
export type ThoughtRecordContent = z.infer<typeof ThoughtRecordInputSchema>;

export interface ThoughtRecord extends ThoughtRecordContent {
  id: string;
  createdAt: string;
}

/**
 * Encrypts the thought record in the browser (AES-GCM, key from the vault passphrase) and stores
 * only ciphertext, iv and salt. Counsellors and admins have no access (RLS), and the server could not read it anyway.
 */
export async function saveThoughtRecord(input: ThoughtRecordInput, passphrase: string): Promise<ThoughtRecord> {
  const parsed = ThoughtRecordInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid thought record", { issues: parsed.error.issues });
  }
  const { user } = await getAuthenticatedSession();
  const encrypted = await encryptJournal(JSON.stringify(parsed.data), passphrase);
  const { data, error } = await supabase
    .from("thought_records")
    .insert({ student_id: user.id, ciphertext: encrypted.ciphertext, iv: encrypted.iv, salt: encrypted.salt })
    .select()
    .single();
  if (error) {
    throw new ApiError(error.message, 500, error.code);
  }
  return { ...parsed.data, id: data.id, createdAt: data.created_at };
}

export async function fetchThoughtRecords(passphrase: string): Promise<ThoughtRecord[]> {
  await getAuthenticatedSession();
  const { data, error } = await supabase
    .from("thought_records")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    throw new ApiError(error.message, 500, error.code);
  }
  const records: ThoughtRecord[] = [];
  for (const row of data ?? []) {
    try {
      const plain = await decryptJournal({ ciphertext: row.ciphertext, iv: row.iv, salt: row.salt }, passphrase);
      const parsed = ThoughtRecordInputSchema.parse(JSON.parse(plain));
      records.push({ ...parsed, id: row.id, createdAt: row.created_at });
    } catch {
      throw new ApiError("Failed to decrypt thought records. Incorrect passphrase.", 401, "CRYPTO_DECRYPT_FAILED");
    }
  }
  return records;
}

export async function deleteThoughtRecord(id: string): Promise<void> {
  await getAuthenticatedSession();
  const { error } = await supabase.from("thought_records").delete().eq("id", id);
  if (error) {
    throw new ApiError(error.message, 500, error.code);
  }
}
