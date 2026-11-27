import React from "react";
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());

// Mock history module following the contract
const mockCanSaveChats = vi.fn();
const mockListSessions = vi.fn();
const mockCreateSession = vi.fn();
const mockLoadSession = vi.fn();
const mockSaveMessage = vi.fn();
const mockDeleteSession = vi.fn();
const mockDeleteAllSessions = vi.fn();

vi.mock("./history", () => ({
  ChatLockedError: class ChatLockedError extends Error {},
  canSaveChats: () => mockCanSaveChats(),
  listSessions: () => mockListSessions(),
  createSession: () => mockCreateSession(),
  loadSession: (id: string) => mockLoadSession(id),
  saveMessage: (s: string, seq: number, r: "user" | "assistant", t: string) => mockSaveMessage(s, seq, r, t),
  deleteSession: (id: string) => mockDeleteSession(id),
  deleteAllSessions: () => mockDeleteAllSessions(),
}));

let currentMockPassphrase: string | null = null;
const vaultListeners = new Set<() => void>();

vi.mock("../journal/vault", () => ({
  useVaultPassphrase: () => currentMockPassphrase,
  getVaultPassphrase: () => currentMockPassphrase,
  lockVault: () => {
    currentMockPassphrase = null;
    vaultListeners.forEach((l) => l());
  },
}));

let mockDemoMode = false;
vi.mock("../auth/demoMode", () => ({
  isDemoModeActive: () => mockDemoMode,
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, logChatCrisisEvent: vi.fn(async () => true) };
});

import { resetFake, setupI18n, spyFetch } from "../journal/testSupport";
import Chat from "./Chat";

beforeAll(async () => {
  await setupI18n("en");
});

