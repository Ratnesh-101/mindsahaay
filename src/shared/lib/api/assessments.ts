import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, getFunctionUrl } from "../supabase";
import { getAuthenticatedSession } from "./sessionHelper";
import { ApiError, ValidationError } from "./errors";
import {
  scorePHQ4,
  validatePHQ4Answers,
  PHQ4_DISCLAIMER,
  type PHQ4Result,
} from "../../../domain/scoring/phq4";
import {
  scorePHQ9,
  validatePHQ9Answers,
  PHQ9_DISCLAIMER,
  type PHQ9Result,
  type PHQ9Answers,
} from "../../../domain/scoring/phq9";
import {
  scoreGAD7,
  validateGAD7Answers,
  GAD7_DISCLAIMER,
  type GAD7Result,
  type GAD7Answers,
} from "../../../domain/scoring/gad7";
import { MANDATORY_HELPLINES } from "../../../domain/risk/riskRouting";

export const AssessmentInstrumentSchema = z.enum(["phq4", "phq9", "gad7"]);
export type AssessmentInstrument = z.infer<typeof AssessmentInstrumentSchema>;

export const AssessmentRequestSchema = z.object({
  instrument: AssessmentInstrumentSchema,
  answers: z.array(z.number().int().min(0).max(3)),
});
export type AssessmentRequest = z.infer<typeof AssessmentRequestSchema>;

export const CrisisProtocolPayloadSchema = z.object({
  message: z.string(),
  helplines: z.object({
    teleManas: z.string(),
    teleManasAlt: z.string().optional(),
    kiran: z.string(),
    emergency: z.string(),
  }),
});
export type CrisisProtocolPayload = z.infer<typeof CrisisProtocolPayloadSchema>;

export const AssessmentItemSchema = z.object({
  id: z.string(),
  student_id: z.string().optional(),
  instrument: AssessmentInstrumentSchema,
  answers: z.array(z.number()),
  total: z.number(),
  severity: z.string(),
  item9_flag: z.boolean().default(false),
  disclaimer: z.string().optional(),
  crisis: z.boolean().default(false),
  crisisProtocol: CrisisProtocolPayloadSchema.optional(),
  completed_at: z.string().optional(),
  created_at: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** true for labelled sample rows added by "Load demo data"; absent or false for real screenings. */
  is_demo: z.boolean().optional(),
});
export type AssessmentItem = z.infer<typeof AssessmentItemSchema>;

export const AssessmentResponseSchema = z.object({
  success: z.boolean(),
  assessment: AssessmentItemSchema,
});
export type AssessmentResponse = z.infer<typeof AssessmentResponseSchema>;

export interface LocalScoreResult {
  total: number;
  severity: string;
  item9_flag: boolean;
  crisis: boolean;
  disclaimer: string;
  crisisProtocol?: CrisisProtocolPayload;
  rawDomainResult: PHQ4Result | PHQ9Result | GAD7Result;
}

/**
 * Score assessment instrument locally using pure domain logic.
 * Guaranteed instant, synchronous, deterministic scoring.
 * Critical safety rule: PHQ-9 item 9 non-zero triggers crisis protocol.
 */
export function scoreAssessmentLocally(
  instrument: AssessmentInstrument,
  answers: number[],
): LocalScoreResult {
  if (instrument === "phq4") {
    if (!validatePHQ4Answers(answers)) {
      throw new ValidationError("PHQ-4 requires exactly 4 answers, each between 0 and 3.");
    }
    const result = scorePHQ4(answers);
    return {
      total: result.totalScore,
      severity: result.band,
      item9_flag: false,
      crisis: false,
      disclaimer: PHQ4_DISCLAIMER,
      rawDomainResult: result,
    };
  }

  if (instrument === "phq9") {
    if (!validatePHQ9Answers(answers)) {
      throw new ValidationError("PHQ-9 requires exactly 9 answers, each between 0 and 3.");
    }
    const result = scorePHQ9(answers as PHQ9Answers);
    const isCrisis = result.item9Flag || result.requiresCrisisProtocol;
    const crisisProtocol: CrisisProtocolPayload | undefined = isCrisis
      ? {
          message:
            "PHQ-9 Item 9 indicates thoughts of self-harm. MindSahaay has activated the student crisis protocol. Please reach out to confidential 24/7 helplines.",
          helplines: {
            teleManas: "14416",
            teleManasAlt: "1800-891-4416",
            kiran: "1800-599-0019",
            emergency: "112",
          },
        }
      : undefined;

    return {
      total: result.totalScore,
      severity: result.band,
      item9_flag: result.item9Flag,
      crisis: isCrisis,
      disclaimer: PHQ9_DISCLAIMER,
      crisisProtocol,
      rawDomainResult: result,
    };
  }

  if (instrument === "gad7") {
    if (!validateGAD7Answers(answers)) {
      throw new ValidationError("GAD-7 requires exactly 7 answers, each between 0 and 3.");
    }
    const result = scoreGAD7(answers as GAD7Answers);
    return {
      total: result.totalScore,
      severity: result.band,
      item9_flag: false,
      crisis: false,
      disclaimer: GAD7_DISCLAIMER,
      rawDomainResult: result,
    };
  }

  throw new ValidationError(`Unsupported instrument: ${instrument}`);
}

