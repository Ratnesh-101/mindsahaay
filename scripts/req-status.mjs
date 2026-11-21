#!/usr/bin/env node
// Machine check for the requirements traceability matrix in docs/02-srs.md (section 6).
// Plain Node, no dependencies.  Usage:  node scripts/req-status.mjs [--json] [--quiet]
//
// What it checks
//   1. Every implementing path and test path named in a matrix row exists (globs with * allowed).
//   2. "path#text" in the test column: the test file must contain that text (named behaviour).
//   3. Requirement ids are grepped in all test files (informational: how many rows are id-tagged).
//   4. A row claimed Implemented must have at least one existing Vitest or Playwright test file
//      (pgTAP files do not count: they have not been executed), and no open defect:
//      an L<n> or SEC-<nn> reference in the row, or an implementing file listed as an open
//      finding in docs/19-known-limitations.md or docs/23-frontend-security-audit.md.
//   5. Orphan tests: test files that no row references (warning).
//   6. Every requirement id used in the SRS has a matrix row, and the stated "Counts:" line
//      equals the recomputed counts.
// Exit code 1 if any ERROR is found (missing file, unsupported Implemented, count drift ...).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRS = "docs/02-srs.md";
const LIMITS = "docs/19-known-limitations.md";
const SECAUDIT = "docs/23-frontend-security-audit.md";
const args = new Set(process.argv.slice(2));

const PREFIX = {
  "S:": "src/",
  "F:": "src/features/",
  "L:": "src/shared/lib/api/",
  "D:": "src/domain/",
  "SB:": "supabase/",
  "EF:": "supabase/functions/server/",
  "SH:": "supabase/functions/_shared/",
  "T:": "supabase/tests/",
  "E:": "e2e/",
};
const STATUSES = ["Implemented", "Partial", "Not started"];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name === "coverage") continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

const ALL_FILES = [...walk("src"), ...walk("supabase"), ...walk("e2e"), ...walk("utils"), ...walk("public")];
const TEST_RE = /(\.test\.[tj]sx?|\.spec\.[tj]sx?|\.test\.sql)$/;
const TEST_FILES = ALL_FILES.filter((f) => TEST_RE.test(f));
const ROOT_FILES = fs.readdirSync(ROOT).filter((f) => fs.statSync(path.join(ROOT, f)).isFile());

// ---- path handling -------------------------------------------------------------------------

function globToRegExp(g) {
  const esc = g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(`^${esc}$`);
}

/** Turn a backticked token into { pattern, text } or null when it is not a path. */
function toPathToken(raw) {
  let tok = raw.trim();
  let text = null;
  const hash = tok.indexOf("#");
  if (hash > 0) {
    text = tok.slice(hash + 1);
    tok = tok.slice(0, hash);
  }
  let hit = false;
  for (const [p, base] of Object.entries(PREFIX)) {
    if (tok.startsWith(p)) {
      tok = base + tok.slice(p.length);
      hit = true;
      break;
    }
  }
  const mig = /^M(\d{4})$/.exec(tok);
  if (mig) return { pattern: `supabase/migrations/${mig[1]}_*.sql`, text, shown: raw };
  if (!hit && !/^[\w./*-]+\.(ts|tsx|sql|yaml|yml|json|md|toml|mjs|css)$/.test(tok)) return null;
  return { pattern: tok, text, shown: raw };
}

function expand(pattern) {
  if (!pattern.includes("*")) return exists(pattern) ? [pattern] : [];
  const re = globToRegExp(pattern);
  const pool = pattern.startsWith("docs/") || !pattern.includes("/") ? [...ROOT_FILES] : ALL_FILES;
  return pool.filter((f) => re.test(f));
}

function tokens(cell) {
  const out = [];
  for (const m of cell.matchAll(/`([^`]+)`/g)) {
    const t = toPathToken(m[1]);
    if (t) out.push(t);
  }
  return out;
}

// ---- parse the matrix ----------------------------------------------------------------------

function splitRow(line) {
  const cells = [];
  let cur = "";
  let tick = false;
  for (const ch of line) {
    if (ch === "`") tick = !tick;
    if (ch === "|" && !tick) {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells.slice(1, -1).map((c) => c.trim());
}

const srs = read(SRS);
const srsLines = srs.split(/\r?\n/);
const startIdx = srsLines.findIndex((l) => /^##\s+6\.\s+Requirements traceability matrix/i.test(l));
if (startIdx < 0) {
  console.error(`req-status: section "6. Requirements traceability matrix" not found in ${SRS}`);
  process.exit(2);
}
let endIdx = srsLines.findIndex((l, i) => i > startIdx && /^##\s+\d/.test(l));
if (endIdx < 0) endIdx = srsLines.length;
const matrixLines = srsLines.slice(startIdx, endIdx);

const rows = [];
let currentTable = "";
matrixLines.forEach((line, i) => {
  const h = /^###\s+(\d\.\d)/.exec(line);
  if (h) currentTable = h[1];
  const m = /^\|\s*((?:N?FR)-[A-Z0-9]+-\d+)\s*\|/.exec(line);
  if (!m) return;
  const c = splitRow(line);
  rows.push({
    id: m[1],
    table: currentTable,
    line: startIdx + i + 1,
    implCell: c[1] ?? "",
    testCell: c[2] ?? "",
    status: (c[3] ?? "").replace(/\*/g, "").trim(),
    note: c[4] ?? "",
  });
});

