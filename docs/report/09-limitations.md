# Chapter 9. Limitations

This chapter restates docs/19-known-limitations.md in report form. The identifiers L1 to L50 are kept so that readers can cross-reference. The overall message is simple: the project demonstrates a design and a front end with good automated coverage, and it has not demonstrated clinical validity, regulatory compliance, measured usability or measured production performance.

## 9.1 Evidence limits

**The evaluation data are synthetic (L1).** All 600 messages were written for the project and none comes from a real student. Real messages are longer, messier and more varied. Performance on real text is unknown, and it is likely to be lower than the synthetic held-out figure because the data and rules share an author.

**One annotator (L2).** The author wrote and labelled every item. No inter-annotator agreement exists, so label noise and bias are unmeasured.

**No clinician review (L3).** Neither the label rubric, the lexicon, the AI prompt, the crisis wording nor the safety plan content has been reviewed by a qualified clinician or counsellor. No clinical claim can be made. The clinical safety case is a draft by a non-clinician.

**Low effective diversity (L4).** About 210 distinct core sentences were expanded to 600 by neutral openers and closers. Confidence intervals computed as if there were 600 independent items would be too narrow.

**Development scores are overfit (L5).** The v2 score of 0.975 on development data is not a result. The held-out 0.70 is the only usable figure, and it is optimistic.

**The held-out recall is below target (L6).** At 0.70 against 0.95, the deterministic layer misses many high and imminent messages, particularly euphemisms, attempts in progress and Hindi paraphrases.

**LLM and hybrid results do not exist (L7).** The hybrid design is untested. The "fail-safe OR" statement is a design intention.

**No user study (L8).** No survey, interviews or usability test exist, and no ethics approval is recorded. Claims about usefulness, usability and acceptance are unsupported. The personas are fictional.

**No measured performance (L9).** There is no Lighthouse score, load test, time-to-first-token or latency measurement for the whole system.

## 9.2 Engineering limits

**The SQL has not been run on a hosted project (L10, partly resolved 2026-11-20).** Migrations 0001 to 0008, the seed file and pgTAP files 01 to 14 have been executed on a local Supabase stack (CLI 3.2.0, Docker): 28 tables with row level security enabled on all of them, 146 pgTAP tests passing (final measurement 2026-11-20). Files 12 and 13 are regression tests for an independent review and pass after migration 0007. Running the SQL found 7 defects that the earlier read-only audit missed, including two RLS infinite recursions (docs/21, findings 22 to 28), which shows how much a static reading can miss. Hosted Supabase has not been tried, and passing tests cover only the cases written. Claims about row level security are therefore supported locally, not proven.

**Several verification steps are unrun (L11).** Lighthouse, ZAP, a dependency audit and the LLM evaluation have not been run. The default Playwright run (102 tests passing) is mostly in demonstration mode and in Chromium only, and the Vitest suite (818 tests passing, 1 skipped, in 71 files) uses mocked network calls. Only five Playwright tests (`pnpm test:e2e:real`, 5 passed) use a real local backend. The five CI workflows have never run on a real runner and the project is not in a git repository yet. There is no hosted deployment.

**The edge function is tested but only partly verified live (L12, partly resolved 2026-11-20).** It has 188 Vitest tests and was verified on the real Supabase edge runtime with real JWTs (sign-up, the PHQ-9 item 9 crisis event, 401 with only the anon key, the export IDOR closed). The Claude chat route (needs `ANTHROPIC_API_KEY`), Daily.co video tokens (need `DAILY_API_KEY`) and `pg_cron` were not verified.

**Diagrams not rendered (L13).** The Mermaid sources were checked by reading only.

**Role portals only partly backed by data (L14, not re-verified in full).** In demonstration mode `/counsellor`, `/moderator` and `/admin` show fixed sample pages. For a real session `/counsellor` and `/admin` now mount the API-backed dashboards, and `/moderator` still renders `ModeratorPortal`. None of the three was checked with live data. A static page may still show a minimum cohort of 50 which disagrees with the database rule of 10. The counsellor, moderator and administrator workflows are not demonstrated with real data.

**Legacy code (L15).** `src/api.ts`, `src/shared/data/mockData.ts` and `supabase/functions/server/kv_store.tsx` remain, and `Dashboard.tsx` and `Insights.tsx` show mock data, with no tests (0 percent coverage).

