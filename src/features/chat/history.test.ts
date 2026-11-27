import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  sessions: [] as Row[],
  messages: [] as Row[],
  insertError: null as string | null,
  n: 0,
}));

vi.mock("../../shared/lib/supabase", async () => {
  const { fakeSupabase } = await import("../journal/testSupport");
  class Q implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
    private op = "select";
    private payload: Row = {};
    private filters: ((r: Row) => boolean)[] = [];
    private one = false;
    constructor(private table: "chat_sessions" | "chat_messages") {}
    private get rows(): Row[] {
      return this.table === "chat_sessions" ? db.sessions : db.messages;
    }
    select() {
      return this;
    }
    insert(p: Row) {
      this.op = "insert";
      this.payload = p;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    eq(c: string, v: unknown) {
      this.filters.push((r) => r[c] === v);
      return this;
    }
    order() {
      return this;
    }
    single() {
      this.one = true;
      return this;
    }
    private run() {
      if (this.op === "insert") {
        if (db.insertError) return { data: null, error: { message: db.insertError } };
        const row: Row = { id: `${this.table}-${++db.n}`, created_at: new Date(2026, 0, db.n + 1).toISOString(), ...this.payload };
        if (
          this.table === "chat_messages" &&
          db.messages.some((m) => m.session_id === row.session_id && m.seq === row.seq)
        ) {
          return { data: null, error: { message: "duplicate key" } };
        }
        this.rows.push(row);
        return { data: this.one ? row : [row], error: null };
      }
      const hit = this.rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "delete") {
        const ids = new Set(hit.map((r) => r.id));
        if (this.table === "chat_sessions") {
          db.sessions = db.sessions.filter((r) => !ids.has(r.id));
          db.messages = db.messages.filter((m) => !ids.has(m.session_id));
        } else db.messages = db.messages.filter((r) => !ids.has(r.id));
        return { data: hit, error: null };
      }
      if (this.table === "chat_sessions") {
        const withCount = hit.map((s) => ({
          ...s,
          chat_messages: [{ count: db.messages.filter((m) => m.session_id === s.id).length }],
        }));
        return this.one ? { data: withCount[0] ?? null, error: withCount[0] ? null : { message: "not found" } } : { data: withCount, error: null };
      }
      return { data: [...hit].sort((a, b) => (a.seq as number) - (b.seq as number)), error: null };
    }
    then<A, B = never>(f?: ((v: ReturnType<Q["run"]>) => A | PromiseLike<A>) | null, r?: ((e: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve(this.run()).then(f, r);
    }
  }
  const supabase = { auth: fakeSupabase.auth, from: (t: "chat_sessions" | "chat_messages") => new Q(t) };
  return { supabase, default: supabase };
});

import { fake, resetFake } from "../journal/testSupport";
import { createVault, lockVault, clearVaultState, generateRecoveryCode } from "../journal/vault";
import { setDemoMode } from "../auth/demoMode";
import {
  ChatLockedError,
  canSaveChats,
  createSession,
  deleteAllSessions,
  deleteSession,
  listSessions,
  loadSession,
  saveMessage,
} from "./history";

describe("chat history", () => {
  beforeEach(async () => {
    resetFake();
    fake.userId = "user-1";
    db.sessions = [];
    db.messages = [];
    db.insertError = null;
    db.n = 0;
    clearVaultState();
    setDemoMode(false);
    await createVault("correct horse battery", generateRecoveryCode());
  });

  it("reports saving availability from vault and demo state", () => {
    expect(canSaveChats()).toBe(true);
    lockVault();
    expect(canSaveChats()).toBe(false);
  });

  it("is not available in preview/demo mode", async () => {
    setDemoMode(true);
    expect(canSaveChats()).toBe(false);
    await expect(createSession()).rejects.toBeInstanceOf(ChatLockedError);
    setDemoMode(false);
  });

  it("round-trips messages and stores only ciphertext", async () => {
    const id = await createSession();
    expect(db.sessions[0].salt).toMatch(/^[A-Za-z0-9+/]+=*$/);
    await saveMessage(id, 1, "user", "I feel anxious about exams");
    await saveMessage(id, 2, "assistant", "That sounds hard. Want to try slow breathing?");
    const serialised = JSON.stringify(db.messages);
    expect(serialised).not.toContain("anxious");
    expect(serialised).not.toContain("breathing");
    expect(await loadSession(id)).toEqual([
      { seq: 1, role: "user", text: "I feel anxious about exams" },
      { seq: 2, role: "assistant", text: "That sounds hard. Want to try slow breathing?" },
    ]);
  });

  it("uses a fresh IV for every message", async () => {
    const id = await createSession();
    await saveMessage(id, 1, "user", "same");
    await saveMessage(id, 2, "user", "same");
    expect(db.messages[0].iv).not.toBe(db.messages[1].iv);
    expect(db.messages[0].encrypted_content).not.toBe(db.messages[1].encrypted_content);
  });

  it("rejects rows whose seq or role were swapped (AAD binding)", async () => {
    const id = await createSession();
    await saveMessage(id, 1, "user", "one");
    await saveMessage(id, 2, "assistant", "two");
    const [a, b] = db.messages;
    [a.encrypted_content, b.encrypted_content] = [b.encrypted_content, a.encrypted_content];
    [a.iv, b.iv] = [b.iv, a.iv];
    await expect(loadSession(id)).rejects.toThrow(/decrypt/i);
  });

  it("rejects a message moved to another session", async () => {
    const s1 = await createSession();
    const s2 = await createSession();
    await saveMessage(s1, 1, "user", "secret");
    db.messages[0].session_id = s2;
    await expect(loadSession(s2)).rejects.toThrow(/decrypt/i);
  });

  it("throws ChatLockedError when locked and clears cached keys", async () => {
    const id = await createSession();
    await saveMessage(id, 1, "user", "hello");
    lockVault();
    await expect(createSession()).rejects.toBeInstanceOf(ChatLockedError);
    await expect(loadSession(id)).rejects.toBeInstanceOf(ChatLockedError);
    await expect(saveMessage(id, 2, "user", "x")).rejects.toBeInstanceOf(ChatLockedError);
    expect((await listSessions()).map((s) => s.messageCount)).toEqual([1]);
  });

  it("fails to read with a different passphrase", async () => {
    const id = await createSession();
    await saveMessage(id, 1, "user", "hello");
    clearVaultState();
    await createVault("another passphrase!", generateRecoveryCode());
    await expect(loadSession(id)).rejects.toThrow(/decrypt/i);
  });

  it("never swallows save failures", async () => {
    const id = await createSession();
    await saveMessage(id, 1, "user", "a");
    await expect(saveMessage(id, 1, "user", "dup")).rejects.toThrow(/duplicate/);
    db.insertError = "network down";
    await expect(saveMessage(id, 2, "user", "b")).rejects.toThrow("network down");
  });

  it("lists sessions with counts and no text", async () => {
    const a = await createSession();
    await createSession();
    await saveMessage(a, 1, "user", "hi");
    const list = await listSessions();
    expect(list).toHaveLength(2);
    expect(list.find((s) => s.id === a)?.messageCount).toBe(1);
    expect(Object.keys(list[0]).sort()).toEqual(["createdAt", "id", "messageCount"]);
  });

  it("deleteSession throws if nothing was deleted; deleteAllSessions returns count", async () => {
    const a = await createSession();
    await createSession();
    await saveMessage(a, 1, "user", "hi");
    await deleteSession(a);
    expect(db.messages).toHaveLength(0);
    await expect(deleteSession(a)).rejects.toThrow();
    db.sessions[0].user_id = "user-1";
    expect(await deleteAllSessions()).toBe(1);
  });
});
