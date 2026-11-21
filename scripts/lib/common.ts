/**
 * Shared helpers for the crisis-classifier evaluation scripts.
 * Plain TypeScript with erasable syntax only, so it runs with `node` (type stripping).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Level = "none" | "low" | "moderate" | "high" | "imminent";
export const LEVELS: Level[] = ["none", "low", "moderate", "high", "imminent"];
export const LANGS: string[] = ["en", "hi", "hinglish"];

export interface Item {
  id: string;
  text: string;
  language: string;
  script: string;
  label: Level;
  category: string;
  notes: string;
}

export interface Prediction {
  id: string;
  gold: Level;
  pred: Level;
  language: string;
  category: string;
  text: string;
  notes?: string;
  latencyMs?: number;
  detail?: string;
}

export interface ClassStats {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface Metrics {
  n: number;
  accuracy: number;
  macroF1: number;
  perClass: Record<string, ClassStats>;
  /** rows = gold, columns = predicted, order = LEVELS */
  confusion: number[][];
  /** gold high/imminent predicted high/imminent */
  highImminentRecall: number;
  highImminentRecallByLanguage: Record<string, number>;
  /** gold high/imminent predicted moderate or above (flagged at all) */
  highImminentFlaggedRecall: number;
  /** gold imminent predicted imminent */
  imminentRecall: number;
  /** gold none/low predicted high/imminent */
  falseAlarmRateNoneLow: number;
  /** items whose category starts with hn_ : share NOT predicted high/imminent */
  hardNegativeSpecificity: number;
  hardNegativeCount: number;
  /** gold >= moderate predicted >= moderate */
  moderatePlusRecall: number;
  latencyP50Ms?: number;
  latencyP95Ms?: number;
}

export interface UsageSummary {
  /** items scored */
  items: number;
  /** items answered from the on-disk cache (no API call in this run) */
  cacheHits: number;
  /** API calls made in this run */
  newCalls: number;
  /** items whose reply could not be parsed (scored as "none", flagged in the report) */
  parseFailures: number;
  /** tokens as reported by the API, summed over all scored items (cached + new) */
  inputTokens: number;
  outputTokens: number;
  /** estimated USD at the configured per-million-token prices, all scored items */
  costUsd: number;
  /** estimated USD actually spent in this run (new calls only) */
  newCostUsd: number;
  priceInPerMTok: number;
  priceOutPerMTok: number;
}

export interface SystemResult {
  system: "keyword" | "llm" | "hybrid";
  model?: string;
  promptHash?: string;
  /** which half of the split was scored; headline numbers must come from "heldout" */
  split?: "dev" | "heldout";
  /** true when produced against a mock server; never real numbers */
  mock?: boolean;
  /** items limited by --limit (subset, not a full split) */
  limited?: boolean;
  usage?: UsageSummary;
  date: string;
  metrics: Metrics;
  predictions: Prediction[];
}

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DATASET_PATH = resolve(ROOT, "eval/dataset/dataset.jsonl");
export const RESULTS_DIR = resolve(ROOT, "eval/results");

export function loadDataset(): Item[] {
  const lines = readFileSync(DATASET_PATH, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map((l) => JSON.parse(l) as Item);
}

const rank = (l: Level): number => LEVELS.indexOf(l);
const ratio = (a: number, b: number): number => (b === 0 ? 0 : a / b);

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function computeMetrics(preds: Prediction[]): Metrics {
  const k = LEVELS.length;
  const confusion: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  for (const p of preds) confusion[rank(p.gold)][rank(p.pred)]++;

  const perClass: Record<string, ClassStats> = {};
  let f1Sum = 0;
  let correct = 0;
  LEVELS.forEach((lvl, i) => {
    const tp = confusion[i][i];
    const fn = confusion[i].reduce((a, b) => a + b, 0) - tp;
    const fp = confusion.reduce((a, row) => a + row[i], 0) - tp;
    const precision = ratio(tp, tp + fp);
    const recall = ratio(tp, tp + fn);
    const f1 = ratio(2 * precision * recall, precision + recall);
    perClass[lvl] = { precision, recall, f1, support: tp + fn };
    f1Sum += f1;
    correct += tp;
  });

  const isHi = (l: Level): boolean => l === "high" || l === "imminent";
  const goldHi = preds.filter((p) => isHi(p.gold));
  const byLang: Record<string, number> = {};
  for (const lang of LANGS) {
    const sub = goldHi.filter((p) => p.language === lang);
    byLang[lang] = ratio(sub.filter((p) => isHi(p.pred)).length, sub.length);
  }
  const goldImm = preds.filter((p) => p.gold === "imminent");
  const goldNL = preds.filter((p) => p.gold === "none" || p.gold === "low");
  const hardNeg = preds.filter((p) => p.category.startsWith("hn_") && p.gold === "none");
  const goldMod = preds.filter((p) => rank(p.gold) >= rank("moderate"));
  const lat = preds.map((p) => p.latencyMs).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);

  return {
    n: preds.length,
    accuracy: ratio(correct, preds.length),
    macroF1: f1Sum / k,
    perClass,
    confusion,
    highImminentRecall: ratio(goldHi.filter((p) => isHi(p.pred)).length, goldHi.length),
    highImminentRecallByLanguage: byLang,
    highImminentFlaggedRecall: ratio(goldHi.filter((p) => rank(p.pred) >= rank("moderate")).length, goldHi.length),
    imminentRecall: ratio(goldImm.filter((p) => p.pred === "imminent").length, goldImm.length),
    falseAlarmRateNoneLow: ratio(goldNL.filter((p) => isHi(p.pred)).length, goldNL.length),
    hardNegativeSpecificity: ratio(hardNeg.filter((p) => !isHi(p.pred)).length, hardNeg.length),
    hardNegativeCount: hardNeg.length,
    moderatePlusRecall: ratio(goldMod.filter((p) => rank(p.pred) >= rank("moderate")).length, goldMod.length),
    latencyP50Ms: lat.length ? percentile(lat, 50) : undefined,
    latencyP95Ms: lat.length ? percentile(lat, 95) : undefined,
  };
}

