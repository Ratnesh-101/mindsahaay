import { z } from "zod";
import { getFunctionUrl } from "../../shared/lib/supabase";
import { getAuthenticatedSession } from "../../shared/lib/api/sessionHelper";

/** What GET /chat/config reports. Contains no secret, only which provider answers and which data tier it runs on. */
export const ChatConfigSchema = z.object({
  provider: z.string(),
  dataTier: z.string(),
});
export type ChatConfig = z.infer<typeof ChatConfigSchema>;

/** How long the composer waits for GET /chat/config before chat is allowed anyway (no banner, as before). */
export const CHAT_CONFIG_TIMEOUT_MS = 4000;

/** sessionStorage key for the demo-mode acknowledgement. Session scoped on purpose: never localStorage. */
export const FREE_TIER_ACK_KEY = "mindsahaay_free_tier_ack";

/**
 * Asks the server which AI provider and data tier the companion runs on.
 * Best effort: any failure (offline, 4xx/5xx, malformed body) returns null and the chat behaves as before.
 * The deterministic crisis path and helplines never depend on this call.
 */
export async function fetchChatConfig(signal?: AbortSignal): Promise<ChatConfig | null> {
  try {
    const { session } = await getAuthenticatedSession();
    const response = await fetch(getFunctionUrl("/chat/config"), {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${session.access_token}` },
      signal,
    });
    if (!response.ok) return null;
    const parsed = ChatConfigSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function isFreeTier(config: ChatConfig | null): boolean {
  return config?.dataTier === "free";
}

export function readFreeTierAck(): boolean {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(FREE_TIER_ACK_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeFreeTierAck(): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(FREE_TIER_ACK_KEY, "1");
  } catch {
    // The acknowledgement then lasts only for this mounted chat.
  }
}
