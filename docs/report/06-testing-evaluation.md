# Chapter 6. Testing and Evaluation

All numbers in this chapter are measured and copied from project documents or tool output. Nothing is estimated. Where a check has not been run, the text says so. The sources are docs/18-testing-report.md, docs/11-ai-evaluation-plan.md and the files in `eval/results/`.

## 6.1 Strategy

The test plan (docs/10-test-plan.md) defines four levels: unit tests of pure domain logic, component tests of features with mocked network, end-to-end and accessibility tests in a real browser, and database and security tests. All four levels have now been run, with limits. The second level uses mocked network calls. The third runs in Chromium only, mostly in demonstration mode, plus a separate opt-in project of five tests against a real local backend (Section 6.3.2). The fourth level (pgTAP) was executed on a **local** Supabase stack (Supabase CLI, Docker), not on a hosted project. **The Vitest tests and the default Playwright run do not talk to a real Supabase instance, Postgres database, edge function or Claude API.** Real-backend evidence comes from the pgTAP run (Section 6.7), the five-test real-backend Playwright project and manual checks against the local stack (Section 6.3.1).

**Table 6.0 Quality gates, final measurement 2026-11-20**

| Gate | Result |
|---|---|
| TypeScript | 0 errors |
| ESLint (`src`) | 0 errors, 0 warnings |
| Vitest | 71 files passed, 1 skipped; **818 tests passed, 1 skipped**, 0 failed. The skipped file is a live smoke test that needs tokens |
| Coverage | Statements 88.62, branches 80.56, functions 86.44, lines 90.61 percent. Scope: `src/domain` and `src/features` only. The thresholds in `vitest.config.ts` are enforced |
| Playwright, default run (`npx playwright test`) | **102 passed**: 93 in the Chromium project (57 axe combinations plus journeys, smoke and offline-UI specs) and 9 in the `pwa` project (production build). Chromium only |
| Axe | 14 routes x light/dark x 1280 px/375 px = 57 combinations; serious and critical violations: 0 |
| Playwright, real-backend project (`pnpm test:e2e:real`, needs the local stack) | **5 passed**: sign-in and route sweep, crisis follow-through loop with security attempts, offline mood and crisis outbox, shared-device case. Two consecutive green runs by the worker, one by the lead |
| pgTAP (local Supabase) | **14 files, 146 tests, all passing** (files 01 to 14, migrations 0001 to 0008, real local Postgres) |
| Production build | Green. First route about 190.9 KB gzipped (budget 200 KB) |

## 6.2 Unit and component tests

The Vitest suite (`npx vitest run --coverage`) was run on the final tree on 2026-11-20: **71 files passed and 1 was skipped; 818 tests passed, 1 was skipped, none failed.** The skipped file is a live smoke test that needs tokens. The suite includes the edge-function tests under `supabase/functions/**`, which run against mocks (188 edge-function tests re-counted separately on 2026-11-20). Type check reports 0 errors and lint reports 0 errors and 0 warnings. The earlier figures of 345, 363, 553, 562, 724 and 795 tests are superseded. The overall coverage figures in Table 6.1 are from the final run. The per-area figures in Table 6.2 come from earlier runs (2026-11-19 and 2026-11-20) and were not re-measured per area.

A jsdom message "Not implemented: navigation to another Document" appears during the run. It is not a failure, and the test that triggers it was not identified.

**Table 6.1 Coverage at the final run (818 tests)**

| Metric | Value |
|---|---:|
| Statements | 88.62% |
| Branches | 80.56% |
| Functions | 86.44% |
| Lines | 90.61% |

**Scope of the number.** The configuration measures only `src/domain/**` and `src/features/**`. It excludes `src/app`, `src/shared/lib`, `src/shared/ui` and the legacy `src/api.ts`, so the headline overstates whole-application coverage. The thresholds in `vitest.config.ts` are enforced and pass.

**Table 6.2 Coverage of safety-relevant areas (lines, branches; 2026-11-19 run except the rows marked 2026-11-20)**

