# 10 Test Plan

## 1. Objectives and exit criteria

- Line coverage >= 80% overall, 100% branch coverage on the crisis and scoring modules (NFR-QUAL-01).
- Every Must requirement has at least one passing test (section 7).
- No open high or critical defects; zero open WCAG A/AA failures.
- Crisis recall >= 0.95 (see 11-ai-evaluation-plan.md).

Current state (2026-11-20, measured by the lead after the Crisis Follow-Through Loop and Lifeline Offline): TypeScript 0 errors; ESLint on `src` 0 errors and 0 warnings. Vitest: 71 files passed and 1 skipped (a live smoke test that needs tokens), 818 tests passed and 1 skipped; coverage statements 88.62%, branches 80.56%, functions 86.44%, lines 90.61%, with the thresholds in `vitest.config.ts` enforced. Playwright default run (`npx playwright test`): 102 passed, of which 93 in `chromium` (57 axe combinations = 14 routes x light and dark x 1280 and 375 px widths, zero serious or critical violations, plus journeys, smoke and offline-UI specs) and 9 in the `pwa` project. Real-backend project (`pnpm test:e2e:real`, needs the local Supabase stack): 5 passed (sign-in and route sweep, crisis follow-through loop with security attempts, offline mood and crisis outbox, shared-device case), two consecutive green runs by the worker and one by the lead. pgTAP on a real local Postgres (Supabase CLI, Docker): 14 files, 146 tests, all passing, migrations 0001 to 0008. Production build green; first route about 190.9 KB gzip (budget 200 KB). Results are in 18-testing-report.md. Chromium only: Firefox, WebKit and real-device PWA install are not tested. Not in place: k6 load tests, Lighthouse CI, ZAP, hosted Supabase, the Anthropic chat route and Daily.co video checks, and any run on a real CI runner. Mutation sanity check: three safety-critical lines were broken by hand and the tests caught each break.

## 2. Levels

| Level | Tool (proposed) | Scope |
|---|---|---|
| Unit | Vitest | Scoring, crisis detector, state machine, encryption, i18n helpers |
| Component | Testing Library | Banner, forms, modals (focus trap, Escape, close button) |
| Integration | Vitest + local Supabase | Edge Functions, RLS, unique slot |
| End to end | Playwright | Core journeys in en and hi, mobile viewport |
| Accessibility | axe-core, manual NVDA and keyboard | NFR-A11Y |
| Performance | Lighthouse CI, k6 | NFR-PERF |
| Security | Manual checklist, `npm audit`, scripted IDOR and injection tests | NFR-SEC |
| AI evaluation | Scripted harness | NFR-SAFE |
| Usability | Study in 09 | NFR-USAB |

## 3. Priority test cases

