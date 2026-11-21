import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { scoreAssessmentLocally, submitAssessment } from "./assessments";
import { AuthRequiredError, ValidationError } from "./errors";
import { supabase } from "../supabase";
import { testServer, mockSession } from "./testMocks";
import { MANDATORY_HELPLINES } from "../../../domain/risk/riskRouting";

beforeAll(() => testServer.listen());
afterEach(() => {
  testServer.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => testServer.close());

describe("assessments API module", () => {
  describe("scoreAssessmentLocally", () => {
    it("correctly scores PHQ-4 clinical bands", () => {
      // Normal band: score 0-2
      const normal = scoreAssessmentLocally("phq4", [0, 1, 0, 0]);
      expect(normal.severity).toBe("normal");
      expect(normal.total).toBe(1);

      // Mild band: score 3-5
      const mild = scoreAssessmentLocally("phq4", [1, 2, 1, 0]);
      expect(mild.severity).toBe("mild");
      expect(mild.total).toBe(4);

      // Moderate band: score 6-8
      const moderate = scoreAssessmentLocally("phq4", [2, 2, 2, 1]);
      expect(moderate.severity).toBe("moderate");
      expect(moderate.total).toBe(7);

      // Severe band: score 9-12
      const severe = scoreAssessmentLocally("phq4", [3, 3, 2, 2]);
      expect(severe.severity).toBe("severe");
      expect(severe.total).toBe(10);
    });

    it("activates crisis protocol when PHQ-9 Item 9 is non-zero (safety rule)", () => {
      // Item 9 has score of 1 (thoughts of being better off dead)
      const phq9WithSuicidalIdeation = scoreAssessmentLocally("phq9", [1, 1, 1, 1, 1, 1, 1, 1, 1]);
      expect(phq9WithSuicidalIdeation.item9_flag).toBe(true);
      expect(phq9WithSuicidalIdeation.crisis).toBe(true);
      expect(phq9WithSuicidalIdeation.crisisProtocol).toBeDefined();
      expect(phq9WithSuicidalIdeation.crisisProtocol?.helplines.teleManas).toBe("14416");
      expect(phq9WithSuicidalIdeation.crisisProtocol?.helplines.kiran).toBe("1800-599-0019");
      expect(phq9WithSuicidalIdeation.crisisProtocol?.helplines.emergency).toBe("112");

      // Verify helpline numbers match mandatory standards
      expect(MANDATORY_HELPLINES.some((h) => h.number === "14416")).toBe(true);
      expect(MANDATORY_HELPLINES.some((h) => h.number === "1800-599-0019")).toBe(true);
    });

    it("does not activate crisis protocol when PHQ-9 Item 9 is zero", () => {
      const phq9WithoutCrisis = scoreAssessmentLocally("phq9", [1, 1, 1, 1, 1, 1, 1, 1, 0]);
      expect(phq9WithoutCrisis.item9_flag).toBe(false);
      expect(phq9WithoutCrisis.crisis).toBe(false);
      expect(phq9WithoutCrisis.crisisProtocol).toBeUndefined();
    });

    it("rejects invalid question counts or scores outside 0-3", () => {
      // 3 items instead of 4 for PHQ-4
      expect(() => scoreAssessmentLocally("phq4", [1, 2, 1])).toThrow(ValidationError);

      // Item score 4 exceeds max 3
      expect(() => scoreAssessmentLocally("phq4", [4, 0, 1, 0])).toThrow(ValidationError);
    });
  });

  describe("submitAssessment", () => {
    it("throws AuthRequiredError if student session is missing", async () => {
      vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(
        submitAssessment({ instrument: "phq4", answers: [0, 1, 1, 0] }),
      ).rejects.toThrow(AuthRequiredError);
    });

    it("submits assessment to edge function and validates response", async () => {
      vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const res = await submitAssessment({
        instrument: "phq4",
        answers: [1, 2, 1, 1],
      });

      expect(res.success).toBe(true);
      expect(res.assessment).toBeDefined();
      expect(res.assessment.instrument).toBe("phq4");
      expect(res.assessment.total).toBe(5);
    });

    it("guarantees crisis flag when submitting PHQ-9 with non-zero Item 9", async () => {
      vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const res = await submitAssessment({
        instrument: "phq9",
        answers: [1, 1, 1, 1, 1, 1, 1, 1, 2],
      });

      expect(res.assessment.item9_flag).toBe(true);
      expect(res.assessment.crisis).toBe(true);
      expect(res.assessment.crisisProtocol?.helplines.teleManas).toBe("14416");
    });
  });
});
