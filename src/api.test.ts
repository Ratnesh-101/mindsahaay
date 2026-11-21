import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { wellnessApi } from "./api";
import { testServer } from "./shared/lib/api/testMocks";

beforeAll(() => testServer.listen());
afterEach(() => {
  testServer.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => testServer.close());

describe("src/api.ts compat shim & bug fixes", () => {
  describe("Bug Fix 1: Delegating PHQ-4 scoring to src/domain (clinical bands)", () => {
    it("assigns 'normal' band for PHQ-4 score <= 2", async () => {
      const res = await wellnessApi.saveAssessment("student-1", 1, [0, 1, 0, 0]);
      expect(res.success).toBe(true);
      expect(res.assessment.category).toBe("normal");
      expect(res.assessment.anxietyScore).toBe(1);
      expect(res.assessment.depressionScore).toBe(0);
    });

    it("assigns 'mild' band for PHQ-4 score 3-5 (was previously miscategorized)", async () => {
      const res = await wellnessApi.saveAssessment("student-1", 4, [1, 2, 1, 0]);
      expect(res.success).toBe(true);
      expect(res.assessment.category).toBe("mild");
      expect(res.assessment.anxietyScore).toBe(3);
      expect(res.assessment.depressionScore).toBe(1);
    });

    it("assigns 'moderate' band for PHQ-4 score 6-8", async () => {
      const res = await wellnessApi.saveAssessment("student-1", 7, [2, 2, 2, 1]);
      expect(res.success).toBe(true);
      expect(res.assessment.category).toBe("moderate");
      expect(res.assessment.anxietyScore).toBe(4);
      expect(res.assessment.depressionScore).toBe(3);
    });

    it("assigns 'severe' band for PHQ-4 score >= 9", async () => {
      const res = await wellnessApi.saveAssessment("student-1", 10, [3, 3, 2, 2]);
      expect(res.success).toBe(true);
      expect(res.assessment.category).toBe("severe");
      expect(res.assessment.anxietyScore).toBe(6);
      expect(res.assessment.depressionScore).toBe(4);
    });

    it("activates crisis protocol when PHQ-9 item 9 is non-zero", async () => {
      const res = await wellnessApi.saveAssessment("student-1", 12, [1, 1, 1, 1, 1, 1, 1, 1, 2]);
      expect(res.success).toBe(true);
      expect(res.assessment.item9Flag).toBe(true);
      expect(res.assessment.isCrisis).toBe(true);
    });
  });

  describe("Bug Fix 2: Delegating crisis detection to src/domain (multilingual lexicon)", () => {
    it("detects English suicide ideation and includes mandatory helplines", async () => {
      const res = await wellnessApi.sendChat("student-1", "I am thinking about ending my life tonight");
      expect(res.isCrisis).toBe(true);
      const assistantReply = res.messages.find((m) => m.role === "assistant")?.content ?? "";
      expect(assistantReply).toContain("14416");
      expect(assistantReply).toContain("1800-599-0019");
      expect(assistantReply).toContain("112");
    });

    it("detects Hindi/Hinglish crisis phrases previously missed by hardcoded array", async () => {
      const res = await wellnessApi.sendChat("student-1", "Main ab jeena nahi chahta sab khatam ho gaya");
      expect(res.isCrisis).toBe(true);
      const assistantReply = res.messages.find((m) => m.role === "assistant")?.content ?? "";
      expect(assistantReply).toContain("14416");
      expect(assistantReply).toContain("1800-599-0019");
    });

    it("does not false-positive on student idiomatic distress expressions", async () => {
      const res = await wellnessApi.sendChat("student-1", "This mid-term physics exam is killing me");
      expect(res.isCrisis).toBe(false);
    });
  });

  describe("Backward compatibility contract for existing UI features", () => {
    it("supports stories get and like", async () => {
      const stories = await wellnessApi.getStories();
      expect(stories.length).toBeGreaterThan(0);

      const initialLikes = stories[0].likes;
      const updated = await wellnessApi.likeStory(stories[0].id);
      expect(updated[0].likes).toBe(initialLikes + 1);
    });

    it("supports booking appointment", async () => {
      const res = await wellnessApi.bookAppointment("student-1", {
        doctorId: "doc-1",
        doctorName: "Dr. Ananya Roy",
        scheduledFor: "Tomorrow, 4:30 PM",
      });
      expect(res.success).toBe(true);
      expect(res.appointment).toBeDefined();
      expect(res.appointment.doctorName).toBe("Dr. Ananya Roy");
      expect(res.appointment.meetingUrl).toContain("meet.mindsahaay.org");
    });

    it("supports journal save and retrieval", async () => {
      const newEntry = await wellnessApi.saveJournal("student-1", {
        title: "Test Reflection",
        content: "Testing journal compatibility shim.",
        mood: "Reflective",
        prompt: "What went well today?",
      });
      expect(newEntry).toBeDefined();
      expect(newEntry.title).toBe("Test Reflection");

      const journals = await wellnessApi.getJournals("student-1");
      expect(journals.some((j) => j.title === "Test Reflection")).toBe(true);

      await wellnessApi.deleteJournal("student-1", newEntry.id);
      const remaining = await wellnessApi.getJournals("student-1");
      expect(remaining.some((j) => j.id === newEntry.id)).toBe(false);
    });
  });
});