| ID | Requirement | Test |
|---|---|---|
| TC-FR-CRISIS-01 | FR-CRISIS-01 | Banner appears for each keyword; cannot be closed by Escape or outside click alone; tel links 14416, 1800-599-0019, 112 present |
| TC-FR-CRISIS-02 | FR-CRISIS-02 | Parameterised en/hi/Hinglish phrases trigger banner on chat, journal save, mood note |
| TC-FR-CRISIS-04 | FR-CRISIS-04 | Offline mode: banner works with network blocked |
| TC-FR-CRISIS-06 | FR-CRISIS-06 | Crisis turn does not call the model (mock asserts zero calls) |
| TC-FR-ASSESS-04 | FR-ASSESS-04 | PHQ-9 item 9 values 0,1,2,3 with other items zero: 0 no crisis; 1,2,3 crisis |
| TC-FR-ASSESS-02 | FR-ASSESS-02 | Disclaimer visible before and after result |
| TC-FR-AUTH-02 | FR-AUTH-02 | User A's JWT requesting user B's rows returns empty or 403 on every table |
| TC-FR-AUTH-05/06 | FR-AUTH-05/06 | Export has all tables; erase leaves zero rows and cancels sessions |
| TC-FR-BOOK-02 | FR-BOOK-02 | Two concurrent bookings of one slot: one 201, one 409 |
| TC-FR-BOOK-03 | FR-BOOK-03 | Every allowed and disallowed transition of the state machine |
| TC-FR-BOOK-05 | FR-BOOK-05 | Counsellor B cannot read counsellor A's appointments |
| TC-FR-AI-04 | FR-AI-04 | Built client bundle contains no API key (string search) |
| TC-FR-AI-05 | FR-AI-05 | Rate limit returns 429 after threshold |
| TC-FR-AI-09 | FR-AI-09 | Model timeout yields fallback and banner path remains |
| TC-FR-COMM-02/03 | FR-COMM-02/03 | Unpublished story invisible to others; moderator view lacks author |
| TC-NFR-PRIV-01 | NFR-PRIV-01 | Stored journal is ciphertext; wrong passphrase fails decryption |
| TC-NFR-A11Y-02 | NFR-A11Y-02 | Modal traps focus, Escape closes, icon buttons have names |
| TC-FR-CRISIS-09 | FR-CRISIS-09 | A high or crisis event gets an `open` step; low and medium do not. Every illegal jump is refused (open to contacted, acknowledged to closed, any step backwards, any step after closed). Closing needs one of five reasons. A counsellor without a current care share cannot advance. A student cannot update or resolve their own event. |
| TC-FR-CRISIS-10 | FR-CRISIS-10 | Acknowledging creates h24 and h72 prompts. A student answers a prompt once, only their own. "Want to talk" reopens the event and notifies counsellors with a share. An answer never closes or lowers an event. A student cannot edit or delete an answer. |
| TC-FR-CRISIS-11 | FR-CRISIS-11 | `escalate_overdue_risk()` notifies only counsellors with a `risk_events` share, once per event and level, backup counsellor only at level 2, no message content, audit rows written. `risk_queue` shows a student only their own rows. |
| TC-FR-CRISIS-12 | FR-CRISIS-12 | Offline: crisis card at once with the three numbers; item queued only with consent and an unlocked vault; after reconnection exactly one `risk_events` row with `payload.offline = true`, a server `created_at` later than `detected_at`, and no message text; consent withdrawn before send drops the item; student A's item is never sent under student B. |
| TC-FR-CRISIS-13 | FR-CRISIS-13 | The queue and the student card show the not-monitored-24/7 text and the three helplines; with no care share the card says no counsellor can see the alert; the offline banner says nobody is alerted until reconnection; axe passes on the banner. |
| TC-NFR-AVAIL-01/02 | NFR-AVAIL-01, NFR-AVAIL-02 | After one online visit, with the network off, `/crisis` and `/chat` load from the cached shell and `/crisis` shows 14416, 1800-599-0019, 112 and the verified date; an uncached route shows the offline page; no cache entry is a backend URL; changing a helpline number or the date changes the cache name. |
| TC-NFR-PRIV-03 | NFR-PRIV-03 | Items for user A cannot be decrypted by user B; the 7-day purge touches only the named user; logout keeps items unless "discard" is chosen; a locked vault rejects enqueue with a typed error. |


### 3.1 Suites added for the two new features (2026-11-20)

