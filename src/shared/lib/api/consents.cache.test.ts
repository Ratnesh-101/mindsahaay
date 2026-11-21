import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { grantConsent, revokeConsent, type ConsentPurpose } from "./consents";
import { supabase } from "../supabase";
import { testServer, mockSession, MOCK_USER_ID } from "./testMocks";

const warm = vi.fn();
const setCached = vi.fn();
vi.mock("../../../features/chat/api", () => ({
  warmCrisisConsentCache: (...a: unknown[]) => warm(...a),
  setCachedCrisisConsent: (...a: unknown[]) => setCached(...a),
}));

beforeAll(() => testServer.listen());
beforeEach(() => {
  warm.mockReset().mockResolvedValue(undefined);
  setCached.mockReset();
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: mockSession }, error: null });
});
afterEach(() => {
  testServer.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => testServer.close());

function mockInsert(consented: boolean) {
  testServer.use(
    http.post("*/rest/v1/consents*", async ({ request }) => {
      const body = (await request.json()) as { purpose: ConsentPurpose };
      const now = new Date().toISOString();
      return HttpResponse.json(
        {
          id: "c-1",
          student_id: MOCK_USER_ID,
          purpose: body.purpose,
          consented,
          policy_version: "2023.1-DPDP",
          granted_at: now,
          revoked_at: consented ? null : now,
        },
        { status: 201 },
      );
    }),
  );
}

describe("crisis-consent cache freshness", () => {
  it("refreshes the cache after granting crisis_intervention", async () => {
    mockInsert(true);
    await grantConsent("crisis_intervention");
    expect(warm).toHaveBeenCalledTimes(1);
    expect(setCached).not.toHaveBeenCalled();
  });

  it("writes false at once and then refreshes after withdrawing crisis_intervention", async () => {
    mockInsert(false);
    await revokeConsent("crisis_intervention");
    expect(setCached).toHaveBeenCalledWith(MOCK_USER_ID, false);
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it("still clears the cache when the refresh cannot reach the network", async () => {
    warm.mockRejectedValue(new Error("offline"));
    mockInsert(false);
    await expect(revokeConsent("crisis_intervention")).resolves.toMatchObject({ consented: false });
    expect(setCached).toHaveBeenCalledWith(MOCK_USER_ID, false);
  });

  it("does not fail the mutation when the refresh throws synchronously", async () => {
    warm.mockImplementation(() => {
      throw new Error("boom");
    });
    mockInsert(true);
    await expect(grantConsent("crisis_intervention")).resolves.toMatchObject({ consented: true });
  });

  it("leaves the cache alone for other purposes", async () => {
    mockInsert(true);
    await grantConsent("analytics");
    mockInsert(false);
    await revokeConsent("analytics");
    expect(warm).not.toHaveBeenCalled();
    expect(setCached).not.toHaveBeenCalled();
  });

  it("does not touch the cache when the insert fails", async () => {
    testServer.use(http.post("*/rest/v1/consents*", () => HttpResponse.json({ message: "no" }, { status: 400 })));
    await expect(revokeConsent("crisis_intervention")).rejects.toBeDefined();
    expect(setCached).not.toHaveBeenCalled();
    expect(warm).not.toHaveBeenCalled();
  });
});