**Function name mismatch (L16, resolved 2026-11-20).** The front end now builds its function URL from `VITE_FUNCTIONS_SLUG`, which defaults to `server`, the same as the folder `supabase/functions/server`. Hosted deployment is still untried.

**Fallback project (L17, resolved 2026-11-20).** The hard-coded Supabase project in `utils/supabase/info.tsx` was removed. The file reads only `VITE_*` variables.

**Offline crisis access is partial (L18, updated 2026-11-20).** The earlier text said there was no service worker; there now is one, and after one online visit the crisis page with the three helplines loads with the network off. The limits are real: it was tested in desktop Chrome only and never on a phone or an installed app; iOS Safari has no Background Sync and may evict stored data; routes other than login, crisis, chat and dashboard show a plain offline page; the offline page and update toast Hindi is not native-reviewed (L48); client-side navigation to an uncached route fails offline until a reload (L47).

**Two lexicon copies (L19, resolved 2026-11-20).** The server copy is now generated from the browser lexicon by `scripts/sync-lexicon.mjs` (hash-checked, with a staleness test) and agrees with it on all 600 dataset rows. The generated file must be regenerated after each lexicon edit.

**Specification mismatches (L20 to L24).** The mood scale is 1 to 10 in code against five points in the SRS. Appointments have four states, not six. Posts default to `approved`. The 18+ confirmation exists in onboarding but is a client-side gate that the schema does not store. The model name `claude-opus-5-5` is hard-coded and unverified, and a wrong name would make every AI call fail.

## 9.3 Regulatory and clinical limits

**Regulatory claims unverified (L25).** References to the DPDP Act, the Mental Healthcare Act, UGC guidance, WCAG and OWASP, and the section numbers in `supabase/README.md`, were not checked against the primary texts and no lawyer reviewed them.

**Data residency (L26).** Chat text leaves India when it is sent to the AI provider, and handling under the Act is unresolved.

**Instruments (L27).** Licensing, band wording and Hindi translations are unchecked. Band names such as "moderate depression" read like diagnoses.

**Helpline numbers (L28).** They live in one file with a last-verified date (2026-11-20), and the service worker cache version is a hash that includes that file, so changing a number replaces every cached copy at the next update. A device that stays offline keeps the old copy. The date is the team's own record: no check against an official Ministry of Health source is documented (TODO), and the server README lists an unverified extra number. A wrong number on a crisis screen is a safety hazard.

**Escalation is in-app only and unstaffed (L29, updated 2026-11-20).** High and crisis events now follow a recorded five-step loop with overdue notifications and student check-backs. Alerts still appear only when a counsellor signs in. Nothing is monitored 24/7, no counselling service has agreed to receive or answer them, and there is no SMS, email or push. The timings have had no clinical review (L44), and the loop is empty for a student who has not shared `risk_events` with a counsellor (L45).

**Limits of the two new features (L38 to L50).** Nobody is alerted while the device is offline, and an event may arrive hours late or never (L38). The offline queue needs an unlocked journal vault, and Background Sync does nothing because the worker has no handler (L39). Offline detection is the keyword lexicon only, with held-out recall 0.70 (L40). The device clock may be wrong, so `detected_at` is a claim and `created_at` is the server time (L41). The crisis-consent cache must be filled while online (L42). The check-back opt-out and the warm handoff are built but young (L43). "Erase my account" used to leave the encrypted outbox on the device (L49, **fixed**: the server delete runs first, then the local wipe discards the outbox). An independent review (docs/28) listed ten findings, including a Critical one (a reopened event was not escalated a second time, L50). The findings were fixed in migration 0007 and in the app code, each with a failing-first test. The review was done by an AI worker, and no human security review exists.

**Still open for the two late features (final list, 2026-11-20).** Nobody is alerted while a device is offline; an event may arrive hours late or never. Alerts are in-app only (no email, SMS or push), and no service is staffed 24/7. The offline keyword detector has held-out recall 0.70. The Hindi strings for the new features have not been reviewed by a native speaker (L48, docs/27). iOS Safari has no Background Sync. The counsellor-to-student warm handoff and the server-side check-back opt-out are built (migration 0006, 22 pgTAP tests) and have unit, pgTAP and UI tests, but no real-browser end-to-end check. The auth `site_url` in `supabase/config.toml` is `localhost:5173` while the dev server may use another port. Magic links still work because the app passes its own redirect, but the config is wrong for a deployment.

