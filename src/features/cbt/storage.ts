import { z } from "zod";
import {
  isVaultLocked,
  getSecureItemSync,
  setSecureItem,
  clearAllLocalUserData,
} from "../../shared/lib/storage/secureStore";

export const ACTIVITY_KEY = "mindsahaay-cbt-activities";
export const WORRY_KEY = "mindsahaay-cbt-worry";

export const ActivitySchema = z.object({
  id: z.string(),
  name: z.string(),
  when: z.string(),
  category: z.enum(["pleasure", "mastery", "social"]),
  moodBefore: z.number().min(0).max(10),
  moodAfter: z.number().min(0).max(10).nullable(),
  done: z.boolean(),
});
export type Activity = z.infer<typeof ActivitySchema>;

export const WorryStateSchema = z.object({
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  duration: z.number().min(5).max(60),
  parked: z.array(z.object({ id: z.string(), text: z.string() })),
});
export type WorryState = z.infer<typeof WorryStateSchema>;

export const DEFAULT_WORRY: WorryState = { time: null, duration: 15, parked: [] };

function resolveLogicalKey(key: string): string {
  if (key === ACTIVITY_KEY) return "cbt_activities";
  if (key === WORRY_KEY) return "cbt_worry";
  return key;
}

/**
 * Reads and validates a JSON value from secureStore memory or legacy store.
 * Returns the fallback if the vault is locked or invalid.
 */
export function loadLocal<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  if (isVaultLocked()) {
    return fallback;
  }
  const logical = resolveLogicalKey(key);
  const secure = getSecureItemSync<T>(logical);
  if (secure.status === "unlocked" && secure.value !== null) {
    const parsed = schema.safeParse(secure.value);
    return parsed.success ? parsed.data : fallback;
  }

  // Fallback for reading un-migrated raw legacy key before first lock
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    if (!raw) return fallback;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Persists value into zero-knowledge AES-256-GCM secure storage and resolves true only when the
 * encrypted copy was really written to this device. Resolves false when the vault is locked or the
 * browser refused the write, so callers can say plainly that nothing was saved.
 * Ensures plaintext key is never retained in localStorage.
 */
export async function saveLocal(key: string, value: unknown): Promise<boolean> {
  const logical = resolveLogicalKey(key);
  const result = await setSecureItem(logical, value);
  if (result.status !== "ok") return false;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  } catch {
    // The legacy plaintext key could not be removed; the encrypted copy is still saved.
  }
  return true;
}

/**
 * Removes every CBT item stored on this device.
 * Thin alias to central `clearAllLocalUserData()`.
 */
export function clearCbtLocalData(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(ACTIVITY_KEY);
      localStorage.removeItem(WORRY_KEY);
    }
  } catch {
    // ignore
  }
  clearAllLocalUserData();
}

/** Returns the next occurrence of HH:MM as a Date (today if still ahead, otherwise tomorrow). */
export function nextOccurrence(time: string, now: Date = new Date()): Date {
  const [h, m] = time.split(":").map(Number);
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}
