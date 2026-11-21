/**
 * Hybrid crisis classifier evaluation: final level = the more severe of the deterministic
 * lexicon (src/domain/risk/lexicon.ts) and the Claude classifier (crisis if either is positive).
 *
 *   node scripts/eval-hybrid.ts --split heldout --reuse-llm      no API call; needs eval-llm.ts run first
 *   node scripts/eval-hybrid.ts --split dev --limit 10 --dry-run
 *
 * Flags as eval-llm.ts, plus --reuse-llm (never call the API; every item must be in the cache).
 * The hybrid shares the LLM cache, so after eval-llm.ts it costs nothing even without --reuse-llm.
 * Writes eval/results/hybrid-<split>.{json,md} (eval/results/mock/ for a mock endpoint).
 */
import { detectRisk } from "../src/domain/risk/lexicon.ts";
import { MODEL, PROMPT_HASH } from "./lib/claude.ts";
import { computeMetrics, maxLevel, saveResult } from "./lib/common.ts";
import type { Prediction, SystemResult } from "./lib/common.ts";
import { runLlm } from "./lib/runner.ts";

const run = await runLlm("eval-hybrid", process.argv.slice(2), { allowReuseFlag: true });
const predictions: Prediction[] = run.items.map((it, i) => {
  const o = run.outcomes[i];
  const t0 = performance.now();
  const kw = detectRisk(it.text);
  const kwMs = performance.now() - t0;
  return {
    id: it.id,
    gold: it.label,
    pred: maxLevel(kw.level, o.level),
    language: it.language,
    category: it.category,
    text: it.text,
    notes: it.notes,
    latencyMs: kwMs + o.latencyMs,
    detail: `keyword=${kw.level}; llm=${o.level}; ${o.parseFailed ? "PARSE_FAILURE" : `confidence=${o.confidence}; ${o.rationale}`}`,
  };
});

const result: SystemResult = {
  system: "hybrid",
  model: run.cfg.model || MODEL,
  promptHash: PROMPT_HASH,
  split: run.split,
  mock: run.cfg.mock,
  limited: run.limited,
  usage: run.usage,
  date: new Date().toISOString().slice(0, 10),
  metrics: computeMetrics(predictions),
  predictions,
};
saveResult(result);
const m = result.metrics;
console.log(`hybrid${run.cfg.mock ? " (MOCK)" : ""} [${run.split}]: accuracy=${m.accuracy.toFixed(3)} macroF1=${m.macroF1.toFixed(3)} high+imminent recall=${m.highImminentRecall.toFixed(3)}`);
