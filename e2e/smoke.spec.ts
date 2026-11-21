import { test, expect, MAIN_ROUTES, SOS_NAME, gotoRoute } from "./helpers";

test.describe("smoke", () => {
  test("app shell loads without page errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    const response = await page.goto("/login");
    expect(response?.ok()).toBe(true);
    await expect(page.locator("#root")).not.toBeEmpty();
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator("html")).toHaveAttribute("lang", /.+/);
    expect(errors).toEqual([]);
  });

  for (const route of MAIN_ROUTES) {
    test(`${route} renders a main landmark and the SOS button`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await gotoRoute(page, route);
      await expect(page.getByRole("main").first()).toBeVisible();
      await expect(page.getByRole("button", { name: SOS_NAME })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});