/**
 * Submits an assessment:
 * 1. Scores locally via src/domain for immediate, safe, deterministic response.
 * 2. Attempts POST to edge function /assessments.
 * 3. Falls back to inserting into Supabase assessments table directly if edge function is offline.
 */
export async function submitAssessment(input: AssessmentRequest): Promise<AssessmentResponse> {
  const validated = AssessmentRequestSchema.safeParse(input);
  if (!validated.success) {
    throw new ValidationError("Invalid assessment submission", { issues: validated.error.issues });
  }

  const { session, user } = await getAuthenticatedSession();
  const localScore = scoreAssessmentLocally(validated.data.instrument, validated.data.answers);

  const edgeUrl = getFunctionUrl("/assessments");
  let edgeResponseData: AssessmentResponse | null = null;

  try {
    const response = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(validated.data),
    });

    if (response.ok) {
      const json = await response.json();
      const parsed = AssessmentResponseSchema.safeParse(json);
      if (parsed.success) {
        edgeResponseData = parsed.data;
      }
    }
  } catch {
    // Edge function unreachable; proceed to direct Supabase persistence
  }

  if (edgeResponseData) {
    // Ensure safety rules: if local score detected item9_flag, guarantee it is reflected
    if (localScore.item9_flag) {
      edgeResponseData.assessment.item9_flag = true;
      edgeResponseData.assessment.crisis = true;
      edgeResponseData.assessment.crisisProtocol = localScore.crisisProtocol;
    }
    return edgeResponseData;
  }

  // Direct Supabase table insert fallback
  const { data, error } = await supabase
    .from("assessments")
    .insert({
      student_id: user.id,
      instrument: validated.data.instrument,
      answers: validated.data.answers,
      total: localScore.total,
      severity: localScore.severity,
      item9_flag: localScore.item9_flag,
      metadata: {
        disclaimer: localScore.disclaimer,
        rawResult: localScore.rawDomainResult,
        helplines: localScore.item9_flag ? MANDATORY_HELPLINES : undefined,
      },
    })
    .select()
    .single();

  if (error) {
    throw new ApiError(error.message, 500, error.code, { original: error });
  }

  const resultAssessment: AssessmentItem = {
    id: data.id,
    student_id: data.student_id,
    instrument: validated.data.instrument,
    answers: validated.data.answers,
    total: localScore.total,
    severity: localScore.severity,
    item9_flag: localScore.item9_flag,
    disclaimer: localScore.disclaimer,
    crisis: localScore.crisis,
    crisisProtocol: localScore.crisisProtocol,
    completed_at: data.completed_at,
    created_at: data.created_at,
  };

  return {
    success: true,
    assessment: resultAssessment,
  };
}

export async function fetchAssessments(instrument?: AssessmentInstrument): Promise<AssessmentItem[]> {
  await getAuthenticatedSession();

  let query = supabase
    .from("assessments")
    .select("*")
    .order("completed_at", { ascending: false });

  if (instrument) {
    query = query.eq("instrument", instrument);
  }

  const { data, error } = await query;
  if (error) {
    throw new ApiError(error.message, 500, error.code, { original: error });
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    student_id: row.student_id,
    instrument: row.instrument,
    answers: row.answers,
    total: row.total,
    severity: row.severity,
    item9_flag: Boolean(row.item9_flag),
    disclaimer: row.metadata?.disclaimer ?? PHQ4_DISCLAIMER,
    crisis: Boolean(row.item9_flag),
    completed_at: row.completed_at,
    created_at: row.created_at,
    ...(row.is_demo === true ? { is_demo: true } : {}),
  }));
}

export function useSubmitAssessment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssessmentRequest) => submitAssessment(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
    },
  });
}

export function useAssessments(instrument?: AssessmentInstrument) {
  return useQuery({
    queryKey: ["assessments", instrument],
    queryFn: () => fetchAssessments(instrument),
  });
}
