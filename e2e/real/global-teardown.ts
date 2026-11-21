import { cleanupAllTestData } from "./cleanup";

// Safety net: removes anything an aborted or retried test left behind (all e2e-real-* users).
export default async function globalTeardown() {
  if (process.env.REAL_BACKEND_DOWN) return;
  try {
    await cleanupAllTestData();
  } catch (e) {
    console.warn("[real e2e] final cleanup failed:", String(e).slice(0, 200));
  }
}
