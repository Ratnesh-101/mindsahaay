/**
 * Statistics for the crisis-classifier evaluation: cluster bootstrap CIs, exact McNemar test,
 * and the safety false-negative list. Pure functions, no I/O, erasable TypeScript only.
 */
import { computeMetrics } from "./common.ts";
import type { Level, Prediction } from "./common.ts";

export const isHighOrImminent = (l: Level): boolean => l === "high" || l === "imminent";

/** Small seeded PRNG (mulberry32) so intervals are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Group (base sentence) of a dataset id. Variant n of a (language,label) cell belongs to base
 * ((n-1) % 14) + 1, the same rule as eval/splits/split.json. Variants of one base sentence are
 * near-duplicates, so the bootstrap resamples whole groups, not single items.
 */
export function groupOf(id: string): string {
  const m = /^(.*)-(\d+)$/.exec(id);
  if (!m) return id;
  const n = Number(m[2]);
  return `${m[1]}-g${String(((n - 1) % 14) + 1).padStart(2, "0")}`;
}

export function recallHighImminent(preds: Prediction[]): number {
  const gold = preds.filter((p) => isHighOrImminent(p.gold));
  if (gold.length === 0) return 0;
  return gold.filter((p) => isHighOrImminent(p.pred)).length / gold.length;
}

export function macroF1(preds: Prediction[]): number {
  return computeMetrics(preds).macroF1;
}

export interface Interval {
  point: number;
  lo: number;
  hi: number;
  /** number of bootstrap replicates used */
  replicates: number;
  /** number of resampling clusters */
  clusters: number;
}

/** Linear-interpolated percentile of an ascending array, p in [0,1]. */
export function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Percentile cluster bootstrap, 95% by default. */
export function bootstrapCI(
  preds: Prediction[],
  metric: (p: Prediction[]) => number,
  opts: { replicates?: number; seed?: number; level?: number } = {},
): Interval {
  const B = opts.replicates ?? 2000;
  const level = opts.level ?? 0.95;
  const rand = mulberry32(opts.seed ?? 20240607);
  const clusters = new Map<string, Prediction[]>();
  for (const p of preds) {
    const g = groupOf(p.id);
    const arr = clusters.get(g);
    if (arr) arr.push(p);
    else clusters.set(g, [p]);
  }
  // Sorted keys keep the result independent of input order.
  const keys = [...clusters.keys()].sort();
  const point = metric(preds);
  if (keys.length === 0) return { point, lo: NaN, hi: NaN, replicates: 0, clusters: 0 };
  const stats: number[] = [];
  for (let b = 0; b < B; b++) {
    const sample: Prediction[] = [];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[Math.floor(rand() * keys.length)];
      for (const p of clusters.get(k) as Prediction[]) sample.push(p);
    }
    stats.push(metric(sample));
  }
  stats.sort((a, b) => a - b);
  const alpha = (1 - level) / 2;
  return { point, lo: quantileSorted(stats, alpha), hi: quantileSorted(stats, 1 - alpha), replicates: B, clusters: keys.length };
}

export interface McNemar {
  /** only A correct */
  aOnly: number;
  /** only B correct */
  bOnly: number;
  /** both correct */
  both: number;
  /** neither correct */
  neither: number;
  /** exact two-sided binomial p-value on the discordant pairs (1 when there are none) */
  p: number;
}

/** Exact two-sided binomial tail: 2 * P(X <= min(b,c)), X ~ Binomial(b+c, 0.5), capped at 1. */
export function mcnemarExactP(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  let term = Math.pow(0.5, n);
  let cum = term;
  for (let i = 1; i <= k; i++) {
    term = (term * (n - i + 1)) / i;
    cum += term;
  }
  return Math.min(1, 2 * cum);
}

/** Paired outcomes by id. Items missing from either list are ignored. */
export function mcnemar(a: Prediction[], b: Prediction[], correct: (p: Prediction) => boolean, filter: (p: Prediction) => boolean = () => true): McNemar {
  const bById = new Map(b.map((p) => [p.id, p]));
  let aOnly = 0;
  let bOnly = 0;
  let both = 0;
  let neither = 0;
  for (const pa of a) {
    const pb = bById.get(pa.id);
    if (!pb || !filter(pa)) continue;
    const ca = correct(pa);
    const cb = correct(pb);
    if (ca && cb) both++;
    else if (ca) aOnly++;
    else if (cb) bOnly++;
    else neither++;
  }
  return { aOnly, bOnly, both, neither, p: mcnemarExactP(aOnly, bOnly) };
}

export interface FalseNegatives {
  /** gold high or imminent items */
  goldCount: number;
  /** of those, predicted below high */
  missedCount: number;
  /** missedCount / goldCount (0 when no gold items) */
  rate: number;
  /** of the misses, predicted none or low (not flagged at all) */
  unflaggedCount: number;
  missed: Prediction[];
}

/** Safety metric: share of gold high/imminent items that were NOT predicted high/imminent. */
export function falseNegativesHighImminent(preds: Prediction[]): FalseNegatives {
  const gold = preds.filter((p) => isHighOrImminent(p.gold));
  const missed = gold.filter((p) => !isHighOrImminent(p.pred)).sort((a, b) => a.id.localeCompare(b.id));
  return {
    goldCount: gold.length,
    missedCount: missed.length,
    rate: gold.length === 0 ? 0 : missed.length / gold.length,
    unflaggedCount: missed.filter((p) => p.pred === "none" || p.pred === "low").length,
    missed,
  };
}
