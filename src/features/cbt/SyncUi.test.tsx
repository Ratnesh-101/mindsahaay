import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../shared/lib/supabase", async () => {
  const support = await import("../journal/testSupport");
  const base = support.supabaseModule();
  const client = { ...support.fakeSupabase, rpc: async () => ({ data: null, error: rpcError ? { message: rpcError } : null }) };
  return { ...base, supabase: client, default: client };
});

import { resetFake, setupI18n } from "../journal/testSupport";
import { createVault, generateRecoveryCode, lockVault } from "../journal/vault";
import { clearSecureStoreMemory, OPAQUE_KEY_MAP } from "../../shared/lib/storage/secureStore";
import { resetRemoteSyncMemory } from "../../shared/lib/storage/remoteSync";
import WorryTime from "./WorryTime";
import SafetyCardModal from "../modals/SafetyCardModal";
import enCbt from "./locales/en.json";
import hiCbt from "./locales/hi.json";
import enCrisis from "../crisis/locales/en.json";
import hiCrisis from "../crisis/locales/hi.json";

let rpcError: string | null = null;

beforeAll(async () => {
  await setupI18n("en");
});

beforeEach(async () => {
  rpcError = null;
  resetFake();
  localStorage.clear();
  sessionStorage.clear();
  clearSecureStoreMemory();
  resetRemoteSyncMemory();
  lockVault();
  await createVault("sync ui passphrase", generateRecoveryCode());
});

afterEach(() => {
  lockVault();
});

describe("sync status in the UI", () => {
  it("worry time: the local save message and the sync status are separate, and sync can still be waiting", { timeout: 60000 }, async () => {
    rpcError = "network down";
    const user = userEvent.setup();
    render(<WorryTime />);
    expect(screen.getByText(/Encrypted and synced to your account\./)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Park a worry for later"), "Internship email");
    await user.click(screen.getByRole("button", { name: "Park it" }));
    expect(await screen.findByText("Worry parked and saved on this device.")).toBeInTheDocument();
    expect(await screen.findByText("Waiting to sync")).toBeInTheDocument();
    expect(screen.queryByText("Synced")).not.toBeInTheDocument();
  });

  it("worry time: shows Synced once the server accepted the same ciphertext", { timeout: 60000 }, async () => {
    const user = userEvent.setup();
    render(<WorryTime />);
    await user.type(screen.getByLabelText("Park a worry for later"), "Internship email");
    await user.click(screen.getByRole("button", { name: "Park it" }));
    expect(await screen.findByText("Synced")).toBeInTheDocument();
  });

  it("safety card: says anchors are encrypted and synced, and shows the sync status", { timeout: 60000 }, async () => {
    render(<SafetyCardModal student={{ name: "Student", institution: "Campus" }} onClose={() => undefined} />);
    expect(screen.getByText(/Encrypted and synced to your account\./)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/on this device only/i);
    fireEvent.change(screen.getByLabelText(/Anchor 1/), { target: { value: "Cold water" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Anchors/ }));
    expect(await screen.findByText(/Anchors encrypted and saved on this device/)).toBeInTheDocument();
    expect(await screen.findByText("Synced")).toBeInTheDocument();
  });

  it("preview mode shows no sync status because nothing is synced", { timeout: 60000 }, async () => {
    sessionStorage.setItem("mindsahaay_demo_mode", "true");
    render(<WorryTime />);
    expect(screen.queryByText("Synced")).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting to sync")).not.toBeInTheDocument();
  });
});

describe("sync copy and slot ids", () => {
  it("has the new strings in English and Hindi, and no leftover 'this device only' claims", () => {
    for (const bundle of [enCbt, hiCbt]) {
      for (const k of ["synced", "waiting", "conflict", "dismiss"] as const) {
        expect(bundle.cbt.sync[k].length).toBeGreaterThan(0);
      }
    }
    expect(enCbt.cbt.activity.intro).toContain("Encrypted and synced to your account");
    expect(enCbt.cbt.worry.intro).toContain("Encrypted and synced to your account");
    expect(JSON.stringify(enCbt)).not.toMatch(/this device only/i);
    expect(enCrisis.safetyCard.deviceOnly).toContain("Encrypted and synced to your account");
    expect(hiCrisis.safetyCard.deviceOnly).not.toBe(enCrisis.safetyCard.deviceOnly);
  });

  it("uses exactly the slot ids that migration 0010 allows", () => {
    const dir = "supabase/migrations";
    const file = readdirSync(dir).find((f) => f.startsWith("0010_"));
    expect(file).toBeTruthy();
    const sql = readFileSync(`${dir}/${file}`, "utf8");
    for (const key of ["cbt_activities", "cbt_worry", "safety_card"] as const) {
      expect(sql).toContain(`'${OPAQUE_KEY_MAP[key]}'`);
    }
  });
});
