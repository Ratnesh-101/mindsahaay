import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ANON_KEY, API, EMAIL_DOMAIN, EMAIL_PREFIX, FUNCTIONS_SLUG, INSTITUTION_ID, MAILPIT, adminSql, lit } from "./env";
import { cleanupUsers } from "./cleanup";

export { expect, adminSql, lit, API, ANON_KEY, FUNCTIONS_SLUG };

/** Every test imports `test` from here so the whole project skips when the stack is down. */
export const test = base.extend<{ _backendGuard: void }>({
  _backendGuard: [
    async ({}, use, testInfo) => {
      if (process.env.REAL_BACKEND_DOWN) {
        testInfo.skip(true, `real backend not running, skipped (${process.env.REAL_BACKEND_DOWN})`);
      }
      await use();
    },
    { auto: true },
  ],
});

const createdEmails: string[] = [];
let counter = 0;

/** Unique, timestamped test identity. Tracked so cleanupCreated() can delete it. */
export function newUser(prefix: string): { email: string } {
  const slug = prefix.toLowerCase().replace(/[^a-z0-9]/g, "");
  const email = `${EMAIL_PREFIX}${slug}-${Date.now()}-${process.pid}-${counter++}@${EMAIL_DOMAIN}`;
  createdEmails.push(email);
  return { email };
}

/** Deletes every user (and their data) created through newUser in this worker. Call from afterAll. */
export async function cleanupCreated() {
  const emails = createdEmails.splice(0);
  await cleanupUsers(emails);
}

export function userIdByEmail(email: string): string {
  const id = adminSql(`select id from auth.users where email=${lit(email)}`);
  if (!id) throw new Error(`no auth user for ${email}`);
  return id;
}

interface MailpitSummary {
  ID: string;
}

async function mailIdsFor(email: string): Promise<string[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  if (!res.ok) return [];
  const body = (await res.json()) as { messages?: MailpitSummary[] };
  return (body.messages || []).map((m) => m.ID);
}

/**
 * Requests a magic link in the real login form, waits for a mail that did not exist before the
 * request, follows its verify link and finishes the session in the app origin under test.
 *
 * The verify endpoint redirects to the project's allow-listed site URL, which is not the test
 * server. The tokens in that redirect are replayed on the test origin, where the Supabase client
 * picks them up (detectSessionInUrl), so the sign-in is still the real Auth flow.
 */
export async function magicLinkLogin(page: Page, email: string): Promise<void> {
  let before = new Set(await mailIdsFor(email));
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByPlaceholder(/aarav/i).fill(email);

  const requestLink = async () => {
    const otp = page.waitForResponse((r) => r.url().includes("/auth/v1/otp"), { timeout: 30_000 });
    await page.getByRole("button", { name: /Send Passwordless Magic Link/i }).click();
    const res = await otp;
    if (res.status() >= 400) throw new Error(`magic-link request failed: HTTP ${res.status()} ${(await res.text()).slice(0, 160)}`);
  };

  let link: string | null = null;
  // One re-request if the mail does not show up (the local mailer occasionally drops one under load).
  for (let attempt = 0; attempt < 2 && !link; attempt++) {
    if (attempt > 0) {
      // A new request replaces the old token, so only mails arriving after it are valid.
      before = new Set(await mailIdsFor(email));
      await page.goto("/login", { waitUntil: "networkidle" });
      await page.getByPlaceholder(/aarav/i).fill(email);
    }
    await requestLink();
    const deadline = Date.now() + 20_000;
    while (!link && Date.now() < deadline) {
      const fresh = (await mailIdsFor(email)).filter((id) => !before.has(id));
      for (const id of fresh) {
        const full = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { HTML?: string; Text?: string };
        const m = /https?:\/\/[^"'\s<>]*\/auth\/v1\/verify[^"'\s<>]*/.exec(`${full.HTML || ""} ${full.Text || ""}`);
        if (m) {
          link = m[0].replace(/&amp;/g, "&");
          break;
        }
      }
      if (!link) await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!link) throw new Error(`no fresh magic-link mail for ${email}`);

  const verify = await fetch(link, { redirect: "manual" });
  const location = verify.headers.get("location");
  if (!location) throw new Error(`verify did not redirect (HTTP ${verify.status})`);
  const target = new URL(location);
  if (target.searchParams.get("error") || /error=/.test(target.hash)) throw new Error(`verify returned an error: ${location.slice(0, 200)}`);

  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/${target.search}${target.hash}`, { waitUntil: "networkidle" });
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });
  // Let the post-login redirects and profile fetch settle before the test navigates on.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
}

/** Opens a fresh browser context, signs in through the magic link and returns the ids. */
export async function signIn(browser: Browser, prefix: string, baseURL: string | undefined, viewport = { width: 1280, height: 900 }) {
  const { email } = newUser(prefix);
  const context = await browser.newContext({ viewport, baseURL });
  const page = await context.newPage();
  await magicLinkLogin(page, email);
  const id = userIdByEmail(email);
  return { email, id, context, page };
}

export function getAccessToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
    const token = key ? (JSON.parse(localStorage.getItem(key) || "{}") as { access_token?: string }).access_token : undefined;
    if (!token) throw new Error("no Supabase session in localStorage");
    return token;
  });
}

/** REST call as the signed-in user (RLS applies). */
export async function restAs(token: string, method: string, pathAndQuery: string, body?: unknown) {
  const res = await fetch(`${API}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

export async function submitAssessment(token: string, instrument: string, answers: number[]) {
  const res = await fetch(`${API}/functions/v1/${FUNCTIONS_SLUG}/assessments`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ instrument, answers }),
  });
  return { status: res.status, json: (await res.json()) as { assessment?: { crisis?: boolean } } };
}

