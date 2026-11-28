# 07 Privacy, DPDP Compliance and DPIA

This is a student capstone analysis, not legal advice. TODO: review by a qualified data-protection lawyer before any real-user deployment. Section and rule references to the DPDP Act 2023 and its Rules are given at topic level and are marked "verify" where the exact clause is not confirmed.

## 1. Data inventory

| Data | Sensitivity | Location (target) | Purpose | Retention |
|---|---|---|---|---|
| Email, alias | Personal | Supabase Auth, PROFILE | Account | Until erasure |
| Mood entries | Health-related | Postgres (RLS) | Self-tracking | Until deleted by student |
| PHQ results | Health-related | Postgres (RLS) | Self-awareness | Until deleted |
| Journal | Highly sensitive | Client-encrypted ciphertext | Reflection | Until deleted |
| Chat text (saved and in transit) | Highly sensitive | Postgres (`chat_sessions`, `chat_messages`): client-side AES-GCM ciphertext only; sent to LLM provider (Claude or Gemini) over TLS during active turn | Companion | 30 days enforced by DB trigger and `purge_expired_chat_messages()` |
| Synced therapeutic blobs (`encrypted_blobs`) | Highly sensitive | Postgres (`encrypted_blobs`): AES-GCM ciphertext only under opaque slot IDs (`cbt_activities`, `cbt_worry`, `safety_card`); client `secureStore` | Multi-device sync for CBT exercises and safety card | Until deleted by student or account erasure (cascade delete) |
| Crisis events | Safety metadata | Postgres, no text | Safety audit (consent) | 12 months (TODO decide) |
| Appointments | Personal | Postgres | Booking | Until deleted |
| Consent records | Compliance | Postgres | Evidence of consent | Kept as legal record; TODO reconcile with erasure |
| Follow-up steps (`risk_followups`) | Safety and audit metadata: step, closure reason, a 500-character note written by the counsellor about their own action, actor id, time | Postgres, append-only; readable by the student for own events and by counsellors with a `risk_events` care share | Record of who did what after a risk flag | Until erasure (cascade delete from the profile). TODO decide a fixed retention |
| Check-back prompts and answers | Safety metadata: due time, and the answer "okay" or "want_to_talk" | Postgres, append-only | Ask the student how they are 24 h and 72 h after acknowledgement | Until erasure |
| In-app notifications about risk | Generic text plus the event id (and severity and level for overdue alerts). No message content | Postgres | Tell counsellors a follow-up is needed | Until erasure |
| Queued offline items (outbox) | A mood row (including any note and tags the student typed) or a content-free risk event, see 3.5 | The student's device, IndexedDB, AES-256-GCM encrypted under the vault key | Deliver the item after reconnection | At most 7 days, deleted after a successful send, when the student chooses "discard" at logout, or on account erasure (L49 closed). See 3.5 |
| Crisis-consent cache | One true or false value per user (`mindsahaay_consent_crisis_<userId>`) | The student's device, `localStorage`, plain text | Allow offline queueing only when the crisis consent exists | Cleared by `clearAllLocalUserData()` |
| Service worker cache | Static app files and the offline page. No personal data, no backend responses | The student's device, Cache Storage | Open the crisis page without a connection | Replaced at each release |

## 2. DPDP Act 2023 compliance matrix

