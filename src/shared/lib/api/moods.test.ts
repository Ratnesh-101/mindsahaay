import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { fetchMoods, addMood } from "./moods";
import { AuthRequiredError, ValidationError } from "./errors";
import { supabase } from "../supabase";
import { testServer, mockSession } from "./testMocks";
import { createVault, generateRecoveryCode, lockVault } from "../../../features/journal/vault";
import { getOutboxStatus, clearAllOutboxDbs } from "../offline/outbox";

beforeAll(() => testServer.listen());
afterEach(async () => {
  testServer.resetHandlers();
  vi.restoreAllMocks();
  lockVault();
  await clearAllOutboxDbs();
});
afterAll(() => testServer.close());

describe("moods API module", () => {
  it("throws AuthRequiredError if student is not authenticated", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(fetchMoods()).rejects.toThrow(AuthRequiredError);
    await expect(addMood({ mood: "Calm", score: 8 })).rejects.toThrow(AuthRequiredError);
  });

  it("validates mood input using Zod schema", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    // Score out of range (greater than 10)
    await expect(addMood({ mood: "Stressed", score: 15 })).rejects.toThrow(ValidationError);

    // Score out of range (less than 1)
    await expect(addMood({ mood: "Stressed", score: 0 })).rejects.toThrow(ValidationError);

    // Empty mood string
    await expect(addMood({ mood: "", score: 5 })).rejects.toThrow(ValidationError);
  });

  it("successfully fetches mood entries when authenticated", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const moods = await fetchMoods({ limit: 10 });
    expect(Array.isArray(moods)).toBe(true);
    expect(moods.length).toBeGreaterThan(0);
    expect(moods[0]).toHaveProperty("mood", "Calm");
    expect(moods[0]).toHaveProperty("score", 8);
  });

  it("successfully adds a mood entry", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const created = await addMood({
      mood: "Peaceful",
      score: 9,
      tags: ["Hostel", "Meditation"],
      notes: "Feeling grounded before midterms",
    });

    expect(created).toBeDefined();
    expect(created.mood).toBe("Peaceful");
    expect(created.score).toBe(9);
  });

  it("enqueues mood entry when offline with a client UUID", async () => {
    sessionStorage.setItem("mindsahaay_demo_mode", "true");
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    await createVault("test-passphrase-2026", generateRecoveryCode());

    const created = await addMood({
      mood: "Grounded",
      score: 7,
      tags: ["Walk"],
      notes: "Saved offline",
    });

    expect(created).toBeDefined();
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created.mood).toBe("Grounded");
    expect(created.score).toBe(7);
    expect(created.created_at).toBeDefined();

    const status = await getOutboxStatus(mockSession.user.id);
    expect(status.moods).toBe(1);
    expect(status.pending).toBe(1);
  });
});
