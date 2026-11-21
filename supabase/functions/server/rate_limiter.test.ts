// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./rate_limiter.ts";

let n = 0;
const key = () => `test-key-${++n}`;

describe("checkRateLimit (in-memory fallback)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the limit then blocks, reporting the reset delay", async () => {
    const k = key();
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit(k, 3, 60_000);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(2 - i);
    }
    const blocked = await checkRateLimit(k, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetInMs).toBeGreaterThan(0);
    expect(blocked.resetInMs).toBeLessThanOrEqual(60_000);
  });

  it("tracks keys independently", async () => {
    const a = key();
    const b = key();
    await checkRateLimit(a, 1, 60_000);
    expect((await checkRateLimit(a, 1, 60_000)).allowed).toBe(false);
    expect((await checkRateLimit(b, 1, 60_000)).allowed).toBe(true);
  });

  it("opens a new window after it expires", async () => {
    vi.useFakeTimers();
    const k = key();
    await checkRateLimit(k, 1, 1_000);
    expect((await checkRateLimit(k, 1, 1_000)).allowed).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect((await checkRateLimit(k, 1, 1_000)).allowed).toBe(true);
    vi.useRealTimers();
  });
});

describe("checkRateLimit (database token bucket)", () => {
  it("uses the RPC result and passes the expected parameters", async () => {
    const rpc = vi.fn(async () => ({ data: { allowed: false, remaining: 0, reset_in_ms: 4200 }, error: null }));
    const r = await checkRateLimit("chat:u1", 20, 60_000, { rpc });
    expect(r).toEqual({ allowed: false, remaining: 0, resetInMs: 4200 });
    expect(rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_key: "chat:u1",
      p_max_tokens: 20,
      p_window_seconds: 60,
      p_cost: 1,
    });
  });

  it("falls back to memory when the RPC errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rpc = vi.fn(async () => ({ data: null, error: { message: "db down" } }));
    const k = key();
    expect((await checkRateLimit(k, 1, 60_000, { rpc })).allowed).toBe(true);
    expect((await checkRateLimit(k, 1, 60_000, { rpc })).allowed).toBe(false);
    warn.mockRestore();
  });

  it("falls back to memory when the RPC throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rpc = vi.fn(async () => {
      throw new Error("network");
    });
    expect((await checkRateLimit(key(), 5, 60_000, { rpc })).allowed).toBe(true);
    warn.mockRestore();
  });
});
