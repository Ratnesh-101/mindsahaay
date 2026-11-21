# MindSahaay: Defence Deck (17 slides)

Target length: 15 to 18 minutes plus questions. The live demo (slide 7) follows docs/14-demo-script.md and is the only part that needs the running app. Rules for every slide: quote only measured numbers; never quote the keyword v2 dev score (0.975); say "designed with reference to", not "compliant"; say "educational, not diagnostic".

Placeholders in square brackets are for the student to fill. A slide with an unfilled placeholder must not be shown as it is.

---

## Slide 1. Title

**On the slide**

- MindSahaay: a privacy-first, educational wellbeing platform for Indian university students
- [STUDENT: name, roll number, programme, supervisor, date]
- Footer: "Educational tool. Not a diagnosis. Not a medical device."
- Helplines in the footer: Tele-MANAS 14416, KIRAN 1800-599-0019, emergency 112

**Speaker notes** (45 s)

Introduce the project in one sentence: a web platform that lets a student check in on their mood, take educational self-screenings, keep an encrypted journal, talk to an AI companion in English, Hindi or Hinglish, and book a counsellor, with a crisis path that does not depend on AI. State the two promises up front: it does not diagnose, and it does not share any individual data with the university. Say the helplines are in the footer of every screen, including this slide.

---

## Slide 2. The problem

**On the slide**

- Students face entrance-exam pressure, mid-semester load, hostel isolation, homesickness and career anxiety.
- Campus counselling capacity is limited; stigma and fear of disclosure to the institution deter help-seeking.
- Existing tools: often English-only, hold data the student cannot control, or blur wellness and diagnosis.
- [CITATION NEEDED: verified statistic on prevalence of mental health problems among Indian university students, with source and year]
- [CITATION NEEDED: verified statistic on counsellor-to-student ratio or treatment gap, with source and year]

**Speaker notes** (1 min)

Describe the problem qualitatively. Do not say a number you have not verified. If asked for statistics, say that the source candidates are listed in Chapter 2 of the report (the National Mental Health Survey of India 2015-16 and the UGC guidelines among them), that they are still being verified, and that the project's design does not depend on any one figure. Fill the two placeholders only with sources you have read, and show the source on the slide. If you cannot, delete the bullets and keep the qualitative statement.

---

## Slide 3. Personas

**On the slide**

| Persona | Need |
|---|---|
| Aarav, 19, first-year engineering, hostel | Low-barrier anonymous check-ins; Hinglish |
| Priya, 22, final-year postgraduate | Encrypted journal; proof data is not shared; export and erase |
| Dr. Ananya, campus counsellor | Sees only own appointments and consented context |
| Rohan, moderator | Reviews reported posts without seeing identity |
| The Dean | Aggregate trends only, never individuals |

- Footnote: "Personas are fictional. [STUDENT: survey n = __ and interviews n = __ confirmed or changed them as follows: ...]"

**Speaker notes** (1 min)

Be candid that the personas were derived from project assumptions. If the survey and interviews were done, say what changed. If not, say that needs elicitation is the main gap on the user side and the study protocol is ready for ethics submission (docs/09). Point out that Dean is the persona that most shapes the architecture: the design makes it impossible, not merely forbidden, for an administrator to read individual rows.

---

## Slide 4. The solution

**On the slide**

- Mood check-in in three taps, with trend
- Educational screening: PHQ-4, PHQ-9, GAD-7, with a disclaimer before and after
- Encrypted journal (the server holds ciphertext only)
- AI companion labelled as AI, replies in English, Hindi or Hinglish
- Counsellor directory and atomic booking
- Moderated peer circles
- Consent ledger, one-click JSON export, one-click erase
- SOS control on every main route, one tap to helplines

**Speaker notes** (1 min)

One sentence per feature. Emphasise that every free-text box runs the crisis check, and that screening results are bands with plain-language suggestions and a disclaimer, never a diagnosis. Mention honestly that mood edit and delete in the client, likes and no-show handling are not built.

