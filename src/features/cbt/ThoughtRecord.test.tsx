import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());

import { fake, resetFake, setupI18n } from "../journal/testSupport";
import { createVault, generateRecoveryCode, lockVault, readVaultMeta, unlockVault } from "../journal/vault";
import { decryptJournal } from "../../domain/crypto/journalCrypto";
import CbtToolkit from "./CbtToolkit";
import ThoughtRecord from "./ThoughtRecord";
import { ACTIVITY_KEY, WORRY_KEY, clearCbtLocalData, nextOccurrence } from "./storage";
import { deleteThoughtRecord, fetchThoughtRecords, saveThoughtRecord } from "./api";
import { clearSecureStoreMemory, toOpaqueKey } from "../../shared/lib/storage/secureStore";

const PASS = "correct horse battery";

beforeAll(async () => {
  await setupI18n("en");
});

beforeEach(async () => {
  resetFake();
  lockVault();
  clearSecureStoreMemory();
  localStorage.clear();
});

async function unlocked() {
  await createVault(PASS, generateRecoveryCode());
}

async function fillRecord(user: ReturnType<typeof userEvent.setup>, opts: { thought?: string } = {}) {
  await user.type(screen.getByLabelText(/^Situation/), "Group project meeting went quiet");
  await user.type(screen.getByLabelText(/^Automatic thought/), opts.thought ?? "They think I am useless");
  await user.type(screen.getByLabelText("Main feeling"), "Ashamed");
  await user.click(screen.getByRole("checkbox", { name: "Mind reading" }));
  await user.type(screen.getByLabelText("Evidence for the thought"), "One person frowned");
  await user.type(screen.getByLabelText("Evidence against the thought"), "They thanked me for my part");
  await user.type(screen.getByLabelText(/^Balanced thought/), "One frown does not mean they think I am useless");
}

