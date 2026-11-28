# 17 Deployment Guide

**Status (2026-11-20): the local development path (section 12) has been executed.** A local Supabase stack (CLI 3.2.0, Docker) applied all 8 migrations (0001 to 0008) and the seed, all 14 pgTAP files pass (146 tests), the edge function ran on the real Supabase edge runtime, the app was used in a browser against it, and the real-backend Playwright project (section 12.3) passed 5 tests. **The hosted path (sections 3, 4 for a hosted project, 6.2 deploy, 8 Vercel) has not been tried**: no hosted Supabase project was created and nothing was deployed to Vercel. Expect to fix small errors there. Items that need a decision or a check are marked TODO.

MindSahaay is a student project, educational and not a medical device. Do not put real students' data into any deployment of it before the privacy, safety and legal reviews listed in 19-known-limitations.md are done.

## 1. Overview

| Part | Where it runs | Source |
|---|---|---|
| Web app (React, Vite) | Vercel (static site) | repository root, `pnpm build` produces `dist/` |
| Database, Auth | Supabase project, Mumbai region | `supabase/migrations/0001..0008`, `supabase/seed.sql` |
| API | Supabase Edge Function (Deno, Hono) | `supabase/functions/server` + `supabase/functions/_shared` |
| AI companion | Anthropic Claude API (default) or Google Gemini API, called only from the Edge Function | secrets/env `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` |
| Video sessions | Daily.co, called only from the Edge Function | secret `DAILY_API_KEY` |

## 2. Prerequisites

- Node 22 and pnpm 10.34.3 (pinned in `.mise.toml` and in `.github/workflows/ci.yml`).
- Supabase CLI (`supabase`). TODO: record the version you used.
- Docker Desktop (needed for `supabase start` and for the pgTAP tests).
- Accounts: Supabase, Vercel, Anthropic (API key), Daily.co (optional, for video), GitHub.

## 3. Create the Supabase project in the Mumbai region

1. In the Supabase dashboard choose **New project**.
2. Region: **South Asia (Mumbai), `ap-south-1`**. Choose it so that data stays in India, which matters for the DPDP discussion in 07-privacy-dpia.md. TODO: DPDP cross-border rules for the Anthropic API call are not settled (chat text leaves India); see 19-known-limitations.md.
3. Save the database password in a password manager.
4. Note the **Project URL**, **anon key** and **service role key** (Settings, API). The service role key is secret; never put it in the frontend or in git.
5. Link the CLI: `supabase login`, then `supabase link --project-ref <your-project-ref>`.

## 4. Run the migrations

From the project root:

```powershell
supabase db push
```

This applies, in order:

| File | Adds |
|---|---|
| `0001_core.sql` | extensions (`uuid-ossp`, `pgcrypto`, `btree_gist`), enums, 15 tables, RLS policies |
| `0002_triggers.sql` | profile-on-signup trigger, append-only triggers, crisis trigger, three k-anonymity views |
| `0003_rate_limit.sql` | `rate_limits` table and `check_rate_limit()` |
| `0004_community_booking.sql` | 8 community and chat tables, `book_appointment_atomic()`, chat purge function |
| `0005_crisis_followup.sql` | 4 tables (`institution_backup_counsellors`, `risk_followups`, `risk_checkback_prompts`, `risk_checkbacks`), view `risk_queue`, RPCs `advance_risk_followup` and `escalate_overdue_risk`, a guarded `pg_cron` job (skipped with a notice if the extension is missing; unverified on a hosted project) |
| `0006_handoff_and_optout.sql` | column `profiles.checkback_opt_out`, RPCs `set_checkback_opt_out`, `offer_handoff_slot`, `accept_handoff_offer`, `decline_handoff_offer` |
| `0007_security_fixes.sql` | fixes from the independent review (docs/28): follow-up notification idempotency per cycle (a reopened event escalates again), no alias leak through a SECURITY DEFINER helper, tighter permissions and locking on the escalation RPC, revoked care shares no longer count as active, notifications that cannot be spoofed |
| `0008_realtime_publication.sql` | adds `risk_events`, `risk_followups` and `notifications` to the `supabase_realtime` publication |

