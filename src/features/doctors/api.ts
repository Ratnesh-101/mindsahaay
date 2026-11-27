import { z } from "zod";
import { supabase } from "../../shared/lib/supabase";
import { getAuthenticatedSession } from "../../shared/lib/api/sessionHelper";
import { ApiError } from "../../shared/lib/api/errors";
import { callFunction } from "./http";

/** Same shape the host app already stores for the latest booking (kept structurally compatible with src/api.ts). */
export interface Appointment {
  id: string;
  doctorId: string;
  doctorName: string;
  scheduledFor: string;
  slotTime: string;
  status: string;
  meetingUrl?: string;
  bookedAt: string;
}

export interface Counsellor {
  id: string;
  name: string;
  specializations: string[];
  bio: string;
  institutionId: string | null;
}

export interface Slot {
  id: string;
  counsellorId: string;
  startTime: string;
  endTime: string;
}

export interface MyAppointment {
  id: string;
  counsellorId: string;
  slotId: string | null;
  scheduledAt: string;
  status: "scheduled" | "confirmed" | "completed" | "cancelled";
  meetingUrl: string;
  notes: string;
}

export interface Reminder {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export const CANCEL_WINDOW_MS = 2 * 60 * 60 * 1000;

/** FR-BOOK-04: a student can cancel at least 2 hours before the slot. */
export function canCancel(scheduledAt: string, now: Date = new Date()): boolean {
  return new Date(scheduledAt).getTime() - now.getTime() >= CANCEL_WINDOW_MS;
}

function fail(error: { message: string; code?: string }): never {
  throw new ApiError(error.message, 500, error.code ?? "DB_ERROR");
}

/** Verified counsellors with their display alias (profiles join is allowed by RLS for verified counsellors). */
export async function fetchCounsellors(): Promise<Counsellor[]> {
  await getAuthenticatedSession();
  const { data, error } = await supabase
    .from("counsellors")
    .select("id, specializations, bio, institution_id, profiles(alias)")
    .eq("verified", true);
  if (error) fail(error);
  return (data ?? []).map((row: Record<string, unknown>) => {
    const profile = row.profiles as { alias?: string } | { alias?: string }[] | null;
    const alias = Array.isArray(profile) ? profile[0]?.alias : profile?.alias;
    return {
      id: String(row.id),
      name: alias || "Campus counsellor",
      specializations: (row.specializations as string[] | null) ?? [],
      bio: (row.bio as string | null) ?? "",
      institutionId: (row.institution_id as string | null) ?? null,
    };
  });
}

/** Future, unbooked availability slots for one counsellor. */
export async function fetchSlots(counsellorId: string, now: Date = new Date()): Promise<Slot[]> {
  await getAuthenticatedSession();
  const { data, error } = await supabase
    .from("availability_slots")
    .select("id, counsellor_id, start_time, end_time, is_booked")
    .eq("counsellor_id", counsellorId)
    .eq("is_booked", false)
    .gte("start_time", now.toISOString())
    .order("start_time", { ascending: true })
    .limit(40);
  if (error) fail(error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    counsellorId: String(r.counsellor_id),
    startTime: String(r.start_time),
    endTime: String(r.end_time),
  }));
}

const BookingResponseSchema = z
  .object({
    id: z.string(),
    counsellor_id: z.string().optional(),
    counsellorId: z.string().optional(),
    slot_id: z.string().nullable().optional(),
    scheduled_at: z.string().optional(),
    scheduledAt: z.string().optional(),
    status: z.string().optional(),
    meeting_url: z.string().optional(),
    meetingUrl: z.string().optional(),
    notes: z.string().nullable().optional(),
  })
  .passthrough();

export interface BookInput {
  counsellorId: string;
  slot: Slot;
  notes?: string;
}

/** POST /appointments: the server claims the slot atomically (FOR UPDATE) and answers 409 if it was taken. */
export async function bookAppointment(input: BookInput): Promise<MyAppointment> {
  const raw = await callFunction<unknown>("POST", "/appointments", {
    counsellorId: input.counsellorId,
    slotId: input.slot.id,
    scheduledFor: input.slot.startTime,
    slotTime: new Date(input.slot.startTime).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
    notes: input.notes?.trim() || undefined,
  });
  const envelope = raw && typeof raw === "object" && "appointment" in raw ? (raw as { appointment: unknown }).appointment : raw;
  const parsed = BookingResponseSchema.safeParse(envelope);
  if (!parsed.success) {
    throw new ApiError("Unexpected booking response from the server.", 502, "BAD_RESPONSE");
  }
  const a = parsed.data;
  return {
    id: a.id,
    counsellorId: a.counsellor_id ?? a.counsellorId ?? input.counsellorId,
    slotId: a.slot_id ?? input.slot.id,
    scheduledAt: a.scheduled_at ?? a.scheduledAt ?? input.slot.startTime,
    status: (a.status as MyAppointment["status"]) ?? "confirmed",
    meetingUrl: a.meeting_url ?? a.meetingUrl ?? "",
    notes: a.notes ?? "",
  };
}