| ID | Principle or right | Requirement summary | Design measure | Req. | Status |
|---|---|---|---|---|---|
| PR-01 | Notice | Plain-language notice of data and purpose before consent | Consent screen in English and Hindi, itemised by purpose | FR-AUTH-04 | Planned |
| PR-02 | Consent | Free, specific, informed, unambiguous, withdrawable | Per-purpose toggles, no pre-ticked boxes, withdraw as easy as grant | FR-AUTH-04 | Planned |
| PR-03 | Purpose limitation | Use only for stated purpose | No analytics SDKs, no sharing with university or advertisers. Follow-up notes and queue data stay inside the platform | FR-CRISIS-08, FR-CRISIS-09 | Planned |
| PR-04 | Data minimisation | Collect only what is necessary | Alias mode; no phone, no ID number, no location | FR-AUTH-07 | Planned |
| PR-05 | Accuracy and storage limitation | Erase when purpose ends | Chat 30-day retention trigger and purge job (`purge_expired_chat_messages`), erase on request | FR-AI-07, FR-CHATSAVE-01 | Planned |
| PR-06 | Security safeguards | Reasonable safeguards | RLS, TLS, client-side journal and chat encryption (AES-GCM, AAD), encrypted blob sync, threat model | NFR-SEC-01, FR-SYNC-01 | Planned |
| PR-07 | Breach notification | Notify Board and affected users on breach | Incident runbook (TODO write, verify timelines in the Rules) | n/a | TODO |
| PR-08 | Children's data | Verifiable parental consent for under 18 | 18+ only with age confirmation; TODO assess whether a self-declaration is sufficient | FR-AUTH-01 | TODO |
| PR-09 | Right to access / information | Summary of data processed | One-click JSON export (includes encrypted chat and blob ciphertexts) | FR-AUTH-05 | Planned |
| PR-10 | Right to correction and erasure | Correct and erase | Edit and delete screens; full erase (cascades to chat sessions, messages, and encrypted blobs). The server account is deleted first, then local data is wiped and the offline outbox is discarded (L49 closed; see 6 TH-35). Consent records kept as legal evidence remain a TODO | FR-AUTH-06, NFR-PRIV-03 | Planned |
| PR-11 | Right to grievance redressal | Contact point, response timeline | Grievance contact page. TODO name a contact and confirm timeline | n/a | TODO |
| PR-12 | Right to nominate | Nominee in event of death or incapacity | Not in v1. TODO assess | n/a | Gap |
| PR-13 | Data fiduciary obligations | Significant data fiduciary duties, DPO, audit, DPIA | Likely not "significant" at capstone scale; TODO assess if deployed | n/a | TODO |
| PR-14 | Cross-border transfer & processor obligations | Transfers allowed except to restricted countries; processor bound by purpose limitation | Claude and Gemini APIs process text outside India. India DPDP Act 2023 permits cross-border transfer unless restricted by Central Government. Under Google AI Studio free/unpaid tier, Google terms permit human review and model training on prompts/responses (violating PR-03 purpose limitation for real user data). Mitigations: strict server gate (`AI_DATA_TIER=free` rejected unless `AI_ALLOW_FREE_TIER=true`), non-dismissible demo warning banner, `sessionStorage` acknowledgement gate, and restriction of free tier to synthetic demo/dev. Production requires paid Gemini / Vertex AI (`asia-south1` Mumbai) or Claude with signed DPA | FR-AI-04, FR-CHATSAVE-01 | Partial (Demo gate implemented; production DPA pending) |
| PR-15 | Consent managers | Optional | Not used | n/a | n/a |

## 3. Data Protection Impact Assessment

### 3.1 Description of processing
Students enter mood, screening answers, journals and chat messages. Non-crisis chat messages are sent to a third-party LLM (Anthropic Claude by default, or Google Gemini when configured) through our server proxy after PII scrubbing. Saved chat conversations are encrypted client-side with keys derived from the vault passphrase and session salt (AES-GCM, AAD bound), stored as ciphertext with a 30-day retention trigger and purge RPC, and offer a per-conversation toggle not to save. Therapeutic anchors (CBT activities, worry time, safety card) synchronize across devices as encrypted blobs (`encrypted_blobs`, `put_blob` RPC) under opaque slot IDs. Counsellors receive booking alias and note. Since 2026-11-20, a high or crisis risk event (no message text) starts a recorded follow-up that counsellors with a `risk_events` care share can see and advance, and the student receives two check-back questions. While the device is offline, such an event, and mood entries, can wait in an encrypted on-device queue (3.5).

### 3.2 Necessity and proportionality
Each data type maps to a feature. Journals and saved chats are encrypted client-side so that the platform cannot read them. Chat has to be readable by the server in transit to reach the LLM, so PII redaction (names, phones, emails, identifiers), a 30-day retention limit, per-conversation opt-out toggle, and clear notice are enforced. When configured with Google Gemini free tier, terms allow human review and training; therefore, an explicit server gate (`AI_DATA_TIER=free` + `AI_ALLOW_FREE_TIER=true`), a non-dismissible demo warning banner, and a user acknowledgement gate are enforced, and use is restricted to demo/dev evaluation. Production mandates paid enterprise terms or Claude with DPA. Synced blobs contain only ciphertext, protecting third-party contact details and sensitive therapeutic exercises.

### 3.3 Risk assessment

