import { test, expect } from "./helpers";

/**
 * Where the "offline preview" flag lives. It belongs to one browser tab session (sessionStorage), is
 * never written to localStorage, does not leak into a new browser context, and an old localStorage
 * flag from earlier builds is removed and ignored.
 *
 * This runs in the real-backend project because the default chromium project is served with
 * VITE_DEMO_MODE=true, which forces the preview on and would make "not in preview" untestable.
 * The real project is served with VITE_DEMO_MODE=false. It does not need the backend itself.
 */

const MODE_KEY = "mindsahaay_demo_mode";
const ROLE_KEY = "mindsahaay_demo_role";
const BANNER = "DEMO MODE ACTIVE";

test("the preview button sets a session flag only, and a new browser context does not start in preview", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/login", { waitUntil: "networkidle" });
    // Control: signed out and not in preview, the login page is shown and there is no preview banner.
    await expect(page.getByRole("button", { name: "Offline preview (sample data, no account)" })).toBeVisible();
    expect(await page.evaluate(([m]) => sessionStorage.getItem(m), [MODE_KEY])).toBeNull();

    await page.getByRole("button", { name: "Offline preview (sample data, no account)" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByText(BANNER)).toBeVisible({ timeout: 15_000 });

    const storage = await page.evaluate(
      ([m, r]) => ({
        sessionMode: sessionStorage.getItem(m),
        sessionRole: sessionStorage.getItem(r),
        localMode: localStorage.getItem(m),
        localRole: localStorage.getItem(r),
        localKeys: Object.keys(localStorage).filter((k) => /demo/i.test(k) && /(mode|role)$/.test(k)),
      }),
      [MODE_KEY, ROLE_KEY],
    );
    expect(storage.sessionMode).toBe("true");
    expect(storage.sessionRole, "the button picks the student preview").toBe("student");
    expect(storage.localMode, "the flag is not in localStorage").toBeNull();
    expect(storage.localRole, "the role is not in localStorage").toBeNull();
    expect(storage.localKeys).toEqual([]);

    // A reload in the same tab keeps the preview (sessionStorage survives it).
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText(BANNER)).toBeVisible({ timeout: 15_000 });

    // A brand-new browser context shares neither sessionStorage nor localStorage: no preview.
    const fresh = await browser.newContext({ baseURL });
    try {
      const freshPage = await fresh.newPage();
      await freshPage.goto("/dashboard", { waitUntil: "networkidle" });
      await expect(freshPage).toHaveURL(/\/login/, { timeout: 15_000 });
      await expect(freshPage.getByText(BANNER)).toHaveCount(0);
      const freshStorage = await freshPage.evaluate(
        ([m, r]) => [sessionStorage.getItem(m), sessionStorage.getItem(r), localStorage.getItem(m), localStorage.getItem(r)],
        [MODE_KEY, ROLE_KEY],
      );
      expect(freshStorage).toEqual([null, null, null, null]);
    } finally {
      await fresh.close();
    }
  } finally {
    await context.close();
  }
});

test("a legacy localStorage preview flag is purged on load and does not turn the preview on", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  try {
    // Plants the old-style flag before any app script runs, on every navigation of this context.
    await context.addInitScript(
      ([m, r]) => {
        localStorage.setItem(m, "true");
        localStorage.setItem(r, "counsellor");
      },
      [MODE_KEY, ROLE_KEY],
    );
    const page = await context.newPage();
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    // Not in preview: the signed-out visitor is sent to the login page and no preview banner shows.
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByText(BANNER)).toHaveCount(0);

    // The app removed the planted keys during load, and did not copy them into sessionStorage.
    const after = await page.evaluate(
      ([m, r]) => ({
        localMode: localStorage.getItem(m),
        localRole: localStorage.getItem(r),
        sessionMode: sessionStorage.getItem(m),
        sessionRole: sessionStorage.getItem(r),
      }),
      [MODE_KEY, ROLE_KEY],
    );
    expect(after).toEqual({ localMode: null, localRole: null, sessionMode: null, sessionRole: null });
  } finally {
    await context.close();
  }
});
