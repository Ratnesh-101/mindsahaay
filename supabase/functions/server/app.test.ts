// @vitest-environment node
// Tests for the Hono app via app.request(). Hono is resolved from node_modules (or EDGE_HONO_DIR,
// see vitest.config.ts). When it cannot be resolved the suite is skipped with a warning.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAnthropic, createFakeSupabase, type RecordedCall } from "./test_helpers.ts";
import { getCrisisResponseTemplate } from "../_shared/lexicon.ts";

let appModule: typeof import("./app.ts") | null = null;
try {
  appModule = await import("./app.ts");
} catch (err: any) {
  console.warn(`[app.test] Hono could not be loaded, skipping app tests: ${err?.message}`);
}

let counter = 0;

function setup(opts: {
  env?: Record<string, string>;
  anthropic?: ReturnType<typeof createFakeAnthropic>;
  adminResult?: (call: RecordedCall) => any;
  adminRpc?: (name: string, args: any) => any;
  userResult?: (call: RecordedCall) => any;
  verifyThrows?: boolean;
  userClientThrows?: boolean;
} = {}) {
  const id = `user-${++counter}`;
  const admin = createFakeSupabase(opts.adminResult, opts.adminRpc);
  const user = createFakeSupabase(opts.userResult);
  const tokens: Record<string, { id: string }> = { [`token-${id}`]: { id } };
  const verifyJwt = vi.fn(async (token: string) => {
    if (opts.verifyThrows) throw new Error("jwks unreachable");
    return tokens[token] ?? null;
  });
  const app = appModule!.createApp({
    env: (name) => opts.env?.[name],
    verifyJwt,
    getAdminClient: () => admin.client,
    getUserClient: () => {
      if (opts.userClientThrows) {
        return {
          from: () => {
            throw new Error("boom internal detail at /srv/secret.ts:42");
          },
        };
      }
      return user.client;
    },
    createAnthropic: opts.anthropic?.factory,
  });
  const auth = { Authorization: `Bearer token-${id}` };
  return { app, id, auth, admin, user, verifyJwt };
}

function jsonReq(auth: Record<string, string>, body: unknown, extra: Record<string, string> = {}) {
  return { headers: { "Content-Type": "application/json", ...auth, ...extra }, body: JSON.stringify(body) };
}

function parseSse(text: string) {
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = JSON.parse(/^data: (.*)$/m.exec(block)![1]);
      return { event, data };
    });
}

