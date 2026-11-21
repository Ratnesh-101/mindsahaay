import { defineConfig, devices } from "@playwright/test";

// Dedicated port so the suite never collides with the Figma Make dev server (8443).
const port = Number(process.env.E2E_PORT || 5199);
const baseURL = `http://localhost:${port}`;
const pwaPort = Number(process.env.E2E_PWA_PORT || 5292);
const pwaBaseURL = `http://localhost:${pwaPort}`;
// The "real" project talks to the local Supabase stack. It only exists when REAL_E2E=1 (set by
// e2e/real/run.mjs), so a plain `npx playwright test` keeps exactly the chromium and pwa projects.
const realEnabled = process.env.REAL_E2E === "1";
const realPort = Number(process.env.E2E_REAL_PORT || 5294);
const realBaseURL = `http://localhost:${realPort}`;
// Servers are only started for the projects that are selected (--project=...), so running the
// existing suite alone never builds or starts the preview server.
const selectedProjects = process.argv
  .map((a, i, all) => (a.startsWith("--project=") ? a.slice(10) : a === "--project" ? all[i + 1] : ""))
  .filter(Boolean);

export default defineConfig({
  testDir: "./e2e",
  // Real-backend specs only run through the "real" project (which overrides this).
  testIgnore: ["**/real/**"],
  ...(realEnabled
    ? { globalSetup: "./e2e/real/global-setup.ts", globalTeardown: "./e2e/real/global-teardown.ts" }
    : {}),
  outputDir: "./test-results",
  fullyParallel: true,
  workers: realEnabled ? 1 : process.env.CI ? 2 : 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // The existing suite. Never needs the preview server.
    { name: "chromium", testIgnore: [/pwa\.spec\.ts/, "**/real/**"], use: { ...devices["Desktop Chrome"] } },
    // PWA checks run against `vite build` + `vite preview` (production service worker).
    {
      name: "pwa",
      testMatch: /pwa\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: pwaBaseURL, serviceWorkers: "allow" },
    },
    ...(realEnabled
      ? [
          {
            name: "real",
            testDir: "./e2e/real",
            testIgnore: [],
            fullyParallel: false,
            retries: 1,
            timeout: 120_000,
            use: { ...devices["Desktop Chrome"], baseURL: realBaseURL },
          },
        ]
      : []),
  ],
  webServer: [
    ...(selectedProjects.length === 0 || selectedProjects.includes("chromium")
      ? [
          {
            // Demo mode works with no backend, so the suite is self-contained.
            command: "npx vite",
            url: baseURL,
            reuseExistingServer: false,
            timeout: 120_000,
            env: { PORT: String(port), VITE_DEMO_MODE: "true" },
          },
        ]
      : []),
    ...(selectedProjects.length === 0 || selectedProjects.includes("pwa")
      ? [
          {
            // Separate outDir so the lead's dist/ is never touched. The demo build opts in to the worker via VITE_PWA_E2E.
            command: `npx vite build --outDir dist-pwa && npx vite preview --outDir dist-pwa --port ${pwaPort} --strictPort`,
            url: pwaBaseURL,
            reuseExistingServer: false,
            timeout: 240_000,
            env: { VITE_DEMO_MODE: "true", VITE_PWA_E2E: "true", PORT: String(pwaPort) },
          },
        ]
      : []),
    ...(realEnabled && selectedProjects.includes("real")
      ? [
          {
            // NOT demo mode: loads .env.local so the app talks to the local Supabase stack.
            command: `npx vite --port ${realPort} --strictPort`,
            url: realBaseURL,
            reuseExistingServer: false,
            timeout: 120_000,
            env: { PORT: String(realPort), VITE_DEMO_MODE: "false" },
          },
        ]
      : []),
  ],
});
