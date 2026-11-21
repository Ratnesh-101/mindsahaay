/**
 * Pure helpers that build the service worker cache version. Used by the Vite plugin at build time.
 * The hash is a fast non-cryptographic 53-bit hash (cyrb53); it only has to change when the
 * precache list or the helpline data changes, not resist attackers.
 */

function cyrb53(input: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Normalises line endings so Windows and Linux builds of the same source agree. */
function normalise(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * Cache version = hash(sorted, de-duplicated precache list + helplines.ts content).
 * Changing a helpline number, its wording or HELPLINES_LAST_VERIFIED changes the version.
 */
export function computeCacheVersion(precacheList: readonly string[], helplinesSource: string): string {
  const list = Array.from(new Set(precacheList)).sort().join("\n");
  const payload = `${list}\n---helplines---\n${normalise(helplinesSource)}`;
  return cyrb53(payload).toString(16).padStart(14, "0");
}

export const CACHE_PREFIX = "mindsahaay-shell-";

export function cacheNameFor(version: string): string {
  return `${CACHE_PREFIX}${version}`;
}
