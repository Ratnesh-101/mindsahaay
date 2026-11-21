import { z } from "zod";
import { supabase } from "../../shared/lib/supabase";
import { getAuthenticatedSession } from "../../shared/lib/api/sessionHelper";
import { ApiError } from "../../shared/lib/api/errors";
import { callFunction } from "../doctors/http";

export const DEFAULT_K = 10;

const num = z.coerce.number();

export const AnalyticsSchema = z.object({
  institutionId: z.string().optional(),
  kAnonymityThreshold: z.number().optional(),
  complianceFramework: z.string().optional(),
  privacyGuarantee: z.string().optional(),
  assessmentAggregates: z
    .array(
      z.object({
        instrument: z.string(),
        severity: z.string(),
        report_month: z.string(),
        sample_size: num,
        mean_score: num.nullable().optional(),
        crisis_indicators: num.nullable().optional(),
      }),
    )
    .default([]),
  moodAggregates: z
    .array(
      z.object({
        mood: z.string(),
        report_week: z.string(),
        sample_size: num,
        avg_intensity: num.nullable().optional(),
      }),
    )
    .default([]),
  riskAggregates: z
    .array(
      z.object({
        severity_level: z.string(),
        report_month: z.string(),
        incident_count: num,
      }),
    )
    .default([]),
});
export type Analytics = z.infer<typeof AnalyticsSchema>;

/** GET /institutions/:id/analytics. The server only returns groups with k >= 10. */
export async function fetchAnalytics(institutionId: string): Promise<Analytics> {
  const raw = await callFunction<unknown>("GET", `/institutions/${encodeURIComponent(institutionId)}/analytics`);
  const parsed = AnalyticsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("Unexpected analytics response.", 502, "BAD_RESPONSE");
  }
  return parsed.data;
}

/** The signed-in admin's own institution id (profiles RLS lets users read their own row). */
export async function fetchMyInstitutionId(): Promise<string | null> {
  const { user } = await getAuthenticatedSession();
  const { data, error } = await supabase.from("profiles").select("institution_id").eq("id", user.id).maybeSingle();
  if (error) throw new ApiError(error.message, 500, error.code);
  return ((data as { institution_id?: string | null } | null)?.institution_id ?? null) as string | null;
}
