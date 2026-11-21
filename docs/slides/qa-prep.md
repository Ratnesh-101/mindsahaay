# Q&A Preparation: the 38 hardest examiner questions (questions 31 to 38 cover the two late features)

Principles for every answer: say what was measured and where; say what was not measured; never quote the keyword v2 dev score (0.975) as performance; say "designed with reference to", never "compliant"; the system is educational, not diagnostic, not a medical device. Evidence paths are relative to the repository root. Placeholders in brackets need the student's own evidence.

---

## A. Safety and AI

### 1. How do you know the crisis classifier is safe?

**Answer.** It is not shown to be safe, and the project does not claim it. What exists: the keyword detector scored 0.70 high+imminent recall on a held-out synthetic set (target 0.95) with no false alarms on 45 hard negatives (`eval/results/keyword-v2.md`, `docs/11` section 0.4). The LLM-only and hybrid evaluations are written but pending an API key, so no number exists for the layer meant to close the gap. Safety rests on layering, not on one classifier: static helplines behind an SOS control on every main route, the PHQ-9 item 9 rule, the lexicon, and crisis turns that never receive free-generated text. Under the project's own rule (a severity 4 hazard needs residual likelihood A and clinician sign-off), hazard HZ-01 is open (`docs/08`). It is a demonstration of a safety architecture, not a cleared system.

### 2. What about false negatives? They are the dangerous error.

**Answer.** Agreed. On held-out data the v2 lexicon missed 30 percent of high and imminent messages (84 of 120 found). Misses are euphemisms ("sleep and not wake up", "unalive"), attempts in progress, passive ideation without a key phrase, and Hindi paraphrases (held-out Hindi recall 0.585). Even a measured 0.95 would miss about one in twenty, which the safety case states. Mitigations: the OR combination with an LLM layer (unmeasured), the "when unsure, escalate" policy, static helplines that a student can reach without being detected, and plain disclosure to users that the app cannot detect every crisis. The planned false-negative analysis for LLM and hybrid runs is in `docs/11`.

### 3. Why did you not report the 0.975 score?

**Answer.** Because it is overfit by construction. The rules were written while reading the development items, so 0.975 measures how well rules fit items they were designed on. The held-out half was evaluated once after the rules were frozen and gave 0.70. Reporting both would invite readers to pick the flattering one. The drop from 0.975 to 0.70 is itself a finding about how rule-based detectors generalise.

### 4. 600 synthetic messages written by one person. Why should anyone trust the result?

**Answer.** They should not generalise from it, and the report says so. Limits: one author and annotator, no kappa, no clinician review, about 210 distinct core sentences expanded to 600 with openers and closers, and the same person wrote the data and the rules (`docs/19` L1 to L5). A naive Wilson interval for 84 of 120 is about 0.61 to 0.77, and clustering (only 42 base sentences) makes the true interval wider. The result supports one narrow claim: iterating on documented failure modes improved held-out recall from 0.30 to 0.70 on this dataset. It does not estimate performance on real student text. Real data was avoided deliberately for privacy and ethics reasons; a second writer and a clinician-reviewed set are the next step.

### 5. Why use an LLM at all? Why not rely on the lexicon?

**Answer.** Because the lexicon cannot understand paraphrase, and the measured held-out recall proves it. Why not rely only on the LLM? It is non-deterministic, can be unavailable, costs money, and its failure modes on Hinglish are unmeasured. Hence the hybrid: the more severe of the two. The lexicon is a fast, offline, auditable floor; the LLM is a ceiling that is expected to catch paraphrase but is currently unproven.

### 6. Why Claude?

**Answer.** [STUDENT: state your own reason, for example language ability in Hindi and Hinglish, instruction following for a frozen safety prompt, and availability through a server proxy.] The design does not depend on the provider: the model is reached only through `claude.ts` in the edge function, the model name is a single constant, and the lexicon and routing run without it. Honest caveats: the model identifier `claude-opus-5-5` in the code has not been verified as valid for the account (L24), no comparison with another model was run, and provider data-handling terms still need review (L26).