| ID | Risk to students | Likelihood | Impact | Mitigation | Residual |
|---|---|---|---|---|---|
| DR-01 | Disclosure of chat or screening data (breach, IDOR) | Medium | Very high (stigma, harm) | RLS, JWT, ID from token, client-side AES-GCM encryption for chat at rest (server holds ciphertext only), 30-day retention trigger and purge, no logs of content | Low |
| DR-02 | LLM provider processing, data retention, and training on chat text (Claude vs Gemini) | High (unpaid Gemini) / Medium (Claude) | Very High (unpaid Gemini training/human review) / High (Claude) | Google as processor: Google AI Studio unpaid terms allow human reviewers to read chats and use content for model training. Anthropic commercial terms prohibit training on API data. Mitigations: (1) Server-side PII scrubbing/redaction (names, emails, phones, roll numbers) prior to any LLM API call. (2) Strict server gating: `AI_DATA_TIER=free` rejected unless `AI_ALLOW_FREE_TIER=true` explicitly set. (3) Non-dismissible red warning banner and one-time acknowledgement gate in UI when free tier is active. (4) Key passed only in header `x-goog-api-key`. (5) Free tier restricted to demo/dev with synthetic text; production must use paid Gemini / Vertex AI (zero data logging, Mumbai region) or Claude with signed DPA. | Low for synthetic demo; Medium for production pending formal DPA |
| DR-03 | Journal loss through forgotten passphrase | Medium | Medium | Clear warning, optional recovery export | Low |
| DR-04 | Pressure from institution to access data | Low | Very high | Architecture prevents it: no admin role can read individual rows | Low |
| DR-05 | Re-identification via aggregates | Low | High | k-anonymity threshold | Low |
| DR-06 | Crisis log misused | Low | High | No text stored, consent, short retention | Low |
| DR-07 | Over-reliance on companion instead of help | Medium | High | AI label, prompts to seek counsellor, hazard log HZ-05 | Medium |
| DR-08 | Queued crisis or mood data read by another person on a shared device | Medium | High | Per-user encrypted outbox, hashed database name, flush skips other users' items, logout dialog (keep or discard), 7-day purge (3.5) | Medium. Item kind and times are now inside the encrypted payload and the database name is salted; the database name is still a stable device identifier; the shared-device case passed in the real-backend suite but not on a real shared computer |
| DR-09 | Queued data left on a device after the student erased their account | Medium | Medium | `Settings.tsx` deletes the account on the server first, then calls `clearAllLocalUserData({ discardOutbox: true, userId })` so queued encrypted items are discarded (L49 closed) | Low. Items already sent are governed by the server delete |
| DR-10 | A counsellor reads more than needed from a risk event | Low | High | Queue view exposes only `offline` and `detected_at`; notes are limited to 500 characters and the UI warns not to write what the student said; every step is audited | Medium. A counsellor with a share can still read the whole `risk_events` row (TH-26) |
| DR-11 | A student is contacted or monitored against their wishes | Low | Medium | Care share scope `risk_events` is needed and revocable; the check-back opt-out hides future check-backs (now stored on the server in `profiles.checkback_opt_out`, migration 0006, L43); no SMS, email or push exists | Low |
| DR-12 | An alert is not queued or sent because of a missing consent cache, a locked vault or a withdrawn consent, and the student believes help was told | Medium | High | The offline banner says nobody is alerted until the device reconnects; the crisis page always shows the helplines; the student card says when no counsellor can see the alert | Medium (L38, L39, L42) |
| DR-13 | A signed-in student reads another student's pseudonymous alias through the helper get_student_alias_for_care (independent review, 28-new-features-security-review.md, G6-SEC-02) | Low | Medium | Fixed in migration 0007 (refuses unless the caller is a super admin or holds a care share for that student); regression in pgTAP 12 and 13. The alias is a pseudonym, not a name | Low |
| DR-14 | Encrypted blob sync exposes therapeutic data or third-party contact | Low | High | AES-GCM client encryption under vault passphrase; server stores only ciphertext under opaque slot IDs (`mindsahaay_sec_*`); `put_blob` RPC enforces atomic version check; owner-only RLS | Low. Third-party trusted contact data protected by passphrase strength |
| DR-15 | Chat data lost permanently due to forgotten passphrase | Medium | Medium | User warning; zero server-side decryption key recovery by design; per-conversation ephemeral toggle available | Low |

### 3.4 Conclusion
Processing may proceed for a supervised pilot only if DR-01 and DR-02 mitigations are implemented, DR-09 (outbox left after erasure, now fixed) stays fixed, and TODO items PR-07, PR-08, PR-11, PR-14 are closed. The follow-up loop and the offline queue add DR-08 to DR-12; none of them has been assessed by a lawyer or an ethics committee. Sign-off: TODO (supervisor, ethics committee).

