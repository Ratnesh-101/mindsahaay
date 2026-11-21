import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { getAuthenticatedSession } from "./sessionHelper";
import { ApiError, ValidationError } from "./errors";
import { enqueueMood } from "../offline/outbox";
import type { QueuedMoodRow } from "../offline/types";

export const MoodEntrySchema = z.object({
  id: z.string(),
  student_id: z.string().optional(),
  mood: z.string(),
  score: z.number().int().min(1).max(10),
  tags: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
  created_at: z.string(),
});

export type MoodEntry = z.infer<typeof MoodEntrySchema>;

export const CreateMoodSchema = z.object({
  mood: z.string().min(1, "Mood cannot be empty"),
  score: z.number().int().min(1).max(10),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(500).optional(),
});

export type CreateMoodInput = z.infer<typeof CreateMoodSchema>;

export async function fetchMoods(options?: { limit?: number }): Promise<MoodEntry[]> {
  await getAuthenticatedSession();

  const limit = options?.limit ?? 30;
  const { data, error } = await supabase
    .from("mood_entries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new ApiError(error.message, 500, error.code, { original: error });
  }

  const parsed = z.array(MoodEntrySchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new ValidationError("Failed to parse mood entries", { issues: parsed.error.issues });
  }

  return parsed.data;
}

export async function addMood(input: CreateMoodInput): Promise<MoodEntry> {
  const validated = CreateMoodSchema.safeParse(input);
  if (!validated.success) {
    throw new ValidationError("Invalid mood input", { issues: validated.error.issues });
  }

  const { user } = await getAuthenticatedSession();

  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

  if (isOffline) {
    const id = crypto.randomUUID();
    const moodRow: QueuedMoodRow = {
      id,
      student_id: user.id,
      mood: validated.data.mood,
      score: validated.data.score,
      tags: validated.data.tags ?? [],
      notes: validated.data.notes ?? null,
    };
    await enqueueMood(moodRow);
    // Explicit fields (not a spread of moodRow): QueuedMoodRow has an index signature, which
    // would widen mood/score/tags to unknown. created_at here is only the local display time;
    // the server assigns the real created_at when the outbox sends the row.
    return {
      id,
      student_id: user.id,
      mood: validated.data.mood,
      score: validated.data.score,
      tags: validated.data.tags ?? [],
      notes: validated.data.notes ?? null,
      created_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from("mood_entries")
    .insert({
      student_id: user.id,
      mood: validated.data.mood,
      score: validated.data.score,
      tags: validated.data.tags ?? [],
      notes: validated.data.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new ApiError(error.message, 500, error.code, { original: error });
  }

  const parsed = MoodEntrySchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Failed to parse created mood entry", { issues: parsed.error.issues });
  }

  return parsed.data;
}

export function useMoods(options?: { limit?: number }) {
  return useQuery({
    queryKey: ["moods", options?.limit],
    queryFn: () => fetchMoods(options),
  });
}

export function useAddMood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMoodInput) => addMood(input),
    // TanStack Query's default ("online") PAUSES a mutation while the browser is offline, so
    // addMood() never ran and the offline-outbox branch inside it was unreachable from the UI:
    // the button stayed on "Saving..." until the connection returned. "always" lets addMood run
    // offline and queue the entry (found by a real-browser offline test).
    networkMode: "always",
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["moods"] });
    },
  });
}
