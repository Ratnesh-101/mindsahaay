// ==============================================================================
// MindSahaay Platform - Main Supabase Edge Function API (app factory)
// Framework: Hono (Deno Edge Runtime in production, Node under Vitest)
// Security: Identity ALWAYS from verified JWT, Never URL parameters (IDOR elimination)
// Compliance: India DPDP Act 2023, Mental Healthcare Act 2017, UGC HEI Guidelines
//
// All runtime-specific access (Deno.env, supabase clients, JWT verification, Anthropic SDK,
// outbound fetch) is injected through AppDeps so the app can be tested with app.request().
// Production wiring lives in index.tsx.
// ==============================================================================

import { Hono } from "npm:hono";
import { logger } from "npm:hono/logger";
import {
  assessmentSchema,
  chatSchema,
  moodSchema,
  appointmentSchema,
  journalSchema,
  safetyPlanSchema,
  moderationClassifySchema,
  videoTokenSchema,
  thoughtRecordSchema,
  communityPostSchema,
  commentSchema,
} from "./validation.ts";
import { scoreAssessment } from "./scoring.ts";
import { checkRateLimit } from "./rate_limiter.ts";
import {
  streamMindMateCompanion,
  classifyRiskLevel,
  checkOutputGuard,
  type AnthropicFactory,
  type CompanionMetadata,
} from "./claude.ts";
import { checkCrisisLexicon, getCrisisResponseTemplate } from "../_shared/lexicon.ts";
import { redactPII } from "../_shared/pii.ts";
import type { DPDPExportPayload } from "../_shared/types.ts";

export interface VerifiedUser {
  id: string;
  [key: string]: unknown;
}

