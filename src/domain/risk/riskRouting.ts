/**
 * MindSahaay Risk Routing & Crisis Escalation Protocol
 * Pure domain logic mapping student risk assessments and PHQ-9 Item 9 scores
 * to safe, deterministic operational actions.
 *
 * Rules:
 * - PHQ-9 item 9 non-zero (1, 2, or 3) ALWAYS activates crisis_card_plus_counsellor_alert.
 * - Risk level 'imminent' or 'high' ALWAYS activates crisis_card_plus_counsellor_alert.
 * - Risk level 'moderate' activates supportive_plus_resources.
 * - Risk level 'low' or 'none' routes to normal_reply.
 *
 * Mandatory Helplines (Govt of India):
 * - Tele-MANAS: 14416 / 1800-891-4416 (24/7, 20+ languages)
 * - KIRAN: 1800-599-0019 (DEPwD, 24/7)
 * - Emergency: 112
 *
 * Educational disclaimer: MindSahaay is educational, never diagnostic.
 */

import type { RiskDetectionResult, RiskLevel } from "./lexicon";

export type RiskRoutingAction =
  | "normal_reply"
  | "supportive_plus_resources"
  | "crisis_card_plus_counsellor_alert";

export interface HelplineInfo {
  id: string;
  name: string;
  number: string;
  tollFree?: string;
  description: string;
  availability: string;
  languages: string;
}

export const MANDATORY_HELPLINES: readonly HelplineInfo[] = [
  {
    id: "tele-manas",
    name: "Tele-MANAS",
    number: "14416",
    tollFree: "1800-891-4416",
    description:
      "National Tele Mental Health Programme of India (Ministry of Health & Family Welfare).",
    availability: "24/7 Free & Confidential",
    languages: "Available in 20+ Indian languages and English",
  },
  {
    id: "kiran",
    name: "KIRAN Mental Health Helpline",
    number: "1800-599-0019",
    description:
      "24/7 National toll-free helpline by DEPwD for mental health rehabilitation and crisis support.",
    availability: "24/7 Toll-Free & Confidential",
    languages: "Hindi, English, and 11 Regional Languages",
  },
  {
    id: "emergency",
    name: "National Emergency Helpline",
    number: "112",
    description:
      "All-in-one emergency service for immediate police, ambulance, or medical crisis across India.",
    availability: "24/7 Immediate Emergency Dispatch",
    languages: "Pan-India Multi-lingual",
  },
];

export const ROUTING_DISCLAIMER =
  "MindSahaay is an educational and supportive well-being platform, not a clinical diagnostic tool or medical service provider. If you or someone you know is in immediate danger or distress, please use the helplines or contact emergency services immediately.";

export interface RiskRoutingInput {
  riskLevel?: RiskLevel;
  phq9Item9Score?: number;
}

export interface RiskRoutingResult {
  action: RiskRoutingAction;
  showCrisisCard: boolean;
  alertCounsellor: boolean;
  helplines: HelplineInfo[];
  rationale: string;
  disclaimer: string;
}

/**
 * Maps risk detection level and/or PHQ-9 item 9 score to an actionable triage response.
 *
 * Can be called with:
 * - `routeRisk({ riskLevel: 'imminent', phq9Item9Score: 0 })`
 * - `routeRisk('high')`
 * - `routeRisk('none', 1)`
 */
export function routeRisk(
  inputOrLevel: RiskRoutingInput | RiskLevel = "none",
  item9Override?: number
): RiskRoutingResult {
  let riskLevel: RiskLevel = "none";
  let phq9Item9Score: number | undefined;

  if (typeof inputOrLevel === "string") {
    riskLevel = inputOrLevel;
    phq9Item9Score = item9Override;
  } else if (inputOrLevel && typeof inputOrLevel === "object") {
    riskLevel = inputOrLevel.riskLevel ?? "none";
    phq9Item9Score =
      item9Override !== undefined ? item9Override : inputOrLevel.phq9Item9Score;
  }

  // Mandatory Safety Rule: PHQ-9 item 9 > 0 triggers crisis protocol unconditionally
  if (phq9Item9Score !== undefined && phq9Item9Score > 0) {
    return {
      action: "crisis_card_plus_counsellor_alert",
      showCrisisCard: true,
      alertCounsellor: true,
      helplines: [...MANDATORY_HELPLINES],
      rationale: `PHQ-9 Item 9 non-zero score (${phq9Item9Score}) indicates thoughts of self-harm or being better off dead. Mandatory crisis triage activated.`,
      disclaimer: ROUTING_DISCLAIMER,
    };
  }

  // Triage based on Lexicon Risk Level
  switch (riskLevel) {
    case "imminent":
      return {
        action: "crisis_card_plus_counsellor_alert",
        showCrisisCard: true,
        alertCounsellor: true,
        helplines: [...MANDATORY_HELPLINES],
        rationale:
          "Imminent crisis indicators detected in student interaction. Displaying inescapable crisis card and notifying campus counsellor.",
        disclaimer: ROUTING_DISCLAIMER,
      };

    case "high":
      return {
        action: "crisis_card_plus_counsellor_alert",
        showCrisisCard: true,
        alertCounsellor: true,
        helplines: [...MANDATORY_HELPLINES],
        rationale:
          "High risk self-harm or suicidal ideation detected. Displaying crisis resources and prompting urgent counsellor support.",
        disclaimer: ROUTING_DISCLAIMER,
      };

    case "moderate":
      return {
        action: "supportive_plus_resources",
        showCrisisCard: false,
        alertCounsellor: false,
        helplines: [...MANDATORY_HELPLINES],
        rationale:
          "Moderate emotional distress or feelings of burden/hopelessness detected. Providing empathetic supportive responses and grounding tools.",
        disclaimer: ROUTING_DISCLAIMER,
      };

    case "low":
      return {
        action: "normal_reply",
        showCrisisCard: false,
        alertCounsellor: false,
        helplines: [...MANDATORY_HELPLINES],
        rationale:
          "Low situational stress or academic pressure detected. Providing reassuring companion responses and study/wellness tips.",
        disclaimer: ROUTING_DISCLAIMER,
      };

    case "none":
    default:
      return {
        action: "normal_reply",
        showCrisisCard: false,
        alertCounsellor: false,
        helplines: [...MANDATORY_HELPLINES],
        rationale:
          "No risk indicators detected. Proceeding with standard conversational companion interaction.",
        disclaimer: ROUTING_DISCLAIMER,
      };
  }
}

/**
 * Routes a full lexicon result. Same rules as `routeRisk`; when the lexicon applied its
 * "when unsure, escalate one level" policy the rationale says so for the audit trail.
 * Never lowers a level and never reads the message text.
 */
export function routeDetectedRisk(
  detection: Pick<RiskDetectionResult, "level" | "escalated">,
  phq9Item9Score?: number
): RiskRoutingResult {
  const base = routeRisk(detection.level, phq9Item9Score);
  if (!detection.escalated) return base;
  return {
    ...base,
    rationale: `${base.rationale} (Level was raised one step by the cautious "when unsure, escalate" policy.)`,
  };
}
export default routeRisk;