/** Local admin SQL: makes a signed-in user a verified counsellor of the seeded institution. */
export function promoteToCounsellor(userId: string) {
  adminSql(`
    update public.profiles set role='counsellor', institution_id=${lit(INSTITUTION_ID)} where id=${lit(userId)};
    insert into public.counsellors (id, license_number, verified, institution_id)
      values (${lit(userId)}, ${lit(`E2E-${userId.slice(0, 8)}`)}, true, ${lit(INSTITUTION_ID)});
  `);
}

export function grantCareShare(studentId: string, counsellorId: string, scopes: string[] = ["risk_events", "profile"]) {
  const arr = `array[${scopes.map(lit).join(",")}]`;
  adminSql(`insert into public.care_shares (student_id, counsellor_id, active, scope) values (${lit(studentId)}, ${lit(counsellorId)}, true, ${arr});`);
}

export function grantConsent(userId: string, purpose: string) {
  adminSql(`
    delete from public.consents where student_id=${lit(userId)} and purpose=${lit(purpose)};
    insert into public.consents (student_id, purpose, consented) values (${lit(userId)}, ${lit(purpose)}, true);
  `);
}

/**
 * The app caches the crisis consent while online so an offline crisis can be queued without a
 * network lookup. Best effort: waits (up to 15 s) until a cache record exists before a test goes
 * offline. The key format is an app detail, so any "mindsahaay_consent_crisis*" key counts and a
 * missing record does not fail the test (newer builds queue offline crises regardless).
 */
export async function waitForCrisisConsentCache(page: Page, _userId: string) {
  await page
    .waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("mindsahaay_consent_crisis")), undefined, { timeout: 15_000 })
    .catch(() => undefined);
}

export const VAULT_PASSPHRASE = "correct-horse-battery";

/**
 * Creates and unlocks the journal vault for a fresh user. Moves with sidebar clicks afterwards
 * (client-side navigation) because the key lives only in memory. PBKDF2 takes a few seconds.
 */
export async function unlockVault(page: Page) {
  await page.getByRole("button", { name: /Private Journal/i }).first().click();
  await page.locator("#vault-pass").fill(VAULT_PASSPHRASE);
  await page.locator("#vault-confirm").fill(VAULT_PASSPHRASE);
  await page.getByRole("button", { name: /^Continue$/ }).click();
  const ack = page.locator("main input[type=checkbox]");
  await ack.waitFor({ state: "visible", timeout: 60_000 });
  await ack.check();
  // The vault metadata is saved with PUT /auth/v1/user. Wait for that call to finish: going
  // offline while it is in flight leaves the vault unsaved and nothing can be queued.
  const saved = page.waitForResponse((r) => r.url().includes("/auth/v1/user") && r.request().method() === "PUT", { timeout: 60_000 });
  await page.getByRole("button", { name: /Create vault/i }).click();
  expect((await saved).ok(), "vault metadata saved").toBe(true);
  await expect(page.locator("#vault-pass")).toHaveCount(0, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
}

export async function openFromSidebar(page: Page, name: RegExp) {
  await page.getByRole("button", { name }).first().click();
  // In dev mode every lazy module is a network fetch: let the route finish loading before a test
  // goes offline, otherwise the dynamic import fails and the error boundary takes over.
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main").first()).toBeVisible();
  await page.waitForTimeout(500);
  await page.waitForLoadState("networkidle");
}

/** Sums the items in every per-user outbox IndexedDB (mindsahaay_outbox_*). */
export function outboxCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const dbs = (await indexedDB.databases?.()) || [];
    let total = 0;
    for (const d of dbs.filter((x) => (x.name || "").startsWith("mindsahaay_outbox_") && x.name !== "mindsahaay_outbox_dbs")) {
      total += await new Promise<number>((resolve) => {
        const rq = indexedDB.open(d.name as string);
        rq.onerror = () => resolve(0);
        rq.onsuccess = () => {
          const db = rq.result;
          if (!db.objectStoreNames.contains("outbox_items")) {
            db.close();
            resolve(0);
            return;
          }
          const c = db.transaction("outbox_items", "readonly").objectStore("outbox_items").count();
          c.onsuccess = () => {
            db.close();
            resolve(c.result);
          };
          c.onerror = () => {
            db.close();
            resolve(0);
          };
        };
      });
    }
    return total;
  });
}

export const dbCount = (table: string, studentId: string) =>
  Number(adminSql(`select count(*) from public.${table} where student_id=${lit(studentId)}`));

export type { BrowserContext };
