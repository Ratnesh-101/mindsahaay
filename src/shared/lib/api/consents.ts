import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { getAuthenticatedSession } from "./sessionHelper";
import { ApiError, ValidationError } from "./errors";

export const ConsentPurposeSchema = z.enum([
  "data_processing",
  "crisis_intervention",
  "analytics",
  "counsellor_sharing",
  "peer_support",
  "research",
]);
export type ConsentPurpose = z.infer<typeof ConsentPurposeSchema>;

export const ConsentRecordSchema = z.object({
  id: z.string(),
  student_id: z.string(),
  purpose: ConsentPurposeSchema,
  consented: z.boolean(),
  policy_version: z.string(),
  ip_hash: z.string().nullable().optional(),
  user_agent_hash: z.string().nullable().optional(),
  granted_at: z.string(),
  revoked_at: z.string().nullable().optional(),
});
export type ConsentRecord = z.infer<typeof ConsentRecordSchema>;

export const DEFAULT_POLICY_VERSION = "2023.1-DPDP";

/**
 * Keeps the offline crisis-consent cache (used to queue a crisis event while offline) in step with
 * the ledger. Imported lazily because features/chat/api imports this module. Never throws.
 *  - Withdrawal writes `false` at once, before any network call, so a device that is offline
 *    right now cannot keep acting on a consent the student has withdrawn.
 *  - Grant (and a follow-up after withdrawal) refreshes the cache from the ledger.
 */
async function syncCrisisConsentCache(userId: string, granted: boolean): Promise<void> {
  try {
    const chatApi = await import("../../../features/chat/api");
    if (!granted) chatApi.setCachedCrisisConsent(userId, false);
    void chatApi.warmCrisisConsentCache().catch(() => undefined);
  } catch {
    // Best effort: a cache problem must never fail the consent change itself.
  }
}

/**
 * Retrieves the complete immutable append-only consent ledger for the active student.
 */
export async function fetchConsentLedger(): Promise<ConsentRecord[]> {
  await getAuthenticatedSession();

  const { data, error } = await supabase
    .from("consents")
    .select("*")
    .order("granted_at", { ascending: false });

  if (error) {
    throw new ApiError(error.message, 500, error.code, { original: error });
  }

  const parsed = z.array(ConsentRecordSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new ValidationError("Failed to parse consent ledger entries", { issues: parsed.error.issues });
  }

  return parsed.data;
}

/**
 * Computes active consent status for every purpose based on the latest append-only entry.
 */
export async function fetchActiveConsents(): Promise<Record<ConsentPurpose, boolean>> {
  const ledger = await fetchConsentLedger();

  const activeMap: Record<ConsentPurpose, boolean> = {
    data_processing: false,
    crisis_intervention: false,
    analytics: false,
    counsellor_sharing: false,
    peer_support: false,
    research: false,
  };

  // Group by purpose taking first occurrence (since ordered descending by granted_at)
  const seen = new Set<ConsentPurpose>();
  for (const record of ledger) {
    if (!seen.has(record.purpose)) {
      seen.add(record.purpose);
      activeMap[record.purpose] = record.consented && !record.revoked_at;
    }
  }

  return activeMap;
}

/**
 * Appends a positive consent grant to the immutable ledger.
 */
export async function grantConsent(
  purpose: ConsentPurpose,
  policyVersion: string = DEFAULT_POLICY_VERSION,
): Promise<ConsentRecord> {
  const validatedPurpose = ConsentPurposeSchema.safeParse(purpose);
  if (!validatedPurpose.success) {
    throw new ValidationError(`Invalid consent purpose: ${purpose}`);
  }

  const { user } = await getAuthenticatedSession();

  const { data, error } = await supabase
    .from("consents")
    .insert({
      student_id: user.id,
      purpose: validatedPurpose.data,
      consented: true,
      policy_version: policyVersion,
      granted_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new ApiError(error.message, 500, error.code, { original: error });
  }

  const parsed = ConsentRecordSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Failed to parse granted consent record", { issues: parsed.error.issues });
  }

  if (parsed.data.purpose === "crisis_intervention") await syncCrisisConsentCache(user.id, true);
  return parsed.data;
}

/**
 * Appends a revocation entry to the immutable ledger.
 * Note: Consents table is strictly append-only under DPDP Act requirements (no updates/deletes).
 */
export async function revokeConsent(
  purpose: ConsentPurpose,
  policyVersion: string = DEFAULT_POLICY_VERSION,
): Promise<ConsentRecord> {
  const validatedPurpose = ConsentPurposeSchema.safeParse(purpose);
  if (!validatedPurpose.success) {
    throw new ValidationError(`Invalid consent purpose: ${purpose}`);
  }

  const { user } = await getAuthenticatedSession();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("consents")
    .insert({
      student_id: user.id,
      purpose: validatedPurpose.data,
      consented: false,
      policy_version: policyVersion,
      granted_at: now,
      revoked_at: now,
    })
    .select()
    .single();

  if (error) {
    throw new ApiError(error.message, 500, error.code, { original: error });
  }

  const parsed = ConsentRecordSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Failed to parse revoked consent record", { issues: parsed.error.issues });
  }

  if (parsed.data.purpose === "crisis_intervention") await syncCrisisConsentCache(user.id, false);
  return parsed.data;
}

export function useConsents() {
  return useQuery({
    queryKey: ["consents", "ledger"],
    queryFn: () => fetchConsentLedger(),
  });
}

export function useActiveConsents() {
  return useQuery({
    queryKey: ["consents", "active"],
    queryFn: () => fetchActiveConsents(),
  });
}

export function useGrantConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      purpose,
      policyVersion,
    }: {
      purpose: ConsentPurpose;
      policyVersion?: string;
    }) => grantConsent(purpose, policyVersion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consents"] });
    },
  });
}

export function useRevokeConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      purpose,
      policyVersion,
    }: {
      purpose: ConsentPurpose;
      policyVersion?: string;
    }) => revokeConsent(purpose, policyVersion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consents"] });
    },
  });
}

