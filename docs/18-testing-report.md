# 18 Testing Report

Date of runs: 2026-11-20 (earlier figures from 2026-11-18 and 2026-11-19 are marked as such). Final reconciliation on 2026-11-20 after the Crisis Follow-Through Loop (docs/24), Lifeline Offline (docs/25, 26), the independent review fixes (docs/28) and the real-backend suite (docs/29). The headline figures below were measured by the lead at the end of the day; per-area coverage and a few details were measured earlier and are marked. Machine: Windows, Node from the WinGet OpenJS package, project at the repository root. Nothing was estimated.

## 0. Quality gates at a glance (2026-11-27, after the chat-persistence and synced-blobs change set)

| Gate | Result |
|---|---|
| TypeScript (`pnpm typecheck`) | 0 errors |
| ESLint (`npx eslint src`) | 0 errors, 0 warnings (clean across src and e2e) |
| Vitest unit and integration tests | **950 passed, 1 skipped** in 86 files (85 files passed, 1 skipped). The skipped test is the live smoke test `smoke.local.test.ts`, which needs JWT tokens. 0 failed. One transient Vitest flake (7 timeouts under load) occurred once and did not reproduce in 2 reruns |
| Playwright end to end and accessibility (Chromium) | **102 passed** (102/102 re-run 2026-11-27) with `npx playwright test`: 93 in the `chromium` project (57 axe combinations plus journeys, smoke and offline-UI specs; demo mode) and 9 in the `pwa` project (production build) |
| Axe accessibility | 14 routes x light/dark x 1280px/375px = 57 combinations tested; serious and critical violations: **0** |
| Line coverage (Vitest, V8) | **Lines 91.83%**, statements 89.79%, branches 81.86%, functions 87.17% (over the configured scope, see 1.3). The thresholds in `vitest.config.ts` are enforced and pass |
| pgTAP database tests | **17 files, 231 tests, all passing** on a local Supabase (CLI 3.2.0, Docker), migrations 0001 to 0010. Hosted Supabase not tried |
| Real-backend browser checks (`pnpm test:e2e:real`, Chromium, local Supabase) | **36 passed (36/36)** against the local Supabase stack (including chat-persistence 9, blob-sync 3, fresh-account, demo-data, persistence, preview-flag, sign-in, follow-up loop, offline outbox, shared-device). Details in section 6 and docs/29, docs/33 |

What these gates do **not** show: anything about a hosted deployment, the Claude and Daily.co routes, performance under load, Lighthouse scores, OWASP ZAP results, browsers other than Chromium, installation or offline use on a real phone, or any real user.

## 1. Vitest

### 1.1 Command

```powershell
npx vitest run --coverage
```

(`pnpm test:cov` runs the same thing.) Vitest 5.1.1, V8 coverage, jsdom environment.

### 1.2 Result (final, 2026-11-27)

| Measure | Value |
|---|---|
| Test files | 85 passed, 1 skipped (86) |
| Tests | **950 passed, 1 skipped (951), 0 failed** |
| Duration | TODO (not recorded in the final run) |

The count includes `supabase/functions/**/*.test.ts` (188 edge-function tests). These run in Node against mocks; separately, the edge function was exercised on the real Deno edge runtime, see section 6 and doc 22. One transient Vitest flake (7 timeouts under load) occurred once during high concurrency and did not reproduce in two subsequent reruns; recorded here honestly.

One harmless message appears during the run: `Not implemented: navigation to another Document` (jsdom does not implement page navigation; the exact test that triggers it was not identified). It is not a failure.

### 1.3 Coverage summary (final, 2026-11-27)

| Metric | Value |
|---|---:|
| Statements | 89.79% |
| Branches | 81.86% |
| Functions | 87.17% |
| Lines | 91.83% |

The thresholds in `vitest.config.ts` are enforced and pass.

**Scope of the coverage number.** `vitest.config.ts` measures only `src/domain/**` and `src/features/**` (excluding tests, `.d.ts` and `index.ts`). It does **not** include `src/app/`, `src/shared/lib/`, `src/shared/ui/` or the legacy `src/api.ts`, so the headline numbers overstate whole-application coverage. The configured gate is lines at least 80%, and it passes.