const problems = []; // { sev, id, kind, detail }
const add = (sev, id, kind, detail) => problems.push({ sev, id, kind, detail });

// ---- defects from docs 19 and 23 -------------------------------------------------------------

const limits = read(LIMITS);
const limitIds = new Set([...limits.matchAll(/^\|\s*(L\d+)\s*\|/gm)].map((m) => m[1]));
const limitPaths = new Set();
for (const line of limits.split(/\r?\n/)) {
  if (!/^\|\s*L\d+\s*\|/.test(line)) continue;
  for (const m of line.matchAll(/`([^`]+)`/g)) {
    const p = m[1].replace(/:\d+.*$/, "");
    if (/^(src|supabase|utils)\/.+\.\w+$/.test(p)) limitPaths.add(p);
  }
}
const sec = read(SECAUDIT);
const secOpen = new Map(); // SEC id -> paths
const secIds = new Set();
for (const line of sec.split(/\r?\n/)) {
  const m = /^\|\s*\*{0,2}(SEC-\d+)\*{0,2}\s*\|/.exec(line);
  if (!m) continue;
  secIds.add(m[1]);
  const cells = splitRow(line);
  const status = cells[4] ?? "";
  if (!/^Action/i.test(status.replace(/\*/g, ""))) continue;
  const paths = [...(cells[3] ?? "").matchAll(/`([^`]+)`/g)].map((x) => x[1].replace(/:[\d,-]+$/, ""));
  secOpen.set(m[1], paths);
}

// ---- verify rows -----------------------------------------------------------------------------

const referencedTests = new Set();
const idTagged = new Map();
const testContent = new Map();
const content = (f) => {
  if (!testContent.has(f)) testContent.set(f, read(f));
  return testContent.get(f);
};

for (const r of rows) {
  if (!STATUSES.includes(r.status)) add("ERROR", r.id, "bad status", `"${r.status}" is not one of ${STATUSES.join(", ")}`);

  const impl = tokens(r.implCell);
  const tests = tokens(r.testCell);

  const implFiles = [];
  for (const t of impl) {
    const found = expand(t.pattern);
    if (!found.length) add("ERROR", r.id, "missing file", `implementation ${t.pattern}`);
    implFiles.push(...found);
  }

  const goodTests = []; // files that actually count
  for (const t of tests) {
    const found = expand(t.pattern);
    if (!found.length) {
      add("ERROR", r.id, "missing file", `test ${t.pattern}`);
      continue;
    }
    for (const f of found) {
      referencedTests.add(f);
      if (t.text && !content(f).toLowerCase().includes(t.text.toLowerCase()))
        add("ERROR", r.id, "behaviour not found", `"${t.text}" not in ${f}`);
      goodTests.push(f);
    }
  }

  // id grep across every test file
  const tagged = TEST_FILES.filter((f) => content(f).includes(r.id));
  idTagged.set(r.id, tagged);

  const runnable = goodTests.filter((f) => !f.startsWith("supabase/tests/"));
  const pgOnly = goodTests.length > 0 && runnable.length === 0;

  if (r.status === "Implemented") {
    if (runnable.length === 0)
      add("ERROR", r.id, "Implemented but no test file", pgOnly ? "only pgTAP (never executed)" : "no test file named");
    if (implFiles.length === 0) add("ERROR", r.id, "Implemented but no implementing file", "");
    const refs = `${r.implCell} ${r.testCell} ${r.note}`;
    for (const m of refs.matchAll(/\b(L\d+|SEC-\d+)\b/g)) {
      if (secOpen.has(m[1]) || limitIds.has(m[1]))
        add("ERROR", r.id, "Implemented with open defect", `${m[1]} referenced in the row`);
    }
    for (const f of implFiles) {
      if (limitPaths.has(f)) add("ERROR", r.id, "Implemented with open defect", `${f} appears in ${LIMITS}`);
      for (const [sid, ps] of secOpen) if (ps.includes(f)) add("ERROR", r.id, "Implemented with open defect", `${f} in open ${sid}`);
    }
    if (!/Verified:/i.test(r.note)) add("WARN", r.id, "no evidence note", 'Implemented rows should carry "Verified: <what ran>"');
  }
  if (r.status === "Not started" && implFiles.length > 0)
    add("WARN", r.id, "Not started but code named", `${implFiles.length} implementing file(s) listed`);

  for (const m of `${r.implCell} ${r.testCell} ${r.note}`.matchAll(/\b(L\d+)\b/g))
    if (!limitIds.has(m[1])) add("WARN", r.id, "unknown limitation id", `${m[1]} is not in ${LIMITS}`);
  for (const m of `${r.implCell} ${r.testCell} ${r.note}`.matchAll(/\b(SEC-\d+)\b/g))
    if (!secIds.has(m[1])) add("WARN", r.id, "unknown finding id", `${m[1]} is not in ${SECAUDIT}`);
}