### 7. What happens if the API is down?

**Answer.** The student still gets the safety path. The browser runs the lexicon before any request, so a crisis card appears even offline-from-server. If the stream fails or exceeds the limit, `Chat.tsx` shows a degraded-mode message with helpline links (requirement FR-AI-09, covered by `Chat.test.tsx`). What does not work: the server-side LLM classifier and the companion's replies. A service worker now serves the crisis page after one online visit, tested in desktop Chromium only; a cold offline start on a phone is untested (L18). The 4-second timeout is not asserted in a test.

### 8. How do you stop the AI from diagnosing, or giving harmful advice?

**Answer.** Four layers, none proven. A frozen system prompt forbids diagnosis, medication advice and confidentiality promises. A crisis-flagged turn gets an approved template, not model text. `checkOutputGuard` screens completed replies for diagnostic phrases, self-harm methods and dosing. The interface labels the companion as an AI. What is missing: there is no red-team or response-safety evaluation (the plan in `docs/11` section 6 is unexecuted) and the live model has never been run against the guard (no `ANTHROPIC_API_KEY`). The guard has unit tests against a mocked model. It now runs on the server on the completed reply before any text is shown (buffered, never streamed unguarded), at the cost of a later first token.

### 9. Prompt injection: what stops a user from overriding the safety rules?

**Answer.** The crisis path is outside the model: the lexicon and routing decide before generation, and a crisis turn never reaches free generation. The model has no tools, so it cannot book, delete or send (OWASP LLM06 is low by construction). Output is rendered as plain text. What injection could still do is produce an unsafe non-crisis reply, which the output guard is meant to catch. The injection suite in the test plan has not been run (`docs/06`, `docs/10`).

### 10. How is Hinglish handled, given there is no standard spelling?

**Answer.** The lexicon builds three matching views of each clause: English (slang and typo folding), romanised Hinglish (vowel-run folding and a map of spelling and gender variants such as "nhi" to "nahi") and Devanagari (nasal conjunct folding). It also collapses repeated letters and handles negation scope per clause. It is evidence of effort, not coverage: held-out Hinglish recall was 0.800 and Hindi 0.585, on about 40 high+imminent items per slice, so slice results are noisy and cannot be ranked with confidence.

### 11. Item 9 non-zero triggers the crisis protocol even if the total is 0. Is that over-triggering?

**Answer.** Yes, deliberately. The rule treats any non-zero answer as a reason to show help, not as a classification of the student. The cost is some unnecessary crisis cards; the benefit is that a student who reports thoughts of being better off dead and little else still gets helplines. The rule is implemented in `phq9.ts` (`item9Flag`), enforced in `riskRouting.ts` and by a database trigger (covered by local pgTAP), and the e2e journey shows the card before any score. On a local Supabase stack, a PHQ-9 submission with item 9 = 2 through the real edge function stored the assessment and created a crisis risk event with helplines (checked by hand, not hosted). The evidence for item 9 as a risk marker is a candidate source [S13] still to be verified, so the report presents the rule as conservative practice.

### 12. Is this a diagnostic tool or a medical device?

**Answer.** No, by design: disclaimers before and after every result, bands with plain-language suggestions, the AI labelled as an AI, and no treatment claims. That is a design position, not a regulatory ruling, and the regulatory position has not been confirmed by the institution or a lawyer. One weakness I should acknowledge: band labels in the code read like diagnoses ("moderate depression"), and softer wording needs clinical review (L27).

---

## B. Privacy, security and law

### 13. Why not store journals server-side?

**Answer.** Because the operator does not need to read them, and a leak of readable journals is among the worst harms in this domain (hazard HZ-13, threat TH-05). Client-side AES-256-GCM with a PBKDF2-SHA-256 key (600,000 iterations) means the database holds ciphertext, IV and salt only. The cost is real: a lost passphrase and recovery code means lost entries, no server-side search, and key handling in the browser. Server-side storage would simplify recovery and features but would turn every database breach and every insider into a disclosure of intimate text.

### 14. Is the chat private?

