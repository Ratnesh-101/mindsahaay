import AxeBuilder from "@axe-core/playwright";
import { test, expect, gotoRoute, SOS_NAME } from "./helpers";

test.describe("offline UI (demo mode)", () => {
  test("banner and helplines appear offline and disappear when back online", async ({ page, context }) => {
    await gotoRoute(page, "/dashboard");
    await expect(page.getByTestId("offline-banner")).toHaveCount(0);

    await context.setOffline(true);
    const banner = page.getByTestId("offline-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("You are offline. Helplines and your safety plan still work.");
    await expect(banner.getByRole("link", { name: /Tele-MANAS.*14416/ })).toHaveAttribute("href", "tel:14416");
    await expect(banner.getByRole("link", { name: /KIRAN.*1800-599-0019/ })).toHaveAttribute("href", "tel:18005990019");
    await expect(banner.getByRole("link", { name: /Emergency.*112/ })).toHaveAttribute("href", "tel:112");
    // The SOS button stays available.
    await expect(page.getByRole("button", { name: SOS_NAME })).toBeVisible();

    await context.setOffline(false);
    await expect(banner).toHaveCount(0);
  });

  test("dismissed banner returns on the next offline event", async ({ page, context }) => {
    await gotoRoute(page, "/dashboard");
    await context.setOffline(true);
    await page.getByRole("button", { name: /dismiss offline notice/i }).click();
    await expect(page.getByTestId("offline-banner")).toHaveCount(0);
    await context.setOffline(false);
    await context.setOffline(true);
    await expect(page.getByTestId("offline-banner")).toBeVisible();
  });

  test("banner has no serious accessibility violations", async ({ page, context }) => {
    await gotoRoute(page, "/dashboard");
    await context.setOffline(true);
    await expect(page.getByTestId("offline-banner")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('[data-testid="offline-banner"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });

  test("crisis page shows the verified date, and an offline note when offline", async ({ page, context }) => {
    await gotoRoute(page, "/crisis");
    await expect(page.getByTestId("helplines-verified")).toContainText(/Helpline numbers last verified .*2026/);
    await expect(page.getByTestId("crisis-offline-note")).toHaveCount(0);
    await context.setOffline(true);
    await expect(page.getByTestId("crisis-offline-note")).toContainText(/works without a connection/i);
    await expect(page.getByLabel(/Call Tele-MANAS at 14416/i)).toHaveAttribute("href", "tel:14416");
    await expect(page.getByLabel(/Dial Emergency 112/i)).toHaveAttribute("href", "tel:112");
  });

  test("the SOS button does not move when the offline banner appears", async ({ page, context }) => {
    await gotoRoute(page, "/dashboard");
    const sos = page.getByRole("button", { name: SOS_NAME });
    const before = await sos.boundingBox();
    await context.setOffline(true);
    await expect(page.getByTestId("offline-banner")).toBeVisible();
    const after = await sos.boundingBox();
    expect(after).toEqual(before);
  });
});
