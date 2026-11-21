# MindSahaay: Independent Security & Safety Review of New Features
**Auditor:** Worker G6 (External Skeptical Security & Clinical Safety Reviewer)  
**Methodology:** OWASP ASVS L1 (Application Security Verification Standard), India DPDP Act 2023, Mental Healthcare Act 2017, UGC HEI Guidelines  
**Scope:** Crisis Follow-Through Loop & Lifeline Offline PWA Architecture  
**Date:** 2026-11-20  

---

## 1. Executive Summary

> **Status 2026-11-20 (final).** Every finding below has a final status in the Fix Status column of section 2 and in sections 6 and 7. The database findings were fixed in migration 0007 (worker H1), the application findings by worker H2 and the lead. Two items stay open: a database check constraint on `risk_events.event_type` (G6-SEC-08 is fixed in the UI only) and a `data_processing` consent gate for queued moods (a product decision). Sections 1, 3 and 4 describe the code as it was when reviewed.

MindSahaay is designed as an educational, privacy-preserving mental health platform for Indian university students. This review provides an independent, adversarial audit of two newly implemented features:
1. **The Crisis Follow-Through Loop** (`supabase/migrations/0005_crisis_followup.sql`, `src/features/counsellor/**`, `src/features/followup/**`).
2. **Lifeline Offline Architecture** (`public/sw.js`, `public/offline.html`, `vite.config.ts`, `src/shared/lib/pwa/**`, `src/shared/lib/offline/**`, `src/shared/lib/storage/secureStore.ts`, `src/features/chat/api.ts`, `src/features/offline-ui/**`).

The platform incorporates commendable architectural defenses: zero-knowledge AES-256-GCM encryption with PBKDF2 (600,000 iterations) for student journals and outbox payloads; append-only triggers preventing student or counsellor tampering with follow-up steps and checkbacks; server-enforced timestamps that prevent backdating attacks; and strict data minimization on the `risk_queue` view preventing counsellor exposure to raw student chat messages.

However, a skeptical clinical safety and security analysis identified **10 critical, high, and medium-severity findings** that must be remediated:
- **Clinical Safety Critical Failure:** The overdue escalation RPC (`escalate_overdue_risk`) uses a flawed notification check that permanently silences escalation alerts when a student reopens an alert by selecting "I want to talk" on a check-back prompt.
- **Access Control & Anonymity Break:** An unrestricted `SECURITY DEFINER` function (`get_student_alias_for_care`) allows arbitrary students to query and deanonymize any peer's pseudonym alias.
- **Accessibility & Distress Trap:** An unskippable modal (`LogoutGuardDialog`) blocks Escape key handling, covers the persistent header SOS helpline button, and fails to provide emergency helpline numbers, trapping distressed students in a mandatory data choice.
- **Service Worker Lifecycle Desync:** The update toast component (`UpdateToast`) is completely unmounted in the application tree, causing service worker updates to stall silently and allowing obsolete or vulnerable cached client bundles to persist indefinitely.
- **Clinical False Reassurance:** Contradictory UI copy in `FollowUpCard` displays bold text proclaiming "Your counsellor has been told" even when no care share exists, giving vulnerable students false reassurance that active clinical intervention is underway.

---

## 2. Findings Table