### 3.5 Device storage of queued crisis metadata (Lifeline Offline)

Why it exists: when the device is offline the student still gets the crisis card and helplines, and, if they have given the crisis consent, a record that the event happened can wait on the device until the network returns. See 25-offline-pwa.md.

| Question | Answer |
|---|---|
| What is stored | One encrypted item per event. A risk event holds: a client-made UUID, the student's own id, `event_type` ("chat_crisis"), severity, trigger source, `action_taken` ("crisis_card_shown") and a payload of exactly `layer` ("client_lexicon"), `detected_at` (the device clock) and `offline` (true). A mood item holds the mood row the student entered, including any note and tags they typed. |
| What is never stored | The chat message, journal text, the word that matched, location, IP address, device identifier or `created_at`. The server sets `created_at` when the item arrives. |
| Where | IndexedDB on the student's device, in a database named from a SHA-256 hash of the user id. Payload encrypted with AES-256-GCM using a key derived from the student's vault passphrase (PBKDF2, 600,000 iterations). Nothing is sent to a server until the flush. |
| Who can read it | Anyone with the passphrase, i.e. the student. Another account on the same browser cannot decrypt it and its flush skips it. The independent review (docs/28, G6-SEC-06) reported that the item kind and timestamp were plain fields next to the hashed user id. They are now inside the encrypted payload and the database name is salted before hashing (see 6 TH-22). The database name is still a stable per-device identifier. |
| Consent | The crisis consent is read from a cache while offline and checked against the server again at send time. If the consent was withdrawn in between, the item is deleted locally and never sent. |
| Retention | At most 7 days (purged when the student next signs in), and removed after a successful send. At logout the student must choose keep or discard. Session expiry skips that choice; the items stay encrypted until the 7-day purge. |
| Erasure | Complete for this store. "Erase my account" deletes the server account first and only then wipes local data and discards the outbox, so a failed server call loses nothing locally and can be retried (L49 closed, TH-35). Tested by unit tests and the real-backend shared-device case; not tested on a real shared computer. |
| Purpose limit | Used only to deliver the same row the app would have written online. It is not read for analytics, and no university or third party sees it. |
| Residual risks | A locked vault means nothing is queued (L39). The student may not realise nobody was alerted (DR-12). A device that is lost or shared remains exposed to the passphrase strength (TH-05). |
## 4. Benchmark against HIPAA and GDPR

MindSahaay is not a HIPAA covered entity and does not claim HIPAA or GDPR compliance. The table is a design benchmark only.

| Topic | DPDP Act 2023 | GDPR | HIPAA | MindSahaay design |
|---|---|---|---|---|
| Applicability | Digital personal data in India | Personal data of people in the EU | US covered entities and business associates | DPDP primary |
| Health data as special category | No separate special category (verify) | Yes (Art. 9) | Protected health information | Treated as highest sensitivity regardless |
| Legal basis | Consent, with limited legitimate uses | Six bases, explicit consent for health data | Treatment, payment, operations; authorisation otherwise | Explicit consent per purpose |
| Erasure | Right to erasure | Right to erasure with exceptions | No general erasure right | One-click erase |
| Portability | Access to summary; no explicit machine-readable portability (verify) | Data portability | Right of access | JSON export |
| Breach notification | To Board and users (verify timelines) | 72 hours to authority | 60 days | Runbook TODO |
| Impact assessment | Significant fiduciaries | DPIA for high risk | Risk analysis (Security Rule) | DPIA done here |
| Cross-border | Allowed except restricted countries | Adequacy or safeguards | No general restriction | Disclosed, TODO |
| Penalties | Monetary penalties up to a stated cap (verify) | Up to 4% turnover | Tiered civil penalties | n/a |

All "verify" cells need checking against primary sources (see 13-literature-review-outline.md).

## 5. Privacy by design checklist

- No third-party trackers or fonts loaded from external CDNs (TODO verify in build). Google Fonts are currently fetched from a third-party origin and are not cached by the service worker (docs/26 section 5).
- The service worker never caches backend or authenticated responses (06-threat-model.md TH-23).
- Queued offline data is encrypted, per user, kept at most 7 days and never holds message text (3.5).
- Content excluded from server logs and error reports.
- Consent versioning and re-consent on policy change.
- Prototype gap: current export/erase endpoints are unauthenticated beyond the anon key.
