// ==============================================================================
// Clinical Scoring Engine for Standardized Mental Health Instruments
// MindSahaay Platform - India Higher Educational Institutions
// Standards: PHQ-9 (Kroenke et al.), GAD-7 (Spitzer et al.), PHQ-4 (Kroenke et al.)
// Safety Rule: PHQ-9 Item 9 non-zero triggers immediate crisis protocol
// ==============================================================================

import type { AssessmentInstrument, AssessmentResult } from "../_shared/types.ts";

export const EDUCATIONAL_DISCLAIMER =
  "MindSahaay assessments are educational self-reflection tools and do NOT constitute clinical diagnosis, medical evaluation, or psychiatric advice. If you are struggling, please connect with a qualified campus counsellor or mental health professional.";

export function scoreAssessment(
  instrument: AssessmentInstrument,
  answers: number[],
): AssessmentResult {
  switch (instrument) {
    case "phq4":
      return scorePHQ4(answers);
    case "phq9":
      return scorePHQ9(answers);
    case "gad7":
      return scoreGAD7(answers);
    default:
      throw new Error(`Unsupported instrument: ${instrument}`);
  }
}

/**
 * PHQ-4: Ultra-brief 4-item screening tool (2 Anxiety + 2 Depression)
 * Range: 0 to 12.
 * Clinical Cutoffs:
 * - 0 to 2: Normal / None-minimal
 * - 3 to 5: Mild
 * - 6 to 8: Moderate
 * - 9 to 12: Severe
 * Subscales:
 * - Anxiety (Items 1 + 2): score >= 3 suggests positive screen for anxiety
 * - Depression (Items 3 + 4): score >= 3 suggests positive screen for depression
 */
function scorePHQ4(answers: number[]): AssessmentResult {
  if (answers.length !== 4) {
    throw new Error(`PHQ-4 requires exactly 4 answers, received ${answers.length}`);
  }

  const anxietyScore = (answers[0] || 0) + (answers[1] || 0);
  const depressionScore = (answers[2] || 0) + (answers[3] || 0);
  const total = answers.reduce((acc, val) => acc + val, 0);

  let severity = "Normal";
  if (total >= 9) {
    severity = "Severe";
  } else if (total >= 6) {
    severity = "Moderate";
  } else if (total >= 3) {
    severity = "Mild";
  } else {
    severity = "Normal";
  }

  return {
    instrument: "phq4",
    total,
    severity,
    item9_flag: false,
    metadata: {
      anxietyScore,
      depressionScore,
      anxietyScreenPositive: anxietyScore >= 3,
      depressionScreenPositive: depressionScore >= 3,
    },
    disclaimer: EDUCATIONAL_DISCLAIMER,
  };
}

/**
 * PHQ-9: 9-item Patient Health Questionnaire for Depression
 * Range: 0 to 27.
 * Clinical Bands:
 * - 0 to 4: Minimal or None
 * - 5 to 9: Mild
 * - 10 to 14: Moderate
 * - 15 to 19: Moderately Severe
 * - 20 to 27: Severe
 * Item 9: "Thoughts that you would be better off dead, or of hurting yourself in some way"
 * SAFETY PROTOCOL: Item 9 non-zero (> 0) ALWAYS flags crisis protocol
 */
function scorePHQ9(answers: number[]): AssessmentResult {
  if (answers.length !== 9) {
    throw new Error(`PHQ-9 requires exactly 9 answers, received ${answers.length}`);
  }

  const total = answers.reduce((acc, val) => acc + val, 0);
  const item9Value = answers[8] || 0; // 0-indexed: index 8 is Question 9
  const item9Flag = item9Value > 0;

  let severity = "Minimal or None";
  if (total >= 20) {
    severity = "Severe";
  } else if (total >= 15) {
    severity = "Moderately Severe";
  } else if (total >= 10) {
    severity = "Moderate";
  } else if (total >= 5) {
    severity = "Mild";
  } else {
    severity = "Minimal or None";
  }

  const result: AssessmentResult = {
    instrument: "phq9",
    total,
    severity,
    item9_flag: item9Flag,
    metadata: {
      item9Score: item9Value,
      crisisFlag: item9Flag,
    },
    disclaimer: EDUCATIONAL_DISCLAIMER,
  };

  if (item9Flag) {
    result.crisis = true;
    result.crisisProtocol = {
      message:
        "We noticed that you indicated thoughts of self-harm or being better off dead. Your safety is deeply important to us. Please reach out to one of the following 24/7 confidential helplines immediately.",
      helplines: {
        teleManas: "14416",
        teleManasAlt: "1800-891-4416",
        kiran: "1800-599-0019",
        emergency: "112",
      },
    };
  }

  return result;
}

/**
 * GAD-7: 7-item Generalized Anxiety Disorder scale
 * Range: 0 to 21.
 * Clinical Bands:
 * - 0 to 4: Minimal anxiety
 * - 5 to 9: Mild anxiety
 * - 10 to 14: Moderate anxiety
 * - 15 to 21: Severe anxiety
 */
function scoreGAD7(answers: number[]): AssessmentResult {
  if (answers.length !== 7) {
    throw new Error(`GAD-7 requires exactly 7 answers, received ${answers.length}`);
  }

  const total = answers.reduce((acc, val) => acc + val, 0);

  let severity = "Minimal anxiety";
  if (total >= 15) {
    severity = "Severe anxiety";
  } else if (total >= 10) {
    severity = "Moderate anxiety";
  } else if (total >= 5) {
    severity = "Mild anxiety";
  } else {
    severity = "Minimal anxiety";
  }

  return {
    instrument: "gad7",
    total,
    severity,
    item9_flag: false,
    metadata: {
      highAnxietyIndicator: total >= 10,
    },
    disclaimer: EDUCATIONAL_DISCLAIMER,
  };
}
