# Chapter 7. Security and Privacy

This chapter summarises the threat model (docs/06), the privacy analysis (docs/07) and the controls actually present in the code. The standing caveat is that **no independent security test has been run**: no penetration scan (OWASP ZAP), no dependency audit, no external review. As of 2026-11-20 the database policies have been executed on a local Supabase stack (14 pgTAP files, 146 tests pass on migrations 0001 to 0008; running them found two RLS infinite recursions and other defects, see docs/21), the edge function has Vitest tests and was exercised on the real edge runtime with real JWTs, a five-test Playwright project runs the crisis loop, the offline outbox and a shared-device case against the local stack, and one High frontend finding (SEC-03) was fixed and browser-verified. An independent AI review of the two late features (docs/28) found a Critical defect and others, all fixed in migration 0007 and the app code with failing-first tests. Nothing has been run on a hosted project, and the Claude and Daily.co routes are unverified. The chapter describes design and implementation, and it separates what was read in code from what was tested.

## 7.1 Assets and trust boundaries

Assets: journals, chat text, screening results, mood history, appointments, identity (email), API keys and the integrity of crisis content. Trust boundaries lie between the browser and the edge function, the edge function and Postgres, the edge function and the Claude API, and between counsellor or moderator roles and student data.

The first prototype had a known weakness: the anonymous key served as bearer token and the student identifier was a URL parameter, so anyone who guessed an identifier could read, export or delete that student's data (TH-01). The present design removes the identifier from the path, derives identity from the verified JWT, and relies on row level security as a second barrier.

## 7.2 Threat model summary

The method is STRIDE per feature, then mapping to the OWASP Application Security Verification Standard 4.0.3 at Level 1 and the OWASP Top 10 for LLM Applications [S32] **[VERIFY]**. The chapter and item identifiers used in the documents must be checked against the published versions. Thirty-two threats were enumerated (TH-01 to TH-32; TH-21 to TH-32 cover the follow-up loop, the offline outbox, the service worker and the findings of the independent review). Table 7.1 shows those most relevant to this project, with the control and its verification state.

**Table 7.1 Selected threats and controls**

| ID | Threat | Control (design) | Evidence |
|---|---|---|---|
| TH-01 | Guessed student ID reads others' data | JWT-derived identity, RLS | Verified 2026-11-20: through the real edge runtime with real JWTs, `GET /students/<other-id>/export` returns the caller's own data (the URL id is ignored, so the original IDOR is closed). RLS covered by local pgTAP; hosted project not tried |
| TH-04 | Client forges item 9 to suppress crisis | Server recomputes from raw answers; DB trigger | Server scoring is unit tested. A PHQ-9 submission with item 9 = 2 through the real edge function stored the assessment and created a crisis risk event with helplines (local stack). Hosted project not tried |
| TH-05 | Server or database leak exposes journals | Client-side AES-GCM; server stores ciphertext | Unit tested (15 tests); pgTAP 03 passes on a local Supabase; hosted project not tried |
| TH-06 | Chat history leaked through logs | No content in logs, retention window, RLS | Not verified |
| TH-07 | Prompt injection to obtain diagnosis or ignore safety | Frozen prompt, output guard, crisis outside the model | Guard rules untested |
| TH-09 | Token-cost exhaustion | Rate limit, message cap of 3,000 characters | Untested |
| TH-10 | Harmful model output | Output guard, plain-text rendering | Untested |
| TH-11 | Crisis banner disabled by tampering or outage | Browser-side lexicon, static helplines, server re-check | Browser parts tested |
| TH-15 | Re-identification of community authors | Alias, no author field in moderator view | Not verified |
| TH-18 | Small-cohort re-identification through aggregates | Suppression threshold | k = 10 in SQL; 20 in SRS; unverified |
| TH-19 | XSS through post or chat content | React escaping, no `dangerouslySetInnerHTML`, CSP | CSP not confirmed |

## 7.3 Controls in the code

**Identity and access.** The edge function authenticates each request with a per-user JWT and reads the user from the request context. The browser API layer takes identity from the session helper, never from a caller-supplied identifier. Roles are an enumeration in the database and are enforced by RLS policies and by `ProtectedRoute` in the browser (route guards are a convenience, not a security boundary).

**Secrets.** The Anthropic API key is read from `Deno.env.get("ANTHROPIC_API_KEY")` in the edge function only, and the browser bundle has no key. This is verified by inspection, not by an automated secret scan. The hard-coded fallback Supabase project that `utils/supabase/info.tsx` used to contain (limitation L17) was removed on 2026-11-20: the file now reads only `VITE_*` variables. Sensitive local data (CBT records, safety-card anchors, the trusted contact) is stored only as AES-GCM ciphertext under opaque keys, unreadable while the vault is locked (SEC-03, browser-verified), and one `clearAllLocalUserData()` runs on logout and erase.

