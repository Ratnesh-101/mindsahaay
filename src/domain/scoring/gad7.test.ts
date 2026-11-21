import { describe, it, expect } from "vitest";
import { scoreGAD7, validateGAD7Answers, GAD7_DISCLAIMER } from "./gad7";

describe("GAD-7 Scoring Domain Logic", () => {
  describe("validateGAD7Answers", () => {
    it("returns true for valid 7-item arrays with values between 0 and 3", () => {
      expect(validateGAD7Answers([0, 0, 0, 0, 0, 0, 0])).toBe(true);
      expect(validateGAD7Answers([1, 2, 3, 0, 1, 2, 3])).toBe(true);
      expect(validateGAD7Answers([3, 3, 3, 3, 3, 3, 3])).toBe(true);
    });

    it("returns false for incorrect lengths", () => {
      expect(validateGAD7Answers([])).toBe(false);
      expect(validateGAD7Answers([0, 1, 2, 3, 4, 5])).toBe(false); // 6 items
      expect(validateGAD7Answers([0, 1, 2, 3, 0, 1, 2, 3])).toBe(false); // 8 items
    });

    it("returns false for values out of 0-3 range", () => {
      expect(validateGAD7Answers([-1, 0, 0, 0, 0, 0, 0])).toBe(false);
      expect(validateGAD7Answers([0, 0, 0, 4, 0, 0, 0])).toBe(false);
    });

    it("returns false for non-integer or invalid types", () => {
      expect(validateGAD7Answers([0.5, 0, 0, 0, 0, 0, 0])).toBe(false);
      expect(validateGAD7Answers(["1", 0, 0, 0, 0, 0, 0])).toBe(false);
      expect(validateGAD7Answers(null)).toBe(false);
      expect(validateGAD7Answers(undefined)).toBe(false);
    });
  });

  describe("scoreGAD7 bands", () => {
    it("classifies scores 0-4 as 'minimal'", () => {
      // 0 total
      const res0 = scoreGAD7([0, 0, 0, 0, 0, 0, 0]);
      expect(res0.totalScore).toBe(0);
      expect(res0.band).toBe("minimal");

      // 4 boundary
      const res4 = scoreGAD7([1, 1, 1, 1, 0, 0, 0]);
      expect(res4.totalScore).toBe(4);
      expect(res4.band).toBe("minimal");
    });

    it("classifies scores 5-9 as 'mild'", () => {
      // 5 boundary
      const res5 = scoreGAD7([1, 1, 1, 1, 1, 0, 0]);
      expect(res5.totalScore).toBe(5);
      expect(res5.band).toBe("mild");

      // 9 boundary
      const res9 = scoreGAD7([2, 2, 1, 1, 1, 1, 1]);
      expect(res9.totalScore).toBe(9);
      expect(res9.band).toBe("mild");
    });

    it("classifies scores 10-14 as 'moderate'", () => {
      // 10 boundary
      const res10 = scoreGAD7([2, 2, 2, 1, 1, 1, 1]);
      expect(res10.totalScore).toBe(10);
      expect(res10.band).toBe("moderate");

      // 14 boundary
      const res14 = scoreGAD7([2, 2, 2, 2, 2, 2, 2]);
      expect(res14.totalScore).toBe(14);
      expect(res14.band).toBe("moderate");
    });

    it("classifies scores 15-21 as 'severe'", () => {
      // 15 boundary
      const res15 = scoreGAD7([3, 2, 2, 2, 2, 2, 2]);
      expect(res15.totalScore).toBe(15);
      expect(res15.band).toBe("severe");

      // 21 boundary
      const res21 = scoreGAD7([3, 3, 3, 3, 3, 3, 3]);
      expect(res21.totalScore).toBe(21);
      expect(res21.band).toBe("severe");
    });
  });

  describe("safety & disclaimers", () => {
    it("includes educational disclaimer", () => {
      const res = scoreGAD7([0, 0, 0, 0, 0, 0, 0]);
      expect(res.disclaimer).toBe(GAD7_DISCLAIMER);
      expect(res.disclaimer.toLowerCase()).toContain("educational");
    });

    it("throws TypeError on invalid input", () => {
      expect(() => scoreGAD7([0, 1, 2] as unknown as number[])).toThrow(TypeError);
    });
  });
});
