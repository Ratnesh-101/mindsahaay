import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());

import { fake, resetFake, spyFetch } from "../journal/testSupport";
import { callFunction } from "./http";

beforeEach(() => {
  resetFake();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callFunction", () => {
  it("sends the bearer token and a JSON body, and returns the parsed response", async () => {
    const spy = spyFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(callFunction("POST", "/appointments", { counsellorId: "c" })).resolves.toEqual({ ok: true });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test.supabase.co/functions/v1/make-server-6534ec8c/appointments");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ counsellorId: "c" }));
  });

  it("sends no body or content type for GET", async () => {
    const spy = spyFetch(() => new Response("{}", { status: 200 }));
    await callFunction("GET", "/institutions/i/analytics");
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("maps HTTP errors to ApiError with the server message and status", async () => {
    spyFetch(() => new Response(JSON.stringify({ error: "Slot is already booked" }), { status: 409 }));
    await expect(callFunction("POST", "/appointments", {})).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT", message: "Slot is already booked" });

    spyFetch(() => new Response("not json", { status: 403 }));
    await expect(callFunction("GET", "/x")).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    spyFetch(() => new Response("{}", { status: 500 }));
    await expect(callFunction("GET", "/x")).rejects.toMatchObject({ statusCode: 500, code: "REQUEST_FAILED" });
  });

  it("maps network failures to NetworkError", async () => {
    spyFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(callFunction("GET", "/x")).rejects.toMatchObject({ name: "NetworkError", statusCode: 503 });
  });

  it("requires a signed-in session", async () => {
    fake.signedIn = false;
    await expect(callFunction("GET", "/x")).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });
});
