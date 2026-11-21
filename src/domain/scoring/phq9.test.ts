import { describe, it, expect } from "vitest";
import { scorePHQ9, validatePHQ9Answers, PHQ9_DISCLAIMER } from "./phq9";

describe("PHQ-9 Scoring Domain Logic", () => {
  describe("validatePHQ9Answers", () => {
    it("returns true for valid 9-item arrays with values between 0 and 3", () => {
      expect(validatePHQ9Answers([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(true);
      expect(validatePHQ9Answers([1, 2, 3, 0, 1, 2, 3, 0, 1])).toBe(true);
      expect(validatePHQ9Answers([3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(true);
    });

    it("returns false for incorrect lengths", () => {
      expect(validatePHQ9Answers([])).toBe(false);
      expect(validatePHQ9Answers([0, 1, 2, 3])).toBe(false);
      expect(validatePHQ9Answers([0, 1, 2, 3, 0, 1, 2, 3])).toBe(false); // 8 items
      expect(validatePHQ9Answers([0, 1, 2, 3, 0, 1, 2, 3, 0, 1])).toBe(false); // 10 items
    });

    it("returns false for values out of 0-3 range", () => {
      expect(validatePHQ9Answers([-1, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(false);
      expect(validatePHQ9Answers([0, 0, 0, 0, 0, 0, 0, 0, 4])).toBe(false);
      expect(validatePHQ9Answers([0, 0, 0, 0, 10, 0, 0, 0, 0])).toBe(false);
    });

    it("returns false for non-integer or invalid types", () => {
      expect(validatePHQ9Answers([0.5, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(false);
      expect(validatePHQ9Answers(["0", 0, 0, 0, 0, 0, 0, 0, 0])).toBe(false);
      expect(validatePHQ9Answers(null)).toBe(false);
      expect(validatePHQ9Answers(undefined)).toBe(false);
      expect(validatePHQ9Answers({ length: 9 })).toBe(false);
    });
  });

  describe("scorePHQ9 bands", () => {
    it("classifies scores 0-4 as 'minimal'", () => {
      // 0 total
      const res0 = scorePHQ9([0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(res0.totalScore).toBe(0);
      expect(res0.band).toBe("minimal");
      expect(res0.item9Flag).toBe(false);
      expect(res0.requiresCrisisProtocol).toBe(false);

      // 4 boundary (item 9 is 0)
      const res4 = scorePHQ9([1, 1, 1, 1, 0, 0, 0, 0, 0]);
      expect(res4.totalScore).toBe(4);
      expect(res4.band).toBe("minimal");
    });

    it("classifies scores 5-9 as 'mild'", () => {
      // 5 boundary
      const res5 = scorePHQ9([1, 1, 1, 1, 1, 0, 0, 0, 0]);
      expect(res5.totalScore).toBe(5);
      expect(res5.band).toBe("mild");

      // 9 boundary
      const res9 = scorePHQ9([1, 1, 1, 1, 1, 1, 1, 2, 0]);
      expect(res9.totalScore).toBe(9);
      expect(res9.band).toBe("mild");
    });

    it("classifies scores 10-14 as 'moderate'", () => {
      // 10 boundary
      const res10 = scorePHQ9([2, 1, 1, 1, 1, 1, 1, 2, 0]);
      expect(res10.totalScore).toBe(10);
      expect(res10.band).toBe("moderate");

      // 14 boundary
      const res14 = scorePHQ9([2, 2, 2, 2, 2, 2, 2, 0, 0]);
      expect(res14.totalScore).toBe(14);
      expect(res14.band).toBe("moderate");
    });

    it("classifies scores 15-19 as 'moderately severe'", () => {
      // 15 boundary
      const res15 = scorePHQ9([2, 2, 2, 2, 2, 2, 2, 1, 0]);
      expect(res15.totalScore).toBe(15);
      expect(res15.band).toBe("moderately severe");

      // 19 boundary
      const res19 = scorePHQ9([3, 2, 2, 2, 2, 2, 2, 2, 2]);
      expect(res19.totalScore).toBe(19);
      expect(res19.band).toBe("moderately severe");
    });

    it("classifies scores 20-27 as 'severe'", () => {
      // 20 boundary
      const res20 = scorePHQ9([3, 3, 2, 2, 2, 2, 2, 2, 2]);
      expect(res20.totalScore).toBe(20);
      expect(res20.band).toBe("severe");

      // 27 boundary
      const res27 = scorePHQ9([3, 3, 3, 3, 3, 3, 3, 3, 3]);
      expect(res27.totalScore).toBe(27);
      expect(res27.band).toBe("severe");
    });
  });

  describe("Item 9 Safety Protocol", () => {
    it("flags item9Flag and requiresCrisisProtocol when item 9 is 1 even with low total score", () => {
      const res = scorePHQ9([0, 0, 0, 0, 0, 0, 0, 0, 1]);
      expect(res.totalScore).toBe(1);
      expect(res.item9Score).toBe(1);
      expect(res.item9Flag).toBe(true);
      expect(res.requiresCrisisProtocol).toBe(true);
    });

    it("flags item9Flag when item 9 is 2", () => {
      const res = scorePHQ9([0, 0, 0, 0, 0, 0, 0, 0, 2]);
      expect(res.item9Score).toBe(2);
      expect(res.item9Flag).toBe(true);
      expect(res.requiresCrisisProtocol).toBe(true);
    });

    it("flags item9Flag when item 9 is 3", () => {
      const res = scorePHQ9([0, 0, 0, 0, 0, 0, 0, 0, 3]);
      expect(res.item9Score).toBe(3);
      expect(res.item9Flag).toBe(true);
      expect(res.requiresCrisisProtocol).toBe(true);
    });

    it("does not flag item 9 when item 9 is 0 even if other scores are high", () => {
      const res = scorePHQ9([3, 3, 3, 3, 3, 3, 3, 3, 0]);
      expect(res.totalScore).toBe(24);
      expect(res.band).toBe("severe");
      expect(res.item9Score).toBe(0);
      expect(res.item9Flag).toBe(false);
      expect(res.requiresCrisisProtocol).toBe(false);
    });
  });

  describe("safety & disclaimers", () => {
    it("includes educational disclaimer", () => {
      const res = scorePHQ9([0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(res.disclaimer).toBe(PHQ9_DISCLAIMER);
      expect(res.disclaimer.toLowerCase()).toContain("educational");
    });

    it("throws TypeError on invalid input", () => {
      expect(() => scorePHQ9([0, 1, 2] as unknown as number[])).toThrow(TypeError);
    });
  });
});
