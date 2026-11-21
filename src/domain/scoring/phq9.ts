/**
 * PHQ-9 (Patient Health Questionnaire-9)
 * Pure domain logic for 9-item depression screening tool.
 *
 * Each item scored 0 to 3:
 * 0 = Not at all, 1 = Several days, 2 = More than half the days, 3 = Nearly every day.
 *
 * Scoring Bands:
 * 0 - 4: Minimal depression
 * 5 - 9: Mild depression
 * 10 - 14: Moderate depression
 * 15 - 19: Moderately severe depression
 * 20 - 27: Severe depression
 *
 * Critical Safety Rule:
 * Item 9 evaluates thoughts of being better off dead or hurting oneself.
 * Any non-zero score on Item 9 (1, 2, or 3) triggers item9Flag and mandatory crisis protocol.
 *
 * Educational disclaimer: This tool is educational, never diagnostic.
 * Reference: Kroenke K, Spitzer RL, Williams JB. The PHQ-9: validity of a brief
 * depression severity measure. J Gen Intern Med. 2001;16(9):606-613.
 */

export type PHQ9ScoreBand =
  | "minimal"
  | "mild"
  | "moderate"
  | "moderately severe"
  | "severe";

export type PHQ9Answers = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface PHQ9Result {
  totalScore: number;
  band: PHQ9ScoreBand;
  item9Score: number;
  item9Flag: boolean;
  requiresCrisisProtocol: boolean;
  disclaimer: string;
}

export const PHQ9_DISCLAIMER =
  "MindSahaay assessments are educational screening tools and do not constitute a clinical diagnosis or medical evaluation. If you are experiencing distress, please reach out to campus counselling services or a qualified mental health professional.";

/**
 * Validates that the input answers array has exactly 9 numbers,
 * each an integer between 0 and 3 inclusive.
 */
export function validatePHQ9Answers(answers: unknown): answers is PHQ9Answers {
  if (!Array.isArray(answers) || answers.length !== 9) {
    return false;
  }
  return answers.every(
    (item) =>
      typeof item === "number" &&
      Number.isInteger(item) &&
      item >= 0 &&
      item <= 3
  );
}

/**
 * Computes PHQ-9 score, band, item 9 safety flag, and crisis protocol requirement.
 * Throws TypeError if inputs are invalid.
 */
export function scorePHQ9(answers: PHQ9Answers | number[]): PHQ9Result {
  if (!validatePHQ9Answers(answers)) {
    throw new TypeError(
      "Invalid PHQ-9 answers: Expected an array of 9 integers, each between 0 and 3 inclusive."
    );
  }

  const totalScore = answers.reduce((sum, score) => sum + score, 0);
  const item9Score = answers[8]; // 9th item (0-indexed)
  const item9Flag = item9Score > 0;

  let band: PHQ9ScoreBand;
  if (totalScore <= 4) {
    band = "minimal";
  } else if (totalScore <= 9) {
    band = "mild";
  } else if (totalScore <= 14) {
    band = "moderate";
  } else if (totalScore <= 19) {
    band = "moderately severe";
  } else {
    band = "severe";
  }

  return {
    totalScore,
    band,
    item9Score,
    item9Flag,
    requiresCrisisProtocol: item9Flag,
    disclaimer: PHQ9_DISCLAIMER,
  };
}

export default scorePHQ9;
