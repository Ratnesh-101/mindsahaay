import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const API = "http://127.0.0.1:54321";
export const MAILPIT = "http://127.0.0.1:54324";
export const DB_CONTAINER = "supabase_db_mindsahaay";
export const INSTITUTION_ID = "10000000-0000-0000-0000-000000000001";
/** Every user created by these tests has an email starting with this prefix. */
export const EMAIL_PREFIX = "e2e-real-";
export const EMAIL_DOMAIN = "example.com";

function readEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const text = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {
    /* handled by backendStatus */
  }
  return out;
}

const env = readEnvLocal();
// Never log this value.
export const ANON_KEY = env.VITE_SUPABASE_ANON_KEY || "";
export const FUNCTIONS_SLUG = env.VITE_FUNCTIONS_SLUG || "server";

/** Local-only SQL through the Supabase Postgres container (no shell, query on stdin). */
export function adminSql(query: string): string {
  const res = spawnSync(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=1"],
    { input: query, encoding: "utf8" },
  );
  if (res.status !== 0) {
    throw new Error(`adminSql failed: ${(res.stderr || res.error?.message || "").trim().slice(0, 300)}`);
  }
  return (res.stdout || "").trim();
}

/** SQL string literal. */
export const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** Returns an empty string when the whole stack is reachable, otherwise a short reason. */
export async function backendStatus(): Promise<string> {
  if (!ANON_KEY) return ".env.local has no VITE_SUPABASE_ANON_KEY";
  try {
    const r = await fetch(`${API}/auth/v1/health`, { headers: { apikey: ANON_KEY }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return `Supabase API answered HTTP ${r.status}`;
  } catch {
    return `Supabase API not reachable at ${API}`;
  }
  try {
    const r = await fetch(`${MAILPIT}/api/v1/messages?limit=1`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return `Mailpit answered HTTP ${r.status}`;
  } catch {
    return `Mailpit not reachable at ${MAILPIT}`;
  }
  try {
    adminSql("select 1");
  } catch {
    return `Postgres container ${DB_CONTAINER} not reachable through docker`;
  }
  return "";
}
