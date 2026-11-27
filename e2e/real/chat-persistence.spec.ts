import {
  test,
  expect,
  adminSql,
  lit,
  API,
  ANON_KEY,
  FUNCTIONS_SLUG,
  cleanupCreated,
  signIn,
  unlockVault,
  openFromSidebar,
  getAccessToken,
  restAs,
  promoteToCounsellor,
  grantCareShare,
  VAULT_PASSPHRASE,
} from "./helpers";
import type { Page } from "@playwright/test";

/**
 * Saved MindMate conversations against the real local Supabase stack. The only fake is the AI
 * provider: there is no Anthropic key, so the chat stream request is intercepted with page.route and
 * answered with a canned server-sent-events reply. Everything else (vault key, encryption in the
 * browser, PostgREST, RLS, triggers, the export edge function) is real.
 */

test.afterAll(async () => {
  await cleanupCreated();
});

const GENERIC_REPLY = "That sounds like a steady day. One small next step is enough for now.";

/** Canned answer for POST .../chat/stream. Records every request body so tests can inspect `history`. */
async function installFakeChat(page: Page, reply = GENERIC_REPLY) {
  const state = { reply, seen: [] as { message: string; history: { role: string; content: string }[] }[] };
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, apikey, x-client-info, accept",
    "access-control-allow-methods": "POST, OPTIONS",
  };
  await page.route("**/functions/v1/**/chat/stream", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    try {
      state.seen.push(JSON.parse(req.postData() || "{}"));
    } catch {
      /* ignore */
    }
    await route.fulfill({
      status: 200,
      headers: { ...cors, "content-type": "text/event-stream", "cache-control": "no-cache" },
      body:
        `data: ${JSON.stringify({ token: state.reply })}\n\n` +
        `event: done\ndata: ${JSON.stringify({ content: state.reply })}\n\n` +
        "data: [DONE]\n\n",
    });
  });
  return state;
}

async function say(page: Page, text: string) {
  await page.locator("#chat-message").fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
}

const sessionCount = (userId: string) => Number(adminSql(`select count(*) from public.chat_sessions where user_id=${lit(userId)}`));
const messageCount = (userId: string) =>
  Number(adminSql(`select count(*) from public.chat_messages m join public.chat_sessions s on s.id=m.session_id where s.user_id=${lit(userId)}`));
const messageShape = (userId: string) =>
  adminSql(
    `select coalesce(string_agg(m.sender_role || ':' || m.seq, ',' order by s.created_at, m.seq), '') from public.chat_messages m join public.chat_sessions s on s.id=m.session_id where s.user_id=${lit(userId)}`,
  );

/** True when `stored` contains the text itself or a base64 rendering of it (any of the 3 byte alignments). */
function leaks(stored: string, text: string): string | null {
  if (stored.includes(text)) return "plaintext";
  if (stored.includes(Buffer.from(text).toString("base64"))) return "base64";
  for (let k = 1; k <= 2; k++) {
    const frag = Buffer.from("\0".repeat(k) + text).toString("base64").slice(4, -4);
    if (frag.length > 12 && stored.includes(frag)) return `base64 (alignment ${k})`;
  }
  return null;
}

/** New user, vault created and unlocked, MindMate open, fake AI installed. */
async function readyUser(browser: Parameters<typeof signIn>[0], baseURL: string | undefined, prefix: string, reply = GENERIC_REPLY) {
  const user = await signIn(browser, prefix, baseURL);
  await unlockVault(user.page);
  const fake = await installFakeChat(user.page, reply);
  await openFromSidebar(user.page, /MindMate AI/i);
  return { ...user, fake };
}

async function waitForSavedExchange(userId: string, rows = 2) {
  await expect.poll(() => messageCount(userId), { timeout: 60_000 }).toBe(rows);
}

