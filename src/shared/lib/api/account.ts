import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, getFunctionUrl } from "../supabase";
import { getAuthenticatedSession } from "./sessionHelper";
import { ApiError, ValidationError } from "./errors";

export const ExportMetadataSchema = z.object({
  platform: z.string(),
  exportedAt: z.string(),
  regulations: z.string(),
  studentId: z.string(),
});
export type ExportMetadata = z.infer<typeof ExportMetadataSchema>;

export const DataPortabilityExportSchema = z.object({
  metadata: ExportMetadataSchema,
  profile: z.record(z.string(), z.unknown()).nullable(),
  consents: z.array(z.record(z.string(), z.unknown())).default([]),
  moods: z.array(z.record(z.string(), z.unknown())).default([]),
  assessments: z.array(z.record(z.string(), z.unknown())).default([]),
  journals: z.array(z.record(z.string(), z.unknown())).default([]),
  safetyPlan: z.record(z.string(), z.unknown()).nullable().optional(),
  appointments: z.array(z.record(z.string(), z.unknown())).default([]),
});
export type DataPortabilityExport = z.infer<typeof DataPortabilityExportSchema>;

export const DeleteAccountResultSchema = z.object({
  success: z.boolean(),
  erasedAt: z.string(),
});
export type DeleteAccountResult = z.infer<typeof DeleteAccountResultSchema>;

/**
 * Downloads / retrieves a complete, machine-readable JSON archive of all student health records.
 * Compliant with India DPDP Act 2023 Right to Information & Data Portability.
 */
export async function exportStudentData(): Promise<DataPortabilityExport> {
  const { session, user } = await getAuthenticatedSession();

  const edgeUrl = getFunctionUrl("/me/export");
  try {
    const res = await fetch(edgeUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (res.ok) {
      const json = await res.json();
      const parsed = DataPortabilityExportSchema.safeParse(json);
      if (parsed.success) {
        return parsed.data;
      }
    }
  } catch {
    // Edge function unreachable; fallback to direct aggregation
  }

  // Aggregate user records directly across Supabase tables
  const [profileRes, consentsRes, moodsRes, assessmentsRes, journalsRes, safetyPlanRes, appointmentsRes] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("consents").select("*").eq("student_id", user.id),
      supabase.from("mood_entries").select("*").eq("student_id", user.id),
      supabase.from("assessments").select("*").eq("student_id", user.id),
      supabase.from("journal_entries").select("*").eq("student_id", user.id),
      supabase.from("safety_plans").select("*").eq("student_id", user.id).maybeSingle(),
      supabase.from("appointments").select("*").eq("student_id", user.id),
    ]);

  // A failed read must never become an empty section in a "complete" export (the student would think
  // that data does not exist), so any query error fails the whole export.
  const failed = [profileRes, consentsRes, moodsRes, assessmentsRes, journalsRes, safetyPlanRes, appointmentsRes].find(
    (res) => res.error,
  );
  if (failed?.error) {
    throw new ApiError(`Data export failed: ${failed.error.message}`, 500, failed.error.code, { original: failed.error });
  }

  const exportPayload: DataPortabilityExport = {
    metadata: {
      platform: "MindSahaay Student Wellbeing",
      exportedAt: new Date().toISOString(),
      regulations: "India DPDP Act 2023 & Mental Healthcare Act 2017",
      studentId: user.id,
    },
    profile: profileRes.data ?? null,
    consents: consentsRes.data ?? [],
    moods: moodsRes.data ?? [],
    assessments: assessmentsRes.data ?? [],
    journals: journalsRes.data ?? [],
    safetyPlan: safetyPlanRes.data ?? null,
    appointments: appointmentsRes.data ?? [],
  };

  const parsed = DataPortabilityExportSchema.safeParse(exportPayload);
  if (!parsed.success) {
    throw new ValidationError("Failed to construct valid data portability export", {
      issues: parsed.error.issues,
    });
  }

  return parsed.data;
}

/**
 * Permanently erases all student profile records, encrypted journals, moods, assessments,
 * and appointments under the DPDP Act 2023 Right to Erasure / Right to be Forgotten.
 */
export async function deleteStudentAccount(): Promise<DeleteAccountResult> {
  const { session, user } = await getAuthenticatedSession();

  const edgeUrl = getFunctionUrl("/me");
  try {
    await fetch(edgeUrl, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  } catch {
    // Edge function unreachable, proceed with database deletion cascade
  }

  // Deleting the profile row triggers PostgreSQL ON DELETE CASCADE on all related tables
  const { error } = await supabase.from("profiles").delete().eq("id", user.id);
  if (error) {
    throw new ApiError(
      `Account deletion failed: ${error.message}`,
      500,
      error.code,
      { original: error },
    );
  }

  // Sign out from Supabase Auth session
  await supabase.auth.signOut();

  return {
    success: true,
    erasedAt: new Date().toISOString(),
  };
}

/**
 * Saves the display name / alias on the student's own profile row. Resolves only after the backend
 * confirmed that exactly the signed-in student's row was updated.
 */
export async function updateStudentAlias(alias: string): Promise<string> {
  const clean = alias.trim().slice(0, 40);
  if (!clean) {
    throw new ValidationError("Alias cannot be empty");
  }
  const { user } = await getAuthenticatedSession();
  const { data, error } = await supabase.from("profiles").update({ alias: clean }).eq("id", user.id).select("id");
  if (error) {
    throw new ApiError(error.message, 500, error.code, { original: error });
  }
  if (!data || data.length === 0) {
    throw new ApiError("Profile not found, so the display name was not saved.", 404, "PROFILE_NOT_FOUND");
  }
  return clean;
}

export function useExportData() {
  return useMutation({
    mutationFn: () => exportStudentData(),
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteStudentAccount(),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