/**
 * Misses ranked by severity gap: gold more severe than predicted, largest gap first.
 * The dataset repeats each core sentence with an opener or closer, so only base sentences are listed.
 */
export function worstMisses(preds: Prediction[], limit: number): Prediction[] {
  const sorted = preds
    .filter((p) => rank(p.gold) > rank(p.pred) && (p.notes ?? "base").includes("base"))
    .sort((a, b) => rank(b.gold) - rank(b.pred) - (rank(a.gold) - rank(a.pred)) || rank(b.gold) - rank(a.gold) || a.id.localeCompare(b.id));
  // Round-robin across languages so one language cannot fill the list.
  const buckets = LANGS.map((l) => sorted.filter((p) => p.language === l));
  const out: Prediction[] = [];
  for (let i = 0; out.length < limit && buckets.some((b) => i < b.length); i++) {
    for (const b of buckets) if (i < b.length && out.length < limit) out.push(b[i]);
  }
  return out;
}

/** Unsafe over-escalation: gold none/low predicted high/imminent. */
export function falseAlarms(preds: Prediction[], limit: number): Prediction[] {
  return preds
    .filter((p) => rank(p.gold) <= rank("low") && rank(p.pred) >= rank("high") && (p.notes ?? "base").includes("base"))
    .slice(0, limit);
}

const f = (v: number): string => v.toFixed(3);

export function confusionTable(m: Metrics): string {
  const head = `| gold \\ pred | ${LEVELS.join(" | ")} |`;
  const sep = `|---|${LEVELS.map(() => "---:").join("|")}|`;
  const rows = LEVELS.map((l, i) => `| **${l}** | ${m.confusion[i].join(" | ")} |`);
  return [head, sep, ...rows].join("\n");
}

export function perClassTable(m: Metrics): string {
  const rows = LEVELS.map((l) => {
    const c = m.perClass[l];
    return `| ${l} | ${f(c.precision)} | ${f(c.recall)} | ${f(c.f1)} | ${c.support} |`;
  });
  return ["| class | precision | recall | F1 | support |", "|---|---:|---:|---:|---:|", ...rows].join("\n");
}

function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function missesTable(list: Prediction[]): string {
  const rows = list.map((p) => `| ${p.id} | ${p.gold} | ${p.pred} | ${p.category} | ${esc(p.text)} |`);
  return ["| id | gold | predicted | category | text |", "|---|---|---|---|---|", ...rows].join("\n");
}

