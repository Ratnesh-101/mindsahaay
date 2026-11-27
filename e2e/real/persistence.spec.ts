import { test, expect, adminSql, lit, cleanupCreated, signIn, unlockVault, VAULT_PASSPHRASE, dbCount } from "./helpers";

/**
 * "What I saved is still there" against the real backend: a journal entry, a consent choice and a
 * safety plan must survive a full page reload and be in the database, and the journal must be
 * stored as ciphertext only.
 */

test.afterAll(async () => {
  await cleanupCreated();
});

test("a journal entry survives a reload after unlocking the vault again, and is stored only as ciphertext", async ({ browser, baseURL }) => {
  const { page, context, id } = await signIn(browser, "journalpersist", baseURL);
  try {
    const secret = `Persisted reflection ${Date.now()} about the viva`;
    const title = `Title-${Date.now()}`;

    await unlockVault(page);
    await expect(page).toHaveURL(/\/journal/);
    await page.locator("#journal-title").fill(title);
    await page.locator("#journal-content").fill(secret);
    await page.getByRole("button", { name: "Save private entry" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Entry encrypted and saved." })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("article.journal-item", { hasText: secret })).toBeVisible();

    // The row is in the database and holds no plaintext (neither raw nor as decoded base64 text).
    expect(dbCount("journal_entries", id), "the entry is stored").toBe(1);
    const stored = adminSql(`select ciphertext || '|' || iv || '|' || salt from public.journal_entries where student_id=${lit(id)}`);
    expect(stored.length, "ciphertext, iv and salt are present").toBeGreaterThan(40);
    for (const needle of [secret, title, "viva"]) {
      expect(stored, `stored value must not contain "${needle}"`).not.toContain(needle);
    }
    const ciphertext = adminSql(`select ciphertext from public.journal_entries where student_id=${lit(id)}`);
    const decodedAsText = Buffer.from(ciphertext, "base64").toString("latin1");
    expect(decodedAsText, "base64-decoded ciphertext is not the plaintext").not.toContain("Persisted reflection");

    // A reload drops the in-memory key: the page must ask for the passphrase and show no entry text.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Unlock your private vault" })).toBeVisible({ timeout: 30_000 });
    expect(await page.locator("main").innerText(), "locked vault shows no entry text").not.toContain(secret);

    await page.locator("#vault-input").fill(VAULT_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.locator("article.journal-item", { hasText: secret })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("article.journal-item h3", { hasText: title })).toBeVisible();
    expect(dbCount("journal_entries", id), "still exactly one row").toBe(1);
  } finally {
    await context.close();
  }
});

test("a consent choice persists after a reload and is recorded in the consent ledger", async ({ browser, baseURL }) => {
  const { page, context, id } = await signIn(browser, "consentpersist", baseURL);
  try {
    const title = "Aggregated Platform Analytics";
    const grant = page.getByRole("button", { name: `Grant Consent for ${title}` });
    const revoke = page.getByRole("button", { name: `Revoke Consent for ${title}` });

    // A new account has not agreed to the optional analytics purpose.
    expect(Number(adminSql(`select count(*) from public.consents where student_id=${lit(id)} and purpose='analytics' and consented`))).toBe(0);

    await page.goto("/consent", { waitUntil: "networkidle" });
    await expect(grant).toBeVisible({ timeout: 15_000 });
    await expect(revoke).toHaveCount(0);

    await grant.click();
    await expect(page.getByRole("status").filter({ hasText: `granted for ${title}` })).toBeVisible({ timeout: 15_000 });
    await expect(revoke).toBeVisible();

    // Database: a granted ledger row for this purpose, newest row for it says consented and not revoked.
    expect(Number(adminSql(`select count(*) from public.consents where student_id=${lit(id)} and purpose='analytics'`))).toBe(1);
    expect(adminSql(`select consented::text || ',' || coalesce(revoked_at::text,'null') from public.consents where student_id=${lit(id)} and purpose='analytics' order by granted_at desc limit 1`)).toBe("true,null");

    await page.reload({ waitUntil: "networkidle" });
    await expect(revoke).toBeVisible({ timeout: 15_000 });
    await expect(grant).toHaveCount(0);

    // Revoking is persisted too, as a new ledger row (the ledger is append-only).
    await revoke.click();
    await expect(page.getByRole("status").filter({ hasText: `revoked for ${title}` })).toBeVisible({ timeout: 15_000 });
    await page.reload({ waitUntil: "networkidle" });
    await expect(grant).toBeVisible({ timeout: 15_000 });
    expect(Number(adminSql(`select count(*) from public.consents where student_id=${lit(id)} and purpose='analytics'`))).toBe(2);
    expect(adminSql(`select consented::text from public.consents where student_id=${lit(id)} and purpose='analytics' order by granted_at desc limit 1`)).toBe("false");
  } finally {
    await context.close();
  }
});

test("a safety plan starts empty, saves with a success message and is still there after a reload", async ({ browser, baseURL }) => {
  const { page, context, id } = await signIn(browser, "planpersist", baseURL);
  try {
    expect(dbCount("safety_plans", id), "no plan row for a new account").toBe(0);

    await page.goto("/crisis", { waitUntil: "networkidle" });
    await expect(page.getByTestId("plan-empty-hint")).toBeVisible({ timeout: 15_000 });
    // Every editable field is blank: no invented names, signs or reasons.
    const fields = page.locator("form input[type=text], form input:not([type])");
    const n = await fields.count();
    expect(n, "the editor has input fields").toBeGreaterThan(3);
    for (let i = 0; i < n; i++) {
      expect(await fields.nth(i).inputValue(), `field ${i} starts empty`).toBe("");
    }
    expect(dbCount("safety_plans", id), "opening the page stores nothing").toBe(0);

    const sign = `Not sleeping ${Date.now()}`;
    const coping = "Walk to the hostel garden";
    const reason = "My younger sister";
    const contactName = "Test Friend";
    const contactPhone = "9000000001";
    await page.getByLabel("Warning sign 1").fill(sign);
    await page.getByLabel("Coping strategy 1").fill(coping);
    await page.getByLabel("Contact 1 Name").fill(contactName);
    await page.getByLabel("Contact 1 Relationship").fill("Roommate");
    await page.getByLabel("Contact 1 Phone").fill(contactPhone);
    await page.getByLabel("Reason for living 1").fill(reason);
    await page.getByRole("button", { name: "Save Safety Plan" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Safety plan saved to your account." })).toBeVisible({ timeout: 15_000 });

    expect(dbCount("safety_plans", id), "the plan row exists").toBe(1);
    expect(adminSql(`select warning_signs[1] from public.safety_plans where student_id=${lit(id)}`)).toBe(sign);
    expect(adminSql(`select reasons_to_live[1] from public.safety_plans where student_id=${lit(id)}`)).toBe(reason);

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByLabel("Warning sign 1")).toHaveValue(sign, { timeout: 15_000 });
    await expect(page.getByLabel("Coping strategy 1")).toHaveValue(coping);
    await expect(page.getByLabel("Contact 1 Name")).toHaveValue(contactName);
    await expect(page.getByLabel("Contact 1 Phone")).toHaveValue(contactPhone);
    await expect(page.getByLabel("Reason for living 1")).toHaveValue(reason);
    await expect(page.getByTestId("plan-empty-hint")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
