// @vitest-environment node
// Drift and staleness check between the edge function generated lexicon
// (_shared/lexicon.generated.ts) and the client domain lexicon (src/domain/risk/lexicon.ts)
// on the shared evaluation dataset (eval/dataset/dataset.jsonl).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import serverDetectRisk, { checkCrisisLexicon } from "./lexicon.ts";
import clientDetectRisk from "../../../src/domain/risk/lexicon.ts";

interface Row {
  id: string;
  text: string;
  label: "none" | "low" | "moderate" | "high" | "imminent";
  language?: string;
  category?: string;
}

const rootDir = path.resolve(import.meta.dirname, "../../..");
const datasetPath = path.resolve(rootDir, "eval/dataset/dataset.jsonl");
const srcLexiconPath = path.resolve(rootDir, "src/domain/risk/lexicon.ts");
const generatedLexiconPath = path.resolve(import.meta.dirname, "./lexicon.generated.ts");

const rows: Row[] = readFileSync(datasetPath, "utf8")
  .split(/\r?\n/)
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

const isHighOrImminent = (lvl: string) => lvl === "high" || lvl === "imminent";

describe("lexicon sync and drift: server vs client", () => {
  it("fails if the generated lexicon file is stale (hash mismatch with src/domain/risk/lexicon.ts)", () => {
    const srcRaw = readFileSync(srcLexiconPath, "utf8");
    const normalizedSrc = srcRaw.replace(/\r\n/g, "\n");
    const expectedHash = createHash("sha256").update(normalizedSrc, "utf8").digest("hex");

    const generatedRaw = readFileSync(generatedLexiconPath, "utf8");
    const match = generatedRaw.match(/Source SHA-256:\s*([a-f0-9]{64})/i);

    expect(
      match,
      "supabase/functions/_shared/lexicon.generated.ts must contain a valid 'Source SHA-256: <hash>' header. Run 'pnpm sync:lexicon'.",
    ).not.toBeNull();

    const actualHash = match![1];
    expect(
      actualHash,
      `Generated lexicon is stale! Source hash changed.\nExpected: ${expectedHash}\nFound:    ${actualHash}\nRun 'pnpm sync:lexicon' to synchronize.`,
    ).toBe(expectedHash);
  });

  it("loads the evaluation dataset", () => {
    expect(rows.length).toBeGreaterThanOrEqual(100);
  });

  it("asserts exact 100% agreement between server and client risk levels across all rows", () => {
    let disagreeCount = 0;
    const disagreements: Array<{ id: string; text: string; serverLevel: string; clientLevel: string }> = [];

    for (const row of rows) {
      const serverRes = serverDetectRisk(row.text);
      const clientRes = clientDetectRisk(row.text);

      if (serverRes.level !== clientRes.level) {
        disagreeCount++;
        disagreements.push({
          id: row.id,
          text: row.text,
          serverLevel: serverRes.level,
          clientLevel: clientRes.level,
        });
      }

      // Also ensure checkCrisisLexicon aligns with client crisis classification
      const serverCheck = checkCrisisLexicon(row.text);
      const clientIsCrisis = isHighOrImminent(clientRes.level);
      expect(serverCheck.isCrisis).toBe(clientIsCrisis);
    }

    const agreementPct = ((rows.length - disagreeCount) / rows.length) * 100;
    console.info(`[lexicon-drift] rows=${rows.length} agreement=${agreementPct.toFixed(2)}% disagreements=${disagreeCount}`);

    expect(disagreements).toEqual([]);
    expect(disagreeCount).toBe(0);
    expect(agreementPct).toBe(100);
  });
});
