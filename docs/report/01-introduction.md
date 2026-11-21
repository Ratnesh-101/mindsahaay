# Chapter 1. Introduction

## 1.1 Background and motivation

Students in Indian higher education work under a combination of pressures that the project documents describe in plain terms: preparation for competitive entrance examinations, mid-semester assessment load, isolation in hostels, homesickness, and anxiety about placements and careers. Campus counselling capacity is limited, and stigma and fear that a disclosure will reach the institution discourage help-seeking. Many digital wellbeing products are English-only, hold user data on servers the user cannot inspect, or blur the line between wellness support and clinical diagnosis.

[CITATION NEEDED: prevalence of common mental health conditions among Indian university students. No statistic is quoted in this draft because none has been verified. Candidate sources are listed in Chapter 2 (sources 1 to 5) and every one is unverified.]

[CITATION NEEDED: ratio of counsellors to students in Indian higher education institutions, and the treatment gap in the general population.]

The motivation for MindSahaay ("sahaay" means help or support) is therefore practical. A student who is struggling at 2 a.m. in a hostel needs something that is available immediately, private enough to be used honestly, understandable in the language the student actually thinks in (English, Hindi or romanised Hinglish), and that leads quickly to a human when the situation is serious. The platform is designed to be that first step. It is not designed to replace a counsellor, and it is deliberately not designed to inform the university about any individual.

## 1.2 Problem statement

The problem addressed by the project can be stated as four linked questions.

1. How can a web platform give students low-barrier self-reflection tools (mood log, journal, educational screening) while keeping sensitive content unreadable to the service operator?
2. How can crisis signals in English, Hindi and Hinglish text be detected and routed to Indian helplines reliably enough that the safety case does not rest on a single fallible component?
3. How can an AI companion be offered without allowing it to diagnose, to give harmful advice, or to be the only safeguard?
4. How can an institution learn anything about aggregate wellbeing without being able to identify a student?

## 1.3 Aim and objectives

**Aim.** To design, build and evaluate a privacy-first, non-diagnostic wellbeing platform for Indian university students, with a crisis path that does not depend on the availability of an AI model.

The project proposal (docs/01-proposal.md) set seven SMART objectives. Their status at the time of writing is summarised in Table 1.1. The table is deliberately blunt: several objectives are unmet or unmeasured.

**Table 1.1 Objectives and status**

| ID | Objective (abridged) | Status in this draft |
|---|---|---|
| O1 | Hybrid crisis recall >= 0.95 on a 600-item held-out set with 95% CI | **Not met.** Keyword layer alone: 0.70 on held-out data. LLM-only and hybrid runs are PENDING. |
| O2 | Chat time to first token, p95 below 2.5 s | **Not measured.** No load test has been run. |
| O3 | Lighthouse >= 90 and WCAG 2.2 AA with no open A/AA failures | **Partly met (automated part only).** Lighthouse not run. Axe passes on 57 of 57 route, theme and width combinations with zero serious or critical violations; no manual audit (Chapter 6). |
| O4 | Line coverage >= 80% and tests for all crisis-path requirements | **Partly met.** On 2026-11-20 the suite (71 files passed, 818 tests passed, 1 skipped) measured lines 90.61%, statements 88.62%, branches 80.56% and functions 86.44%, with thresholds enforced in `vitest.config.ts`. Crisis-branch coverage is below 100%. |
| O5 | SUS mean >= 68 with n >= 12 | **Not done.** No user study. [STUDENT: insert if conducted.] |
| O6 | Export and erase under 10 s, verified on all tables | **Not measured.** Endpoints exist; the erase cascade is covered by local pgTAP (14 files, 146 tests passing) and the export route was checked through the API on a local stack, but no timing was taken. |
| O7 | All 16 documents complete with a traceability matrix | **Largely met.** Matrix built by hand (docs/02-srs.md section 6). |

## 1.4 Scope

In scope are a student web application (mood, assessments, journal, companion chat, booking, peer circles, consent, export and erasure), a server proxy to the Claude API, and an evaluation of crisis detection on synthetic data. Out of scope are clinical diagnosis or treatment, emergency dispatch, real-time monitoring of students, sharing individual data with university staff, native mobile applications, languages other than English, Hindi and Hinglish, and users under 18.

The platform is educational. Every screening result carries a statement that it is not a diagnosis, and the AI companion is labelled as an AI at all times. This positioning is a design position, not a regulatory determination; the regulatory status of the platform has not been reviewed by a lawyer (Chapter 8).

## 1.5 Contributions

1. A working React and TypeScript front end with pure, tested domain modules for scoring, risk routing and cryptography (Chapter 5).
2. A crisis pipeline with two deterministic safeguards (PHQ-9 item 9 rule, multilingual lexicon) and a designed LLM layer combined by a fail-safe "more severe of the two" rule (Chapters 4 and 5).
3. A client-side encrypted journal with passphrase and recovery code, and a database schema in which institution administrators can read only suppressed aggregates (Chapters 4, 5 and 7).
4. An honest evaluation of the keyword layer, including the finding that a rule set tuned on development data scored 0.975 there and 0.70 on held-out data (Chapter 6).
5. A hazard log, threat model, privacy impact assessment and a catalogue of known limitations that state what is unverified (Chapters 7 to 9).

## 1.6 Methodology

The project followed an incremental, documentation-led process: proposal, requirements (IEEE 29148 style), architecture (C4 levels 1 to 3), threat model and clinical hazard analysis, implementation in vertical slices, and evaluation. Requirements carry identifiers (for example FR-ASSESS-04) and a traceability matrix links each to code and tests. Crisis-related logic was kept in pure functions without network access so that it could be tested exhaustively and run offline. Evaluation of the crisis detector used a frozen split: rules were developed against a development half and evaluated once on a held-out half.

[STUDENT: describe your own team structure, weekly schedule and any supervisor feedback cycles here.]

## 1.7 Report structure

Chapter 2 reviews the literature themes. Chapter 3 states the requirements. Chapter 4 presents the design. Chapter 5 describes the implementation with code-level detail. Chapter 6 reports testing and evaluation. Chapter 7 covers security and privacy. Chapter 8 covers ethics and clinical safety. Chapter 9 lists limitations. Chapter 10 concludes and proposes future work. Appendices hold supporting material.

## 1.8 Terminology

**PHQ-4, PHQ-9, GAD-7.** Brief questionnaires used here only as educational self-assessments. **Item 9** of the PHQ-9 asks about thoughts of being better off dead or of self-harm. **TTFT** is time to first token of a streamed reply. **RLS** is Postgres row level security. **k-anonymity** is a suppression rule that withholds any aggregate group with fewer than k members. **Hinglish** is Hindi written in Latin script, usually mixed with English.
