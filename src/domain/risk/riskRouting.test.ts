import { describe, it, expect } from "vitest";
import {
  routeRisk,
  MANDATORY_HELPLINES,
  ROUTING_DISCLAIMER,
} from "./riskRouting";

describe("Risk Routing & Crisis Escalation Domain Logic", () => {
  describe("Safety Rule: PHQ-9 Item 9", () => {
    it("activates crisis card and counsellor alert if item 9 is 1, even if risk level is none", () => {
      const res = routeRisk({ riskLevel: "none", phq9Item9Score: 1 });
      expect(res.action).toBe("crisis_card_plus_counsellor_alert");
      expect(res.showCrisisCard).toBe(true);
      expect(res.alertCounsellor).toBe(true);
      expect(res.rationale).toContain("PHQ-9 Item 9 non-zero score");
    });

    it("activates crisis protocol if item 9 is 2 or 3", () => {
      const res2 = routeRisk({ riskLevel: "low", phq9Item9Score: 2 });
      expect(res2.action).toBe("crisis_card_plus_counsellor_alert");
      expect(res2.showCrisisCard).toBe(true);
      expect(res2.alertCounsellor).toBe(true);

      const res3 = routeRisk("none", 3);
      expect(res3.action).toBe("crisis_card_plus_counsellor_alert");
      expect(res3.showCrisisCard).toBe(true);
      expect(res3.alertCounsellor).toBe(true);
    });

    it("does not override if item 9 is 0", () => {
      const resNone = routeRisk({ riskLevel: "none", phq9Item9Score: 0 });
      expect(resNone.action).toBe("normal_reply");
      expect(resNone.showCrisisCard).toBe(false);
      expect(resNone.alertCounsellor).toBe(false);

      const resMod = routeRisk({ riskLevel: "moderate", phq9Item9Score: 0 });
      expect(resMod.action).toBe("supportive_plus_resources");
      expect(resMod.showCrisisCard).toBe(false);
    });
  });

  describe("Risk Level Triage Routing", () => {
    it("routes 'imminent' risk to crisis_card_plus_counsellor_alert", () => {
      const res = routeRisk("imminent");
      expect(res.action).toBe("crisis_card_plus_counsellor_alert");
      expect(res.showCrisisCard).toBe(true);
      expect(res.alertCounsellor).toBe(true);
      expect(res.rationale.toLowerCase()).toContain("imminent");
    });

    it("routes 'high' risk to crisis_card_plus_counsellor_alert", () => {
      const res = routeRisk({ riskLevel: "high" });
      expect(res.action).toBe("crisis_card_plus_counsellor_alert");
      expect(res.showCrisisCard).toBe(true);
      expect(res.alertCounsellor).toBe(true);
    });

    it("routes 'moderate' risk to supportive_plus_resources", () => {
      const res = routeRisk("moderate");
      expect(res.action).toBe("supportive_plus_resources");
      expect(res.showCrisisCard).toBe(false);
      expect(res.alertCounsellor).toBe(false);
      expect(res.rationale.toLowerCase()).toContain("moderate");
    });

    it("routes 'low' risk to normal_reply", () => {
      const res = routeRisk("low");
      expect(res.action).toBe("normal_reply");
      expect(res.showCrisisCard).toBe(false);
      expect(res.alertCounsellor).toBe(false);
      expect(res.rationale.toLowerCase()).toContain("low");
    });

    it("routes 'none' risk to normal_reply", () => {
      const res = routeRisk("none");
      expect(res.action).toBe("normal_reply");
      expect(res.showCrisisCard).toBe(false);
      expect(res.alertCounsellor).toBe(false);
    });

    it("defaults to 'none' when called with empty or undefined arguments", () => {
      const resDefault = routeRisk();
      expect(resDefault.action).toBe("normal_reply");
      expect(resDefault.showCrisisCard).toBe(false);
      expect(resDefault.alertCounsellor).toBe(false);
    });
  });

  describe("Mandatory Helplines & Safety Information", () => {
    it("always includes Tele-MANAS 14416, KIRAN 1800-599-0019, and Emergency 112", () => {
      const res = routeRisk("imminent");

      const teleManas = res.helplines.find((h) => h.number === "14416");
      expect(teleManas).toBeDefined();
      expect(teleManas?.name).toBe("Tele-MANAS");

      const kiran = res.helplines.find((h) => h.number === "1800-599-0019");
      expect(kiran).toBeDefined();
      expect(kiran?.name).toContain("KIRAN");

      const emergency = res.helplines.find((h) => h.number === "112");
      expect(emergency).toBeDefined();

      expect(MANDATORY_HELPLINES.length).toBe(3);
    });

    it("includes educational non-diagnostic disclaimer in all results", () => {
      const res = routeRisk("high");
      expect(res.disclaimer).toBe(ROUTING_DISCLAIMER);
      expect(res.disclaimer.toLowerCase()).toContain("educational");
      expect(res.disclaimer.toLowerCase()).not.toContain("diagnostic verdict");
    });
  });
});

describe("routeDetectedRisk", () => {
  it("routes by level and notes escalation without lowering the level", async () => {
    const { routeDetectedRisk } = await import("./riskRouting");
    const esc = routeDetectedRisk({ level: "high", escalated: true });
    expect(esc.action).toBe("crisis_card_plus_counsellor_alert");
    expect(esc.rationale).toContain("escalate");
    expect(routeDetectedRisk({ level: "moderate" }).action).toBe("supportive_plus_resources");
    expect(routeDetectedRisk({ level: "none" }, 2).action).toBe("crisis_card_plus_counsellor_alert");
  });
});