**Answer.** Not end-to-end, and it must not be described that way. Chat text must be readable by the server to reach the model, and non-crisis turns are sent to an external provider after PII redaction. Chat rows are meant to be stored encrypted with a 30-day retention, but who writes them and with which key was not confirmed (L31). The consent notice has to say plainly that chat is processed by a third party.

### 15. Does the DPDP Act apply? Are you compliant?

**Answer.** If the platform processed digital personal data of people in India in a real deployment, the Act would very likely apply, and the operator would be the data fiduciary. I do not claim compliance. The design was made with reference to the Act's themes (notice and consent, purpose limitation, minimisation, safeguards, access, erasure, breach notification, children, grievance) and the matrix in `docs/07` marks what is planned, what is open and what is a gap: breach runbook, grievance contact, nominee right, treatment of minors and cross-border transfer are open. The section numbers quoted in the repository were not checked against the legal text and no lawyer has reviewed the work (L25).

### 16. Chat text goes to a US company. What about cross-border transfer?

**Answer.** It is an open item (L26, PR-14). Stored data would be in Supabase Mumbai, but text sent to the provider leaves the region. What the design does: the server proxy strips identity, redacts PII, and sends only non-crisis turns. What is missing: review of provider retention terms and any zero-retention option, a check of the transfer rules in the Rules as notified, and a plain statement in the consent notice. A real pilot could not start before this is resolved.

### 17. Can a Dean or administrator identify a student?

**Answer.** By design no individual row is readable by that role, and aggregates are views with `HAVING count(*) >= 10`. I would not call that a guarantee: k = 10 is a floor, repeated queries or differencing between months can leak, and small institutions are risky (L32). Reading the SQL I found a problem: the three views were granted to all authenticated users with no role check in the view body, and views often bypass row level security on their base tables, so any signed-in user might have read any institution's aggregates. The migration now creates them as `security_invoker` views (`docs/21`, finding 11), and the pgTAP file `05_k_anonymity_aggregates` passes on a local database. That is evidence for the cases tested, not a proof, and it has not been run on a hosted project. The documents also disagree on the threshold (10 in SQL, 20 in the SRS, 50 on a static page).

### 18. You say RLS protects data. What is the evidence?

**Answer.** The SQL was first only read, then executed. On a local Supabase stack (CLI 3.2.0, Docker) migrations 0001 to 0008 and the seed apply, 28 tables have RLS enabled, and pgTAP files 01 to 14 (146 tests) pass (`supabase start`, `supabase test db`). Running it found 7 defects that my earlier read-only audit missed (`docs/21`, findings 22 to 28), including two RLS infinite recursions (`profiles`/`counsellors` and `circles`/`circle_members`) and a trusted-backend trigger bypass, which is a reason not to trust reading alone. The limits: it is a local stack, not a hosted Supabase project; the pgTAP cases cover what I thought to test; no independent human security review has been done (an AI reviewer produced docs/28 and found ten issues, one Critical; all were fixed in migration 0007 with failing-first regression tests in pgTAP files 12 and 13, and no human has re-reviewed the fixes). I report RLS as supported locally, not proven (`docs/02` section 6, L10).

### 19. Why PBKDF2 and not Argon2? Is 600,000 iterations enough?

**Answer.** PBKDF2 is available natively in WebCrypto, which avoids shipping a cryptography library into the bundle and keeps the attack surface small. 600,000 iterations with SHA-256 is the figure the code attributes to OWASP guidance, which I will confirm against the current cheat sheet [S32]. Argon2 is memory-hard and better against GPU attack, but needs a WebAssembly library. The residual risk is weak passphrases: the interface enforces only 8 characters, and anyone with database access can try offline guesses against the check blob. A stronger policy or a passphrase strength meter is a planned improvement.

### 20. What if a student loses the passphrase?

**Answer.** They use the recovery code shown once at set-up (16 characters, about 79 bits). If both are lost, the entries are unrecoverable for everyone including the operator. That is the price of zero-knowledge, and it must be stated in the interface and manual (L30). The vault flow in the e2e suite cannot be exercised in demonstration mode, so that journey is a documented known failure.

