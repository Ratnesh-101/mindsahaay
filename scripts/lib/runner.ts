/**
 * Shared driver for eval-llm.ts and eval-hybrid.ts: CLI flags, split selection, cost estimate,
 * confirmation gate, resumable on-disk cache and ordered results.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ApiError, PROMPT_HASH, baseConfig, classifyWithClaude, costUsd, estimateCall, mapPool, requireConfig } from "./claude.ts";
import type { ClaudeConfig } from "./claude.ts";
import { loadDataset, loadSplit, resultDir } from "./common.ts";
import type { Item, Level, UsageSummary } from "./common.ts";

export interface Cli {
  split: "dev" | "heldout";
  limit: number | null;
  dryRun: boolean;
  yes: boolean;
  concurrency: number;
  /** never call the API: every item must already be cached */
  reuseOnly: boolean;
}

export const CONFIRM_THRESHOLD = 50;

function fail(script: string, msg: string, code = 2): never {
  console.error(`[${script}] ${msg}`);
  process.exit(code);
}

export function parseCli(script: string, argv: string[]): Cli {
  const val = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const known = new Set(["--split", "--limit", "--dry-run", "--yes", "--concurrency", "--reuse-llm"]);
  for (const a of argv) if (a.startsWith("--") && !known.has(a)) fail(script, `Unknown flag ${a}. Flags: --split dev|heldout, --limit N, --dry-run, --yes, --concurrency N${script === "eval-hybrid" ? ", --reuse-llm" : ""}.`);
  const split = val("--split") ?? "dev";
  if (split !== "dev" && split !== "heldout") fail(script, `--split must be dev or heldout (got ${JSON.stringify(split)}).`);
  let limit: number | null = null;
  if (argv.includes("--limit")) {
    const n = Number(val("--limit"));
    if (!Number.isInteger(n) || n < 1) fail(script, "--limit needs a positive integer.");
    limit = n;
  }
  let concurrency = 4;
  if (argv.includes("--concurrency")) {
    const n = Number(val("--concurrency"));
    if (!Number.isInteger(n) || n < 1 || n > 16) fail(script, "--concurrency must be an integer from 1 to 16.");
    concurrency = n;
  }
  return { split, limit, dryRun: argv.includes("--dry-run"), yes: argv.includes("--yes"), concurrency, reuseOnly: argv.includes("--reuse-llm") };
}

const h = (s: string): string => createHash("sha256").update(s).digest("hex");

/** Items of the chosen split in dataset order. --limit picks a deterministic, hash-ordered subset (mixed languages and labels). */
export function selectItems(split: "dev" | "heldout", limit: number | null): { items: Item[]; splitSize: number } {
  const map = loadSplit();
  const all = loadDataset().filter((it) => map[it.id] === split);
  if (limit === null || limit >= all.length) return { items: all, splitSize: all.length };
  const keep = new Set(
    [...all]
      .sort((a, b) => (h(a.id) < h(b.id) ? -1 : 1))
      .slice(0, limit)
      .map((x) => x.id),
  );
  return { items: all.filter((it) => keep.has(it.id)), splitSize: all.length };
}

// ---------------------------------------------------------------- cache