### 1.4 Coverage by area (from the 2026-11-19 run except the rows marked 2026-11-20, which were re-measured after the new features; lines %, branches %)

Rows for `features/counsellor`, `features/chat`, `features/crisis`, `domain/risk`, and the new `features/followup` and `features/offline-ui` were measured earlier on 2026-11-20 (before the final run). The other rows are from 2026-11-19. None was re-measured per area in the final run, so treat the per-area figures as approximate; the totals in 1.3 are final.

| Area | Lines | Branches | Remark |
|---|---:|---:|---|
| domain/crypto (`journalCrypto.ts`) | 81.57 | 87.17 | |
| domain/risk (`lexicon.ts`, `riskRouting.ts`) (2026-11-20) | 100 | 93.37 | `lexicon.ts` 94.3 branches, `riskRouting.ts` 86.95 |
| features/admin | 100 | 92.94 | |
| features/assessment | 80 | 71.21 | |
| features/auth | 80 | 68.05 | |
| features/cbt | 93.58 | 85.86 | |
| features/chat (2026-11-20) | 94.26 | 89.28 | Includes the offline logging path |
| features/followup (2026-11-20, new) | 98.8 | 81.81 | Student status card and check-back answers |
| features/offline-ui (2026-11-20, new) | 95.97 | 90.58 | Chip, banner, logout dialog, update toast |
| features/community | 95.17 | 77.72 | |
| features/consent | 82.85 | 51.78 | |
| features/counsellor (2026-11-20) | 98.29 | 88.4 | `RiskQueue.tsx` lines 100, branches 96.42 |
| features/crisis (2026-11-20) | 90.66 | 61.9 | Safety-relevant, still the weakest branch coverage |
| features/dashboard | **0** | 0 | Static portals, `Dashboard.tsx`, `EmotionExplorer`, `DailyMicroHabits`: no tests |
| features/doctors | 93.71 | 75.88 | |
| features/insights | **0** | 0 | No tests |
| features/journal | 86.29 | 75.36 | |
| features/modals | 64.48 | 75.71 | `SosModal`, `SafetyCardModal`, `PrivacyModal`, `TermsModal`, `NotificationModal`, `BalanceDetailModal` at 0% in Vitest (the SOS dialog and safety card are exercised by Playwright and by the browser check of SEC-03) |
| features/mood | 84.84 | 58.33 | |
| features/navigation | 71.79 | 56.06 | |
| features/onboarding | 84.78 | 72.22 | |
| features/settings | 83.13 | 74.57 | |
| features/stories | 76.19 | 86 | |

The coverage scope does not include `src/shared/lib/**` or `src/app/**`, so the new offline code (`src/shared/lib/offline`, `src/shared/lib/pwa`) is not in the coverage totals. The offline worker reported 91.13% line coverage for `src/shared/lib/offline/` from its own run; that number was not re-measured here.

Targets in NFR-QUAL-01: lines at least 80% overall (**met**, within the measured scope) and 100% of crisis-module branches (**not met**: lexicon 94.3% at the 2026-11-19 measurement, riskRouting 86.95% and CrisisPage 61.9% re-measured on 2026-11-20).

### 1.5 Test inventory

The per-file counts of the earlier 345-test run are stale and have been removed. The suite now has 950 passing tests (1 skipped) in 86 files. Run `npx vitest run --reporter=verbose` for the current per-file list. Main groups: domain (lexicon v1 and v2, scoring, routing, crypto), feature components, shared API client modules, the secure local store (`src/shared/lib/storage/secureStore.test.ts`), the edge function (`supabase/functions/**`, 188 tests), the offline outbox and UI, and the new Wave 3 chat persistence (`history.test.ts`, `chatCrypto.test.ts`, `ChatPersistence.test.tsx`, `ChatHistoryIntegration.test.tsx`) and synced encrypted blobs (`remoteSync.test.ts`, `SyncUi.test.tsx`).