export function renderSystemMarkdown(r: SystemResult): string {
  const m = r.metrics;
  const lines: string[] = [];
  if (r.mock) {
    lines.push("> **MOCK RESULT. Produced against a local mock server, not a real model. These numbers mean nothing.**");
    lines.push("");
  }
  lines.push(`# ${r.system} classifier results${r.split ? ` (${r.split} split)` : ""}`);
  lines.push("");
  if (r.limited) {
    lines.push("> Partial run (--limit). Not a full split; do not quote these numbers.");
    lines.push("");
  }
  if (r.split === "dev") {
    lines.push("> Dev split: for tuning and smoke tests only. Headline numbers come from the heldout split.");
    lines.push("");
  }
  lines.push(`Date: ${r.date}${r.model ? `  |  Model: ${r.model}` : ""}${r.promptHash ? `  |  Prompt hash: ${r.promptHash}` : ""}`);
  lines.push("");
  lines.push("> Synthetic, clinician-unreviewed dataset. These numbers are a development baseline, not evidence of clinical performance. Educational tool, not diagnostic.");
  lines.push("");
  lines.push(`Items: ${m.n}. Accuracy: ${f(m.accuracy)}. Macro-F1: ${f(m.macroF1)}.`);
  lines.push("");
  if (r.usage) {
    const u = r.usage;
    lines.push(`Usage: ${u.items} items, ${u.newCalls} new API calls, ${u.cacheHits} from cache, ${u.parseFailures} unparsed replies. Tokens in/out: ${u.inputTokens}/${u.outputTokens}. Estimated cost USD ${u.costUsd.toFixed(2)} total, ${u.newCostUsd.toFixed(2)} this run (at $${u.priceInPerMTok}/$${u.priceOutPerMTok} per million tokens in/out, assumed prices).`);
    lines.push("");
  }
  lines.push("## Safety metrics");
  lines.push("");
  lines.push("| metric | value |");
  lines.push("|---|---:|");
  lines.push(`| Recall, high+imminent group (predicted high or imminent) | ${f(m.highImminentRecall)} |`);
  for (const lang of LANGS) lines.push(`| ... ${lang} | ${f(m.highImminentRecallByLanguage[lang])} |`);
  lines.push(`| Recall, high+imminent flagged at moderate or above | ${f(m.highImminentFlaggedRecall)} |`);
  lines.push(`| Recall, imminent exact | ${f(m.imminentRecall)} |`);
  lines.push(`| Recall, moderate and above flagged at moderate or above | ${f(m.moderatePlusRecall)} |`);
  lines.push(`| False-alarm rate (gold none/low predicted high/imminent) | ${f(m.falseAlarmRateNoneLow)} |`);
  lines.push(`| Hard-negative specificity (idiom/lyrics/fiction/negation, n=${m.hardNegativeCount}) | ${f(m.hardNegativeSpecificity)} |`);
  if (m.latencyP50Ms !== undefined) lines.push(`| Latency p50 / p95 (ms) | ${Math.round(m.latencyP50Ms)} / ${Math.round(m.latencyP95Ms ?? 0)} |`);
  lines.push("");
  lines.push("## Per-class metrics");
  lines.push("");
  lines.push(perClassTable(m));
  lines.push("");
  lines.push("## Confusion matrix");
  lines.push("");
  lines.push(confusionTable(m));
  lines.push("");
  lines.push("## 15 worst misses (gold more severe than predicted)");
  lines.push("");
  lines.push(missesTable(worstMisses(r.predictions, 15)));
  lines.push("");
  lines.push("## Up to 10 false alarms (gold none/low predicted high/imminent)");
  lines.push("");
  lines.push(missesTable(falseAlarms(r.predictions, 10)));
  lines.push("");
  return lines.join("\n");
}

export const MOCK_DIR = resolve(RESULTS_DIR, "mock");

/** Real results live in eval/results, mock results ONLY in eval/results/mock. */
export function resultDir(mock: boolean): string {
  return mock ? MOCK_DIR : RESULTS_DIR;
}

/** Partial (--limit) runs get their own file name so they can never overwrite a full-split result. */
export function resultBase(system: string, split?: string, limited = false): string {
  return split ? `${system}-${split}${limited ? "-limited" : ""}` : system;
}

export function saveResult(r: SystemResult): void {
  const dir = resultDir(r.mock === true);
  mkdirSync(dir, { recursive: true });
  const base = resultBase(r.system, r.split, r.limited === true);
  writeFileSync(resolve(dir, `${base}.json`), JSON.stringify(r, null, 2) + "\n", "utf8");
  writeFileSync(resolve(dir, `${base}.md`), renderSystemMarkdown(r), "utf8");
}

export function loadResult(system: string, split?: string, mock = false): SystemResult | null {
  try {
    return JSON.parse(readFileSync(resolve(resultDir(mock), `${resultBase(system, split)}.json`), "utf8")) as SystemResult;
  } catch {
    return null;
  }
}

export interface SplitFile {
  items: Record<string, "dev" | "heldout">;
}

export function loadSplit(): Record<string, "dev" | "heldout"> {
  const raw = JSON.parse(readFileSync(resolve(ROOT, "eval/splits/split.json"), "utf8")) as SplitFile;
  return raw.items;
}

export function toLevel(v: unknown): Level {
  return LEVELS.includes(v as Level) ? (v as Level) : "none";
}

export function maxLevel(a: Level, b: Level): Level {
  return rank(a) >= rank(b) ? a : b;
}