| Finding ID | Severity | Component | Evidence (File & Line) | Description & Failure Scenario | Recommended Fix | Suggested Test | Fix Status (Worker H1) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **G6-SEC-01** | **Critical** | Database RPC (`escalate_overdue_risk`) | [0005_crisis_followup.sql](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0005_crisis_followup.sql#L723-L748) and [L777-L783](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0005_crisis_followup.sql#L777-L783) | **Reopened Crisis Escalation Suppression:** Notification idempotency checks look for ANY historical notification with matching `risk_event_id` and `level`. When a student answers `want_to_talk`, the event reopens to `'open'`. If the counsellor remains unresponsive, `escalate_overdue_risk` finds the old notification from the previous cycle and aborts, leaving reopened crisis events permanently unescalated. | Scope notification idempotency check to the current follow-up cycle by checking `n.created_at >= v_rec.step_at` or recording the `followup_id` / cycle sequence in `metadata`. | pgTAP test: Seed crisis event -> age 5h -> run escalation (1 alert) -> acknowledge -> student checkback `want_to_talk` -> age 5h -> run escalation -> assert new alert generated. | **FIXED** in `0007_security_fixes.sql`. Idempotency scoped to `followup_id` cycle. Regression test: `12_g6_sec_findings.test.sql` (Tests 1-4). |
| **G6-SEC-02** | **High** | Security Definer Helper (`get_student_alias_for_care`) | [0005_crisis_followup.sql](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0005_crisis_followup.sql#L447-L456) | **Student Alias Deanonymization via Security Definer:** Function runs with owner privileges and queries `profiles.alias` for any UUID without verifying that the caller is a verified counsellor with an active care share or an administrator. Executable by `PUBLIC`/`authenticated`. | Add authorization check: `IF NOT (is_super_admin() OR has_active_care_share(p_student_id, auth.uid(), 'profile') OR has_active_care_share(p_student_id, auth.uid(), 'risk_events')) THEN RETURN NULL; END IF;` or revoke execution from `PUBLIC`. | pgTAP test: Set session to Student B; execute `SELECT public.get_student_alias_for_care(student_a_uuid)`; assert result is NULL or throws `Unauthorized`. | **FIXED** in `0007_security_fixes.sql`. Checks care share / super_admin / self, returns NULL otherwise. Revoked from PUBLIC/anon. Regression test: `12_g6_sec_findings.test.sql` (Tests 5-7). |
| **G6-SEC-03** | **High** | UI Accessibility & Safety Trap (`LogoutGuardDialog`) | [LogoutGuardDialog.tsx](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/features/offline-ui/LogoutGuardDialog.tsx#L44-L50) and [L92-L138](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/features/offline-ui/LogoutGuardDialog.tsx#L92-L138) | **Unskippable Distress Modal Traps User:** Full-screen backdrop suppresses Escape (`e.preventDefault(); e.stopPropagation()`), covers the header SOS Helpline button, and renders zero helpline numbers. Distressed students are trapped until making an explicit data-management selection. | (1) Allow Escape to dismiss modal safely (equivalent to "Stay signed in"). (2) Prominently embed the three statutory helplines (Tele-MANAS 14416, KIRAN 1800-599-0019, Emergency 112) directly inside `LogoutGuardDialog`. | React Testing Library: Render `LogoutGuardDialog`, fire Escape keydown -> verify dialog closes; verify Tele-MANAS 14416 link exists in modal DOM. | **FIXED** by the lead (not in migration 0007): Escape is now the safe option, the three helplines are inside the dialog. |
| **G6-SEC-04** | **High** | PWA Service Worker Update Flow | [AppLayout.tsx](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/app/layouts/AppLayout.tsx#L15-L18), [main.tsx](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/main.tsx#L14-L18), [sw.js](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/public/sw.js#L19-L21) | **Unmounted Update Banner Leaves Stale Script Active:** `UpdateToast.tsx` is implemented and tested, but never imported or mounted in `AppLayout.tsx` or `App.tsx`. Because `sw.js` does not automatically `skipWaiting()`, users are never prompted to activate new service workers, leaving stale/vulnerable code running indefinitely. | Mount `<UpdateToast />` inside `AppLayout.tsx` so users receive update prompts and can trigger `skipWaiting()`. | Vitest component test: Mount `AppLayout`, dispatch `mindsahaay:sw-update` CustomEvent, assert update banner is displayed. | **FIXED** by the lead: `UpdateToast` is now mounted in `AppLayout`. |
| **G6-SEC-05** | **Medium** | Follow-up UI Copy (`FollowUpCard`) | [FollowUpCard.tsx](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/features/followup/FollowUpCard.tsx#L78-L80) and [en.json](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/features/followup/locales/en.json#L6-L19) | **Contradictory Status Produces False Reassurance:** When `currentStep === "open"` and `!state.alertsShared`, the card renders a bold header saying "Your counsellor has been told", followed by small text saying "No counsellor can see this alert". Distressed students may believe assistance is incoming when no one was notified. | Conditionally alter header when `alertsShared === false` to: "Alert recorded (Not shared with a counsellor)". Do not display "Your counsellor has been told" unless an active care share exists. | React Testing Library: Render `FollowUpCard` with `currentStep = 'open'` and `alertsShared = false`; assert header text does NOT contain "Your counsellor has been told". | **FIXED** by worker H2: the card says "Alert recorded. It was not shared with a counsellor." when no counsellor can see the alert, with helplines first. |
| **G6-SEC-06** | **Medium** | Offline Outbox Storage & Identifiers | [outbox.ts](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/shared/lib/offline/outbox.ts#L39-L47) and [L54-L68](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/shared/lib/offline/outbox.ts#L54-L68) | **Plaintext Clinical Metadata & Stable Hash Identifier:** IndexedDB items store plaintext `kind: "risk_event"`, plaintext ISO `createdAt`, and `ownerHash: SHA-256(userId)`. On shared computers (e.g. university computer labs), subsequent users or local inspect tools can read timestamps and crisis event occurrences. | Pack `kind` and timestamps inside the AES-GCM encrypted payload; use a per-device random salt when hashing database names to prevent cross-session correlation. | Vitest unit test: Inspect raw record written to IndexedDB store; assert `kind` property is not `"risk_event"` in plaintext. | **FIXED** by worker H2: outbox kind and time are inside the encrypted payload, database name uses a salted hash. |
| **G6-SEC-07** | **Medium** | Overdue Escalation RPC Permissions & Concurrency | [0005_crisis_followup.sql](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0005_crisis_followup.sql#L651-L825) and [L882](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0005_crisis_followup.sql#L882) | **Unrestricted Execution & Check-Then-Act Race:** `GRANT EXECUTE ON FUNCTION public.escalate_overdue_risk() TO authenticated` allows any student to trigger global table scans. Lacks advisory locks and partial unique index on `notifications`, allowing concurrent invocations to insert duplicate notifications. | (1) Restrict execution to `service_role` and verified counsellors. (2) Add `CREATE UNIQUE INDEX idx_notifications_risk_overdue ON public.notifications (user_id, type, (metadata->>'risk_event_id'), (metadata->>'level')) WHERE type = 'risk_overdue';`. | pgTAP / concurrency test: Invoke `escalate_overdue_risk()` twice simultaneously; assert exactly one notification is created. | **FIXED** in `0007_security_fixes.sql`. Restricted to trusted backend / verified counsellor with active care share, advisory xact lock added, unique index `idx_notifications_risk_overdue_cycle` added. Regression test: `12_g6_sec_findings.test.sql` (Tests 8-9). |
| **G6-SEC-08** | **Low** | Counsellor Risk Queue Display | [0001_core.sql](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0001_core.sql#L263) and [RiskQueue.tsx](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/features/counsellor/RiskQueue.tsx#L114) | **Unvalidated Event Type Social Engineering:** `risk_events.event_type` is free-form `text NOT NULL` without an enum check. A student can submit arbitrary strings like `"FALSE ALARM - RESOLVED"`, which renders directly into the counsellor queue as `"Crisis · FALSE ALARM - RESOLVED"`. | Enforce check constraint or enum on `risk_events.event_type` restricting values to known system triggers (`chat_crisis`, `phq9_item9`, `counsellor_contact_requested`, `manual`). | pgTAP test: Attempt to insert `risk_events` with `event_type = 'OVERRIDE_FALSE_ALARM'`; assert check constraint violation. | **FIXED in the UI only** (worker H2). The database check constraint on `event_type` is NOT added (open). |
| **G6-SEC-09** | **Low** | Crisis Consent Cache in LocalStorage | [chat/api.ts](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/features/chat/api.ts#L8-L26) and [L63-L73](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/features/chat/api.ts#L63-L73) | **Plaintext User ID & Local Consent Suppression:** Key `mindsahaay_consent_crisis_${userId}` in `localStorage` exposes raw student UUID. If tampered to `"false"`, `logChatCrisisEvent()` returns `false` while offline, dropping the crisis event without queuing it. | Use opaque hash for storage key. Default offline crisis queuing to safe fail-open (encrypt in outbox, enforce server-side consent validation at sync time). | Unit test: Set `mindsahaay_consent_crisis_${userId}` to `"false"`; invoke `logChatCrisisEvent()` offline; verify event is enqueued for server-side evaluation. | **FIXED** by worker H2 with a different mechanism: the consent cache is only a hint, consent is re-verified server-side at send time. |
| **G6-SEC-10** | **Info** | Offline HTML Template Generation | [vite.config.ts](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/vite.config.ts#L134-L142) | **Unescaped String Interpolation in Build Plugin:** Helpline strings and date are directly injected into `offline.html` using regex substitution without explicit HTML escaping. Safe with current static constants, but violates defense-in-depth. | Apply `escapeHtmlText()` to `h.name`, `h.tel`, `h.number`, and `HELPLINES_LAST_VERIFIED` in `vite.config.ts`. | Build test: Verify generated `dist/offline.html` parses cleanly and escapes special characters like `&` and `<`. | **FIXED** by worker H2: escaping moved to `src/shared/lib/offline/offlinePage.ts`. |

---

## 3. Deep-Dive Security & Clinical Safety Analysis

### 3.1 Row Level Security (RLS) & Access Control
- **Cross-Student Isolation:** Row Level Security policies on `risk_followups`, `risk_checkback_prompts`, and `risk_checkbacks` were tested and verified safe. Student B cannot view or modify Student A's records.
- **Unverified Counsellor Protection:** Verified counsellors without an active care share containing `'risk_events'` cannot advance steps (`advance_risk_followup` throws `P0001 Unauthorized`) and see 0 rows in the `public.risk_queue` view due to `security_invoker = true`.
- **Revocation Synchronization Gap:** `public.has_active_care_share` in [0001_core.sql:381](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0001_core.sql#L381) and trigger queries in [0005_crisis_followup.sql:430, 717](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0005_crisis_followup.sql#L430) evaluate `cs.active = true AND (cs.expires_at IS NULL OR cs.expires_at > now())`. While the TypeScript frontend checks `revoked_at`, the database SQL functions omit `cs.revoked_at IS NULL`. If an API client updates `revoked_at` without setting `active = false`, the database still considers the share active.

### 3.2 Service Worker & PWA Caching
- **Sensitive Data & Auth Responses:** Caching policy in [public/sw.js:53-58](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/public/sw.js#L53-L58) is strictly designed. Cross-origin requests (`url.origin !== self.location.origin`), requests with `Authorization` headers, non-GET methods, and backend API routes (`/functions/`, `/rest/`, `/auth/`, `/realtime/`, `/storage/`) are never intercepted or cached.
- **Tokens in URL:** Magic-link fragments (`#access_token=...`) are handled client-side and never forwarded to navigation caches. Navigation requests execute `fetch(request)` directly when online and only fall back to cached `index.html` or `offline.html` when network failure occurs.
- **Update Activation Failure:** Because `UpdateToast.tsx` is absent from `AppLayout.tsx`, the service worker update flow is broken. The update remains in the `waiting` state indefinitely until all browser tabs are closed.

### 3.3 Offline Outbox & Cryptographic Integrity
- **Ciphertext Integrity & Nonce Freshness:** Outbox encryption in [domain/crypto/journalCrypto.ts:125-160](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/domain/crypto/journalCrypto.ts#L125-L160) generates a fresh 12-byte (96-bit) cryptographically secure random IV and 16-byte random salt for every single payload. AES-256-GCM authentication tags prevent tampering.
- **Replay & Duplicate Protection:** Outbox drains use Supabase `.upsert(payload, { onConflict: "id", ignoreDuplicates: true })`. Retries or repeated drains cannot create duplicate records on the server.
- **Metadata Leakage:** In [shared/lib/offline/outbox.ts:39-47](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/shared/lib/offline/outbox.ts#L39-L47), storing `kind: "risk_event"` in plaintext in IndexedDB alongside an unsalted SHA-256 hash of the student ID leaks clinical distress event occurrences to shared computer profiles.
- **Consent Re-check Scope:** Outbox drain verifies `crisis_intervention` consent at send time for risk events, but does not verify `data_processing` consent for mood entries.

### 3.4 Accessibility & Emergency Blockers
- **WCAG 2.1 AA Traps in Modals:** [LogoutGuardDialog.tsx:44-50](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/features/offline-ui/LogoutGuardDialog.tsx#L44-L50) explicitly traps keyboard navigation and cancels the Escape key (`e.preventDefault(); e.stopPropagation()`).
- **Emergency Helpline Obstruction:** The logout dialog covers the persistent Header SOS button and contains no helpline links, in contrast to all other safety cards and offline banners in the app.

---

## 4. What Was Verified Safe (Positive Verification)

The following components were audited and verified to be secure and compliant with high assurance:

1. **Server-Enforced Timestamp Anti-Backdating:**
   - *Evidence:* [0005_crisis_followup.sql:89-118](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0005_crisis_followup.sql#L89-L118) and pgTAP test `09_crisis_security_and_isolation.test.sql:290-321` (Test 15).
   - *Verification:* Trigger `trg_enforce_risk_event_server_timestamp` intercepts all non-trusted backend inserts and forces `NEW.created_at := now()`. Client-supplied past dates (e.g. `'2020-01-01'`) are overridden.
2. **Append-Only Immutability on Followups and Checkbacks:**
   - *Evidence:* [0005_crisis_followup.sql:151-191](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0005_crisis_followup.sql#L151-L191) and pgTAP test `09_crisis_security_and_isolation.test.sql:186-212` (Tests 8 & 9).
   - *Verification:* Direct `UPDATE` and `DELETE` queries are unconditionally aborted by triggers. Only cascade deletion initiated by profile deletion (`pg_trigger_depth() > 1`) is allowed under DPDP Right to Erasure.
3. **Cross-User Data Isolation on Crisis Records:**
   - *Evidence:* [0005_crisis_followup.sql:491-558](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0005_crisis_followup.sql#L491-L558) and pgTAP test `09_crisis_security_and_isolation.test.sql:120-138` (Tests 3, 4, 5).
   - *Verification:* RLS policies ensure Student Bob cannot read Student Alice's follow-ups, prompts, or checkback answers.
4. **Care Share Enforcement for Followup Steps:**
   - *Evidence:* [0005_crisis_followup.sql:601-611](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0005_crisis_followup.sql#L601-L611) and pgTAP test `09_crisis_security_and_isolation.test.sql:140-152` (Test 6).
   - *Verification:* Verified counsellor Dr. Verma without an active care share is rejected with `Unauthorized` when attempting to call `advance_risk_followup`.
5. **Strict Step Transition Sequence & Mandatory Closure Reason:**
   - *Evidence:* [0005_crisis_followup.sql:194-265](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0005_crisis_followup.sql#L194-L265) and pgTAP test `08_crisis_followup_lifecycle.test.sql:97-189` (Tests 3, 4, 7, 9, 11, 12, 15).
   - *Verification:* Illegal jumps (`open -> contacted`, `acknowledged -> closed`), backward steps, and closures without an approved reason from `CLOSURE_REASONS` are blocked by `trg_validate_risk_followup_transition`.
6. **Student Risk Event Resolution Lockdown:**
   - *Evidence:* [0005_crisis_followup.sql:463-473](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0005_crisis_followup.sql#L463-L473) and pgTAP test `09_crisis_security_and_isolation.test.sql:72-94` (Test 1).
   - *Verification:* Students have no UPDATE policy on `public.risk_events`. Attempts by Student Alice to mark her own event `resolved = true` affect 0 rows.
7. **Single-Response Enforcement on Checkback Prompts:**
   - *Evidence:* [0005_crisis_followup.sql:76](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0005_crisis_followup.sql#L76) and pgTAP test `09_crisis_security_and_isolation.test.sql:233-250` (Test 11).
   - *Verification:* `prompt_id` is unique in `risk_checkbacks`. Duplicate responses fail with unique constraint violation (`23505`).
8. **Data Minimization on Risk Queue View:**
   - *Evidence:* [0005_crisis_followup.sql:841-844](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/supabase/migrations/0005_crisis_followup.sql#L841-L844) and Vitest `riskApi.test.ts:84-100`.
   - *Verification:* `risk_queue` strips all payload attributes except `offline` and `detected_at`. Chat text and assessment answers never reach the counsellor queue.
9. **Zero-Knowledge Encryption at Rest:**
   - *Evidence:* [journalCrypto.ts:18-29](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/domain/crypto/journalCrypto.ts#L18-L29) and Vitest `outbox.test.ts`.
   - *Verification:* Encrypted outbox items cannot be decrypted without the student's vault passphrase. Locking the vault wipes keys from memory.
10. **Statutory Helpline Consistency:**
    - *Evidence:* [helplines.ts:6-12](file:///C:/Users/Admin/Downloads/Digital%20Mental%20Health%20Platform/src/shared/lib/pwa/helplines.ts#L6-L12).
    - *Verification:* Tele-MANAS (14416), KIRAN (1800-599-0019), and National Emergency (112) are consistently specified and match UGC and Mental Healthcare Act guidelines.

---

## 5. What Could Not Be Verified

1. **Production Service Worker Runtime in Live Browser:** Service worker caching, background sync registration, and lifecycle updates were audited via code review and unit tests; headless node environments (jsdom) do not simulate full ServiceWorkerContainer / SyncManager browser runtimes.
2. **Realtime WebSocket Protocol Delivery:** `supabase.channel("counsellor-risk-events")` postgres changes were tested with mocks; WebSocket reconnects under erratic campus Wi-Fi networks could not be dynamically verified. [Update 2026-11-20: the realtime publication was found empty and fixed in migration 0008, and the real-backend Playwright test (docs/29) now checks a live update. Reconnects under bad networks are still untested.]
3. **Database pg_cron Daemon on Managed Supabase:** Scheduled job execution depends on the `pg_cron` extension availability on the target PostgreSQL host. Local pgTAP tests verified manual RPC execution.
4. **Browser IndexedDB Quota Limits Across Varied Mobile OS:** Storage eviction policies under low-disk conditions on iOS Safari vs Android Chrome could not be physically exercised.

---

## 6. Fix Status & Database Security Remediations (Worker H1)

As part of the database security hardening pass (Worker H1), the identified database and authorization vulnerabilities were remediated in migration `supabase/migrations/0007_security_fixes.sql` and verified with failing-first pgTAP regression suites:

### 6.1 Findings Remediated

1. **G6-SEC-01 (Critical) — Reopened Crisis Escalation Suppression:**
   - *Fix:* Replaced global `(risk_event_id, level)` idempotency check in `public.escalate_overdue_risk()` with cycle-scoped idempotency referencing `lf.followup_id`. When an event is acknowledged and subsequently reopened via `want_to_talk`, the new `open` follow-up row produces a distinct `followup_id`, allowing overdue escalation to fire once per cycle while suppressing intra-cycle duplicates. Created partial unique index `idx_notifications_risk_overdue_cycle`.
   - *Regression Test:* `supabase/tests/12_g6_sec_findings.test.sql` (Tests 1-4).

2. **G6-SEC-02 (High) — Student Alias Deanonymization via Security Definer:**
   - *Fix:* Added RBAC and care share verification inside `public.get_student_alias_for_care(p_student_id)`. Returns `profiles.alias` only if caller is `is_trusted_backend()`, `is_super_admin()`, the student themselves, or a verified counsellor holding an active care share for that student (`risk_events`, `profile`, or `all`). Otherwise returns `NULL`. Revoked execution from `PUBLIC` and `anon`.
   - *Regression Test:* `supabase/tests/12_g6_sec_findings.test.sql` (Tests 5-7).

3. **G6-SEC-07 (Medium) — Overdue Escalation RPC Permissions & Concurrency:**
   - *Fix:* Restricted `public.escalate_overdue_risk()` caller authorization to `is_trusted_backend()` or verified counsellors with an active care share scoped to `risk_events`. Added transactional advisory lock `pg_advisory_xact_lock(hashtext('escalate_overdue_risk'))` to serialize concurrent invocations, and added partial unique index `idx_notifications_risk_overdue_cycle`. Revoked execution from `PUBLIC` and `anon`.
   - *Regression Test:* `supabase/tests/12_g6_sec_findings.test.sql` (Tests 8-9).

4. **Revocation Synchronization Gap (Section 3.1):**
   - *Fix:* Updated `public.has_active_care_share()` in `0007_security_fixes.sql` to explicitly verify `cs.revoked_at IS NULL`.
   - *Regression Test:* `supabase/tests/13_systematic_security_sweep.test.sql` (Test 10).

5. **Notification Table Hardening & Anti-Spoofing (Prompt Requirement c):**
   - *Fix:* Dropped permissive `FOR ALL` policy on `public.notifications`. Replaced with separate `SELECT`, `UPDATE`, `DELETE` policies, and restricted `INSERT` to `public.is_trusted_backend()`. Added `trg_protect_notifications_immutability` BEFORE UPDATE trigger that prevents authenticated clients from modifying notification `user_id`, `type`, `title`, `body`, `metadata`, or `created_at`, restricting client updates strictly to read status flags.
   - *Regression Test:* `supabase/tests/13_systematic_security_sweep.test.sql` (Tests 3-4).

6. **Warm Handoff RPC Hardening (Prompt Requirement b):**
   - *Fix:*
     - `offer_handoff_slot`: Added `FOR UPDATE` lock on `availability_slots`, checked for active pending offers on the slot within 24 hours.
     - `accept_handoff_offer`: Added validation that `v_event.student_id = v_caller` (rejects cross-user acceptance), validated `v_slot.counsellor_id = v_counsellor_id` (rejects slot hijacking), and wrapped system metadata updates in privileged session context.
     - `decline_handoff_offer`: Added replay defense blocking declines on already accepted offers (`status = 'accepted'`).
     - `set_checkback_opt_out`: Added role validation enforcing that only `student` profiles may set check-back opt-out preferences.
   - *Regression Test:* `supabase/tests/13_systematic_security_sweep.test.sql` (Tests 5-10).

7. **Systematic SECURITY DEFINER Search Path & Privilege Revocation Sweep (Prompt Requirement a):**
   - *Fix:* Verified all 38 public `SECURITY DEFINER` functions have explicit `search_path` configured in `proconfig`. Executed systematic revocation of `EXECUTE` privileges from `PUBLIC` and `anon` across all public `SECURITY DEFINER` functions, maintaining only `check_rate_limit` on the explicit anon allowlist. Revoked `cleanup_stale_rate_limits` and `purge_expired_chat_messages` from `authenticated`.
   - *Regression Test:* `supabase/tests/13_systematic_security_sweep.test.sql` (Tests 1-2).

### 6.2 Test Results Summary
- **At the time of the H1 pass:** 13 files (`01` through `13`), 142 assertions, 142 / 142 passing.
- **Final (2026-11-20, after migration 0008 and test file 14):** 14 files (`01` through `14`), 146 tests, all passing on a real local Postgres.
- Migrations 0001 to 0008 apply cleanly.

---

## 7. Fix status (application code, worker H2)

Each fix has a regression test that was written first and seen to fail. Findings 01, 02 and 07 are database work (worker H1); 03 and 04 were fixed by the lead.

| Finding | Status | What changed | Tests |
| :--- | :--- | :--- | :--- |
| **G6-SEC-05** | Fixed | `FollowUpCard`: when no current care share covers `risk_events`, the header reads "Alert recorded. It was not shared with a counsellor." and "Your counsellor has been told" is never shown. The helplines move to the top of the card with large tap targets (`min-h-14`, `data-prominent`). The "I want to talk" confirmation no longer says a counsellor was told in that state (new `answeredTalkNotShared`). Wording that said "helpline below" now says "on this card" because the position changes. English and Hindi updated. | `FollowUp.test.tsx`: not-shared header, helpline order and prominence, shared state unchanged, talk confirmation, Hindi, expired and revoked shares. |
| **G6-SEC-06** | Fixed | Outbox records no longer hold `kind` or `createdAt` in the clear; both are inside the AES-GCM payload. The database name and `ownerHash` use a salted SHA-256 (random per-device salt kept in the same localStorage key as the database registry, so it survives "keep my queued items" at sign-out). Indexes on kind and time are gone. Items written by the old layout are migrated when the vault is unlocked, and nothing is deleted before its new copy is stored. Trade-offs: with a locked vault the status shows only the total (`pending`), not the risk/mood split; `purgeExpired` needs the unlocked vault because the age is encrypted. `attempts` and `nextAttemptAt` stay in the clear (a retry schedule, 0 until a send fails). | `outbox.test.ts`: raw record has no kind or timestamp, no bare SHA-256 anywhere, different salt after reset, counts when unlocked and locked, migration of an old-layout item. |
| **G6-SEC-08** | Fixed in the UI, not in the database | The queue never prints the stored `event_type`. Known types get a fixed label (`counsellor.eventType.*`), anything else shows "Other alert". An unknown `severity_level` is shown as High. The check constraint on `risk_events.event_type` is a database change and belongs to H1. | `riskApi.test.ts`, `RiskQueue.test.tsx`. |
| **G6-SEC-09** | Fixed (with a different mechanism from the review) | The consent cache is documented and treated as a hint only. Offline, a crisis is always queued (fail open), so a value set to "false" cannot drop an event. If the online consent lookup fails, the event is now queued instead of inserted directly, so a cache tampered to "true" cannot cause a send: the outbox asks the server for `crisis_intervention` consent before every send and drops the event when it is missing. The cache record uses one fixed key, a per-device salt and a salted tag in place of the user id, and ignores answers older than 24 hours. | `chat/api.test.ts`: tampered false, tampered true with no consent (flush sends nothing), failed lookup, no user id in storage, staleness. |
| **G6-SEC-10** | Fixed | The templating moved to `src/shared/lib/offline/offlinePage.ts` (imported by `vite.config.ts`). Name, number, tel and the verified date are HTML-escaped, `href` must match `tel:` digits, and function replacers stop `$&` patterns in values from being interpreted. Output for the real helplines is unchanged. | `offlinePage.test.ts`. A full `vite build` was not run here because other workers share `dist/`. |
| Review section 3.1, revocation gap (`revoked_at` missing in SQL helpers) | Fixed in migration 0007 | `has_active_care_share()` now requires `revoked_at IS NULL` (see 6.1 item 4). The client already checked `revoked_at`. | `13_systematic_security_sweep.test.sql` |
| Review section 3.3, no `data_processing` check for queued moods | Not fixed | Online mood saving has no consent gate either, so the drain matches the online path. Adding a gate to both is a product decision. | n/a |

Further changes from re-reading the warm handoff UI:

- `FollowUpCard` and `RiskQueue` used button state to block double submits, which two clicks in the same tick bypass. Both now use a synchronous lock. Tests fire two clicks in one tick.
- A handoff offer is hidden when its event is closed, and accepting re-fetches first. If the offer expired or the event closed while the page was open, nothing is booked and the student sees "no longer available".
- A failed refresh after an action used to blank the whole card, helplines included. It now keeps what is on screen and says the refresh failed.
- A failed opt-out save now reverts the checkbox and the local preference and shows an error.
- Counsellor name in an offer is cleaned (control and bidi characters removed, 40 characters at most).
- The counsellor offer panel reloads free slots each time it opens and after a failed offer, closes with Escape, moves focus into the picker and back to its button, and announces results through a live region that exists before the message arrives.
- Left alone: `runOverdueEscalation` still returns 0 on failure without telling the counsellor. It is a best-effort fallback for `pg_cron`, and the queue itself loads independently.
