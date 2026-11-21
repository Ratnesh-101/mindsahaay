import { test, expect, type Page } from "@playwright/test";

// Runs only in the "pwa" project: a production build served by `vite preview` (port 5292),
// built in demo mode with VITE_PWA_E2E=true so the service worker registers.

async function waitForActiveWorker(page: Page) {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active?.state !== "activated") {
      await new Promise<void>((resolve) => {
        reg.active?.addEventListener("statechange", () => {
          if (reg.active?.state === "activated") resolve();
        });
      });
    }
  });
}

async function shellCacheKeys(page: Page): Promise<string[]> {
  return page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith("mindsahaay-shell-")));
}

async function cachedPaths(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const out: string[] = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const req of await cache.keys()) out.push(req.url);
    }
    return out;
  });
}

/** Loads /crisis online, waits for the worker and the precache, then reloads once so the page is controlled. */
async function primeOnline(page: Page) {
  await page.goto("/crisis");
  await waitForActiveWorker(page);
  await expect.poll(async () => (await shellCacheKeys(page)).length).toBe(1);
  await expect
    .poll(async () => (await cachedPaths(page)).some((u) => u.endsWith("/index.html")))
    .toBe(true);
  await page.reload();
  await expect(page.getByTestId("helplines-verified")).toBeVisible();
}

test.describe("PWA shell", () => {
  test("manifest is linked, valid and its icons resolve", async ({ page, request }) => {
    await page.goto("/login");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBe("/manifest.webmanifest");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#19443c");

    const res = await request.get(href!);
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest.name).toBe("MindSahaay");
    expect(manifest.short_name).toBe("MindSahaay");
    expect(manifest.start_url).toBe("/dashboard");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#19443c");
    const purposes = manifest.icons.map((i: { purpose: string }) => i.purpose);
    expect(purposes).toContain("maskable");
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === "192x192")).toBe(true);
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === "512x512")).toBe(true);
    for (const icon of manifest.icons) {
      const r = await request.get(icon.src);
      expect(r.ok(), icon.src).toBe(true);
      expect(r.headers()["content-type"]).toContain("image/png");
    }
  });

  test("worker becomes active after the first online load with a versioned cache", async ({ page }) => {
    await page.goto("/crisis");
    await waitForActiveWorker(page);
    const state = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state);
    expect(state).toBe("activated");
    await expect.poll(async () => (await shellCacheKeys(page)).length).toBe(1);
    const [key] = await shellCacheKeys(page);
    expect(key).toMatch(/^mindsahaay-shell-[0-9a-f]{14}$/);
    const paths = await cachedPaths(page);
    expect(paths.some((u) => u.endsWith("/offline.html"))).toBe(true);
    expect(paths.some((u) => /\/assets\/.*\.js$/.test(u))).toBe(true);
    expect(paths.some((u) => u.endsWith("/sw.js"))).toBe(false);
  });

  test("crisis page reloads offline with the three helplines and the verified date", async ({ page, context }) => {
    await primeOnline(page);
    await context.setOffline(true);
    await page.reload();

    await expect(page.getByTestId("helplines-verified")).toContainText(/2026/);
    await expect(page.locator('a[href="tel:14416"]').first()).toBeVisible();
    await expect(page.locator('a[href="tel:18005990019"]').first()).toBeVisible();
    await expect(page.locator('a[href="tel:112"]').first()).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).toContain("14416");
    expect(body).toContain("1800-599-0019");
    expect(body).toContain("112");
    await context.setOffline(false);
  });

  test("chat route renders offline from the cached shell", async ({ page, context }) => {
    await primeOnline(page);
    await context.setOffline(true);
    await page.goto("/chat");
    await expect(page.locator("#root")).not.toBeEmpty();
    await expect(page).not.toHaveTitle(/You are offline/i);
    await expect(page.getByRole("heading", { name: /You are offline/i })).toHaveCount(0);
    await expect(page.locator("main, [role='main']").first()).toBeVisible();
    await context.setOffline(false);
  });

  test("an uncached route shows the offline page with helplines and a working try again button", async ({
    page,
    context,
  }) => {
    await primeOnline(page);
    await context.setOffline(true);
    await page.goto("/journal");
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
    await expect(page.locator('a[href="tel:14416"]')).toBeVisible();
    await expect(page.locator('a[href="tel:18005990019"]')).toBeVisible();
    await expect(page.locator('a[href="tel:112"]')).toBeVisible();
    await expect(page.getByText("14416")).toBeVisible();
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();

    await context.setOffline(false);
    await retry.click();
    await expect(page.getByRole("heading", { name: "You are offline" })).toHaveCount(0);
  });

  test("Supabase-style and authorised requests are never cached", async ({ page }) => {
    await primeOnline(page);
    await page.evaluate(async () => {
      const urls = [
        "/rest/v1/risk_events?select=*",
        "/auth/v1/user",
        "/functions/v1/chat-companion",
        "http://127.0.0.1:54321/rest/v1/profiles",
        "https://example.supabase.co/auth/v1/token",
      ];
      for (const u of urls) {
        await fetch(u).catch(() => undefined);
        await fetch(u, { headers: { Authorization: "Bearer test" } }).catch(() => undefined);
      }
      await fetch("/rest/v1/risk_events", { method: "POST", body: "{}" }).catch(() => undefined);
    });
    const paths = await cachedPaths(page);
    expect(paths.length).toBeGreaterThan(0);
    for (const url of paths) {
      expect(url).not.toMatch(/\/(rest|auth|functions|realtime|storage)\//);
      expect(url).not.toMatch(/supabase|:54321/);
    }
  });

  test("worker reports a version that matches its cache name", async ({ page }) => {
    await primeOnline(page);
    const reply = await page.evaluate(
      () =>
        new Promise<{ version: string; cache: string }>((resolve) => {
          navigator.serviceWorker.addEventListener("message", (e) => resolve(e.data));
          navigator.serviceWorker.controller?.postMessage({ type: "GET_VERSION" });
        }),
    );
    expect(reply.cache).toBe(`mindsahaay-shell-${reply.version}`);
    expect(await shellCacheKeys(page)).toEqual([reply.cache]);
  });
});