### 21. What about minors?

**Answer.** The product is for users aged 18 or over, but no 18+ confirmation exists in onboarding or the schema (L23), so FR-AUTH-01 is only partly met. The e2e journey checks an 18+ gate in the consent flow of the demonstration, which is not a verified age check. Under the Act, under-18 data needs verifiable parental consent and whether self-declaration is enough is a legal question. A pilot must restrict enrolment to adults.

---

## C. Evidence, process and engineering

### 22. You have over 800 tests. What do they actually prove?

**Answer.** The Vitest suite (818 tests passing and 1 skipped in 71 files at the final run on 20 November 2026) shows that the front end, the pure domain logic and the edge function code behave as specified under mocked network calls. At the earlier run of 345 tests they included 93 on the lexicon, 15 on cryptography, 39 on scoring and 12 on routing; the per-file counts have not been refreshed. They do not prove anything about a hosted deployment or the live model. Separate evidence exists, and should be quoted separately: 146 pgTAP tests pass on a local Postgres, the edge function was exercised on the real edge runtime with real JWTs, 102 default Playwright tests pass (Chromium only, mostly demo mode), and 5 real-backend Playwright tests pass against the local stack. Coverage is 90.61 percent of lines (statements 88.62, branches 80.56, functions 86.44) within `src/domain` and `src/features` only, with thresholds enforced. Crisis components have lower branch coverage (crisis page 54 percent at the 19 November measurement) and two crisis modals have no Vitest coverage (they are covered by Playwright). The tests also caught real problems: running the system found thirteen defects (report Section 6.3.3), and a mutation sanity check, three safety-critical lines broken by hand, was caught each time by a test. Three samples is not a mutation score.

### 23. Earlier your end-to-end suite had 39 skipped tests. What happened to them?

**Answer.** They were known failures marked `test.fixme`, documented rather than deleted: 38 accessibility combinations that failed axe at the first run, plus one journal vault journey. I did not count them as passing. The accessibility failures were fixed in the interface, and the final run (20 November 2026) is 102 of 102 passing in the default project, nothing skipped: the Chromium project (57 axe combinations, journeys, smoke and offline-UI specs) plus 9 `pwa` tests. Those include the item 9 crisis card, the SOS control on every main route and the crisis card with no close control. Caveats: Chromium only, demo mode only, and the journal vault journey still cannot be reached in demo mode (not re-checked on 20 November).

### 24. Why are there accessibility failures if you wrote an accessibility steering file?

**Answer.** Because the colour tokens drifted from the rules, and axe found it. At the first run 38 of 56 combinations failed: contrast in several tags, active states in night mode, the danger colour and the `tel:112` button (about 1.25:1 in night mode); an unnamed progress bar; a scroll region that was not focusable. They were fixed, and all 57 combinations (14 routes, two themes, two widths) now pass with zero serious or critical violations. Layout bugs were fixed too: the mobile bottom nav no longer shows on desktop, the SOS button sits in the same place on every page, and the demo banner no longer overlaps the sidebar. The 112 button mattered most because of where it is. Automated axe finds only part of the problems: I have not run Lighthouse or an NVDA audit, only Chromium was tested, and I do not claim WCAG conformance.

### 25. Is the demo real? Or is it mocked?

**Answer.** It runs in demonstration mode with canned users and static data, and I say so on the slide. It shows front-end behaviour: consent flow, scoring, the crisis card, theme and language switching, SOS. It is not evidence of backend behaviour. In demonstration mode the counsellor, moderator and admin pages are static samples; for a real session the counsellor and admin dashboards are mounted (L14). The follow-up and offline steps of the demo need the local backend, and they were run against a local Supabase stack, not a deployed project.

### 26. Where is your user evidence? How do you know anyone wants this?

**Answer.** I do not have it yet. [STUDENT: if you ran a survey, interviews or SUS study, give sample sizes and findings here.] The personas are fictional until elicitation confirms them, and the usability target (SUS of at least 68 with 12 or more participants) is unmet. The study protocol, consent form and distress procedure are written (`docs/09`) and wait for ethics clearance. Without it, claims about usefulness and acceptance are unsupported and the report makes none.

