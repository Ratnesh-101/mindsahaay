import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { clearDemoData, fetchDemoStatus, invalidateDemoDependents, loadDemoData, DemoDataUnavailableError } from "./api";
import { ApiError, AuthRequiredError, ValidationError } from "../../shared/lib/api/errors";
import { makeBackend, makeFakeSupabase, type FakeBackend } from "./testSupport";

const state = vi.hoisted(() => ({ fake: null as unknown }));

vi.mock("../../shared/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/lib/supabase")>();
  return {
    ...actual,
    supabase: new Proxy(
      {},
      { get: (_t, prop) => (state.fake as Record<string, unknown>)[prop as string] },
    ),
  };
});

let backend: FakeBackend;

beforeEach(() => {
  backend = makeBackend();
  state.fake = makeFakeSupabase(backend);
});

describe("demo-data api", () => {
  it("loadDemoData returns the typed counts from the RPC", async () => {
    await expect(loadDemoData()).resolves.toEqual({ moods: 26, assessments: 3 });
    expect(backend.rpcCalls).toEqual(["load_demo_data"]);
  });

  it("clearDemoData returns zeros when nothing was loaded", async () => {
    await expect(clearDemoData()).resolves.toEqual({ moods: 0, assessments: 0 });
  });

  it("requires a signed-in session before calling the RPC", async () => {
    backend.signedIn = false;
    await expect(loadDemoData()).rejects.toBeInstanceOf(AuthRequiredError);
    await expect(clearDemoData()).rejects.toBeInstanceOf(AuthRequiredError);
    await expect(fetchDemoStatus()).rejects.toBeInstanceOf(AuthRequiredError);
    expect(backend.rpcCalls).toEqual([]);
  });

  it("maps a missing function to DemoDataUnavailableError", async () => {
    backend.rpcError = { message: "not found", code: "PGRST202" };
    await expect(loadDemoData()).rejects.toBeInstanceOf(DemoDataUnavailableError);
  });

  it("maps other RPC failures to ApiError with the server code", async () => {
    backend.rpcError = { message: "denied", code: "42501", status: 403 };
    const error = await loadDemoData().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("42501");
    expect((error as ApiError).statusCode).toBe(403);
  });

  it("rejects an unexpected RPC payload instead of claiming success", async () => {
    backend.rpcPayload = { moods: "many" };
    await expect(loadDemoData()).rejects.toBeInstanceOf(ValidationError);
  });

  it("fetchDemoStatus counts demo rows in both tables", async () => {
    backend.counts = { mood_entries: 4, assessments: 1 };
    await expect(fetchDemoStatus()).resolves.toEqual({ moods: 4, assessments: 1 });
  });

  it("fetchDemoStatus surfaces query errors", async () => {
    backend.statusError = true;
    await expect(fetchDemoStatus()).rejects.toBeInstanceOf(ApiError);
  });

  it("invalidates everything that shows moods, assessments, insights or the dashboard, but not journals", async () => {
    const client = new QueryClient();
    for (const key of [["moods", 100], ["assessments", undefined], ["insights"], ["dashboard", "summary"], ["demo-data", "status"], ["journals", "locked"], ["safety_plan", "raw"], ["consents", "ledger"]]) {
      client.setQueryData(key, 1);
    }
    await invalidateDemoDependents(client);
    const stale = (key: unknown[]) => client.getQueryState(key)?.isInvalidated;
    expect(stale(["moods", 100])).toBe(true);
    expect(stale(["assessments", undefined])).toBe(true);
    expect(stale(["insights"])).toBe(true);
    expect(stale(["dashboard", "summary"])).toBe(true);
    expect(stale(["demo-data", "status"])).toBe(true);
    expect(stale(["journals", "locked"])).toBe(false);
    expect(stale(["safety_plan", "raw"])).toBe(false);
    expect(stale(["consents", "ledger"])).toBe(false);
  });
});
