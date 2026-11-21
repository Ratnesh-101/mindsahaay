// @vitest-environment node
import { describe, expect, it } from "vitest";
import { redactPII } from "./pii.ts";

describe("redactPII", () => {
  it("returns an empty, unredacted result for empty or non-string input", () => {
    for (const input of ["", undefined as any, null as any, 42 as any]) {
      const r = redactPII(input);
      expect(r.sanitized).toBe("");
      expect(r.hasRedactions).toBe(false);
    }
  });

  it("leaves ordinary text untouched", () => {
    const text = "I am feeling stressed about my exam on 12 March and my CGPA.";
    const r = redactPII(text);
    expect(r.sanitized).toBe(text);
    expect(r.hasRedactions).toBe(false);
  });

  describe("Indian mobile numbers", () => {
    it.each([
      "9876543210",
      "98765 43210",
      "98765-43210",
      "+91 98765 43210",
      "+91-98765-43210",
      "91 9876543210",
      "6123456789",
    ])("redacts %s", (num) => {
      const r = redactPII(`call me on ${num} please`);
      expect(r.sanitized).toBe("call me on [REDACTED_PHONE] please");
      expect(r.redactedTypes.phone).toBe(1);
    });

    it("does not treat a number starting 1-5 as a mobile", () => {
      expect(redactPII("order 1234567890 shipped").redactedTypes.phone).toBe(0);
    });
  });

  describe("emails", () => {
    it("redacts student and personal emails", () => {
      const r = redactPII("mail rahul.sharma+lab@iitm.ac.in or rahul_99@gmail.com");
      expect(r.sanitized).toBe("mail [REDACTED_EMAIL] or [REDACTED_EMAIL]");
      expect(r.redactedTypes.email).toBe(2);
    });
  });

  describe("Aadhaar-like numbers", () => {
    it.each(["2345 6789 0123", "2345-6789-0123", "234567890123"])("redacts %s", (num) => {
      const r = redactPII(`my aadhaar is ${num}`);
      expect(r.sanitized).toBe("my aadhaar is [REDACTED_AADHAAR]");
      expect(r.redactedTypes.aadhaar).toBe(1);
    });

    it("does not redact a 12-digit number starting with 0 or 1", () => {
      expect(redactPII("ref 123456789012").redactedTypes.aadhaar).toBe(0);
    });
  });

  describe("roll and registration numbers", () => {
    it.each(["21BCE1234", "2021CSE0456", "CS21B1234", "ED20B012345"])("redacts %s", (roll) => {
      const r = redactPII(`my roll no is ${roll}`);
      expect(r.sanitized).toBe("my roll no is [REDACTED_ROLL_NO]");
      expect(r.redactedTypes.rollNumber).toBe(1);
    });
  });

  describe("names", () => {
    it("redacts names given in a self-introduction", () => {
      const r = redactPII("Hi, my name is Rahul Sharma and I feel low");
      expect(r.sanitized).toBe("Hi, my name is [REDACTED_NAME] and I feel low");
      expect(r.redactedTypes.name).toBe(1);
    });

    it("redacts Hinglish self-introductions", () => {
      const r = redactPII("Mera naam Priya Nair hai");
      expect(r.sanitized).toBe("Mera naam [REDACTED_NAME] hai");
    });

    it("redacts honorific plus name for staff and professors", () => {
      const r = redactPII("Prof. Iyer shouted at me and Dr Mehta said nothing");
      expect(r.sanitized).toBe("[REDACTED_NAME] shouted at me and [REDACTED_NAME] said nothing");
      expect(r.redactedTypes.name).toBe(2);
    });

    it("does not redact ordinary capitalised words", () => {
      expect(redactPII("My name is hard to say. Monday was bad.").redactedTypes.name).toBe(0);
    });
  });

  it("redacts several kinds at once and counts each", () => {
    const r = redactPII(
      "I am Rahul, email rahul@iitm.ac.in, phone +91 98765 43210, aadhaar 2345 6789 0123, roll 21BCE1234. My name is Rahul Kumar.",
    );
    expect(r.hasRedactions).toBe(true);
    expect(r.redactedTypes).toEqual({ phone: 1, email: 1, aadhaar: 1, rollNumber: 1, name: 1 });
    expect(r.sanitized).not.toMatch(/rahul@|98765|2345|21BCE1234|Kumar/);
  });

  it("is idempotent on already redacted text", () => {
    const once = redactPII("write to a@b.co or 9876543210").sanitized;
    const twice = redactPII(once);
    expect(twice.sanitized).toBe(once);
    expect(twice.hasRedactions).toBe(false);
  });
});