| Area | Lines | Branches | Remark |
|---|---:|---:|---|
| `domain/risk` (lexicon, routing) | 100 | 93.37 | Lexicon 94.3 percent branches, routing 86.95 |
| `domain/crypto` | 81.57 | 87.17 | |
| `features/chat` (re-measured 2026-11-20) | 94.26 | 89.28 | Includes the offline logging path |
| `features/crisis` (re-measured 2026-11-20) | 90.66 | 61.9 | Weakest branch coverage in safety code |
| `features/counsellor` (re-measured, risk queue added) | 98.29 | 88.4 | `RiskQueue.tsx` 100 / 96.42 |
| `features/followup` (new, re-measured) | 98.8 | 81.81 | Student status card and check-back answers |
| `features/offline-ui` (new, re-measured) | 95.97 | 90.58 | Chip, banner, logout dialog, update toast |
| `features/modals` | 64.48 | 75.71 | `SosModal` and `SafetyCardModal` at 0 percent in Vitest (covered by Playwright and the SEC-03 browser check) |
| `features/navigation` | 71.79 | 56.06 | The SOS button lives in `Header.tsx` (100 percent lines); `Sidebar` 66.66 and `MobileNav` 58.33 percent lines |
| `features/dashboard`, `features/insights` | 0 | 0 | No tests |

The requirement NFR-QUAL-01 asks for lines at least 80 percent (met in the measured scope) and 100 percent of crisis-module branches (**not met**). The largest test files are `lexicon.v2.test.ts` (68 tests) and `lexicon.test.ts` (25), followed by community (21), crypto (15), PHQ-9 (15) and doctors (15). Scoring tests exist for PHQ-4 (14), PHQ-9 (15) and GAD-7 (10); their per-case content was not audited for this report.

## 6.3 End-to-end tests

Playwright (Chromium only) has two kinds of run. The **default run** (`npx playwright test`, final measurement 2026-11-20) uses a Vite server in demonstration mode with no back end plus a `pwa` project against a production build: **102 tests passed**, 93 in the Chromium project (57 axe accessibility combinations, smoke, journeys and offline-UI specs) and 9 in the `pwa` project (service worker and offline behaviour). The **real-backend project** is described in Section 6.3.2. The journeys cover demo login and the role picker, DPDP consent toggles (opt-in defaults, 18+ and core-consent gates), mood check-in and distress alert, the PHQ-9 item 9 crisis card (14416, 1800-599-0019 and 112 shown before any score), the SOS button in the same position on every main route, the chat crisis card with no close control, Hindi language switch, theme toggle, keyboard Tab to the SOS control, and the 404 page. Earlier counts (47 passing with 39 skipped, then 88 of 88, then "about 100") are superseded.

The earlier run with 39 skipped tests (marked `test.fixme`) is superseded. The skipped accessibility combinations were fixed in the interface (Section 6.5). The journal vault journey is a separate point: in demonstration mode the journal skips the vault gate, so the passphrase flow is not reached by the default run (not re-checked on 2026-11-20).

### 6.3.1 Real-backend checks (manual, not part of the automated counts)

On 2026-11-20 the application was also used against the local Supabase stack. These checks were done by hand and are not automated: magic-link sign-in through the local mail catcher lands on `/dashboard` with no console errors; all 12 main routes load with a real session with no console errors and no failed API calls; the counsellors page shows real seeded counsellors and slots from the database. The edge function was exercised on the real Supabase Deno edge runtime with real JWTs: sign-up creates a profile with an anonymous alias; a PHQ-9 submission with item 9 = 2 stores the assessment and creates a crisis risk event with helplines; a request with only the anon key returns 401; and `GET /students/<other-id>/export` returns the caller's own data because the identity comes from the token (the original IDOR is closed). Not verified: the Claude chat route (needs `ANTHROPIC_API_KEY`), Daily.co video tokens (needs `DAILY_API_KEY`), `pg_cron` and any hosted deployment.

The server crisis lexicon is now generated from `src/domain/risk/lexicon.ts` by `scripts/sync-lexicon.mjs` (hash-checked) and agrees with the client on all 600 dataset rows. The output guard runs on the server before any model text is shown (buffered, never streamed unguarded). Eight edge-function bugs were found and fixed while testing (docs/22).