**Lost passphrase means lost journal (L30).** There is no server-side recovery. This is intended, and must be explained to users in the manual.

**Chat privacy unconfirmed (L31).** Who writes the encrypted chat rows, and with which key, was not confirmed, and message text is sent to an external provider.

**Aggregate privacy (L32).** A suppression threshold of 10 is a floor, not a guarantee. Small institutions, repeated queries or combined views could identify people. Three documents give three thresholds (10, 20 and 50).

**Further limits (L33 to L37, added 2026-11-20).** Only Chromium has been tested (L33). The CI workflows have never run on a real runner and there is no git repository yet (L34). There is no hosted deployment (L35). Automated axe checks (57 of 57 combinations pass) are not a full accessibility audit; no manual keyboard, NVDA or real-device check has been done (L36). Frontend security findings SEC-01, SEC-02, SEC-04, SEC-05, SEC-07 and SEC-08 were still listed as open in docs/23 and docs/19 (not re-checked in this reconciliation), SEC-06 is unconfirmed, and SEC-03 is fixed and browser-verified (L37).

## 9.4 Additional limitations identified while writing this report

1. **View permissions.** Aggregate views were granted to all authenticated users without a role check in the view body (Section 5.5). The migration was later changed to `security_invoker` views (docs/21, finding 11) and the pgTAP file `05_k_anonymity_aggregates` passes on a local database. Hosted behaviour is untested.
2. **Recovery code generation** uses modulo reduction of random bytes, which has a small bias (Section 5.4.1).
3. **Test count drift.** Earlier documents recorded 345, 363 and 553 tests. The suite at the final run (2026-11-20) had 818 passing tests (1 skipped) in 71 files. Coverage and traceability counts should be regenerated whenever the suite changes (`node scripts/req-status.mjs` checks the requirements counts).
4. **Axe in night mode (fixed).** The `tel:112` button on the crisis page failed contrast in night mode at the first run (Section 6.5). It now passes the automated check, but a manual contrast check has not been done.
5. **Counts by hand.** The status counts of Chapter 3 were made by hand from the SRS.

## 9.5 Threats to validity of the evaluation

*Construct validity.* High+imminent recall on synthetic messages measures agreement with the author's labels, not detection of real suicidal ideation. *Internal validity.* The author wrote data and rules, so rules may encode the author's phrasing. *External validity.* Three languages, short messages, student register, one writer. *Statistical validity.* No intervals from the scripts, and clustering inflates apparent precision. *Reliability.* Deterministic rules are repeatable. The LLM layer will not be, and the plan to measure flip rate across repeated runs has not been executed.

## 9.6 What the project can honestly claim

- A working front end with 818 passing Vitest tests (1 skipped; mocked network), 90.6 percent line coverage within the measured scope, plus 102 passing default Playwright tests (Chromium only, mostly demonstration mode) and 5 passing real-backend Playwright tests, with 0 TypeScript errors and 0 ESLint errors.
- A privacy-oriented database and API that run on a local Supabase stack: 28 tables with row level security and 146 passing pgTAP tests (files 01 to 14, migrations 0001 to 0008), the edge function verified on the real edge runtime with real JWTs, and a manual real-session check of the main routes. Not run on a hosted project, and the Claude and Daily.co routes are unverified.
- A deterministic crisis lexicon with an honestly measured held-out recall of 0.70 and no false alarms on 45 hard negatives, on synthetic data.
- A transparent evaluation procedure with the LLM and hybrid runs ready to execute.
- A recorded in-app follow-up loop for high and crisis events and an encrypted offline outbox, checked in real browsers against a local Supabase (five real-backend tests). Neither is a staffed or 24/7 service, and nobody is alerted while a device is offline. An independent AI review found a Critical defect in the loop (reopened events not re-escalated) and nine other findings, all fixed with failing-first tests.
- A quality-assurance record of thirteen defects found by running the system and fixed with regression tests (Chapter 6, Section 6.3.3).

It cannot claim clinical validity, regulatory compliance, measured usability or measured production performance.
