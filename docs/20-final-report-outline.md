# 20 Final Report Outline

A chapter-by-chapter plan for the capstone report. For each chapter: which existing documents supply the material, and which **evidence is still missing**. Items marked **STUDENT ONLY** cannot be produced by software or by this documentation; they need participants, an examiner-approved protocol or the student's own judgement.

Rules for the report:

- Quote only measured numbers (see 18-testing-report.md and 11-ai-evaluation-plan.md). Never quote the keyword v2 dev score of 0.975.
- Do not invent citations. Every reference in 13-literature-review-outline.md is marked "to verify"; verify each one or delete it.
- Use "designed with reference to" for regulations, not "compliant" (19-known-limitations.md L25).
- State clearly that the system is educational, non-diagnostic and not a medical device.

| Ch. | Title | Source documents | Missing evidence |
|---|---|---|---|
| Front matter | Title, abstract, acknowledgements, declaration, contents, lists of figures and tables | none | Write the abstract last, from final numbers. **STUDENT ONLY**: declaration and acknowledgements. |
| 1 | Introduction and problem statement | 01-proposal.md sections 1, 2 | **STUDENT ONLY**: evidence for the scale of the problem. Any statistic about student mental health in India must come from a source you have read and can cite (TODO, none supplied). |
| 2 | Objectives, scope and methodology | 01-proposal.md sections 3 to 6; 15-roadmap.md | Check each SMART objective against what was achieved (use the SRS matrix). State plainly which objectives are Partial or Not started. |
| 3 | Literature review | 13-literature-review-outline.md | **STUDENT ONLY**: read and verify about 30 sources, write the review, and fill the "gaps" section with real findings. Delete any source you cannot verify. |
| 4 | Requirements analysis | 02-srs.md (personas, FR and NFR lists, traceability matrix) | **STUDENT ONLY**: real needs elicitation. The personas are fictional until a survey and interviews confirm them. Add survey results and interview themes. |
| 5 | System design | 03-architecture.md (including the follow-up loop and offline layer diagrams, sections 3.3 and 3.4), 04-erd.md (28 tables), 05-uml.md (follow-up state machine and two new sequence diagrams, sections 8 to 10), 24-crisis-followup.md, 25-offline-pwa.md, 26-pwa-shell.md | Render every Mermaid diagram to an image and check it (19-known-limitations.md L13); this now includes the new diagrams in 03, 05, 24 and 25. The function-name mismatch (L16) is resolved; describe the partly data-backed role portals (L14) as a limitation. |
| 6 | Implementation | 03-architecture.md (module table), `src/domain/README.md`, `supabase/README.md`, 17-deployment-guide.md, 24, 25, 26 | Short code walkthrough of: scoring and item 9 rule, lexicon v2 pipeline, journal vault cryptography, atomic booking, k-anonymity views, the follow-up state machine in SQL (`validate_risk_followup_transition`) and the encrypted outbox with its send-time consent re-check. Screenshots from a running app (none exist yet). |
| 7 | Privacy, security and ethics | 06-threat-model.md (TH-21 to TH-32), 07-privacy-dpia.md (section 3.5, DR-08 to DR-12), 09-ethics-and-study-protocol.md, 28-new-features-security-review.md | pgTAP has been run on a local Supabase (146 tests pass in 14 files, migrations 0001 to 0008); repeat it on a hosted project. Report the independent review (docs/28) with its Critical finding, the fix in migration 0007 and the failing-first tests, and the erasure-versus-outbox defect (L49, closed, unit-tested only). Tell the defects found by running the system as a quality-assurance story (18-testing-report.md section 6.3). A security scan (ZAP, dependency audit) has not been run. **STUDENT ONLY**: ethics approval or a written statement of exemption from the institution. Legal review of DPDP claims (L25, L26). |
| 8 | Clinical safety | 08-clinical-safety-case.md (HZ-19 to HZ-24 for the two new features), `eval/results/*` | **STUDENT ONLY**: a qualified clinical or counselling advisor must review the hazard log, crisis wording and label rubric, the follow-up thresholds (4 h, 12 h, 2 h, 24 h, 72 h) and closure reasons, and sign it off. Without this, say so in the chapter. |
| 9 | AI evaluation | 11-ai-evaluation-plan.md sections 0 and 1 to 8, `eval/results/keyword.md`, `keyword-v2.md`, `comparison.md` | **Run LLM-only and hybrid evaluations** (PENDING; needs an API key; commands are in 11 section 0.5). Add a second annotator and, ideally, a second writer for a fresh heldout set. Report heldout numbers with honest intervals and the false-negative analysis. |
| 10 | Testing and verification | 10-test-plan.md, 18-testing-report.md, 29-real-backend-e2e.md, 02-srs.md section 6 | Run and record: pgTAP, Playwright with axe, the `real` Playwright project, Lighthouse, load test, `pnpm audit`, a manual keyboard and screen-reader check (NVDA), and the PWA on a real Android phone and an iPhone. Final measured numbers (2026-11-20): 818 Vitest passed (1 skipped), 102 Playwright passed (Chromium), 5 real-backend Playwright passed, 146 pgTAP passed in 14 files, line coverage 90.61%. Update these after any later run. Include the tournament record (30-feature-selection-tournament.md) in the method. |
| 11 | User evaluation | 09-ethics-and-study-protocol.md (consent form, scenarios, SUS, debrief, analysis plan), 14-demo-script.md | **STUDENT ONLY, none done:** (a) **survey** of target students; (b) **interviews** (students, ideally a counsellor); (c) **usability study** with SUS (plan says n of at least 12) and task success rates. Needs ethics clearance first. Report real sample sizes and results, however small or negative. |
| 12 | Results and discussion | all of the above | Compare outcomes with the SMART objectives and NFR targets in a table. Discuss: heldout recall 0.70 versus the 0.95 target, synthetic data, single annotator, and what the study could not show. |
| 13 | Risks, limitations and ethics of deployment | 12-risk-register.md, 19-known-limitations.md | Update the register with the actual state of each risk. |
| 14 | Conclusion and future work | 15-roadmap.md (future items), 19-known-limitations.md section 4 | **STUDENT ONLY**: personal reflection. Future work: clinician review, real deployment pilot with a counselling service that agrees to staff the alerts, expanded dataset, real-device PWA testing and a working Background Sync (or a design that does not need it), a vault-independent key for offline crisis items, native review of the Hindi safety text, a real-browser check of the warm handoff, and a spec that asserts the realtime push. (The service worker and the mounted role dashboards, previously listed here, now exist.) |
| Appendices | A. SRS matrix; B. ERD and schema; C. Consent form; D. SUS and scenarios; E. Dataset card (`eval/dataset/README.md`); F. User manual (16); G. Deployment guide (17); H. Demo script (14) | Add: raw survey and interview data (anonymised), usability study results, screenshots, rendered diagrams. |

