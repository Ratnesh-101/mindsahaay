import { test, expect, adminSql, lit, cleanupCreated, signIn, grantConsent, unlockVault, openFromSidebar, waitForCrisisConsentCache, outboxCount, dbCount } from "./helpers";

test.afterAll(async () => {
  await cleanupCreated();
});

// This test found a real bug: useAddMood() used TanStack Query's default networkMode "online", so the
// mutation paused offline and never reached the outbox. Fixed in src/shared/lib/api/moods.ts (networkMode "always").
test("offline mood check-in is queued, then synced with a server created_at", async ({ browser, baseURL }) => {
  const user = await signIn(browser, "offlinemood", baseURL);
  const { page, context, id } = user;
  try {
    grantConsent(id, "crisis_intervention");
    await page.reload({ waitUntil: "networkidle" });
    await unlockVault(page);

    await openFromSidebar(page, /Mood Log/i);
    await expect(page.getByRole("button", { name: /Good \(score/i }).first()).toBeVisible();
    const moodBefore = dbCount("mood_entries", id);
    await context.setOffline(true);
    await expect(page.getByTestId("offline-banner")).toBeVisible();
    await page.getByRole("button", { name: /Good \(score/i }).first().click();
    await page.locator("button[type=submit]").first().click();
    await expect.poll(() => outboxCount(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId("sync-chip-region")).toContainText(/waiting to sync/i, { timeout: 10_000 });
    expect(dbCount("mood_entries", id), "DB must not change while offline").toBe(moodBefore);

    await context.setOffline(false);
    await expect.poll(() => dbCount("mood_entries", id), { timeout: 30_000 }).toBe(moodBefore + 1);
    expect(adminSql(`select (now() - max(created_at)) < interval '2 minutes' from public.mood_entries where student_id=${lit(id)}`), "server-assigned created_at is recent").toBe("t");
    await expect.poll(() => outboxCount(page), { timeout: 15_000 }).toBe(0);
  } finally {
    await context.close();
  }
});

test("offline crisis message shows helplines at once and syncs as a text-free risk event", async ({ browser, baseURL }) => {
  const user = await signIn(browser, "offlinecrisis", baseURL);
  const { page, context, id } = user;
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));

  try {
    // Consent as granted on /consent; reload while ONLINE so the first crisis can happen offline.
    grantConsent(id, "crisis_intervention");
    await page.reload({ waitUntil: "networkidle" });
    await unlockVault(page);

    await openFromSidebar(page, /MindMate AI/i);
    await waitForCrisisConsentCache(page, id);
    const eventsBefore = dbCount("risk_events", id);
    await context.setOffline(true);
    await expect(page.getByTestId("offline-banner")).toBeVisible();
    const crisisText = "mujhe jeena nahi hai, main khud ko khatam kar dunga";
    await page.getByPlaceholder(/./).last().fill(crisisText);
    await page.getByRole("button", { name: /send/i }).last().click();

    // Helplines show at once, with no network.
    const main = page.locator("main");
    await expect(main).toContainText("14416", { timeout: 10_000 });
    await expect(main).toContainText("1800-599-0019");
    await expect(main).toContainText("112");
    // The event waits in the encrypted outbox (IndexedDB mindsahaay_outbox_*), not in the DB.
    await expect.poll(() => outboxCount(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    expect(dbCount("risk_events", id), "DB must not change while offline").toBe(eventsBefore);

    await context.setOffline(false);
    await expect.poll(() => dbCount("risk_events", id), { timeout: 40_000 }).toBe(eventsBefore + 1);

    const row = (col: string) =>
      adminSql(`select ${col} from public.risk_events where student_id=${lit(id)} order by created_at desc limit 1`);
    expect(row("payload->>'offline'")).toBe("true");
    expect(row("(created_at > (payload->>'detected_at')::timestamptz)")).toBe("t");
    const payload = row("payload::text");
    expect(payload).not.toMatch(/jeena|khatam|khud/i);
    expect(payload).not.toContain(crisisText);
    await expect.poll(() => outboxCount(page), { timeout: 15_000 }).toBe(0);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
  }
});