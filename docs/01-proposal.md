# 01 Project Proposal

## 1. Problem

Indian university students face entrance-exam pressure, mid-semester stress, hostel isolation, homesickness and career anxiety. Campus counselling capacity is limited, and stigma and fear of disclosure to the institution deter help-seeking. Existing apps are often English-only, store data on servers the student cannot control, or blur the line between wellness support and diagnosis.

TODO: support these statements with verified prevalence and counsellor-ratio sources (see 13-literature-review-outline.md). No statistics are quoted here until verified.

## 2. Proposed solution

MindSahaay is a privacy-first web app offering mood tracking, educational self-screening (PHQ-4 and PHQ-9), a journal, an AI companion (English, Hindi, Hinglish), counsellor appointment booking, and moderated peer stories. A crisis path is always one tap from any screen. Data is never shared with the university.

## 3. SMART objectives

| ID | Objective | Measure | Deadline |
|---|---|---|---|
| O1 | Crisis detection quality | Recall >= 0.95 on a 600-item English/Hindi/Hinglish test set for the hybrid system; reported with 95% CI | Week 14 |
| O2 | Responsiveness of AI companion | Time to first token p95 < 2.5 s in load test | Week 12 |
| O3 | Accessibility and performance | Lighthouse (performance, accessibility, best practices) >= 90 on key pages; WCAG 2.2 AA audit with no open Level A/AA failures | Week 13 |
| O4 | Quality | Automated test line coverage >= 80%; 100% of crisis-path requirements have a test | Week 15 |
| O5 | Usability | SUS mean >= 68 with n >= 12 participants in scenario-based study | Week 16 |
| O6 | Privacy rights | Export and erase flows complete in < 10 s and verified by test on all tables | Week 11 |
| O7 | Documentation | All planned documents (16 in the first plan; the set has grown to documents 02 to 30 plus a README by 2026-11-20) complete, traceability matrix with no orphan requirement | Week 18 |

## Status on 2026-11-20 (measured, not planned)

| ID | State |
|---|---|
| O1 | Not met. Keyword lexicon heldout recall 0.70 (docs/11). LLM-only and hybrid runs are PENDING (need an API key). |
| O2 | Not measured (no live Claude route, no load test). |
| O3 | Partly. 57 axe accessibility combinations (14 routes, light and dark, two widths) show zero serious or critical violations on Chromium. Lighthouse was not run. |
| O4 | Line coverage 90.61% (Vitest, 818 tests passed, 1 skipped), above the 80% target. The "100% of crisis-path requirements have a test" part is not verified (requirements matrix: 3 of 72 implemented, 60 partial, 9 not started). |
| O5 | Not started. No ethics approval, no participants. |
| O6 | TODO: export and erase are built and tested in parts; the "all tables in under 10 s" measurement has not been made. |
| O7 | In progress. The traceability matrix is not claimed complete. |

Two features chosen by an AI-run selection tournament (docs/30) are built: the Crisis Follow-Through Loop (docs/24) and Lifeline Offline (docs/25). They add a counsellor queue with follow-up steps and an offline outbox for crisis events. Neither makes the platform a monitored service: alerts are in-app only, and nobody is alerted while a device is offline.

## 4. In scope

- Student web app (responsive, PWA-ready), Supabase Auth, Postgres with row level security
- Mood log, PHQ-4/PHQ-9 educational screening, journal (client-side encryption)
- AI companion via a server proxy to the Claude API, with a crisis layer
- Counsellor directory, booking, appointment state machine, counsellor view of own bookings
- Peer stories with moderation
- Consent management, JSON export, erasure
- Evaluation: AI crisis detection study, usability study

## 5. Out of scope

- Clinical diagnosis, treatment, prescriptions, or any claim of medical device status
- Emergency dispatch or real-time monitoring of students
- Sharing individual data with university administration or faculty (Dean sees only aggregate, k-anonymised statistics, and only if the student cohort threshold is met; TODO decide whether to build this at all)
- Native mobile apps, payments, video infrastructure (a meeting link is stored, not hosted; code for Daily.co video tokens exists but has not been run against the real service)
- Languages beyond English, Hindi and Hinglish
- Minors under 18 (DPDP verifiable parental consent not built; sign-up asks for age confirmation. TODO legal review)

## 6. Assumptions and constraints

- Capstone team of limited size, 18 weeks, free or low-tier cloud services.
- Counsellors in the demo are fictional. Real counsellor onboarding needs institutional agreements (out of scope).
- Claude API data handling terms must be reviewed before any real-user deployment. TODO.

## 7. Deliverables

Working prototype, 16 documents, evaluation report, demo (8 min), final report.
