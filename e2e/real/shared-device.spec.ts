import {
  test,
  expect,
  adminSql,
  lit,
  cleanupCreated,
  newUser,
  magicLinkLogin,
  userIdByEmail,
  grantConsent,
  unlockVault,
  openFromSidebar,
  waitForCrisisConsentCache,
  outboxCount,
  dbCount,
  getAccessToken,
  restAs,
} from "./helpers";

test.afterAll(async () => {
  await cleanupCreated();
});

test("shared device: A's kept offline item never syncs under B and B cannot read A's data", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL });
  const page = await context.newPage();
  const a = newUser("shareda");
  const b = newUser("sharedb");

  try {
    // ---- Student A queues a crisis event offline ----
    await magicLinkLogin(page, a.email);
    const aId = userIdByEmail(a.email);
    grantConsent(aId, "crisis_intervention");
    await page.reload({ waitUntil: "networkidle" });
    await unlockVault(page);
    await openFromSidebar(page, /MindMate AI/i);
    await waitForCrisisConsentCache(page, aId);

    await context.setOffline(true);
    await expect(page.getByTestId("offline-banner")).toBeVisible();
    await page.getByPlaceholder(/./).last().fill("main khud ko khatam kar dunga");
    await page.getByRole("button", { name: /send/i }).last().click();
    await expect(page.locator("main")).toContainText("14416", { timeout: 10_000 });
    await expect.poll(() => outboxCount(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);

    // Back online but the risk_events endpoint is unreachable, so A's item stays unsynced.
    await context.route("**/rest/v1/risk_events*", (route) => route.abort("internetdisconnected"));
    await context.setOffline(false);
    await page.waitForTimeout(3000);
    expect(await outboxCount(page)).toBeGreaterThanOrEqual(1);
    expect(dbCount("risk_events", aId)).toBe(0);

    // ---- A signs out and keeps the encrypted item on the device ----
    await page.getByRole("button", { name: /Sign out of current account/i }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Keep encrypted on this device/i }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    await context.unroute("**/rest/v1/risk_events*");

    // ---- Student B signs in on the same browser profile ----
    await magicLinkLogin(page, b.email);
    const bId = userIdByEmail(b.email);
    expect(bId).not.toBe(aId);
    // Give B's outbox every chance to (wrongly) flush A's item.
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.waitForTimeout(6000);

    // A's row was never inserted, under B or under A.
    expect(dbCount("risk_events", bId), "no risk event under B").toBe(0);
    expect(dbCount("risk_events", aId), "A's kept item did not sync while B is signed in").toBe(0);
    // A's item is still on the device, encrypted, for A to sync later.
    expect(await outboxCount(page)).toBeGreaterThanOrEqual(1);

    // B cannot read A's data through the API (RLS).
    adminSql(`insert into public.mood_entries (student_id, mood, score, tags) values (${lit(aId)}, 'Good', 4, '{}')`);
    const bToken = await getAccessToken(page);
    for (const table of ["mood_entries", "risk_events", "consents"]) {
      const res = await restAs(bToken, "GET", `${table}?student_id=eq.${aId}&select=*`);
      expect(res.status, `${table} read status`).toBe(200);
      expect(res.json, `B reads A's ${table}`).toEqual([]);
    }
  } finally {
    await context.close();
  }
});