Two further hand checks were made for the new features (Table 6.4a). With a student and a counsellor in two browsers, a PHQ-9 with item 9 above zero created a crisis event and its first step; the counsellor saw it in the queue with the not-monitored-24/7 banner; an illegal step jump was refused by the database; acknowledging created the 24 h and 72 h prompts; a due prompt answered "I want to talk" reopened the event and notified the counsellor; a student's direct PATCH of their own risk event and of their own check-back answer changed nothing. With the browser set offline, a mood entry and a crisis message were queued (the crisis card with the three helplines showed at once), and after reconnection the rows appeared with a server `created_at`, the risk event with `payload.offline = true`, a `detected_at` earlier than `created_at` and no message text. Raw outputs of the manual scripts are not stored. They were rewritten as the opt-in real-backend Playwright project described next.

### 6.3.2 Real-backend Playwright project

`pnpm test:e2e:real` runs five tests against the local Supabase stack with real sign-in, real row level security and the real edge runtime (docs/29). They cover four areas: (1) sign-in and a sweep of the main routes; (2) the crisis follow-through loop, with security attempts; (3) an offline mood check-in and crisis event (the outbox); (4) a shared-device case. **5 passed.** The worker ran the project twice in a row with green results, and the lead ran it once. These tests need the local stack, so they are not part of the default run and not part of CI. Not covered: Firefox, WebKit, a real phone or an installed PWA, and any hosted project. The warm handoff and the server-side check-back opt-out (migration 0006) have 22 pgTAP tests plus unit and UI tests, but **no real-browser end-to-end check**.

### 6.3.3 Quality-assurance story: defects found by running the system

Most of the defects below were invisible to the earlier unit tests and to reading the code. They were found by running the system, in a real Postgres, a real browser or an independent review. Each has a regression test.

| # | Defect | How it was found | Fix |
|---|---|---|---|
| 1 | A student could resolve their own crisis event through a permissive row level security UPDATE policy | Feature-selection tournament (docs/30) | Policy dropped; steps go through one RPC; regression in pgTAP 09 and a real-backend attempt |
| 2 | Six SQL defects visible only on a real Postgres, including two RLS infinite recursions (docs/21) | Running the migrations and pgTAP locally | Fixed in the migrations; pgTAP covers them |
| 3 | Global CSS classes `.p-0` to `.p-5` (confetti) collided with Tailwind padding utilities and made the counsellor's Acknowledge button unclickable | Real-browser run of the follow-up loop | Classes renamed; covered by the real-backend loop test |
| 4 | Offline crisis events were held behind a retried network consent lookup and could be lost if the tab closed | Offline run in a real browser | Event queued at once from a consent cache filled while online; consent re-verified on the server at send time |
| 5 | Offline mood check-ins never queued from the interface because TanStack Query pauses mutations while offline | Offline run in a real browser | `networkMode: "always"` on those mutations |
| 6 | The Supabase Realtime publication was empty, so the counsellor queue never updated live | Two-browser run | Migration 0008 publishes `risk_events`, `risk_followups` and `notifications`; channels get unique topics, because re-subscribing raised "cannot add postgres_changes callbacks after subscribe()" |
| 7 | One PHQ-9 item 9 answer created two risk events and two audit rows (edge function and database trigger) | Real-backend run | The trigger is the single source of truth |
| 8 | The Vite dev server crashed while watching Playwright trace files | Test runs | Test output folders are ignored |
| 9 | Account erasure left queued encrypted entries on the device and wiped local data before the server delete finished | Review and run | Server delete first, then a local wipe that discards the outbox |
| 10 | The logout dialog could trap a student in distress | Independent review (docs/28) | Escape is the safe option; the three helplines are inside the dialog |
| 11 | The follow-up status card said "Your counsellor has been told" when no counsellor could see the alert | Independent review | Now "Alert recorded. It was not shared with a counsellor." with the helplines first |
| 12 | The update toast was built but not mounted | Independent review | Mounted in `AppLayout` |
| 13 | A **Critical** defect: a reopened event was never re-escalated, because notification idempotency was per event instead of per follow-up cycle. Also an alias leak through a SECURITY DEFINER helper, gaps in escalation RPC permissions and concurrency, a revoked care share still counting as active, and spoofable notifications | Independent review (docs/28) | Migration 0007, with failing-first tests in pgTAP files 12 and 13. App-code findings were fixed separately: outbox metadata now sits inside the encrypted payload with a salted database name, offline-page escaping, limited display of queue payload fields, and the consent cache treated as a hint only |