Realtime note: the publication was empty before 0008, so the counsellor crisis queue received no live updates and showed new events only after a reload. On a hosted project check that the three tables are published: `select tablename from pg_publication_tables where pubname = 'supabase_realtime';`. RLS still decides what each subscriber receives. The app gives every realtime channel a unique topic, because re-subscribing to a reused topic fails with "cannot add postgres_changes callbacks after subscribe()".

Notes:

- The result should be **28 tables** in the `public` schema (see 04-erd.md). Check in the SQL editor: `select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';`.
- The SQL has been executed on a **local** Supabase stack (all 8 migrations apply, 28 tables, RLS on all of them). Executing it found 7 defects the static audit missed (doc 21, findings 22 to 28). It has **not** been run on a hosted project, so the first hosted run may still hit a difference (for example permissions on `auth.users`, extensions, `pg_cron`). Fix the migration, do not edit the database by hand.
- `0004` tries to enable `pg_cron` and schedule the daily chat purge; it prints a notice and continues if `pg_cron` is unavailable. In the Supabase dashboard enable the **pg_cron** extension (Database, Extensions) if you want the purge, or call `select purge_expired_chat_messages();` manually.
- Back up before any migration against a database with data.

## 5. Seed data (demo database)

`supabase/seed.sql` inserts **synthetic** fixtures: 1 institution, 1 super admin, 1 institution admin, 1 moderator, 3 counsellors, 12 students, moods, assessments, thought records, 4 circles, posts and comments. It writes into `auth.users`, so it works on a local Supabase stack. For a hosted project:

```powershell
# local stack: migrations + seed in one step
supabase start
supabase db reset
```

For a hosted project, run the seed only on a **demo** project, through the SQL editor, and delete the demo accounts before any real use. TODO: confirm that inserting into `auth.users` is permitted on your hosted project; if not, create the users in the Auth dashboard and adapt the seed.

The demo logins listed in `supabase/README.md` (for example `admin@mindsahaay.test`) are fixtures only. Set real passwords or delete them before exposing the project.

## 6. Edge Function and secrets

### 6.1 Secrets and Environment Variables

| Name | Used for | Notes |
|---|---|---|
| `AI_PROVIDER` | Selects AI backend: `claude` (default) or `gemini` | Any other value disables the model and routes chat to the deterministic fallback template + helplines. |
| `ANTHROPIC_API_KEY` | Chat companion, risk classifier, moderation via Claude | Required if `AI_PROVIDER=claude`. Server only. |
| `GEMINI_API_KEY` | Chat companion, risk classifier via Google Gemini | Required if `AI_PROVIDER=gemini`. Passed ONLY via header `x-goog-api-key` (never in the URL). Server only. |
| `GEMINI_MODEL` | Gemini model identifier | Default is `gemini-3.8-flash` (unverified against live API; alternative `gemini-3.5-flash-lite`). Defined in one constant. |
| `AI_DATA_TIER` | Data tier classification: `free` or `paid` | In free tier, Google terms permit human review and training on user content. |
| `AI_ALLOW_FREE_TIER` | Explicit consent flag: `true` | The server strictly refuses Gemini calls (falls back to template path) unless `AI_DATA_TIER=paid`, OR (`AI_DATA_TIER=free` AND `AI_ALLOW_FREE_TIER=true`). |
| `GEMINI_CALLS_PER_MIN` | Rate limit per minute for Gemini calls | Shared project-wide limit via `checkRateLimit` (key `llm:gemini:min`). Recommended ~80% of AI Studio quota (e.g. `12` for 15 RPM). |
| `GEMINI_CALLS_PER_DAY` | Rate limit per day for Gemini calls | Shared project-wide limit via `checkRateLimit` (key `llm:gemini:day`). Recommended ~80% of AI Studio quota (e.g. `1200` for 1500 RPD). |
| `DAILY_API_KEY` | Video room tokens | Optional. README says there is a mock fallback; TODO verify in code. |
| `ALLOWED_ORIGINS` | CORS allow list, comma separated | Include your Vercel URL and, for local dev, `http://localhost:5173,http://localhost:8443` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Edge Function database access | Supabase injects these into hosted functions by default. TODO confirm for your CLI version. |

Set them for hosted deployment (paid tier only):

```powershell
supabase secrets set AI_PROVIDER=claude ANTHROPIC_API_KEY=sk-ant-... DAILY_API_KEY=... ALLOWED_ORIGINS=https://your-app.vercel.app,http://localhost:5173
```