---

## Slide 5. Differentiators

**On the slide**

1. Safety does not depend on the model: browser-side rules and static helplines work with no network.
2. PHQ-9 item 9 above zero always triggers the crisis protocol, regardless of total score.
3. Journals encrypted on the device: AES-256-GCM, PBKDF2-SHA-256, 600,000 iterations.
4. Hinglish and Hindi are first-class in the detector and the interface.
5. No individual data to the university; the Dean sees suppressed aggregates only (groups under 10 withheld).
6. Honest evidence: held-out numbers, pending items marked PENDING.

**Speaker notes** (1 min)

Do not claim novelty. The report's gap statement (few tools combining privacy-first design, Hinglish and a crisis path for Indian students) is a hypothesis awaiting a structured literature search. Say "the design choices that distinguish it are", not "no other tool does this". Point 6 is a differentiator in its own right: the report separates measured from planned.

---

## Slide 5a. How we chose the last two features

**On the slide**

- Time left for about two features. Six AI "counsel" each argued for one candidate; one AI judge decided. Full record: `docs/30-feature-selection-tournament.md`.
- Candidates: Weekly Reflection, Saathi Listener Desk, Crisis Follow-Through Loop, Pariksha Mode, Campus Pulse, Lifeline Offline.
- Judge's rubric: grade value (innovation, depth, demo) 30%, real-world impact and honesty about it 20%, fit with the code and feasibility 20%, safety, privacy and ethics 20%, candour about the weakest point 10%. A complementary final pair was preferred.
- Round 1 eliminated Campus Pulse (circular forecast on synthetic data, goes dark on small campuses) and Saathi Listener Desk (a suicidal student talking to an untrained peer with nobody behind them). Round 2 cross-examined the four survivors; the Crisis Follow-Through Loop (8.4) and Lifeline Offline (7.9) won. Weekly Reflection (7.3) and Pariksha Mode (7.2) were not chosen.
- Both are built. The process also surfaced a real security bug: students could resolve their own crisis events. It is fixed with a regression test.
- Honest limit: the panel and the judge were language models. No student, counsellor or clinician was asked. The scores are the judge's ordinal judgements, not measurements. This is a reasoned choice, not a validated one.

**Speaker notes** (45 s)

Say plainly what this was: a structured way to decide under time pressure, using AI agents as advocates. It is not evidence that these two features are what students need. The summary above comes from docs/30; quote the scores only as the judge's scores. The follow-up loop answers limitation L29 (alerts that nobody reads); the offline layer answers L18 (no offline crisis access). Both were then reviewed by a separate AI reviewer (docs/28), which found a Critical defect (a reopened event was never re-escalated). It is fixed in migration 0007 with a failing-first test; the review was done by an AI, so say that a human review is still outstanding.

---

## Slide 6. Architecture

**On the slide**

Figure: container diagram (report Figure 3).

- React 19, Vite, Tailwind v4, TypeScript. Domain logic in pure functions: `src/domain/scoring`, `risk`, `crypto`.
- Supabase: Auth (JWT), Postgres 15 with row level security, 28 tables.
- Service worker and encrypted on-device outbox (offline helplines, queued mood and crisis events); follow-up tables and RPCs for high-risk events (docs/24 to 26).
- Edge function (Hono on Deno) as the only route to the Claude API; the key never reaches the browser.
- Identity is taken from the token, never from the URL.

**Speaker notes** (1.5 min)

Walk left to right: browser, Supabase Auth, edge function, database, Claude. Explain why the prototype was replaced: the first version used the anonymous key as bearer and a student id in the URL, so guessing an id exposed data. Be honest about the verification state: the SQL and the edge function now run on a local Supabase stack (146 pgTAP tests pass in 14 files; the function was exercised on the real edge runtime with real JWTs, and the original export IDOR is closed), but nothing has been tried on a hosted project, and the Claude chat route and Daily.co video were not verified (they need API keys). This slide is where an examiner will probe, so mention the known gaps: the service worker was tested in desktop Chromium only and never on a phone, role portals only partly backed by data, no hosted deployment.