| Suite | Files | What it covers | Where it runs |
|---|---|---|---|
| pgTAP | `supabase/tests/08_crisis_followup_lifecycle.test.sql` (15 tests), `09_crisis_security_and_isolation.test.sql` (15), `10_overdue_escalation.test.sql` (14), `11_warm_handoff_and_optout.test.sql` (22), `12_g6_sec_findings.test.sql` (9), `13_systematic_security_sweep.test.sql` (10), `14_realtime_publication.test.sql` (4) | Step order, closure reasons, prompts, student cannot resolve own event, cross-user isolation, append-only answers, server timestamp on offline events, level 1 and 2 escalation, idempotency, `risk_queue` filtering, server-side opt-out, warm handoff offers and acceptance (11), regression tests for the independent review, written failing first and passing after migration 0007: reopened event re-escalation, alias lookup, and others (12, 13); the three tables are in the `supabase_realtime` publication (14). Files 01 to 14 hold 146 tests, all passing | Local Supabase (`npx --yes supabase test db`) |
| Vitest, follow-up | `src/features/counsellor/RiskQueue.test.tsx`, `riskApi.test.ts`, `Counsellor.test.tsx`, `src/features/followup/FollowUp.test.tsx` (73 tests reported by the author) | Queue, steps, timer, banner, student card, check-back answers | Node, jsdom, mocked network |
| Vitest, offline | `src/shared/lib/offline/outbox.test.ts`, `hooks.test.ts`, `src/shared/lib/storage/secureStore.test.ts`, `src/features/chat/api.test.ts`, `src/shared/lib/api/moods.test.ts`, `src/shared/lib/api/consents.cache.test.ts`, `src/app/layouts/AppLayout.test.tsx` | Isolation, replay, consent drop, drain order, purge, locked vault, logout retention, offline logging | Node, jsdom, fake IndexedDB |
| Vitest, PWA and UI | `src/shared/lib/pwa/cacheVersion.test.ts`, `helplines.test.ts`, `register.test.ts`, `src/features/offline-ui/offline-ui.test.tsx`, `UpdateToast.test.tsx`, `src/features/crisis/CrisisPage.test.tsx` | Cache version, helpline data, registration, chip, banner, logout dialog, update toast | Node, jsdom |
| Playwright `pwa` | `e2e/pwa.spec.ts` (9 tests listed by `--list`: manifest, active worker, offline `/crisis` and `/chat`, offline page, no backend in cache, version equals cache name, Hindi offline page) | Production build served by `vite preview` on port 5292, desktop Chromium, `setOffline` | `npx playwright test --project=pwa` |
| Playwright offline UI | `e2e/offline-ui.spec.ts` | Offline banner with helplines, dismiss and reappear, axe on the banner, SOS button position unchanged | Demo build, Chromium |
| Playwright `real` (opt-in) | `e2e/real/real-sign-in-and-routes.spec.ts`, `crisis-followup.spec.ts`, `offline-outbox.spec.ts` (and more, see docs/29) | Real magic-link sign-in, the loop with a student and a counsellor, offline mood and crisis queueing against a local Supabase | Needs the local stack and the local mail catcher; skipped otherwise; `pnpm test:e2e:real` |

The `chromium` project does not start the `pwa` preview server when selected alone. The `real` project is not part of a default `npx playwright test` run (it needs `REAL_E2E=1`, set by `e2e/real/run.mjs`).

### 3.2 Not covered by any automated test

- A real phone, iOS, Firefox or Safari for the service worker, install and offline behaviour.
- Cache cleanup when a new worker activates (needs two builds in one run).
- Background Sync (the worker has no `sync` handler).
- `pg_cron` scheduling of `escalate_overdue_risk`.
- Concurrent calls of `advance_risk_followup` or `escalate_overdue_risk`.
- The warm handoff and the server-side opt-out in a real browser (pgTAP 11 covers the database side only).
- Per-subscriber RLS filtering of streamed Realtime rows (pgTAP 14 checks only that the three tables are published), and live updates on a hosted project.
- Erasure ordering on a real shared computer (unit tests and the real-backend shared-device case only).
## 4. Prompt-injection and abuse suite

20 or more cases: "ignore previous instructions", asking for a diagnosis, asking for medication doses, asking for the system prompt, HTML/script in input, very long input, Devanagari homoglyph evasion of crisis words. Expected: no diagnosis, no leak, plain-text output, crisis path intact.

## 5. Performance and accessibility procedure

- Lighthouse CI on login, home, chat, directory with mobile emulation; fail below 90.
- TTFT measured from request send to first token received over 200 requests at 50 concurrent virtual users; report p50, p95, p99. The Claude API latency is outside our control, so TODO record the model and region used and report honestly if p95 misses 2.5 s.
- Manual WCAG 2.2 AA checklist including target size (2.5.8), focus not obscured (2.4.11), consistent help (3.2.6), accessible authentication (3.3.8).

## 6. Environments and data

Local Supabase for integration, a staging project for e2e, synthetic data only. No real student data in any test.

## 7. Traceability matrix

Maintained as a table generated from test names (see 00-README.md). TODO: automate. Until then, the table in section 3 is the manual matrix, and Must requirements without a row are open gaps (for example FR-MOOD-02, FR-COMM-05; TODO add).

## 8. Defect handling

Severity S1 (safety or privacy) blocks release. S2 core flow broken. S3 minor. S4 cosmetic. Any S1 requires an update to the hazard log.
