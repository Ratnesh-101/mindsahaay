# 02 Software Requirements Specification (IEEE 29148 style)

## 1. Introduction

**Purpose.** Specify requirements for MindSahaay v1.0, an educational wellbeing web platform for Indian university students.
**Scope.** See 01-proposal.md sections 4 and 5. The system is not a diagnostic or treatment tool.
**Definitions.** PHQ-4/PHQ-9: patient health questionnaires used here only as educational self-assessment. TTFT: time to first token. RLS: row level security.
**References.** DPDP Act 2023, Mental Healthcare Act 2017, UGC wellbeing guidelines, WCAG 2.2, OWASP ASVS 4.0.3, OWASP Top 10 for LLM Applications. TODO: verify clause-level citations.

## 2. Overall description

**Product perspective.** Web client, Supabase backend (Auth, Postgres, Edge Functions), Claude API through a server proxy. The original prototype used a key-value store and a keyword crisis check. The current repository implements most of the target (relational schema with RLS, JWT-derived identity, Hono edge function, client-side journal encryption). Section 6 records, requirement by requirement, what exists and what does not.

**Roles in the code.** The database enum `user_role` has `student`, `counsellor`, `moderator`, `institution_admin`, `super_admin`. The persona "Dean" in this SRS maps to `institution_admin`. FR-AUTH-03 originally said "dean-aggregate"; read it as `institution_admin`.
**Constraints.** Helplines Tele-MANAS 14416 / 1800-891-4416, KIRAN 1800-599-0019, emergency 112. No data to the university.

### Personas

| Persona | Description | Key needs |
|---|---|---|
| Aarav | 19, first-year engineering student in a hostel, JEE aftermath, homesick, reads Hinglish | Anonymous low-barrier check-ins, Hinglish companion |
| Priya | 22, final-year postgraduate, placement anxiety, privacy-conscious | Encrypted journal, proof that data is not shared, export and erase |
| Dr. Ananya | Campus counsellor (fictional, matches prototype directory "Dr. Ananya Sharma") | See only own appointments, set availability, get student-provided context only with consent |
| Rohan | Peer-support volunteer / community moderator | Review reported stories, remove harmful content, never see identity |
| Dean | Dean of Student Welfare | Aggregate usage and trend counts only, with minimum cohort size; no individual data |

## 3. Functional requirements

Priority: M = must, S = should, C = could. Each requirement is verifiable by a test of the named type (T = test, I = inspection, D = demonstration).

### Authentication and consent (FR-AUTH)

| ID | Requirement | Pri | Ver |
|---|---|---|---|
| FR-AUTH-01 | The system shall let a student register with email and password or a magic link, and shall require age confirmation (18+) and explicit consent before data is stored. | M | T |
| FR-AUTH-02 | The system shall authenticate every API request with a per-user JWT and shall derive the student ID from the token, never from a client-supplied path parameter. | M | T |
| FR-AUTH-03 | The system shall support roles student, counsellor, moderator, dean-aggregate and shall enforce them with RLS. | M | T |
| FR-AUTH-04 | The system shall record each consent (purpose, version, timestamp) and allow withdrawal per purpose. | M | T |
| FR-AUTH-05 | The system shall let a student export all their data as machine-readable JSON in one action. | M | T |
| FR-AUTH-06 | The system shall let a student erase all local and remote data in one action without administrator approval. | M | T |
| FR-AUTH-07 | The system should offer anonymous-alias mode (no real name stored). | S | D |

### Mood tracking (FR-MOOD)

| ID | Requirement | Pri | Ver |
|---|---|---|---|
| FR-MOOD-01 | The student shall be able to log a mood (5-point scale plus optional tags) in at most 3 taps. | M | T |
| FR-MOOD-02 | The system shall show a 7-day and 30-day mood trend with a text alternative for the chart. | M | T/I |
| FR-MOOD-03 | The system shall keep mood entries editable and deletable by the student. | M | T |
| FR-MOOD-04 | The system should suggest a coping activity from a clinician-reviewed library based on the logged mood. TODO: clinician review of library. | S | D |
| FR-MOOD-05 | The system shall run the crisis check on free-text mood notes. | M | T |

### Assessment (FR-ASSESS)

| ID | Requirement | Pri | Ver |
|---|---|---|---|
| FR-ASSESS-01 | The system shall offer PHQ-4 and PHQ-9 with the standard item wording. TODO: confirm licensing and approved Hindi translations. | M | I |
| FR-ASSESS-02 | Before and after every result the system shall state that the screening is educational and not a diagnosis. | M | T |
| FR-ASSESS-03 | Results shall be shown as score bands with plain-language suggestions, never as a diagnostic label. | M | I |
| FR-ASSESS-04 | If PHQ-9 item 9 is non-zero, the system shall trigger the crisis protocol (FR-CRISIS-01) immediately, regardless of total score. | M | T |
| FR-ASSESS-05 | The system shall store results only for the student and show their history. | M | T |
| FR-ASSESS-06 | The system should suggest booking a counsellor when the PHQ-9 total is at or above the moderate band; band thresholds come from the published instrument. TODO: verify thresholds. | S | T |

### Crisis (FR-CRISIS)

