import { describe, it, expect } from "vitest";
import { HELPLINES, HELPLINES_LAST_VERIFIED } from "./helplines";

describe("PWA Helplines Safety Registry", () => {
  it("records HELPLINES_LAST_VERIFIED as an ISO date string", () => {
    expect(HELPLINES_LAST_VERIFIED).toBe("2026-11-20");
    expect(new Date(HELPLINES_LAST_VERIFIED).toISOString()).toContain("2026-11-20");
  });

  it("contains all three mandatory Indian government crisis helplines with direct tel: links", () => {
    expect(HELPLINES).toHaveLength(3);

    const teleManas = HELPLINES.find((h) => h.id === "tele-manas");
    expect(teleManas).toBeDefined();
    expect(teleManas?.number).toBe("14416");
    expect(teleManas?.tel).toBe("tel:14416");

    const kiran = HELPLINES.find((h) => h.id === "kiran");
    expect(kiran).toBeDefined();
    expect(kiran?.number).toBe("1800-599-0019");
    expect(kiran?.tel).toBe("tel:18005990019");

    const emergency = HELPLINES.find((h) => h.id === "emergency");
    expect(emergency).toBeDefined();
    expect(emergency?.number).toBe("112");
    expect(emergency?.tel).toBe("tel:112");
  });
});
