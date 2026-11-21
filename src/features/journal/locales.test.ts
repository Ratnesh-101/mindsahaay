import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const FEATURES = ["journal", "chat", "cbt", "doctors", "community", "counsellor", "admin"];
const SRC_FEATURES = path.resolve(import.meta.dirname, "..");

function load(feature: string, lng: "en" | "hi"): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(SRC_FEATURES, feature, "locales", `${lng}.json`), "utf8"));
}

function flatten(obj: unknown, prefix = ""): string[] {
  if (Array.isArray(obj)) return [prefix];
  if (obj && typeof obj === "object") {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "locales" ? [] : sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

const COMMON_KEYS = ["common.call", "common.callShort", "common.close", "common.loading", "common.retry", "common.tollFree", "common.available247"];

describe("feature locale bundles", () => {
  it("English and Hindi bundles have identical keys", () => {
    for (const f of FEATURES) {
      expect(flatten(load(f, "hi")).sort(), `${f} hi vs en`).toEqual(flatten(load(f, "en")).sort());
    }
  });

  it("has no empty strings", () => {
    for (const f of FEATURES) {
      for (const lng of ["en", "hi"] as const) {
        const walk = (o: unknown): void => {
          if (typeof o === "string") expect(o.trim().length, `${f}/${lng}`).toBeGreaterThan(0);
          else if (Array.isArray(o)) o.forEach(walk);
          else if (o && typeof o === "object") Object.values(o).forEach(walk);
        };
        walk(load(f, lng));
      }
    }
  });

  it("defines every literal translation key used in source", () => {
    const defined = new Set<string>(COMMON_KEYS);
    for (const f of FEATURES) flatten(load(f, "en")).forEach((k) => defined.add(k));
    const prefixes = new Set<string>();
    defined.forEach((k) => {
      const parts = k.split(".");
      for (let i = 1; i <= parts.length; i++) prefixes.add(parts.slice(0, i).join("."));
    });
    const used: { key: string; file: string }[] = [];
    const dirs = [...FEATURES, "stories", "modals"];
    for (const d of dirs) {
      for (const file of sourceFiles(path.join(SRC_FEATURES, d))) {
        const text = fs.readFileSync(file, "utf8");
        for (const m of text.matchAll(/\bt\(\s*"([A-Za-z0-9_.]+)"/g)) used.push({ key: m[1], file: path.relative(SRC_FEATURES, file) });
      }
    }
    expect(used.length).toBeGreaterThan(100);
    const missing = used.filter((u) => !prefixes.has(u.key));
    expect(missing).toEqual([]);
  });
});