Everything in Vitest is unit or component level with mocked network calls (MSW and Vitest mocks). **No Vitest test talks to a real Supabase, Postgres, Edge Function or Claude API.** Real-backend evidence comes from pgTAP (section 2) and the manual checks in section 6.

## 2. pgTAP database tests (executed 2026-11-19 and 2026-11-20, updated 2026-11-27)

On a local Supabase (`supabase start`, CLI 3.2.0, Docker): migrations 0001 to 0010 and `seed.sql` apply, 29 tables exist with RLS enabled on all of them, and all 17 files `supabase/tests/01` to `17` pass: **231 tests, 0 failed** (2026-11-27; the 146 tests of files 01 to 14, 38 of file 15, and the 47 tests of files 16 and 17: `16_chat_persistence.test.sql` and `17_encrypted_blobs.test.sql`) (`npx --yes supabase test db`). Per file (plan counts): 01 12, 02 6, 03 5, 04 7, 05 4, 06 13, 07 10, 08 15, 09 15, 10 14, 11 22, 12 9, 13 10, 14 4, 15 38, 16 25, 17 22. Files 12 and 13 (19 tests) are regression tests for the independent review (docs/28), written before migration 0007 and failing first (6 and 9 failures on the pre-fix schema); they pass now. File 14 checks that migration 0008 puts `risk_events`, `risk_followups` and `notifications` in the realtime publication. Files 16 and 17 verify chat persistence schema and encrypted blob sync RPC security and isolation.

