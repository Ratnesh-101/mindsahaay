import { test, expect, adminSql, lit, cleanupCreated, signIn, grantConsent, unlockVault, openFromSidebar, dbCount } from "./helpers";

/**
 * "No fabricated data, real data is saved" against the real backend.
 * A brand-new account must show honest empty states, and what the student enters must be in the
 * database and survive a reload.
 */

test.afterAll(async () => {
  await cleanupCreated();
});

// Literals the real-mode dashboard used to show to every user.
const FABRICATED = /7h 20m|3,420|4-day positive|Saved locally|78\s*\/\s*100|24\s*\/\s*100|Kabir|98765 43210/;

test("a fresh account shows no fabricated values and has zero rows", async ({ browser, baseURL }) => {
  const { page, context, id } = await signIn(browser, "freshempty", baseURL);
  try {
    expect(dbCount("mood_entries", id), "no mood rows for a new account").toBe(0);
    expect(dbCount("assessments", id), "no assessment rows for a new account").toBe(0);

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByTestId("dashboard-empty-state")).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(FABRICATED);

    for (const route of ["/insights", "/mood"]) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator("main").first()).toBeVisible();
      expect(await page.locator("main").innerText(), `${route} must not show fabricated values`).not.toMatch(FABRICATED);
    }

    // Opening the pages must not have created any data.
    expect(dbCount("mood_entries", id)).toBe(0);
    expect(dbCount("assessments", id)).toBe(0);
  } finally {
    await context.close();
  }
});

test("a mood logged on the dashboard says Saved only after the row is in the database, and survives a reload", async ({ browser, baseURL }) => {
  const { page, context, id } = await signIn(browser, "dashmood", baseURL);
  try {
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Select mood: Good" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible({ timeout: 15_000 });
    expect(dbCount("mood_entries", id), "the row is really there").toBe(1);
    expect(adminSql(`select mood from public.mood_entries where student_id=${lit(id)}`)).toBe("Good");

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("dashboard-empty-state")).toHaveCount(0);
    expect(dbCount("mood_entries", id)).toBe(1);
  } finally {
    await context.close();
  }
});

test("when the save fails the dashboard shows an error and never says Saved", async ({ browser, baseURL }) => {
  const { page, context, id } = await signIn(browser, "dashfail", baseURL);
  try {
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.route(/\/rest\/v1\/mood_entries/, (route) => (route.request().method() === "POST" ? route.abort("failed") : route.continue()));
    await page.getByRole("button", { name: "Select mood: Low" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /could not save/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toHaveCount(0);
    expect(await page.locator("main").innerText()).not.toMatch(/Saved locally/);
    expect(dbCount("mood_entries", id), "nothing was stored").toBe(0);
  } finally {
    await context.close();
  }
});

test("offline, the dashboard quick log says it is queued on this device, then it syncs", async ({ browser, baseURL }) => {
  const { page, context, id } = await signIn(browser, "dashoffline", baseURL);
  try {
    grantConsent(id, "crisis_intervention");
    await page.reload({ waitUntil: "networkidle" });
    await unlockVault(page);
    await openFromSidebar(page, /Overview/i);
    await expect(page.getByRole("button", { name: "Select mood: Okay" })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("button", { name: "Select mood: Okay" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Saved on this device/ })).toBeVisible({ timeout: 10_000 });
    expect(dbCount("mood_entries", id), "not in the database while offline").toBe(0);
    await context.setOffline(false);
    await expect.poll(() => dbCount("mood_entries", id), { timeout: 30_000 }).toBe(1);
  } finally {
    await context.close();
  }
});

test("a mood entered on the Mood Log page survives a reload and is in the database", async ({ browser, baseURL }) => {
  const { page, context, id } = await signIn(browser, "moodpage", baseURL);
  try {
    await page.goto("/mood", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Good \(score/i }).first().click();
    await page.locator("button[type=submit]").first().click();
    await expect.poll(() => dbCount("mood_entries", id), { timeout: 15_000 }).toBe(1);
    await page.reload({ waitUntil: "networkidle" });
    expect(dbCount("mood_entries", id)).toBe(1);
    // The reloaded page reads the row back from the server (the dashboard no longer shows its empty state).
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByTestId("dashboard-empty-state")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
