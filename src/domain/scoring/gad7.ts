/**
 * GAD-7 (Generalized Anxiety Disorder-7)
 * Pure domain logic for 7-item anxiety screening tool.
 *
 * Each item scored 0 to 3:
 * 0 = Not at all, 1 = Several days, 2 = More than half the days, 3 = Nearly every day.
 *
 * Scoring Bands:
 * 0 - 4: Minimal anxiety
 * 5 - 9: Mild anxiety
 * 10 - 14: Moderate anxiety
 * 15 - 21: Severe anxiety
 *
 * Reference: Spitzer RL, Kroenke K, Williams JB, Löwe B. A brief measure for assessing
 * generalized anxiety disorder: the GAD-7. Arch Intern Med. 2006;166(10):1092-1097.
 *
 * Educational disclaimer: This tool is educational, never diagnostic.
 */

export type GAD7ScoreBand = "minimal" | "mild" | "moderate" | "severe";

export type GAD7Answers = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface GAD7Result {
  totalScore: number;
  band: GAD7ScoreBand;
  disclaimer: string;
}

export const GAD7_DISCLAIMER =
  "MindSahaay assessments are educational screening tools and do not constitute a clinical diagnosis or medical evaluation. If you are experiencing distress, please reach out to campus counselling services or a qualified mental health professional.";

/**
 * Validates that the input answers array has exactly 7 numbers,
 * each an integer between 0 and 3 inclusive.
 */
export function validateGAD7Answers(answers: unknown): answers is GAD7Answers {
  if (!Array.isArray(answers) || answers.length !== 7) {
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
 * Computes GAD-7 score and band.
 * Throws TypeError if inputs are invalid.
 */
export function scoreGAD7(answers: GAD7Answers | number[]): GAD7Result {
  if (!validateGAD7Answers(answers)) {
    throw new TypeError(
      "Invalid GAD-7 answers: Expected an array of 7 integers, each between 0 and 3 inclusive."
    );
  }

  const totalScore = answers.reduce((sum, score) => sum + score, 0);

  let band: GAD7ScoreBand;
  if (totalScore <= 4) {
    band = "minimal";
  } else if (totalScore <= 9) {
    band = "mild";
  } else if (totalScore <= 14) {
    band = "moderate";
  } else {
    band = "severe";
  }

  return {
    totalScore,
    band,
    disclaimer: GAD7_DISCLAIMER,
  };
}

export default scoreGAD7;