A further check was a **mutation sanity test**: three safety-critical lines were broken by hand, and the tests caught each break. This is three samples, not a mutation score.

The independent review was written by another AI worker. It found real defects, and it is not a substitute for a human security review.

SEC-03 (sensitive data in local storage) was fixed and verified in a browser: CBT records, safety-card anchors and the trusted contact are stored only as AES-GCM ciphertext under opaque keys, unreadable while the vault is locked, and the safety card still shows the helplines while locked.

## 6.4 Keyword crisis detector evaluation

### 6.4.1 Dataset and split

The dataset (`eval/dataset/dataset.jsonl`, card in `eval/dataset/README.md`) holds **600 synthetic messages**, 200 each in English, Devanagari Hindi and romanised Hinglish, with five severity labels (none, low, moderate, high, imminent), 120 items per label. It is split into a **development set of 301** and a **held-out set of 299** by base-sentence group, so that near-duplicates share a split (`eval/splits/split.json`, built by `eval/splits/make-split.mjs`). The classifier v1 is frozen at `eval/splits/lexicon-v1.frozen.ts`; v2 is `src/domain/risk/lexicon.ts`.

The primary metric is **high+imminent recall**: the share of gold `high` or `imminent` messages predicted as `high` or `imminent`. The secondary measures are the false-alarm rate (gold none or low predicted high or imminent) and hard-negative specificity (idioms, lyrics, fiction and negations).

Procedure: v2 rules were written while reading development items. They were frozen, and the held-out half was evaluated once.

### 6.4.2 Results

**Table 6.3 Keyword detector results** (`eval/results/keyword-v2.md`, run on 18 November 2026)

| System | Split | n | High+imminent recall | English | Hindi | Hinglish | False alarm | Hard-negative specificity (n = 45) |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| v1 | dev | 301 | 0.350 | 0.659 | 0.154 | 0.225 | 0.075 | 0.800 |
| v1 | held-out | 299 | **0.300** | 0.410 | 0.220 | 0.275 | 0.075 | 0.800 |
| v2 | dev | 301 | 0.975 | 1.000 | 1.000 | 0.925 | 0.000 | 1.000 |
| v2 | held-out | 299 | **0.700** | 0.718 | 0.585 | 0.800 | 0.000 | **1.000** |

Further v2 held-out figures: recall at moderate level or above for high+imminent messages 0.800, exact recall of `imminent` 0.667, moderate-and-above recall 0.771, accuracy 0.682 and macro-F1 0.694.

**The v2 development score of 0.975 is overfit and is not a result.** The rules were designed while reading those items, so the score measures how well the rules fit them, not how they generalise. It is shown in Table 6.3 only to make the gap visible. The report, slides and any viva answer quote the held-out numbers only.

### 6.4.3 Interpretation

1. **Held-out recall is 0.70 against a target of 0.95 (NFR-SAFE-01).** The point estimate is 84 of 120 high and imminent items. A naive 95 percent Wilson interval on 120 items is about 0.61 to 0.77 (calculated for the project documents, not produced by the evaluation scripts). The 120 items derive from only 42 distinct base sentences, so the true uncertainty is wider. The interval was not recomputed by resampling base sentences. [STUDENT: compute a cluster-aware interval.]
2. **The improvement from v1 (0.30) to v2 (0.70) is real on held-out data but optimistic.** The same person wrote the data and the rules, which leaves leakage risk even across the split.
3. **Language gap.** Held-out recall is lowest for Hindi (0.585). Hinglish at 0.800 is higher than English at 0.718 in this data, which is a reminder that per-slice figures on about 40 items each are noisy and should not be read as a ranking.
4. **Specificity.** No false alarms occurred on 45 hard negatives or elsewhere on the held-out set (false-alarm rate 0.000). This rests on 45 items and shows only that this set of idioms, lyrics, fiction and negations was handled, not that false alarms will not occur on real text.
5. **Where it fails.** The largest misses are euphemisms ("sleep and not wake up", "unalive"), attempts in progress ("I took something to make it all stop"), passive ideation without the key phrase, and Hindi paraphrases. Some of these are the most dangerous presentations.