## Evidence checklist (what only the student can add)

- [ ] Survey instrument and responses, anonymised, with ethics clearance.
- [ ] Interview guide, consent forms, transcripts or notes, themes.
- [ ] Usability study results (SUS scores, task success, observations).
- [ ] Clinical or counselling advisor review note and sign-off.
- [ ] Ethics approval or exemption letter.
- [ ] Verified literature list with real references.
- [ ] LLM-only and hybrid evaluation outputs (needs API key).
- [ ] Clinical review of the follow-up thresholds, check-back wording and closure reasons; a written agreement with a counselling service about who reads and answers alerts.
- [ ] A test of the PWA, offline page and outbox on a real Android phone and an iPhone.
- [ ] Native-speaker review of the Hindi strings in 27-hindi-review.md.
- [ ] Lighthouse and ZAP outputs and a hosted run (needs a deployment). pgTAP, Playwright and real-backend Playwright outputs exist locally (18-testing-report.md); attach them.
- [ ] Screenshots of the running app in day and night mode, English and Hindi.
- [ ] Rendered diagram images.
- [ ] Viva preparation: be ready to explain the crisis pipeline, why the system is non-diagnostic, what the 0.70 means, and why dev scores are not quoted.

## Suggested length and order of work

1. Fix blocking engineering gaps listed in 19 (L14, L39, L52, L53) or document them as limitations. (L49 is closed.)
2. Run the pending automated checks (pgTAP, Playwright, LLM evaluation) and update 18 and 11.
3. Obtain ethics clearance, then run the survey, interviews and usability study.
4. Get the clinical advisor review.
5. Write chapters 11 and 12 from real data, then the abstract and conclusion last.
