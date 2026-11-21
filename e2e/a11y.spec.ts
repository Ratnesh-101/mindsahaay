import AxeBuilder from "@axe-core/playwright";
import { test, expect, MAIN_ROUTES, gotoRoute, setTheme } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const ROUTES = [...MAIN_ROUTES, "/login", "/onboarding", "/this-page-does-not-exist"];

// Confirmed axe violations, documented in docs/18-testing-report.md (E2E and accessibility results).
// Key: theme|viewport|route. Value: failing rule ids. Each entry is test.fixme until a UI fix lands;
// remove the entry once fixed so the test guards against regression.
const KNOWN_VIOLATIONS: Record<string, string> = {};

const VIEWPORTS = [
  { name: "desktop", size: { width: 1280, height: 800 } },
  { name: "mobile-375", size: { width: 375, height: 812 } },
];

for (const theme of ["light", "dark"] as const) {
  for (const vp of VIEWPORTS) {
    test.describe(`axe ${theme} / ${vp.name}`, () => {
      test.use({ viewport: vp.size });

      for (const route of ROUTES) {
        test(`${route} has no serious or critical violations`, async ({ page }) => {
          const known = KNOWN_VIOLATIONS[`${theme}|${vp.name}|${route}`];
          test.fixme(!!known, `documented axe violation: ${known}`);
          await setTheme(page, theme);
          await gotoRoute(page, route);
          const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
          const blocking = results.violations.filter(
            (v) => v.impact === "serious" || v.impact === "critical",
          );
          const summary = blocking.map((v) => ({
            rule: v.id,
            impact: v.impact,
            nodes: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
            total: v.nodes.length,
          }));
          expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
        });
      }
    });
  }
}

test("focus indicator is visible on the first Tab stop", async ({ page }) => {
  await gotoRoute(page, "/dashboard");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus-visible").first();
  await expect(focused).toBeVisible();
  const style = await focused.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
  });
  expect((style.style !== "none" && style.width !== "0px") || style.shadow !== "none").toBe(true);
});
