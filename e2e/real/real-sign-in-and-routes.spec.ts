import { test, expect, cleanupCreated, newUser, magicLinkLogin } from "./helpers";

const ROUTES = ["/dashboard", "/mood", "/assessment", "/chat", "/journal", "/doctors", "/stories", "/insights", "/crisis", "/consent", "/settings", "/onboarding"];

test.afterAll(async () => {
  await cleanupCreated();
});

test("magic-link sign-in lands in the app and every main route renders cleanly", async ({ page }) => {
  const { email } = newUser("routes");
  const consoleErrors: string[] = [];
  const badRequests: string[] = [];
  let current = "login";
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`${current}: ${m.text().slice(0, 160)}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`${current}: PAGEERROR ${String(e).slice(0, 160)}`));
  page.on("response", (r) => {
    if (r.url().includes(":54321") && r.status() >= 400) badRequests.push(`${current}: ${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 100)}`);
  });
  page.on("requestfailed", (r) => {
    if (r.url().includes(":54321")) badRequests.push(`${current}: FAILED ${r.method()} ${r.url().slice(0, 100)} ${r.failure()?.errorText || ""}`);
  });

  await magicLinkLogin(page, email);
  // A brand-new account goes through the dashboard (or onboarding on first run).
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/);
  await expect(page.locator("main").first()).toBeVisible();

  for (const route of ROUTES) {
    current = route;
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.locator("#root")).not.toBeEmpty();
    // The full-screen onboarding flow has no app shell, so it has no main landmark.
    const landmark = route === "/onboarding" ? page.getByRole("heading").first() : page.locator("main").first();
    await expect(landmark, `content on ${route}`).toBeVisible();
    // Authenticated: never bounced back to the login form.
    expect(page.url(), `${route} must not redirect to /login`).not.toMatch(/\/login/);
    await expect(page.getByRole("alert").filter({ hasText: /something went wrong|error/i })).toHaveCount(0);
  }

  expect(consoleErrors, "console errors").toEqual([]);
  expect(badRequests, "failed Supabase requests").toEqual([]);
});
