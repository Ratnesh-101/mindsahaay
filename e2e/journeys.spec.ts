import { test, expect, MAIN_ROUTES, SOS_NAME, gotoRoute, setTheme } from "./helpers";

test.describe("demo login", () => {
  test("student demo button leads to the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Enter Demo as Student/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/DEMO MODE ACTIVE/i)).toBeVisible();
  });

  test("role picker dialog lists demo identities and closes with Escape", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /More Roles/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Counsellor/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

test.describe("consent screen", () => {
  test("has granular toggles, a required age check and enters the app", async ({ page }) => {
    await gotoRoute(page, "/onboarding");
    const data = page.getByLabel("Core wellbeing data processing");
    const counsellor = page.getByLabel("Counsellor context sharing");
    const research = page.getByLabel("Anonymized research analytics");
    const crisis = page.getByLabel("Emergency crisis intervention assistance");

    await expect(data).toBeChecked();
    await expect(crisis).toBeChecked();
    // Optional sharing is opt-in, never pre-ticked.
    await expect(counsellor).not.toBeChecked();
    await expect(research).not.toBeChecked();

    await counsellor.check();
    await expect(counsellor).toBeChecked();

    const submit = page.getByRole("button", { name: /Accept & Enter MindSahaay/i });
    await submit.click();
    await expect(page.getByRole("alert").filter({ hasText: /18 years/ })).toBeVisible();

    await page.getByLabel(/Age Confirmation/i).check();
    await submit.click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("core processing consent is required", async ({ page }) => {
    await gotoRoute(page, "/onboarding");
    await page.getByLabel(/Age Confirmation/i).check();
    await page.getByLabel("Core wellbeing data processing").uncheck();
    await page.getByRole("button", { name: /Accept & Enter MindSahaay/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Essential data processing/ })).toBeVisible();
  });
});

test.describe("mood check-in", () => {
  test("logs a mood and confirms", async ({ page }) => {
    await gotoRoute(page, "/mood");
    await expect(page.getByRole("heading", { level: 1, name: /How are you feeling/i })).toBeVisible();
    await page.getByRole("button", { name: /Good \(score 8 out of 10\)/ }).click();
    await expect(page.getByRole("button", { name: /Good \(score 8/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Hopeful" }).click();
    await page.getByLabel(/Private notes/i).fill("Slept well before the lab exam.");
    await page.getByRole("button", { name: /Log Daily Mood/i }).click();
    await expect(page.getByRole("status").filter({ hasText: /Mood logged/ })).toBeVisible();
  });

  test("distress words in notes show the crisis alert with helplines", async ({ page }) => {
    await gotoRoute(page, "/mood");
    await page.getByLabel(/Private notes/i).fill("I want to end my life");
    const alert = page.getByRole("alert").filter({ hasText: /Immediate Crisis Support/i });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole("link", { name: /14416/ })).toBeVisible();
  });
});

test.describe("PHQ-9", () => {
  test("non-zero item 9 shows the crisis card with all helplines before any score", async ({ page }) => {
    await gotoRoute(page, "/assessment");
    await expect(page.getByRole("button", { name: "PHQ-9 Depression (9 Questions)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Items 1 to 8: "Not at all".
    for (let i = 1; i <= 8; i++) {
      await expect(page.getByText(`Question ${i} of 9`)).toBeVisible();
      await page.getByRole("button", { name: /Not at all/ }).click();
    }
    await expect(page.getByText("Question 9 of 9")).toBeVisible();
    await page.getByRole("button", { name: /Several days/ }).click();

    const card = page.getByRole("alert").filter({ hasText: /CRITICAL SAFETY PROTOCOL/i });
    await expect(card).toBeVisible();
    await expect(card.getByRole("link", { name: /Tele-MANAS 14416/ })).toHaveAttribute("href", "tel:14416");
    await expect(card.getByRole("link", { name: /KIRAN.*1800-599-0019/ })).toHaveAttribute(
      "href",
      "tel:18005990019",
    );
    await expect(card.getByRole("link", { name: /Emergency 112/ })).toHaveAttribute("href", "tel:112");
    // No score is shown while the crisis card is up.
    await expect(page.getByText(/Score Band/i)).toHaveCount(0);
    await expect(page.getByText(/Total Score/i)).toHaveCount(0);
  });

  test("zero item 9 gives a score band with the educational disclaimer", async ({ page }) => {
    await gotoRoute(page, "/assessment");
    for (let i = 1; i <= 9; i++) {
      await page.getByRole("button", { name: /Not at all/ }).click();
    }
    await expect(page.getByText(/Score Band/i)).toBeVisible();
    await expect(page.getByText(/Educational Disclaimer/i)).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /CRITICAL SAFETY/i })).toHaveCount(0);
  });
});

test.describe("SOS button", () => {
  test("is present in the same place on every main route", async ({ page }) => {
    const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const route of MAIN_ROUTES) {
      await gotoRoute(page, route);
      const sos = page.getByRole("button", { name: SOS_NAME });
      await expect(sos).toBeVisible();
      const box = await sos.boundingBox();
      expect(box, route).not.toBeNull();
      boxes[route] = box!;
    }
    const ref = boxes["/dashboard"];
    for (const route of MAIN_ROUTES) {
      // Same position (within 2px) so the control is consistently located (WCAG 3.2.6).
      expect(Math.abs(boxes[route].x - ref.x), `${route} x`).toBeLessThanOrEqual(2);
      expect(Math.abs(boxes[route].y - ref.y), `${route} y`).toBeLessThanOrEqual(2);
    }
  });

  test("opens a dialog with the three mandated helplines", async ({ page }) => {
    await gotoRoute(page, "/dashboard");
    await page.getByRole("button", { name: SOS_NAME }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: /Tele-MANAS 14416/ })).toBeVisible();
    await expect(dialog.getByRole("link", { name: /KIRAN.*1800-599-0019/ })).toBeVisible();
    await expect(dialog.getByRole("link", { name: /112/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

test.describe("chat crisis interception", () => {
  test("a crisis message shows an inescapable crisis card without a close control", async ({ page }) => {
    await gotoRoute(page, "/chat");
    await page.getByLabel("Message for MindMate").fill("I want to end my life");
    await page.getByRole("button", { name: "Send message" }).click();

    const card = page.getByTestId("crisis-card");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("role", "alert");
    await expect(card.getByRole("link", { name: /14416/ })).toBeVisible();
    await expect(card.getByRole("link", { name: /1800-599-0019/ })).toBeVisible();
    await expect(card.getByRole("link", { name: /112/ })).toBeVisible();
    // No way to dismiss it.
    await expect(card.getByRole("button", { name: /close|dismiss|hide|cancel|x/i })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(card).toBeVisible();
  });
});

test.describe("journal passphrase setup", () => {
  test("shows the lose-both warning when setting up the vault", async ({ page }) => {
    await gotoRoute(page, "/journal");
    await expect(page.getByText(/lose both your passphrase and your recovery code/i)).toBeVisible();
    await expect(page.getByLabel("Passphrase", { exact: true })).toBeVisible();
  });
});

test.describe("language and theme", () => {
  test("language switch to Hindi updates the document language and toggle state", async ({ page }) => {
    await gotoRoute(page, "/dashboard");
    const toggle = page.getByRole("button", { name: /Language toggle: currently English/i });
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    await expect(page.getByRole("button", { name: /Language toggle: currently Hindi/i })).toBeVisible();
  });

  test("theme toggle switches between day and night and persists", async ({ page }) => {
    await setTheme(page, "light");
    await gotoRoute(page, "/dashboard");
    const html = page.locator("html");
    await expect(html).not.toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("mindsahaay-theme"))).toBe("dark");
    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    await expect(html).not.toHaveAttribute("data-theme", "dark");
  });
});

test.describe("keyboard navigation", () => {
  test("Tab order reaches the SOS button and Enter opens it", async ({ page }) => {
    await gotoRoute(page, "/dashboard");
    let reached = false;
    for (let i = 0; i < 60 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(() =>
        /24\/7 Emergency Crisis Helplines/i.test(document.activeElement?.getAttribute("aria-label") ?? ""),
      );
    }
    expect(reached, "SOS button reachable within 60 Tab presses").toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("the first Tab stop is the skip link", async ({ page }) => {
    await gotoRoute(page, "/dashboard");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /Skip to main content/i })).toBeFocused();
  });
});

test.describe("404", () => {
  test("unknown routes show a gentle not-found page with a helpline", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByRole("heading", { level: 1, name: /Take a gentle breath/i })).toBeVisible();
    await expect(page.getByText(/404/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Tele-MANAS Helpline at 14416/i })).toBeVisible();
    await page.getByRole("link", { name: /Return to Dashboard/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe("zero-knowledge secure storage & crisis safety card (SEC-03)", () => {
  test("crisis page displays helplines and never stores safety plan in plaintext localStorage", async ({ page }) => {
    await gotoRoute(page, "/crisis");
    await expect(page.getByText(/Immediate 24\/7 National Crisis Helplines/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /14416/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /1800-599-0019/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /112/ }).first()).toBeVisible();

    // Click Save Safety Plan
    await page.getByRole("button", { name: /Save Safety Plan/i }).click();
    await expect(page.getByText(/Safety Plan saved securely!/i)).toBeVisible();

    // Verify plaintext is NEVER saved to localStorage
    const rawPlaintext = await page.evaluate(() => localStorage.getItem("mindsahaay_demo_safety_plan"));
    expect(rawPlaintext).toBeNull();
  });

  test("settings account erasure purges data while preserving theme", async ({ page }) => {
    await setTheme(page, "dark");
    await gotoRoute(page, "/settings");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // Click Permanently Erase All Data
    await page.getByRole("button", { name: /Permanently Erase All Data/i });
    await page.getByRole("button", { name: /Permanently Erase All Data/i }).click();
    await expect(page.getByText(/Permanently Erase MindSahaay Account\?/i)).toBeVisible();

    const confirmInput = page.getByLabel(/Type DELETE to confirm:/i);
    await confirmInput.fill("DELETE");
    await page.getByRole("button", { name: /Confirm Irrevocable Erasure/i }).click();

    // Should redirect to goodbye
    await expect(page).toHaveURL(/\/goodbye$/);

    // Theme should be preserved explicitly, other app keys purged
    const theme = await page.evaluate(() => localStorage.getItem("mindsahaay-theme"));
    expect(theme).toBe("dark");
    const streak = await page.evaluate(() => localStorage.getItem("mindsahaay-habit-streak"));
    expect(streak).toBeNull();
  });
});
