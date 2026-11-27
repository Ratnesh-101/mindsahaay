import type { Page } from "@playwright/test";
import {
  test,
  expect,
  adminSql,
  lit,
  cleanupCreated,
  signIn,
  unlockVault,
  getAccessToken,
  restAs,
  promoteToCounsellor,
  grantCareShare,
  magicLinkLogin,
  VAULT_PASSPHRASE,
} from "./helpers";

/**
 * Synced encrypted blobs (CBT activities, worry time, safety-card anchors) against the real local
 * Supabase stack: the put_blob RPC and RLS, and the browser sync between two devices of one user.
 */

test.afterAll(async () => {
  await cleanupCreated();
});

// Opaque slot ids allowed by the encrypted_blobs.slot CHECK (OPAQUE_KEY_MAP in secureStore.ts).
const SLOT_ACTIVITIES = "mindsahaay_sec_0f9a2b8e3d1c4a7e";

const blobRows = (userId: string) => Number(adminSql(`select count(*) from public.encrypted_blobs where user_id=${lit(userId)}`));

function leaks(stored: string, text: string): string | null {
  if (stored.includes(text)) return "plaintext";
  if (stored.includes(Buffer.from(text).toString("base64"))) return "base64";
  for (let k = 1; k <= 2; k++) {
    const frag = Buffer.from("\0".repeat(k) + text).toString("base64").slice(4, -4);
    if (frag.length > 12 && stored.includes(frag)) return `base64 (alignment ${k})`;
  }
  return null;
}

const put = (token: string, slot: string, expected: number, tag = "v") =>
  restAs(token, "POST", "rpc/put_blob", {
    p_slot: slot,
    p_ciphertext: `Y2lwaGVydGV4dC0${tag}`,
    p_iv: "aXYtMTIzNDU2Nzg5",
    p_salt: "c2FsdC0xMjM0NTY3ODk",
    p_expected_version: expected,
  });

test("1. put_blob: create, update, optimistic-lock conflict, owner-only reads, slot allow-list", async ({ browser, baseURL }) => {
  const a = await signIn(browser, "blobrpca", baseURL);
  const b = await signIn(browser, "blobrpcb", baseURL);
  const c = await signIn(browser, "blobrpcc", baseURL);
  try {
    const tokenA = await getAccessToken(a.page);
    const tokenB = await getAccessToken(b.page);

    const created = await put(tokenA, SLOT_ACTIVITIES, 0, "1");
    expect(created.status, JSON.stringify(created.json)).toBe(200);
    expect(created.json, "create (expected 0) returns version 1").toBe(1);

    const updated = await put(tokenA, SLOT_ACTIVITIES, 1, "2");
    expect(updated.status, JSON.stringify(updated.json)).toBe(200);
    expect(updated.json, "update with expected 1 returns version 2").toBe(2);
    expect(adminSql(`select version::text || ',' || ciphertext from public.encrypted_blobs where user_id=${lit(a.id)}`)).toBe("2,Y2lwaGVydGV4dC02");

    const stale = await put(tokenA, SLOT_ACTIVITIES, 1, "3");
    expect(stale.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(stale.json)).toContain("VERSION_CONFLICT");
    expect(adminSql(`select version::text || ',' || ciphertext from public.encrypted_blobs where user_id=${lit(a.id)}`), "a conflict changes nothing").toBe("2,Y2lwaGVydGV4dC02");

    const createAgain = await put(tokenA, SLOT_ACTIVITIES, 0, "4");
    expect(createAgain.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(createAgain.json), "creating over an existing row is a conflict").toContain("VERSION_CONFLICT");

    // Another student cannot read it, and cannot update it by guessing the version.
    const bRead = await restAs(tokenB, "GET", "encrypted_blobs?select=*");
    expect(bRead.status).toBe(200);
    expect(bRead.json).toEqual([]);
    const bUpdate = await put(tokenB, SLOT_ACTIVITIES, 2, "5");
    expect(bUpdate.status).toBeGreaterThanOrEqual(400);
    expect(adminSql(`select count(*) from public.encrypted_blobs where user_id=${lit(a.id)} and ciphertext='Y2lwaGVydGV4dC02'`), "A's row is untouched").toBe("1");
    expect(blobRows(b.id), "B has no row of its own either").toBe(0);
    const bDirect = await restAs(tokenB, "PATCH", `encrypted_blobs?user_id=eq.${a.id}`, { ciphertext: "hacked" });
    expect(Array.isArray(bDirect.json) ? (bDirect.json as unknown[]).length : 0, "direct PATCH of A's row touches no row").toBe(0);

    // A counsellor with a care share cannot read it either.
    promoteToCounsellor(c.id);
    grantCareShare(a.id, c.id);
    const tokenC = await getAccessToken(c.page);
    const cRead = await restAs(tokenC, "GET", "encrypted_blobs?select=*");
    expect(cRead.json).toEqual([]);

    // Slots outside the allow-list are rejected, by the RPC and by the table CHECK.
    const badSlot = await put(tokenA, "mindsahaay_sec_not_allowed", 0, "6");
    expect(badSlot.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(badSlot.json).toLowerCase()).toContain("slot");
    const badInsert = await restAs(tokenA, "POST", "encrypted_blobs", {
      user_id: a.id,
      slot: "journal",
      ciphertext: "x",
      iv: "y",
      salt: "z",
    });
    expect(badInsert.status).toBeGreaterThanOrEqual(400);
    expect(blobRows(a.id), "only the one allowed slot row exists").toBe(1);
  } finally {
    await a.context.close();
    await b.context.close();
    await c.context.close();
  }
});