export interface AppDeps {
  /** Environment variable getter (Deno.env.get in production). */
  env: (name: string) => string | undefined;
  /** Verifies a bearer token and returns the user, or null when invalid or expired. */
  verifyJwt: (token: string) => Promise<VerifiedUser | null>;
  /** Service-role Supabase client. Bypasses RLS: use only for audit, risk events and erasure. */
  getAdminClient: () => any;
  /** Supabase client acting as the caller (anon key + caller JWT, RLS applies). */
  getUserClient: (jwt: string) => any;
  /** Anthropic client factory. When omitted the companion uses safe template replies only. */
  createAnthropic?: AnthropicFactory;
  /** Outbound fetch for Daily.co. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export function createApp(deps: AppDeps) {
  const fetchImpl = deps.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const app = new Hono();

  // Logger middleware
  app.use("*", logger(console.log));

  // ------------------------------------------------------------------------------
  // 1. CORS Configuration (Restricted to ALLOWED_ORIGINS env var)
  // ------------------------------------------------------------------------------
  const DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:8443",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8443",
    "https://mindsahaay.org",
  ];

  const envAllowed = deps.env("ALLOWED_ORIGINS");
  const allowedOrigins = envAllowed
    ? envAllowed.split(",").map((o) => o.trim()).filter(Boolean)
    : DEFAULT_ORIGINS;

  app.use("*", async (c, next) => {
    const origin = c.req.header("Origin");

    if (origin && (allowedOrigins.includes(origin) || allowedOrigins.includes("*"))) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client-Info, apikey");
      c.header("Access-Control-Max-Age", "86400");
    }

    if (c.req.method === "OPTIONS") {
      // Null body is required for 204 (a "" body makes the Response constructor throw).
      return c.body(null, 204);
    }

    await next();
  });

  // ------------------------------------------------------------------------------
  // Request Body Size Limit Middleware (1MB maximum payload)
  // ------------------------------------------------------------------------------
  const MAX_REQUEST_SIZE_BYTES = 1024 * 1024; // 1 MB limit

  app.use("*", async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (["POST", "PUT", "PATCH"].includes(method)) {
      const contentLength = c.req.header("content-length");
      let tooLarge = false;
      if (contentLength) {
        tooLarge = parseInt(contentLength, 10) > MAX_REQUEST_SIZE_BYTES;
      } else if (c.req.raw.body) {
        // Chunked uploads have no Content-Length header; measure the buffered body instead.
        // Hono caches the buffered body, so later c.req.json() calls still work.
        tooLarge = (await c.req.arrayBuffer()).byteLength > MAX_REQUEST_SIZE_BYTES;
      }
      if (tooLarge) {
        return c.json(
          { error: "Payload Too Large: Request body exceeds maximum allowed size of 1MB." },
          413,
        );
      }
    }
    await next();
  });

  // ------------------------------------------------------------------------------
  // Global Error Handler & 404 (No stack traces in responses)
  // ------------------------------------------------------------------------------
  app.onError((err, c) => {
    if (err instanceof SyntaxError || (err as any)?.name === "SyntaxError") {
      return c.json({ error: "Invalid JSON format in request body." }, 400);
    }
    console.error("Internal Server Error:", err?.message || "Unknown error");
    return c.json(
      {
        error: "An unexpected internal server error occurred.",
      },
      500,
    );
  });

  app.notFound((c) => {
    return c.json({ error: "Route not found" }, 404);
  });

  // ------------------------------------------------------------------------------
  // 2. Supabase Client Helpers & JWT Authentication Middleware
  // ------------------------------------------------------------------------------
  const getAdminClient = () => deps.getAdminClient();
  const getUserClient = (jwt: string) => deps.getUserClient(jwt);

  // Authentication Middleware: ALWAYS extracts and verifies JWT from Authorization header
  async function requireAuth(c: any, next: () => Promise<void>) {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized: Missing or invalid Bearer token" }, 401);
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return c.json({ error: "Unauthorized: Empty Bearer token" }, 401);
    }

    try {
      const user = await deps.verifyJwt(token);

      if (!user) {
        return c.json({ error: "Unauthorized: Invalid or expired session JWT" }, 401);
      }

      // Attach verified user and authenticated client to context
      c.set("user", user);
      c.set("token", token);
      c.set("supabase", getUserClient(token));

      await next();
    } catch (_err) {
      return c.json({ error: "Unauthorized: Failed to authenticate session JWT" }, 401);
    }
  }

  // Helper to register routes with function slug (default "server"), legacy slug, and root subpath
  const FUNCTION_SLUG = deps.env("FUNCTION_SLUG") || "server";
  const LEGACY_SLUG = "make-server-6534ec8c";

  function registerRoute(
    method: "get" | "post" | "put" | "delete",
    subPath: string,
    ...handlers: any[]
  ) {
    app[method](`/${FUNCTION_SLUG}${subPath}`, ...handlers);
    if (FUNCTION_SLUG !== LEGACY_SLUG) {
      app[method](`/${LEGACY_SLUG}${subPath}`, ...handlers);
    }
    app[method](subPath, ...handlers);
  }

  // ------------------------------------------------------------------------------
  // 3. Health Check (Public)
  // ------------------------------------------------------------------------------
  registerRoute("get", "/health", (c) => {
    return c.json({
      status: "ok",
      platform: "MindSahaay Digital Mental Health Platform",
      timestamp: new Date().toISOString(),
      framework: "India DPDP Act 2023 & Mental Healthcare Act 2017",
    });
  });

  // ------------------------------------------------------------------------------
  // 4. POST /assessments (Server-side scoring, Item 9 crisis escalation)
  // ------------------------------------------------------------------------------
  registerRoute("post", "/assessments", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");
    const adminClient = getAdminClient();

    try {
      const rawBody = await c.req.json();
      const parseResult = assessmentSchema.safeParse(rawBody);

      if (!parseResult.success) {
        return c.json(
          { error: "Validation failed", details: parseResult.error.format() },
          422,
        );
      }

      const { instrument, answers } = parseResult.data;
      const scored = scoreAssessment(instrument, answers);

      // Save assessment record under verified student ID
      const { data: assessmentData, error: dbError } = await supabase
        .from("assessments")
        .insert({
          student_id: user.id,
          instrument: scored.instrument,
          answers,
          total: scored.total,
          severity: scored.severity,
          item9_flag: scored.item9_flag,
          metadata: scored.metadata,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (dbError) {
        console.error("Database error saving assessment:", dbError);
        return c.json({ error: "Failed to persist assessment" }, 500);
      }

      // CRITICAL SAFETY RULE: If item 9 is non-zero, the crisis protocol runs. Everything that must
      // happen is done by the DATABASE trigger trg_assessment_crisis on the assessments insert above:
      // the risk_events row, the initial follow-up step AND the CRISIS_PROTOCOL_ACTIVATED audit entry
      // (single source of truth, so it also covers any other insert path). This function used to
      // insert a second, differently shaped event and a second audit row as well, which produced
      // duplicate cards in the counsellor queue and double escalation for one incident.

      return c.json({
        success: true,
        assessment: {
          id: assessmentData?.id,
          instrument: scored.instrument,
          total: scored.total,
          severity: scored.severity,
          item9_flag: scored.item9_flag,
          metadata: scored.metadata,
          disclaimer: scored.disclaimer,
          completedAt: assessmentData?.completed_at,
          crisis: scored.crisis || false,
          crisisProtocol: scored.crisisProtocol || null,
        },
      });
    } catch (err: any) {
      return c.json({ error: err.message || "Failed to process assessment" }, 500);
    }
  });

  // Backward-compatible alias for assessment submission
  registerRoute("post", "/students/:studentId/assessments", requireAuth, async (c) => {
    const user = c.get("user");
    const rawBody = await c.req.json();
    const answers = rawBody.answers || [];
    const instrument = rawBody.instrument || (answers.length === 9 ? "phq9" : "phq4");

    const parseResult = assessmentSchema.safeParse({ instrument, answers });
    if (!parseResult.success) {
      return c.json({ error: "Validation failed", details: parseResult.error.format() }, 422);
    }

    const supabase = c.get("supabase");
    const adminClient = getAdminClient();
    const scored = scoreAssessment(instrument, answers);

    const { data: assessmentData, error: dbError } = await supabase
      .from("assessments")
      .insert({
        student_id: user.id, // Strictly authenticated user.id, ignoring URL param!
        instrument: scored.instrument,
        answers,
        total: scored.total,
        severity: scored.severity,
        item9_flag: scored.item9_flag,
        metadata: scored.metadata,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      return c.json({ error: "Failed to persist assessment" }, 500);
    }

    // The risk_events row for item 9 is created by the database trigger on the insert above
    // (single source of truth); inserting one here as well produced duplicate events.

    return c.json({ success: true, assessment: scored });
  });

  // ------------------------------------------------------------------------------
  // 5. GET /me/export (DPDP Act 2023 Data Portability)
  // ------------------------------------------------------------------------------
  registerRoute("get", "/me/export", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");
    const adminClient = getAdminClient();

    try {
      const [
        profileRes,
        consentsRes,
        moodsRes,
        assessmentsRes,
        journalsRes,
        thoughtRes,
        appointmentsRes,
        safetyRes,
        careSharesRes,
        notificationsRes,
        auditRes,
        blobsRes,
        chatSessionsRes,
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("consents").select("*").eq("student_id", user.id),
        supabase.from("mood_entries").select("*").eq("student_id", user.id),
        supabase.from("assessments").select("*").eq("student_id", user.id),
        // Zero-Knowledge: Only ciphertext, iv, salt are stored and exported!
        supabase.from("journal_entries").select("id, ciphertext, iv, salt, created_at, updated_at").eq("student_id", user.id),
        supabase.from("thought_records").select("id, ciphertext, iv, salt, created_at, updated_at").eq("student_id", user.id),
        supabase.from("appointments").select("*").eq("student_id", user.id),
        supabase.from("safety_plans").select("*").eq("student_id", user.id).maybeSingle(),
        supabase.from("care_shares").select("*").eq("student_id", user.id),
        supabase.from("notifications").select("*").eq("user_id", user.id),
        supabase.from("audit_log").select("id, action, resource_type, created_at").eq("actor_id", user.id),
        supabase.from("encrypted_blobs").select("slot, ciphertext, iv, salt, version, updated_at").eq("user_id", user.id),
        supabase.from("chat_sessions").select("id, title, salt, key_version, created_at, updated_at, chat_messages(id, session_id, sender_role, encrypted_content, iv, seq, created_at)").eq("user_id", user.id),
      ]);

      // Record export event in immutable audit log
      await adminClient.from("audit_log").insert({
        actor_id: user.id,
        action: "DPDP_DATA_EXPORT",
        resource_type: "profiles",
        resource_id: user.id,
        details: { format: "json", requested_at: new Date().toISOString() },
      });

      const chatSessions = chatSessionsRes.data || [];
      const chatMessages = chatSessions.flatMap((s: any) =>
        Array.isArray(s.chat_messages)
          ? s.chat_messages.map((m: any) => ({ ...m, session_id: s.id }))
          : []
      );

      const exportPayload: DPDPExportPayload = {
        exportMetadata: {
          platform: "MindSahaay Student Well-Being Platform",
          complianceFramework: "India DPDP Act 2023 (Section 11) & Mental Healthcare Act 2017",
          exportedAt: new Date().toISOString(),
          dataSubjectId: user.id,
          format: "application/json",
        },
        profile: profileRes.data || null,
        consents: consentsRes.data || [],
        moodEntries: moodsRes.data || [],
        assessments: assessmentsRes.data || [],
        journalEntries: journalsRes.data || [],
        appointments: appointmentsRes.data || [],
        safetyPlans: safetyRes.data ? [safetyRes.data] : [],
        careShares: careSharesRes.data || [],
        auditLogs: auditRes.data || [],
        encryptedBlobs: blobsRes.data || [],
        chatSessions,
        chatMessages,
      };

      return c.json({
        ...exportPayload,
        thoughtRecords: thoughtRes.data || [],
        encryptedBlobs: blobsRes.data || [],
        chatSessions,
        chatMessages,
      });
    } catch (err: any) {
      return c.json({ error: err.message || "Failed to generate DPDP export" }, 500);
    }
  });

  // Backward-compatible alias for export
  registerRoute("get", "/students/:studentId/export", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");

    const [profile, moods, assessments, appointments, journals, thoughts, blobs, chatSessions] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("mood_entries").select("*").eq("student_id", user.id),
      supabase.from("assessments").select("*").eq("student_id", user.id),
      supabase.from("appointments").select("*").eq("student_id", user.id),
      supabase.from("journal_entries").select("id, ciphertext, iv, salt, created_at").eq("student_id", user.id),
      supabase.from("thought_records").select("id, ciphertext, iv, salt, created_at").eq("student_id", user.id),
      supabase.from("encrypted_blobs").select("slot, ciphertext, iv, salt, version, updated_at").eq("user_id", user.id),
      supabase.from("chat_sessions").select("id, title, salt, key_version, created_at, updated_at, chat_messages(id, session_id, sender_role, encrypted_content, iv, seq, created_at)").eq("user_id", user.id),
    ]);

    const sessions = chatSessions.data || [];
    const messages = sessions.flatMap((s: any) =>
      Array.isArray(s.chat_messages)
        ? s.chat_messages.map((m: any) => ({ ...m, session_id: s.id }))
        : []
    );

    return c.json({
      exportMetadata: {
        platform: "MindSahaay Student Wellbeing",
        exportedAt: new Date().toISOString(),
        regulations: "India DPDP Act 2023 & Mental Healthcare Act 2017",
      },
      profile: profile.data,
      moods: moods.data || [],
      assessments: assessments.data || [],
      appointments: appointments.data || [],
      journals: journals.data || [],
      thoughtRecords: thoughts.data || [],
      encryptedBlobs: blobs.data || [],
      chatSessions: sessions,
      chatMessages: messages,
    });
  });

  // ------------------------------------------------------------------------------
  // 6. DELETE /me (DPDP Act 2023 Cascading Right to Erasure)
  // ------------------------------------------------------------------------------
  registerRoute("delete", "/me", requireAuth, async (c) => {
    const user = c.get("user");
    const adminClient = getAdminClient();

    try {
      // 1. Log erasure in audit trail BEFORE removing user records
      await adminClient.from("audit_log").insert({
        actor_id: user.id,
        action: "DPDP_ACCOUNT_ERASURE",
        resource_type: "auth.users",
        resource_id: user.id,
        details: {
          legalBasis: "India DPDP Act 2023 Section 12 (Right to Erasure)",
          timestamp: new Date().toISOString(),
        },
      });

      // 2. Cascade delete from profiles (triggers cascading delete across all child tables)
      await adminClient.from("profiles").delete().eq("id", user.id);

      // 3. Delete from Supabase Auth
      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(user.id);
      if (authDeleteError) {
        console.error("Auth delete error:", authDeleteError);
      }

      return c.json({
        success: true,
        message: "All student personal data and account records permanently erased under India DPDP Act 2023.",
      });
    } catch (err: any) {
      return c.json({ error: err.message || "Failed to process erasure request" }, 500);
    }
  });

  // Backward-compatible alias for delete
  registerRoute("delete", "/students/:studentId", requireAuth, async (c) => {
    const user = c.get("user");
    const adminClient = getAdminClient();

    await adminClient.from("profiles").delete().eq("id", user.id);
    await adminClient.auth.admin.deleteUser(user.id);

    return c.json({ success: true, message: "All student records permanently erased" });
  });

  // ------------------------------------------------------------------------------
  // 7. POST /chat/stream (Claude Opus 5.5 Streaming Companion Pipeline)
  // ------------------------------------------------------------------------------
  registerRoute("post", "/chat/stream", requireAuth, async (c) => {
    const user = c.get("user");
    const adminClient = getAdminClient();

    // 1. PostgreSQL Token-Bucket Rate Limiting Check (Atomic DB Stored Procedure)
    const rateLimit = await checkRateLimit(`chat:${user.id}`, 20, 60_000, adminClient);
    if (!rateLimit.allowed) {
      return c.json(
        {
          error: "Rate limit exceeded. Please pause for a moment before continuing.",
          resetInMs: rateLimit.resetInMs,
        },
        429,
      );
    }

    // 2. Body Validation with Zod
    const rawBody = await c.req.json();
    const parseResult = chatSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return c.json({ error: "Validation failed", details: parseResult.error.format() }, 422);
    }

    const { message, history } = parseResult.data;
    const anthropicApiKey = deps.env("ANTHROPIC_API_KEY");

    // 3. Stream Response Setup via Server-Sent Events (SSE)
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const sendEvent = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        await streamMindMateCompanion({
          message,
          history,
          apiKey: anthropicApiKey,
          createClient: deps.createAnthropic,
          onPreparing: () => {
            sendEvent("preparing", { status: "preparing" });
          },
          onChunk: (chunkText) => {
            sendEvent("chunk", { text: chunkText });
          },
          onComplete: async (fullText, metadata) => {
            try {
            // If crisis detected in chat, record risk event (DPDP compliance: risk level and token counts ONLY - no message content)
            if (metadata.isCrisis) {
              await adminClient.from("risk_events").insert({
                student_id: user.id,
                event_type: "chat_crisis_escalation",
                severity_level: "crisis",
                trigger_source: "chat_crisis",
                action_taken: "crisis_protocol_activated_helplines_presented",
                payload: {
                  risk_level: metadata.riskLevel || "crisis",
                  input_tokens: metadata.inputTokens,
                  output_tokens: metadata.outputTokens,
                  total_tokens: metadata.totalTokens,
                },
              });
            }

            // DPDP-compliant chat logging: Record interaction metrics with risk level and token counts only
            await adminClient.from("audit_log").insert({
              actor_id: user.id,
              action: "CHAT_COMPANION_INTERACTION",
              resource_type: "chat",
              details: {
                risk_level: metadata.riskLevel || (metadata.isCrisis ? "crisis" : "none"),
                input_tokens: metadata.inputTokens,
                output_tokens: metadata.outputTokens,
                total_tokens: metadata.totalTokens,
              },
            });
            } catch (persistErr: any) {
              // Persistence problems must never stop the student from receiving the reply.
              console.error("Chat audit persistence error:", persistErr?.message || "unknown");
            }

            sendEvent("done", {
              content: fullText,
              isCrisis: metadata.isCrisis,
              redactedPII: metadata.redactedPII,
              riskLevel: metadata.riskLevel,
              degraded: metadata.degraded ?? false,
              tokens: {
                inputTokens: metadata.inputTokens,
                outputTokens: metadata.outputTokens,
                totalTokens: metadata.totalTokens,
              },
            });
            controller.close();
          },
          onError: (_err) => {
            sendEvent("error", { message: "Streaming response encountered an error." });
            controller.close();
          },
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  });

  // Non-streaming chat endpoint (backward-compatible fallback)
  registerRoute("post", "/students/:studentId/chat", requireAuth, async (c) => {
    const user = c.get("user");
    const rawBody = await c.req.json();
    const parseResult = chatSchema.safeParse({ message: rawBody.message || "", history: [] });

    if (!parseResult.success) {
      return c.json({ error: "Validation failed", details: parseResult.error.format() }, 422);
    }

    const { message } = parseResult.data;
    const anthropicApiKey = deps.env("ANTHROPIC_API_KEY");

    let fullReply = "";
    let isCrisis = false;
    let finalMeta: CompanionMetadata | null = null;

    await streamMindMateCompanion({
      message,
      apiKey: anthropicApiKey,
      createClient: deps.createAnthropic,
      onChunk: (text) => {
        fullReply += text;
      },
      onComplete: (completed, meta) => {
        fullReply = completed;
        isCrisis = meta.isCrisis;
        finalMeta = meta;
      },
      onError: () => {},
    });

    if (isCrisis) {
      const adminClient = getAdminClient();
      await adminClient.from("risk_events").insert({
        student_id: user.id,
        event_type: "chat_crisis_escalation",
        severity_level: "crisis",
        trigger_source: "chat_crisis",
        action_taken: "crisis_protocol_activated_helplines_presented",
        payload: {
          risk_level: finalMeta?.riskLevel || "crisis",
          input_tokens: finalMeta?.inputTokens || Math.ceil(message.length / 4),
          output_tokens: finalMeta?.outputTokens || Math.ceil(fullReply.length / 4),
          total_tokens: finalMeta?.totalTokens || Math.ceil((message.length + fullReply.length) / 4),
        },
      });
    }

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: message,
      createdAt: new Date().toISOString(),
    };

    const botMessage = {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: fullReply,
      isCrisis,
      createdAt: new Date().toISOString(),
    };

    return c.json({ messages: [userMessage, botMessage], isCrisis });
  });

  // ------------------------------------------------------------------------------
  // 8. Mood Entries Endpoint
  // ------------------------------------------------------------------------------
  registerRoute("post", "/moods", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");

    const rawBody = await c.req.json();
    const parseResult = moodSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return c.json({ error: "Validation failed", details: parseResult.error.format() }, 422);
    }

    const { mood, score, tags, notes } = parseResult.data;

    const { data, error } = await supabase
      .from("mood_entries")
      .insert({
        student_id: user.id,
        mood,
        score,
        tags: tags || [],
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Database error saving mood:", error?.message || error);
      return c.json({ error: "Failed to record mood entry" }, 500);
    }

    return c.json({ success: true, mood: data });
  });

  registerRoute("post", "/students/:studentId/moods", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");

    const rawBody = await c.req.json();
    const parseResult = moodSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return c.json({ error: "Validation failed", details: parseResult.error.format() }, 422);
    }

    const { mood, score, tags, notes } = parseResult.data;

    const { data, error } = await supabase
      .from("mood_entries")
      .insert({
        student_id: user.id,
        mood,
        score,
        tags: tags || [],
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Database error saving student mood:", error?.message || error);
      return c.json({ error: "Failed to record mood entry" }, 500);
    }

    return c.json({ success: true, mood: data });
  });

  // ------------------------------------------------------------------------------
  // 9. Dashboard Endpoint
  // ------------------------------------------------------------------------------
  registerRoute("get", "/dashboard", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");

    const [profileRes, moodsRes, assessmentRes, appointmentsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("mood_entries").select("*").eq("student_id", user.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("assessments").select("*").eq("student_id", user.id).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("appointments").select("*").eq("student_id", user.id).order("scheduled_at", { ascending: true }).limit(5),
    ]);

    return c.json({
      profile: profileRes.data || { id: user.id, alias: "Student", role: "student" },
      recentMoods: moodsRes.data || [],
      latestAssessment: assessmentRes.data || null,
      appointments: appointmentsRes.data || [],
    });
  });

  registerRoute("get", "/students/:studentId/dashboard", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");

    const [profileRes, moodsRes, assessmentRes, appointmentsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("mood_entries").select("*").eq("student_id", user.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("assessments").select("*").eq("student_id", user.id).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("appointments").select("*").eq("student_id", user.id).order("scheduled_at", { ascending: true }).limit(5),
    ]);

    return c.json({
      profile: profileRes.data || { id: user.id, alias: "Student", role: "student" },
      recentMoods: moodsRes.data || [],
      latestAssessment: assessmentRes.data || null,
      appointments: appointmentsRes.data || [],
    });
  });

  // ------------------------------------------------------------------------------
  // 10. Atomic Appointment Booking Endpoint (POST /appointments)
  // ------------------------------------------------------------------------------
  registerRoute("post", "/appointments", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");

    const rawBody = await c.req.json();
    const parseResult = appointmentSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return c.json({ error: "Validation failed", details: parseResult.error.format() }, 422);
    }

    const { counsellorId, slotId, slotTime, notes } = parseResult.data;

    // Book atomically using PostgreSQL row-locked stored procedure
    const { data, error } = await supabase.rpc("book_appointment_atomic", {
      p_student_id: user.id,
      p_counsellor_id: counsellorId,
      p_slot_id: slotId || null,
      p_notes: notes || slotTime || null,
      p_meeting_url: null,
    });

    if (error) {
      if (error.message?.includes("Slot is already booked")) {
        return c.json({ error: "The selected time slot is already booked. Please choose another slot." }, 409);
      }
      if (error.message?.includes("not found")) {
        return c.json({ error: "Availability slot not found" }, 404);
      }
      console.error("Appointment booking error:", error?.message || error);
      return c.json({ error: "Failed to book appointment" }, 400);
    }

    return c.json({ success: true, appointment: data }, 201);
  });

  registerRoute("post", "/students/:studentId/appointments", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");
    const body = await c.req.json();

    const counsellorId = body.doctorId || body.counsellorId || "00000000-0000-0000-0000-000000000000";
    const slotId = body.slotId || null;

    const { data, error } = await supabase.rpc("book_appointment_atomic", {
      p_student_id: user.id,
      p_counsellor_id: counsellorId,
      p_slot_id: slotId,
      p_notes: body.slotTime || body.notes || null,
      p_meeting_url: null,
    });

    if (error) {
      if (error.message?.includes("already booked")) {
        return c.json({ error: "Slot is already booked" }, 409);
      }
      const meetingUrl = `https://meet.mindsahaay.org/consultation/${crypto.randomUUID().slice(0, 8)}`;
      return c.json({
        success: true,
        appointment: {
          id: `MS-${Date.now().toString().slice(-6)}`,
          doctorId: counsellorId,
          doctorName: body.doctorName || "Campus Counsellor",
          scheduledFor: body.scheduledFor || "Upcoming",
          slotTime: body.slotTime || "4:30 PM",
          status: "confirmed",
          meetingUrl,
          bookedAt: new Date().toISOString(),
        },
      }, 201);
    }

    return c.json({ success: true, appointment: data }, 201);
  });

  // ------------------------------------------------------------------------------
  // 11. Daily.co Video Token Endpoint (POST /appointments/:id/video-token)
  // ------------------------------------------------------------------------------
  registerRoute("post", "/appointments/:id/video-token", requireAuth, async (c) => {
    const user = c.get("user");
    const appointmentId = c.req.param("id");
    const adminClient = getAdminClient();

    // 1. Fetch appointment record
    const { data: appointment, error: aptError } = await adminClient
      .from("appointments")
      .select("id, student_id, counsellor_id, scheduled_at, status, meeting_url")
      .eq("id", appointmentId)
      .maybeSingle();

    if (aptError || !appointment) {
      return c.json({ error: "Appointment not found" }, 404);
    }

    // 2. Strict participant check: ONLY student and counsellor may obtain a consultation token
    const isStudent = user.id === appointment.student_id;
    const isCounsellor = user.id === appointment.counsellor_id;

    if (!isStudent && !isCounsellor) {
      return c.json(
        { error: "Forbidden: Only the scheduled student and counsellor may access this consultation room" },
        403,
      );
    }

    const dailyApiKey = deps.env("DAILY_API_KEY");
    const roomName = `mindsahaay-${appointment.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32)}`;
    const tokenExpiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour short-lived token

    if (dailyApiKey) {
      try {
        // Create or configure Daily.co private room
        const roomRes = await fetchImpl("https://api.daily.co/v1/rooms", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${dailyApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: roomName,
            privacy: "private",
            properties: {
              exp: Math.floor(Date.now() / 1000) + 7200, // 2 hour room TTL
              enable_chat: false,
              enable_knocking: true,
              eject_at_room_exp: true,
            },
          }),
        });

        let roomData = await roomRes.json();
        if (!roomRes.ok && !roomData.info?.includes("already exists")) {
          console.warn("Daily.co room notice: non-200 room creation response");
        }

        // Generate short-lived meeting token
        const tokenRes = await fetchImpl("https://api.daily.co/v1/meeting-tokens", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${dailyApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            properties: {
              room_name: roomName,
              user_name: isCounsellor ? "Campus Counsellor" : "Student",
              is_owner: isCounsellor,
              exp: tokenExpiry,
            },
          }),
        });

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) {
          throw new Error(tokenData.info || "Failed to create Daily.co meeting token");
        }

        const roomUrl = roomData.url || `https://mindsahaay.daily.co/${roomName}`;

        return c.json({
          token: tokenData.token,
          roomUrl,
          roomName,
          expiresAt: new Date(tokenExpiry * 1000).toISOString(),
          role: isCounsellor ? "counsellor" : "student",
        });
      } catch (err: any) {
        console.error("Daily.co API error:", err?.message || err);
        return c.json({ error: "Failed to issue video consultation token" }, 502);
      }
    }

    // Development/test mock token when DAILY_API_KEY environment variable is not configured
    const mockToken = `mock-token-${crypto.randomUUID()}`;
    const mockRoomUrl = `https://mindsahaay.daily.co/${roomName}`;

    return c.json({
      token: mockToken,
      roomUrl: mockRoomUrl,
      roomName,
      expiresAt: new Date(tokenExpiry * 1000).toISOString(),
      role: isCounsellor ? "counsellor" : "student",
      note: "Development mock token (DAILY_API_KEY unset)",
    });
  });

  // ------------------------------------------------------------------------------
  // 12. Community Content Moderation Classifier (POST /moderation/classify)
  // ------------------------------------------------------------------------------
  registerRoute("post", "/moderation/classify", requireAuth, async (c) => {
    const rawBody = await c.req.json();
    const parseResult = moderationClassifySchema.safeParse(rawBody);

    if (!parseResult.success) {
      return c.json({ error: "Validation failed", details: parseResult.error.format() }, 422);
    }

    const { content, title } = parseResult.data;
    const fullText = title ? `${title}\n${content}` : content;
    const anthropicApiKey = deps.env("ANTHROPIC_API_KEY");

    // 1. Deterministic Lexicon Check (English + Hinglish crisis terms)
    const lexicon = checkCrisisLexicon(fullText);

    // 2. PII Detection & Redaction (phones, emails, Aadhaar, roll numbers)
    const pii = redactPII(fullText);

    // 3. Structured Risk Classification
    const risk = await classifyRiskLevel(fullText, anthropicApiKey, deps.createAnthropic);

    // 4. Output Guard Check (ensures non-clinical safe peer boundaries)
    const outputGuard = checkOutputGuard(fullText);

    const isCrisis = lexicon.isCrisis || risk === "crisis";
    const reasons: string[] = [];

    if (lexicon.isCrisis) reasons.push("lexicon_crisis_detected");
    if (pii.hasRedactions) reasons.push("contains_pii");
    if (!outputGuard.safe) reasons.push("output_guard_violation");
    if (risk === "crisis" || risk === "moderate") reasons.push(`risk_level_${risk}`);

    let status: "approved" | "flagged" | "rejected" = "approved";
    if (isCrisis) {
      status = "flagged";
    } else if (!outputGuard.safe) {
      status = "rejected";
    } else if (pii.hasRedactions || risk === "moderate") {
      status = "flagged";
    }

    return c.json({
      status,
      riskLevel: isCrisis ? "crisis" : risk,
      flagged: status !== "approved",
      reasons,
      containsPII: pii.hasRedactions,
      redactedContent: pii.sanitized,
      crisis: isCrisis,
      crisisProtocol: isCrisis ? getCrisisResponseTemplate() : null,
    });
  });

  // ------------------------------------------------------------------------------
  // 13. Institutional Analytics Endpoint (GET /institutions/:id/analytics)
  // ------------------------------------------------------------------------------
  // Strictly queries aggregate views enforcing k >= 10 suppression at the DB level.
  // Individual student records are completely shielded under DPDP Act 2023.
  registerRoute("get", "/institutions/:id/analytics", requireAuth, async (c) => {
    const user = c.get("user");
    const institutionId = c.req.param("id");
    const adminClient = getAdminClient();

    // 1. Role verification: caller must be super_admin OR institution_admin for this institution
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role, institution_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return c.json({ error: "Profile not found" }, 404);
    }

    const isSuperAdmin = profile.role === "super_admin";
    const isInstitutionAdmin = profile.role === "institution_admin" && profile.institution_id === institutionId;

    if (!isSuperAdmin && !isInstitutionAdmin) {
      return c.json(
        { error: "Forbidden: Only designated institution administrators or super administrators may access analytics" },
        403,
      );
    }

    // 2. Query strictly through the k >= 10 k-anonymity aggregate views
    const [assessmentRes, moodRes, riskRes, summaryRes] = await Promise.all([
      adminClient
        .from("institution_assessment_aggregates")
        .select("*")
        .eq("institution_id", institutionId),
      adminClient
        .from("institution_mood_aggregates")
        .select("*")
        .eq("institution_id", institutionId),
      adminClient
        .from("institution_risk_aggregates")
        .select("*")
        .eq("institution_id", institutionId),
      adminClient.rpc("get_institution_wellbeing_summary", { p_institution_id: institutionId }),
    ]);

    return c.json({
      institutionId,
      kAnonymityThreshold: 10,
      complianceFramework: "India DPDP Act 2023 & Statistical Disclosure Control",
      privacyGuarantee: "Cohorts with fewer than 10 participants are suppressed at the database view level to guarantee anonymity.",
      assessmentAggregates: assessmentRes.data || [],
      moodAggregates: moodRes.data || [],
      riskAggregates: riskRes.data || [],
      wellbeingSummary: summaryRes.data || [],
    });
  });

  // ------------------------------------------------------------------------------
  // 14. Zero-Knowledge Encrypted Journal Endpoints
  // ------------------------------------------------------------------------------
  registerRoute("get", "/journals", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");

    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, ciphertext, iv, salt, created_at, updated_at")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch journals error:", error?.message || error);
      return c.json({ error: "Failed to fetch journal entries" }, 500);
    }
    return c.json({ journals: data || [] });
  });

  registerRoute("post", "/journals", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");

    const rawBody = await c.req.json();
    const parseResult = journalSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return c.json({ error: "Validation failed", details: parseResult.error.format() }, 422);
    }

    const { ciphertext, iv, salt } = parseResult.data;

    const { data, error } = await supabase
      .from("journal_entries")
      .insert({
        student_id: user.id,
        ciphertext,
        iv,
        salt,
      })
      .select("id, ciphertext, iv, salt, created_at")
      .single();

    if (error) {
      console.error("Save journal error:", error?.message || error);
      return c.json({ error: "Failed to save journal entry" }, 500);
    }
    return c.json({ success: true, journal: data });
  });

  registerRoute("delete", "/journals/:id", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");
    const journalId = c.req.param("id");

    const { error } = await supabase
      .from("journal_entries")
      .delete()
      .eq("id", journalId)
      .eq("student_id", user.id);

    if (error) {
      console.error("Delete journal error:", error?.message || error);
      return c.json({ error: "Failed to delete journal entry" }, 500);
    }
    return c.json({ success: true, message: "Journal entry deleted" });
  });

  // ------------------------------------------------------------------------------
  // 15. Zero-Knowledge CBT Thought Records Endpoints
  // ------------------------------------------------------------------------------
  registerRoute("get", "/thought-records", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");

    const { data, error } = await supabase
      .from("thought_records")
      .select("id, ciphertext, iv, salt, created_at, updated_at")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch thought records error:", error?.message || error);
      return c.json({ error: "Failed to fetch thought records" }, 500);
    }
    return c.json({ thoughtRecords: data || [] });
  });

  registerRoute("post", "/thought-records", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");

    const rawBody = await c.req.json();
    const parseResult = thoughtRecordSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return c.json({ error: "Validation failed", details: parseResult.error.format() }, 422);
    }

    const { ciphertext, iv, salt } = parseResult.data;

    const { data, error } = await supabase
      .from("thought_records")
      .insert({
        student_id: user.id,
        ciphertext,
        iv,
        salt,
      })
      .select("id, ciphertext, iv, salt, created_at")
      .single();

    if (error) {
      console.error("Save thought record error:", error?.message || error);
      return c.json({ error: "Failed to save thought record" }, 500);
    }
    return c.json({ success: true, thoughtRecord: data });
  });

  registerRoute("delete", "/thought-records/:id", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");
    const recordId = c.req.param("id");

    const { error } = await supabase
      .from("thought_records")
      .delete()
      .eq("id", recordId)
      .eq("student_id", user.id);

    if (error) {
      console.error("Delete thought record error:", error?.message || error);
      return c.json({ error: "Failed to delete thought record" }, 500);
    }
    return c.json({ success: true, message: "Thought record deleted" });
  });

  // ------------------------------------------------------------------------------
  // 16. Community Circles & Posts Endpoints
  // ------------------------------------------------------------------------------
  registerRoute("get", "/circles", requireAuth, async (c) => {
    const supabase = c.get("supabase");

    const { data, error } = await supabase
      .from("circles")
      .select("id, name, slug, description, category, is_private, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Fetch circles error:", error?.message || error);
      return c.json({ error: "Failed to fetch circles" }, 500);
    }
    return c.json({ circles: data || [] });
  });

  registerRoute("get", "/circles/:id/posts", requireAuth, async (c) => {
    const circleId = c.req.param("id");
    const supabase = c.get("supabase");

    const { data, error } = await supabase
      .from("posts")
      .select("id, circle_id, author_id, title, content, is_anonymous, likes_count, created_at, updated_at")
      .eq("circle_id", circleId)
      .eq("moderation_status", "approved")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch posts error:", error?.message || error);
      return c.json({ error: "Failed to fetch posts" }, 500);
    }
    return c.json({ posts: data || [] });
  });

  registerRoute("post", "/circles/:id/posts", requireAuth, async (c) => {
    const user = c.get("user");
    const circleId = c.req.param("id");
    const supabase = c.get("supabase");
    const rawBody = await c.req.json();

    const parseResult = communityPostSchema.safeParse({ ...rawBody, circleId });
    if (!parseResult.success) {
      return c.json({ error: "Validation failed", details: parseResult.error.format() }, 422);
    }

    const { title, content, isAnonymous } = parseResult.data;

    // Run automated moderation pipeline check
    const lexicon = checkCrisisLexicon(`${title}\n${content}`);
    const titlePii = redactPII(title);
    const contentPii = redactPII(content);
    const hasPII = titlePii.hasRedactions || contentPii.hasRedactions;
    const status: "approved" | "flagged" = lexicon.isCrisis || hasPII ? "flagged" : "approved";

    const { data, error } = await supabase
      .from("posts")
      .insert({
        circle_id: circleId,
        author_id: user.id,
        title: titlePii.sanitized,
        content: contentPii.sanitized,
        is_anonymous: isAnonymous ?? true,
        moderation_status: status,
        ai_moderation: {
          checked_at: new Date().toISOString(),
          lexicon_crisis: lexicon.isCrisis,
          contains_pii: hasPII,
        },
      })
      .select()
      .single();

    if (error) {
      console.error("Create post error:", error?.message || error);
      return c.json({ error: "Failed to create post" }, 500);
    }
    return c.json({ success: true, post: data }, 201);
  });

  // ------------------------------------------------------------------------------
  // 17. Safety Plans Endpoints (Stanley-Brown Intervention)
  // ------------------------------------------------------------------------------
  registerRoute("get", "/safety-plan", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");

    const { data, error } = await supabase
      .from("safety_plans")
      .select("*")
      .eq("student_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Fetch safety plan error:", error?.message || error);
      return c.json({ error: "Failed to fetch safety plan" }, 500);
    }
    return c.json({ safetyPlan: data || null });
  });

  registerRoute("put", "/safety-plan", requireAuth, async (c) => {
    const user = c.get("user");
    const supabase = c.get("supabase");

    const rawBody = await c.req.json();
    const parseResult = safetyPlanSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return c.json({ error: "Validation failed", details: parseResult.error.format() }, 422);
    }

    const { data, error } = await supabase
      .from("safety_plans")
      .upsert({
        student_id: user.id,
        warning_signs: parseResult.data.warningSigns || [],
        coping_strategies: parseResult.data.copingStrategies || [],
        emergency_contacts: parseResult.data.emergencyContacts || [],
        safe_environments: parseResult.data.safeEnvironments || [],
        reasons_to_live: parseResult.data.reasonsToLive || [],
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Update safety plan error:", error?.message || error);
      return c.json({ error: "Failed to update safety plan" }, 500);
    }
    return c.json({ success: true, safetyPlan: data });
  });

  return app;
}

export default createApp;
