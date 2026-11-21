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

export const EmergencyContactSchema = z.object({
  name: z.string(),
  relationship: z.string(),
  phone: z.string(),
});
export type EmergencyContact = z.infer<typeof EmergencyContactSchema>;

export const ProfessionalSupportSchema = z.object({
  name: z.string(),
  role: z.string(),
  phone: z.string(),
});
export type ProfessionalSupport = z.infer<typeof ProfessionalSupportSchema>;

export const SafetyPlanSchema = z.object({
  warningSigns: z.array(z.string()).default([]),
  copingStrategies: z.array(z.string()).default([]),
  emergencyContacts: z.array(EmergencyContactSchema).default([]),
  safeEnvironments: z.array(z.string()).default([]),
  reasonsToLive: z.array(z.string()).default([]),
  professionalSupport: z.array(ProfessionalSupportSchema).default([]),
  isEncrypted: z.boolean().optional(),
});
export type SafetyPlan = z.infer<typeof SafetyPlanSchema>;

export interface EncryptedSafetyPlanEnvelope {
  _isEncrypted: true;
  ciphertext: string;
  iv: string;
  salt: string;
}

/**
 * Encrypts a full Stanley-Brown safety plan using AES-256-GCM.
 */
export async function encryptSafetyPlan(
  plan: SafetyPlan,
  passphrase: string,
): Promise<EncryptedSafetyPlanEnvelope> {
  const json = JSON.stringify(plan);
  const encrypted: EncryptedJournalPayload = await encryptJournal(json, passphrase);
  return {
    _isEncrypted: true,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    salt: encrypted.salt,
  };
}

/**
 * Decrypts a full safety plan from an encrypted envelope.
 */
export async function decryptSafetyPlan(
  envelope: EncryptedSafetyPlanEnvelope,
  passphrase: string,
): Promise<SafetyPlan> {
  try {
    const json = await decryptJournal(
      {
        ciphertext: envelope.ciphertext,
        iv: envelope.iv,
        salt: envelope.salt,
      },
      passphrase,
    );
    const parsed = JSON.parse(json);
    return SafetyPlanSchema.parse({ ...parsed, isEncrypted: false });
  } catch (err) {
    if (err instanceof JournalCryptoError) {
      throw new ApiError("Failed to decrypt safety plan: incorrect passphrase.", 401, "CRYPTO_DECRYPT_FAILED");
    }
    throw new ApiError(
      `Safety plan decryption failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      500,
      "CRYPTO_ERROR",
    );
  }
}

/**
 * Fetches the student's safety plan.
 * If encrypted and passphrase is provided, decrypts client-side.
 */
export async function fetchSafetyPlan(passphrase?: string): Promise<SafetyPlan | null> {
  const { user } = await getAuthenticatedSession();

  const { data, error } = await supabase
    .from("safety_plans")
    .select("*")
    .eq("student_id", user.id)
    .maybeSingle();

  if (error) {
    throw new ApiError(error.message, 500, error.code, { original: error });
  }

  if (!data) {
    return null;
  }

  // Check if encrypted envelope is stored in professional_support or metadata
  const profSupport = data.professional_support;
  if (profSupport && typeof profSupport === "object" && "_isEncrypted" in profSupport) {
    const envelope = profSupport as unknown as EncryptedSafetyPlanEnvelope;
    if (passphrase) {
      return await decryptSafetyPlan(envelope, passphrase);
    }
    return {
      warningSigns: ["[Encrypted - passphrase required]"],
      copingStrategies: ["[Encrypted - passphrase required]"],
      emergencyContacts: [],
      safeEnvironments: ["[Encrypted - passphrase required]"],
      reasonsToLive: ["[Encrypted - passphrase required]"],
      professionalSupport: [],
      isEncrypted: true,
    };
  }

  return {
    warningSigns: data.warning_signs ?? [],
    copingStrategies: data.coping_strategies ?? [],
    emergencyContacts: Array.isArray(data.emergency_contacts)
      ? (data.emergency_contacts as EmergencyContact[])
      : [],
    safeEnvironments: data.safe_environments ?? [],
    reasonsToLive: data.reasons_to_live ?? [],
    professionalSupport: Array.isArray(data.professional_support)
      ? (data.professional_support as ProfessionalSupport[])
      : [],
    isEncrypted: false,
  };
}

/**
 * Saves or updates student safety plan.
 * If passphrase is provided, encrypts the entire plan with zero-knowledge AES-256-GCM.
 */
export async function saveSafetyPlan(
  plan: SafetyPlan,
  passphrase?: string,
): Promise<SafetyPlan> {
  const validated = SafetyPlanSchema.safeParse(plan);
  if (!validated.success) {
    throw new ValidationError("Invalid safety plan payload", { issues: validated.error.issues });
  }

  const { user } = await getAuthenticatedSession();

  let dbPayload: {
    student_id: string;
    warning_signs: string[];
    coping_strategies: string[];
    emergency_contacts: EmergencyContact[];
    safe_environments: string[];
    reasons_to_live: string[];
    professional_support: unknown;
    updated_at: string;
  };

  if (passphrase) {
    const envelope = await encryptSafetyPlan(validated.data, passphrase);
    dbPayload = {
      student_id: user.id,
      warning_signs: ["_encrypted_payload_"],
      coping_strategies: [],
      emergency_contacts: [],
      safe_environments: [],
      reasons_to_live: [],
      professional_support: envelope as unknown,
      updated_at: new Date().toISOString(),
    };
  } else {
    dbPayload = {
      student_id: user.id,
      warning_signs: validated.data.warningSigns,
      coping_strategies: validated.data.copingStrategies,
      emergency_contacts: validated.data.emergencyContacts,
      safe_environments: validated.data.safeEnvironments,
      reasons_to_live: validated.data.reasonsToLive,
      professional_support: validated.data.professionalSupport,
      updated_at: new Date().toISOString(),
    };
  }

  const { error } = await supabase
    .from("safety_plans")
    .upsert(dbPayload, { onConflict: "student_id" });

  if (error) {
    throw new ApiError(error.message, 500, error.code, { original: error });
  }

  return {
    ...validated.data,
    isEncrypted: Boolean(passphrase),
  };
}

export function useSafetyPlan(passphrase?: string) {
  return useQuery({
    queryKey: ["safety_plan", passphrase ? "decrypted" : "raw"],
    queryFn: () => fetchSafetyPlan(passphrase),
  });
}

export function useUpdateSafetyPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ plan, passphrase }: { plan: SafetyPlan; passphrase?: string }) =>
      saveSafetyPlan(plan, passphrase),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["safety_plan"] });
    },
  });
}
