import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { saveJournal, fetchJournals, deleteJournal } from "./journal";
import { AuthRequiredError, ValidationError, ApiError } from "./errors";
import { supabase } from "../supabase";
import { testServer, mockSession, MOCK_USER_ID } from "./testMocks";
import { encryptJournal } from "../../../domain/crypto/journalCrypto";

beforeAll(() => testServer.listen());
afterEach(() => {
  testServer.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => testServer.close());

describe("journal API module (zero-knowledge encryption)", () => {
  const testPassphrase = "student-secret-passphrase-2026!";

  it("throws AuthRequiredError if student is not authenticated", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(
      saveJournal({
        title: "Test",
        content: "Private thoughts",
        passphrase: testPassphrase,
      }),
    ).rejects.toThrow(AuthRequiredError);

    await expect(fetchJournals(testPassphrase)).rejects.toThrow(AuthRequiredError);
    await expect(deleteJournal("j-123")).rejects.toThrow(AuthRequiredError);
  });

  it("validates input and requires non-empty passphrase for zero-knowledge privacy", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    await expect(
      saveJournal({
        title: "",
        content: "Some content",
        passphrase: testPassphrase,
      }),
    ).rejects.toThrow(ValidationError);

    await expect(
      saveJournal({
        title: "Title",
        content: "",
        passphrase: testPassphrase,
      }),
    ).rejects.toThrow(ValidationError);

    await expect(
      saveJournal({
        title: "Title",
        content: "Content",
        passphrase: "",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("encrypts entry before insert: ciphertext, iv, salt are stored on server", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    let interceptedBody: Record<string, unknown> | null = null;
    testServer.use(
      http.post("*/rest/v1/journal_entries*", async ({ request }) => {
        interceptedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            id: "journal-encrypted-1",
            student_id: MOCK_USER_ID,
            ciphertext: interceptedBody.ciphertext,
            iv: interceptedBody.iv,
            salt: interceptedBody.salt,
            created_at: new Date().toISOString(),
          },
          { status: 201 },
        );
      }),
    );

    const saved = await saveJournal({
      title: "Hostel Reflections",
      content: "Feeling better after speaking to counsellor.",
      mood: "Relieved",
      prompt: "What went well today?",
      passphrase: testPassphrase,
    });

    expect(saved).toBeDefined();
    expect(saved.title).toBe("Hostel Reflections");
    expect(interceptedBody).toBeDefined();
    // Cryptographic privacy assertion: Plaintext must NEVER be present in the database payload!
    expect(interceptedBody).toHaveProperty("ciphertext");
    expect(interceptedBody).toHaveProperty("iv");
    expect(interceptedBody).toHaveProperty("salt");
    const bodyPayload = (interceptedBody ?? {}) as { ciphertext?: string };
    expect(bodyPayload.ciphertext).not.toContain("Hostel Reflections");
    expect(bodyPayload.ciphertext).not.toContain("Feeling better");
  });

  it("decrypts journal entry on read when correct passphrase is provided", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    // Create an encrypted entry using domain crypto
    const rawEntry = JSON.stringify({
      title: "Exam Preparation Notes",
      content: "Reviewed chapter 4. Sleep is important.",
      mood: "Focused",
      prompt: "What did you focus on?",
    });
    const encrypted = await encryptJournal(rawEntry, testPassphrase);

    testServer.use(
      http.get("*/rest/v1/journal_entries*", async () => {
        return HttpResponse.json([
          {
            id: "entry-1",
            student_id: MOCK_USER_ID,
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            salt: encrypted.salt,
            created_at: new Date().toISOString(),
          },
        ]);
      }),
    );

    const fetched = await fetchJournals(testPassphrase);
    expect(fetched.length).toBe(1);
    expect(fetched[0].title).toBe("Exam Preparation Notes");
    expect(fetched[0].content).toBe("Reviewed chapter 4. Sleep is important.");
    expect(fetched[0].mood).toBe("Focused");
    expect(fetched[0].isEncrypted).toBe(false);
  });

  it("returns locked placeholder when no passphrase is provided", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    testServer.use(
      http.get("*/rest/v1/journal_entries*", async () => {
        return HttpResponse.json([
          {
            id: "entry-locked-1",
            student_id: MOCK_USER_ID,
            ciphertext: "dummy-ciphertext",
            iv: "dummy-iv",
            salt: "dummy-salt",
            created_at: new Date().toISOString(),
          },
        ]);
      }),
    );

    const fetched = await fetchJournals();
    expect(fetched.length).toBe(1);
    expect(fetched[0].isEncrypted).toBe(true);
    expect(fetched[0].content).toContain("Passphrase required");
  });

  it("throws typed ApiError when wrong passphrase is provided", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const encrypted = await encryptJournal(
      JSON.stringify({ title: "Secret", content: "Content" }),
      testPassphrase,
    );

    testServer.use(
      http.get("*/rest/v1/journal_entries*", async () => {
        return HttpResponse.json([
          {
            id: "entry-fail",
            student_id: MOCK_USER_ID,
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            salt: encrypted.salt,
            created_at: new Date().toISOString(),
          },
        ]);
      }),
    );

    await expect(fetchJournals("wrong-passphrase")).rejects.toThrow(ApiError);
  });

  it("deletes a journal entry", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const res = await deleteJournal("entry-delete-1");
    expect(res.success).toBe(true);
    expect(res.id).toBe("entry-delete-1");
  });
});
