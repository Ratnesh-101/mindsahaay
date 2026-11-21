/**
 * Evaluates the deterministic lexicon (src/domain/risk/lexicon.ts) on the synthetic dataset.
 * Run: node scripts/eval-keyword.ts
 * Writes eval/results/keyword.json and eval/results/keyword.md.
 */
import { detectRisk } from "../src/domain/risk/lexicon.ts";
import { computeMetrics, loadDataset, saveResult } from "./lib/common.ts";
import type { Prediction, SystemResult } from "./lib/common.ts";

const items = loadDataset();
const predictions: Prediction[] = items.map((it) => {
  const t0 = performance.now();
  const r = detectRisk(it.text);
  const latencyMs = performance.now() - t0;
  return {
    id: it.id,
    gold: it.label,
    pred: r.level,
    language: it.language,
    category: it.category,
    text: it.text,
    notes: it.notes,
    latencyMs,
    detail: r.matches.join("; "),
  };
});

const result: SystemResult = {
  system: "keyword",
  date: new Date().toISOString().slice(0, 10),
  metrics: computeMetrics(predictions),
  predictions,
};
saveResult(result);

const m = result.metrics;
console.log(`keyword: n=${m.n} accuracy=${m.accuracy.toFixed(3)} macroF1=${m.macroF1.toFixed(3)} high+imminent recall=${m.highImminentRecall.toFixed(3)}`);
console.log("Saved eval/results/keyword.json and keyword.md");
