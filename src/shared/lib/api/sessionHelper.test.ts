import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session, AuthError } from "@supabase/supabase-js";
import { getAuthenticatedSession } from "./sessionHelper";
import { AuthRequiredError } from "./errors";
import { supabase } from "../supabase";

describe("Session Helper (getAuthenticatedSession)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns session and user when active session is present", async () => {
    const mockSession = {
      access_token: "mock-jwt-token",
      user: {
        id: "student-uuid-42",
        email: "student@delhi.ac.in",
      },
    };

    vi.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: { session: mockSession as unknown as Session },
      error: null,
    });

    const result = await getAuthenticatedSession();
    expect(result.session).toBe(mockSession);
    expect(result.user.id).toBe("student-uuid-42");
    expect(result.user.email).toBe("student@delhi.ac.in");
  });

  it("throws AuthRequiredError when session data is missing or null", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    await expect(getAuthenticatedSession()).rejects.toThrow(AuthRequiredError);
  });

  it("throws AuthRequiredError when supabase.auth.getSession returns an error", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: { session: null },
      error: { name: "AuthError", message: "Session expired", status: 401 } as unknown as AuthError,
    });

    await expect(getAuthenticatedSession()).rejects.toThrow(AuthRequiredError);
  });
});
