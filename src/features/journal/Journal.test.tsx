import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../shared/lib/supabase", async () => (await import("./testSupport")).supabaseModule());

import { fake, resetFake, setupI18n } from "./testSupport";
import Journal from "./Journal";
import { getVaultPassphrase, lockVault, readVaultMeta, validateRecoveryCode } from "./vault";
import { decryptJournal } from "../../domain/crypto/journalCrypto";

const PASS = "correct horse battery";

beforeAll(async () => {
  await setupI18n("en");
});

beforeEach(() => {
  resetFake();
  lockVault();
});

afterEach(() => {
  lockVault();
});

async function createVaultThroughUi(user: ReturnType<typeof userEvent.setup>): Promise<string> {
  await user.type(await screen.findByLabelText("Passphrase"), PASS);
  await user.type(screen.getByLabelText("Confirm passphrase"), PASS);
  await user.click(screen.getByRole("button", { name: "Continue" }));

  const code = (await screen.findByTestId("recovery-code")).textContent ?? "";
  expect(validateRecoveryCode(code)).toBe(true);
  // The loss warning is shown on both setup steps.
  expect(screen.getByText(/lose both your passphrase and your recovery code/i)).toBeInTheDocument();

  const create = screen.getByRole("button", { name: "Create vault" });
  expect(create).toBeDisabled();
  await user.click(screen.getByRole("checkbox"));
  expect(create).toBeEnabled();
  await user.click(create);
  await screen.findByLabelText("Your reflection");
  return code;
}

