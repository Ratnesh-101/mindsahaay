import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test: two lazy channels created with the SAME name must reach the real client with
// DIFFERENT topics, otherwise supabase-js hands back the first (already subscribed) channel and
// .on() throws "cannot add postgres_changes callbacks ... after subscribe()".
const created: string[] = [];

vi.mock("./supabaseClient", () => ({
  createSupabaseClient: () => ({
    channel: (topic: string) => {
      created.push(topic);
      const ch = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch), unsubscribe: vi.fn() };
      return ch;
    },
    removeChannel: vi.fn(),
  }),
}));

describe("lazy realtime channels", () => {
  beforeEach(() => {
    created.length = 0;
    vi.resetModules();
  });

  it("gives every subscription a unique topic even when the name repeats", async () => {
    const { supabase } = await import("./supabase");
    // The real client's typed overloads are irrelevant here: the facade forwards the arguments as given.
    type Loose = { on: (...a: unknown[]) => Loose; subscribe: () => Loose };
    const open = () => (supabase.channel("counsellor-risk-events") as unknown as Loose).on("postgres_changes", {}, () => {}).subscribe();
    const a = open();
    const b = open();
    await Promise.all([(a as unknown as { real: Promise<unknown> }).real, (b as unknown as { real: Promise<unknown> }).real]);

    expect(created).toHaveLength(2);
    expect(new Set(created).size).toBe(2);
    expect(created.every((t) => t.startsWith("counsellor-risk-events:"))).toBe(true);
  });
});