**Input validation.** Request bodies are validated with zod schemas in `validation.ts`. The browser also validates the vault metadata with a zod schema.

**LLM-specific controls.** The model has no tools and cannot book, delete or send anything (LLM06 excessive agency is low by construction). The system prompt contains no secrets. Personally identifying information is redacted before text is sent (`_shared/pii.ts`). Crisis-flagged turns are answered with a template. The output of the model passes `checkOutputGuard`, which targets diagnostic phrases, self-harm methods and medication dosing. The guard rules have unit tests against a mocked model, and the guard now runs on the server before any text is shown (buffered, never streamed unguarded). Its effectiveness on the live model is unknown because the Claude route has not been run.

**Audit.** `audit_log` is append-only by trigger. Changes to care shares write audit rows through a trigger.

## 7.4 Cryptography and key management

Section 5.4 gives the parameters. Four properties follow, and four limits.

*Properties.* The server stores only ciphertext, IV and salt. A wrong passphrase fails authenticated decryption. Each entry has an independent salt and IV. Key derivation is deliberately slow (600,000 PBKDF2-SHA-256 iterations, a figure the source attributes to OWASP guidance; this must be checked against the current OWASP cheat sheet [S32] **[VERIFY]**).

*Limits.*

1. A person with database access can obtain the `check` blob and mount an offline guessing attack against the passphrase. Strength then depends on passphrase quality; the interface enforces only a minimum length of 8 characters.
2. The recovery blob stores the passphrase encrypted under a 16-character recovery code of about 79 bits. That is strong against guessing, but the code must be stored safely by the student.
3. Malicious JavaScript in the page (for example through a compromised dependency) could read the in-memory passphrase. The threat model addresses this through dependency audit and CSP, neither of which has been run or confirmed.
4. Loss of both secrets loses the journal permanently (L30). This is intended and must be explained to users.

Metadata is not hidden. The server can see when entries are written and their sizes.

## 7.5 Privacy by design

The data inventory (docs/07 section 1) maps each data type to a purpose, location and retention. The principles in the repository's DPDP steering file are consent and purpose limitation, local-first or client-side encryption, a right to a machine-readable copy of data, and a right to erasure without administrative approval. Table 7.2 relates them to the implementation.

**Table 7.2 Privacy principles and implementation**

| Principle | Implementation | State |
|---|---|---|
| Consent per purpose | Append-only `consents` ledger with six purposes, opt-in defaults, per-purpose withdrawal | Implemented; consent flow tested |
| Purpose limitation | No analytics SDK, no university recipient, in-platform alerts only | By inspection |
| Minimisation | Alias profile created on signup; no phone, ID number or location | Alias auto-assigned; no UI to choose one |
| Client-side encryption | AES-256-GCM journals | Implemented and unit tested |
| Access and portability | `GET /me/export` JSON | Partial; chat and thought records not exported |
| Erasure | `DELETE /me` with cascade | Cascade covered by local pgTAP; hosted project not tried |
| Retention | Chat messages expire after 30 days (default under review) | Purge function covered by local pgTAP; `pg_cron` scheduling not verified |
| Aggregates | k = 10 suppression views | Views changed to `security_invoker` (docs/21, finding 11); local pgTAP 05 passes; hosted project not tried |

## 7.6 Regulatory position

The project is **designed with reference to** the Digital Personal Data Protection Act 2023, and the term "compliant" is not used. Clause-level references in the repository, for example the numbers given for portability and erasure, were not checked against the legal text and no lawyer reviewed them (L25). The privacy impact assessment (docs/07 section 3) concludes that processing could proceed only for a supervised pilot, and only if two mitigations (RLS and identity handling, and provider data handling) are implemented and four open items are closed: breach notification procedure, treatment of minors, a named grievance contact and cross-border handling.

**Open privacy items**

1. **Cross-border transfer.** Supabase in Mumbai keeps stored data in India, but chat text sent to the Anthropic API leaves that region (L26). Provider retention terms, any zero-retention option and any restrictions on transfer under the Act have not been reviewed.
2. **Minors.** The product is for users aged 18 or over, but no 18+ confirmation exists in onboarding or in the schema (L23). Whether self-declaration would suffice under the Act is a legal question.
3. **Chat privacy.** The table stores encrypted content, but the code path that writes it and the key handling were not confirmed, and message text goes to an external provider (L31). The statement "nobody can read your chat" must not be made.
4. **Breach runbook, grievance officer, nominee right.** Not written.
5. **Erasure versus consent ledger.** The append-only consent table may block cascade deletion until tested (docs/04 section 3).