test("1. with the vault unlocked a conversation is saved encrypted and can be reopened after a reload", async ({ browser, baseURL }) => {
  const { page, context, id } = await readyUser(browser, baseURL, "chatsave");
  try {
    const userText = `My revision went smoothly today ${Date.now()}`;
    await expect(page.getByTestId("chat-not-saved")).toContainText(/Saved for 30 days/i);
    await say(page, userText);
    await expect(page.getByRole("log").getByText(GENERIC_REPLY)).toBeVisible({ timeout: 30_000 });
    await waitForSavedExchange(id);

    expect(sessionCount(id), "exactly one session").toBe(1);
    expect(adminSql(`select title from public.chat_sessions where user_id=${lit(id)}`)).toBe("Well-being Chat");
    expect(messageShape(id), "user message is seq 1, assistant reply is seq 2").toBe("user:1,assistant:2");

    const stored = adminSql(
      `select m.encrypted_content || '|' || m.iv from public.chat_messages m join public.chat_sessions s on s.id=m.session_id where s.user_id=${lit(id)}`,
    );
    expect(stored.length).toBeGreaterThan(40);
    for (const text of [userText, GENERIC_REPLY]) {
      expect(leaks(stored, text), `stored ciphertext/iv must not contain "${text.slice(0, 20)}..."`).toBeNull();
    }
    expect(stored).not.toContain("revision");

    // A reload drops the in-memory key. Unlock again through the vault form.
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Private Journal/i }).first().click();
    await expect(page.getByRole("heading", { name: "Unlock your private vault" })).toBeVisible({ timeout: 30_000 });
    await page.locator("#vault-input").fill(VAULT_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.locator("#vault-input")).toHaveCount(0, { timeout: 60_000 });

    await openFromSidebar(page, /MindMate AI/i);
    await page.getByTestId("past-conversations-btn").click();
    const open = page.locator('[data-testid^="open-session-"]');
    await expect(open).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByRole("dialog")).toContainText(/2 messages/);
    expect(await page.getByRole("dialog").innerText(), "the list shows dates and counts only").not.toContain(userText);

    await open.click();
    const log = page.getByRole("log");
    await expect(log.getByText(userText)).toBeVisible({ timeout: 60_000 });
    await expect(log.getByText(GENERIC_REPLY)).toBeVisible();
    expect(sessionCount(id), "opening does not create a second session").toBe(1);
    expect(messageCount(id)).toBe(2);
  } finally {
    await context.close();
  }
});

test("1b. an opened past conversation can be resumed: history is sent and new turns continue the same session", async ({ browser, baseURL }) => {
  const { page, context, id, fake } = await readyUser(browser, baseURL, "chatresume");
  try {
    const first = `Planning my study week ${Date.now()}`;
    await say(page, first);
    await expect(page.getByRole("log").getByText(GENERIC_REPLY)).toBeVisible({ timeout: 30_000 });
    await waitForSavedExchange(id);

    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Private Journal/i }).first().click();
    await page.locator("#vault-input").fill(VAULT_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.locator("#vault-input")).toHaveCount(0, { timeout: 60_000 });
    const fake2 = await installFakeChat(page, "Thanks for coming back to this. What feels doable first?");
    void fake;
    await openFromSidebar(page, /MindMate AI/i);
    await page.getByTestId("past-conversations-btn").click();
    await page.locator('[data-testid^="open-session-"]').click();
    await expect(page.getByRole("log").getByText(first)).toBeVisible({ timeout: 60_000 });

    const second = `Now I want to plan the weekend ${Date.now()}`;
    await say(page, second);
    await expect(page.getByRole("log").getByText(fake2.reply)).toBeVisible({ timeout: 30_000 });
    await waitForSavedExchange(id, 4);

    expect(sessionCount(id), "the follow-up stays in the same session").toBe(1);
    expect(messageShape(id)).toBe("user:1,assistant:2,user:3,assistant:4");
    const sent = fake2.seen.at(-1);
    expect(sent?.message).toBe(second);
    expect(sent?.history, "the earlier turns are sent as history").toEqual([
      { role: "user", content: first },
      { role: "assistant", content: GENERIC_REPLY },
    ]);
  } finally {
    await context.close();
  }
});

test("2a. vault not created: chat works, the banner explains nothing is saved, no rows are written", async ({ browser, baseURL }) => {
  const { page, context, id } = await signIn(browser, "chatnovault", baseURL);
  try {
    await installFakeChat(page);
    await openFromSidebar(page, /MindMate AI/i);
    await expect(page.getByTestId("chat-locked-banner")).toContainText("This conversation is not being saved.");
    await expect(page.getByTestId("dont-save-toggle")).toHaveCount(0);
    await say(page, `Just checking in without a vault ${Date.now()}`);
    await expect(page.getByRole("log").getByText(GENERIC_REPLY)).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2000);
    expect(sessionCount(id)).toBe(0);
    expect(messageCount(id)).toBe(0);
  } finally {
    await context.close();
  }
});

test("2b. vault exists but is locked (after a reload): chat works, banner shown, no rows are written", async ({ browser, baseURL }) => {
  const { page, context, id } = await signIn(browser, "chatlocked", baseURL);
  try {
    await unlockVault(page);
    await page.reload({ waitUntil: "networkidle" });
    await installFakeChat(page);
    await openFromSidebar(page, /MindMate AI/i);
    await expect(page.getByTestId("chat-locked-banner")).toBeVisible();
    await say(page, `Chatting while the vault is locked ${Date.now()}`);
    await expect(page.getByRole("log").getByText(GENERIC_REPLY)).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2000);
    expect(sessionCount(id)).toBe(0);
    expect(messageCount(id)).toBe(0);
  } finally {
    await context.close();
  }
});