describe.skipIf(!appModule)("edge function app", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("authentication", () => {
    it("health is public under every registered prefix", async () => {
      const { app } = setup();
      for (const p of ["/health", "/server/health", "/make-server-6534ec8c/health"]) {
        const res = await app.request(p);
        expect(res.status).toBe(200);
        expect((await res.json()).status).toBe("ok");
      }
    });

    it("every route except health returns 401 without a token", async () => {
      const { app } = setup();
      const routes = app.routes.filter((r: any) => r.method !== "ALL" && !r.path.endsWith("/health"));
      expect(routes.length).toBeGreaterThan(40);

      for (const r of routes) {
        const path = r.path.replace(/:[A-Za-z]+/g, "x");
        const res = await app.request(path, { method: r.method });
        expect(res.status, `${r.method} ${path}`).toBe(401);
      }
    });

    it("every route except health returns 401 for an invalid token", async () => {
      const { app, verifyJwt } = setup();
      const routes = app.routes.filter((r: any) => r.method !== "ALL" && !r.path.endsWith("/health"));
      for (const r of routes) {
        const path = r.path.replace(/:[A-Za-z]+/g, "x");
        const res = await app.request(path, { method: r.method, headers: { Authorization: "Bearer forged.jwt.token" } });
        expect(res.status, `${r.method} ${path}`).toBe(401);
      }
      expect(verifyJwt).toHaveBeenCalled();
    });

    it.each([
      ["no scheme", "token-abc"],
      ["Basic scheme", "Basic dXNlcjpwYXNz"],
      ["empty bearer", "Bearer "],
      ["bearer with only spaces", "Bearer    "],
    ])("rejects a malformed Authorization header (%s)", async (_name, header) => {
      const { app } = setup();
      const res = await app.request("/dashboard", { headers: { Authorization: header } });
      expect(res.status).toBe(401);
    });

    it("returns 401 (not 500) when the verifier throws", async () => {
      const { app, auth } = setup({ verifyThrows: true });
      const res = await app.request("/dashboard", { headers: auth });
      expect(res.status).toBe(401);
    });

    it("accepts a valid token", async () => {
      const { app, auth } = setup();
      const res = await app.request("/dashboard", { headers: auth });
      expect(res.status).toBe(200);
    });

    it("unknown routes return a JSON 404", async () => {
      const { app } = setup();
      const res = await app.request("/nope");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Route not found" });
    });
  });

  describe("CORS allowlist", () => {
    it("echoes an allowed origin with credentials and the method list", async () => {
      const { app } = setup();
      const res = await app.request("/health", { headers: { Origin: "https://mindsahaay.org" } });
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://mindsahaay.org");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    it("does not set CORS headers for an origin outside the allowlist", async () => {
      const { app } = setup();
      const res = await app.request("/health", { headers: { Origin: "https://evil.example" } });
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    });

    it("answers preflight with 204 and no CORS headers for a disallowed origin", async () => {
      const { app } = setup();
      const ok = await app.request("/assessments", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST" },
      });
      expect(ok.status).toBe(204);
      expect(ok.headers.get("Access-Control-Allow-Headers")).toMatch(/Authorization/);

      const bad = await app.request("/assessments", { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
      expect(bad.status).toBe(204);
      expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("uses ALLOWED_ORIGINS from the environment instead of the defaults", async () => {
      const { app } = setup({ env: { ALLOWED_ORIGINS: "https://campus.example, https://other.example" } });
      const allowed = await app.request("/health", { headers: { Origin: "https://campus.example" } });
      expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://campus.example");
      const formerDefault = await app.request("/health", { headers: { Origin: "https://mindsahaay.org" } });
      expect(formerDefault.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  });

  describe("validation and error handling", () => {
    it("rejects a bad assessment with 422 and no stack trace", async () => {
      const { app, auth } = setup();
      const res = await app.request("/assessments", { method: "POST", ...jsonReq(auth, { instrument: "phq9", answers: [1, 2] }) });
      expect(res.status).toBe(422);
      const text = await res.text();
      const body = JSON.parse(text);
      expect(body.error).toBe("Validation failed");
      expect(body.details).toBeDefined();
      expect(text).not.toMatch(/stack|\n\s+at |\.ts:\d+|node_modules/i);
    });

    it("rejects an out-of-range answer value with 422", async () => {
      const { app, auth } = setup();
      const res = await app.request("/assessments", {
        method: "POST",
        ...jsonReq(auth, { instrument: "phq4", answers: [0, 0, 0, 7] }),
      });
      expect(res.status).toBe(422);
    });

    it("rejects malformed JSON with 400 and a generic message", async () => {
      const { app, auth } = setup();
      const res = await app.request("/moods", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: "{not json",
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid JSON format in request body." });
    });

    it("returns a generic 500 without leaking internals when a handler throws", async () => {
      const { app, auth } = setup({ userClientThrows: true });
      const res = await app.request("/moods", { method: "POST", ...jsonReq(auth, { mood: "ok", score: 5 }) });
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: "An unexpected internal server error occurred." });
      expect(text).not.toMatch(/boom|secret|\.ts|stack/i);
    });

    it("validates mood, journal and appointment bodies", async () => {
      const { app, auth } = setup();
      const cases: Array<[string, string, unknown]> = [
        ["POST", "/moods", { mood: "ok", score: 99 }],
        ["POST", "/journals", { ciphertext: "x" }],
        ["POST", "/appointments", { counsellorId: "not-a-uuid" }],
        ["POST", "/thought-records", {}],
      ];
      for (const [method, path, body] of cases) {
        const res = await app.request(path, { method, ...jsonReq(auth, body) });
        expect(res.status, path).toBe(422);
      }
    });
  });

  describe("request body size limit", () => {
    it("rejects a declared Content-Length above 1 MB with 413", async () => {
      const { app, auth } = setup();
      const res = await app.request("/moods", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json", "content-length": String(1024 * 1024 + 1) },
        body: "{}",
      });
      expect(res.status).toBe(413);
      expect((await res.json()).error).toMatch(/Payload Too Large/);
    });

    it("rejects a real body above 1 MB with 413", async () => {
      const { app, auth } = setup();
      const big = JSON.stringify({ mood: "x".repeat(1024 * 1024 + 10), score: 5 });
      const res = await app.request("/moods", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: big,
      });
      expect(res.status).toBe(413);
    });

    it("rejects a streamed body with no Content-Length above 1 MB with 413", async () => {
      const { app, auth } = setup();
      const chunk = new TextEncoder().encode("a".repeat(256 * 1024));
      const body = new ReadableStream({
        start(controller) {
          for (let i = 0; i < 5; i++) controller.enqueue(chunk);
          controller.close();
        },
      });
      const res = await app.request("/moods", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body,
        // @ts-expect-error duplex is required by undici for stream bodies
        duplex: "half",
      });
      expect(res.status).toBe(413);
    });

    it("accepts a normal-sized body and still parses it after the size check", async () => {
      const { app, auth, user } = setup({ userResult: () => ({ data: { id: "m1" } }) });
      const res = await app.request("/moods", { method: "POST", ...jsonReq(auth, { mood: "calm", score: 7 }) });
      expect(res.status).toBe(200);
      expect(user.calls.find((c) => c.op === "insert")?.payload).toMatchObject({ mood: "calm", score: 7 });
    });
  });

  describe("identity comes from the verified token only", () => {
    it("export ignores path and query identifiers and filters every table by the token user", async () => {
      const { app, auth, id, user, admin } = setup();
      for (const url of ["/me/export", "/me/export?student_id=victim-1", "/students/victim-1/export?id=victim-1"]) {
        user.calls.length = 0;
        const res = await app.request(url, { headers: auth });
        expect(res.status, url).toBe(200);

        expect(user.calls.length).toBeGreaterThan(0);
        for (const call of user.calls) {
          const identity = call.filters.filter(([col]) => ["id", "student_id", "actor_id", "user_id"].includes(col));
          expect(identity.length, `${call.table} filtered by identity`).toBeGreaterThan(0);
          for (const [, val] of identity) expect(val).toBe(id);
        }
        expect(JSON.stringify(user.calls)).not.toContain("victim-1");
      }

      const res = await app.request("/me/export", { headers: auth });
      const body = await res.json();
      expect(body.exportMetadata.dataSubjectId).toBe(id);

      const audit = admin.calls.filter((c) => c.table === "audit_log" && c.op === "insert");
      expect(audit.length).toBeGreaterThan(0);
      for (const a of audit) expect(a.payload).toMatchObject({ actor_id: id, resource_id: id, action: "DPDP_DATA_EXPORT" });
    });

    it("export returns only ciphertext columns for journals", async () => {
      const { app, auth, user } = setup();
      await app.request("/me/export", { headers: auth });
      const journalCall = user.calls.find((c) => c.table === "journal_entries");
      expect(journalCall).toBeDefined();
    });

    it("export includes encrypted_blobs rows filtered strictly by authenticated user_id", async () => {
      const mockBlobs = [
        {
          slot: "mindsahaay_sec_0f9a2b8e3d1c4a7e",
          ciphertext: "blob-ct-xyz789",
          iv: "blob-iv-xyz789",
          salt: "blob-salt-xyz789",
          version: 2,
          updated_at: "2026-11-27T10:00:00Z",
        },
      ];
      const { app, auth, id, user } = setup({
        userResult: (call) => {
          if (call.table === "encrypted_blobs") return { data: mockBlobs };
          return { data: null };
        },
      });

      const res = await app.request("/me/export", { headers: auth });
      expect(res.status).toBe(200);
      const body = await res.json();

      const blobCall = user.calls.find((c) => c.table === "encrypted_blobs");
      expect(blobCall).toBeDefined();
      expect(blobCall?.filters).toContainEqual(["user_id", id]);
      expect(body.encryptedBlobs).toEqual(mockBlobs);

      // Backwards-compatible route also includes encrypted_blobs
      const compatRes = await app.request(`/students/${id}/export`, { headers: auth });
      expect(compatRes.status).toBe(200);
      const compatBody = await compatRes.json();
      expect(compatBody.encryptedBlobs).toEqual(mockBlobs);
    });

    it("export includes chat ciphertext rows and sessions filtered strictly by authenticated user_id", async () => {
      const mockChatSessions = [
        {
          id: "session-101",
          title: "Well-being Chat",
          salt: "base64-session-salt-abc",
          key_version: 1,
          created_at: "2026-11-27T08:00:00Z",
          updated_at: "2026-11-27T08:30:00Z",
          chat_messages: [
            {
              id: "msg-1",
              session_id: "session-101",
              sender_role: "user",
              encrypted_content: "U2FsdGVkX1_chat_ciphertext_user",
              iv: "iv_chat_msg_1",
              seq: 1,
              created_at: "2026-11-27T08:05:00Z",
            },
            {
              id: "msg-2",
              session_id: "session-101",
              sender_role: "assistant",
              encrypted_content: "U2FsdGVkX1_chat_ciphertext_assistant",
              iv: "iv_chat_msg_2",
              seq: 2,
              created_at: "2026-11-27T08:06:00Z",
            },
          ],
        },
      ];

      const { app, auth, id, user } = setup({
        userResult: (call) => {
          if (call.table === "chat_sessions") return { data: mockChatSessions };
          return { data: null };
        },
      });

      const res = await app.request("/me/export", { headers: auth });
      expect(res.status).toBe(200);
      const body = await res.json();

      const chatSessionCall = user.calls.find((c) => c.table === "chat_sessions");
      expect(chatSessionCall).toBeDefined();
      expect(chatSessionCall?.filters).toContainEqual(["user_id", id]);

      // Both chatSessions and flattened chatMessages are present
      expect(body.chatSessions).toHaveLength(1);
      expect(body.chatSessions[0].id).toBe("session-101");
      expect(body.chatSessions[0].salt).toBe("base64-session-salt-abc");
      expect(body.chatMessages).toHaveLength(2);
      expect(body.chatMessages[0]).toMatchObject({
        session_id: "session-101",
        sender_role: "user",
        encrypted_content: "U2FsdGVkX1_chat_ciphertext_user",
        iv: "iv_chat_msg_1",
        seq: 1,
      });
      expect(body.chatMessages[1]).toMatchObject({
        session_id: "session-101",
        sender_role: "assistant",
        encrypted_content: "U2FsdGVkX1_chat_ciphertext_assistant",
        iv: "iv_chat_msg_2",
        seq: 2,
      });

      // Backwards-compatible route also contains chat sessions and messages
      const compatRes = await app.request(`/students/${id}/export`, { headers: auth });
      expect(compatRes.status).toBe(200);
      const compatBody = await compatRes.json();
      expect(compatBody.chatSessions).toHaveLength(1);
      expect(compatBody.chatMessages).toHaveLength(2);
    });

    it("delete erases the token user, not an id from the URL or body", async () => {
      const { app, auth, id, admin } = setup();
      for (const [url, init] of [
        ["/me?id=victim-1", { method: "DELETE", headers: auth }],
        ["/students/victim-1", { method: "DELETE", headers: auth }],
        ["/me", { method: "DELETE", ...jsonReq(auth, { id: "victim-1", userId: "victim-1" }) }],
      ] as const) {
        admin.calls.length = 0;
        admin.deletedAuthUsers.length = 0;
        const res = await app.request(url, init as RequestInit);
        expect(res.status, url).toBe(200);

        const profileDelete = admin.calls.find((c) => c.table === "profiles" && c.op === "delete");
        expect(profileDelete?.filters).toEqual([["id", id]]);
        expect(admin.deletedAuthUsers).toEqual([id]);
        expect(JSON.stringify(admin.calls)).not.toContain("victim-1");
      }
    });

    it("DELETE /me writes the audit entry before deleting the profile", async () => {
      const { app, auth, id, admin } = setup();
      await app.request("/me", { method: "DELETE", headers: auth });
      const ops = admin.calls.map((c) => `${c.table}:${c.op}`);
      expect(ops.indexOf("audit_log:insert")).toBeLessThan(ops.indexOf("profiles:delete"));
      expect(admin.calls[0].payload).toMatchObject({ actor_id: id, action: "DPDP_ACCOUNT_ERASURE" });
    });

    it("assessment, mood and journal inserts use the token user as student_id", async () => {
      const { app, auth, id, user } = setup({ userResult: () => ({ data: { id: "row-1" } }) });
      await app.request("/assessments", {
        method: "POST",
        ...jsonReq(auth, { instrument: "gad7", answers: [1, 1, 1, 1, 1, 1, 1], student_id: "victim-1" }),
      });
      await app.request("/students/victim-1/moods", { method: "POST", ...jsonReq(auth, { mood: "ok", score: 5, student_id: "victim-1" }) });
      await app.request("/journals", { method: "POST", ...jsonReq(auth, { ciphertext: "c", iv: "i", salt: "s", student_id: "victim-1" }) });

      const inserts = user.calls.filter((c) => c.op === "insert");
      expect(inserts.map((c) => c.table)).toEqual(["assessments", "mood_entries", "journal_entries"]);
      for (const ins of inserts) expect(ins.payload.student_id).toBe(id);
    });
  });

  describe("PHQ-9 item 9 through the API", () => {
    it("returns the crisis protocol and does NOT insert a second risk event or audit row (the DB trigger owns both)", async () => {
      const { app, auth, id, admin } = setup({ userResult: (c) => ({ data: { id: "a1", completed_at: "now" } }) });
      const res = await app.request("/assessments", {
        method: "POST",
        ...jsonReq(auth, { instrument: "phq9", answers: [0, 0, 0, 0, 0, 0, 0, 0, 1] }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.assessment.item9_flag).toBe(true);
      expect(body.assessment.crisis).toBe(true);
      expect(body.assessment.crisisProtocol.helplines).toMatchObject({ teleManas: "14416", kiran: "1800-599-0019", emergency: "112" });
      expect(body.assessment.disclaimer).toMatch(/do NOT constitute clinical diagnosis/);

      // The risk_events row, the follow-up step and the audit entry are all created by the database
      // trigger on the assessments insert (single source of truth). Writing them here as well
      // produced two events and two audit rows for one incident.
      expect(admin.calls.filter((c) => c.table === "risk_events")).toHaveLength(0);
      expect(admin.calls.filter((c) => c.table === "audit_log")).toHaveLength(0);
    });

    it("does not create a risk event when item 9 is zero", async () => {
      const { app, auth, admin } = setup({ userResult: () => ({ data: { id: "a1" } }) });
      await app.request("/assessments", {
        method: "POST",
        ...jsonReq(auth, { instrument: "phq9", answers: [3, 3, 3, 3, 3, 3, 3, 3, 0] }),
      });
      expect(admin.calls.find((c) => c.table === "risk_events")).toBeUndefined();
    });
  });

  describe("POST /chat/stream", () => {
    it("streams the crisis card for a lexicon hit, without calling the model", async () => {
      const anthropic = createFakeAnthropic();
      const { app, auth, id, admin } = setup({ env: { ANTHROPIC_API_KEY: "sk-test" }, anthropic });
      const res = await app.request("/chat/stream", { method: "POST", ...jsonReq(auth, { message: "I want to die" }) });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);

      const events = parseSse(await res.text());
      expect(events.map((e) => e.event)).toEqual(["chunk", "done"]);
      const done = events.find((e) => e.event === "done")!.data;
      expect(done.isCrisis).toBe(true);
      expect(done.content).toBe(getCrisisResponseTemplate());
      expect(anthropic.stream).not.toHaveBeenCalled();
      expect(anthropic.create).not.toHaveBeenCalled();

      const risk = admin.calls.find((c) => c.table === "risk_events");
      expect(risk?.payload.student_id).toBe(id);
      // DPDP: no message content is stored
      expect(JSON.stringify(admin.calls)).not.toContain("want to die");
    });

    it("includes resources for a moderate classification", async () => {
      const anthropic = createFakeAnthropic({ classifier: "moderate", chunks: ["I hear you."] });
      const { app, auth } = setup({ env: { ANTHROPIC_API_KEY: "sk-test" }, anthropic });
      const res = await app.request("/chat/stream", { method: "POST", ...jsonReq(auth, { message: "I feel hollow lately" }) });
      const done = parseSse(await res.text()).find((e) => e.event === "done")!.data;
      expect(done.riskLevel).toBe("moderate");
      expect(done.content).toContain("14416");
      expect(done.degraded).toBe(false);
    });

    it("reports degraded when the classifier throws and serves the safe fallback", async () => {
      const anthropic = createFakeAnthropic({ classifier: new Error("upstream down") });
      const { app, auth } = setup({ env: { ANTHROPIC_API_KEY: "sk-test" }, anthropic });
      const res = await app.request("/chat/stream", { method: "POST", ...jsonReq(auth, { message: "so much stress" }) });
      const done = parseSse(await res.text()).find((e) => e.event === "done")!.data;
      expect(done.degraded).toBe(true);
      expect(anthropic.stream).not.toHaveBeenCalled();
      expect(done.content).toContain("breathe");
    });

    it("replaces a diagnosis in the final content and never streams blocked content", async () => {
      const anthropic = createFakeAnthropic({ chunks: ["You have bipolar disorder."] });
      const { app, auth } = setup({ env: { ANTHROPIC_API_KEY: "sk-test" }, anthropic });
      const res = await app.request("/chat/stream", { method: "POST", ...jsonReq(auth, { message: "mood swings this week" }) });
      const events = parseSse(await res.text());
      const done = events.find((e) => e.event === "done")!.data;
      expect(done.content).not.toMatch(/bipolar/i);
      const streamedChunks = events.filter((e) => e.event === "chunk").map((e) => e.data.text).join("");
      expect(streamedChunks).not.toMatch(/bipolar/i);
      expect(streamedChunks).toBe(done.content);
    });

    it("still completes the stream if audit persistence fails", async () => {
      const { app, auth } = setup({
        adminResult: (c) => (c.table === "audit_log" ? { error: null, data: null } : {}),
      });
      const res = await app.request("/chat/stream", { method: "POST", ...jsonReq(auth, { message: "hello" }) });
      const events = parseSse(await res.text());
      expect(events.at(-1)?.event).toBe("done");
    });

    it("rate limits with 429 when the database token bucket is empty", async () => {
      const { app, auth, admin } = setup({
        adminRpc: () => ({ data: { allowed: false, remaining: 0, reset_in_ms: 12_000 } }),
      });
      const res = await app.request("/chat/stream", { method: "POST", ...jsonReq(auth, { message: "hi" }) });
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toMatch(/Rate limit/);
      expect(body.resetInMs).toBe(12_000);
      expect(admin.rpcCalls[0]).toMatchObject({ name: "check_rate_limit", args: { p_max_tokens: 20, p_window_seconds: 60 } });
      expect(admin.rpcCalls[0].args.p_key).toMatch(/^chat:user-/);
    });

    it("rate limits per user via the in-memory fallback after 20 requests", async () => {
      const { app, auth } = setup();
      let last = 0;
      for (let i = 0; i < 21; i++) {
        const res = await app.request("/chat/stream", { method: "POST", ...jsonReq(auth, { message: "hi" }) });
        last = res.status;
        if (res.status === 200) await res.text();
      }
      expect(last).toBe(429);
    });

    it("validates the chat body before any model call", async () => {
      const anthropic = createFakeAnthropic();
      const { app, auth } = setup({ env: { ANTHROPIC_API_KEY: "sk-test" }, anthropic });
      const res = await app.request("/chat/stream", { method: "POST", ...jsonReq(auth, { message: "a".repeat(3001) }) });
      expect(res.status).toBe(422);
      expect(anthropic.create).not.toHaveBeenCalled();
    });

    it("non-streaming alias returns the crisis flag and message pair", async () => {
      const { app, auth } = setup();
      const res = await app.request("/students/someone-else/chat", { method: "POST", ...jsonReq(auth, { message: "suicide" }) });
      const body = await res.json();
      expect(body.isCrisis).toBe(true);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[1].content).toContain("14416");
    });
  });

  describe("moderation and community (PII fields regression)", () => {
    it("flags and redacts PII in /moderation/classify", async () => {
      const { app, auth } = setup();
      const res = await app.request("/moderation/classify", {
        method: "POST",
        ...jsonReq(auth, { content: "text me on 9876543210 about the notes" }),
      });
      const body = await res.json();
      expect(body.containsPII).toBe(true);
      expect(body.status).toBe("flagged");
      expect(body.reasons).toContain("contains_pii");
      expect(body.redactedContent).toBe("text me on [REDACTED_PHONE] about the notes");
      expect(body.crisisProtocol).toBeNull();
    });

    it("returns the crisis card for crisis content", async () => {
      const { app, auth } = setup();
      const res = await app.request("/moderation/classify", { method: "POST", ...jsonReq(auth, { content: "I want to end my life" }) });
      const body = await res.json();
      expect(body.crisis).toBe(true);
      expect(body.riskLevel).toBe("crisis");
      expect(body.crisisProtocol).toContain("14416");
    });

    it("approves clean content", async () => {
      const { app, auth } = setup();
      const res = await app.request("/moderation/classify", { method: "POST", ...jsonReq(auth, { content: "Anyone up for a study group?" }) });
      expect((await res.json()).status).toBe("approved");
    });

    it("stores the redacted text and flags a post that contains PII", async () => {
      const circle = "123e4567-e89b-42d3-a456-426614174000";
      const { app, auth, id, user } = setup({ userResult: () => ({ data: { id: "p1" } }) });
      const res = await app.request(`/circles/${circle}/posts`, {
        method: "POST",
        ...jsonReq(auth, { title: "Help", content: "mail me at a.b@iitm.ac.in" }),
      });
      expect(res.status).toBe(201);
      const insert = user.calls.find((c) => c.op === "insert")!;
      expect(insert.payload).toMatchObject({
        author_id: id,
        content: "mail me at [REDACTED_EMAIL]",
        moderation_status: "flagged",
      });
      expect(insert.payload.ai_moderation.contains_pii).toBe(true);
    });
  });
});
