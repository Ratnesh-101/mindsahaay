# MindSahaay Capstone Documentation

MindSahaay is a privacy-first, educational (non-diagnostic) mental wellbeing platform for Indian university students. Stack: React 19, Vite, Tailwind v4, TypeScript, Supabase (Edge Function `server`), Claude API companion.

> **Status 2026-11-27.** 0 TypeScript errors; 0 ESLint errors and warnings on `src`; Vitest 80 files passed and 1 skipped (81), 910 tests passed and 1 skipped (coverage: statements 90.02%, branches 82.22%, functions 87.34%, lines 91.99%); Playwright default run 102 passed (Chromium only: 93 in the `chromium` project including 57 axe combinations with zero serious or critical violations, and 9 in the `pwa` project); real-backend Playwright 10 passed against a local Supabase before the newest specs (see `e2e/real`); pgTAP 15 files, 184 tests, all passing on a real local Postgres. Production build green, first route about 190.9 KB gzipped. Not done: Lighthouse, OWASP ZAP, hosted Supabase, the Anthropic chat route, Daily.co video, Firefox, WebKit, real-device PWA install, user studies, ethics approval, clinical sign-off, CI on a real runner. Two features chosen by the AI feature-selection tournament (30-feature-selection-tournament.md) are built: the **Crisis Follow-Through Loop** (24-crisis-followup.md) and **Lifeline Offline** (25-offline-pwa.md, 26-pwa-shell.md). The independent review (28-new-features-security-review.md) found a Critical defect (a reopened event never re-escalated); it is fixed in migration 0007 with failing-first tests. Alerts are in-app only and nothing is monitored 24/7. Details in 18-testing-report.md and 19-known-limitations.md.
>
> **Update 2026-11-19.** The table below describes the original prototype, before the current system was built. The system has since been rebuilt with feature folders, a 28-table Supabase schema (24 tables in migrations 0001 to 0004, 4 more in 0005; migrations 0006 to 0008 add the handoff and opt-out, security fixes and the realtime publication) and an edge function. For the current state see 02-srs.md section 6 (traceability matrix), 18-testing-report.md and 19-known-limitations.md.

## Baseline of the original prototype (historical)

| Area | Observed in prototype | Gap against target docs |
|---|---|---|
| Frontend | `src/App.tsx` single large component; tabs: home, chart, test, doctors, chat, heart, bell | Needs splitting, accessibility audit, i18n |
| API client | `src/api.ts`: `wellnessApi` (initialize, dashboard, mood, assessment, appointment, chat, journals, stories, export, delete) with a 4 s timeout and localStorage fallback | No real user authentication; anon key is sent as bearer |
| Backend | `supabase/functions/server/index.tsx` (Hono-style routes under `/make-server-6534ec8c/students/:studentId/...`) over a key-value store (`student:`, `moods:`, `assessment:`, `appointments:`, `chat:`) | Keyed by client-supplied `studentId`; no relational schema, no RLS |
| Crisis | Keyword list in `api.ts` returns a fixed helpline reply | Keyword-only, English-centric, no PHQ-9 item 9 path |
| Screening | PHQ-4 style items | Target adds PHQ-9 with item 9 handling |
| Privacy | Export and delete endpoints exist | Journals live in localStorage; encryption and consent records are not implemented |

The ERD, architecture and threat model describe the **target** system. Where they differ from the prototype, the documents say so.

## Index

| File | Purpose |
|---|---|
| 01-proposal.md | Problem, SMART objectives, scope |
| 02-srs.md | Requirements (IEEE 29148 style) |
| 03-architecture.md | C4 levels 1 to 3 |
| 04-erd.md | Data model |
| 05-uml.md | Use case, class, sequence, state diagrams |
| 06-threat-model.md | STRIDE, ASVS L1, OWASP LLM Top 10 |
| 07-privacy-dpia.md | DPDP Act 2023 matrix, DPIA, HIPAA/GDPR benchmark |
| 08-clinical-safety-case.md | Hazard log |
| 09-ethics-and-study-protocol.md | Consent, usability protocol, SUS |
| 10-test-plan.md | Test strategy |
| 11-ai-evaluation-plan.md | Crisis detection evaluation |
| 12-risk-register.md | Project risks |
| 13-literature-review-outline.md | Themes and candidate sources (unverified) |
| 14-demo-script.md | 8 minute demo |
| 15-roadmap.md | 18-week plan from 2026-11-23 |
| 16-user-manual.md | Student, counsellor, moderator, admin flows; consent; encrypted journal and lost passphrase |
| 17-deployment-guide.md | Supabase (Mumbai), migrations, secrets, Vercel, GitHub Actions, pgTAP, demo mode |
| 18-testing-report.md | Real test numbers, coverage, and what has not been run |
| 19-known-limitations.md | Frank list of limits |
| 20-final-report-outline.md | Chapter plan and the evidence only the student can add |
| 21-sql-audit.md, 22-edge-function-tests.md, 23-frontend-security-audit.md | SQL audit and local execution, edge function tests, frontend security audit |
| 24-crisis-followup.md | Crisis Follow-Through Loop: steps, roles, check-backs, escalation, honest limits |
| 25-offline-pwa.md | Lifeline Offline: encrypted outbox, shared-device threats, consent re-check, limits |
| 26-pwa-shell.md | Service worker, manifest, cache strategy and update flow |
| 27-hindi-review.md | Hindi strings that need a native reviewer |
| 28-new-features-security-review.md | Independent security and safety review of the two new features, with the final status of each finding |
| 29-real-backend-e2e.md | Opt-in Playwright specs against a real local Supabase (24 specs, all passing, including fresh-account, demo-data, persistence and preview-flag) |
| 30-feature-selection-tournament.md | How the two new features were chosen: six AI advocates, one AI judge, two elimination rounds |
| 31-demo-data.md | Demo data button: migration 0009, RLS and aggregate exclusion, crisis guard |
| 32-persistence-audit.md | Audit of every input: is it saved, and does the UI say so |

## Traceability approach

1. Every requirement has a stable ID (`FR-<AREA>-nn`, `NFR-<AREA>-nn`).
2. Hazards (`HZ-nn`), threats (`TH-nn`), privacy items (`PR-nn`), risks (`RK-nn`) and tests (`TC-<ID>`) cite requirement IDs.
3. Each test case name starts with the requirement ID it verifies, for example `FR-CRISIS-02 ...`, so a grep over the test folder produces the coverage matrix.
4. A requirement is "done" only when it has: an implementing module, at least one passing test, and, if safety-related, a hazard-log control referencing it.
5. The requirements-to-implementation-to-test matrix is in 02-srs.md section 6 (built by hand on 2026-11-19; test names do not yet carry requirement IDs). TODO: generate it with a script.

## Conventions

- "TODO" marks anything unverified or undecided. "to verify" marks literature entries that have not been checked.
- No clinical claim in these documents is validated by a clinician yet. TODO: clinical advisor review (see RK-05).
- Helplines used throughout: Tele-MANAS 14416 (also 1800-891-4416), KIRAN 1800-599-0019, emergency 112. TODO: re-verify numbers before every release.