export interface LlmOutcome {
  level: Level;
  confidence: number;
  rationale: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

interface CacheLine extends LlmOutcome {
  key: string;
  id: string;
}

export class ResultCache {
  readonly path: string;
  private map = new Map<string, LlmOutcome>();
  constructor(model: string, mock: boolean) {
    const dir = resolve(resultDir(mock), "cache");
    mkdirSync(dir, { recursive: true });
    const safeModel = model.replace(/[^A-Za-z0-9._-]/g, "_");
    this.path = resolve(dir, `llm-${safeModel}-${PROMPT_HASH}.jsonl`);
    if (existsSync(this.path)) {
      for (const line of readFileSync(this.path, "utf8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const c = JSON.parse(line) as CacheLine;
          if (c.key && typeof c.level === "string") this.map.set(c.key, c);
        } catch {
          /* half-written last line after a crash: ignore, that item will be re-asked */
        }
      }
    }
  }
  static key(text: string): string {
    return h(text).slice(0, 32);
  }
  get(text: string): LlmOutcome | undefined {
    return this.map.get(ResultCache.key(text));
  }
  /** Append immediately so a crash loses at most the in-flight calls. */
  put(id: string, text: string, o: LlmOutcome): void {
    const key = ResultCache.key(text);
    this.map.set(key, o);
    appendFileSync(this.path, JSON.stringify({ key, id, ...o }) + "\n", "utf8");
  }
  get size(): number {
    return this.map.size;
  }
}

// ---------------------------------------------------------------- run

export interface LlmRun {
  cfg: Omit<ClaudeConfig, "apiKey">;
  split: "dev" | "heldout";
  limited: boolean;
  items: Item[];
  /** same order as items */
  outcomes: Array<LlmOutcome & { parseFailed: boolean }>;
  usage: UsageSummary;
}

const money = (v: number): string => `$${v.toFixed(2)}`;

export async function runLlm(script: string, argv: string[], opts: { allowReuseFlag: boolean }): Promise<LlmRun> {
  const cli = parseCli(script, argv);
  if (cli.reuseOnly && !opts.allowReuseFlag) fail(script, "--reuse-llm is only valid for eval-hybrid.");
  const base = baseConfig();
  const { items, splitSize } = selectItems(cli.split, cli.limit);
  const limited = items.length < splitSize;
  const cache = new ResultCache(base.model, base.mock);

  const todo = items.filter((it) => !cache.get(it.text));
  let estIn = 0;
  let estOut = 0;
  for (const it of todo) {
    const e = estimateCall(it.text);
    estIn += e.inputTokens;
    estOut += e.outputTokens;
  }
  const estCost = costUsd(estIn, estOut, base);

  console.log(`${script}: split=${cli.split}${limited ? ` (limited to ${items.length} of ${splitSize})` : ` (${items.length} items)`}  model=${base.model}  prompt=${PROMPT_HASH}`);
  console.log(`  endpoint: ${base.baseUrl}${base.mock ? "   ** MOCK ENDPOINT: results go to eval/results/mock/ **" : ""}`);
  console.log(`  cache: ${items.length - todo.length} cached, ${todo.length} API calls needed`);
  console.log(`  estimate for new calls: ~${estIn} input + ~${estOut} output tokens, ~${money(estCost)} at $${base.priceInPerMTok}/$${base.priceOutPerMTok} per million tokens (assumed prices, estimate only)`);
  if (cli.split === "heldout" && !base.mock) console.log("  HELDOUT: run the final numbers once. Do not change the prompt or the lexicon after seeing them.");

  if (cli.dryRun) {
    console.log("  --dry-run: no API call made.");
    process.exit(0);
  }
  if (cli.reuseOnly && todo.length > 0) fail(script, `--reuse-llm: ${todo.length} items are not in the cache (${cache.path}). Run eval-llm.ts with the same --split/--limit first.`, 3);
  if (todo.length > CONFIRM_THRESHOLD && !cli.yes && !base.mock) {
    fail(script, `${todo.length} paid calls exceed ${CONFIRM_THRESHOLD}. Review the estimate above, then re-run with --yes to confirm.`, 4);
  }

  const cfg = todo.length > 0 ? requireConfig(script) : { ...base, apiKey: "" };
  let newCalls = 0;
  let newIn = 0;
  let newOut = 0;
  let parseFailures = 0;
  const pre = new Map<string, LlmOutcome & { parseFailed: boolean }>();
  const ask = async (it: Item): Promise<LlmOutcome & { parseFailed: boolean }> => {
    const done = pre.get(it.id);
    if (done) return done;
    const hit = cache.get(it.text);
    if (hit) return { ...hit, parseFailed: false };
    const r = await classifyWithClaude(cfg, it.text);
    newCalls++;
    newIn += r.inputTokens;
    newOut += r.outputTokens;
    const o: LlmOutcome = { level: r.level, confidence: r.confidence, rationale: r.rationale, latencyMs: r.latencyMs, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
    if (r.parseFailed) parseFailures++;
    else cache.put(it.id, it.text, o); // unparsed replies are not cached, so a re-run asks again
    return { ...o, parseFailed: r.parseFailed };
  };
  const outcomes = await (async () => {
    // First paid call alone: a bad key or model stops the run after one request, not four.
    const first = todo[0];
    if (first) pre.set(first.id, await ask(first));
    return mapPool(items, cli.concurrency, ask);
  })().catch((e) => {
    if (e instanceof ApiError) {
      console.error(`\n[${script}] ${e.message}`);
      console.error(`[${script}] ${newCalls} calls completed and cached in ${cache.path}.`);
      process.exit(e.fatal ? 5 : 1);
    }
    throw e;
  });

  let inTok = 0;
  let outTok = 0;
  for (const o of outcomes) {
    inTok += o.inputTokens;
    outTok += o.outputTokens;
  }
  const usage: UsageSummary = {
    items: items.length,
    cacheHits: items.length - newCalls,
    newCalls,
    parseFailures,
    inputTokens: inTok,
    outputTokens: outTok,
    costUsd: costUsd(inTok, outTok, base),
    newCostUsd: costUsd(newIn, newOut, base),
    priceInPerMTok: base.priceInPerMTok,
    priceOutPerMTok: base.priceOutPerMTok,
  };
  console.log(`  done: ${newCalls} new calls, ${usage.cacheHits} cached, ${parseFailures} unparsed. Tokens in/out ${inTok}/${outTok}. Cost this run ~${money(usage.newCostUsd)}, all scored items ~${money(usage.costUsd)}.`);
  if (parseFailures > 0) console.log(`  WARNING: ${parseFailures} replies could not be parsed and are scored as "none". Re-run to retry them.`);
  return { cfg: base, split: cli.split, limited, items, outcomes, usage };
}
