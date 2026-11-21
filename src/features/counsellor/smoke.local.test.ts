/**
 * Real-stack smoke test of the follow-up API modules against the local Supabase stack.
 * Skipped unless SMOKE_JWT_COUNSELLOR and SMOKE_JWT_STUDENT (tokens signed with the local JWT secret) are set.
 * Needs one risk_events row of event_type 'smoke_test' for student01 (insert it with psql first).
 */
import { describe, expect, it } from "vitest";
import { advanceFollowup, fetchRiskQueue, runOverdueEscalation } from "./api";
import { answerCheckback, fetchMyFollowups } from "../followup/api";

const counsellorJwt = process.env.SMOKE_JWT_COUNSELLOR;
const studentJwt = process.env.SMOKE_JWT_STUDENT;
const enabled = Boolean(counsellorJwt && studentJwt);

/**
 * Seeded auth users cannot use the GoTrue password grant on every local stack, so a session signed with
 * the local JWT secret is written straight into the client's storage. PostgREST still verifies the token.
 */
async function signInWith(jwt: string) {
  const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { sub: string; email: string; exp: number };
  const key = `sb-${new URL(process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321").hostname.split(".")[0]}-auth-token`;
  localStorage.setItem(
    key,
    JSON.stringify({
      access_token: jwt,
      refresh_token: "smoke-refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: payload.exp,
      user: { id: payload.sub, email: payload.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
    }),
  );
}
describe.skipIf(!enabled)("follow-up loop against the local Supabase stack", () => {
  it("runs the whole loop as counsellor then student", { timeout: 30000 }, async () => {
    await signInWith(counsellorJwt!);

    const queue = await fetchRiskQueue();
    const mine = queue.find((e) => e.eventType === "smoke_test");
    expect(mine, "smoke_test event visible in risk_queue").toBeTruthy();
    expect(mine!.offline).toBe(true);
    expect(JSON.stringify(queue)).not.toContain("DO-NOT-SHOW");
    expect(Number.isInteger(await runOverdueEscalation())).toBe(true);

    // Illegal jump is rejected by the database.
    await expect(advanceFollowup(mine!.id, "contacted")).rejects.toBeTruthy();
    const ack = await advanceFollowup(mine!.id, "acknowledged", null, "smoke test");
    expect(ack.step).toBe("acknowledged");
    const after = (await fetchRiskQueue()).find((e) => e.id === mine!.id)!;
    expect(after.currentStep).toBe("acknowledged");
    expect(after.stepTimes.acknowledged).toBeTruthy();

    await signInWith(studentJwt!);
    const state = await fetchMyFollowups(new Date(Date.now() + 80 * 3600 * 1000)); // pretend 80h passed so prompts are due
    const own = state.events.find((e) => e.eventId === mine!.id);
    expect(own?.currentStep).toBe("acknowledged");
    expect(state.alertsShared).toBe(true);
    const prompt = state.prompts.find((p) => p.eventId === mine!.id);
    expect(prompt, "check-back prompt created on acknowledge").toBeTruthy();
    await answerCheckback(prompt!.id, "want_to_talk");
    const reopened = (await fetchMyFollowups()).events.find((e) => e.eventId === mine!.id);
    expect(reopened?.currentStep).toBe("open");
  });
});
