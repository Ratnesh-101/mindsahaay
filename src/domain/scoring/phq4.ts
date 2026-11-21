/**
 * PHQ-4 (Patient Health Questionnaire-4)
 * Pure domain logic for 4-item ultra-brief screening scale for anxiety and depression.
 *
 * Items 1-2: Anxiety subscale (GAD-2)
 * Items 3-4: Depression subscale (PHQ-2)
 * Each item scored 0 to 3:
 * 0 = Not at all, 1 = Several days, 2 = More than half the days, 3 = Nearly every day.
 *
 * Scoring Bands:
 * 0 - 2: Normal
 * 3 - 5: Mild
 * 6 - 8: Moderate
 * 9 - 12: Severe
 *
 * Subscale Flags:
 * Anxiety subscale score >= 3: positive screening for anxiety
 * Depression subscale score >= 3: positive screening for depression
 *
 * Reference: Kroenke K, Spitzer RL, Williams JB, Löwe B. An ultra-brief screening scale for
 * anxiety and depression: the PHQ-4. Psychosomatics. 2009;50(6):613-621.
 *
 * Educational disclaimer: This tool is educational, never diagnostic.
 */

export type PHQ4ScoreBand = "normal" | "mild" | "moderate" | "severe";

export interface PHQ4Result {
  totalScore: number;
  band: PHQ4ScoreBand;
  anxietyScore: number;
  depressionScore: number;
  anxietyFlag: boolean;
  depressionFlag: boolean;
  disclaimer: string;
}

export const PHQ4_DISCLAIMER =
  "MindSahaay assessments are educational screening tools and do not constitute a clinical diagnosis or medical evaluation. If you are experiencing distress, please reach out to campus counselling services or a qualified mental health professional.";

/**
 * Validates that the input answers array has exactly 4 numbers,
 * each an integer between 0 and 3 inclusive.
 */
export function validatePHQ4Answers(
  answers: unknown
): answers is [number, number, number, number] {
  if (!Array.isArray(answers) || answers.length !== 4) {
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
 * Computes PHQ-4 score, subscale scores, flags, and score band.
 * Throws TypeError if inputs are invalid.
 */
export function scorePHQ4(answers: [number, number, number, number] | number[]): PHQ4Result {
  if (!validatePHQ4Answers(answers)) {
    throw new TypeError(
      "Invalid PHQ-4 answers: Expected an array of 4 integers, each between 0 and 3 inclusive."
    );
  }

  const [a1, a2, d1, d2] = answers;
  const anxietyScore = a1 + a2;
  const depressionScore = d1 + d2;
  const totalScore = anxietyScore + depressionScore;

  let band: PHQ4ScoreBand;
  if (totalScore <= 2) {
    band = "normal";
  } else if (totalScore <= 5) {
    band = "mild";
  } else if (totalScore <= 8) {
    band = "moderate";
  } else {
    band = "severe";
  }

  return {
    totalScore,
    band,
    anxietyScore,
    depressionScore,
    anxietyFlag: anxietyScore >= 3,
    depressionFlag: depressionScore >= 3,
    disclaimer: PHQ4_DISCLAIMER,
  };
}

export default scorePHQ4;