The conclusion drawn in the project documents, and adopted here, is that **a deterministic lexicon alone cannot reach the target on this data**. The lexicon is retained as a fast, auditable safety net next to an LLM layer, not as a substitute for one.

### 6.4.4 LLM-only and hybrid systems: PENDING

The LLM-only and hybrid evaluators (`scripts/eval-llm.ts`, `scripts/eval-hybrid.ts`) are written but have **never been run**, because they need an API key and about 600 paid calls per system. `eval/results/comparison.md` shows "not run" for both columns. No number exists for them and none is reported. The hypothesis that hybrid recall is at least LLM recall, which is at least keyword recall, is untested, and the "fail-safe OR" in the requirements is a design intention, not a measured outcome.

| System | Held-out recall | Status |
|---|---|---|
| A. Keyword v2 | 0.70 | Measured (synthetic data) |
| B. LLM-only | [PENDING] | Not run |
| C. Hybrid (more severe of A and B) | [PENDING] | Not run |

[STUDENT: after running the three commands in docs/11 section 0.5, insert the model name, run date, prompt hash, held-out subset recall with an interval, false-alarm rate, latency and the false-negative analysis here. Report held-out numbers, not whole-dataset numbers.]

### 6.4.5 Differences from the plan

The original plan (docs/11 sections 1 to 8) specified a binary label, two annotators plus a clinical adjudicator with Cohen's kappa, 100 independent items per language and class, Wilson intervals and McNemar tests. What was built has five labels, one annotator, about 210 effectively independent core sentences (14 per language and label cell, each expanded to 40 with neutral openers and closers), and no kappa, intervals or significance tests. These differences weaken every conclusion above and are repeated in Chapter 9.

## 6.5 Accessibility

Axe (rule sets wcag2a, wcag2aa, wcag21aa, wcag22aa) runs on 14 routes in light and dark themes at 1280 px and 375 px (57 combinations). Each test asserts zero serious or critical violations. **All 57 combinations pass (2026-11-20).** At the first run only 18 of 56 combinations passed and 38 failed; those failures were fixed in the interface and the `test.fixme` skip list is now empty. Table 6.4 records what the first run found, for the record; none of it is open in the automated check.

Layout defects fixed along the way: the mobile bottom navigation no longer renders on desktop (it did in the original prototype), the SOS button is pinned to the same position on every page, and the demonstration banner no longer overlaps the sidebar.

**Table 6.4 Accessibility violations found at the first axe run (all 38 failing combinations now pass)**

| Rule | Where | Fix suggested in the report |
|---|---|---|
| `aria-progressbar-name` | `/dashboard`, all themes and widths | Add an accessible name |
| `color-contrast`, light | `.tag.calm` 3.84:1, `.tag.mild` and streak badge 2.61:1, `.trend` and `.story-theme` 4.3:1 | Darken text colours |
| `color-contrast`, dark | Active navigation item, avatar and selected states about 1.1:1; side-support text 1.01:1; badge 3.06:1; danger red 3.2:1; the `tel:112` button 1.25:1; demo notice 1.25:1 | Light text on dark moss; lighter danger colour in night mode; fixed dark background for the 112 button |
| `color-contrast`, both | `/onboarding` eyebrow 2.27:1 | Light mint on the dark panel |
| `scrollable-region-focusable` | `/consent` at 375 px | Make the scrolling table wrapper focusable and labelled |

The item that mattered most for a mental health application was the night-mode `tel:112` button on `/crisis` (contrast about 1.25:1 at the first run); it now passes the automated check. Automated axe finds only a share of accessibility problems. A manual keyboard and screen reader audit (NVDA), a real-device check and a browser other than Chromium have **not** been done, so NFR-A11Y-01 stays Partial and WCAG 2.1 AA conformance is not claimed.

## 6.6 Performance

Only one performance measurement exists: the first-route (`/login`) bundle of about 190.9 KB gzipped against a 200 KB budget (Section 5.9). It was 246.9 KB before the Supabase SDK and the Hindi locale were lazy-loaded. This is a bundle size, not a performance score. Lighthouse has **not** been run, and no load test, time to first token or API latency figure exists, so NFR-PERF-01 to NFR-PERF-03 are unverified.

## 6.7 Checks not yet run