/** Journal page -> CBT toolkit tab -> Activity planner tab. The vault must already be unlocked in this page. */
async function openActivityPlanner(page: Page) {
  await page.getByRole("button", { name: /Private Journal/i }).first().click();
  await page.getByRole("tab", { name: "CBT toolkit" }).click();
  await page.getByRole("tab", { name: "Activity planner" }).click();
  await expect(page.locator("#ap-name")).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
}

async function addActivity(page: Page, name: string) {
  await page.locator("#ap-name").fill(name);
  await page.locator("#ap-when").fill("2030-01-15T18:30");
  await page.getByRole("button", { name: "Add to plan" }).click();
  await expect(page.locator("article.journal-item", { hasText: name })).toBeVisible({ timeout: 30_000 });
}

const syncLine = (page: Page) => page.getByTestId("sync-cbt_activities");

test("2. an activity saved on one device is encrypted on the server and appears on a second device after unlock", async ({ browser, baseURL }) => {
  const a = await signIn(browser, "blobsync", baseURL);
  const bContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL });
  try {
    const name = `Sunrise walk by the lake ${Date.now()}`;
    await unlockVault(a.page);
    await openActivityPlanner(a.page);
    expect(blobRows(a.id), "no blob before anything is saved").toBe(0);
    await addActivity(a.page, name);

    await expect.poll(() => blobRows(a.id), { timeout: 30_000 }).toBe(1);
    await expect(syncLine(a.page)).toContainText("Synced", { timeout: 30_000 });
    expect(adminSql(`select slot from public.encrypted_blobs where user_id=${lit(a.id)}`)).toBe(SLOT_ACTIVITIES);
    const stored = adminSql(`select ciphertext || '|' || iv || '|' || salt from public.encrypted_blobs where user_id=${lit(a.id)}`);
    expect(stored.length).toBeGreaterThan(40);
    expect(leaks(stored, name), "ciphertext must not contain the activity text").toBeNull();
    expect(stored).not.toContain("Sunrise");
    expect(stored).not.toContain("lake");

    // Device B: same account (magic link for the same email), empty browser storage.
    const pageB = await bContext.newPage();
    await magicLinkLogin(pageB, a.email);
    await pageB.getByRole("button", { name: /Private Journal/i }).first().click();
    await expect(pageB.getByRole("heading", { name: "Unlock your private vault" }), "vault metadata lives in the account, so device B can unlock").toBeVisible({ timeout: 30_000 });
    expect(await pageB.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("mindsahaay_sec_"))), "device B starts with no local copy").toBe(false);
    await pageB.locator("#vault-input").fill(VAULT_PASSPHRASE);
    await pageB.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(pageB.locator("#vault-input")).toHaveCount(0, { timeout: 60_000 });

    await pageB.getByRole("tab", { name: "CBT toolkit" }).click();
    await pageB.getByRole("tab", { name: "Activity planner" }).click();
    await expect(pageB.locator("article.journal-item", { hasText: name }), "the entry arrives from the server after unlock").toBeVisible({ timeout: 60_000 });
    await expect(syncLine(pageB)).toContainText("Synced", { timeout: 30_000 });
    expect(blobRows(a.id), "pulling creates no extra row").toBe(1);
  } finally {
    await a.context.close();
    await bContext.close();
  }
});

test("3. an offline save shows \"Waiting to sync\", then becomes \"Synced\" and reaches the server after reconnecting", async ({ browser, baseURL }) => {
  const a = await signIn(browser, "blobsyncoffline", baseURL);
  try {
    const name = `Offline coffee with a friend ${Date.now()}`;
    await unlockVault(a.page);
    await openActivityPlanner(a.page);
    await a.page.waitForTimeout(500);
    await a.page.waitForLoadState("networkidle");

    await a.context.setOffline(true);
    await expect(a.page.getByTestId("offline-banner")).toBeVisible();
    await addActivity(a.page, name);
    await expect(syncLine(a.page)).toContainText("Waiting to sync", { timeout: 15_000 });
    expect(blobRows(a.id), "nothing reaches the server while offline").toBe(0);

    await a.context.setOffline(false);
    await expect.poll(() => blobRows(a.id), { timeout: 40_000 }).toBe(1);
    await expect(syncLine(a.page)).toContainText("Synced", { timeout: 30_000 });
    const stored = adminSql(`select ciphertext || '|' || iv || '|' || salt from public.encrypted_blobs where user_id=${lit(a.id)}`);
    expect(leaks(stored, name)).toBeNull();
  } finally {
    await a.context.close();
  }
});
