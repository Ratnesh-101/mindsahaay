import React from "react";
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, logChatCrisisEvent: vi.fn(async () => true) };
});

import { fake, resetFake, setupI18n, spyFetch } from "../journal/testSupport";
import { createVault, lockVault } from "../journal/vault";
import Chat from "./Chat";
import { listSessions, loadSession } from "./history";

beforeAll(async () => {
  await setupI18n("en");
});

beforeEach(() => {
  resetFake({
    chat_sessions: [],
    chat_messages: [],
  });
  lockVault();
});

afterEach(() => {
  lockVault();
  vi.unstubAllGlobals();
});

function sse(tokens: string[]): Response {
  const body = tokens.map((t) => `data: ${JSON.stringify({ token: t })}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("ChatHistoryIntegration: real history.ts and crypto integration", () => {
  it("runs against real history.ts when locked: displays locked banner and honest notice", async () => {
    spyFetch(() => sse(["Bot response"]));
    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);

    expect(screen.getByTestId("chat-locked-banner")).toBeInTheDocument();
    expect(screen.getByTestId("chat-not-saved")).toHaveTextContent("This conversation is not being saved");

    await user.type(screen.getByLabelText("Message for MindMate"), "Hello while locked");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Bot response");

    // Real database tables remain completely empty
    expect(fake.tables.chat_sessions).toHaveLength(0);
    expect(fake.tables.chat_messages).toHaveLength(0);
  });

  it("runs against real history.ts when unlocked: creates session, encrypts messages, and decrypts on load", async () => {
    await createVault("my-secure-passphrase-123", "AAAA-BBBB-CCCC-DDDD");

    spyFetch(() => sse(["Encrypted bot reply"]));
    const user = userEvent.setup();
    render(<Chat studentId="user-1" />);

    expect(screen.queryByTestId("chat-locked-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-not-saved")).toHaveTextContent("Saved for 30 days, encrypted with your vault passphrase");

    await user.type(screen.getByLabelText("Message for MindMate"), "Confidential message");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Encrypted bot reply");

    // Check real fake tables: ciphertext stored, plaintext NOT stored
    await waitFor(() => {
      expect(fake.tables.chat_sessions).toHaveLength(1);
      expect(fake.tables.chat_messages).toHaveLength(2);
    });

    const sessionRow = fake.tables.chat_sessions[0];
    expect(sessionRow.salt).toBeDefined();

    const msgRows = fake.tables.chat_messages;
    expect(msgRows[0].encrypted_content).not.toBe("Confidential message");
    expect(msgRows[1].encrypted_content).not.toBe("Encrypted bot reply");

    // Verify roundtrip decryption via real loadSession
    const loaded = await loadSession(String(sessionRow.id));
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toEqual({ seq: 1, role: "user", text: "Confidential message" });
    expect(loaded[1]).toEqual({ seq: 2, role: "assistant", text: "Encrypted bot reply" });

    // Verify listSessions
    const listed = await listSessions();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(sessionRow.id);
  });
});
