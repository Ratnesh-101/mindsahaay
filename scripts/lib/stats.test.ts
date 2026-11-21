/**
 * Unit tests for the evaluation metric code. Run: node --test scripts/lib/stats.test.ts
 * (node:test, no dependencies; expected values computed by hand in the comments).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeMetrics } from "./common.ts";
import type { Level, Prediction } from "./common.ts";
import { bootstrapCI, falseNegativesHighImminent, groupOf, macroF1, mcnemar, mcnemarExactP, recallHighImminent } from "./stats.ts";

function P(id: string, gold: Level, pred: Level, language = "en", category = "x"): Prediction {
  return { id, gold, pred, language, category, text: id, notes: "base" };
}

// Hand-built example, 8 items (classes: none, low, moderate, high, imminent):
//   1 none->none  2 none->low  3 low->low  4 moderate->moderate
//   5 high->high  6 high->moderate  7 imminent->imminent  8 imminent->none
const EX: Prediction[] = [
  P("en-none-001", "none", "none"),
  P("en-none-002", "none", "low"),
  P("en-low-001", "low", "low"),
  P("en-moderate-001", "moderate", "moderate"),
  P("en-high-001", "high", "high"),
  P("en-high-002", "high", "moderate"),
  P("en-imminent-001", "imminent", "imminent"),
  P("en-imminent-002", "imminent", "none"),
];

test("accuracy and per-class precision/recall by hand", () => {
  const m = computeMetrics(EX);
  assert.equal(m.n, 8);
  assert.equal(m.accuracy, 5 / 8); // items 1,3,4,5,7 correct
  // none: tp=1, fn=1 (->low), fp=1 (imminent->none): P=1/2 R=1/2 F1=1/2
  assert.equal(m.perClass.none.precision, 0.5);
  assert.equal(m.perClass.none.recall, 0.5);
  assert.equal(m.perClass.none.f1, 0.5);
  // low: tp=1, fn=0, fp=1: P=1/2 R=1 F1=2/3
  assert.ok(Math.abs(m.perClass.low.f1 - 2 / 3) < 1e-12);
  // moderate: tp=1, fn=0, fp=1 (high->moderate): P=1/2 R=1 F1=2/3
  assert.ok(Math.abs(m.perClass.moderate.f1 - 2 / 3) < 1e-12);
  // high: tp=1, fn=1, fp=0: P=1 R=1/2 F1=2/3
  assert.ok(Math.abs(m.perClass.high.f1 - 2 / 3) < 1e-12);
  // imminent: tp=1, fn=1, fp=0: P=1 R=1/2 F1=2/3
  assert.ok(Math.abs(m.perClass.imminent.f1 - 2 / 3) < 1e-12);
  // macro-F1 = (1/2 + 4 * 2/3) / 5 = 19/30
  assert.ok(Math.abs(m.macroF1 - 19 / 30) < 1e-12);
  assert.ok(Math.abs(macroF1(EX) - 19 / 30) < 1e-12);
});

test("recall on high+imminent counts only high/imminent predictions", () => {
  // gold high/imminent: items 5,6,7,8; predicted high/imminent: 5 and 7 -> 2/4
  assert.equal(recallHighImminent(EX), 0.5);
  assert.equal(computeMetrics(EX).highImminentRecall, 0.5);
  // flagged at moderate or above: 5,6,7 -> 3/4
  assert.equal(computeMetrics(EX).highImminentFlaggedRecall, 0.75);
});

test("false-negative rate lists the specific missed items", () => {
  const fn = falseNegativesHighImminent(EX);
  assert.equal(fn.goldCount, 4);
  assert.equal(fn.missedCount, 2);
  assert.equal(fn.rate, 0.5);
  assert.equal(fn.unflaggedCount, 1); // only imminent-002 -> none
  assert.deepEqual(
    fn.missed.map((p) => p.id),
    ["en-high-002", "en-imminent-002"],
  );
  assert.equal(falseNegativesHighImminent([P("a-none-001", "none", "high")]).rate, 0);
});

test("McNemar exact p-values by hand", () => {
  assert.equal(mcnemarExactP(0, 0), 1);
  assert.equal(mcnemarExactP(3, 3), 1); // 2*P(X<=3 | n=6) = 2*(1+6+15+20)/64 > 1 -> capped
  assert.ok(Math.abs(mcnemarExactP(0, 5) - 0.0625) < 1e-12); // 2 * 0.5^5
  assert.ok(Math.abs(mcnemarExactP(1, 6) - 0.125) < 1e-12); // 2 * (1+7)/128
  assert.ok(Math.abs(mcnemarExactP(2, 8) - 0.109375) < 1e-12); // 2 * (1+10+45)/1024
});

test("McNemar pairs by id and classifies the four cells", () => {
  const ok = (p: Prediction): boolean => p.gold === p.pred;
  const a = [P("1", "high", "high"), P("2", "high", "high"), P("3", "high", "none"), P("4", "high", "none"), P("5", "high", "high")];
  const b = [P("1", "high", "high"), P("2", "high", "none"), P("3", "high", "high"), P("4", "high", "none"), P("6", "high", "high")];
  const r = mcnemar(a, b, ok);
  // ids 1..4 paired: 1 both, 2 A only, 3 B only, 4 neither; ids 5 and 6 unpaired and ignored
  assert.deepEqual([r.both, r.aOnly, r.bOnly, r.neither], [1, 1, 1, 1]);
  assert.equal(r.p, 1);
});

test("group id follows the 14-variant rule", () => {
  assert.equal(groupOf("en-high-001"), "en-high-g01");
  assert.equal(groupOf("en-high-014"), "en-high-g14");
  assert.equal(groupOf("en-high-015"), "en-high-g01");
  assert.equal(groupOf("hinglish-none-036"), "hinglish-none-g08");
});

test("bootstrap CI: degenerate, reproducible and bracketing", () => {
  const perfect = Array.from({ length: 28 }, (_, i) => P(`en-high-${String(i + 1).padStart(3, "0")}`, "high", "high"));
  const ci = bootstrapCI(perfect, recallHighImminent, { replicates: 200 });
  assert.deepEqual([ci.point, ci.lo, ci.hi], [1, 1, 1]);

  // 28 items = 14 groups x 2; half the groups wrong -> point recall 0.5
  const mixed = Array.from({ length: 28 }, (_, i) => {
    const id = `en-high-${String(i + 1).padStart(3, "0")}`;
    return P(id, "high", ((i % 14) + 1) % 2 === 0 ? "none" : "high");
  });
  const a = bootstrapCI(mixed, recallHighImminent, { replicates: 500, seed: 7 });
  const b = bootstrapCI(mixed, recallHighImminent, { replicates: 500, seed: 7 });
  assert.deepEqual(a, b);
  assert.equal(a.point, 0.5);
  assert.equal(a.clusters, 14);
  assert.ok(a.lo < 0.5 && a.hi > 0.5 && a.lo >= 0 && a.hi <= 1);
  // order independence
  const c = bootstrapCI([...mixed].reverse(), recallHighImminent, { replicates: 500, seed: 7 });
  assert.deepEqual(a, c);
});