beforeEach(() => {
  resetFake();
  vi.clearAllMocks();
  currentMockPassphrase = null;
  mockDemoMode = false;
  mockCanSaveChats.mockReturnValue(false);
  mockListSessions.mockResolvedValue([]);
  mockCreateSession.mockResolvedValue("session-123");
  mockLoadSession.mockResolvedValue([]);
  mockSaveMessage.mockResolvedValue(undefined);
  mockDeleteSession.mockResolvedValue(undefined);
  mockDeleteAllSessions.mockResolvedValue(1);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sse(tokens: string[]): Response {
  const body = tokens.map((t) => `data: ${JSON.stringify({ token: t })}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("ChatPersistence: Wave 3 contract", () => {
  it("when locked: shows banner, does not save, chat still works", async () => {
    mockCanSaveChats.mockReturnValue(false);
    currentMockPassphrase = null;
    spyFetch(() => sse(["I hear you."]));
    const user = userEvent.setup();

    render(<Chat studentId="user-1" />);

    expect(screen.getByTestId("chat-locked-banner")).toHaveTextContent(
      "Unlock your vault to save and see past conversations. This conversation is not being saved.",
    );
    expect(screen.getByTestId("chat-not-saved")).toHaveTextContent(
      "Unlock your vault to save and see past conversations. This conversation is not being saved.",
    );
    expect(screen.queryByTestId("dont-save-toggle")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Message for MindMate"), "Feeling anxious today");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("I hear you.");
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockSaveMessage).not.toHaveBeenCalled();
  });

  it("when preview/demo mode: shows demo notice, never saves", async () => {
    mockDemoMode = true;
    mockCanSaveChats.mockReturnValue(false);
    spyFetch(() => sse(["Welcome to demo."]));
    const user = userEvent.setup();

    render(<Chat studentId="user-1" />);

    expect(screen.getByTestId("chat-demo-banner")).toHaveTextContent("Preview mode: conversations are not saved.");
    expect(screen.getByTestId("chat-not-saved")).toHaveTextContent("Preview mode: conversations are not saved.");

    await user.type(screen.getByLabelText("Message for MindMate"), "Hello demo");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Welcome to demo.");
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockSaveMessage).not.toHaveBeenCalled();
  });

  it("when unlocked: saving on by default, per-conversation toggle present, saves user and assistant messages with seq", async () => {
    mockCanSaveChats.mockReturnValue(true);
    currentMockPassphrase = "test-passphrase-123";
    mockCreateSession.mockResolvedValue("session-abc");
    spyFetch(() => sse(["I am here to support you."]));
    const user = userEvent.setup();

    render(<Chat studentId="user-1" />);

    expect(screen.queryByTestId("chat-locked-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("dont-save-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("dont-save-toggle")).not.toBeChecked();

    expect(screen.getByTestId("chat-not-saved")).toHaveTextContent(
      "Saved for 30 days, encrypted with your vault passphrase. MindSahaay staff and counsellors cannot read it. Each message is still sent to our AI provider to write a reply.",
    );

    await user.type(screen.getByLabelText("Message for MindMate"), "I need some guidance");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("I am here to support you.");

    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    expect(mockSaveMessage).toHaveBeenCalledWith("session-abc", 1, "user", "I need some guidance");
    await waitFor(() => {
      expect(mockSaveMessage).toHaveBeenCalledWith("session-abc", 2, "assistant", "I am here to support you.");
    });
  });

  it("per-conversation 'Don't save this conversation' toggle opts out of saving", async () => {
    mockCanSaveChats.mockReturnValue(true);
    currentMockPassphrase = "test-passphrase-123";
    spyFetch(() => sse(["Private reply."]));
    const user = userEvent.setup();

    render(<Chat studentId="user-1" />);

    const toggle = screen.getByTestId("dont-save-toggle");
    await user.click(toggle);
    expect(toggle).toBeChecked();

    expect(screen.getByTestId("chat-not-saved")).toHaveTextContent("This conversation is not being saved.");

    await user.type(screen.getByLabelText("Message for MindMate"), "This should stay completely unsaved");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Private reply.");
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockSaveMessage).not.toHaveBeenCalled();
  });

  it("unlocking mid-chat saves the conversation so far from that point", async () => {
    mockCanSaveChats.mockReturnValue(false);
    currentMockPassphrase = null;
    mockCreateSession.mockResolvedValue("session-midchat");
    spyFetch(() => sse(["First response while locked."]));
    const user = userEvent.setup();

    const { rerender } = render(<Chat studentId="user-1" />);

    await user.type(screen.getByLabelText("Message for MindMate"), "Message while locked");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("First response while locked.");
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockSaveMessage).not.toHaveBeenCalled();

    // Now user unlocks their vault mid-chat
    currentMockPassphrase = "vault-passphrase-now-unlocked";
    mockCanSaveChats.mockReturnValue(true);

    rerender(<Chat studentId="user-1" />);

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mockSaveMessage).toHaveBeenCalledWith("session-midchat", 1, "user", "Message while locked");
      expect(mockSaveMessage).toHaveBeenCalledWith("session-midchat", 2, "assistant", "First response while locked.");
    });
  });

  it("locking mid-chat clears keys AND the on-screen saved transcript", async () => {
    mockCanSaveChats.mockReturnValue(true);
    currentMockPassphrase = "vault-passphrase";
    spyFetch(() => sse(["Sensitive decrypted text."]));
    const user = userEvent.setup();

    const { rerender } = render(<Chat studentId="user-1" />);

    await user.type(screen.getByLabelText("Message for MindMate"), "Secret message");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Sensitive decrypted text.");

    // Vault locks
    currentMockPassphrase = null;
    mockCanSaveChats.mockReturnValue(false);

    rerender(<Chat studentId="user-1" />);

    // Transcript is wiped from memory and screen
    await waitFor(() => {
      expect(screen.queryByText("Secret message")).not.toBeInTheDocument();
      expect(screen.queryByText("Sensitive decrypted text.")).not.toBeInTheDocument();
    });
  });

  it("failed save keeps the message in memory marked 'Not saved yet' and retries on next turn", async () => {
    mockCanSaveChats.mockReturnValue(true);
    currentMockPassphrase = "vault-passphrase";
    mockCreateSession.mockResolvedValue("session-fail-test");

    // First save fails
    mockSaveMessage.mockRejectedValueOnce(new Error("Network write error"));
    // Second save succeeds for bot
    mockSaveMessage.mockResolvedValueOnce(undefined);
    // On retry, both succeed
    mockSaveMessage.mockResolvedValue(undefined);

    spyFetch(() => sse(["Reply 1."]));
    const user = userEvent.setup();

    render(<Chat studentId="user-1" />);

    await user.type(screen.getByLabelText("Message for MindMate"), "Message that fails to save");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Reply 1.");

    // The user message is marked "Not saved yet"
    expect(screen.getByTestId("not-saved-yet")).toHaveTextContent("Not saved yet");

    // On next turn:
    spyFetch(() => sse(["Reply 2."]));
    await user.type(screen.getByLabelText("Message for MindMate"), "Next turn message");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Reply 2.");

    // Retried and succeeded -> badge cleared
    await waitFor(() => {
      expect(screen.queryByTestId("not-saved-yet")).not.toBeInTheDocument();
    });
    // Check that saveMessage was called for seq 1 (the failed one) on retry
    expect(mockSaveMessage).toHaveBeenCalledWith("session-fail-test", 1, "user", "Message that fails to save");
  });

  it("past-conversation list shows dates and counts only, and resumes sending last 30 turns as history", async () => {
    mockCanSaveChats.mockReturnValue(true);
    currentMockPassphrase = "vault-passphrase";
    const sampleDate = "2026-11-20T10:00:00.000Z";
    mockListSessions.mockResolvedValue([
      { id: "past-session-1", createdAt: sampleDate, messageCount: 4 },
    ]);
    mockLoadSession.mockResolvedValue([
      { seq: 1, role: "user", text: "Past turn 1" },
      { seq: 2, role: "assistant", text: "Past reply 1" },
      { seq: 3, role: "user", text: "Past turn 2" },
      { seq: 4, role: "assistant", text: "Past reply 2" },
    ]);

    let capturedRequestBody: { message: string; history?: Array<{ role: string; content: string }> } | null = null;
    spyFetch((_url, init) => {
      try {
        if (init?.body && typeof init.body === "string") {
          capturedRequestBody = JSON.parse(init.body);
        }
      } catch {
        // ignore
      }
      return sse(["Resumed bot reply."]);
    });

    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);

    // Click "Past conversations"
    await user.click(screen.getByTestId("past-conversations-btn"));

    // Modal appears
    expect(screen.getByRole("dialog", { name: "Saved Conversations" })).toBeInTheDocument();
    // Shows date and message count ONLY (no raw message snippets)
    expect(screen.getByText("4 messages")).toBeInTheDocument();
    expect(screen.queryByText("Past turn 1")).not.toBeInTheDocument();

    // Open the past session
    await user.click(screen.getByTestId("open-session-past-session-1"));

    // Session is loaded into chat view
    await screen.findByText("Past turn 1");
    expect(screen.getByText("Past reply 2")).toBeInTheDocument();

    // Resume chatting in this loaded session
    await user.type(screen.getByLabelText("Message for MindMate"), "New turn in past session");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Resumed bot reply.");

    // Assert that the last 4 turns were sent as history
    const body = capturedRequestBody as { message: string; history?: Array<{ role: string; content: string }> } | null;
    expect(body?.history).toHaveLength(4);
    expect(body?.history?.[0]).toEqual({ role: "user", content: "Past turn 1" });

    // Next sequence number was used (seq 5 for user, seq 6 for assistant)
    expect(mockSaveMessage).toHaveBeenCalledWith("past-session-1", 5, "user", "New turn in past session");
    await waitFor(() => {
      expect(mockSaveMessage).toHaveBeenCalledWith("past-session-1", 6, "assistant", "Resumed bot reply.");
    });
  });

  it("delete conversation and delete all chats require confirmation", async () => {
    mockCanSaveChats.mockReturnValue(true);
    currentMockPassphrase = "vault-passphrase";
    mockListSessions.mockResolvedValue([
      { id: "session-to-del", createdAt: "2026-11-20T10:00:00.000Z", messageCount: 2 },
    ]);

    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);

    await user.click(screen.getByTestId("past-conversations-btn"));
    const modal = screen.getByRole("dialog", { name: "Saved Conversations" });

    // Click delete on individual session
    await user.click(screen.getByTestId("delete-session-session-to-del"));
    expect(within(modal).getByRole("alertdialog")).toHaveTextContent("Are you sure you want to delete this conversation?");
    // Confirm deletion
    await user.click(within(modal).getByRole("button", { name: "Yes, delete" }));

    await waitFor(() => {
      expect(mockDeleteSession).toHaveBeenCalledWith("session-to-del");
    });

    // Test Delete All Chats
    mockListSessions.mockResolvedValue([
      { id: "sess-1", createdAt: "2026-11-20T10:00:00.000Z", messageCount: 1 },
      { id: "sess-2", createdAt: "2026-11-21T10:00:00.000Z", messageCount: 3 },
    ]);
    await user.click(within(modal).getByRole("button", { name: "Close" }));
    await user.click(screen.getByTestId("past-conversations-btn"));

    const deleteAllBtn = screen.getByTestId("delete-all-chats-btn");
    await user.click(deleteAllBtn);

    expect(screen.getByRole("alertdialog")).toHaveTextContent("Are you sure you want to delete all saved conversations?");
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));

    await waitFor(() => {
      expect(mockDeleteAllSessions).toHaveBeenCalledTimes(1);
    });
  });
});