/** Upcoming appointments for the signed-in student, soonest first. Cancelled ones are included so the status is visible. */
export async function fetchMyAppointments(now: Date = new Date()): Promise<MyAppointment[]> {
  const { user } = await getAuthenticatedSession();
  const { data, error } = await supabase
    .from("appointments")
    .select("id, counsellor_id, slot_id, scheduled_at, status, meeting_url, notes")
    .eq("student_id", user.id)
    .gte("scheduled_at", new Date(now.getTime() - 60 * 60 * 1000).toISOString())
    .order("scheduled_at", { ascending: true });
  if (error) fail(error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    counsellorId: String(r.counsellor_id),
    slotId: (r.slot_id as string | null) ?? null,
    scheduledAt: String(r.scheduled_at),
    status: r.status as MyAppointment["status"],
    meetingUrl: String(r.meeting_url ?? ""),
    notes: String(r.notes ?? ""),
  }));
}

/** Cancels an appointment. The 2 hour rule is enforced here as well as in the UI. */
export async function cancelAppointment(appointment: Pick<MyAppointment, "id" | "scheduledAt">, now: Date = new Date()): Promise<void> {
  if (!canCancel(appointment.scheduledAt, now)) {
    throw new ApiError("Appointments can only be cancelled at least 2 hours before the slot.", 422, "CANCEL_TOO_LATE");
  }
  await getAuthenticatedSession();
  const { data, error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", appointment.id).select("id");
  if (error) fail(error);
  // An update that matches no row (row policy, or the appointment is gone) reports no error, so confirm it hit one.
  if (!data || data.length === 0) {
    throw new ApiError("The appointment could not be cancelled.", 409, "CANCEL_NOT_APPLIED");
  }
}

/** Appointment reminder notifications (type starts with "appointment"). */
export async function fetchReminders(): Promise<Reminder[]> {
  const { user } = await getAuthenticatedSession();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, type, read, created_at")
    .eq("user_id", user.id)
    .like("type", "appointment%")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) fail(error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    title: String(r.title),
    body: String(r.body),
    createdAt: String(r.created_at),
    read: Boolean(r.read),
  }));
}

const VideoTokenSchema = z.object({
  token: z.string(),
  roomUrl: z.string(),
  roomName: z.string().optional(),
  expiresAt: z.string().optional(),
  role: z.enum(["student", "counsellor"]).optional(),
});
export type VideoToken = z.infer<typeof VideoTokenSchema>;

/** POST /appointments/:id/video-token: short-lived Daily.co meeting token for this appointment. */
export async function requestVideoToken(appointmentId: string): Promise<VideoToken> {
  const raw = await callFunction<unknown>("POST", `/appointments/${encodeURIComponent(appointmentId)}/video-token`, {});
  const parsed = VideoTokenSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("Unexpected video token response.", 502, "BAD_RESPONSE");
  }
  return parsed.data;
}

/**
 * Builds the Daily prebuilt iframe URL. Only https://*.daily.co rooms are accepted, so a bad or
 * tampered response can never make the app embed an arbitrary site. Returns null when invalid.
 */
export function buildDailyEmbedUrl(roomUrl: string, token: string): string | null {
  try {
    const url = new URL(roomUrl);
    if (url.protocol !== "https:" || !(url.hostname === "daily.co" || url.hostname.endsWith(".daily.co"))) {
      return null;
    }
    url.searchParams.set("t", token);
    return url.toString();
  } catch {
    return null;
  }
}

/** Converts to the shape the host app keeps for the latest booking (used by the confirmation and video modals). */
export function toHostAppointment(appt: MyAppointment, counsellorName: string): Appointment {
  const when = new Date(appt.scheduledAt);
  return {
    id: appt.id,
    doctorId: appt.counsellorId,
    doctorName: counsellorName,
    scheduledFor: when.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
    slotTime: when.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
    status: appt.status,
    meetingUrl: appt.meetingUrl || undefined,
    bookedAt: new Date().toISOString(),
  };
}