## 7.7 Comparison with other regimes

The platform is not a HIPAA covered entity and makes no HIPAA or GDPR claim. The benchmark in docs/07 section 4 compares the Act with GDPR and HIPAA on topics such as health data as a special category, erasure, portability and breach notification. Several cells are marked "verify", and the comparison is an aid to design thinking, not a legal analysis. [CITATION NEEDED for each regime-specific statement.]

### 7.7.1 Threats added with the two new features

| ID | Threat | Control | State |
|---|---|---|---|
| TH-21 | A student updates their own risk event to hide it | The student UPDATE policy on `risk_events` was dropped; steps go through one RPC; step and answer tables are append-only | Regression: pgTAP 09 and a real-backend PATCH. An old hole, found while designing the loop |
| TH-22 | Another person reads or flushes a queued item on a shared computer | Per-user database name (salted), AES-256-GCM under the vault key, flush skips other users, explicit keep or discard at logout. After the review (G6-SEC-06) the item metadata sits inside the encrypted payload | Unit tests and the shared-device case of the real-backend Playwright project |
| TH-23 | Personal data cached by the service worker | Never intercepts cross-origin, authenticated, backend or non-GET requests; test inspects every cache entry | Playwright, desktop Chromium |
| TH-24, TH-25 | Edited consent cache; back-dated offline event | Consent re-checked at send time; `created_at` set by a database trigger | Unit and pgTAP 09 |
| TH-28 | Reopened event never re-escalated (notification idempotency was per event, not per follow-up cycle) | Idempotency per follow-up cycle, migration 0007 | **Critical, fixed**; failing-first regression test in pgTAP 12 (docs/28 G6-SEC-01) |
| TH-29 | Any student can read another student's alias through a SECURITY DEFINER helper | Helper restricted in migration 0007 | High, fixed; pgTAP 12 and 13 (G6-SEC-02) |
| TH-27 | Overdue escalation RPC called by any signed-in user or run concurrently | Permission and concurrency gaps closed in migration 0007 (G6-SEC-07); revoked care shares no longer count as active; notifications cannot be spoofed | Fixed with pgTAP 12 and 13 |
| TH-30 | Logout dialog traps a distressed student | Escape is the safe option; the three helplines are inside the dialog | Fixed (G6-SEC-03); unit test |
| TH-31 | Update toast never mounted, so an old cached shell stays in use | Toast mounted in `AppLayout` | Fixed (G6-SEC-04); unit test only, no real-device test |
| TH-32 | Status card says "Your counsellor has been told" when nobody can see the alert | Now "Alert recorded. It was not shared with a counsellor." with the helplines first | Fixed (G6-SEC-05); unit test |

The review in docs/28 was written by another AI worker against the same repository. It is useful because it found defects the builders missed, and it is not a substitute for a human security review or a penetration test. The app-code findings were fixed separately: outbox metadata now sits inside the encrypted payload under a salted database name, the offline page escapes its output, the queue display shows only limited payload fields, and the consent cache is treated as a hint because consent is re-verified on the server at send time. A mutation sanity check (three safety-critical lines broken by hand, each caught by a test) adds a little confidence in the tests, and is three samples only.

Running the system also found a **student-side hole in the original schema** (TH-21 above) and a **duplicate-event defect**: one PHQ-9 item 9 answer created two risk events and two audit rows, from the edge function and the database trigger. The trigger is now the single source of truth. Account erasure used to leave queued encrypted entries on the device and wiped local data before the server delete finished. It now deletes on the server first and then wipes local data, discarding the outbox. Chapter 6, Section 6.3.3 lists all thirteen defects.

## 7.8 Security testing plan

The test plan includes penetration-style tests against the team's own deployment: IDOR on student identifiers, RLS bypass, a prompt injection suite and XSS strings. They have not been run as a penetration test, although the export IDOR check was done by hand through the API on 2026-11-20 and the real-backend Playwright project includes a student's attempts to change their own risk event and answers. The following are the minimum checks before any real-user pilot. Done on a local stack: execute migrations 0001 to 0008 and pgTAP files 01 to 14 (146 tests); edge function tests for JWT checks, rate limiting, PII redaction and the output guard (188 tests); remove the fallback Supabase project. Still to do: repeat the migrations and pgTAP on a hosted project; run `pnpm audit`; run an OWASP ZAP baseline against a staging URL; close the open frontend findings SEC-01, SEC-02, SEC-04, SEC-05, SEC-07 and SEC-08; and confirm the content-security policy on a real deployment.
