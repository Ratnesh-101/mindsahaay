/**
 * Deterministic dev/heldout split for eval/dataset/dataset.jsonl.
 * Run: node eval/splits/make-split.mjs
 *
 * Grouping: each (language,label) cell has 14 base sentences, then 14 prefix and 12 suffix
 * variants in id order. Variant number n belongs to base ((n-1) % 14) + 1. All variants of a
 * base sentence share a group and therefore a split (no near-duplicate leakage).
 * The grouping is verified: every variant must contain its base text.
 *
 * Assignment: inside each cell, groups are sorted by (category, sha256(group key)) and
 * alternately given to dev / heldout, so each cell is 7/7 and categories are balanced.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const items = readFileSync(resolve(root, "eval/dataset/dataset.jsonl"), "utf8")
  .split(/\r?\n/)
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

const byId = new Map(items.map((i) => [i.id, i]));
const groupOf = (it) => {
  const [lang, label, num] = it.id.split("-");
  const n = parseInt(num, 10);
  return `${lang}-${label}-g${String(((n - 1) % 14) + 1).padStart(2, "0")}`;
};

// verify grouping using a loose check: the variant contains the base text (minus final punctuation)
let verified = 0;
let unverified = 0;
for (const it of items) {
  const g = groupOf(it);
  const [lang, label, gnum] = g.split("-");
  const baseId = `${lang}-${label}-${String(parseInt(gnum.slice(1), 10)).padStart(3, "0")}`;
  const base = byId.get(baseId);
  const core = base.text.replace(/[.!?।\s]+$/u, "").toLowerCase();
  if (it.text.toLowerCase().includes(core) && it.category === base.category) verified++;
  else unverified++;
}

const groups = new Map();
for (const it of items) {
  const g = groupOf(it);
  if (!groups.has(g)) groups.set(g, { cell: g.replace(/-g\d+$/, ""), category: it.category, ids: [] });
  groups.get(g).ids.push(it.id);
}

const cells = new Map();
for (const [key, g] of groups) {
  if (!cells.has(g.cell)) cells.set(g.cell, []);
  cells.get(g.cell).push({ key, ...g, h: createHash("sha256").update("mindsahaay-split-v1:" + key).digest("hex") });
}

const assignment = {};
const groupAssignment = {};
for (const [, list] of [...cells].sort()) {
  list.sort((a, b) => a.category.localeCompare(b.category) || a.h.localeCompare(b.h));
  list.forEach((g, i) => {
    const split = i % 2 === 0 ? "dev" : "heldout";
    groupAssignment[g.key] = split;
    for (const id of g.ids) assignment[id] = split;
  });
}

const counts = { dev: 0, heldout: 0 };
for (const s of Object.values(assignment)) counts[s]++;

const out = {
  description:
    "Deterministic 50/50 dev/heldout split of eval/dataset/dataset.jsonl, stratified by language and label, grouped so that all variants of a base sentence stay together. Tune only on dev.",
  seed: "mindsahaay-split-v1",
  grouping: "variant n of a (language,label) cell belongs to base ((n-1) % 14) + 1; verified by text containment",
  groupingVerified: { ok: verified, failed: unverified },
  counts,
  groups: groupAssignment,
  items: assignment,
};
writeFileSync(resolve(root, "eval/splits/split.json"), JSON.stringify(out, null, 2) + "\n", "utf8");
console.log("split written", counts, "grouping verified", verified, "failed", unverified);
