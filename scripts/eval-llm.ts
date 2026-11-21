/**
 * LLM-only crisis classifier evaluation (Claude via fetch, forced tool call).
 *
 *   node scripts/eval-llm.ts --split dev --limit 10 --dry-run     estimate only, no key needed
 *   node scripts/eval-llm.ts --split dev --limit 10               small smoke test
 *   node scripts/eval-llm.ts --split heldout --yes                final run (299 calls); headline numbers
 *
 * Flags: --split dev|heldout (default dev), --limit N, --dry-run, --yes (needed above 50 paid calls),
 *        --concurrency N (default 4).
 * Env: ANTHROPIC_API_KEY, optional ANTHROPIC_BASE_URL (mock: http://127.0.0.1:8787), ANTHROPIC_MODEL.
 * Resumable: every reply is appended to eval/results/cache/*.jsonl; a re-run only asks for missing items.
 * Writes eval/results/llm-<split>.{json,md} (eval/results/mock/ when the base URL is not api.anthropic.com).
 */
import { MODEL, PROMPT_HASH } from "./lib/claude.ts";
import { computeMetrics, saveResult } from "./lib/common.ts";
import type { Prediction, SystemResult } from "./lib/common.ts";
import { runLlm } from "./lib/runner.ts";

const run = await runLlm("eval-llm", process.argv.slice(2), { allowReuseFlag: false });
const predictions: Prediction[] = run.items.map((it, i) => {
  const o = run.outcomes[i];
  return {
    id: it.id,
    gold: it.label,
    pred: o.level,
    language: it.language,
    category: it.category,
    text: it.text,
    notes: it.notes,
    latencyMs: o.latencyMs,
    detail: o.parseFailed ? "PARSE_FAILURE (scored as none)" : `confidence=${o.confidence}; ${o.rationale}`,
  };
});

const result: SystemResult = {
  system: "llm",
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
console.log(`llm${run.cfg.mock ? " (MOCK)" : ""} [${run.split}]: accuracy=${m.accuracy.toFixed(3)} macroF1=${m.macroF1.toFixed(3)} high+imminent recall=${m.highImminentRecall.toFixed(3)}`);
