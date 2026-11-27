/**
 * Saved chat history. Messages are encrypted in the browser (see chatCrypto.ts); the server stores
 * ciphertext only. Retention (30 days) and timestamps are enforced by the database.
 */
import { supabase } from "../../shared/lib/supabase";
import { getAuthenticatedSession } from "../../shared/lib/api/sessionHelper";
import { isDemoModeActive } from "../auth/demoMode";
import { getVaultPassphrase } from "../journal/vault";
import {
  decryptChatMessage,
  encryptChatMessage,
  generateSessionSalt,
  getSessionKey,
  type ChatRole,
} from "./chatCrypto";

export class ChatLockedError extends Error {
  constructor(message = "Unlock your vault to save and see past conversations.") {
    super(message);
    this.name = "ChatLockedError";
  }
}

export interface SavedSession {
  id: string;
  createdAt: string;
  messageCount: number;
}

export interface SavedMessage {
  seq: number;
  role: "user" | "assistant";
  text: string;
}

export function canSaveChats(): boolean {
  return getVaultPassphrase() !== null && !isDemoModeActive();
}

function requirePassphrase(): string {
  const passphrase = getVaultPassphrase();
  if (passphrase === null || isDemoModeActive()) throw new ChatLockedError();
  return passphrase;
}

async function sessionKey(sessionId: string, passphrase: string): Promise<CryptoKey> {
  const { data, error } = await supabase.from("chat_sessions").select("salt").eq("id", sessionId).single();
  if (error || !data) throw new Error(error?.message ?? "Conversation not found.");
  return getSessionKey(sessionId, passphrase, String((data as { salt: unknown }).salt));
}

export async function listSessions(): Promise<SavedSession[]> {
  if (isDemoModeActive()) return [];
  await getAuthenticatedSession();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, created_at, chat_messages(count)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as {
    id: string;
    created_at: string;
    chat_messages?: { count: number }[] | null;
  }[]).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    messageCount: row.chat_messages?.[0]?.count ?? 0,
  }));
}

export async function createSession(): Promise<string> {
  const passphrase = requirePassphrase();
  const { user } = await getAuthenticatedSession();
  const salt = generateSessionSalt();
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ user_id: user.id, salt })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create conversation.");
  const id = String((data as { id: unknown }).id);
  await getSessionKey(id, passphrase, salt);
  return id;
}

export async function loadSession(id: string): Promise<SavedMessage[]> {
  const passphrase = requirePassphrase();
  const key = await sessionKey(id, passphrase);
  const { data, error } = await supabase
    .from("chat_messages")
    .select("seq, sender_role, encrypted_content, iv")
    .eq("session_id", id)
    .order("seq", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { seq: number; sender_role: ChatRole; encrypted_content: string; iv: string }[];
  const out: SavedMessage[] = [];
  for (const row of rows) {
    const text = await decryptChatMessage(key, id, row.sender_role, row.seq, row.encrypted_content, row.iv);
    out.push({ seq: row.seq, role: row.sender_role, text });
  }
  return out;
}

export async function saveMessage(
  sessionId: string,
  seq: number,
  role: "user" | "assistant",
  text: string,
): Promise<void> {
  const passphrase = requirePassphrase();
  const key = await sessionKey(sessionId, passphrase);
  const { ciphertext, iv } = await encryptChatMessage(key, sessionId, role, seq, text);
  const { error } = await supabase
    .from("chat_messages")
    .insert({ session_id: sessionId, seq, sender_role: role, encrypted_content: ciphertext, iv });
  if (error) throw new Error(error.message);
}

export async function deleteSession(id: string): Promise<void> {
  await getAuthenticatedSession();
  const { data, error } = await supabase.from("chat_sessions").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Conversation was not deleted.");
}

export async function deleteAllSessions(): Promise<number> {
  const { user } = await getAuthenticatedSession();
  const { data, error } = await supabase.from("chat_sessions").delete().eq("user_id", user.id).select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
