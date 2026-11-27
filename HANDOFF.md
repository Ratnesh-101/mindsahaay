# HANDOFF: MindSahaay capstone (read this first in the next session)

Written 2026-11-27, ~10:40 IST, at ~85% of the context window. This file lets a fresh session continue without re-deriving anything. Facts below were measured in the session unless marked "unverified".

## 1. What the project is
MindSahaay: a privacy-first digital mental health platform for Indian university students (capstone project, owner GitHub `Ratnesh-101`, repo https://github.com/Ratnesh-101/mindsahaay, **public**).
Stack: React 19 + Vite 8 + TypeScript + Tailwind v4 frontend (state-based shell with React Router), Supabase (Postgres + Auth + RLS + Realtime + Deno edge function `server`), Claude API companion (needs `ANTHROPIC_API_KEY`, not available locally), client-side encrypted journal, offline PWA outbox. Read `README.md`, `AGENTS.md`, `docs/00-README.md`, `docs/19-known-limitations.md` for detail.

## 2. State at hand-off (2026-11-27, end of the demo-data task)
The "demo data button, no fabricated data, real data is saved" task is DONE, verified as a whole and committed (15 code commits plus docs on top of `e84e4b2`).
Measured: typecheck 0 errors; eslint clean (src and e2e); Vitest 910 passed, 1 skipped (80 files + 1 skipped); coverage 91.99% lines, 90.02% statements, 87.34% functions, 82.22% branches; production build green; `supabase db reset` + `supabase test db`: 15 files, 184 tests pass; Playwright demo+PWA 102/102; Playwright real-backend 24/24 (10 older + `fresh-account`, `demo-data`, `persistence`, `preview-flag`).
Not run: Lighthouse, ZAP, hosted Supabase, real-device PWA, LLM evaluation, CI on a real runner.

## 3. What the task changed
See `docs/31-demo-data.md` (migration 0009: `is_demo`, `load_demo_data()`, `clear_demo_data()`, counsellor and analytics exclusion) and `docs/32-persistence-audit.md` (about 15 flows made honest). Settings data export now uses real consent records and fails loudly.
Decisions the owner still owes (do not decide for them): (a) should chat conversations be saved (retention, client-side encryption)? (b) do stories need a per-user likes table? (c) should CBT, worry-time and safety-card anchor data sync across devices (today device-only)?

## 4. Possible next steps
1. Owner decisions above. 2. Native Hindi review of the new keys listed in `docs/27-hindi-review.md`. 3. Anything in section 7 (keys, ethics, hosted Supabase). 4. Push is done only after the owner's go-ahead is recorded in git history; check `git status -sb` for ahead/behind.

## 5. Environment (how to bring everything up; nothing survives a reboot)
- Scratchpad: `C:\Users\Admin\AppData\Local\Temp\claude\565ec6077978de86\6d983fb0-6a84-4da1-a951-045cb7327bc5\scratchpad` (prompts in `prompts/`, logs and worker reports in `logs/`, real-browser scripts in `real/`, backup bundle `mindsahaay-309-commits.bundle`). A reboot or cleanup can clear it: worker reports there are NOT durable.
- Start Docker Desktop, then from the project root: `npx --yes supabase start`; `npx --yes supabase functions serve --env-file <scratchpad>/functions.env` (file content: `ALLOWED_ORIGINS=http://127.0.0.1:5180,http://localhost:5180`; recreate if missing); `npx vite --port 5180 --host 127.0.0.1 --strictPort`. The edge function returns 503 for about 100 seconds after a cold start.
- Ports: app 5180; Supabase API 54321; DB 54322; Studio 54323; mail catcher (magic links) 54324; Playwright default+pwa 5291/5292; real-backend project 5293/5294; DB container `supabase_db_mindsahaay`.
- `.env.local` (git-ignored) has `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_FUNCTIONS_SLUG=server`. Never print the key. To sign in: any email on the login page, open the link from the mail catcher.
- Only ONE worker/session at a time may run `supabase db reset`.

## 6. Owner's rules (non-negotiable)
- **NO `Co-Authored-By` line** or any trailer in commits (this overrides any default).
- Commit author email: **`75908053+Ratnesh-101@users.noreply.github.com`** (repo-local git config already set). Never put the owner's personal emails anywhere (the old history exposed one; see section 7).
- **Never backdate** commits; **never force push** unless the owner explicitly asks again; no empty commits; explicit `git add <paths>` only; scan for secrets before committing.
- Keep **LF line endings**. On Windows, Python text-mode writes silently convert files to CRLF (this happened and showed as a 360-line diff for a 4-line change). Edit surgically, or read/write bytes, or use `newline="\n"`.
- Be honest in reports: never claim a test or flow works without running it; say what was not verified.
- The owner wants: multiple **agy** and **kiro** workers launched in parallel with **monitors**, autonomous work, and consulting Opus for decisions when stuck.

## 7. Open items (owner decisions already made noted)
- **GitHub contribution count:** GitHub still counts 459 commits for `mindsahaay` on 2026-11-21 (309 old + 150 new; 482 total that day). The owner **decided NOT to delete the repo** and to wait. Do not rewrite history again. Re-check with the GraphQL `contributionsCollection` query if asked.
- The **old commits (one with a personal Gmail address) are still fetchable by hash on GitHub**; only deleting and recreating the repo removes them. Repo is public; recommend private until the supervisor has seen it. Owner has not asked for either.
- One leftover Dependabot branch `dependabot/github_actions/actions/checkout-7` exists; harmless.
- Local branches `backup-309` (the old 309-commit history) and `rebuild` exist locally only; never push them.
- Pending, need the owner: Anthropic and Daily.co keys (AI chat, LLM and hybrid classifier evaluation: keyword-only held-out recall is 0.70 against the 0.95 target, evaluation scripts verified only against a mock); native Hindi review (`docs/27-hindi-review.md`); ethics approval, survey, interviews, usability study, clinical advisor review; hosted Supabase project; CI workflows never run on a real runner; real-device PWA install and non-Chromium browsers untested; Lighthouse and ZAP never run.
- The warm handoff and server-side check-back opt-out are built (migration 0006) but only unit/pgTAP tested, no real-browser end-to-end test.

## 8. How to run workers and monitors (what worked)
- agy: `agy -p "<prompt>" --dangerously-skip-permissions` (its log stays EMPTY until it finishes: judge progress by file changes or git commit counts). kiro: `kiro-cli chat --no-interactive --trust-all-tools "<prompt>"` (dies with "Kiro cannot reach the network" on an outage: relaunch with a "review the partial state first" note).
- Write prompt files with the Write tool, not bash heredocs: quotes in them broke the Bash tool several times. Prompt pattern: `prompts/common.txt` (scope rules) + a contract file + the worker task; always give disjoint folder scopes, a report path, and say who may run Playwright (own `E2E_PORT` and `--output`) and `db reset` (one worker only).
- Monitors expire after 30 minutes: re-arm. Useful ones: worker lifecycle (PID alive, report present, network errors, stall heartbeat via files changed in 10 min), typecheck (report only on change), services (API, app, internet; a 503 or 000 right after a worker's `db reset` is expected), live guards for commit rules.
- Windows note: `$(...)` containing quotes in one bash line can fail with "unexpected EOF": split into steps or use PowerShell.

## 9. Bugs found by RUNNING the system (so you do not reintroduce them)
TanStack Query pauses mutations while offline unless `networkMode: "always"` (offline mood queue was unreachable); the Realtime publication was empty (migration 0008 publishes risk_events, risk_followups, notifications); global CSS classes `.p-0` to `.p-5` collided with Tailwind padding (renamed `.particle-N`); one PHQ-9 item 9 used to create two risk events (the DB trigger is now the single source); realtime channels need unique topics; the Vite watcher must ignore `test-results*` (crashed the dev server); account erasure must delete on the server first and then wipe the device including the outbox; the logout dialog must allow Escape and show helplines; a status card must never say "told a counsellor" when nobody can see the alert; SECURITY DEFINER functions need a fixed search_path and revoked PUBLIC/anon execute.

## 10. Where things are
`docs/` (34 files: SRS, architecture, ERD, threat model, DPIA, clinical safety case, test plan and report, evaluation plan, report chapters in `docs/report/`, slides in `docs/slides/`, SQL audit 21, edge tests 22, frontend security review 23, follow-up 24, offline 25, PWA 26, Hindi review 27, independent review 28, real e2e 29, tournament 30, demo data 31, persistence audit 32 when U3 finishes). Backend: `supabase/` (9 migrations, 15 pgTAP files, edge function in `functions/server`). Frontend: `src/` (`domain`, `shared`, `app`, `features/*`). Tests: `src/**/*.test.ts(x)`, `e2e/` (demo + pwa + `e2e/real/`), `scripts/`, `eval/`.
