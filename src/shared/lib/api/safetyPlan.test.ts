import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import {
  fetchSafetyPlan,
  saveSafetyPlan,
  encryptSafetyPlan,
  decryptSafetyPlan,
  type SafetyPlan,
} from "./safetyPlan";
import { AuthRequiredError, ValidationError, ApiError } from "./errors";
import { supabase } from "../supabase";
import { testServer, mockSession, MOCK_USER_ID } from "./testMocks";

beforeAll(() => testServer.listen());
afterEach(() => {
  testServer.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => testServer.close());

describe("safetyPlan API module (Stanley-Brown Suicide Safety Plan + encryption)", () => {
  const samplePlan: SafetyPlan = {
    warningSigns: ["Trouble sleeping", "Isolation in hostel room"],
    copingStrategies: ["4-7-8 breathing", "Listening to lo-fi audio sanctuary"],
    emergencyContacts: [
      { name: "Pooja Sharma", relationship: "Cousin / Peer", phone: "9876543210" },
    ],
    safeEnvironments: ["Campus library courtyard", "Hostel common room"],
    reasonsToLive: ["My younger sister", "Becoming a clinical researcher"],
    professionalSupport: [
      { name: "Dr. Ananya Roy", role: "Campus Psychologist", phone: "011-27667788" },
    ],
  };

  const testPassphrase = "safety-plan-passphrase-2026!";

  it("throws AuthRequiredError if student is not authenticated", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(fetchSafetyPlan()).rejects.toThrow(AuthRequiredError);
    await expect(saveSafetyPlan(samplePlan)).rejects.toThrow(AuthRequiredError);
  });

  it("validates safety plan schema", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    // Invalid emergency contact (missing phone)
    const invalidPlan = {
      ...samplePlan,
      emergencyContacts: [{ name: "Friend", relationship: "Peer" } as unknown as { name: string; relationship: string; phone: string }],
    };

    await expect(saveSafetyPlan(invalidPlan)).rejects.toThrow(ValidationError);
  });

  it("encrypts and decrypts full Stanley-Brown safety plan client-side", async () => {
    const envelope = await encryptSafetyPlan(samplePlan, testPassphrase);
    expect(envelope._isEncrypted).toBe(true);
    expect(envelope.ciphertext).toBeDefined();
    expect(envelope.iv).toBeDefined();
    expect(envelope.salt).toBeDefined();

    const decrypted = await decryptSafetyPlan(envelope, testPassphrase);
    expect(decrypted.warningSigns).toEqual(samplePlan.warningSigns);
    expect(decrypted.emergencyContacts).toEqual(samplePlan.emergencyContacts);
    expect(decrypted.reasonsToLive).toEqual(samplePlan.reasonsToLive);
  });

  it("throws ApiError when decrypting with wrong passphrase", async () => {
    const envelope = await encryptSafetyPlan(samplePlan, testPassphrase);
    await expect(decryptSafetyPlan(envelope, "wrong-key")).rejects.toThrow(ApiError);
  });

  it("fetches and decrypts student safety plan via Supabase", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const envelope = await encryptSafetyPlan(samplePlan, testPassphrase);

    testServer.use(
      http.get("*/rest/v1/safety_plans*", async () => {
        return HttpResponse.json({
          id: "sp-1",
          student_id: MOCK_USER_ID,
          warning_signs: ["_encrypted_payload_"],
          coping_strategies: [],
          emergency_contacts: [],
          safe_environments: [],
          reasons_to_live: [],
          professional_support: envelope,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }),
    );

    const plan = await fetchSafetyPlan(testPassphrase);
    expect(plan).not.toBeNull();
    expect(plan?.warningSigns).toEqual(samplePlan.warningSigns);
    expect(plan?.reasonsToLive).toEqual(samplePlan.reasonsToLive);
    expect(plan?.isEncrypted).toBe(false);
  });

  it("returns encrypted placeholder when fetched without passphrase", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const envelope = await encryptSafetyPlan(samplePlan, testPassphrase);

    testServer.use(
      http.get("*/rest/v1/safety_plans*", async () => {
        return HttpResponse.json({
          id: "sp-1",
          student_id: MOCK_USER_ID,
          warning_signs: ["_encrypted_payload_"],
          coping_strategies: [],
          emergency_contacts: [],
          safe_environments: [],
          reasons_to_live: [],
          professional_support: envelope,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }),
    );

    const plan = await fetchSafetyPlan();
    expect(plan).not.toBeNull();
    expect(plan?.isEncrypted).toBe(true);
    expect(plan?.warningSigns[0]).toContain("Encrypted");
  });
});