The three files added with the follow-up loop (08 to 10, 44 tests) cover: the first `open` step for high and crisis events only; every illegal step jump refused; closure reasons; the event marked resolved only on `closed`; h24 and h72 prompts created on `acknowledged`; a student cannot update or resolve their own event (the old hole, TH-21); a counsellor with a care share can; cross-user isolation of follow-ups, prompts and answers; a counsellor without a share cannot call `advance_risk_followup`; answers are append-only and one per prompt; a "want to talk" answer reopens and notifies; an offline event with a past `created_at` gets the server time; level 1 and level 2 escalation with idempotency, generic text and audit rows; `risk_queue` filtering. File 11 (`11_warm_handoff_and_optout.test.sql`, 22 tests) covers migration 0006: server-side check-back opt-out (a student cannot change another student's flag or their own role through it; counsellors are refused), and the warm handoff (offer only by a counsellor with a current care share and only of their own future unbooked slot; duplicate offers refused; accept books once; replay and decline-after-accept refused; another student cannot accept the offer). The pgTAP assertions that are not listed here were not read line by line by the documentation worker.

Running the SQL found 7 defects that the earlier read-only audit missed (doc 21, findings 22 to 28): a permission error on `auth.users`, the trusted-backend trigger bypass, two RLS infinite recursions (`profiles`/`counsellors` and `circles`/`circle_members`), invalid test UUIDs and an outdated `config.toml`. All were fixed.

Not done: a run on a hosted Supabase project, and the `pgtap.yml` workflow on a real CI runner.

## 3. What has NOT been run

| Check | State | Why | What is needed |
|---|---|---|---|
| **Hosted Supabase** (migrations, RLS, function deployment) | **Not tried** | No hosted project exists | Follow 17-deployment-guide.md on a demo project |
| **Real-device PWA install and offline use** (Android Chrome, iOS Safari) | **Not done** | Only desktop Chromium with `setOffline` was used | Test on at least one low-end Android phone and one iPhone |
| **Background Sync** | **Not functional, not tested** | A tag is registered but `public/sw.js` has no `sync` handler (L39) | Add a handler or remove the registration; decide how a flush can work without the vault key |
| **`pg_cron` overdue job** | **Not verified** | Extension absent or not exercised locally (L46) | Check on a hosted project; the queue also calls the function when opened |
| **Concurrent follow-up calls** | **Not tested** | No concurrency test for `advance_risk_followup` or `escalate_overdue_risk` | Two parallel sessions against a local stack |
| **Service worker cache cleanup on activation** | **Not tested end to end** | Needs two builds in one run (docs/26) | Verify by hand on release |
| **Warm handoff and server-side check-back opt-out in a real browser** | **pgTAP only** | pgTAP file 11 passes (22 tests); no browser check of the offer and accept screens is recorded in this report | A two-browser run, ideally a `real` Playwright spec |
| **Independent-review fixes** (docs/28) | **Done** | Migration 0007 and the app-code fixes landed; pgTAP files 12 and 13 pass (19 tests) | Re-check after any change to the escalation functions |
| **Final run of the `real` Playwright project** | **Done: 36 passed** | 36 specs passing in `e2e/real` (sign-in, follow-up loop, offline outbox, shared device, fresh account, demo data, persistence, preview flag, chat-persistence 9, blob-sync 3); Chromium only | Add a spec for the handoff flow |
| **Claude chat route** | **Not verified** | Needs `ANTHROPIC_API_KEY` | A human with a key; then run the LLM evaluation |
| **Daily.co video tokens** | **Not verified** | Needs `DAILY_API_KEY` | A human with a key |
| **`pg_cron` retention job** | **Not verified** | Not available or not exercised locally | Check on a hosted project |
| **Lighthouse** (NFR-PERF-01) | **Not run** | Not set up | Lighthouse CI on a deployed or preview build |
| **OWASP ZAP** or any dynamic security scan (NFR-SEC-01) | **Not run** | Needs a running deployment | ZAP baseline against a staging URL |
| **`pnpm audit`** | **Not run** | Not done yet | `pnpm audit` |
| **LLM crisis evaluation** (LLM-only, hybrid) | **PENDING** | Needs a human with `ANTHROPIC_API_KEY`; the scripts were verified against a mock server only | Commands in 11-ai-evaluation-plan.md section 0.5 |
| **Load test** (TTFT, API latency; NFR-PERF-02, -03) | **Not run** | Not set up | k6 against staging |
| **Manual accessibility audit** (keyboard, NVDA, contrast; NFR-A11Y) | **Not done** | Human task. The automated axe checks pass but do not replace it | Follow the checklist in 10-test-plan.md |
| **Cross-browser and low-end Android** (NFR-COMP-01) | **Not done** | Only Chromium was tested | Add Firefox and WebKit projects; test real devices |
| **GitHub Actions workflows** (`ci.yml`, `e2e.yml`, `security.yml`, `pgtap.yml`, `eval-nightly.yml`) | **Never run on a real runner** | The project is not in a git repository yet | Create the repository and push |
| **Usability study, SUS** (NFR-USAB-01), survey, interviews | **Not done** | Needs participants and ethics approval (09) | Student task |
| **Ethics approval, clinical advisor sign-off** | **Not obtained** | Human tasks | Student task |

## 4. Keyword crisis evaluation (separate from unit tests)

These are measurements of the deterministic lexicon on a synthetic dataset, run on 2026-11-18, taken from `eval/results/` and unchanged since:

| System | Split | High+imminent recall | Hard-negative specificity |
|---|---|---:|---:|
| Keyword v1 | heldout | 0.300 | 0.800 |
| Keyword v2 | heldout | 0.700 | 1.000 |
| Keyword v2 | dev | 0.975 (overfit, do not quote) | 1.000 |

The heldout recall of 0.70 is below the 0.95 target. Details and limits are in 11-ai-evaluation-plan.md. The server-side lexicon is generated from `src/domain/risk/lexicon.ts` (`scripts/sync-lexicon.mjs`, hash-checked) and agrees with the client on all 600 dataset rows, so these numbers also describe the server keyword layer. LLM-only and hybrid results are still PENDING.

## 5. End to end and accessibility (Playwright, 2026-11-20)

**Final result.** `npx playwright test` on 2026-11-20: **102 passed**. That is 93 in the `chromium` project (57 axe combinations, plus journeys, smoke and offline-UI specs) and 9 in the `pwa` project. The opt-in `real` project (docs/29, 5 passed) is counted separately in section 6. Chromium only. The paragraphs below describe the earlier 88-test run and are kept for the journey list.

**QA note.** While several workers changed UI and CSS in parallel, the dark-theme axe `color-contrast` checks failed in 5 to 7 combinations (`/stories`, `/insights`, `/consent`, `/settings`, and `/insights` at 375px; the `.trend` colour on `/insights` was the last one) in two workers' interim runs. They were fixed before the final run. The lesson is that the axe suite has to be re-run after any change to shared styles, not only after changes to the page being edited.

Run with `npx playwright test` (Chromium only; Playwright starts `vite` on port 5199 with `VITE_DEMO_MODE=true`, no backend needed). Specs live in `e2e/`: `smoke.spec.ts`, `journeys.spec.ts`, `a11y.spec.ts`.

**Earlier run, before the new features: 88 of 88 passing, 0 failed, nothing skipped**: 12 smoke, 19 journeys, 57 axe combinations. This supersedes the earlier 47 passed with 39 skipped (`test.fixme`) and the 86 figure.

Journeys covered: demo login and role picker, DPDP consent toggles (opt-in defaults, 18+ and core-consent gates), mood check-in and distress alert, PHQ-9 item 9 crisis card (14416, 1800-599-0019, 112, shown before any score), SOS button in the same position on every main route, chat crisis card with no close control, Hindi language switch, theme toggle, keyboard Tab to SOS, 404 page.

Axe (wcag2a, wcag2aa, wcag21aa, wcag22aa) runs on 14 routes in light and dark themes, at 1280px and 375px (57 combinations). Each test asserts zero serious or critical violations, and all pass. The 38 combinations that failed at the first run (contrast on tags and night-mode panels, the progressbar name, the scrollable consent table, the night-mode `tel:112` button at about 1.25:1) were fixed in the UI, and the `KNOWN_VIOLATIONS` skip list is gone.

Layout fixes found along the way: the mobile bottom nav no longer renders on desktop, the SOS button is pinned to the same position on every page, and the demo banner no longer overlaps the sidebar.

Limits: automated axe finds only a share of accessibility problems. There has been no manual keyboard, screen-reader (NVDA) or real-device audit. Only Chromium has been tested.

### Other findings

- `/journal` in demo mode renders `DemoJournalView`, which skips `VaultGate`. The passphrase setup and the "lose both" warning cannot be reached without a Supabase session. This was not re-checked on 2026-11-20.
- **Performance:** the production build is green. A gzip build loads the first route (`/login`) at about **190.9 KB gzipped**, inside the 200 KB budget. It was 246.9 KB before the Supabase SDK and the Hindi locale were lazy-loaded. Lighthouse has **not** been run, and no load test exists, so this is a bundle-size figure, not a performance score.

## 6. Real-backend checks (manual, 2026-11-20, local Supabase)

These were done by hand against the local stack and are **not** part of the automated Playwright counts above. Section 6.1 was added for the two new features.

- **Edge function on the real Supabase Deno edge runtime, with real JWTs:** sign-up creates a profile with an anonymous alias; `POST /assessments` with PHQ-9 item 9 = 2 stores the assessment and creates a crisis risk event with helplines; a request with only the anon key returns 401; `GET /students/<other-id>/export` returns the caller's own data (identity from the token, URL id ignored, so the original IDOR is closed); `/health` works.
- **Browser, real session:** magic-link sign-in through the local mail catcher (port 54324) lands on `/dashboard` with no console errors; all 12 main routes load with no console errors and no failed API calls; the counsellors page shows real seeded counsellors and slots from the database.
- **SEC-03 (local storage of sensitive data):** CBT records, safety-card anchors and the trusted contact were saved through the UI and storage was inspected. They are AES-GCM ciphertext under opaque keys, unreadable while the vault is locked, with no plaintext and no passphrase in storage. The safety card still shows the helplines while locked. One `clearAllLocalUserData()` runs on logout and erase.

Not verified: the Claude chat route, Daily.co video tokens, `pg_cron`, any hosted deployment.

### 6.1 Checks of the two new features (lead and workers, 2026-11-20, local Supabase, real browsers)

Raw outputs of the lead's earlier throwaway scripts are not stored in the repository. They have been replaced by the `real` Playwright specs (section 6.2), which are in the repository and passed. What was checked by hand first:

- **Follow-up loop, end to end, two browsers (student and counsellor).** A PHQ-9 with item 9 above zero created a crisis risk event and the first `open` step. The counsellor saw the event in the queue with the not-monitored-24/7 banner and, for an offline-flagged event, "detected ... while the student was offline, received ...". An illegal jump (open to contacted) was rejected by the database. Acknowledge moved the step and created the h24 and h72 prompts. After the h24 prompt was made due, the student saw it with the helplines, answered "I want to talk", the event reopened to `open`, and the counsellor received a notification. `escalate_overdue_risk()` returned an integer. (The worker's own smoke test `src/features/counsellor/smoke.local.test.ts` covers the same path and is skipped unless JWT variables are set.)
- **Offline mood and offline crisis queueing.** With the vault unlocked and the crisis consent given, the browser was set offline. A mood check-in was queued (database unchanged) and appeared after reconnection with a recent server `created_at`. An offline crisis message showed the crisis card with 14416, 1800-599-0019 and 112 at once; the outbox held the item while offline; after reconnection the `risk_events` row existed with `payload.offline = true` and `payload.detected_at` earlier than `created_at`, and no message text in the payload.
- **Security attempts.** A student's direct PATCH of their own risk event changed 0 rows and the event stayed unresolved (the TH-21 hole). A student's PATCH of their own check-back answer changed nothing. Both attempts are now automated in `crisis-followup.spec.ts` (section 6.2).
- **Shared device.** Unit level: student A's queued rows are skipped and cannot be decrypted by student B (Vitest with fake IndexedDB). The `real` suite now has a shared-device case in a real browser (section 6.2).

### 6.2 Real-backend verifications (`pnpm test:e2e:real`, 36 passed on 2026-11-27)

The `real` Playwright project runs Chromium against the local Supabase stack with a non-demo build (docs/29). Final result: **36 passed** across all spec files:

1. `real-sign-in-and-routes.spec.ts`: the magic link arrives in the local mail catcher and signs a new user in; 12 main routes render signed in with no console errors and no failed Supabase request.
2. `crisis-followup.spec.ts`: a PHQ-9 with item 9 set creates crisis events with an `open` step; a student's own PATCH to resolve an event changes 0 rows; a counsellor with a care share sees the event and the "not monitored 24/7" banner; Acknowledge creates the h24 and h72 prompts; the student answers "I want to talk", the event reopens and the counsellor gets one notification; a student's PATCH of their own check-back answer changes nothing.
3. `offline-outbox.spec.ts`, two tests: an offline mood check-in is queued in the encrypted outbox and appears once after reconnecting with a recent server `created_at`; an offline crisis message shows the three helplines at once, queues one item, and after reconnecting creates one `risk_events` row with `payload.offline = true`, an earlier `detected_at` and no message text.
4. `shared-device.spec.ts`: student A queues a crisis event offline and signs out choosing "Keep encrypted on this device"; student B signs in on the same browser; A's item is never inserted under either user, and B's reads of A's rows return nothing (RLS).
5. `fresh-account.spec.ts`: empty states with true zeros.
6. `demo-data.spec.ts`: load demo data, confirm labelled rows, clear demo data leaves real entries intact.
7. `persistence.spec.ts`: verified reload persistence across journal, thought records, and forms.
8. `preview-flag.spec.ts`: offline-preview flag isolation in `sessionStorage`.
9. `chat-persistence.spec.ts` (9 tests): session creation, client-side AES-GCM ciphertext save, sequence order, history retrieval upon unlock, past session dates/counts listing, per-session deletion, wipe-all chats, do-not-save conversation toggle, and transcript clearing on vault lock.
10. `blob-sync.spec.ts` (3 tests): encrypted blob sync for CBT activities, worry time and safety-card anchors; atomic push via `put_blob`; conflict resolution where server copy wins.

Not covered by the `real` suite: the warm handoff flow, the erase flow, Firefox, WebKit, real-device PWA install, hosted Supabase, Claude and Daily.co.

### 6.3 Quality-assurance story: defects found by running the system

Each of these was found by running or independently reviewing the system, not by a failing existing test, and each was fixed with a regression test. The "found by" column gives only what the project records state.

| # | Defect | How found | Fix |
|---|---|---|---|
| 1 | Students could resolve their own crisis events through a permissive RLS UPDATE policy | Courtroom tournament (docs/30) | Policy tightened; pgTAP 08 and 09; `real` spec tries the attack |
| 2 | Six SQL defects visible only on a real Postgres, including two RLS infinite recursions | Running the migrations (docs/21) | Migrations corrected |
| 3 | Global CSS classes `.p-0` to `.p-5` (confetti) collided with Tailwind padding utilities and made the counsellor Acknowledge button unclickable | Running the two-window follow-up flow | Classes renamed |
| 4 | Offline crisis events waited behind a retried network consent lookup and could be lost if the tab closed | Running the offline flow | Queued at once from a consent cache filled while online; consent re-verified on the server at send time |
| 5 | Offline mood check-ins never reached the queue because TanStack Query pauses mutations offline | Running the offline flow | `networkMode: "always"` |
| 6 | The Supabase Realtime publication was empty, so the counsellor queue never got live updates | Running the crisis queue against the local stack | Migration 0008; pgTAP 14; unique realtime channel topics (re-subscribing failed with "cannot add postgres_changes callbacks after subscribe()") |
| 7 | One PHQ-9 item 9 created two risk events and two audit rows (edge function plus database trigger) | Running the system | The trigger is the single source of truth |
| 8 | The Vite dev server crashed while watching Playwright trace files | Running the Playwright suites | Test output folders are ignored by the watcher |
| 9 | Account erasure left queued encrypted entries on the device and wiped local data before the server delete | Review | Server delete first, then a local wipe that discards the outbox |
| 10 | The logout dialog could trap a student in distress | Review | Escape is the safe option; the three helplines are in the dialog |
| 11 | The follow-up card said "Your counsellor has been told" when no counsellor could see the alert | Independent review (G6-SEC-05) | Card says "Alert recorded. It was not shared with a counsellor." with the helplines first |
| 12 | The update toast was built but not mounted | Review | Mounted in `AppLayout` |
| 13 | Independent review (docs/28): a Critical defect (a reopened event never re-escalated, because notification idempotency was per event, not per follow-up cycle), an alias leak through a SECURITY DEFINER helper, escalation RPC permission and concurrency gaps, a revoked care share still counting as active, spoofable notifications | Independent review | Migration 0007 with failing-first tests (pgTAP 12 and 13); app-code findings fixed (outbox metadata inside the encrypted payload with a salted database name, offline-page escaping, limited queue display, consent cache is only a hint) |

Mutation sanity check (worker G5): three safety-critical lines were broken by hand and the tests caught each break. This is three lines, not a mutation-testing run.

**Still not run:** Lighthouse, OWASP ZAP, a dependency audit, a hosted deployment, a real-device PWA install and offline test (Android or iOS), any browser other than desktop Chromium, the LLM evaluation, any user study.

### 6.4 Demo-data and persistence tests (2026-11-27)

Evidence for the change set described in docs/31 and docs/32:

- **pgTAP file `15_demo_data.test.sql`, 38 tests.** Covers the demo-data contract in docs/31: `load_demo_data()` inserts sample rows with `is_demo = true` and does not duplicate on a second call, `clear_demo_data()` removes only demo rows, counsellors with a care share do not see demo rows, institution aggregates exclude them, and loading creates no risk event, follow-up or crisis audit entry (demo PHQ-9 item 9 is always 0).
- **Vitest, demo-data feature** (`src/features/demo-data`): panel, API and locale tests.
- **Vitest, persistence flows**: reload and unlock tests for the journal, thought records and counsellor session notes; failed-save tests that keep what was typed and show no success message (journal, thought record, CBT, safety plan, consent, post report, appointment booking and cancel; chat restores an unsent message); dashboard and insights tests that the old invented values are gone. `fake.failTables` in `src/features/journal/testSupport.ts` simulates a backend refusal.
- **Not covered here:** the real-backend browser specs for these behaviours are in `e2e/real` (`fresh-account`, `demo-data`, `persistence`, `preview-flag`): all passing on 2026-11-27 against the local Supabase stack. The offline-preview flag in `sessionStorage` is also covered by `e2e/real/preview-flag.spec.ts`. Nothing was run against a hosted Supabase.

### 6.5 Chat persistence and synced encrypted blobs tests (Wave 3, 2026-11-27)

Evidence for the change set described in docs/33:

- **pgTAP files `16_chat_persistence.test.sql` (25 tests) and `17_encrypted_blobs.test.sql` (22 tests), 47 tests.** Covers: chat session salt, title constraint ('Well-being Chat'), retention TTL (30 days), message sequence uniqueness, AAD binding, BEFORE INSERT triggers forcing timestamps, RLS owner isolation (no counsellor/moderator/admin access), and `purge_expired_chat_messages()`; `encrypted_blobs` table, slot whitelist CHECK constraint, RLS owner policies, and atomic `put_blob` RPC with version conflict enforcement.
- **Vitest tests:** `src/features/chat/history.test.ts`, `src/features/chat/chatCrypto.test.ts`, `src/features/chat/ChatPersistence.test.tsx`, `src/features/chat/ChatHistoryIntegration.test.tsx`, `src/shared/lib/storage/remoteSync.test.ts`, `src/features/cbt/SyncUi.test.tsx`.
- **Real-backend browser specs:** `e2e/real/chat-persistence.spec.ts` (9 tests) and `e2e/real/blob-sync.spec.ts` (3 tests), all passing against the local Supabase stack (part of the 36 passing real-backend specs).

## 7. Gaps in the test suite worth fixing

1. Requirement IDs are not in test names, so the matrix in 02-srs.md section 6 was built by hand.
2. The PHQ-9 item 9 path is now checked through the real edge function and database by hand (section 6) and in pgTAP, but not by an automated end-to-end test that includes the backend.
3. The crisis page and crisis-related components have the lowest branch coverage of the safety code (54.16% at the 2026-11-19 measurement).
4. `SosModal` and `SafetyCardModal` have no Vitest coverage (they are covered by Playwright and manual checks).
5. The edge function now has 188 Vitest tests, but the Claude and Daily.co routes have never run against the real services.
6. The routed role portals: `/counsellor` and `/admin` mount the real dashboards for a real session, and `/moderator` renders `ModeratorPortal`; none of the three was checked with live data in an automated test.
7. Only Chromium is tested.
8. No test exercises Background Sync, because the service worker has no `sync` handler.
9. No automated test calls `advance_risk_followup` or `escalate_overdue_risk` concurrently.
10. The account-erasure path against the offline outbox (L49, now closed) is covered by unit tests only; the `real` suite does not run the erase flow in a browser.
11. The real-backend specs in `e2e/real` cover fresh account, demo data, persistence, preview flag, chat persistence, and blob sync (36 of 36 real-backend specs pass on 2026-11-27), alongside pgTAP files 16 and 17 (47 tests) and Vitest (950 passed, 1 skipped in 86 files).
12. Transient Vitest flake (7 timeouts under load) observed once, did not reproduce in 2 reruns; should be monitored under sustained CI load.

## 8. How to reproduce

```powershell
pnpm install
pnpm typecheck
pnpm lint
npx vitest run --coverage
npx playwright test                      # chromium and pwa projects (builds dist-pwa for pwa)
supabase start
npx --yes supabase test db
pnpm test:e2e:real                       # opt-in: real sign-in, follow-up loop and offline outbox against the local stack (docs/29)
node scripts/req-status.mjs              # checks the requirements matrix in docs/02-srs.md
```

Coverage HTML is written to `coverage/index.html` (git-ignored). `supabase start` and `supabase test db` need the Supabase CLI and Docker.
