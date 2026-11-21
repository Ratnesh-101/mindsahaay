import { backendStatus } from "./env";

// Probes the local stack once. When something is missing, REAL_BACKEND_DOWN is exported to the
// workers and every real test skips itself with "real backend not running, skipped".
export default async function globalSetup() {
  const reason = await backendStatus();
  if (reason) {
    process.env.REAL_BACKEND_DOWN = reason;
    console.warn(`\n[real e2e] real backend not running, skipped: ${reason}\n`);
  } else {
    delete process.env.REAL_BACKEND_DOWN;
  }
}