### 27. Who is liable if the app misses a crisis?

**Answer.** This is a student project with no operator, no users and no deployment. In a real deployment the operating organisation would be the data fiduciary and would carry responsibility for safety processes and alert response, whatever the disclaimers say. Disclaimers reduce misunderstanding but do not remove a duty of care. Questions of tort or statutory liability need a lawyer, and I am not offering a legal opinion. What the project controls is not creating the situation: no deployment to real students without clinical review, measured hybrid recall, a staffed response to alerts and legal review.

### 28. Who receives the counsellor alert, and who answers it?

**Answer.** Currently nobody is on duty. Since 20 November there is a recorded follow-up loop (docs/24; see question 31), but it only helps if a counsellor with a care share signs in. The routing flags the event inside the platform (`alertCounsellor` in `riskRouting.ts`, a `risk_events` row), but no real counselling service has agreed to receive or act on alerts (L29), and the counsellor workspace that would show them is only partly checked: `/counsellor` mounts the real dashboard for a real session, but it was not checked with live risk events. Unread alerts are a hazard, not a feature. A pilot needs a staffed service, a service-level expectation and a statement to students of what an alert does and does not mean. The university is never contacted automatically (FR-CRISIS-08).

### 29. Are the helpline numbers correct?

**Answer.** They are the numbers in the project's steering rules and documents: Tele-MANAS 14416 and 1800-891-4416, KIRAN 1800-599-0019, emergency 112. They are defined in one file with a last-verified date (2026-11-20, the team's own record), the offline cache version is a hash that includes that file so a changed number replaces every cached copy, and tel: links are tested, but I have not verified them against official programme documentation in this project [S25 **VERIFY**]. [STUDENT: verify against official sources and record the date.] A wrong number on a crisis screen is a hazard (HZ-04), so verification is part of every release checklist. A Vandrevala Foundation number in the server README is unverified and unused elsewhere.

### 30. What is the contribution, and what would you do first with another month?

**Answer.** The contribution is a worked, tested example of a safety-first and privacy-first architecture for this population, and a way of reporting evidence that separates measured from planned, including a negative result: a rule set that scored 0.975 on development data generalised to 0.70. I do not claim novelty over other tools until a structured literature search supports it. With a month, in order: (1) get a clinical advisor to review the rubric, hazard log and crisis wording; (2) run the LLM-only and hybrid evaluations on a fresh second-writer held-out set with cluster-aware intervals; (3) repeat the migrations and pgTAP tests on a hosted Supabase project and verify the Claude and Daily.co routes with real keys, then run a ZAP scan and close the open frontend findings (SEC-01, SEC-02, SEC-04, SEC-05, SEC-07, SEC-08). Those three change how much the safety and privacy claims can be trusted more than any new feature would.

---

## G. The two late features (follow-up loop and Lifeline Offline)

### 31. Who answers the follow-up alerts, and what stops a high-risk event from sitting unread?

**Answer.** A counsellor with a current care share for `risk_events` sees the event in the queue and can only take the next legal step (acknowledge, contact, hand off, close with a reason). If an event stays at "open" for 4 hours (crisis) or 12 hours (high), the database creates in-app notifications for those counsellors and, 2 hours later, for a backup counsellor. That does not page anyone: the notification appears when someone signs in, nothing is monitored 24/7, no counselling service has agreed to answer, and the timings have had no clinical review (L29, L44, `docs/24`). The student card and the queue say so, and the helplines are always shown. A real pilot needs a staffed response first.

### 32. If I am offline and type a crisis message, who is told?

**Answer.** Nobody, until the device is back online, the student is signed in and the journal vault is unlocked. What happens at once is the crisis card with the three helplines, from the on-device keyword list (recall 0.70 on synthetic data, so subtle messages are missed offline). If the student gave the crisis consent, an encrypted, content-free record (layer, device time, "offline") waits on the device and is sent later, with the server's own timestamp, after a consent re-check. It can arrive hours late or never (switched-off device, cleared storage, the 7-day purge). The offline banner says this in plain words (L38 to L42, `docs/25`).

