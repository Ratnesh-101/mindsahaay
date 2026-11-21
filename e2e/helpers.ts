import { test as base, expect, type Page } from "@playwright/test";

export const MAIN_ROUTES = [
  "/dashboard",
  "/mood",
  "/assessment",
  "/chat",
  "/journal",
  "/doctors",
  "/stories",
  "/insights",
  "/crisis",
  "/consent",
  "/settings",
] as const;

export const SOS_NAME = /24\/7 Emergency Crisis Helplines/i;

/** Pre-sets theme so first paint is already light or dark. Demo mode itself comes from VITE_DEMO_MODE. */
export async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((value) => {
    localStorage.setItem("mindsahaay-theme", value);
  }, theme);
}

export async function gotoRoute(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#root")).not.toBeEmpty();
}

export const test = base;
export { expect };
