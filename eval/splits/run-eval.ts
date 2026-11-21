/**
 * Evaluates a lexicon on the dev / heldout split.
 *   node eval/splits/run-eval.ts v1 --dev-only      (frozen v1 copy, dev only)
 *   node eval/splits/run-eval.ts v2 --dev-only      (current src lexicon, dev only; use while tuning)
 *   node eval/splits/run-eval.ts both --write       (final: v1 and v2 on dev and heldout, writes eval/results/keyword-v2.{md,json})
 * Heldout numbers are only computed without --dev-only. Do not tune on them.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeMetrics, falseAlarms, loadDataset, missesTable, ROOT, worstMisses } from "../../scripts/lib/common.ts";
import type { Metrics, Prediction } from "../../scripts/lib/common.ts";
import { detectRisk as detectV2 } from "../../src/domain/risk/lexicon.ts";
import { detectRisk as detectV1 } from "./lexicon-v1.frozen.ts";

const args = process.argv.slice(2);
const which = args[0] ?? "v2";
const devOnly = args.includes("--dev-only");
const write = args.includes("--write");
const showMisses = args.includes("--misses");

const split = JSON.parse(readFileSync(resolve(ROOT, "eval/splits/split.json"), "utf8")).items as Record<string, "dev" | "heldout">;
const items = loadDataset();

function run(detect: (t: string) => { level: any; matches: string[] }): Prediction[] {
  return items.map((it) => {
    const t0 = performance.now();
    const r = detect(it.text);
    return { id: it.id, gold: it.label, pred: r.level, language: it.language, category: it.category, text: it.text, notes: it.notes, latencyMs: performance.now() - t0, detail: r.matches.join("; ") };
  });
}
const sub = (p: Prediction[], s: string) => p.filter((x) => split[x.id] === s);
const f = (v: number) => v.toFixed(3);

const systems: Record<string, Prediction[]> = {};
if (which === "v1" || which === "both") systems.v1 = run(detectV1);
if (which === "v2" || which === "both") systems.v2 = run(detectV2);
const splits = devOnly ? ["dev"] : ["dev", "heldout"];

const out: Record<string, Record<string, Metrics>> = {};
for (const [name, preds] of Object.entries(systems)) {
  out[name] = {};
  for (const s of splits) {
    const m = computeMetrics(sub(preds, s));
    out[name][s] = m;
    console.log(`${name} ${s}: n=${m.n} acc=${f(m.accuracy)} hiRecall=${f(m.highImminentRecall)} (en ${f(m.highImminentRecallByLanguage.en)} hi ${f(m.highImminentRecallByLanguage.hi)} hing ${f(m.highImminentRecallByLanguage.hinglish)}) flagged>=mod=${f(m.highImminentFlaggedRecall)} imm=${f(m.imminentRecall)} mod+=${f(m.moderatePlusRecall)} FA=${f(m.falseAlarmRateNoneLow)} hnSpec=${f(m.hardNegativeSpecificity)}`);
  }
  if (showMisses) {
    const dev = sub(preds, "dev");
    console.log("--- dev misses (gold>=high predicted lower) / over-alarms for", name);
    for (const p of dev.filter((x) => (x.notes ?? "").includes("base"))) {
      const g = ["none", "low", "moderate", "high", "imminent"].indexOf(p.gold);
      const q = ["none", "low", "moderate", "high", "imminent"].indexOf(p.pred);
      if (g !== q) console.log(`${p.id} gold=${p.gold} pred=${p.pred} :: ${p.text}`);
    }
  }
}

if (write) {
  const table = (m: Metrics) => `${f(m.highImminentRecall)} | ${f(m.highImminentRecallByLanguage.en)} | ${f(m.highImminentRecallByLanguage.hi)} | ${f(m.highImminentRecallByLanguage.hinglish)} | ${f(m.highImminentFlaggedRecall)} | ${f(m.imminentRecall)} | ${f(m.moderatePlusRecall)} | ${f(m.falseAlarmRateNoneLow)} | ${f(m.hardNegativeSpecificity)} (n=${m.hardNegativeCount}) | ${f(m.accuracy)} | ${f(m.macroF1)}`;
  const lines: string[] = [];
  lines.push("# keyword lexicon v2 vs v1 (dev / heldout)", "");
  lines.push(`Date: ${new Date().toISOString().slice(0, 10)}`, "");
  lines.push("> Synthetic, clinician-unreviewed dataset (see eval/dataset/README.md). Educational tool, not diagnostic. Rules were designed by looking at **dev** items only (eval/splits/split.json). **Heldout** is the honest estimate. Both splits are grouped so variants of one core sentence share a split, but the same author wrote the data and the rules' design context, so even heldout is optimistic versus real student text.", "");
  lines.push("| system | split | n | hi+imm recall | en | hi | hinglish | flagged>=moderate | imminent exact | moderate+ recall | false-alarm (none/low->high+) | hard-neg specificity | accuracy | macro-F1 |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const name of Object.keys(out)) for (const s of splits) lines.push(`| ${name} | ${s} | ${out[name][s].n} | ${table(out[name][s])} |`);
  lines.push("");
  for (const name of Object.keys(out)) {
    for (const s of splits) {
      const m = out[name][s];
      lines.push(`## ${name} ${s}: confusion (rows gold, cols pred: none low moderate high imminent)`, "");
      lines.push(m.confusion.map((r, i) => `${["none", "low", "moderate", "high", "imminent"][i].padEnd(9)} ${r.join("\t")}`).join("\n"), "");
    }
  }
  if (systems.v2) {
    const held = sub(systems.v2, "heldout");
    lines.push("## v2 heldout: worst misses (base sentences)", "", missesTable(worstMisses(held, 15)), "");
    lines.push("## v2 heldout: false alarms (base sentences)", "", missesTable(falseAlarms(held, 10)), "");
  }
  writeFileSync(resolve(ROOT, "eval/results/keyword-v2.md"), lines.join("\n") + "\n", "utf8");
  writeFileSync(resolve(ROOT, "eval/results/keyword-v2.json"), JSON.stringify({ date: new Date().toISOString().slice(0, 10), metrics: out, predictions: systems }, null, 2) + "\n", "utf8");
  console.log("wrote eval/results/keyword-v2.{md,json}");
}