### 33. Your own review found a Critical defect. What is it, and why did you not catch it?

**Answer.** An independent AI reviewer (`docs/28`, finding G6-SEC-01) found that when a student answers "I want to talk" and the event reopens, the overdue job treats the notification from the first cycle as already sent, so a reopened event is never escalated again. My tests covered the first cycle and the reopen separately and never combined them, which is why a reviewer with a fresh view found it. A regression test (pgTAP 12) was written first and failed; migration 0007 now makes escalation idempotent per follow-up cycle and the test passes. It is fixed, but the review was done by an AI worker and no human has re-checked it. The same review found an alias lookup any student could call, an unmounted update toast and a logout dialog that blocked Escape.

### 34. Could the offline queue leak a student's crisis event on a shared computer?

**Answer.** Items are encrypted with a key derived from the student's journal passphrase and stored in a database named from a hash of the user id; another account on the same browser cannot decrypt them and its flush skips them (unit tests with fake IndexedDB). Weaknesses I know of: the review had found the item kind and timestamp as plain fields next to the hashed id, so someone at the device could see that a crisis item exists; session expiry skips the keep-or-discard dialog. Fixed after the review: the item metadata now sits inside the encrypted payload under a salted database name, and "Erase my account" deletes on the server first and then discards the queue (it used to leave it on the device, L49). The shared-device case is now also covered by a real-backend Playwright test, though not with two real people on a real phone. 

### 35. Could someone fake a timestamp to dodge the overdue timer?

**Answer.** The client never sends `created_at`; a database trigger sets it to `now()`, and a pgTAP test checks that a past date is overridden. The device clock is kept only as `payload.detected_at` and shown as a claim. The residual problem runs the other way: an event queued offline for hours looks fresh to the overdue clock when it arrives (L41).

### 36. Does the service worker cache anything personal?

**Answer.** It does not intercept cross-origin requests, anything with an Authorization header, the backend paths, or non-GET requests; it stores only a build-time list of static files, and a Playwright test fails if any cache entry looks like a backend URL. That was tested in desktop Chromium. It has not been tested on a phone or in iOS Safari, where storage can be evicted and Background Sync does not exist. A Background Sync tag is registered but the worker has no handler, so nothing drains while the app is closed (L39).

### 37. Why these two features? Who decided?

**Answer.** Six AI counsel each argued for one candidate and one AI judge picked, in two rounds with two candidates eliminated in each round, leaving these two. The judge also wrote ten acceptance criteria for the offline queue, which became tests. The candidates were Weekly Reflection, Saathi Listener Desk, Crisis Follow-Through Loop, Pariksha Mode, Campus Pulse and Lifeline Offline. The rubric weights were grade value 30, real-world impact and honesty 20, fit and feasibility 20, safety, privacy and ethics 20, candour about the weakest point 10. Round 1 eliminated Campus Pulse (circular forecast on synthetic data) and Saathi Listener Desk (a suicidal student reaching an untrained peer with nobody behind them); round 2 scored the loop 8.4 and Lifeline Offline 7.9 against 7.3 and 7.2 for the others. Full record: `docs/30-feature-selection-tournament.md`. It is a structured way to decide under time pressure, not evidence of student need: no student, counsellor or clinician was consulted, the scores are ordinal judgements by an AI, and agents share blind spots. [STUDENT: whether your supervisor agreed.]

### 38. Does a tidy workflow give false reassurance?

**Answer.** It can, and I treat that as a hazard (HZ-21). A student answer can never close or lower an event, the card never says "you are safe", and the closure reason list is fixed and audited. The independent review found the opposite fault in an early build: with no care share the card said "Your counsellor has been told" above small print saying nobody could see the alert (docs/28, G6-SEC-05). It now reads "Alert recorded. It was not shared with a counsellor." with the helplines first, and a test covers it. A counsellor can still close an event too early, and the wording has had no clinical or native-Hindi review (L44, L48).