describe("Thought record (encrypted)", () => {
  it("saves every field encrypted, shows it decrypted, and deletes it", { timeout: 60000 }, async () => {
    await unlocked();
    const user = userEvent.setup();
    render(<ThoughtRecord />);
    await fillRecord(user);
    fireEvent.change(screen.getByLabelText(/How strong was it/), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText(/How strong is the feeling now/), { target: { value: "30" } });
    await user.click(screen.getByRole("button", { name: "Save encrypted record" }));

    await screen.findByText("Thought record encrypted and saved.");
    expect(await screen.findByRole("heading", { name: "They think I am useless" })).toBeInTheDocument();
    expect(screen.getByText("One frown does not mean they think I am useless")).toBeInTheDocument();
    expect(screen.getByText(/Feeling moved from 80 to 30/)).toBeInTheDocument();
    expect(screen.getAllByText("Mind reading")).toHaveLength(2);

    // Server-side row is ciphertext only.
    const rows = fake.tables.thought_records;
    expect(rows).toHaveLength(1);
    const stored = JSON.stringify(rows[0]);
    for (const secret of ["useless", "Group project", "frowned", "Ashamed", "Mind reading", "mindReading"]) {
      expect(stored).not.toContain(secret);
    }
    expect(Object.keys(rows[0]).sort()).toEqual(["ciphertext", "created_at", "id", "iv", "salt", "student_id"]);

    const plain = JSON.parse(
      await decryptJournal({ ciphertext: String(rows[0].ciphertext), iv: String(rows[0].iv), salt: String(rows[0].salt) }, PASS),
    );
    expect(plain).toMatchObject({
      situation: "Group project meeting went quiet",
      automaticThought: "They think I am useless",
      distortions: ["mindReading"],
      evidenceFor: "One person frowned",
      evidenceAgainst: "They thanked me for my part",
      balancedThought: "One frown does not mean they think I am useless",
      intensityBefore: 80,
      intensityAfter: 30,
    });

    await user.click(screen.getByRole("button", { name: /Delete record from/ }));
    await user.click(screen.getByRole("button", { name: "Yes, delete permanently" }));
    await waitFor(() => expect(fake.tables.thought_records).toHaveLength(0));
    expect(screen.getByText("No thought records yet.")).toBeInTheDocument();
  });

  it("requires situation, automatic thought and balanced thought", async () => {
    await unlocked();
    const user = userEvent.setup();
    render(<ThoughtRecord />);
    await user.type(screen.getByLabelText(/^Situation/), "Only a situation");
    await user.click(screen.getByRole("button", { name: "Save encrypted record" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please fill in the situation");
    expect(fake.tables.thought_records ?? []).toHaveLength(0);
  });

  it("shows helplines when the written thought contains crisis language", { timeout: 60000 }, async () => {
    await unlocked();
    const user = userEvent.setup();
    render(<ThoughtRecord />);
    await fillRecord(user, { thought: "I want to end my life" });
    await user.click(screen.getByRole("button", { name: "Save encrypted record" }));
    const card = await screen.findByTestId("cbt-crisis");
    expect(card).toHaveTextContent("14416");
    expect(card).toHaveTextContent("1800-599-0019");
    expect(card).toHaveTextContent("112");
  });

  it("reports an incorrect passphrase when decrypting", { timeout: 60000 }, async () => {
    await saveThoughtRecord(
      { situation: "s", automaticThought: "a", balancedThought: "b" },
      PASS,
    );
    await expect(fetchThoughtRecords("wrong passphrase!")).rejects.toMatchObject({ code: "CRYPTO_DECRYPT_FAILED" });
    await expect(saveThoughtRecord({ situation: "", automaticThought: "a", balancedThought: "b" }, PASS)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    const id = String(fake.tables.thought_records[0].id);
    await deleteThoughtRecord(id);
    expect(fake.tables.thought_records).toHaveLength(0);
  });
});

describe("CBT toolkit tabs, activity planner and worry time", () => {
  it("enforces vault lock before accessing activity planner or worry time when encrypted data exists", async () => {
    localStorage.setItem(toOpaqueKey("cbt_activities"), JSON.stringify({ ciphertext: "xyz", iv: "123", salt: "abc" }));
    localStorage.setItem(toOpaqueKey("cbt_worry"), JSON.stringify({ ciphertext: "xyz", iv: "123", salt: "abc" }));
    const user = userEvent.setup();
    render(<CbtToolkit />);
    await user.click(screen.getByRole("tab", { name: "Activity planner" }));
    expect(screen.getByRole("heading", { name: "Create your private vault" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Worry time" }));
    expect(screen.getByRole("heading", { name: "Create your private vault" })).toBeInTheDocument();
  });

  it("plans an activity, rates mood after, and persists encrypted-at-rest (no plaintext in storage)", async () => {
    await unlocked();
    const user = userEvent.setup();
    render(<CbtToolkit />);
    await user.click(screen.getByRole("tab", { name: "Activity planner" }));

    await user.click(screen.getByRole("button", { name: "Add to plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("name the activity");

    await user.type(screen.getByLabelText("Activity"), "15-minute walk after dinner");
    fireEvent.change(screen.getByLabelText("Planned for"), { target: { value: "2026-06-01T19:00" } });
    await user.click(screen.getByRole("button", { name: "Add to plan" }));
    expect(await screen.findByRole("heading", { name: "15-minute walk after dinner" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Mood after/), { target: { value: "8" } });
    await user.click(screen.getByRole("button", { name: "Mark done" }));
    expect(await screen.findByText(/Mood 4 to 8/)).toBeInTheDocument();

    // Plaintext legacy key must NEVER exist
    expect(localStorage.getItem(ACTIVITY_KEY)).toBeNull();

    // Raw localStorage must contain ONLY encrypted AES-GCM ciphertext
    await waitFor(() => expect(localStorage.getItem(toOpaqueKey("cbt_activities"))).toBeTruthy());
    const rawStored = localStorage.getItem(toOpaqueKey("cbt_activities"));
    expect(rawStored).not.toContain("15-minute walk");
    const payload = JSON.parse(rawStored!);
    expect(payload.algorithm).toBe("AES-GCM");
    expect(payload.ciphertext).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Remove 15-minute walk/ }));
    expect(await screen.findByText(/Nothing planned yet/)).toBeInTheDocument();
  });

  it("restores a saved plan after a reload via automatic plaintext migration", async () => {
    localStorage.setItem(
      ACTIVITY_KEY,
      JSON.stringify([{ id: "x", name: "Call a friend", when: "2026-06-01T18:00", category: "social", moodBefore: 3, moodAfter: null, done: false }]),
    );
    await unlocked();
    // After unlock, plaintext original must be deleted
    expect(localStorage.getItem(ACTIVITY_KEY)).toBeNull();

    const user = userEvent.setup();
    render(<CbtToolkit />);
    await user.click(screen.getByRole("tab", { name: "Activity planner" }));
    expect(screen.getByRole("heading", { name: "Call a friend" })).toBeInTheDocument();
  });

  it("schedules worry time, parks and releases worries with encrypted persistence", async () => {
    await unlocked();
    const user = userEvent.setup();
    render(<CbtToolkit />);
    await user.click(screen.getByRole("tab", { name: "Worry time" }));
    expect(screen.getByTestId("worry-next")).toHaveTextContent("No worry time set yet.");

    fireEvent.change(screen.getByLabelText("Daily worry time"), { target: { value: "19:30" } });
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    expect(await screen.findByText("Worry time saved.")).toBeInTheDocument();
    expect(screen.getByTestId("worry-next")).toHaveTextContent(/Next worry time:/);

    // Plaintext key is null
    expect(localStorage.getItem(WORRY_KEY)).toBeNull();
    // Opaque key has AES-GCM payload
    await waitFor(() => expect(localStorage.getItem(toOpaqueKey("cbt_worry"))).toBeTruthy());
    const raw = localStorage.getItem(toOpaqueKey("cbt_worry"));
    expect(raw).not.toContain("19:30");

    await user.type(screen.getByLabelText("Park a worry for later"), "Placement results");
    await user.click(screen.getByRole("button", { name: "Park it" }));
    expect(await screen.findByText("Placement results")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Parked worries (1)" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Let go of: Placement results" }));
    expect(await screen.findByText("No parked worries.")).toBeInTheDocument();
  });

  it("moves between tabs with the arrow keys", async () => {
    await unlocked();
    const user = userEvent.setup();
    render(<CbtToolkit />);
    screen.getByRole("tab", { name: "Thought record" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Activity planner" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Thought record" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("CBT storage helpers", () => {
  it("clears local CBT data and computes the next worry occurrence", () => {
    localStorage.setItem(ACTIVITY_KEY, "[]");
    localStorage.setItem(WORRY_KEY, "{}");
    clearCbtLocalData();
    expect(localStorage.getItem(ACTIVITY_KEY)).toBeNull();
    expect(localStorage.getItem(WORRY_KEY)).toBeNull();

    const now = new Date(2026, 5, 1, 20, 0, 0);
    expect(nextOccurrence("19:30", now).getDate()).toBe(2);
    expect(nextOccurrence("21:00", now).getDate()).toBe(1);
  });

  it("ignores corrupt stored data", async () => {
    await unlocked();
    localStorage.setItem(ACTIVITY_KEY, "{not json");
    localStorage.setItem(WORRY_KEY, JSON.stringify({ time: "bad", duration: 1, parked: [] }));
    const user = userEvent.setup();
    render(<CbtToolkit />);
    await user.click(screen.getByRole("tab", { name: "Activity planner" }));
    expect(screen.getByText(/Nothing planned yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Worry time" }));
    expect(screen.getByTestId("worry-next")).toHaveTextContent("No worry time set yet.");
  });
});

/** Simulates a page reload: the in-memory passphrase and decrypted cache are gone, storage and backend stay. */
async function reloadAndUnlock() {
  clearSecureStoreMemory();
  lockVault();
  const meta = await readVaultMeta();
  if (!meta) throw new Error("vault meta missing");
  await unlockVault(PASS, meta);
}

describe("Persistence across a reload (U3 audit)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a thought record is still there after a reload once the vault is unlocked again", { timeout: 60000 }, async () => {
    await unlocked();
    const user = userEvent.setup();
    const first = render(<ThoughtRecord />);
    await fillRecord(user);
    await user.click(screen.getByRole("button", { name: "Save encrypted record" }));
    await screen.findByText("Thought record encrypted and saved.");
    first.unmount();

    await reloadAndUnlock();
    render(<ThoughtRecord />);
    expect(await screen.findByRole("heading", { name: "They think I am useless" })).toBeInTheDocument();
  });

  it("a failed thought-record save shows an alert, no success message, and keeps what was typed", { timeout: 60000 }, async () => {
    await unlocked();
    const user = userEvent.setup();
    render(<ThoughtRecord />);
    await fillRecord(user);
    fake.signedIn = false; // the backend refuses the write
    await user.click(screen.getByRole("button", { name: "Save encrypted record" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not save");
    expect(screen.queryByText("Thought record encrypted and saved.")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Situation/)).toHaveValue("Group project meeting went quiet");
    expect(fake.tables.thought_records ?? []).toHaveLength(0);
  });

  it("the CBT tools ask for the vault after a reload instead of looking empty", async () => {
    await unlocked();
    const user = userEvent.setup();
    const first = render(<CbtToolkit />);
    await user.click(screen.getByRole("tab", { name: "Activity planner" }));
    await user.type(screen.getByLabelText("Activity"), "Evening walk");
    fireEvent.change(screen.getByLabelText("Planned for"), { target: { value: "2026-06-01T19:00" } });
    await user.click(screen.getByRole("button", { name: "Add to plan" }));
    await screen.findByText("Saved on this device.");
    first.unmount();

    clearSecureStoreMemory();
    lockVault();
    render(<CbtToolkit />);
    await user.click(screen.getByRole("tab", { name: "Activity planner" }));
    expect(await screen.findByRole("heading", { name: "Unlock your private vault" })).toBeInTheDocument();
    expect(screen.getByTestId("vault-locked-note")).toHaveTextContent("Nothing has been lost");
    expect(screen.queryByText(/Nothing planned yet/)).not.toBeInTheDocument();
  });

  it("an activity and parked worry are still there after a reload and unlock", async () => {
    await unlocked();
    const user = userEvent.setup();
    const first = render(<CbtToolkit />);
    await user.click(screen.getByRole("tab", { name: "Activity planner" }));
    await user.type(screen.getByLabelText("Activity"), "Evening walk");
    fireEvent.change(screen.getByLabelText("Planned for"), { target: { value: "2026-06-01T19:00" } });
    await user.click(screen.getByRole("button", { name: "Add to plan" }));
    await screen.findByText("Saved on this device.");
    await user.click(screen.getByRole("tab", { name: "Worry time" }));
    await user.type(screen.getByLabelText("Park a worry for later"), "Internship email");
    await user.click(screen.getByRole("button", { name: "Park it" }));
    await screen.findByText("Worry parked and saved on this device.");
    first.unmount();

    await reloadAndUnlock();
    render(<CbtToolkit />);
    await user.click(screen.getByRole("tab", { name: "Activity planner" }));
    expect(await screen.findByRole("heading", { name: "Evening walk" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Worry time" }));
    expect(await screen.findByText("Internship email")).toBeInTheDocument();
  });

  it("when the device refuses to store an activity: alert, no success, list unchanged, input kept", async () => {
    await unlocked();
    const user = userEvent.setup();
    render(<CbtToolkit />);
    await user.click(screen.getByRole("tab", { name: "Activity planner" }));
    await user.type(screen.getByLabelText("Activity"), "Evening walk");
    fireEvent.change(screen.getByLabelText("Planned for"), { target: { value: "2026-06-01T19:00" } });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    await user.click(screen.getByRole("button", { name: "Add to plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("was not saved");
    expect(screen.queryByText("Saved on this device.")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Evening walk" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Activity")).toHaveValue("Evening walk");
  });

  it("when the device refuses to store worry time: alert and no 'saved' message", async () => {
    await unlocked();
    const user = userEvent.setup();
    render(<CbtToolkit />);
    await user.click(screen.getByRole("tab", { name: "Worry time" }));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    await user.type(screen.getByLabelText("Park a worry for later"), "Hostel fees");
    await user.click(screen.getByRole("button", { name: "Park it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("was not saved");
    expect(screen.getByLabelText("Park a worry for later")).toHaveValue("Hostel fees");
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("was not saved");
    expect(screen.queryByText("Worry time saved.")).not.toBeInTheDocument();
  });
});
