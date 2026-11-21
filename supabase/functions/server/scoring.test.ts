// @vitest-environment node
import { describe, expect, it } from "vitest";
import { EDUCATIONAL_DISCLAIMER, scoreAssessment } from "./scoring.ts";

/** Builds an answer array of `len` items whose values (each 0..3) sum to `total`. */
function answersSumming(len: number, total: number): number[] {
  const out = new Array(len).fill(0);
  let left = total;
  for (let i = 0; i < len && left > 0; i++) {
    const v = Math.min(3, left);
    out[i] = v;
    left -= v;
  }
  if (left > 0) throw new Error("total too large for instrument");
  return out;
}

describe("PHQ-4 bands", () => {
  const cases: Array<[number, string]> = [
    [0, "Normal"],
    [2, "Normal"],
    [3, "Mild"],
    [5, "Mild"],
    [6, "Moderate"],
    [8, "Moderate"],
    [9, "Severe"],
    [12, "Severe"],
  ];
  it.each(cases)("total %i is %s", (total, severity) => {
    const r = scoreAssessment("phq4", answersSumming(4, total));
    expect(r.total).toBe(total);
    expect(r.severity).toBe(severity);
    expect(r.item9_flag).toBe(false);
    expect(r.crisis).toBeUndefined();
  });

  it("computes anxiety (items 1-2) and depression (items 3-4) subscales", () => {
    const r = scoreAssessment("phq4", [2, 1, 0, 1]);
    expect(r.metadata).toMatchObject({
      anxietyScore: 3,
      depressionScore: 1,
      anxietyScreenPositive: true,
      depressionScreenPositive: false,
    });
  });

  it("rejects the wrong number of answers", () => {
    expect(() => scoreAssessment("phq4", [0, 0, 0])).toThrow(/exactly 4/);
  });
});

describe("PHQ-9 bands", () => {
  const cases: Array<[number, string]> = [
    [0, "Minimal or None"],
    [4, "Minimal or None"],
    [5, "Mild"],
    [9, "Mild"],
    [10, "Moderate"],
    [14, "Moderate"],
    [15, "Moderately Severe"],
    [19, "Moderately Severe"],
    [20, "Severe"],
    [27, "Severe"],
  ];
  // Total is placed in items 1-8 only so item 9 stays 0 (max 24); 25-27 need item 9.
  it.each(cases.filter(([t]) => t <= 24))("total %i is %s", (total, severity) => {
    const answers = [...answersSumming(8, total), 0];
    const r = scoreAssessment("phq9", answers);
    expect(r.total).toBe(total);
    expect(r.severity).toBe(severity);
    expect(r.item9_flag).toBe(false);
  });

  it("scores the maximum 27 as Severe with item 9 flagged", () => {
    const r = scoreAssessment("phq9", new Array(9).fill(3));
    expect(r.total).toBe(27);
    expect(r.severity).toBe("Severe");
    expect(r.item9_flag).toBe(true);
  });

  it.each([1, 2, 3])("item 9 value %i flags crisis protocol even when the total is minimal", (v) => {
    const r = scoreAssessment("phq9", [0, 0, 0, 0, 0, 0, 0, 0, v]);
    expect(r.severity).toBe("Minimal or None");
    expect(r.item9_flag).toBe(true);
    expect(r.crisis).toBe(true);
    expect(r.crisisProtocol?.helplines).toEqual({
      teleManas: "14416",
      teleManasAlt: "1800-891-4416",
      kiran: "1800-599-0019",
      emergency: "112",
    });
    expect(r.metadata).toMatchObject({ item9Score: v, crisisFlag: true });
  });

  it("does not flag when only other items are non-zero", () => {
    const r = scoreAssessment("phq9", [3, 3, 3, 3, 3, 3, 3, 3, 0]);
    expect(r.item9_flag).toBe(false);
    expect(r.crisis).toBeUndefined();
    expect(r.crisisProtocol).toBeUndefined();
  });

  it("rejects the wrong number of answers", () => {
    expect(() => scoreAssessment("phq9", new Array(8).fill(0))).toThrow(/exactly 9/);
  });
});

describe("GAD-7 bands", () => {
  const cases: Array<[number, string]> = [
    [0, "Minimal anxiety"],
    [4, "Minimal anxiety"],
    [5, "Mild anxiety"],
    [9, "Mild anxiety"],
    [10, "Moderate anxiety"],
    [14, "Moderate anxiety"],
    [15, "Severe anxiety"],
    [21, "Severe anxiety"],
  ];
  it.each(cases)("total %i is %s", (total, severity) => {
    const r = scoreAssessment("gad7", answersSumming(7, total));
    expect(r.total).toBe(total);
    expect(r.severity).toBe(severity);
    expect(r.item9_flag).toBe(false);
  });

  it("sets the high anxiety indicator at 10", () => {
    expect(scoreAssessment("gad7", answersSumming(7, 9)).metadata?.highAnxietyIndicator).toBe(false);
    expect(scoreAssessment("gad7", answersSumming(7, 10)).metadata?.highAnxietyIndicator).toBe(true);
  });

  it("rejects the wrong number of answers", () => {
    expect(() => scoreAssessment("gad7", [1, 1])).toThrow(/exactly 7/);
  });
});

describe("shared behaviour", () => {
  it("always carries the educational, non-diagnostic disclaimer", () => {
    for (const [instrument, len] of [["phq4", 4], ["phq9", 9], ["gad7", 7]] as const) {
      const r = scoreAssessment(instrument, new Array(len).fill(0));
      expect(r.disclaimer).toBe(EDUCATIONAL_DISCLAIMER);
      expect(r.disclaimer).toMatch(/do NOT constitute clinical diagnosis/);
    }
  });

  it("throws for an unknown instrument", () => {
    expect(() => scoreAssessment("beck" as any, [])).toThrow(/Unsupported instrument/);
  });
});