For local serving create `supabase/.env` (git-ignored) with the same names and run `supabase functions serve --env-file supabase/.env`. Never commit keys.

### 6.2 Deploy the function (name mismatch resolved)

The frontend builds its function URL as `${VITE_SUPABASE_URL}/functions/v1/${VITE_FUNCTIONS_SLUG}/...` (`src/shared/lib/supabase.ts`), and the slug defaults to `server`. That matches the folder name `supabase/functions/server`, so the old `make-server-6534ec8c` mismatch no longer applies. Do not set `VITE_FUNCTIONS_SLUG` to anything else unless you deploy the function under another name.

The function's entrypoint is `index.tsx`, which the CLI does not auto-discover, so `supabase/config.toml` declares it:

```toml
[functions.server]
enabled = true
verify_jwt = true
entrypoint = "./functions/server/index.tsx"
```

Deploy (hosted, **not yet tried**):

```powershell
supabase functions deploy server
```

The function also verifies the user JWT itself on every route except `/health`. TODO: check on a hosted project whether `verify_jwt = true` blocks the unauthenticated `/health` call and whether `--no-verify-jwt` is needed for it. Locally, `/health` works.

Check: `GET <project-url>/functions/v1/server/health` should return a healthy status (verified locally on 2026-11-20; not on a hosted project).

### 6.3 Owner Runbook: Running Locally with a Free Google Gemini API Key

The owner can evaluate MindSahaay using a free Gemini API key from Google AI Studio. Follow these exact steps:

1. **Verify git-ignore protection:**
   Verify that `supabase/.env` is ignored before creating or editing it:
   ```powershell
   git check-ignore -v supabase/.env
   ```
   This must print a match rule (e.g. `.env*`). Never remove or bypass this ignore rule.

2. **Create local environment file `supabase/.env`:**
   Populate `supabase/.env` with the following variables:
   ```ini
   ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8443
   AI_PROVIDER=gemini
   GEMINI_API_KEY=AIzaSy...                # Your Google AI Studio key
   GEMINI_MODEL=gemini-3.8-flash           # Default flash model (unverified against live API)
   AI_DATA_TIER=free
   AI_ALLOW_FREE_TIER=true
   GEMINI_CALLS_PER_MIN=12                 # ~80% of 15 RPM AI Studio free quota
   GEMINI_CALLS_PER_DAY=1200               # ~80% of 1500 RPD AI Studio free quota
   ```

3. **Start local edge functions:**
   ```powershell
   supabase functions serve --env-file supabase/.env
   ```

4. **Verify frontend chat behaviour:**
   - On the Chat screen, an authenticated client calls `GET /chat/config` and receives `{ provider: 'gemini', dataTier: 'free' }`.
   - A non-dismissible red banner appears above the chat:
     > **Demo mode:** Messages go to Google's free Gemini service, may be read by human reviewers and used to improve Google products. Do not enter real or identifying information.
   - Before the first message can be sent, a one-time acknowledgement modal is presented to the user. Once accepted, this state is recorded in `sessionStorage` only (never persisted to the server or `localStorage`).
   - If rate limits (`GEMINI_CALLS_PER_MIN` or `GEMINI_CALLS_PER_DAY`) are reached or Google returns HTTP 429, the system gracefully falls back to deterministic empathetic templates + helplines with no errors shown to the user.

5. **CRITICAL SECURITY AND PRIVACY RULES FOR THE OWNER:**
   - **NEVER** run `supabase secrets set GEMINI_API_KEY=...` on a hosted Supabase project using a free-tier key. Google AI Studio unpaid terms allow human reviewers to read submitted prompts/responses and use them to train Google models, violating mental health confidentiality and DPDP purpose limitations.
   - **Synthetic Test Data Only:** Only enter synthetic, fictitious, or test messages during demo mode. Never enter real student names, roll numbers, or personal distress narratives.
   - **Rotate After Demo:** Immediately delete or rotate the API key in Google AI Studio once the demonstration or evaluation is concluded.

