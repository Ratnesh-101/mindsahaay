# Chapter 10. Conclusion and Future Work

## 10.1 Summary

The project set out to build a privacy-first, non-diagnostic wellbeing platform for Indian university students with a crisis path that does not depend on a model. A React 19 and TypeScript application with feature modules, pure domain logic for scoring, risk detection and cryptography, and a Supabase back end with a 28-table schema and an edge function proxy for Claude has been built. Two features chosen late by a structured selection (Chapter 4.14) were added: a recorded follow-up loop for high-risk events and an offline layer (service worker and encrypted outbox) that keeps the helplines available without a network. The central safety rule is implemented and tested: a non-zero PHQ-9 item 9 answer always triggers the crisis protocol, regardless of total score, and the three helplines (Tele-MANAS 14416, KIRAN 1800-599-0019, emergency 112) are one tap away from every main route, confirmed in an end-to-end test on all 11 main routes. Journals are encrypted in the browser with AES-256-GCM under a PBKDF2-derived key, and institutional reporting is restricted to suppressed aggregates by design.

## 10.2 Findings against the aim

**The architecture works as a demonstration.** On the final run (2026-11-20) 818 Vitest tests passed (1 skipped, 71 files), 102 default Playwright tests passed (Chromium, mostly demonstration mode), 5 real-backend Playwright tests passed against the local Supabase stack, and 146 pgTAP tests passed on a local Postgres. The demonstration mode lets all roles be shown without a back end. TypeScript and ESLint report no errors. The application has not been deployed.

**The crisis detector falls short of its target, and the shortfall was measured honestly.** A first keyword version recalled 0.30 of high and imminent messages on held-out synthetic data. A second version reached 0.70. The development score of 0.975 reflects overfitting. The target of 0.95 was not reached, and the conclusion that the keyword layer must be paired with an LLM layer is a hypothesis awaiting the pending evaluation.

**Privacy by design is credible on paper and unverified in practice.** The cryptography is unit tested. The database security rules and aggregate views have been executed on a local Supabase stack (146 pgTAP tests pass in files 01 to 14), which found seven defects that reading had missed. An independent AI review of the two new features (docs/28) then found ten more findings, one Critical (a reopened event was not escalated again). All were fixed in migration 0007 and the app code, with tests written first. Running the system found thirteen defects in total, each fixed with a regression test (Chapter 6, Section 6.3.3). The view-permission concern found on reading was addressed with `security_invoker` views. Nothing has been run on a hosted project, and no legal review or professional penetration test exists; the only independent review is the AI-assisted one in docs/28.

**Accessibility is incomplete.** The design system sets high standards. Axe first found contrast and naming failures on 38 of 56 route, theme and width combinations; these were fixed and all 57 combinations now pass with zero serious or critical violations. No manual keyboard, screen reader or real-device audit has been done, and only Chromium was tested.

**The user-facing questions remain unanswered.** There is no evidence yet that students find the platform usable, useful or trustworthy. [STUDENT: insert SUS result, survey and interview findings, or state that they were not collected.]

## 10.3 Contributions revisited

The principal contribution is a worked example of safety-first and privacy-first design for a sensitive student population, together with a method of reporting evidence that separates measured from planned. A secondary contribution is the evaluation result that rule-based detection tuned on a development split generalises poorly (0.975 to 0.70), and that per-language results differ (held-out Hindi recall 0.585). Both are small, synthetic and single-author findings and should be read that way.

## 10.4 Future work

Future work is ordered by how much it would change the credibility of the project.

**Priority 1: evidence the system is safe enough to pilot.**

1. Obtain a clinical or counselling advisor's review of the label rubric, hazard log, crisis wording, safety plan and AI prompt, and record sign-off. Include the follow-up timings (4 h, 12 h, 2 h, 24 h, 72 h), the closure reasons and the check-back wording (L44).
2a. Have a human security reviewer re-check the fixes for the findings in docs/28 (all fixed with tests; the review itself was done by an AI worker).
2b. Before any pilot, secure a staffed response: the follow-up loop has no one behind it at night, nobody is alerted while a device is offline, and alerts are in-app only, with no email, SMS or push (L29, L38).
2. Run the LLM-only and hybrid evaluations (commands in docs/11 section 0.5). Report held-out recall with cluster-aware intervals, per-language results, a false-negative analysis and flip rate over repeated runs.
3. Commission a second writer to produce a fresh held-out set, add a second annotator and compute inter-annotator agreement.
4. Verify the model identifier and the helpline numbers against official sources.

**Priority 2: verify the engineering claims.**

1. Done locally: migrations 0001 to 0008 and the seed run on a local Supabase stack and pgTAP files 01 to 14 (146 tests) pass. Remaining: repeat on a hosted project, run the workflows in `.github/workflows/` on a real runner (no git repository exists yet), and verify the Claude and Daily.co routes and `pg_cron` with real keys.
2. Done in part: edge function tests exist (188, re-counted 2026-11-20) and the function runs on the real edge runtime. Remaining: an integration test of the chat crisis path against the live model.
3. Done in part: the real counsellor and administrator dashboards are mounted for signed-in users. Remaining: check the moderator portal and role dashboards with live data, remove legacy mock code, and fix the `site_url` in `supabase/config.toml` (`localhost:5173`; magic links work only because the app passes its own redirect).
4. Done in part: a service worker serves the crisis page offline after one online visit (docs/26), and account erasure now deletes on the server first and discards the outbox. Remaining: test on real phones and iOS (no Background Sync there), add a Background Sync handler or remove the registration, review the Hindi text of the new features with a native speaker (docs/27), and add a real-browser end-to-end check of the warm handoff and the check-back opt-out.
5. Raise branch coverage of crisis components to the target and cover `SosModal` and `SafetyCardModal`.
6. The automated accessibility failures in Table 6.4 are fixed (57 of 57 combinations pass). Remaining: Lighthouse, a manual NVDA and keyboard audit, and tests in Firefox and WebKit.
7. The first-route bundle is under budget (about 190.9 KB gzipped against 200 KB). No further work is needed unless the budget changes.

**Priority 3: evidence of value.**

1. Obtain ethics approval, then conduct the survey, interviews and SUS usability study.
2. Pilot with a campus counselling service that agrees to receive and respond to alerts.
3. Seek legal review of the DPDP position, cross-border transfer, minors and grievance procedure.

**Priority 4: product extensions.**

Age confirmation at onboarding; mood edit and delete in the client; likes without identity; no-show and reschedule states; additional Indian languages through a validated process; a rejection-sampling recovery code generator; a recovery option that does not rely on one code; and, if the institution wants institutional reporting at all, a reviewed design for suppression across views and months.

## 10.5 Closing reflection

[STUDENT: personal reflection, in your own voice: what was hardest, what you would do differently, what you learned about building for people in distress, and what you would want an examiner to remember.]
