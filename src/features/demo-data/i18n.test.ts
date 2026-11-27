import { describe, it, expect } from "vitest";
import en from "./locales/en.json";
import hi from "./locales/hi.json";

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();
}

describe("demo-data i18n bundles", () => {
  it("en and hi have exactly the same keys", () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
  });

  it("every Hindi string is non-empty and keeps the same interpolation placeholders", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(hi[key].trim().length).toBeGreaterThan(0);
      expect(placeholders(hi[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("the required English wording is present", () => {
    expect(en.load).toBe("Load demo data");
    expect(en.clear).toBe("Clear demo data");
    expect(en.confirmBody).toBe("This removes only the sample data. Your own entries stay.");
  });
});
