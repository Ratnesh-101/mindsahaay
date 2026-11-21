# 12 Risk Register

Scale: Likelihood and Impact 1 (low) to 5 (high). Score = L x I. Review weekly.

| ID | Risk | L | I | Score | Mitigation | Owner | Trigger |
|---|---|---|---|---|---|---|---|
| RK-01 | Crisis recall below 0.95 | 3 | 5 | 15 | Hybrid design, larger dataset, iterate on dev set, report honestly if missed | AI lead | Week 10 interim result below 0.90 |
| RK-02 | Prototype security gap (guessable studentId, anon key) persists | 3 | 5 | 15 | Migrate to Auth + RLS first (weeks 3 to 5) | Backend lead | Not done by week 6 |
| RK-03 | Claude API latency, cost or outage | 3 | 3 | 9 | Streaming, timeout fallback, budget cap, local keyword layer | Backend lead | TTFT p95 > 2.5 s in test |
| RK-04 | Ethics approval delayed | 3 | 4 | 12 | Submit by week 4; fall back to expert walkthrough (heuristic evaluation) instead of participants | Project lead | No approval by week 12 |
| RK-05 | No clinical advisor available | 3 | 4 | 12 | Seek psychologist from campus counselling early; label all clinical content "not clinically validated" | Project lead | None by week 3 |
| RK-06 | Participant recruitment shortfall (n < 12) | 3 | 3 | 9 | Start recruiting week 10; incentives not tied to marks | UX lead | n < 6 by week 14 |
| RK-07 | PHQ instrument licensing or Hindi translation issue | 2 | 3 | 6 | Verify terms (TODO), use validated translations only | Project lead | Terms restrict use |
| RK-08 | Scope creep (community, aggregates, native app) | 4 | 3 | 12 | Must/Should/Could; cut Dean aggregates first | Project lead | Slip of > 1 week |
| RK-09 | Single large `App.tsx` slows parallel work and testing | 4 | 3 | 12 | Split into feature modules in weeks 2 to 3 | Frontend lead | Merge conflicts |
| RK-10 | Accessibility debt (Lighthouse < 90) | 3 | 3 | 9 | axe in CI from week 4 | Frontend lead | CI failing |
| RK-11 | Data breach during pilot | 2 | 5 | 10 | Synthetic data in dev, RLS tests, minimal pilot data | Backend lead | Any S1 finding |
| RK-12 | Legal uncertainty (DPDP, minors, cross-border) | 3 | 4 | 12 | Seek supervisor/legal advice; pilot limited to adults | Project lead | Open TODOs in 07 at week 12 |
| RK-13 | Team member unavailability | 3 | 3 | 9 | Pair ownership of each module | Project lead | Absence > 1 week |
| RK-14 | Hinglish dataset quality | 3 | 3 | 9 | Two writers, native-speaker review | AI lead | Kappa < 0.7 (TODO justify threshold) |
| RK-15 | Participant distress during study | 2 | 4 | 8 | Protocol in 09, supervisor on call, helpline card | UX lead | Any distress incident |
| RK-16 | Journal passphrase loss | 3 | 2 | 6 | Warning and optional backup | Frontend lead | User reports |
| RK-17 | Time zone/date errors in booking | 2 | 2 | 4 | Store UTC, display IST | Backend lead | Test failures |
| RK-18 | Overstated claims in report | 2 | 4 | 8 | "Educational, not diagnostic" wording review; unverified items kept as TODO | Project lead | Review finding |
| RK-19 | High or crisis alerts sit unread: the follow-up loop is in-app only, nothing is monitored 24/7 and no counselling service has agreed to answer (L29, HZ-19) | 4 | 5 | 20 | Recorded loop with overdue notifications and a backup counsellor; student card and queue say plainly what the app does not do; helplines always shown; agree a staffed response and clinical sign-off before any pilot | Project lead | No named service or counsellor roster by week 12 |
| RK-20 | The offline queue gives false confidence: students or reviewers think an offline event alerted someone (L38, L39, HZ-20) | 3 | 5 | 15 | Offline banner says nobody is alerted until reconnection; the helplines are the control; demo and report state it; decide on a vault-independent key for crisis items | AI lead | Any slide or text that calls offline mode an alert system |
| RK-21 | Queued data stays on a shared device (DR-08). The erasure part (L49, DR-09) is fixed: the server delete runs first, then the local wipe discards the outbox. Outbox metadata is now inside the encrypted payload | 2 | 4 | 8 | Test on a real shared computer (the real-backend shared-device case passed locally); keep the 7-day purge and the logout dialog | Frontend lead | Any report of queued items readable on a shared device |
| RK-22 | A stale or wrong helpline is served from a cached shell (HZ-23, L28) | 2 | 5 | 10 | One helpline file with a verified date; the cache name hashes it; document an official-source check before each release | Frontend lead | A release without a recorded check |
| RK-23 | The two features work in desktop Chromium only: real phones, iOS Safari and other browsers fail or behave differently (L18, L33, L47) | 4 | 3 | 12 | Test on a low-end Android phone and an iPhone; do not claim mobile support until then; iOS has no Background Sync | UX lead | First real-device test fails |
| RK-24 | Hindi wording of safety text (not-monitored banner, closure reasons, offline banner) is wrong or unclear (L48, docs/27) | 3 | 4 | 12 | Native-speaker review of the list in docs/27 before any pilot | Project lead | List not reviewed by week 12 |
| RK-25 | Parallel feature work regresses shared UI, styles or tests (the dark-theme contrast failures seen during the build) | 3 | 3 | 9 | Re-run axe and the full test suite after any shared-style change; keep the final Playwright run in the release checklist | Frontend lead | Axe or Vitest failures after a merge |
| RK-26 | A reopened crisis event is never escalated again (docs/28 G6-SEC-01, Critical, HZ-25, L50). Fixed in migration 0007 (idempotency per follow-up cycle); pgTAP 12 passes. Kept for tracking; the underlying risk of unread alerts is RK-19 | 2 | 4 | 8 | Re-run all pgTAP (146 tests, files 01 to 14) after any change to the escalation function | Backend lead | Any pgTAP failure in files 10, 12 or 13 |
| RK-27 | Findings of the independent review (docs/28, ten findings, L50) were fixed in code with regression tests; the remaining risk is that the fixes were reviewed by the same team and the review itself was not repeated | 2 | 3 | 6 | Tests tracked in docs/06 TH-28 to TH-32; a mutation sanity check broke three safety-critical lines by hand and the tests caught each; ask for a second independent review | Project lead | Any new High finding |
| RK-28 | Realtime and the other backend pieces behave differently on a hosted Supabase project than on the local stack (empty publication was found only by running the real stack, docs/29, migration 0008) | 3 | 4 | 12 | Run `pnpm test:e2e:real` and all pgTAP against the hosted project before any pilot; check the publication there | Backend lead | First hosted deployment |

Top risks for the supervisor: RK-19, RK-01, RK-02, RK-20, RK-04, RK-05, RK-08, RK-09, RK-12. (RK-19 to RK-28 were added on 2026-11-20 with the follow-up loop and Lifeline Offline. RK-02 is largely addressed in code: identity comes from the JWT and RLS has been executed locally; it stays listed until a hosted deployment and an independent review exist.)
