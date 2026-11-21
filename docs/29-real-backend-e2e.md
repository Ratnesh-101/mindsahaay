# 29. Real-backend end-to-end tests

The default Playwright suite (`chromium` and `pwa` projects) runs in demo mode with no backend. The `real` project in `e2e/real/` runs the same app against the local Supabase stack. It signs in with real magic links and checks real RLS, triggers, the edge function and the offline outbox.

## Prerequisites

- Docker running with the local Supabase stack started (`supabase start`). The tests expect:
  - API at `http://127.0.0.1:54321`
  - Mailpit (local mail catcher) at `http://127.0.0.1:54324`
  - Postgres container `supabase_db_mindsahaay`, reachable with `docker exec`
- `.env.local` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_FUNCTIONS_SLUG`. The tests read the anon key from this file and never print it.
- Migrations and seed applied. The seeded institution `10000000-0000-0000-0000-000000000001` must exist.
- Edge functions served (`supabase functions serve`, or the edge runtime container), because the PHQ-9 is submitted through `/functions/v1/server/assessments`.
- Playwright Chromium installed (`npx playwright install chromium`).

## How to run

```
pnpm test:e2e:real
```

This runs `node e2e/real/run.mjs`, which sets `REAL_E2E=1` and calls `playwright test --project=real --output=test-results-real`, with `E2E_PORT=5293` unless you set it. Extra arguments are passed through, for example `pnpm test:e2e:real crisis-followup --retries=0`.

The project starts its own dev server: `npx vite --port 5294 --strictPort`, with `VITE_DEMO_MODE=false`, so Vite loads `.env.local`. Override the port with `E2E_REAL_PORT`.

### Why the project is gated by `REAL_E2E=1`

The `real` project only exists in `playwright.config.ts` when `REAL_E2E=1` is set, and the top-level `testIgnore` excludes `e2e/real/**` from the other projects. A plain `npx playwright test` therefore lists exactly the same `chromium` and `pwa` tests as before. Gating by environment variable is safer than a grep or tag: nobody can start the real suite by accident (it writes to the local database), and CI configs that run `playwright test` do not need to change. `cross-env` is not installed, so the small Node wrapper `e2e/real/run.mjs` sets the variable on every platform.

### When the stack is not running

`e2e/real/global-setup.ts` checks the Auth health endpoint, Mailpit and `docker exec ... psql`. If any check fails, every test is skipped with `real backend not running, skipped (<reason>)` instead of failing.

## What each spec proves

Five tests in four spec files, all passing (see "Measured runs"). `offline-outbox.spec.ts` holds two tests (mood and crisis).

| Spec | What it proves |
| --- | --- |
| `real-sign-in-and-routes.spec.ts` | The magic-link mail arrives in Mailpit, and its verify link signs a new user in and lands on `/dashboard` (or `/onboarding`). Every main route renders while signed in: `/dashboard`, `/mood`, `/assessment`, `/chat`, `/journal`, `/doctors`, `/stories`, `/insights`, `/crisis`, `/consent`, `/settings` and `/onboarding`. The test also checks that no route redirects to login, that there are no console errors or page errors, and that no Supabase request returns HTTP 400 or higher or fails. |
| `crisis-followup.spec.ts` | A PHQ-9 with item 9 set, submitted through the edge function, returns `crisis: true` and creates risk events that each have an `open` follow-up step. A student's direct `PATCH resolved=true` on their own events changes 0 rows, and the events stay unresolved. A verified counsellor with a care share sees the event and the "not monitored 24/7" banner. Clicking Acknowledge sets the DB step to `acknowledged` and creates the `h24` and `h72` check-back prompts. After `h24` is made due with admin SQL, the student sees the prompt with 14416, 1800-599-0019 and 112. Answering "I want to talk" adds a new follow-up row that reopens the event (step `open`) and sends the counsellor one `checkback_want_to_talk` notification. A student's `PATCH` of their own check-back answer changes nothing. |
| `offline-outbox.spec.ts` | The vault is unlocked and crisis consent is granted. While offline, a mood check-in lands in the encrypted outbox (IndexedDB `mindsahaay_outbox_*`), the sync chip says "waiting to sync", and the DB is unchanged. After reconnecting, exactly one row appears, with a server `created_at` less than 2 minutes old, and the outbox empties. An offline crisis message shows 14416, 1800-599-0019 and 112 at once and queues one outbox item, with no DB row while offline. After reconnecting, one `risk_events` row exists with `payload.offline = true` and `payload.detected_at` earlier than `created_at`, the payload contains no message text, and there are no page errors. |
| `shared-device.spec.ts` | Student A queues a crisis event offline. A then comes back online with `risk_events` blocked, so the item stays unsynced, and signs out choosing "Keep encrypted on this device" in the logout dialog. Student B signs in on the same browser context. A's item is never inserted, neither under B nor under A. The item stays in A's outbox on the device. B's API reads of A's `mood_entries`, `risk_events` and `consents` return `[]` (RLS). |

## Helpers (`e2e/real/helpers.ts`)

- `magicLinkLogin(page, email)`: records the existing Mailpit message ids first, requests the link in the real login form, and checks the `/auth/v1/otp` response. It then polls only for mails that did not exist before, so an old link is never reused. If no mail arrives within 20 s it requests one more link, and only mails after that second request count. The verify URL is fetched without following redirects. The tokens from its redirect are opened on the test origin, because the project's `site_url` is not the test port.
- `adminSql(query)`: `docker exec -i supabase_db_mindsahaay psql`, with the query on stdin. It runs without a shell and is meant for local use only.
- `newUser(prefix)`: returns a unique email of the form `e2e-real-<prefix>-<timestamp>-<pid>-<n>@example.com` and tracks it for cleanup.
- `getAccessToken(page)`, `restAs(token, ...)` and `submitAssessment(token, ...)`: API calls as the signed-in user, so RLS applies.
- `promoteToCounsellor(userId)`, `grantCareShare(studentId, counsellorId, scopes)` and `grantConsent(userId, purpose)`: admin SQL setup.
- `unlockVault(page)`: fills `#vault-pass` and `#vault-confirm`, clicks Continue, waits up to 60 s for the PBKDF2 step and the recovery-code checkbox, then clicks Create vault. It then waits for the `PUT /auth/v1/user` that saves the vault metadata. Going offline while that call is in flight leaves the vault unsaved, and then nothing can be queued.
- `openFromSidebar(page, name)`: client-side navigation that keeps the in-memory vault key. It waits for the route to finish loading, because in dev mode a lazy module fetched while offline breaks the route.
- `outboxCount(page)`: sums `outbox_items` across all `mindsahaay_outbox_*` IndexedDB databases.

## Cleanup

- Each spec calls `cleanupCreated()` in `afterAll`, which deletes the users it created.
- `global-teardown.ts` deletes every user matching `e2e-real-%@example.com`, as a safety net for aborted runs.
- Several tables are append-only: `risk_followups`, `risk_checkbacks`, `consents` and `audit_log`. Their tamper-guard triggers also block FK cascades, and the `care_shares` audit trigger writes on delete. Cleanup therefore runs in one `DO` block. The block disables the user triggers on those tables, deletes the `audit_log` and `risk_followups` rows of the test users, deletes the `auth.users` rows (everything else cascades), and enables the triggers again. FK enforcement stays on. Only the local test database is touched.
- Mailpit messages sent to the test addresses are deleted as well.

## Limits

- The suite is local only. Admin SQL goes through `docker exec`, so it cannot run against a hosted project and must never be pointed at one.
- Time travel is simulated by moving `risk_checkback_prompts.due_at` with SQL. The real 24 h and 72 h scheduling is not waited for.
- Offline is simulated with `context.setOffline`. This test runs on the Vite dev server, not the production service worker; the `pwa` project covers the service worker.
- In the shared-device test, "A's item stays unsynced after reconnect" depends on blocking `/rest/v1/risk_events` with `context.route`. Going offline during logout is not an option, because Supabase `signOut` would fail.
- The tests run serially (`workers: 1`, `retries: 1`, 120 s timeout). Another process running `supabase db reset` during a run makes tests fail with missing users or tables. Rerun once in that case.
- The routes test fails on any console error. A new harmless console error in the app will therefore fail it on purpose.

## Findings from building this suite

- The mood check-in mutation used TanStack Query's default `networkMode: "online"`, so it paused offline and never reached the outbox. It was fixed during this work (`networkMode: "always"` in `src/shared/lib/api/moods.ts`), and `offline-outbox.spec.ts` now guards it.
- One PHQ-9 with item 9 set produced two `risk_events` rows and two audit rows: one from the edge function, one from a DB trigger. Fixed: the trigger is now the single source of truth and the edge function no longer inserts the event. The crisis spec still accepts one or more events, so it would not catch a return of the duplicate by itself. The regression is covered by unit tests and pgTAP.
- The counsellor page logged an unhandled rejection: `cannot add postgres_changes callbacks for realtime:counsellor-risk-events after subscribe()`. Fixed: realtime channels now get unique topics, so re-subscribing no longer reuses a channel that is already subscribed.
- The `supabase_realtime` publication was empty, so the counsellor crisis queue never received a live update and changed only on reload or the 5 minute refresh. Every unit test had mocked the channel, so only a real run could show it. Fixed in migration `0008_realtime_publication.sql`, which publishes `risk_events`, `risk_followups` and `notifications`. pgTAP file 14 checks the publication. Realtime still applies row level security, so a counsellor receives only events of students who shared `risk_events` with them.

### Live-update expectation

With the stack running, a counsellor who has the queue open and a current care share should see a new high or crisis event appear without reloading, the queue badge should read "Live", and no `postgres_changes` error should appear in the console. TODO: the current `crisis-followup.spec.ts` opens `/counsellor` after the event exists, so it does not assert the push itself. A test that keeps the counsellor page open while the student submits the PHQ-9 would. The publication itself is tested in pgTAP file 14, and the "Live" badge in unit tests.

## Measured runs

Two consecutive full runs by the worker passed after the final changes: 5 passed, 0 flaky, 0 retries, 69 s and 71 s wall time including the dev server start. The lead ran the suite once more (2026-11-20) and it passed again: 5 passed. Chromium only. Firefox, WebKit and real-device PWA install are not tested.