---

## Slide 7. Live demo plan

**On the slide** (grouped from the ten steps of docs/14; the planned total and the hard time limit are in docs/14-demo-script.md, which is the single source for timings)

1. Consent screen and day/night theme, keyboard focus
2. Mood check-in and trend
3. PHQ-9 with mild answers, then item 9 set to 1: crisis card appears before any score
4. Chat in Hinglish: reply labelled AI; then a scripted fictional crisis message: crisis card, no free-generated reply
5. Journal vault and export/erase
6. Booking a counsellor
7. The offline step and the follow-up loop in two windows (need the real local backend, not demo mode; see docs/14 for the exact steps)

Backup: screen recording. Helplines are shown, never dialled.

**Speaker notes** (as per docs/14)

Announce before the crisis moment that the message is fictional and scripted. Use demonstration mode for the early steps and say so (the offline and follow-up steps in docs/14 need the real local stack): demo data is static and is not evidence of backend behaviour. Known demo limits: in demonstration mode the journal skips the vault setup (use a recorded clip or the unit tests to show encryption); the counsellor, moderator and admin pages are static samples. If the network or API fails, show the degraded mode: that is requirement FR-AI-09 working. If time runs over, drop steps as docs/14 says. The timings there are planned, not measured in a rehearsal. Reset test data and verify the helpline numbers on screen before the session.

---

## Slide 8. Safety pipeline

**On the slide**

Figure: chat crisis sequence (report Figure 6).

- Layer 0: static helplines behind the SOS control
- Layer 1: PHQ-9 item 9 above zero means crisis card plus in-platform counsellor alert
- Layer 2: multilingual lexicon (English, Hindi, Hinglish) on every free-text input
- Layer 3: server LLM classifier; final level is the more severe of the two
- Crisis turns never receive free-generated model text
- Output guard on model replies; AI label; rate limit
- After detection: a recorded follow-up loop (open, acknowledged, contacted, handed off, closed with a reason), student check-backs at 24 and 72 hours, overdue notifications. In-app only, not monitored 24/7.
- Offline: the on-device lexicon still shows the card and helplines; an encrypted record is queued only with consent. Nobody is alerted until the device reconnects.

**Speaker notes** (2 min)

Explain the principle: fail towards help. Lexicon levels are none, low, moderate, high, imminent; high and imminent show the crisis card; "when unsure, escalate one level". Layer 3 is designed but its accuracy is unmeasured, so say that the argument does not rest on it today. The counsellor alert is inside the platform only; the university is never contacted and no counselling service has yet agreed to respond to alerts, and nothing pages anyone. Say clearly that the offline queue is not an alert system, and that the lexicon is the only detector offline (recall 0.70). Mention the independent review: it found that an event reopened by the student was not escalated again (Critical). That is fixed with a test, and a human review is still outstanding. Mention the cost of the design: more false positives are accepted and replies on crisis turns are less personal.

---

## Slide 9. Privacy by design

**On the slide**

- Consent per purpose, append-only ledger, opt-in defaults
- Journals encrypted in the browser; server stores ciphertext, IV and salt
- Recovery code; lose both passphrase and code and the journal is gone, by design
- Export (JSON) and erase without administrator approval
- Aggregates: groups under 10 suppressed; no role can read individual rows
- Designed with reference to the DPDP Act 2023. Not legally reviewed.

**Speaker notes** (1.5 min)

Explain the trade-off: chat text must be readable by the server to reach the model, so chat is not end-to-end private. Say what is sent to the provider and that cross-border handling is an open legal question. Mention honestly three self-found concerns: the aggregate views were granted to all authenticated users (found by reading; the views were changed to `security_invoker` and the local pgTAP tests pass, hosted untested), the three documents disagree on the suppression threshold (10, 20, 50), and the append-only consent table could conflict with erasure (handled with a trigger-depth check and covered by local pgTAP). Executing the SQL also found seven defects that reading had missed, including two RLS infinite recursions. Say that this is why hosted verification still matters.