## 7. Frontend environment variables

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Your project URL, for example `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The anon (public) key. Never the service role key. |
| `VITE_FUNCTIONS_SLUG` | Edge function name in the URL. Defaults to `server`. |
| `VITE_DEMO_MODE` | `true` forces Demo Mode on for every visitor (see section 10). Leave unset or not `true` in production. |

`utils/supabase/info.tsx` no longer holds a hard-coded project id or key: it reads only `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Set both `VITE_SUPABASE_*` values in Vercel and locally, otherwise the app has no backend.

Local file `.env.local` (git-ignored; `.env.example` in the repository is the template):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_FUNCTIONS_SLUG=server
```

Add `http://localhost:5173` (or `8443`) and your Vercel URL to Supabase Auth, URL Configuration (redirect URLs) so magic links return to the app. `supabase/config.toml` lists redirects for local use only. Google sign-in additionally needs a Google OAuth client configured in Supabase Auth. TODO: untested.

## 8. Deploy the frontend on Vercel

1. Import the GitHub repository in Vercel.
2. Framework preset: **Vite**. Install command `pnpm install --frozen-lockfile`. Build command `pnpm build`. Output directory `dist`. Node 22.
3. Add the environment variables from section 7.
4. The app uses client-side routes (`/dashboard`, `/chat`, ...). The repository's `vercel.json` already contains the SPA rewrite to `/index.html` and the security headers described in 23-frontend-security-audit.md (Content-Security-Policy, HSTS and others). It has not been tested on a real Vercel deployment. The CSP `connect-src` allows `https://*.supabase.co` only, so a production build is meant for a hosted Supabase project, not for the local stack.

5. `vite.config.ts` imports `./.figma/make/site.json`. Confirm that this file is committed, or the Vercel build fails. TODO.
6. After the first deploy, add the Vercel URL to `ALLOWED_ORIGINS` (section 6.1) and to the Supabase redirect URLs.

## 9. GitHub Actions

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests:

| Job | Steps |
|---|---|
| `verify` | `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:cov`, `pnpm run build` |
| `e2e` (needs `verify`) | installs Chromium, `pnpm run test:e2e` (Playwright, includes the axe accessibility spec), uploads report on failure |

`.github/dependabot.yml` exists for dependency updates. Besides `ci.yml` there are `e2e.yml` (Playwright), `security.yml` (Gitleaks, CodeQL, non-blocking audit), `pgtap.yml` (starts local Supabase and runs `supabase test db`) and `eval-nightly.yml` (keyword evaluation, LLM evaluation only if the secret exists). **None of the five workflows has ever run on a real GitHub runner, and the project is not in a git repository yet** (TODO: confirm the first run is green once it is). No workflow deploys. Never put `ANTHROPIC_API_KEY` in a workflow that runs on pull requests from forks.

## 10. Demo-mode setup

Demo Mode lets reviewers run the app without a backend, with five fixed demo users and static data.

- **Per visitor:** on the sign-in page choose Demo Mode and pick a role. This stores `mindsahaay_demo_mode` and `mindsahaay_demo_role` in the browser's localStorage. "Exit demo" clears them.
- **Whole build:** set `VITE_DEMO_MODE=true` (for example on a separate Vercel project used only for showing the app).
- Demo Mode does not exercise RLS, the Edge Function or the AI. Do not use it as evidence that the backend works.
- Do not enable `VITE_DEMO_MODE` on a deployment that real students use.

## 11. Run the pgTAP database tests (Supabase CLI and Docker)

The tests are in `supabase/tests/01_*.test.sql` to `14_*.test.sql`: 14 files, 146 tests. Files 01 to 07 cover RLS isolation, care shares, zero-knowledge journals, triggers and append-only, k-anonymity, community and chat, and security gaps. Files 08 to 11 cover the follow-up loop, handoff and opt-out. Files 12 and 13 are regression tests for the independent review in docs/28, written to fail first. File 14 checks the realtime publication from migration 0008. On a local Supabase stack all 14 files pass (146 tests, 2026-11-20).

```powershell
# Docker Desktop must be running
supabase start          # starts local Postgres with the migrations applied
supabase test db        # runs every file in supabase/tests with pg_prove
supabase stop
```

If a test needs seed data, run `supabase db reset` first (applies migrations and seed). The tests have passed locally; they have **not** been run on a hosted project or in CI. Record any new output in 18-testing-report.md.

## 12. Local development

### 12.1 Front end only (demo mode, no backend)