test.describe("Offline page language", () => {
  test("English browser: switch link flips to Hindi and back, helplines unchanged", async ({ page, context }) => {
    await primeOnline(page);
    await context.setOffline(true);
    await page.goto("/journal");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();

    await page.getByRole("link", { name: "हिन्दी में देखें" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    await expect(page.getByRole("heading", { name: "आप ऑफ़लाइन हैं" })).toBeVisible();
    await expect(page.getByRole("button", { name: "फिर कोशिश करें" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "You are offline" })).toHaveCount(0);
    await expect(page).toHaveTitle(/आप ऑफ़लाइन हैं/);

    await page.getByRole("link", { name: "View in English" }).click();
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
    await expect(page).toHaveTitle(/You are offline/);
    await context.setOffline(false);
  });
});

test.describe("Offline page in Hindi (hi-IN browser)", () => {
  test.use({ locale: "hi-IN" });

  test("shows the Hindi page with the three helplines, the verified date and a working retry", async ({
    page,
    context,
  }) => {
    await primeOnline(page);
    await context.setOffline(true);
    await page.goto("/journal");

    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    await expect(page.getByRole("heading", { name: "आप ऑफ़लाइन हैं" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "You are offline" })).toHaveCount(0);
    await expect(page).toHaveTitle(/आप ऑफ़लाइन हैं/);
    await expect(page.locator('a[href="tel:14416"]')).toBeVisible();
    await expect(page.locator('a[href="tel:18005990019"]')).toBeVisible();
    await expect(page.locator('a[href="tel:112"]')).toBeVisible();
    await expect(page.locator('a[href="tel:112"]')).toContainText("आपातकालीन सेवा");
    await expect(page.getByText("1800-599-0019")).toBeVisible();
    await expect(page.locator("small:visible")).toContainText(/सत्यापित/);
    await expect(page.locator("small:visible")).toContainText(/2026-\d\d-\d\d/);
    await expect(page.getByRole("link", { name: "View in English" })).toBeVisible();

    const retry = page.getByRole("button", { name: "फिर कोशिश करें" });
    await expect(retry).toBeVisible();
    await context.setOffline(false);
    await retry.click();
    await expect(page.getByRole("heading", { name: "आप ऑफ़लाइन हैं" })).toHaveCount(0);
  });
});