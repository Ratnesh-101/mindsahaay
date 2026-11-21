/**
 * Builds the comparison report from the HELDOUT split only.
 *
 *   node scripts/eval-report.ts          real report  -> eval/results/comparison.md
 *   node scripts/eval-report.ts --mock   mock report  -> eval/results/mock/comparison.md (MOCK banner, never real numbers)
 *
 * Inputs: llm-heldout.json and hybrid-heldout.json (from eval-llm.ts / eval-hybrid.ts). The deterministic
 * keyword systems are recomputed live from src/domain/risk/lexicon.ts and the frozen v1 lexicon, so they are
 * always consistent with the current code. Missing, partial (--limit) or mock inputs are listed as "not run".
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectRisk as detectV2 } from "../src/domain/risk/lexicon.ts";
import { detectRisk as detectV1 } from "../eval/splits/lexicon-v1.frozen.ts";
import { LANGS, ROOT, computeMetrics, confusionTable, loadDataset, loadResult, loadSplit, resultDir } from "./lib/common.ts";
import type { Prediction, SystemResult } from "./lib/common.ts";
import { bootstrapCI, falseNegativesHighImminent, isHighOrImminent, macroF1, mcnemar, recallHighImminent } from "./lib/stats.ts";
import type { Interval } from "./lib/stats.ts";

const MOCK = process.argv.includes("--mock");
const SPLIT = "heldout" as const;
const REPLICATES = 2000;

interface Sys {
  name: string;
  label: string;
  note: string;
  preds: Prediction[] | null;
  result: SystemResult | null;
}

const splitMap = loadSplit();
const heldItems = loadDataset().filter((it) => splitMap[it.id] === SPLIT);

function lexiconSystem(name: string, label: string, detect: (t: string) => { level: Prediction["pred"]; matches: string[] }): Sys {
  const preds = heldItems.map((it) => {
    const r = detect(it.text);
    return { id: it.id, gold: it.label, pred: r.level, language: it.language, category: it.category, text: it.text, notes: it.notes, detail: r.matches.join("; ") };
  });
  return { name, label, note: "deterministic, recomputed now", preds, result: null };
}

function loaded(system: "llm" | "hybrid", label: string): Sys {
  const r = loadResult(system, SPLIT, MOCK);
  if (!r) return { name: system, label, note: "not run (no heldout result file)", preds: null, result: null };
  if (r.split !== SPLIT) return { name: system, label, note: "not run (file is not a heldout run)", preds: null, result: null };
  if (r.limited) return { name: system, label, note: "not used (partial --limit run)", preds: null, result: null };
  if (!MOCK && r.mock) return { name: system, label, note: "not used (file is marked mock)", preds: null, result: null };
  if (r.predictions.length !== heldItems.length) return { name: system, label, note: `not used (${r.predictions.length} items, expected ${heldItems.length})`, preds: null, result: null };
  return { name: system, label, note: `${r.model ?? "?"}, run ${r.date}`, preds: r.predictions, result: r };
}

const systems: Sys[] = [
  lexiconSystem("keyword-v1", "keyword v1 (frozen)", detectV1),
  lexiconSystem("keyword-v2", "keyword v2 (current)", detectV2),
  loaded("llm", "LLM only"),
  loaded("hybrid", "hybrid (keyword v2 + LLM)"),
];
const ran = systems.filter((s) => s.preds);

const f = (v: number | undefined): string => (v === undefined || Number.isNaN(v) ? "n/a" : v.toFixed(3));
const ci = (i: Interval): string => `${f(i.point)} [${f(i.lo)}, ${f(i.hi)}]`;
const L: string[] = [];

if (MOCK) {
  L.push("# MOCK REPORT: NOT REAL RESULTS");
  L.push("");
  L.push("> **MOCK. The LLM and hybrid columns below come from `scripts/mock-anthropic.mjs`, which answers with keyword rules plus random noise. It is not a language model. Nothing in this file is evidence about any real model. Do not quote, cite or copy any number from it.**");
  L.push("");
} else {
  L.push("# Crisis detection: system comparison (heldout split)");
  L.push("");
}
L.push(`> Scope: headline numbers use the **heldout** split only (${heldItems.length} of ${loadDataset().length} items, \`eval/splits/split.json\`). The dev split was used to design the keyword rules and the LLM prompt and is never reported here. Dataset: synthetic, not reviewed by a clinician. MindSahaay is an educational tool and does not diagnose.`);
L.push("");
L.push("Systems: " + systems.map((s) => `**${s.label}**: ${s.note}`).join("; ") + ".");
L.push("");
L.push(`Intervals are 95% percentile bootstrap intervals, ${REPLICATES} replicates, resampling whole base-sentence groups (the dataset repeats each core sentence with openers and closers, so single items are not independent). With about 14 groups per language/label cell the intervals are wide, and that width is the honest uncertainty.`);
L.push("");

// ---- main table
const cols = ran;
L.push("## Headline metrics (heldout)");
L.push("");
if (cols.length === 0) L.push("No system has results.");
else {
  L.push("| metric | " + cols.map((s) => s.label).join(" | ") + " |");
  L.push("|---|" + cols.map(() => "---:").join("|") + "|");
  const row = (label: string, fn: (s: Sys) => string): void => {
    L.push(`| ${label} | ${cols.map(fn).join(" | ")} |`);
  };
  const metrics = new Map(cols.map((s) => [s.name, computeMetrics(s.preds as Prediction[])]));
  const m = (s: Sys) => metrics.get(s.name) as ReturnType<typeof computeMetrics>;
  row("Items", (s) => String(m(s).n));
  row("Recall, gold high+imminent predicted high/imminent [95% CI]", (s) => ci(bootstrapCI(s.preds as Prediction[], recallHighImminent, { replicates: REPLICATES, seed: 101 })));
  row("Macro-F1, 5 classes [95% CI]", (s) => ci(bootstrapCI(s.preds as Prediction[], macroF1, { replicates: REPLICATES, seed: 202 })));
  row("Accuracy, 5 classes", (s) => f(m(s).accuracy));
  for (const l of LANGS) row(`Recall high+imminent, ${l}`, (s) => f(m(s).highImminentRecallByLanguage[l]));
  row("Recall high+imminent, flagged at moderate or above", (s) => f(m(s).highImminentFlaggedRecall));
  row("Recall imminent, exact", (s) => f(m(s).imminentRecall));
  row("False-alarm rate (gold none/low predicted high/imminent)", (s) => f(m(s).falseAlarmRateNoneLow));
  row(`Hard-negative specificity (n=${m(cols[0]).hardNegativeCount})`, (s) => f(m(s).hardNegativeSpecificity));
  row("Latency p50 / p95 ms (LLM figures are wall-clock)", (s) => (m(s).latencyP50Ms === undefined ? "n/a" : `${f(m(s).latencyP50Ms)} / ${f(m(s).latencyP95Ms)}`));
}
L.push("");

// ---- safety FN
L.push("## Safety metric: false-negative rate for gold high and imminent");
L.push("");
L.push("A false negative is a gold high or imminent message that the system did not predict as high or imminent. \"Unflagged\" means it was predicted none or low, so nothing in the app would have reacted.");
L.push("");
L.push("| system | gold high+imminent | missed | false-negative rate | of which unflagged (none/low) |");
L.push("|---|---:|---:|---:|---:|");
const fns = new Map(ran.map((s) => [s.name, falseNegativesHighImminent(s.preds as Prediction[])]));
for (const s of ran) {
  const x = fns.get(s.name)!;
  L.push(`| ${s.label} | ${x.goldCount} | ${x.missedCount} | ${f(x.rate)} | ${x.unflaggedCount} |`);
}
L.push("");

// ---- McNemar
L.push("## Paired test: keyword v2 vs hybrid (heldout)");
L.push("");
const kw2 = systems.find((s) => s.name === "keyword-v2")!;
const hyb = systems.find((s) => s.name === "hybrid")!;
if (!hyb.preds) L.push("Not run: no hybrid heldout result.");
else {
  const kp = kw2.preds as Prediction[];
  const hp = hyb.preds;
  const detect = (p: Prediction): boolean => isHighOrImminent(p.pred);
  const exact = (p: Prediction): boolean => p.pred === p.gold;
  const isBase = (p: Prediction): boolean => (p.notes ?? "").includes("base");
  const tests: Array<[string, ReturnType<typeof mcnemar>]> = [
    ["High+imminent detected, gold high/imminent items (all variants)", mcnemar(kp, hp, detect, (p) => isHighOrImminent(p.gold))],
    ["High+imminent detected, gold high/imminent, base sentences only", mcnemar(kp, hp, detect, (p) => isHighOrImminent(p.gold) && isBase(p))],
    ["5-class exact match, all items", mcnemar(kp, hp, exact)],
  ];
  L.push("Exact two-sided McNemar test on paired items (A = keyword v2, B = hybrid). Only the discordant pairs matter.");
  L.push("");
  L.push("| outcome tested | both right | only keyword v2 right | only hybrid right | both wrong | exact p |");
  L.push("|---|---:|---:|---:|---:|---:|");
  for (const [label, r] of tests) L.push(`| ${label} | ${r.both} | ${r.aOnly} | ${r.bOnly} | ${r.neither} | ${r.p < 0.001 ? "<0.001" : r.p.toFixed(3)} |`);
  L.push("");
  L.push("Variants of one base sentence are near-duplicates, so the all-variants rows count correlated items as independent and their p-values are too small. The base-sentence row is the more defensible one. The hybrid is the more severe of keyword v2 and the LLM, so it can only match or improve keyword v2 recall by construction; the test therefore mainly measures how much the LLM adds, and the false-alarm rate row shows what that costs.");
}
L.push("");

// ---- missed items
L.push("## Missed high and imminent items (heldout)");
L.push("");
for (const s of ran.filter((x) => x.name !== "keyword-v1")) {
  const x = fns.get(s.name)!;
  L.push(`### ${s.label}: ${x.missedCount} of ${x.goldCount} missed`);
  L.push("");
  if (x.missed.length === 0) {
    L.push("None.");
    L.push("");
    continue;
  }
  L.push("| id | gold | predicted | category | text |");
  L.push("|---|---|---|---|---|");
  for (const p of x.missed) L.push(`| ${p.id} | ${p.gold} | ${p.pred} | ${p.category} | ${p.text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ")} |`);
  L.push("");
}

// ---- confusion matrices
L.push("## Confusion matrices (rows gold, columns predicted)");
for (const s of systems) {
  L.push("");
  L.push(`### ${s.label}`);
  L.push("");
  L.push(s.preds ? confusionTable(computeMetrics(s.preds)) : `Not run: ${s.note}.`);
}
L.push("");

// ---- usage
const withUsage = systems.filter((s) => s.result?.usage);
if (withUsage.length > 0) {
  L.push("## API usage recorded for these results");
  L.push("");
  L.push("| system | items | new calls | from cache | unparsed replies | input tokens | output tokens | est. cost USD | prices assumed (in/out per million tokens) |");
  L.push("|---|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const s of withUsage) {
    const u = s.result!.usage!;
    L.push(`| ${s.label} | ${u.items} | ${u.newCalls} | ${u.cacheHits} | ${u.parseFailures} | ${u.inputTokens} | ${u.outputTokens} | ${u.costUsd.toFixed(2)} | $${u.priceInPerMTok} / $${u.priceOutPerMTok} |`);
  }
  L.push("");
  L.push("The hybrid reuses the LLM cache, so its usage repeats the LLM figures rather than adding to them. Cost is an estimate from API-reported tokens at assumed prices, not an invoice.");
  L.push("");
}

// ---- hypothesis
L.push("## Hypothesis check");
L.push("");
const rr = (s: Sys): number | null => (s.preds ? recallHighImminent(s.preds) : null);
const k = rr(kw2);
const l = rr(systems[2]);
const h = rr(hyb);
if (k !== null && l !== null && h !== null) {
  L.push(`Plan hypothesis: hybrid recall >= LLM recall >= keyword recall on high+imminent. Point estimates: hybrid ${f(h)}, LLM ${f(l)}, keyword v2 ${f(k)}. ${h >= l && l >= k ? "The ordering holds as a point estimate." : "The ordering does not hold as a point estimate."} Compare against the intervals above before drawing any conclusion: overlapping intervals mean the ordering is not established.`);
} else {
  L.push("Not evaluated: the hypothesis needs keyword, LLM and hybrid results on the same heldout split. Missing results are listed as not run above.");
}
L.push("");

// ---- limitations
L.push("## Limitations");
L.push("");
L.push(
  `All items are synthetic, written by the project authors and not reviewed by a clinician, so they are cleaner and more formulaic than real student messages and the gold labels carry the authors' judgement. The ${heldItems.length} heldout items come from about ${new Set(heldItems.map((i) => `${i.language}-${i.label}-${(Number(i.id.split("-").pop()) - 1) % 14}`)).size} distinct base sentences, so the effective sample is far smaller than the item count, and the bootstrap intervals above (which resample whole groups) are the right scale to read. The keyword rules were written by the same team that wrote the dataset and tuned on the dev half, so keyword results are optimistic even on heldout. The LLM was evaluated with one prompt, one model and temperature 0 where the API allows it, in a single run per item, so run-to-run variation is not measured. Recall on this dataset says nothing about recall on real distress messages, and a high point estimate does not show the true recall is above any safety target. No result here supports clinical use. The app is an educational well-being tool and not a diagnostic or crisis-response service; crisis handling always shows Tele-MANAS 14416, KIRAN 1800-599-0019 and 112.`,
);
L.push("");

const dir = resultDir(MOCK);
mkdirSync(dir, { recursive: true });
const out = resolve(dir, "comparison.md");
writeFileSync(out, L.join("\n"), "utf8");
console.log(`Wrote ${out.replace(ROOT, "").replace(/^[\\/]/, "")} (${ran.map((x) => x.name).join(", ") || "no systems"})${MOCK ? " [MOCK]" : ""}`);
