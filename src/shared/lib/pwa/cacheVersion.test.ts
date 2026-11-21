import { describe, expect, it } from "vitest";
import { cacheNameFor, computeCacheVersion } from "./cacheVersion";
import helplinesSource from "./helplines.ts?raw";

const LIST = ["/index.html", "/assets/app-abc.js", "/assets/app-abc.css"];
const HELP = 'export const HELPLINES_LAST_VERIFIED = "2026-11-20";\nconst n = "14416";\n';

describe("computeCacheVersion", () => {
  it("is deterministic and order independent", () => {
    expect(computeCacheVersion(LIST, HELP)).toBe(computeCacheVersion([...LIST].reverse(), HELP));
    expect(computeCacheVersion(LIST, HELP)).toBe(computeCacheVersion([...LIST, LIST[0]], HELP));
  });

  it("changes when a helpline number changes", () => {
    expect(computeCacheVersion(LIST, HELP.replace("14416", "14417"))).not.toBe(computeCacheVersion(LIST, HELP));
  });

  it("changes when the verified date changes", () => {
    expect(computeCacheVersion(LIST, HELP.replace("2026-11-20", "2026-12-01"))).not.toBe(
      computeCacheVersion(LIST, HELP),
    );
  });

  it("changes when the precache list changes", () => {
    expect(computeCacheVersion([...LIST, "/assets/new.js"], HELP)).not.toBe(computeCacheVersion(LIST, HELP));
  });

  it("ignores line ending differences", () => {
    expect(computeCacheVersion(LIST, HELP.replace(/\n/g, "\r\n"))).toBe(computeCacheVersion(LIST, HELP));
  });

  it("works on the real helplines source and yields a usable cache name", () => {
    const v = computeCacheVersion(LIST, helplinesSource);
    expect(v).toMatch(/^[0-9a-f]{14}$/);
    expect(cacheNameFor(v)).toBe(`mindsahaay-shell-${v}`);
  });
});