test("3. \"Don't save this conversation\" keeps the conversation out of the database", async ({ browser, baseURL }) => {
  const { page, context, id } = await readyUser(browser, baseURL, "chatdontsave");
  try {
    await page.getByTestId("dont-save-toggle").check();
    await expect(page.getByTestId("chat-not-saved")).toContainText("This conversation is not being saved.");
    await say(page, `Please do not keep this one ${Date.now()}`);
    await expect(page.getByRole("log").getByText(GENERIC_REPLY)).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(3000);
    expect(sessionCount(id)).toBe(0);
    expect(messageCount(id)).toBe(0);
  } finally {
    await context.close();
  }
});

test("4a. \"Delete conversation\" (with confirmation) removes the session and its messages", async ({ browser, baseURL }) => {
  const { page, context, id } = await readyUser(browser, baseURL, "chatdelete");
  try {
    await say(page, `A conversation I will delete ${Date.now()}`);
    await expect(page.getByRole("log").getByText(GENERIC_REPLY)).toBeVisible({ timeout: 30_000 });
    await waitForSavedExchange(id);

    await page.getByTestId("delete-conversation-btn").click();
    // Nothing is deleted until the confirmation is accepted.
    await expect(page.getByRole("alertdialog")).toBeVisible();
    expect(sessionCount(id)).toBe(1);
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
    expect(sessionCount(id), "cancel keeps the conversation").toBe(1);

    await page.getByTestId("delete-conversation-btn").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Yes, delete" }).click();
    await expect.poll(() => sessionCount(id), { timeout: 30_000 }).toBe(0);
    expect(messageCount(id), "messages are removed with the session").toBe(0);
    await expect(page.getByRole("log").getByText(GENERIC_REPLY)).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("4b. \"Delete all chats\" removes every saved conversation", async ({ browser, baseURL }) => {
  const { page, context, id } = await readyUser(browser, baseURL, "chatdeleteall");
  try {
    await say(page, `First conversation to remove ${Date.now()}`);
    await expect(page.getByRole("log").getByText(GENERIC_REPLY)).toBeVisible({ timeout: 30_000 });
    await waitForSavedExchange(id);

    // "Clear conversation" starts a fresh session on the next message.
    await page.getByRole("button", { name: "Clear conversation" }).click();
    await page.getByRole("button", { name: "Yes, clear it" }).click();
    await say(page, `Second conversation to remove ${Date.now()}`);
    await expect.poll(() => sessionCount(id), { timeout: 60_000 }).toBe(2);
    await waitForSavedExchange(id, 4);

    await page.getByTestId("past-conversations-btn").click();
    await expect(page.locator('[data-testid^="open-session-"]')).toHaveCount(2, { timeout: 30_000 });
    await page.getByTestId("delete-all-chats-btn").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Yes, delete" }).click();
    await expect(page.getByTestId("no-past-chats")).toBeVisible({ timeout: 30_000 });
    expect(sessionCount(id)).toBe(0);
    expect(messageCount(id)).toBe(0);
  } finally {
    await context.close();
  }
});

test("5. row level security: other users and counsellors cannot read chats; role, dates and title rules are enforced by the database", async ({ browser, baseURL }) => {
  const a = await readyUser(browser, baseURL, "chatrlsa");
  const b = await signIn(browser, "chatrlsb", baseURL);
  const c = await signIn(browser, "chatrlsc", baseURL);
  try {
    await say(a.page, `Private words of student A ${Date.now()}`);
    await expect(a.page.getByRole("log").getByText(GENERIC_REPLY)).toBeVisible({ timeout: 30_000 });
    await waitForSavedExchange(a.id);
    const sessionId = adminSql(`select id from public.chat_sessions where user_id=${lit(a.id)}`);

    const tokenA = await getAccessToken(a.page);
    const tokenB = await getAccessToken(b.page);
    promoteToCounsellor(c.id);
    grantCareShare(a.id, c.id);
    const tokenC = await getAccessToken(c.page);

    // Control: the owner sees the rows.
    const own = await restAs(tokenA, "GET", "chat_messages?select=id,sender_role,seq");
    expect(own.status).toBe(200);
    expect((own.json as unknown[]).length).toBe(2);

    for (const [label, token] of [
      ["another student", tokenB],
      ["a counsellor with an active care share", tokenC],
    ] as const) {
      const s = await restAs(token, "GET", `chat_sessions?select=*&id=eq.${sessionId}`);
      expect(s.status, `${label}: sessions query is allowed but empty`).toBe(200);
      expect(s.json, `${label} must not see sessions`).toEqual([]);
      const sAll = await restAs(token, "GET", "chat_sessions?select=*");
      expect(sAll.json).toEqual([]);
      const m = await restAs(token, "GET", `chat_messages?select=*&session_id=eq.${sessionId}`);
      expect(m.status).toBe(200);
      expect(m.json, `${label} must not see messages`).toEqual([]);
      const mAll = await restAs(token, "GET", "chat_messages?select=*");
      expect(mAll.json).toEqual([]);
    }

    // Another student cannot write into A's session.
    const intruder = await restAs(tokenB, "POST", "chat_messages", {
      session_id: sessionId,
      seq: 70,
      sender_role: "user",
      encrypted_content: "AAAAAAAA",
      iv: "BBBBBBBB",
    });
    expect(intruder.status, "foreign insert is rejected").toBeGreaterThanOrEqual(400);

    // A sender_role of 'counsellor' is rejected even for the session owner; a valid role works (control).
    const asCounsellor = await restAs(tokenA, "POST", "chat_messages", {
      session_id: sessionId,
      seq: 51,
      sender_role: "counsellor",
      encrypted_content: "AAAAAAAA",
      iv: "BBBBBBBB",
    });
    expect(asCounsellor.status, "sender_role 'counsellor' is rejected").toBeGreaterThanOrEqual(400);
    expect(adminSql(`select count(*) from public.chat_messages where session_id=${lit(sessionId)} and seq=51`)).toBe("0");

    // Client-supplied dates are overridden by the database.
    const forged = await restAs(tokenA, "POST", "chat_messages", {
      session_id: sessionId,
      seq: 50,
      sender_role: "user",
      encrypted_content: "AAAAAAAA",
      iv: "BBBBBBBB",
      retention_expires_at: "2099-01-01T00:00:00Z",
      created_at: "2001-01-01T00:00:00Z",
    });
    expect(forged.status, JSON.stringify(forged.json).slice(0, 200)).toBe(201);
    expect(
      adminSql(
        `select (retention_expires_at between now() + interval '29 days' and now() + interval '31 days') and created_at > now() - interval '5 minutes' from public.chat_messages where session_id=${lit(sessionId)} and seq=50`,
      ),
      "retention is ~30 days from now and created_at is server time",
    ).toBe("t");

    const forgedSession = await restAs(tokenA, "POST", "chat_sessions", {
      user_id: a.id,
      salt: "c2FsdHNhbHRzYWx0c2FsdA==",
      created_at: "2001-01-01T00:00:00Z",
      updated_at: "2001-01-01T00:00:00Z",
    });
    expect(forgedSession.status, JSON.stringify(forgedSession.json).slice(0, 200)).toBe(201);
    expect(adminSql(`select count(*) from public.chat_sessions where user_id=${lit(a.id)} and created_at > now() - interval '5 minutes'`)).toBe("2");

    // Title and retention window cannot be changed by the client.
    const badTitle = await restAs(tokenA, "POST", "chat_sessions", { user_id: a.id, salt: "c2FsdA==", title: "Something else" });
    expect(badTitle.status).toBeGreaterThanOrEqual(400);
    const badTtl = await restAs(tokenA, "POST", "chat_sessions", { user_id: a.id, salt: "c2FsdA==", retention_ttl_days: 365 });
    expect(badTtl.status).toBeGreaterThanOrEqual(400);
  } finally {
    await a.context.close();
    await b.context.close();
    await c.context.close();
  }
});

test("6. the data export contains chat ciphertext rows and no plaintext", async ({ browser, baseURL }) => {
  const { page, context, id } = await readyUser(browser, baseURL, "chatexport");
  try {
    const userText = `Export check message ${Date.now()}`;
    await say(page, userText);
    await expect(page.getByRole("log").getByText(GENERIC_REPLY)).toBeVisible({ timeout: 30_000 });
    await waitForSavedExchange(id);

    const token = await getAccessToken(page);
    const res = await fetch(`${API}/functions/v1/${FUNCTIONS_SLUG}/me/export`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const raw = await res.text();
    const body = JSON.parse(raw) as {
      chatSessions?: { id: string; salt?: string; chat_messages?: unknown[] }[];
      chatMessages?: { session_id: string; sender_role: string; seq: number; encrypted_content: string; iv: string }[];
      encryptedBlobs?: unknown[];
    };
    expect(body.chatSessions?.length, "one exported session").toBe(1);
    expect(body.chatMessages?.length, "two exported messages").toBe(2);
    expect(body.chatMessages?.map((m) => `${m.sender_role}:${m.seq}`).sort()).toEqual(["assistant:2", "user:1"]);
    for (const m of body.chatMessages || []) {
      expect(m.encrypted_content.length).toBeGreaterThan(20);
      expect(m.iv.length).toBeGreaterThan(8);
    }
    expect(Array.isArray(body.encryptedBlobs), "export lists encryptedBlobs").toBe(true);
    for (const text of [userText, GENERIC_REPLY]) {
      expect(leaks(raw, text), `export must not contain "${text.slice(0, 20)}..."`).toBeNull();
    }
  } finally {
    await context.close();
  }
});