---

## Slide 10. Ethics and clinical governance

**On the slide**

- 18-hazard clinical safety log, severity 1 to 4
- HZ-01 (missed crisis) is a severity 4 hazard: not closed
- No clinician review yet; no ethics approval yet; no staffed response to alerts
- Planned study: 12 to 15 students, scenario tasks, SUS, announced fictional crisis scenario
- [STUDENT: advisor name and sign-off status; ethics approval reference or exemption]

**Speaker notes** (1 min)

This slide is about what you refuse to claim. State the acceptance rule in the safety case (severity 4 needs residual likelihood A and sign-off) and that, on that rule, the platform is a demonstration of a safety architecture and is not cleared for real students. If you have an advisor review, summarise it; if not, say so plainly.

---

## Slide 11. Evaluation results (honest numbers)

**On the slide**

Crisis detector, high+imminent recall on **held-out** synthetic data (n = 299 messages; 120 high or imminent items):

| System | Held-out recall | False alarm | Hard-negative specificity (n = 45) |
|---|---:|---:|---:|
| Keyword v1 | 0.30 | 0.075 | 0.80 |
| Keyword v2 | 0.70 | 0.00 | 1.00 |
| LLM-only | PENDING | | |
| Hybrid | PENDING | | |

- Target 0.95: **not met**. Held-out Hindi recall 0.585.
- Naive 95% interval for 0.70 on 120 items: about 0.61 to 0.77; wider in truth (42 base sentences).
- Synthetic data, one author and annotator, no clinician review.

**Speaker notes** (2 min)

Lead with the gap: 0.70 against 0.95. Explain that v1 to v2 shows the iteration was effective on unseen data, but that the same person wrote data and rules so the number is optimistic. Do not show or quote the dev score; if asked, say it exists, is overfit by construction, and was deliberately not reported as a result. Say what the misses look like (euphemisms, attempts in progress, Hindi paraphrase). Explain that LLM and hybrid runs are written and ready but need an API key and about 600 calls per system, and that no number will be shown until they are run.

---

## Slide 12. Accessibility and performance

**On the slide**

- Design rules: contrast above 4.5:1, visible focus, named icon buttons, modals trap focus and close on Escape
- Axe on 14 routes x light/dark x 1280 px/375 px = 57 combinations: all pass, zero serious or critical violations (first run: 18 of 56 passed, 38 failed, then fixed)
- Night-mode `tel:112` button was about 1.25:1 at the first run; it now passes the automated check
- First-route bundle: about 190.9 KB gzipped against a 200 KB budget (was 246.9 KB)
- Not done: Lighthouse, load test, TTFT, manual keyboard and NVDA audit, any browser except Chromium

**Speaker notes** (1 min)

Tell it as a find-and-fix story: axe found 38 failing combinations, each failing rule had a documented fix, and all 57 combinations now pass. State why the 112 button mattered: a distressed user, possibly at night, may need it. Automated axe finds only part of the problems, so do not claim WCAG conformance. The bundle figure is a size, not a Lighthouse score.

---

## Slide 13. Testing

**On the slide**

- 0 TypeScript errors; 0 ESLint errors, 0 warnings
- 818 Vitest tests passing (71 files; 1 skipped live smoke test), final measurement 2026-11-20
- 102 default Playwright tests passing (57 axe combinations, journeys, smoke, offline-UI, 9 PWA); Chromium only
- 5 real-backend Playwright tests passing against a local Supabase (sign-in and route sweep, crisis follow-through loop with security attempts, offline mood and crisis outbox, shared-device case)
- 146 pgTAP tests passing on a local Postgres (14 files, migrations 0001 to 0008, 28 tables, RLS on all)
- 90.6% line coverage in the measured scope (domain and features only; statements 88.62, branches 80.56, functions 86.44); thresholds enforced
- Production build green; first route about 190.9 KB gzipped
- Crisis components: branch coverage 54% (crisis page) to 94% (lexicon); target of 100% not met
- Not done: hosted Supabase, Claude and Daily.co routes, LLM evaluation, Lighthouse, ZAP, dependency audit, CI on a real runner, Firefox, WebKit and real-phone tests, usability study