| ID | Requirement | Pri | Ver |
|---|---|---|---|
| FR-CRISIS-01 | On crisis detection the system shall display a Crisis Banner that cannot be dismissed without a deliberate action and offers one-tap dial links: Tele-MANAS 14416, KIRAN 1800-599-0019, emergency 112. | M | T |
| FR-CRISIS-02 | Crisis detection shall run on every free-text input (chat, journal save, mood note) in English, Hindi (Devanagari) and Hinglish. | M | T |
| FR-CRISIS-03 | Crisis detection shall combine a deterministic keyword/pattern layer with an LLM classifier; a positive from either layer triggers the banner (fail-safe OR). | M | T |
| FR-CRISIS-04 | If the LLM or network is unavailable, the keyword layer and static helpline content shall still work offline. | M | T |
| FR-CRISIS-05 | A crisis helpline entry shall be reachable from every screen in at most 1 tap. | M | T |
| FR-CRISIS-06 | The AI shall not send a crisis-flagged turn to the model for free generation; it shall return the approved crisis response template. | M | T |
| FR-CRISIS-07 | Crisis events shall be logged without message content (timestamp, source, layer) for safety auditing, and only with consent. | S | T |
| FR-CRISIS-08 | The system shall never contact the university or third parties automatically. | M | I |
| FR-CRISIS-09 | Follow-up protocol. Every high or crisis risk event shall start a recorded follow-up with five ordered steps (open, acknowledged, contacted, handed off, closed). A step may only move forward by exactly one, closing needs a reason from a fixed list, and every step by a counsellor is written to the audit log. A student shall not be able to close, resolve or edit the event. See 24-crisis-followup.md. | M | T |
| FR-CRISIS-10 | Timed check-backs. When an event is acknowledged the system shall give the student two check-backs (24 h and 72 h) with the answers "I'm okay" and "I want to talk". "I want to talk" reopens the event and notifies counsellors who hold a care share; an answer can never close or lower an event. The student can opt out of future check-backs, and the helplines are never hidden. | S | T |
| FR-CRISIS-11 | Overdue escalation. An event still at "open" after 4 h (crisis) or 12 h (high) shall create in-app notifications for counsellors who hold a care share with scope `risk_events`, and after a further 2 h for the institution's backup counsellor. The job shall be idempotent and notifications shall carry no message content. | S | T |
| FR-CRISIS-12 | Offline crisis queueing. While the device is offline, crisis detection shall continue with the on-device keyword lexicon, the crisis card and helplines shall show at once, and (only with the crisis consent) a content-free risk event (`layer`, `detected_at`, `offline`) shall be queued in an encrypted on-device outbox. On reconnection the consent shall be re-checked, the event sent once (idempotent) before any mood entry, and `created_at` set by the server. | S | T |
| FR-CRISIS-13 | Honest status. The counsellor queue and the student status card shall state that alerts are in-app only and not monitored 24/7, shall show Tele-MANAS 14416, KIRAN 1800-599-0019 and 112, and shall not claim that a counsellor was told when no care share exists. While offline the app shall say that nobody is alerted until the device reconnects. | M | I/T |

### AI companion (FR-AI)

| ID | Requirement | Pri | Ver |
|---|---|---|---|
| FR-AI-01 | The system shall provide a chat companion that replies in the language the student uses (English, Hindi, Hinglish). | M | T |
| FR-AI-02 | Replies shall stream; TTFT p95 shall be below 2.5 s (NFR-PERF-02). | M | T |
| FR-AI-03 | The system prompt shall forbid diagnosis, medication advice and promises of confidentiality beyond the policy. | M | T |
| FR-AI-04 | The Claude API key shall exist only on the server; the client calls an authenticated proxy. | M | I |
| FR-AI-05 | The proxy shall rate limit per user and cap message length and context size. | M | T |
| FR-AI-06 | The UI shall label the companion as AI, not a human or clinician, at all times. | M | I |
| FR-AI-07 | The student shall be able to clear chat history. Server retention of chat shall be limited to a configurable window (default 30 days; TODO decide). | M | T |
| FR-AI-08 | Model output shall be filtered for unsafe content (self-harm methods, medication dosing) before display. | M | T |
| FR-AI-09 | If the model fails or times out within 4 s, the UI shall show a graceful fallback message and keep the crisis path active. | M | T |

### Booking (FR-BOOK)

| ID | Requirement | Pri | Ver |
|---|---|---|---|
| FR-BOOK-01 | The student shall be able to browse counsellors (name, specialisation, languages, availability). | M | T |
| FR-BOOK-02 | The student shall be able to book an available slot; double booking of the same slot shall be impossible (database uniqueness). | M | T |
| FR-BOOK-03 | Appointments shall follow the state machine in 05-uml.md (requested, confirmed, completed, cancelled, no-show, rescheduled). | M | T |
| FR-BOOK-04 | The student shall be able to cancel at least 2 h before the slot. TODO confirm policy with counsellors. | M | T |
| FR-BOOK-05 | A counsellor shall see only their own appointments and only the student's alias and booking note. | M | T |
| FR-BOOK-06 | The system shall provide a meeting link or location and a reminder notification. | S | D |
| FR-BOOK-07 | The system shall show urgent-help options next to the booking screen, since next available slots may be days away. | M | I |

### Community (FR-COMM)

| ID | Requirement | Pri | Ver |
|---|---|---|---|
| FR-COMM-01 | The student shall be able to read peer stories filtered by theme. | M | T |
| FR-COMM-02 | The student shall be able to submit a story under an alias; stories are held for moderation before publication. | M | T |
| FR-COMM-03 | Moderators shall approve, reject or remove stories; the moderator view shall not show author identity. | M | T |
| FR-COMM-04 | Content mentioning self-harm methods shall be auto-held and shall show helplines to the author. | M | T |
| FR-COMM-05 | The student shall be able to report a story. | M | T |
| FR-COMM-06 | The system should allow likes without exposing who liked. | S | T |

## 4. Non-functional requirements