// duplicates
const seen = new Set();
for (const r of rows) {
  if (seen.has(r.id)) add("ERROR", r.id, "duplicate row", `line ${r.line}`);
  seen.add(r.id);
}

// orphan tests
for (const f of TEST_FILES) {
  if (!referencedTests.has(f)) add("WARN", "-", "orphan test", f);
}

// requirement ids used elsewhere in the SRS but absent from the matrix
const outside = [...srsLines.slice(0, startIdx), ...srsLines.slice(endIdx)].join("\n");
const defined = new Set([...outside.matchAll(/\b(N?FR-[A-Z0-9]+-\d+)\b/g)].map((m) => m[1]));
for (const id of defined) if (!seen.has(id)) add("ERROR", id, "no matrix row", "id appears in the SRS but not in section 6");
for (const id of seen) if (!defined.has(id)) add("WARN", id, "row not defined in SRS", "matrix id never appears in sections 1-5");

// ---- counts ------------------------------------------------------------------------------------

function count(list) {
  const c = { Implemented: 0, Partial: 0, "Not started": 0, total: list.length };
  for (const r of list) if (r.status in c) c[r.status]++;
  return c;
}
const total = count(rows);
const byTable = { "6.1": count(rows.filter((r) => r.table === "6.1")), "6.2": count(rows.filter((r) => r.table === "6.2")) };
const stated = /Counts:\s*Implemented (\d+), Partial (\d+), Not started (\d+), total (\d+)/.exec(matrixLines.join("\n"));
if (!stated) add("ERROR", "-", "counts line missing", 'add "Counts: Implemented X, Partial Y, Not started Z, total N" to section 6');
else {
  const [, i, p, n, t] = stated.map(Number);
  if (i !== total.Implemented || p !== total.Partial || n !== total["Not started"] || t !== total.total)
    add(
      "ERROR",
      "-",
      "count drift",
      `doc says ${i}/${p}/${n} of ${t}; computed ${total.Implemented}/${total.Partial}/${total["Not started"]} of ${total.total}`,
    );
}

// ---- output ------------------------------------------------------------------------------------

const errors = problems.filter((p) => p.sev === "ERROR");
const warns = problems.filter((p) => p.sev === "WARN");
const taggedRows = [...idTagged.values()].filter((v) => v.length).length;

if (args.has("--json")) {
  console.log(JSON.stringify({ total, byTable, idTaggedRows: taggedRows, problems }, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`Requirements traceability check (${SRS}, ${rows.length} rows)\n`);
  console.log(`Computed counts: Implemented ${total.Implemented}, Partial ${total.Partial}, Not started ${total["Not started"]}, total ${total.total}`);
  for (const [k, v] of Object.entries(byTable))
    console.log(`  ${k}: Implemented ${v.Implemented}, Partial ${v.Partial}, Not started ${v["Not started"]}, total ${v.total}`);
  console.log(`Rows with the requirement id in a test file: ${taggedRows} of ${rows.length}`);
  console.log(`Test files: ${TEST_FILES.length}, referenced by the matrix: ${referencedTests.size}\n`);
  const show = args.has("--quiet") ? errors : problems;
  if (show.length) {
    console.log(`${pad("SEV", 6)}${pad("ID", 15)}${pad("PROBLEM", 36)}DETAIL`);
    console.log("-".repeat(100));
    for (const p of show) console.log(`${pad(p.sev, 6)}${pad(p.id, 15)}${pad(p.kind, 36)}${p.detail}`);
    console.log("");
  }
  console.log(`${errors.length} error(s), ${warns.length} warning(s).`);
}
process.exit(errors.length ? 1 : 0);
