import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { FUNCTIONS_BASE_URL, SUPABASE_URL } from "../supabase";
import type { Session, User } from "@supabase/supabase-js";

export const MOCK_USER_ID = "550e8400-e29b-41d4-a716-446655440000";

export const mockUser: User = {
  id: MOCK_USER_ID,
  app_metadata: {},
  user_metadata: { role: "student", name: "Aarav Singh" },
  aud: "authenticated",
  confirmation_sent_at: "",
  recovery_sent_at: "",
  email_change_sent_at: "",
  new_email: "",
  invited_at: "",
  action_link: "",
  email: "aarav.singh@du.ac.in",
  phone: "",
  created_at: new Date().toISOString(),
  confirmed_at: new Date().toISOString(),
  email_confirmed_at: new Date().toISOString(),
  phone_confirmed_at: "",
  last_sign_in_at: new Date().toISOString(),
  role: "authenticated",
  updated_at: new Date().toISOString(),
  identities: [],
  is_anonymous: false,
  factors: [],
};

export const mockSession: Session = {
  access_token: "mock-access-token-jwt",
  token_type: "bearer",
  expires_in: 3600,
  refresh_token: "mock-refresh-token",
  user: mockUser,
};

export const defaultHandlers = [
  // Edge Function: /assessments
  http.post("*/assessments", async ({ request }) => {
    const body = (await request.json()) as { instrument: string; answers: number[] };
    const total = body.answers.reduce((a, b) => a + b, 0);
    const item9Flag = body.instrument === "phq9" && (body.answers[8] || 0) > 0;
    return HttpResponse.json({
      success: true,
      assessment: {
        id: "mock-assessment-id-123",
        instrument: body.instrument,
        total,
        severity: total > 8 ? "severe" : total > 4 ? "moderate" : "normal",
        item9_flag: item9Flag,
        crisis: item9Flag,
        disclaimer: "MindSahaay educational screening tool.",
        crisisProtocol: item9Flag
          ? {
              message: "Crisis detected",
              helplines: {
                teleManas: "14416",
                teleManasAlt: "1800-891-4416",
                kiran: "1800-599-0019",
                emergency: "112",
              },
            }
          : undefined,
        completed_at: new Date().toISOString(),
      },
    });
  }),

  // Supabase REST: assessments
  http.post("*/rest/v1/assessments*", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        id: "mock-db-assessment-123",
        student_id: MOCK_USER_ID,
        instrument: body.instrument || "phq4",
        answers: body.answers || [0, 0, 0, 0],
        total: body.total || 0,
        severity: body.severity || "normal",
        item9_flag: Boolean(body.item9_flag),
        metadata: body.metadata || {},
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
      { status: 201 },
    );
  }),

  http.get("*/rest/v1/assessments*", async () => {
    return HttpResponse.json([
      {
        id: "mock-db-assessment-123",
        student_id: MOCK_USER_ID,
        instrument: "phq4",
        answers: [1, 1, 0, 0],
        total: 2,
        severity: "normal",
        item9_flag: false,
        metadata: {},
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);
  }),

  // Edge Function: /chat/stream (SSE)
  http.post("*/chat/stream", async () => {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode("data: {\"token\":\"Hello\"}\n\n"));
        controller.enqueue(encoder.encode("data: {\"token\":\" there\"}\n\n"));
        controller.enqueue(encoder.encode("data: {\"token\":\" student\"}\n\n"));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new HttpResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }),

  // Edge Function: /me/export
  http.get(`${FUNCTIONS_BASE_URL}/me/export`, async () => {
    return HttpResponse.json({
      metadata: {
        platform: "MindSahaay Student Wellbeing",
        exportedAt: new Date().toISOString(),
        regulations: "India DPDP Act 2023 & Mental Healthcare Act 2017",
        studentId: MOCK_USER_ID,
      },
      profile: { id: MOCK_USER_ID, role: "student", alias: "Aarav" },
      consents: [],
      moods: [],
      assessments: [],
      journals: [],
      safetyPlan: null,
      appointments: [],
    });
  }),

  // Edge Function: /me (DELETE)
  http.delete(`${FUNCTIONS_BASE_URL}/me`, async () => {
    return HttpResponse.json({ success: true, message: "Erased" });
  }),

  // Supabase REST: mood_entries
  http.get(`${SUPABASE_URL}/rest/v1/mood_entries*`, async () => {
    return HttpResponse.json([
      {
        id: "mood-1",
        student_id: MOCK_USER_ID,
        mood: "Calm",
        score: 8,
        tags: ["Campus"],
        notes: "Good day",
        created_at: new Date().toISOString(),
      },
    ]);
  }),

  http.post(`${SUPABASE_URL}/rest/v1/mood_entries*`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        id: "mood-new-123",
        student_id: MOCK_USER_ID,
        mood: body.mood || "Calm",
        score: body.score || 7,
        tags: body.tags || [],
        notes: body.notes || null,
        created_at: new Date().toISOString(),
      },
      { status: 201 },
    );
  }),

  // Supabase REST: journal_entries
  http.get(`${SUPABASE_URL}/rest/v1/journal_entries*`, async () => {
    return HttpResponse.json([]);
  }),

  http.post(`${SUPABASE_URL}/rest/v1/journal_entries*`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        id: "journal-new-123",
        student_id: MOCK_USER_ID,
        ciphertext: body.ciphertext,
        iv: body.iv,
        salt: body.salt,
        created_at: new Date().toISOString(),
      },
      { status: 201 },
    );
  }),

  http.delete(`${SUPABASE_URL}/rest/v1/journal_entries*`, async () => {
    return HttpResponse.json([], { status: 200 });
  }),

  // Supabase REST: consents
  http.get(`${SUPABASE_URL}/rest/v1/consents*`, async () => {
    return HttpResponse.json([
      {
        id: "consent-1",
        student_id: MOCK_USER_ID,
        purpose: "data_processing",
        consented: true,
        policy_version: "2023.1-DPDP",
        granted_at: new Date().toISOString(),
        revoked_at: null,
      },
    ]);
  }),

  http.post(`${SUPABASE_URL}/rest/v1/consents*`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        id: "consent-new-123",
        student_id: MOCK_USER_ID,
        purpose: body.purpose,
        consented: body.consented,
        policy_version: body.policy_version || "2023.1-DPDP",
        granted_at: new Date().toISOString(),
        revoked_at: body.revoked_at || null,
      },
      { status: 201 },
    );
  }),

  // Supabase REST: safety_plans
  http.get(`${SUPABASE_URL}/rest/v1/safety_plans*`, async () => {
    return HttpResponse.json({
      id: "safety-plan-1",
      student_id: MOCK_USER_ID,
      warning_signs: ["Pacing", "Racing thoughts"],
      coping_strategies: ["Box breathing", "Walk"],
      emergency_contacts: [{ name: "Friend", relationship: "Hostel roommate", phone: "9876543210" }],
      safe_environments: ["Library 2nd floor"],
      reasons_to_live: ["My family", "Future research goals"],
      professional_support: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }),

  http.post(`${SUPABASE_URL}/rest/v1/safety_plans*`, async () => {
    return HttpResponse.json({ status: "upserted" }, { status: 201 });
  }),

  // Supabase REST: profiles
  http.get(`${SUPABASE_URL}/rest/v1/profiles*`, async () => {
    return HttpResponse.json({
      id: MOCK_USER_ID,
      role: "student",
      alias: "Aarav Singh",
      locale: "en",
    });
  }),

  http.delete(`${SUPABASE_URL}/rest/v1/profiles*`, async () => {
    return HttpResponse.json([], { status: 200 });
  }),
];

export const testServer = setupServer(...defaultHandlers);
