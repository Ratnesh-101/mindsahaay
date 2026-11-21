import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { exportStudentData, deleteStudentAccount } from "./account";
import { AuthRequiredError } from "./errors";
import { supabase } from "../supabase";
import { testServer, mockSession, MOCK_USER_ID } from "./testMocks";

beforeAll(() => testServer.listen());
afterEach(() => {
  testServer.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => testServer.close());

describe("account API module (DPDP Act 2023 Portability & Right to Erasure)", () => {
  it("throws AuthRequiredError if student is unauthenticated", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(exportStudentData()).rejects.toThrow(AuthRequiredError);
    await expect(deleteStudentAccount()).rejects.toThrow(AuthRequiredError);
  });

  it("exports machine-readable JSON copy of all user data (DPDP Act compliance)", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const exportBundle = await exportStudentData();
    expect(exportBundle).toBeDefined();
    expect(exportBundle.metadata).toBeDefined();
    expect(exportBundle.metadata.regulations).toContain("DPDP Act 2023");
    expect(exportBundle.metadata.studentId).toBe(MOCK_USER_ID);
    expect(exportBundle).toHaveProperty("moods");
    expect(exportBundle).toHaveProperty("assessments");
    expect(exportBundle).toHaveProperty("journals");
    expect(exportBundle).toHaveProperty("consents");
  });

  it("permanently erases student account and signs out (DPDP Right to Erasure)", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const signoutSpy = vi.spyOn(supabase.auth, "signOut").mockResolvedValue({ error: null });

    const result = await deleteStudentAccount();
    expect(result.success).toBe(true);
    expect(result.erasedAt).toBeDefined();
    expect(signoutSpy).toHaveBeenCalledTimes(1);
  });
});