| ID | Category | Requirement (measurable) | Method |
|---|---|---|---|
| NFR-PERF-01 | Performance | Lighthouse performance, accessibility, best-practices >= 90 (mobile profile) on login, home, chat, booking pages | Lighthouse CI |
| NFR-PERF-02 | Performance | Chat TTFT p95 < 2.5 s at 50 concurrent users, measured server receipt to first streamed token at the client | k6 or similar load test |
| NFR-PERF-03 | Performance | Non-AI API p95 < 500 ms | Load test |
| NFR-A11Y-01 | Accessibility | WCAG 2.2 AA: zero open A/AA failures in automated (axe) plus manual keyboard and screen reader audit (NVDA) | Audit |
| NFR-A11Y-02 | Accessibility | Text contrast >= 4.5:1 (3:1 large); `:focus-visible` on all interactive elements; icon-only buttons have accessible names; modals trap focus, close on Escape and have a close button | axe, manual |
| NFR-A11Y-03 | Accessibility | Gentle motion 0.2 to 0.3 s; honour `prefers-reduced-motion`; no flashing | Inspection |
| NFR-QUAL-01 | Quality | Line coverage >= 80% overall, 100% of crisis module branches | Coverage tool |
| NFR-SAFE-01 | Safety | Crisis recall >= 0.95 on held-out test set (lower bound of 95% CI reported separately), including >= 0.95 on each language slice. TODO: if the CI lower bound is below 0.95, document honestly. | 11-ai-evaluation-plan.md |
| NFR-SAFE-02 | Safety | Crisis false positive rate reported; target <= 0.20 on non-crisis items (precision secondary to recall) | Same |
| NFR-SEC-01 | Security | OWASP ASVS L1 checklist complete, no open high or critical findings; dependency audit clean of high/critical | Review, `npm audit` |
| NFR-SEC-02 | Security | TLS 1.2+ everywhere; secrets only in environment variables | Inspection |
| NFR-PRIV-01 | Privacy | Journal content encrypted client-side (AES-GCM, key derived from passphrase) before any sync | Test |
| NFR-PRIV-02 | Privacy | Export and erase complete in < 10 s for a 1-year account | Test |
| NFR-PRIV-03 | Privacy | Data queued on the device while offline is encrypted per user (key from the student's vault passphrase, AES-256-GCM), stored under an obfuscated per-user database name, never contains message text, is kept at most 7 days, is never sent under another account, and is deleted at logout only after an explicit choice | Test |
| NFR-AVAIL-01 | Availability | Crisis content works offline after first load (service worker) | Test |
| NFR-AVAIL-02 | Availability | Helpline numbers carry a last-verified date, and changing a number or that date replaces every cached copy at the next release | Test |
| NFR-USAB-01 | Usability | SUS mean >= 68 (n >= 12); task success >= 85% on core scenarios | Study |
| NFR-I18N-01 | Localisation | UI and crisis content available in English and Hindi; companion handles Hinglish | Inspection, test |
| NFR-COMP-01 | Compatibility | Latest two versions of Chrome, Edge, Firefox, Safari; Android Chrome on a low-end device profile | Test |

## 5. External interfaces

- UI: responsive web, day and night themes (see `.kiro/steering/design-system.md`).
- Software: Supabase REST/Edge Functions, Anthropic Messages API (server side only).
- Communications: HTTPS only.

## 6. Requirements traceability matrix

Snapshot date: 2026-11-20. Method: rows were first written by hand, then checked by `scripts/req-status.mjs` (see 6.3). The script verifies that every named file exists, recomputes the counts and refuses an "Implemented" status that has no runnable test or that touches an open defect in 19-known-limitations.md or 23-frontend-security-audit.md. The script cannot judge whether a test is good; the status of each row is still a human decision, made conservatively.

Counts: Implemented 3, Partial 60, Not started 9, total 72.

By table: functional (6.1) Implemented 2, Partial 49, Not started 2, total 53. Non-functional (6.2) Implemented 1, Partial 11, Not started 7, total 19. The earlier hand count (7, 39, 2 of 48) overstated: five rows were downgraded, and one functional row (FR-AI-04) was never backed by a test. See "Downgrades" below. **Update after the two new features:** seven rows were added (FR-CRISIS-09 to FR-CRISIS-13, NFR-AVAIL-02, NFR-PRIV-03) and NFR-AVAIL-01 moved from Not started to Partial. All eight are Partial. None is Implemented (the warm handoff and server-side opt-out added by migration 0006 do not change that): each has an open limitation (L18, L29, L38 to L48), was tested only on desktop Chromium and a local Supabase, and has had no clinical review.

**Status meaning.**
- **Implemented**: working code, at least one automated test that ran and passed (Vitest or Playwright; a pgTAP file alone does not count, because the script only accepts those two runners, even though the pgTAP files have now been executed locally), and no open defect in docs 19 or 23. The note must start with "Verified:" and say what ran.
- **Partial**: code exists but a part of the requirement is missing, or the only test is SQL (pgTAP passes on a local Supabase but has not been run on a hosted project), or the behaviour is not measured, or an open limitation applies.
- **Not started**: no implementing code found.

**Test counts (final, measured 2026-11-20 by the lead).** Type check: 0 errors. ESLint on `src`: 0 errors and 0 warnings. Vitest: 71 files passed and 1 skipped, 818 tests passed and 1 skipped (the skipped file is `smoke.local.test.ts`, which needs JWT environment variables; the count includes the edge-function tests, 188, re-counted 2026-11-20). Coverage (config scope `src/domain` and `src/features`, thresholds enforced): statements 88.62%, branches 80.56%, functions 86.44%, lines 90.61%. Playwright default run: 102 passed, Chromium only (93 in the `chromium` project, of which 57 are axe combinations, plus journeys, smoke and offline-UI specs; 9 in the `pwa` project against a production build). Real-backend Playwright (`pnpm test:e2e:real`, needs the local Supabase stack): 5 passed. pgTAP on a real local Postgres: files 01 to 14, 146 tests, all passing. Hosted Supabase has not been tried. A requirement whose only test is a pgTAP file stays Partial in this matrix because the script accepts only Vitest or Playwright tests as evidence for Implemented. Matrix totals from `node scripts/req-status.mjs`: Implemented 3, Partial 60, Not started 9 of 72 (section 6.1: 2/49/2 of 53; section 6.2: 1/11/7 of 19). These totals were not raised by the final fixes.
**Path shorthand** (expanded by the script). `S:` = `src/`, `F:` = `src/features/`, `L:` = `src/shared/lib/api/`, `D:` = `src/domain/`, `SB:` = `supabase/`, `EF:` = `supabase/functions/server/`, `SH:` = `supabase/functions/_shared/`, `T:` = `supabase/tests/`, `E:` = `e2e/`, `M0001` to `M0005` = `supabase/migrations/000N_*.sql`. A path followed by `#text` in the test column means the file must contain that text (the named behaviour); the script fails the row if it does not.

**Requirement ids in test names.** Only one test file mentions a requirement id (FR-MOOD-05 in a comment). The test column was assigned by reading what each file covers. The script reports how many rows are id-tagged so this gap stays visible.

**Downgrades in this revision** (all were Implemented before):
- FR-AUTH-04: append-only trigger and RLS were unexecuted when the row was downgraded (executed locally since, see the update below).
- FR-MOOD-05: only the keyword layer; heldout recall 0.70 against a 0.95 target.
- FR-ASSESS-01: instrument licensing and approved Hindi wording unchecked.
- FR-AI-04: no test proves it; inspection only.
- FR-BOOK-01: the directory reads from tables whose RLS had never been executed.

**Update 2026-11-20.** The SQL has now been executed on a local Supabase (28 tables, RLS on all; at the time 101 pgTAP tests passed, 146 in files 01 to 14 now). Running it found 7 defects the static audit missed (doc 21, findings 22 to 28). Statuses were deliberately **not** raised because of this: the Implemented count stayed at 3 (the new totals are above), since hosted Supabase has not been tried and the script only counts Vitest or Playwright evidence for Implemented.

### 6.1 Functional requirements

| ID | Implementation | Test file(s) | Status | Gap or note |
|---|---|---|---|---|
| FR-AUTH-01 | `F:auth/Login.tsx`, `S:app/providers/AuthProvider.tsx`, `F:onboarding/Onboarding.tsx`, `F:consent/ConsentLedger.tsx` | `F:auth/Login.test.tsx`, `S:app/providers/AuthProvider.test.tsx`, `F:consent/ConsentFlow.test.tsx#age confirmation`, `E:journeys.spec.ts#required age check`, `E:real/real-sign-in-and-routes.spec.ts` | Partial | Magic link and Google SSO only, no email-and-password path. The 18+ checkbox now exists in onboarding and is tested, but it is a client-side gate and is not stored in the schema (L23). |
| FR-AUTH-02 | `EF:app.ts` (Bearer token check, 401), `L:sessionHelper.ts` | `EF:app.test.ts#401 without a token`, `EF:app.test.ts#invalid token` | Partial | Tested against a mocked token verifier. Also verified on 2026-11-20 against the real Supabase Deno edge runtime with real JWTs: a request with only the anon key returns 401. Not run on a hosted project. The client function slug now defaults to `server` (`VITE_FUNCTIONS_SLUG`). |
| FR-AUTH-03 | Enum `user_role` and RLS in `M0001`, `is_moderator()` in `M0004`, `F:auth/ProtectedRoute.tsx` | `F:auth/ProtectedRoute.test.tsx`, `T:01_cross_user_isolation.test.sql`, `T:02_care_shares_counsellor.test.sql`, `T:06_community_and_chat.test.sql` | Partial | RLS executed on a local Postgres (pgTAP passes; two RLS infinite recursions were found and fixed, see doc 21); hosted Supabase not tried. Role "dean" is `institution_admin`. |
| FR-AUTH-04 | Table `consents` (append-only trigger in `M0002`), `L:consents.ts`, `F:consent/ConsentLedger.tsx`, `F:onboarding/Onboarding.tsx` | `F:consent/ConsentFlow.test.tsx`, `L:consents.test.ts`, `T:04_triggers_and_append_only.test.sql` | Partial | Downgraded. Client ledger and revocation are tested; the append-only trigger now runs in the local pgTAP suite and passes; hosted Supabase not tried. Purposes in the enum differ from the SRS list. Withdrawal is a new ledger row. |
| FR-AUTH-05 | `F:settings/Settings.tsx`, `L:account.ts` (`exportStudentData`), `EF:app.ts` (`GET /me/export`) | `F:settings/Settings.test.tsx`, `L:account.test.ts`, `EF:app.test.ts#export returns only ciphertext columns` | Partial | Export covers profile, consents, moods, assessments, journals (ciphertext), safety plan, appointments. Chat and thought records are not in the client schema. "Under 10 s" (NFR-PRIV-02) not measured. The original IDOR on `GET /students/<id>/export` is closed: verified on 2026-11-20 with real JWTs that the response is the caller's own data and the id in the URL is ignored. |
| FR-AUTH-06 | `F:settings/Settings.tsx` (type DELETE to confirm), `L:account.ts` (`deleteStudentAccount`), `EF:app.ts` (`DELETE /me`) | `F:settings/Settings.test.tsx`, `L:account.test.ts`, `EF:app.test.ts#delete erases the token user`, `T:07_security_gaps.test.sql` | Partial | Server cascade is covered by local pgTAP. Erasure order is fixed: the server delete runs first, then a local wipe that also discards the offline outbox (was L49, closed). Local wipe fixed and browser-verified 2026-11-20 (SEC-03): one `clearAllLocalUserData()` runs on logout and erase and removes the encrypted CBT, worry and safety card keys. |
| FR-AUTH-07 | `handle_new_user()` in `M0002` creates an alias profile on signup, `F:onboarding/Onboarding.tsx` | `F:consent/ConsentFlow.test.tsx#anonymous alias`, `T:04_triggers_and_append_only.test.sql` | Partial | Alias is generated and shown in onboarding; no screen to change it was found. Verified on local Supabase 2026-11-20: sign-up through the API created a profile with an anonymous alias. |
| FR-MOOD-01 | `F:mood/MoodCheckIn.tsx`, `L:moods.ts` | `F:mood/MoodCheckIn.test.tsx#5-point mood scale`, `L:moods.test.ts`, `E:journeys.spec.ts#logs a mood` | Partial | The UI offers 5 choices stored as scores 2, 4, 6, 8, 10; the server accepts 1 to 10 (L20). "3 taps" not measured. While offline `addMood` queues the entry in the encrypted outbox (needs an unlocked vault, L39) and sends it after reconnection. |
| FR-MOOD-02 | `S:shared/ui/MoodChart.tsx`, `F:insights/Insights.tsx`, `F:dashboard/Dashboard.tsx` | `F:mood/MoodCheckIn.test.tsx#data table` | Partial | Only the trend toggle and table fallback on the mood page are tested. `Insights.tsx` and `Dashboard.tsx` have 0% coverage and still use mock data (L15). |
| FR-MOOD-03 | None: the moods API module exposes only fetch and add. RLS permits update and delete but no client path exists | none | Not started | |
| FR-MOOD-04 | `F:dashboard/DailyMicroHabits.tsx`, `F:modals/BreathingModal.tsx`, `F:modals/GroundingModal.tsx` | `F:cbt/Modals.test.tsx` | Partial | Suggestions are static, not driven by the logged mood. `DailyMicroHabits.tsx` has 0% coverage. No clinician review (L3). |
| FR-MOOD-05 | `F:mood/MoodCheckIn.tsx` calls `detectRisk` from `D:risk/lexicon.ts` | `F:mood/MoodCheckIn.test.tsx#crisis support alert`, `D:risk/lexicon.test.ts`, `E:journeys.spec.ts#distress words` | Partial | Downgraded. Code and tests pass, but the keyword layer reaches heldout recall 0.70 against a 0.95 target (L5, L6) and the LLM layer is unmeasured (L7). |
| FR-ASSESS-01 | `F:assessment/Assessment.tsx`, `D:scoring/phq4.ts`, `D:scoring/phq9.ts`, `D:scoring/gad7.ts` | `D:scoring/phq4.test.ts`, `D:scoring/phq9.test.ts`, `D:scoring/gad7.test.ts` | Partial | Downgraded. Scoring is correct and tested, but instrument licence terms and validated Hindi wording are unchecked (L27). GAD-7 added beyond the SRS. |
| FR-ASSESS-02 | Disclaimer constants shown in `F:assessment/Assessment.tsx` | `F:assessment/AssessmentCrisis.test.tsx`, `E:journeys.spec.ts#educational disclaimer` | Partial | Disclaimer shown with a score band is e2e-tested; before-and-after on every result is not asserted. |
| FR-ASSESS-03 | Band labels in `D:scoring/phq9.ts`, `D:scoring/gad7.ts`, `D:scoring/phq4.ts` | `D:scoring/phq9.test.ts` | Partial | Bands are named "Moderate depression" and similar; wording should be softened to avoid a diagnostic tone (L27, clinical review pending). |
| FR-ASSESS-04 | `D:scoring/phq9.ts` (`item9Flag`), `D:risk/riskRouting.ts`, `F:assessment/Assessment.tsx`, `EF:scoring.ts` | `D:scoring/phq9.test.ts`, `D:risk/riskRouting.test.ts`, `F:assessment/AssessmentCrisis.test.tsx`, `EF:scoring.test.ts`, `EF:app.test.ts#PHQ-9 item 9`, `E:journeys.spec.ts#non-zero item 9` | Implemented | Verified: Vitest (client scoring, routing, crisis card with tel: links; server scoring and API path with risk event) and Playwright (crisis card with 14416, 1800-599-0019 and 112 shown before any score). Also verified on 2026-11-20 through the local edge function with a real JWT: PHQ-9 item 9 = 2 stored the assessment and created a crisis risk event with helplines. Hosted Supabase not tried. Helpline numbers still need re-checking before each release. |
| FR-ASSESS-05 | Table `assessments` in `M0001`, `L:assessments.ts` | `L:assessments.test.ts`, `EF:app.test.ts#assessment, mood and journal inserts`, `T:01_cross_user_isolation.test.sql` | Partial | Per-user RLS is covered by local pgTAP (passes); hosted Supabase not tried. |
| FR-ASSESS-06 | `D:risk/riskRouting.ts` (booking suggestions by level) | `D:risk/riskRouting.test.ts` | Partial | Routing is by risk level, not by PHQ-9 total. Thresholds not verified against the source instrument. |
| FR-CRISIS-01 | `F:crisis/CrisisPage.tsx`, `F:chat/CrisisCard.tsx`, `F:chat/HelplineLinks.tsx`, `F:modals/SosModal.tsx` | `F:crisis/CrisisPage.test.tsx`, `F:chat/Chat.test.tsx`, `F:assessment/AssessmentCrisis.test.tsx`, `L:safetyPlan.test.ts`, `E:journeys.spec.ts#three mandated helplines` | Partial | tel: links tested for chat and assessment; SOS dialog tested in Playwright only (`SosModal.tsx` has 0% Vitest coverage). `CrisisPage.tsx` branch coverage is 54%. Whether the banner is inescapable on every surface is not verified. |
| FR-CRISIS-02 | `D:risk/lexicon.ts` (English, Devanagari, Hinglish); used in mood, chat, assessment, journal | `D:risk/lexicon.test.ts`, `D:risk/lexicon.v2.test.ts`, `SH:lexicon.test.ts`, `F:journal/Journal.test.tsx` | Partial | Heldout recall 0.70 (see 11-ai-evaluation-plan.md). Hinglish and Hindi are weaker than English. Synthetic single-annotator data (L1, L2). |
| FR-CRISIS-03 | Client `D:risk/lexicon.ts`. Server `EF:claude.ts` (`classifyRiskLevel`) and `SH:lexicon.ts` | `EF:claude.test.ts#classifyRiskLevel`, `SH:lexicon_drift.test.ts`, `D:risk/lexicon.v2.test.ts` | Partial | Server classifier is tested against a mocked model and the server lexicon is now generated from `src/domain/risk/lexicon.ts` by `scripts/sync-lexicon.mjs` (hash-checked); it agrees with the client on all 600 dataset rows. No measured LLM or hybrid result exists (L7). |
| FR-CRISIS-04 | `D:risk/lexicon.ts` and static helplines `F:chat/HelplineLinks.tsx` run in the browser; hand-written service worker built by `vite.config.ts` (app shell, `/login`, `/crisis`, `/chat`, `/dashboard` chunks, offline page); `S:shared/lib/pwa/helplines.ts`, `S:shared/lib/pwa/cacheVersion.ts`, `S:shared/lib/pwa/register.ts`; `F:offline-ui/OfflineBanner.tsx` | `F:chat/Chat.test.tsx#degraded-mode banner`, `E:pwa.spec.ts`, `E:offline-ui.spec.ts`, `S:shared/lib/pwa/cacheVersion.test.ts`, `S:shared/lib/pwa/register.test.ts` | Partial | Upgraded from "no service worker". Playwright (the `pwa` project, production build, desktop Chromium, `setOffline`) reloads `/crisis` and `/chat` with the network off and shows 14416, 1800-599-0019, 112 and the verified date; other routes show an offline page with the helplines. **Not tested on a real phone**, only after one online visit, and iOS Safari has no Background Sync (L18, docs/26). Offline detection is the keyword lexicon only, heldout recall 0.70 (L40). Stays Partial. |
| FR-CRISIS-05 | SOS button in `F:navigation/Header.tsx`, `F:modals/SosModal.tsx`; `/crisis` route | `F:crisis/CrisisPage.test.tsx`, `F:navigation/Navigation.test.tsx`, `E:journeys.spec.ts#same place on every main route`, `E:smoke.spec.ts#SOS button` | Partial | Playwright confirms the button on every main route in demo mode. The login and onboarding screens are not covered by that check. `MobileNav` and `Sidebar` coverage is about 58% and 67%. |
| FR-CRISIS-06 | `EF:claude.ts` and `EF:app.ts` chat stream with lexicon pre-screen and safe fallback, `SH:lexicon.ts` | `EF:app.test.ts#streams the crisis card`, `EF:claude.test.ts#skips generation`, `F:chat/Chat.test.tsx#never calls the AI` | Partial | Tested with a mocked model. The server runs the output guard before any text is shown (buffered, never streamed unguarded) and a classifier failure no longer falls through to free generation. The real Claude route was NOT verified (needs `ANTHROPIC_API_KEY`) and the model name is unverified (L24). |
| FR-CRISIS-07 | Table `risk_events` in `M0001` (no message text column), `F:chat/api.ts` (`logChatCrisisEvent`), view `risk_queue` in `M0005` (exposes only `offline` and `detected_at` from the payload) | `F:chat/api.test.ts`, `F:chat/Chat.test.tsx#no message content`, `T:10_overdue_escalation.test.sql` | Partial | Offline events carry only `layer`, `detected_at` and `offline` (tested in `F:chat/api.test.ts`). The consent is checked online, from a cache while offline, and again at send time (`S:shared/lib/offline/outbox.ts`). A student with no cache is not logged (L42). No real service reads the alerts (L29). |
| FR-CRISIS-08 | No outbound path to the university in code (inspection only), `D:risk/riskRouting.ts` | `F:admin/Admin.test.tsx`, `T:05_k_anonymity_aggregates.test.sql` | Partial | Counsellor alert stays inside the platform. Aggregates reach `institution_admin` only through k-anonymity views; the k = 10 floor is not a guarantee (L32) and the pgTAP file passes on a local Supabase only. |
| FR-CRISIS-09 | `M0005` (tables `risk_followups`, `institution_backup_counsellors`; triggers for the initial step, transition order, append-only and closing; RPC `advance_risk_followup`; dropped student UPDATE policy on `risk_events`), `F:counsellor/api.ts`, `F:counsellor/RiskQueue.tsx` | `F:counsellor/RiskQueue.test.tsx`, `F:counsellor/riskApi.test.ts`, `F:counsellor/smoke.local.test.ts`, `T:08_crisis_followup_lifecycle.test.sql`, `T:09_crisis_security_and_isolation.test.sql`, `T:11_warm_handoff_and_optout.test.sql`, `E:real/crisis-followup.spec.ts` | Partial | Warm handoff (`offer_handoff_slot`, `accept_handoff_offer`, `decline_handoff_offer`, migration `M0006`) is built and covered by pgTAP 11. Built and checked by hand on 2026-11-20 against a local Supabase with a student and a counsellor in two browsers (flag, acknowledge, illegal jump rejected, student cannot resolve own event). pgTAP 08 and 09 pass locally; `smoke.local.test.ts` is skipped unless JWT variables are set; `E:real/crisis-followup.spec.ts` passes against the local stack (follow-through loop with security attempts; a new crisis event appears in the counsellor queue within about a second without a reload, through the Realtime publication of migration 0008). The warm handoff flow itself has no real-browser end-to-end check. A single PHQ-9 item 9 now creates exactly one risk event (the database trigger is the single source of truth). In-app only, unstaffed, no 24/7 monitoring (L29, L38); timings have had no clinical review (L44); loop is empty without a care share (L45). |
| FR-CRISIS-10 | `M0005` (`risk_checkback_prompts`, `risk_checkbacks`, prompt-creation and reopen triggers), `F:followup/api.ts`, `F:followup/FollowUpCard.tsx` | `F:followup/FollowUp.test.tsx`, `T:08_crisis_followup_lifecycle.test.sql`, `T:09_crisis_security_and_isolation.test.sql` | Partial | Prompts at 24 h and 72 h, answer once, "want to talk" reopens (pgTAP and a manual check). The opt-out is now stored on the server (`profiles.checkback_opt_out`, migration 0006, RPC `set_checkback_opt_out`, pgTAP 11); `localStorage` is only an offline fallback. A student can still miss a check-back if the app is not opened. The Critical defect from the independent review (a reopened event did not re-escalate, docs/28 G6-SEC-01) is fixed in migration 0007; notification idempotency is now per follow-up cycle and pgTAP 12 passes. Check-back wording and cadence not clinically reviewed (L44). |
| FR-CRISIS-11 | `M0005` (`escalate_overdue_risk`, `risk_queue` view, guarded `pg_cron` job), `F:counsellor/api.ts` (`runOverdueEscalation`), `F:counsellor/RiskQueue.tsx` | `F:counsellor/RiskQueue.test.tsx`, `F:counsellor/riskApi.test.ts`, `T:10_overdue_escalation.test.sql` | Partial | Level 1 and level 2 notifications, idempotency, no message content and audit rows are covered by pgTAP 10 on a local Supabase. `pg_cron` not verified (L46); notifications appear only when a counsellor signs in (L29). |
| FR-CRISIS-12 | `S:shared/lib/offline/outbox.ts`, `S:shared/lib/offline/registerBackgroundSync.ts`, `S:shared/lib/offline/useOutboxStatus.ts`, `F:chat/api.ts` (`logChatCrisisEvent`, `warmCrisisConsentCache`), `S:app/layouts/AppLayout.tsx` (`initOutbox`), `M0005` (`enforce_risk_event_server_timestamp`), `F:offline-ui/SyncChip.tsx` | `S:shared/lib/offline/outbox.test.ts`, `S:shared/lib/offline/hooks.test.ts`, `F:chat/api.test.ts`, `F:offline-ui/offline-ui.test.tsx`, `S:app/layouts/AppLayout.test.tsx`, `L:consents.cache.test.ts`, `E:offline-ui.spec.ts`, `T:09_crisis_security_and_isolation.test.sql` | Partial | Unit tests use fake IndexedDB. An offline mood and an offline crisis message are queued in a real browser against a local Supabase and arrive after reconnection with a server `created_at` (real-backend spec `offline-outbox.spec.ts`, passing). Crisis events are queued at once from a consent cache filled while online; consent is re-verified server-side at send time. Offline moods queue because the mutation uses `networkMode: "always"`. Nobody is alerted while offline (L38); needs an unlocked vault, and Background Sync does nothing (L39); lexicon recall 0.70 (L40); device clock (L41); consent cache (L42). Not tested on a phone. |
| FR-CRISIS-13 | `F:counsellor/RiskQueue.tsx` (banner "In-app alerts only. This is not monitored 24/7."), `F:followup/FollowUpCard.tsx`, `F:offline-ui/OfflineBanner.tsx`, `F:crisis/CrisisPage.tsx` | `F:counsellor/RiskQueue.test.tsx`, `F:followup/FollowUp.test.tsx`, `F:offline-ui/offline-ui.test.tsx`, `E:offline-ui.spec.ts` | Partial | Wording is asserted in tests and an axe check runs on the offline banner. The status card now says plainly "Alert recorded. It was not shared with a counsellor." when no counsellor can see the alert, with the helplines first. The Hindi wording is team-written and unreviewed (L48, docs/27). Whether students read and understand the limits is untested (no user study, L8). |
| FR-AI-01 | `F:chat/Chat.tsx`, `L:chat.ts` (`streamChat`), system prompt in `EF:claude.ts` | `F:chat/Chat.test.tsx`, `L:chat.test.ts`, `EF:claude.test.ts#chat pipeline` | Partial | Language mirroring is a prompt instruction, not evaluated. |
| FR-AI-02 | `EF:app.ts` (`POST /chat/stream`, SSE) | `F:chat/Chat.test.tsx#never renders a guard-blocked reply`, `EF:app.test.ts#POST /chat/stream` | Partial | Mock streams only. TTFT never measured (L9). |
| FR-AI-03 | Frozen system prompt and `checkOutputGuard` in `EF:claude.ts` | `EF:claude.test.ts#output guard`, `EF:claude.test.ts#frozen system prompt` | Partial | Tests assert the prompt is sent and the guard rewrites two classes of output. No safety evaluation of the live model and no clinician review (L3). |
| FR-AI-04 | Key read from `Deno.env` in `EF:anthropic_client.ts` only | `EF:claude.test.ts#never creates a client` | Partial | Downgraded. By inspection the client bundle holds no key (SEC-09), but no test or secret scan proves it. |
| FR-AI-05 | `EF:rate_limiter.ts`, `check_rate_limit()` in `M0003`, `EF:validation.ts` (message max 3000) | `EF:rate_limiter.test.ts`, `EF:validation.test.ts#enforces message length`, `EF:app.test.ts#rate limits with 429` | Partial | In-memory fallback and the RPC call are tested with mocks. The SQL token bucket is covered by local pgTAP; no load test. |
| FR-AI-06 | `F:chat/Chat.tsx` (AI label on greeting and every bot reply) | `F:chat/Chat.test.tsx#labels the greeting and every bot reply as AI` | Implemented | Verified: Vitest passes (labels on greeting and replies, Hinglish placeholder). Client-only behaviour with no database dependency. |
| FR-AI-07 | "Clear conversation" with second confirmation in `F:chat/Chat.tsx`; `retention_expires_at` and `purge_expired_chat_messages()` in `M0004` | `F:chat/Chat.test.tsx#second confirmation`, `T:06_community_and_chat.test.sql` | Partial | Server purge: pgTAP passes locally; `pg_cron` scheduling not verified. Default retention in schema is 30 days, decision still TODO. Whether the write path stores chat encrypted is unconfirmed (L31). |
| FR-AI-08 | `checkOutputGuard` in `EF:claude.ts` | `EF:claude.test.ts#output guard replaces` | Partial | Diagnosis claims and method details are tested. Rule set not clinically reviewed (L3). |
| FR-AI-09 | Degraded mode in `F:chat/Chat.tsx`, safe fallback in `EF:claude.ts` | `F:chat/Chat.test.tsx#degraded-mode banner`, `EF:claude.test.ts#safe fallback` | Partial | The 4 s limit is not asserted. |
| FR-BOOK-01 | `F:doctors/Doctors.tsx`, `F:doctors/api.ts` (`fetchCounsellors`) | `F:doctors/Doctors.test.tsx#lists verified counsellors` | Partial | Downgraded earlier. Update 2026-11-20: a real-session browser check against local Supabase showed real seeded counsellors and slots (not part of the automated tests). Hosted Supabase not tried; status stays Partial. |
| FR-BOOK-02 | `book_appointment_atomic()` (row lock) and `btree_gist` exclusion constraint in `M0001`, `M0004`; `EF:app.ts` (`POST /appointments`) | `F:doctors/Doctors.test.tsx#409 slot conflict`, `T:06_community_and_chat.test.sql` | Partial | Parallel-booking concurrency has not been exercised. |
| FR-BOOK-03 | Enum `appointment_status` in `M0001`: scheduled, confirmed, completed, cancelled | none | Partial | Four states, not the six first designed; no no-show or reschedule state (L21). |
| FR-BOOK-04 | `canCancel` in `F:doctors/api.ts` | `F:doctors/Doctors.test.tsx#2 hour cancellation rule`, `F:doctors/http.test.ts` | Partial | 2 h window (`CANCEL_WINDOW_MS`) enforced client-side. Policy not confirmed with counsellors. |
| FR-BOOK-05 | `F:counsellor/CounsellorDashboard.tsx`, `F:counsellor/RiskQueue.tsx`, care shares (`has_active_care_share`) in `M0001` | `F:counsellor/Counsellor.test.tsx`, `T:02_care_shares_counsellor.test.sql` | Partial | `/counsellor` mounts the dashboard for a real session and a simulated view in demo mode. Not run on hosted Supabase. Portal copy under `F:dashboard/CounsellorPortal.tsx` is static (L14 is partly out of date). |
| FR-BOOK-06 | `EF:app.ts` (`POST /appointments/:id/video-token`, Daily.co), `F:modals/VideoSessionModal.tsx` | `F:doctors/Doctors.test.tsx#Daily prebuilt room` | Partial | Needs `DAILY_API_KEY`, not exercised with a real key. Open findings SEC-01 (iframe without `sandbox`) and SEC-02 (host not restricted to daily.co). |
| FR-BOOK-07 | `F:doctors/Doctors.tsx`; the SOS button in `F:navigation/Header.tsx` | `F:doctors/Doctors.test.tsx` | Partial | No urgent-help text was found in `Doctors.tsx` itself; the global SOS button covers it indirectly. No specific assertion. |
| FR-COMM-01 | `F:community/CirclesPanel.tsx`, `F:stories/CampusCirclesHub.tsx`, `F:stories/CampusStories.tsx` | `F:community/Community.test.tsx` | Partial | Circles replace the "stories by theme" model. |
| FR-COMM-02 | `submitPost`, `classifyContent` in `F:community/api.ts`; `posts.moderation_status` in `M0004` | `F:community/Community.test.tsx`, `T:06_community_and_chat.test.sql` | Partial | Posts default to `approved` in the table (L22); pre-moderation depends on application code. |
| FR-COMM-03 | `F:community/ModeratorQueue.tsx` (embedded in `F:stories/CampusStories.tsx`), `is_moderator()` in `M0004`, `F:dashboard/ModeratorPortal.tsx` | `F:community/Community.test.tsx`, `T:06_community_and_chat.test.sql` | Partial | `/moderator` renders the static `ModeratorPortal` copy in demo mode. Not shown with live data. |
| FR-COMM-04 | `EF:app.ts` (`POST /moderation/classify`), `classifyContent` in `F:community/api.ts` | `F:community/Community.test.tsx` | Partial | Server route has no dedicated test. |
| FR-COMM-05 | `reportPost` in `F:community/api.ts`, table `reports` in `M0004` | `F:community/Community.test.tsx` | Partial | Table RLS: local pgTAP passes; hosted Supabase not tried. |
| FR-COMM-06 | None: no likes feature in the schema or client | none | Not started | |

### 6.2 Non-functional requirements

| ID | Implementation or evidence | Test or measurement | Status | Note |
|---|---|---|---|---|
| NFR-PERF-01 | None measured | Lighthouse CI not set up | Not started | |
| NFR-PERF-02 | None measured | No load test | Not started | |
| NFR-PERF-03 | None measured | No load test | Not started | |
| NFR-A11Y-01 | `eslint.config.js` (jsx-a11y rules), `E:a11y.spec.ts` (axe) | `E:a11y.spec.ts#no serious or critical violations` | Partial | Axe spec passes in Playwright: 57 combinations (14 routes x light/dark x 1280px/375px), zero serious or critical violations, no `test.fixme` left. Chromium only; no manual keyboard or NVDA audit. |
| NFR-A11Y-02 | `S:shared/ui/Modal.tsx`, `:focus-visible` styles in `S:index.css` | `F:doctors/Doctors.test.tsx#closes with Escape`, `E:journeys.spec.ts#closes with Escape`, `E:a11y.spec.ts#focus indicator is visible` | Partial | Contrast not measured separately. Focus trap not asserted. |
| NFR-A11Y-03 | `prefers-reduced-motion` rule in `S:index.css` | none | Partial | The CSS rule exists; no test covers it. |
| NFR-QUAL-01 | `vitest.config.ts` (threshold lines 80) | Measured 2026-11-20: lines 90.61%, statements 88.62%, branches 80.56%, functions 86.44% (scope: `src/domain` and `src/features`; thresholds enforced) | Partial | Lines at least 80 met within that scope. "100% of crisis branches" not met (per-file figures from 2026-11-19, not re-measured; the whole-scope branch figure is 80.56%: lexicon 94.3%, riskRouting 86.95%, CrisisPage 54.16% branches). |
| NFR-SAFE-01 | `D:risk/lexicon.ts` v2, `eval/results/keyword-v2.md` | `eval/results/keyword-v2.md` heldout recall 0.70 | Partial | Below the 0.95 target. LLM and hybrid results pending (L7). |
| NFR-SAFE-02 | `D:risk/lexicon.ts` v2, `eval/results/keyword-v2.md` | Heldout false-alarm rate 0.000, hard-negative specificity 1.000 (n=45) in `eval/results/keyword-v2.md` | Partial | Keyword layer only, synthetic data (L1). |
| NFR-SEC-01 | OpenAPI file only | Threat model (06) and frontend audit (23) are documents, not a completed ASVS checklist | Not started | Doc 23 tracks the findings. SEC-03 (High) is fixed and browser-verified; the others are as listed in doc 23. No ZAP run. |
| NFR-SEC-02 | Secrets read from env, `vercel.json` headers | Inspection | Partial | TLS comes from the hosting platforms. The hard-coded fallback Supabase project was removed: `utils/supabase/info.tsx` now reads only the `VITE_*` variables. |
| NFR-PRIV-01 | `D:crypto/journalCrypto.ts` (AES-256-GCM, PBKDF2 600,000), `F:journal/vault.ts`, `L:journal.ts` | `D:crypto/journalCrypto.test.ts`, `F:journal/Journal.test.tsx`, `L:journal.test.ts`, `T:03_zero_knowledge_journals.test.sql` | Implemented | Verified: Vitest passes (encrypt and decrypt round trip, vault gate, API sends ciphertext only; the server export test returns ciphertext columns). Server-side pgTAP `03` passes on a local Supabase but is not what the status relies on. |
| NFR-PRIV-02 | Export and erase endpoints exist in the edge function | Not timed | Not started | No measurement against the 10 s target. |
| NFR-PRIV-03 | `S:shared/lib/offline/outbox.ts` (SHA-256 database name per user, AES-256-GCM through the vault key, 7-day purge, flush skips other users' rows), `S:shared/lib/storage/secureStore.ts` (`clearAllLocalUserData` keeps the outbox unless told to discard), `F:offline-ui/LogoutGuardDialog.tsx` | `S:shared/lib/offline/outbox.test.ts`, `S:shared/lib/storage/secureStore.test.ts`, `F:offline-ui/offline-ui.test.tsx` | Partial | Shared-device isolation, replay idempotency, consent drop and the 7-day purge are unit-tested with fake IndexedDB. A shared-device case passes in the real-backend Playwright project (docs/29). After the independent review (docs/28) the outbox metadata (kind, timestamps) is inside the encrypted payload and the database name is salted. Session expiry bypasses the logout dialog; items stay encrypted and are purged after 7 days. The logout dialog now makes Escape the safe option and shows the three helplines. |
| NFR-AVAIL-01 | `public/sw.js` (template), `vite.config.ts` (`pwaServiceWorker` plugin), `S:shared/lib/pwa/register.ts`, `S:shared/lib/pwa/cacheVersion.ts`, `F:offline-ui/UpdateToast.tsx` | `E:pwa.spec.ts`, `S:shared/lib/pwa/cacheVersion.test.ts`, `S:shared/lib/pwa/register.test.ts`, `F:offline-ui/UpdateToast.test.tsx` | Partial | Moved from Not started. Crisis content loads offline after one online visit, proven in desktop Chromium only (production build, `setOffline`). No real-device test, no iOS, no other browser, cache-cleanup on activation not tested end to end (L18, L33, L47). |
| NFR-AVAIL-02 | `S:shared/lib/pwa/helplines.ts`, `S:shared/lib/pwa/cacheVersion.ts`, `vite.config.ts` (renders `offline.html` from the same file) | `S:shared/lib/pwa/helplines.test.ts`, `S:shared/lib/pwa/cacheVersion.test.ts`, `E:pwa.spec.ts` | Partial | The cache name changes when a number or the verified date changes (unit test), and the offline page and crisis page show the date. The date records the team's last check; the check against an official source is not documented (L28). A device that stays offline keeps the old copy. |
| NFR-USAB-01 | None | No study run | Not started | |
| NFR-I18N-01 | `S:locales/en.json`, `S:locales/hi.json` plus per-feature locale files | `F:journal/locales.test.ts`, `E:journeys.spec.ts#language switch to Hindi` | Partial | Hindi strings not reviewed by a native or clinical reviewer (L27). |
| NFR-COMP-01 | None | No cross-browser run (Playwright runs Chromium only) | Not started | |

### 6.3 Checking the matrix (how to re-run)

The matrix is machine-checked by `scripts/req-status.mjs` (plain Node, no dependencies). From the project root:

```
node scripts/req-status.mjs            # table of problems, exit 1 on any ERROR
node scripts/req-status.mjs --quiet    # errors only
node scripts/req-status.mjs --json     # machine-readable result
```

Suggested `package.json` script: `"req:status": "node scripts/req-status.mjs"`.

What it checks:
- Every path in the implementation and test columns exists (globs with `*` are allowed). A missing file is an ERROR.
- `path#text` entries: the test file must contain the text (the named behaviour).
- The requirement id is searched in all test files; the summary reports how many rows are id-tagged.
- A row marked Implemented must name at least one existing Vitest or Playwright test (pgTAP does not count), must have a "Verified:" note, must not reference an open limitation (`L<n>`) or finding (`SEC-<nn>`), and its implementing files must not appear as open items in 19-known-limitations.md or 23-frontend-security-audit.md.
- Orphan tests (test files no row references) are listed as warnings.
- Every requirement id used in sections 1 to 5 has a row, and the "Counts:" line above equals the recomputed counts.

When you change a status, update the "Counts:" line (and the by-table line) to the numbers the script prints. The script exits non-zero if they differ, so the numbers cannot drift silently.


## 7. Verification

See 10-test-plan.md and 18-testing-report.md. Traceability approach: 00-README.md.

## 7. Open items

- TODO: licensing of PHQ instruments and Hindi translations.
- TODO: legal review of minors and data residency.
- TODO: confirm chat retention default.