**Table 6.5 Pending verification**

| Check | State | Needed |
|---|---|---|
| pgTAP tests `supabase/tests/01` to `14` | **Executed locally: 14 files, 146 tests pass** (final measurement 2026-11-20). Files 12 and 13 are the regression tests for the independent review and pass after migration 0007. Not run on a hosted project or in CI | Hosted Supabase project; a CI runner |
| Migrations 0001 to 0008 and seed | **Executed locally** (28 tables, RLS on all). Running them found 7 defects the static audit missed (docs/21, findings 22 to 28). Hosted project not tried | Hosted Supabase project |
| Edge function | 188 Vitest tests, plus verified on the real edge runtime with real JWTs. Claude and Daily.co routes **not** verified, `pg_cron` not verified | `ANTHROPIC_API_KEY`, `DAILY_API_KEY`, hosted project |
| LLM-only and hybrid crisis evaluation | PENDING (scripts verified against a mock server only) | A human with an API key |
| Lighthouse, load test, ZAP, dependency audit | Not run | Deployed build and tools |
| PWA install and offline use on a real phone (Android, iOS); Firefox and Safari | Not done. Service worker tested in desktop Chromium only | Real devices |
| Background Sync, `pg_cron` overdue job | Background Sync does not work (`sw.js` has no `sync` handler). `pg_cron` not verified. Concurrency gaps in the escalation RPC were fixed in migration 0007 and tested, with no load test | Code change, hosted project |
| Real-backend Playwright project | **Done locally: 5 passed**, two green runs by the worker and one by the lead (Section 6.3.2). Not in CI | Local stack running; `pnpm test:e2e:real` |
| Warm handoff and server-side check-back opt-out (migration 0006) | 22 pgTAP tests plus unit and UI tests pass; **no real-browser end-to-end check of the handoff flow** | A two-browser check |
| Independent-review fixes (docs/28): the Critical reopened-event defect, alias lookup and others | **Fixed** in migration 0007 and in the app code, with failing-first tests (pgTAP 12 and 13). Not re-reviewed by a human | A human security review |
| Manual keyboard, NVDA and cross-browser audit | Not done (Chromium only) | Human task |
| `typecheck`, `lint` | Run 2026-11-20: 0 errors, 0 warnings | none |
| CI workflows (five files in `.github/workflows/`) | Never run on a real runner; no git repository yet | Create the repository and push |
| Usability study (SUS), survey, interviews | Not done | Participants and ethics approval |
| Ethics approval, clinical advisor sign-off | Not obtained | Human tasks |

## 6.8 Usability and user evaluation

[STUDENT: insert survey results. Required content: instrument, sample size, recruitment, ethics approval reference, headline findings with counts, limitations.]

[STUDENT: insert interview findings. Required content: number and role of interviewees, themes, anonymised quotations.]

[STUDENT: insert usability study results. Planned design (docs/09 section 4): 12 to 15 students aged 18 or over, seven scenario tasks with rotated order, task success, time, errors, severity ratings, and the ten-item System Usability Scale [S29] **[VERIFY]** with a target mean of at least 68. Report real sample sizes and results, however small or negative.]

None of the three studies has been conducted, and no ethics approval is recorded.

## 6.9 Summary against objectives

**Table 6.6 Objectives versus evidence**

| Objective | Target | Evidence | Verdict |
|---|---|---|---|
| O1 Crisis recall | >= 0.95 hybrid | Keyword 0.70 held-out; hybrid pending | Not met, not yet tested |
| O2 TTFT | p95 < 2.5 s | None | Unknown |
| O3 Accessibility and Lighthouse | >= 90, zero A/AA failures | Axe: 57 of 57 combinations pass with zero serious or critical violations; no manual audit; Lighthouse not run | Partly met (automated part only) |
| O4 Coverage and crisis tests | >= 80 percent lines, 100 percent crisis branches | About 90.6 percent lines (scoped to domain and features); crisis-component branch coverage 54 to 94 percent in earlier per-area figures | Partly met |
| O5 SUS | >= 68, n >= 12 | None | Unknown |
| O6 Export and erase timing | < 10 s | None | Unknown |
| O7 Documents | Complete with traceability | Complete; matrix by hand | Largely met |
