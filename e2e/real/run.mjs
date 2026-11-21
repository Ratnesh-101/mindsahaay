// Cross-platform launcher for the real-backend suite (cross-env is not installed).
// Sets REAL_E2E=1 so playwright.config.ts registers the "real" project, then runs only that project.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = path.join(root, "node_modules", "@playwright", "test", "cli.js");
const extra = process.argv.slice(2);
const args = [cli, "test", "--project=real", ...(extra.some((a) => a.startsWith("--output")) ? [] : ["--output=test-results-real"]), ...extra];

const res = spawnSync(process.execPath, args, {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, REAL_E2E: "1", E2E_PORT: process.env.E2E_PORT || "5293" },
});
process.exit(res.status ?? 1);