```powershell
pnpm install
pnpm dev          # Vite on the PORT variable, default 8443
pnpm test         # Vitest
pnpm typecheck
pnpm lint
```

Choose Demo Mode on the sign-in page, or set `VITE_DEMO_MODE=true`.

### 12.2 Full local stack (Supabase in Docker, executed 2026-11-20)

Requirements: Docker Desktop running, Supabase CLI (3.2.0 was used).

1. Start the stack and load the schema and seed data:

```powershell
supabase start        # starts Postgres, Auth, the local mail catcher and the edge runtime
supabase db reset     # applies migrations 0001 to 0008 and supabase/seed.sql
supabase status       # prints the API URL (http://127.0.0.1:54321) and the anon key
```

2. Serve the edge function with an env file. Create `supabase/.env` (git-ignored) with `ALLOWED_ORIGINS=http://localhost:8443,http://localhost:5173`, and add `ANTHROPIC_API_KEY` and `DAILY_API_KEY` only if you have them (without them the chat and video routes cannot be used):

```powershell
supabase functions serve --env-file supabase/.env
```

The function is declared in `supabase/config.toml` as `[functions.server]` with `entrypoint = "./functions/server/index.tsx"` (the CLI does not auto-discover `index.tsx`) and `verify_jwt = true`. It is served at `http://127.0.0.1:54321/functions/v1/server`.

3. Create `.env.local` in the project root:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key from supabase status>
VITE_FUNCTIONS_SLUG=server
```

4. Run the app with `pnpm dev`.

5. Sign in with a magic link. Local Auth sends no real email: open the local mail catcher at **http://127.0.0.1:54324**, open the message and follow the link. It lands on `/dashboard`. Make sure the dev server origin (`http://localhost:8443` or `5173`) is in the redirect list in `supabase/config.toml` (`additional_redirect_urls`), otherwise the link is rejected.

6. Database tests: `supabase test db` (14 files, 146 tests, all passing on 2026-11-20). Stop the stack with `supabase stop`.

If you edit `src/domain/risk/lexicon.ts`, run `pnpm sync:lexicon` (or `node scripts/sync-lexicon.mjs`) to regenerate the server copy `supabase/functions/_shared/lexicon.generated.ts`. A test fails when the hash is stale.

### 12.3 Real-backend end-to-end tests

With the local stack running (steps 1 to 3 above, including `.env.local`), run:

```powershell
pnpm test:e2e:real
```

This runs `node e2e/real/run.mjs`, which starts its own Vite dev server on port 5294 with `VITE_DEMO_MODE=false` and runs the `real` Playwright project (Chromium only) against the local Supabase. It writes test data to the local database, and a plain `npx playwright test` does not select it. Last result: 5 passed (sign-in and route sweep, crisis follow-through loop with security attempts, offline mood and crisis outbox, shared-device case). See 29-real-backend-e2e.md. It has not run in CI or against a hosted project.

### 12.4 Vite watch ignore

`vite.config.ts` tells the dev server not to watch test output and generated folders (`**/test-results*/**`, `**/playwright-report/**`, `dist`, `dist-pwa`, `coverage`, `supabase/.temp`, `node_modules`). Playwright keeps trace files open in those folders, and the resulting locked-file error (EBUSY) used to crash the dev server during test runs. If you add another output folder, add it to `server.watch.ignored`.

What this local path does not cover: the Claude chat route and Daily.co video tokens (need your own API keys and were not verified), `pg_cron`, and anything about a hosted project.

## 13. Release checklist

- [ ] Migrations applied on the hosted project, `select count(*)` shows 28 tables (done locally only).
- [ ] `supabase test db` green, output saved (green locally; not yet on hosted or CI).
- [ ] Function deployed as `server`, matching `VITE_FUNCTIONS_SLUG` (section 6.2), `/health` works (works locally; hosted not tried).
- [ ] Secrets set, none in git (`git log -p` search for `sk-ant`).
- [ ] `ALLOWED_ORIGINS` and Auth redirect URLs include the production URL.
- [ ] No hard-coded Supabase project in the build (the fallback in `utils/supabase/info.tsx` was removed; check the built bundle).
- [ ] Helpline numbers re-verified against official sources.
- [ ] Demo seed accounts removed or re-secured.
- [ ] Privacy notice, consent text and clinical safety case reviewed by qualified people.