describe("Journal: vault, encryption and entries", () => {
  it("creates a vault, saves an entry as ciphertext only, and shows it decrypted", { timeout: 60000 }, async () => {
    const user = userEvent.setup();
    render(<Journal studentId="user-1" />);

    const code = await createVaultThroughUi(user);
    expect(getVaultPassphrase()).toBe(PASS);

    // Vault metadata holds only ciphertext blobs: no passphrase, no recovery code.
    const metaJson = JSON.stringify(fake.userMetadata);
    expect(metaJson).not.toContain(PASS);
    expect(metaJson).not.toContain(code);

    await user.type(screen.getByLabelText("Title (optional)"), "Exam week");
    await user.type(screen.getByLabelText("Your reflection"), "I felt very anxious about the thermodynamics paper.");
    await user.click(screen.getByRole("button", { name: "Save private entry" }));

    await screen.findByText("Entry encrypted and saved.");
    expect(await screen.findByRole("heading", { name: "Exam week" })).toBeInTheDocument();
    expect(screen.getByText("I felt very anxious about the thermodynamics paper.")).toBeInTheDocument();

    // What reached the "server" is ciphertext, iv and salt. No plaintext anywhere.
    const rows = fake.tables.journal_entries;
    expect(rows).toHaveLength(1);
    const stored = JSON.stringify(rows[0]);
    expect(stored).not.toContain("anxious");
    expect(stored).not.toContain("Exam week");
    expect(Object.keys(rows[0]).sort()).toEqual(["ciphertext", "created_at", "id", "iv", "salt", "student_id"]);

    // And it really decrypts with the passphrase.
    const plain = await decryptJournal(
      { ciphertext: String(rows[0].ciphertext), iv: String(rows[0].iv), salt: String(rows[0].salt) },
      PASS,
    );
    expect(JSON.parse(plain).content).toContain("thermodynamics");
  });

  it("locks, rejects a wrong passphrase, unlocks, recovers with the recovery code, and deletes an entry", { timeout: 120000 }, async () => {
    const user = userEvent.setup();
    render(<Journal studentId="user-1" />);
    const code = await createVaultThroughUi(user);

    await user.type(screen.getByLabelText("Your reflection"), "Quiet evening, finished the lab report.");
    await user.click(screen.getByRole("button", { name: "Save private entry" }));
    await screen.findByText("Quiet evening, finished the lab report.");

    // Lock: the entry text disappears and the unlock screen appears.
    await user.click(screen.getByRole("button", { name: "Lock journal" }));
    expect(await screen.findByRole("heading", { name: "Unlock your private vault" })).toBeInTheDocument();
    expect(screen.queryByText("Quiet evening, finished the lab report.")).not.toBeInTheDocument();
    expect(getVaultPassphrase()).toBeNull();

    // Wrong passphrase.
    await user.type(screen.getByLabelText("Passphrase"), "not the passphrase");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not correct");

    // Recovery code path.
    await user.click(screen.getByRole("button", { name: "I forgot my passphrase" }));
    await user.type(screen.getByLabelText("Recovery code"), "AAAA-AAAA-AAAA-AAAA");
    await user.click(screen.getByRole("button", { name: "Unlock with recovery code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not correct");

    await user.clear(screen.getByLabelText("Recovery code"));
    await user.type(screen.getByLabelText("Recovery code"), code.toLowerCase());
    await user.click(screen.getByRole("button", { name: "Unlock with recovery code" }));
    expect(await screen.findByText("Vault unlocked with your recovery code")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show passphrase" }));
    expect(screen.getByTestId("recovered-passphrase")).toHaveTextContent(PASS);
    await screen.findByText("Quiet evening, finished the lab report.");

    // Delete needs a second, explicit confirmation.
    await user.click(screen.getByRole("button", { name: /Delete entry/ }));
    await user.click(screen.getByRole("button", { name: "Yes, delete permanently" }));
    await waitFor(() => expect(fake.tables.journal_entries).toHaveLength(0));
    expect(screen.queryByText("Quiet evening, finished the lab report.")).not.toBeInTheDocument();
  });

  it("rejects a mismatched or short passphrase before creating a vault", async () => {
    const user = userEvent.setup();
    render(<Journal studentId="user-1" />);
    await user.type(await screen.findByLabelText("Passphrase"), "short");
    await user.type(screen.getByLabelText("Confirm passphrase"), "short");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at least 8 characters");

    await user.clear(screen.getByLabelText("Passphrase"));
    await user.type(screen.getByLabelText("Passphrase"), "long enough pass");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("do not match");
    expect(await readVaultMeta()).toBeNull();
  });

  it("switches to the CBT toolkit tab without touching the journal vault", async () => {
    const user = userEvent.setup();
    render(<Journal studentId="user-1" />);
    await user.click(screen.getByRole("tab", { name: "CBT toolkit" }));
    expect(screen.getByRole("tab", { name: "Thought record" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Worry time" }));
    // Worry time is stored encrypted under the vault, so it asks for the vault first.
    expect(await screen.findByRole("heading", { name: "Create your private vault" })).toBeInTheDocument();
    expect(await readVaultMeta()).toBeNull();
  });
});

describe("Journal: persistence across a reload (U3 audit)", () => {
  it("after a reload the vault is locked, explains that nothing is lost, and unlocking shows the saved entry", { timeout: 60000 }, async () => {
    const user = userEvent.setup();
    const first = render(<Journal studentId="user-1" />);
    await createVaultThroughUi(user);
    await user.type(screen.getByLabelText("Your reflection"), "Saved before the reload.");
    await user.click(screen.getByRole("button", { name: "Save private entry" }));
    await screen.findByText("Entry encrypted and saved.");
    first.unmount();

    // Reload: the passphrase lived only in memory.
    lockVault();
    render(<Journal studentId="user-1" />);
    expect(await screen.findByRole("heading", { name: "Unlock your private vault" })).toBeInTheDocument();
    expect(screen.getByTestId("vault-locked-note")).toHaveTextContent("Nothing has been lost");
    expect(screen.queryByText(/No journal entries saved yet/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Passphrase"), PASS);
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText("Saved before the reload.")).toBeInTheDocument();
  });

  it("a failed save shows an alert, no success message, and keeps the text for retry", { timeout: 60000 }, async () => {
    const user = userEvent.setup();
    render(<Journal studentId="user-1" />);
    await createVaultThroughUi(user);
    await user.type(screen.getByLabelText("Your reflection"), "Please keep this text.");
    fake.signedIn = false;
    await user.click(screen.getByRole("button", { name: "Save private entry" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not save");
    expect(screen.queryByText("Entry encrypted and saved.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Your reflection")).toHaveValue("Please keep this text.");
    expect(fake.tables.journal_entries ?? []).toHaveLength(0);
  });
});

describe("Journal: crisis wording", () => {
  it("shows helplines when a saved entry contains crisis language", { timeout: 60000 }, async () => {
    const user = userEvent.setup();
    render(<Journal studentId="user-1" />);
    await createVaultThroughUi(user);
    await user.type(screen.getByLabelText("Your reflection"), "I want to end my life");
    await user.click(screen.getByRole("button", { name: "Save private entry" }));
    const card = await screen.findByTestId("journal-crisis");
    expect(card).toHaveTextContent("14416");
    expect(card).toHaveTextContent("1800-599-0019");
    expect(card).toHaveTextContent("112");
  });
});
