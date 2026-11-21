import { describe, it, expect } from "vitest";
import { scorePHQ4, validatePHQ4Answers, PHQ4_DISCLAIMER } from "./phq4";

describe("PHQ-4 Scoring Domain Logic", () => {
  describe("validatePHQ4Answers", () => {
    it("returns true for valid 4-item arrays with values between 0 and 3", () => {
      expect(validatePHQ4Answers([0, 0, 0, 0])).toBe(true);
      expect(validatePHQ4Answers([1, 2, 3, 0])).toBe(true);
      expect(validatePHQ4Answers([3, 3, 3, 3])).toBe(true);
    });

    it("returns false for incorrect array lengths", () => {
      expect(validatePHQ4Answers([])).toBe(false);
      expect(validatePHQ4Answers([1, 2, 3])).toBe(false);
      expect(validatePHQ4Answers([1, 2, 3, 0, 1])).toBe(false);
    });

    it("returns false for values out of 0-3 range", () => {
      expect(validatePHQ4Answers([-1, 0, 0, 0])).toBe(false);
      expect(validatePHQ4Answers([0, 4, 0, 0])).toBe(false);
      expect(validatePHQ4Answers([0, 0, 9, 0])).toBe(false);
    });

    it("returns false for non-integer or invalid types", () => {
      expect(validatePHQ4Answers([0.5, 1, 2, 3])).toBe(false);
      expect(validatePHQ4Answers(["0", 1, 2, 3])).toBe(false);
      expect(validatePHQ4Answers([null, 1, 2, 3])).toBe(false);
      expect(validatePHQ4Answers(undefined)).toBe(false);
      expect(validatePHQ4Answers({})).toBe(false);
    });
  });

  describe("scorePHQ4 bands", () => {
    it("classifies scores 0-2 as 'normal'", () => {
      // 0 total
      const res0 = scorePHQ4([0, 0, 0, 0]);
      expect(res0.totalScore).toBe(0);
      expect(res0.band).toBe("normal");
      expect(res0.anxietyFlag).toBe(false);
      expect(res0.depressionFlag).toBe(false);

      // 2 total (anxiety=2, dep=0)
      const res2 = scorePHQ4([1, 1, 0, 0]);
      expect(res2.totalScore).toBe(2);
      expect(res2.band).toBe("normal");
      expect(res2.anxietyFlag).toBe(false);
      expect(res2.depressionFlag).toBe(false);
    });

    it("classifies scores 3-5 as 'mild'", () => {
      // 3 boundary
      const res3 = scorePHQ4([1, 1, 1, 0]);
      expect(res3.totalScore).toBe(3);
      expect(res3.band).toBe("mild");

      // 5 boundary
      const res5 = scorePHQ4([2, 1, 1, 1]);
      expect(res5.totalScore).toBe(5);
      expect(res5.band).toBe("mild");
    });

    it("classifies scores 6-8 as 'moderate'", () => {
      // 6 boundary
      const res6 = scorePHQ4([2, 2, 1, 1]);
      expect(res6.totalScore).toBe(6);
      expect(res6.band).toBe("moderate");

      // 8 boundary
      const res8 = scorePHQ4([2, 2, 2, 2]);
      expect(res8.totalScore).toBe(8);
      expect(res8.band).toBe("moderate");
    });

    it("classifies scores 9-12 as 'severe'", () => {
      // 9 boundary
      const res9 = scorePHQ4([3, 2, 2, 2]);
      expect(res9.totalScore).toBe(9);
      expect(res9.band).toBe("severe");

      // 12 boundary
      const res12 = scorePHQ4([3, 3, 3, 3]);
      expect(res12.totalScore).toBe(12);
      expect(res12.band).toBe("severe");
    });
  });

  describe("scorePHQ4 subscales", () => {
    it("flags anxiety subscale when anxiety score >= 3", () => {
      // items 1 & 2 = 1 + 2 = 3 (flag true)
      const res = scorePHQ4([1, 2, 0, 0]);
      expect(res.anxietyScore).toBe(3);
      expect(res.anxietyFlag).toBe(true);
      expect(res.depressionScore).toBe(0);
      expect(res.depressionFlag).toBe(false);
    });

    it("does not flag anxiety subscale when anxiety score < 3", () => {
      const res = scorePHQ4([1, 1, 2, 2]);
      expect(res.anxietyScore).toBe(2);
      expect(res.anxietyFlag).toBe(false);
    });

    it("flags depression subscale when depression score >= 3", () => {
      // items 3 & 4 = 2 + 1 = 3 (flag true)
      const res = scorePHQ4([0, 0, 2, 1]);
      expect(res.depressionScore).toBe(3);
      expect(res.depressionFlag).toBe(true);
      expect(res.anxietyScore).toBe(0);
      expect(res.anxietyFlag).toBe(false);
    });

    it("flags both subscales when both >= 3", () => {
      const res = scorePHQ4([2, 2, 2, 2]);
      expect(res.anxietyScore).toBe(4);
      expect(res.depressionScore).toBe(4);
      expect(res.anxietyFlag).toBe(true);
      expect(res.depressionFlag).toBe(true);
    });
  });

  describe("safety & disclaimers", () => {
    it("includes educational non-diagnostic disclaimer in result", () => {
      const res = scorePHQ4([0, 0, 0, 0]);
      expect(res.disclaimer).toBe(PHQ4_DISCLAIMER);
      expect(res.disclaimer.toLowerCase()).toContain("educational");
      expect(res.disclaimer.toLowerCase()).not.toContain("diagnostic verdict");
    });

    it("throws a TypeError when invalid inputs are passed", () => {
      expect(() => scorePHQ4([0, 1, 2] as unknown as number[])).toThrow(TypeError);
      expect(() => scorePHQ4([0, 1, 2, 4] as unknown as number[])).toThrow(TypeError);
    });
  });
});
