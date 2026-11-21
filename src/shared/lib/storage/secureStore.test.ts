import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  toOpaqueKey,
  isVaultLocked,
  getSecureItem,
  getSecureItemSync,
  setSecureItem,
  setSecureItemSync,
  removeSecureItem,
  migrateSensitiveStorage,
  clearAllLocalUserData,
  clearSecureStoreMemory,
  OPAQUE_KEY_MAP,
} from "./secureStore";
import { createVault, generateRecoveryCode, lockVault, getVaultPassphrase } from "../../../features/journal/vault";
import { enqueueMood, hasUnsynced, clearAllOutboxDbs } from "../offline/outbox";

const TEST_PASSPHRASE = "secure test passphrase 2026";

async function unlockTestVault() {
  await createVault(TEST_PASSPHRASE, generateRecoveryCode());
}

describe("secureStore: Encrypted-at-Rest Key-Value Storage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearSecureStoreMemory();
    lockVault();
    localStorage.setItem("mindsahaay_demo_mode", "true");
  });

  describe("Opaque Key Derivation", () => {
    it("maps known keys to opaque prefixed hex identifiers that never leak semantic meaning", () => {
      const keys = Object.values(OPAQUE_KEY_MAP);
      for (const opaque of keys) {
        expect(opaque).toMatch(/^mindsahaay_sec_[a-f0-9]+$/);
        expect(opaque).not.toMatch(/cbt|activity|worry|friend|anchor|mood|plan|suicide|crisis/i);
      }
    });

    it("generates opaque prefixed hash for custom keys", () => {
      const opaque = toOpaqueKey("custom_user_notes");
      expect(opaque).toMatch(/^mindsahaay_sec_[a-f0-9]+$/);
      expect(opaque).not.toContain("notes");
    });
  });

  describe("Locked Vault Behaviour", () => {
    it("reports locked status and prevents reading or writing when vault is locked", async () => {
      expect(isVaultLocked()).toBe(true);

      const readRes = await getSecureItem("cbt_activities");
      expect(readRes.status).toBe("locked");

      const readSync = getSecureItemSync("cbt_activities");
      expect(readSync.status).toBe("locked");

      const writeRes = await setSecureItem("cbt_activities", [{ id: "1", name: "Walk" }]);
      expect(writeRes.status).toBe("locked");

      const writeSync = setSecureItemSync("cbt_activities", [{ id: "1", name: "Walk" }]);
      expect(writeSync.status).toBe("locked");
    });
  });

  describe("Encryption & Plaintext Protection", () => {
    it("encrypts data with AES-256-GCM and ensures plaintext NEVER appears in localStorage", async () => {
      await unlockTestVault();
      expect(isVaultLocked()).toBe(false);

      const sensitiveText = "Intense anxiety regarding end-semester exams and placements";
      const sampleActivities = [
        { id: "act-1", name: sensitiveText, category: "pleasure", moodBefore: 2, moodAfter: 7, done: true },
      ];

      await setSecureItem("cbt_activities", sampleActivities);

      // Verify legacy plaintext key was never written
      expect(localStorage.getItem("mindsahaay-cbt-activities")).toBeNull();

      // Read raw storage content
      const opaqueKey = toOpaqueKey("cbt_activities");
      const rawStored = localStorage.getItem(opaqueKey);
      expect(rawStored).not.toBeNull();

      // Plaintext must NEVER appear anywhere in the raw storage string
      expect(rawStored).not.toContain("Intense anxiety");
      expect(rawStored).not.toContain("placements");
      expect(rawStored).not.toContain("moodBefore");

      // Verify raw payload structure is valid ciphertext
      const payload = JSON.parse(rawStored!);
      expect(payload).toHaveProperty("ciphertext");
      expect(payload).toHaveProperty("iv");
      expect(payload).toHaveProperty("salt");
      expect(payload.algorithm).toBe("AES-GCM");

      // Verify decrypted read recovers the original plaintext
      const decrypted = await getSecureItem<typeof sampleActivities>("cbt_activities");
      expect(decrypted.status).toBe("unlocked");
      if (decrypted.status === "unlocked") {
        expect(decrypted.value).toEqual(sampleActivities);
      }
    });

    it("removes item from memory and localStorage", async () => {
      await unlockTestVault();
      await setSecureItem("cbt_worry", { parked: [{ id: "1", text: "Exam stress" }] });

      removeSecureItem("cbt_worry");

      const opaqueKey = toOpaqueKey("cbt_worry");
      expect(localStorage.getItem(opaqueKey)).toBeNull();
      const readRes = await getSecureItem("cbt_worry");
      expect(readRes).toEqual({ status: "unlocked", value: null });
    });
  });

  describe("Migration of Legacy Plaintext Storage", () => {
    it("migrates existing plaintext keys to encrypted storage and deletes originals", async () => {
      // Setup legacy plaintext items in localStorage
      localStorage.setItem(
        "mindsahaay-cbt-activities",
        JSON.stringify([{ id: "leg-1", name: "Hostel garden walk", done: false }])
      );
      localStorage.setItem(
        "mindsahaay-cbt-worry",
        JSON.stringify({ time: "20:00", duration: 15, parked: [{ id: "w-1", text: "Lab viva" }] })
      );
      localStorage.setItem("mindsahaay-anchor1", "Cold water splash");
      localStorage.setItem("mindsahaay-anchor2", "Campus quadrangle walk");
      localStorage.setItem("mindsahaay-anchor3", "Singing bowl 432Hz");
      localStorage.setItem("mindsahaay-friend", "Rohan (Roommate) · +91 99999 88888");
      localStorage.setItem("mindsahaay_demo_safety_plan", JSON.stringify({ warningSigns: ["Insomnia"] }));
      localStorage.setItem("mindsahaay_demo_moods", JSON.stringify([{ score: 7, note: "Feeling okay" }]));
      localStorage.setItem("mindsahaay_demo_vault_meta", JSON.stringify({ v: 1 }));

      // Run migration with passphrase
      await migrateSensitiveStorage(TEST_PASSPHRASE);

      // Verify all plaintext keys have been DELETED
      expect(localStorage.getItem("mindsahaay-cbt-activities")).toBeNull();
      expect(localStorage.getItem("mindsahaay-cbt-worry")).toBeNull();
      expect(localStorage.getItem("mindsahaay-anchor1")).toBeNull();
      expect(localStorage.getItem("mindsahaay-anchor2")).toBeNull();
      expect(localStorage.getItem("mindsahaay-anchor3")).toBeNull();
      expect(localStorage.getItem("mindsahaay-friend")).toBeNull();
      expect(localStorage.getItem("mindsahaay_demo_safety_plan")).toBeNull();
      expect(localStorage.getItem("mindsahaay_demo_moods")).toBeNull();
      expect(localStorage.getItem("mindsahaay_demo_vault_meta")).toBeNull();

      // Verify raw storage contains ONLY ciphertext
      for (const key of Object.values(OPAQUE_KEY_MAP)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          expect(raw).not.toContain("Hostel garden");
          expect(raw).not.toContain("Rohan");
          expect(raw).not.toContain("+91 99999 88888");
          const parsed = JSON.parse(raw);
          expect(parsed).toHaveProperty("ciphertext");
        }
      }

      // Now unlock vault and verify decrypted contents
      await unlockTestVault();

      interface MigratedActivity {
        id: string;
        name: string;
        done: boolean;
      }
      interface MigratedSafetyCard {
        anchor1: string;
        anchor2: string;
        anchor3: string;
        trustedFriend: string;
      }

      const activities = await getSecureItem<MigratedActivity[]>("cbt_activities");
      expect(activities.status).toBe("unlocked");
      if (activities.status === "unlocked") {
        expect(activities.value![0].name).toBe("Hostel garden walk");
      }

      const card = await getSecureItem<MigratedSafetyCard>("safety_card");
      expect(card.status).toBe("unlocked");
      if (card.status === "unlocked") {
        expect(card.value!.trustedFriend).toBe("Rohan (Roommate) · +91 99999 88888");
        expect(card.value!.anchor1).toBe("Cold water splash");
      }
    });
  });

  describe("Central Cleanup: clearAllLocalUserData()", () => {
    it("clears all application-owned keys, locks vault, and clears memory while explicitly preserving theme and language", async () => {
      await unlockTestVault();

      // Populate app keys in localStorage
      localStorage.setItem("mindsahaay-theme", "dark");
      localStorage.setItem("i18nextLng", "hi");
      localStorage.setItem("mindsahaay_demo_mode", "true");
      localStorage.setItem("mindsahaay-habit-streak", "12");
      localStorage.setItem("sb-myproject-auth-token", "jwt.token.value");
      localStorage.setItem(toOpaqueKey("cbt_activities"), "ciphertext-data");

      // Populate sessionStorage
      sessionStorage.setItem("mindsahaay_demo_vault_meta", "meta-blob");
      sessionStorage.setItem("sb-session", "session-token");

      // Verify vault was unlocked
      expect(getVaultPassphrase()).toBe(TEST_PASSPHRASE);

      // Execute central cleanup
      clearAllLocalUserData();

      // Verify preserved keys remain untouched
      expect(localStorage.getItem("mindsahaay-theme")).toBe("dark");
      expect(localStorage.getItem("i18nextLng")).toBe("hi");

      // Verify all app-owned data is purged
      expect(localStorage.getItem("mindsahaay_demo_mode")).toBeNull();
      expect(localStorage.getItem("mindsahaay-habit-streak")).toBeNull();
      expect(localStorage.getItem("sb-myproject-auth-token")).toBeNull();
      expect(localStorage.getItem(toOpaqueKey("cbt_activities"))).toBeNull();

      // Verify sessionStorage is purged
      expect(sessionStorage.getItem("mindsahaay_demo_vault_meta")).toBeNull();
      expect(sessionStorage.getItem("sb-session")).toBeNull();

      // Verify vault is locked and memory cache is cleared
      expect(getVaultPassphrase()).toBeNull();
      expect(isVaultLocked()).toBe(true);
      expect(getSecureItemSync("cbt_activities").status).toBe("locked");
    });

    it("keeps unsynced outbox items by default and discards them only on explicit request", async () => {
      await clearAllOutboxDbs();
      await unlockTestVault();

      // Enqueue an outbox item
      await enqueueMood({
        id: "mood-test-1",
        student_id: "student-storage-test",
        mood: "Calm",
        score: 8,
      });

      expect(await hasUnsynced("student-storage-test")).toBe(1);

      // Default cleanup without discardOutbox: keeps unsynced items
      const reportKeep = await clearAllLocalUserData({ userId: "student-storage-test" });
      expect(reportKeep.keptUnsynced).toBe(1);
      expect(await hasUnsynced("student-storage-test")).toBe(1);

      // Explicit discardOutbox: true: deletes unsynced items
      const reportDiscard = await clearAllLocalUserData({ userId: "student-storage-test", discardOutbox: true });
      expect(reportDiscard.keptUnsynced).toBe(0);
      expect(await hasUnsynced("student-storage-test")).toBe(0);
    });
  });
});
