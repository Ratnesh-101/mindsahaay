import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import {
  fetchConsentLedger,
  fetchActiveConsents,
  grantConsent,
  revokeConsent,
  type ConsentPurpose,
} from "./consents";
import { AuthRequiredError, ValidationError } from "./errors";
import { supabase } from "../supabase";
import { testServer, mockSession, MOCK_USER_ID } from "./testMocks";

beforeAll(() => testServer.listen());
afterEach(() => {
  testServer.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => testServer.close());

describe("consents API module (append-only ledger)", () => {
  it("throws AuthRequiredError if student is not authenticated", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(fetchConsentLedger()).rejects.toThrow(AuthRequiredError);
    await expect(grantConsent("data_processing")).rejects.toThrow(AuthRequiredError);
    await expect(revokeConsent("data_processing")).rejects.toThrow(AuthRequiredError);
  });

  it("validates consent purpose enum", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    await expect(
      grantConsent("invalid_purpose" as unknown as ConsentPurpose),
    ).rejects.toThrow(ValidationError);
  });

  it("appends grant to ledger with consented: true", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    let postedPayload: Record<string, unknown> | null = null;
    testServer.use(
      http.post("*/rest/v1/consents*", async ({ request }) => {
        postedPayload = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            id: "consent-grant-1",
            student_id: MOCK_USER_ID,
            purpose: postedPayload.purpose,
            consented: true,
            policy_version: "2023.1-DPDP",
            granted_at: new Date().toISOString(),
            revoked_at: null,
          },
          { status: 201 },
        );
      }),
    );

    const record = await grantConsent("counsellor_sharing");
    expect(record).toBeDefined();
    expect(record.purpose).toBe("counsellor_sharing");
    expect(record.consented).toBe(true);
    expect(postedPayload).toHaveProperty("purpose", "counsellor_sharing");
    expect(postedPayload).toHaveProperty("consented", true);
  });

  it("appends revocation to ledger with consented: false and revoked_at", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    let postedPayload: Record<string, unknown> | null = null;
    testServer.use(
      http.post("*/rest/v1/consents*", async ({ request }) => {
        postedPayload = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            id: "consent-revocation-1",
            student_id: MOCK_USER_ID,
            purpose: postedPayload.purpose,
            consented: false,
            policy_version: "2023.1-DPDP",
            granted_at: new Date().toISOString(),
            revoked_at: new Date().toISOString(),
          },
          { status: 201 },
        );
      }),
    );

    const record = await revokeConsent("analytics");
    expect(record).toBeDefined();
    expect(record.purpose).toBe("analytics");
    expect(record.consented).toBe(false);
    expect(postedPayload).toHaveProperty("consented", false);
    expect(postedPayload).toHaveProperty("revoked_at");
  });

  it("computes active consents correctly from latest append records", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    // Mock history:
    // data_processing was granted, then revoked
    // crisis_intervention was granted
    testServer.use(
      http.get("*/rest/v1/consents*", async () => {
        return HttpResponse.json([
          {
            id: "c-3",
            student_id: MOCK_USER_ID,
            purpose: "data_processing",
            consented: false,
            policy_version: "2023.1-DPDP",
            granted_at: "2026-11-19T01:00:00Z",
            revoked_at: "2026-11-19T01:00:00Z",
          },
          {
            id: "c-2",
            student_id: MOCK_USER_ID,
            purpose: "crisis_intervention",
            consented: true,
            policy_version: "2023.1-DPDP",
            granted_at: "2026-11-19T00:30:00Z",
            revoked_at: null,
          },
          {
            id: "c-1",
            student_id: MOCK_USER_ID,
            purpose: "data_processing",
            consented: true,
            policy_version: "2023.1-DPDP",
            granted_at: "2026-11-19T00:00:00Z",
            revoked_at: null,
          },
        ]);
      }),
    );

    const active = await fetchActiveConsents();
    expect(active.data_processing).toBe(false); // Revoked by latest record c-3
    expect(active.crisis_intervention).toBe(true); // Active from record c-2
    expect(active.analytics).toBe(false); // Never granted
  });
});