**Speaker notes** (1 min)

Explain what the numbers do not show: Vitest and the default Playwright run never touch a real backend. The real-backend evidence is the pgTAP run, the five real-backend Playwright tests, the edge function exercised on the real edge runtime with real JWTs, and manual browser checks against the local stack. Tell the quality-assurance story: running the system found thirteen defects that tests had missed (students could resolve their own crisis events; six SQL defects including two RLS recursions; a CSS class collision that made the counsellor Acknowledge button unclickable; offline events delayed or never queued; an empty Realtime publication; duplicate risk events; a logout dialog that could trap a student; a Critical re-escalation defect found by the independent review). Each was fixed with a regression test (report Chapter 6, Section 6.3.3). A mutation sanity check broke three safety-critical lines by hand and the tests caught each. The coverage excludes `src/app`, `src/shared` and legacy code, so the whole-app figure is lower, and the per-area crisis figures are from the 19 November run. Lighthouse, ZAP, a real phone, and non-Chromium browsers were not run, and the warm handoff has no real-browser check. Highlight item 9 and the SOS control tests, which are the tests you would run first if someone asked what protects the student.

---

## Slide 14. Limitations

**On the slide**

1. Synthetic data, single annotator, no clinician review
2. Held-out recall 0.70, below the 0.95 target; LLM and hybrid unmeasured
3. Nothing on a hosted Supabase project; Claude and Daily.co routes unverified; CI workflows never run; open frontend security findings; no ZAP scan
4. No user study, no ethics approval, no clinical advisor sign-off, no staffed response to alerts
5. Role portals only partly backed by data; legacy mock code; the offline layer works after one online visit in desktop Chromium only, not on a phone; Background Sync does nothing (and iOS Safari has none); Chromium only
6. Alerts are in-app only: nobody is alerted while a device is offline, nothing is paged (no email, SMS or push), nothing is monitored 24/7
7. Regulatory claims not reviewed by a lawyer; helplines to be re-verified each release

**Speaker notes** (1 min)

Read them plainly, then say what each blocks. Items 1 and 2 block any claim of detection quality. Item 3 blocks any claim that the system is secure or deployed. Item 4 blocks any claim of benefit. Item 6 blocks any claim that the follow-up loop protects a student at night. Item 7 blocks the word "compliant". Also say: keyword recall is 0.70 offline, Hindi strings are not native-reviewed, and the independent review was done by an AI.

---

## Slide 15. Future work

**On the slide**

1. Clinical advisor review and sign-off
2. Run LLM-only and hybrid evaluations; second writer and annotator; cluster-aware intervals
3. Run migrations and pgTAP on a hosted project; verify the Claude and Daily.co routes; ZAP scan; close the open frontend findings
4. Mount real counsellor, moderator and admin screens; remove legacy code
5. Real-phone tests of the offline layer; a Background Sync handler; a real-browser check of the warm handoff; native review of the Hindi strings; manual accessibility audit; Firefox and Safari tests; a human security review of the fixes
6. Ethics approval, survey, interviews, SUS study; pilot with a counselling service

**Speaker notes** (45 s)

Order is by credibility gain, not effort. Say which two items you would do first with another month (usually 1 and 3) and why.

---

## Slide 16. Questions

**On the slide**

- Thank you. Questions welcome.
- Helplines: Tele-MANAS 14416, KIRAN 1800-599-0019, emergency 112
- Repository: docs/report (report), docs/18 (testing), docs/11 (evaluation), docs/19 (limitations)

**Speaker notes**

Keep slide 11 and slide 14 one keystroke away. Prepared answers are in `docs/slides/qa-prep.md`. If asked something you cannot answer, say what evidence would answer it and whether it exists.
