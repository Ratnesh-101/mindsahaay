# 16 User Manual

MindSahaay is an educational wellbeing tool for university students. It is **not a medical device, does not diagnose and does not replace a counsellor or doctor**. Screening results are self-assessments for learning, not clinical verdicts.

**If you are in distress right now, do not use this manual. Call a helpline:**

| Service | Number | Notes |
|---|---|---|
| Tele-MANAS | 14416 or 1800-891-4416 | 24/7, many Indian languages |
| KIRAN | 1800-599-0019 | 24/7 |
| Emergency services | 112 | Police, ambulance, fire |

TODO: re-verify these numbers against the official sources before each release.

This manual describes the app as it exists on 2026-11-20 (updated after the Crisis Follow-Through Loop and Lifeline Offline features). Where a screen is a placeholder, the manual says so. Screens and wording may change, and this manual has not been tested with real users (see 19-known-limitations.md).

## 1. Getting started

1. Open the app. On the sign-in page you can use **email magic link** (a sign-in link is sent to your inbox), **Google sign-in**, or **Demo Mode**. There is no password sign-in.
2. On first sign-in the **onboarding** screen asks for consent, one switch per purpose (see section 3). Data processing is required to create an account; the other purposes are optional.
3. You get an anonymous alias, not your real name.

**Demo Mode** (for examiners and demonstrations): choose Demo Mode on the sign-in page, then pick a role (student, counsellor, moderator, institution admin). No account or backend is needed. A banner shows that demo mode is active. Demo data is fixed sample data and is not saved to a server.

The **SOS button** in the top bar opens crisis help from any screen. The `/crisis` page lists the helplines with tap-to-call links. After the app has been opened once online, this page and the three numbers also load without a network connection (see section 2.9).

## 2. Student flows

### 2.1 Mood check-in
Choose how you feel, add optional tags and a note, and save. Your history appears on the dashboard and insights. If your note contains words that suggest you may be in danger, a crisis card with helplines appears. The note stays yours.

### 2.2 Self-assessments (PHQ-4, PHQ-9, GAD-7)
Open **Assessment**, choose an instrument and answer. Before and after the result the app says the screening is educational and not a diagnosis. Results are shown as score bands with suggestions. **If you answer anything other than "Not at all" on PHQ-9 question 9** (thoughts of being better off dead or hurting yourself), the app shows the crisis card with helplines at once, whatever your total score. You can then choose what to do next. The app does not contact your university.

### 2.3 AI companion chat
Open **Chat**. The companion is an AI, not a person or a clinician, and says so. It replies in the language you write in (English, Hindi or Hinglish). It does not diagnose, give medicine advice or promise secrecy beyond the privacy policy. If your message suggests risk, you see the crisis card instead of a normal reply. If the service is down, the chat shows a fallback message and helpline links. Use **Clear conversation** (asks for a second confirmation) to remove history.

### 2.4 Private journal and CBT toolkit
Open **Journal**. The first time, you create a **private vault** (see section 5). Then you can write reflections with optional prompts, and use the **CBT toolkit** (thought records, activity planner, worry time). Entries are encrypted in your browser before they are saved. Use **Lock journal** when you finish; the passphrase is kept in memory only and is forgotten when you lock or close the tab.

### 2.5 Counsellor directory and booking
Open **Doctors** (counsellor directory). Choose a counsellor, pick a free slot, add a short booking note and confirm. You can cancel up to 2 hours before the slot. For a video session, use the join button in your appointment; a video room link is created for you and the counsellor only. Urgent help options are shown beside the booking screen, because the next free slot may be days away.

### 2.6 Community
Open **Stories / Circles** to read peer posts and join circles (for example study stress, hostel life, mindfulness). You post under an alias. Posts and comments can be reported. Content that looks risky is screened and may be held for a moderator.

### 2.7 Safety plan
A personal safety plan (warning signs, coping steps, people to contact) can be saved and is encrypted before saving (`safetyPlan.ts`). The "My Sahaay Crisis Safety Card" in the top bar is the likely entry point. TODO: confirm in the running app that the card saves to the plan.

### 2.8 Consent ledger, export and erase
- **Consent** page: shows each consent you granted or withdrew, with the policy version and time. You can withdraw any optional purpose at any time. The ledger is append-only, so changes appear as new lines.
- **Settings, Export My Data Archive**: downloads a JSON file of your records (profile, consents, moods, assessments, journal ciphertext, safety plan, appointments).
- **Settings, Permanently Erase All Data**: type `DELETE` to confirm. Your account and data are deleted on the server without administrator approval. Only after that succeeds does the app wipe this device, including any encrypted items still waiting in the offline queue. If the server delete fails, nothing is wiped and you can try again. This cannot be undone.

### 2.9 Crisis help when you are offline, and the follow-up after a crisis
- **Offline.** Open `/crisis` once while online (the app installs itself in the browser). After that the page and the three helpline numbers load without a connection, with the date the numbers were last verified. If you write a crisis message offline, the card appears at once. With your crisis consent and an unlocked journal vault, the app also keeps a small encrypted record of the event on this device (no message text) and sends it when the network returns. **Until then nobody is alerted.** Offline detection uses a keyword list only and has been tested only in desktop Chrome, not on a phone.
- **After a crisis event.** The dashboard shows a status card. If a counsellor can see your alert, it says so. If no counsellor can see it, the card says "Alert recorded. It was not shared with a counsellor." and shows the helplines first. You cannot close or hide your own event. Later you may get a check-back; answer "I want to talk" to reopen it, or switch check-backs off.
- **Log out.** The log-out dialog lists the three helplines. Pressing Escape cancels the log out and keeps you signed in.
- **Updates.** When a new version of the app is ready, a small toast offers to reload.
- Mood check-ins made offline are queued and sent when you are back online.

## 3. How consent works

Consent is recorded per purpose, not as one tick box:

| Purpose | What it covers |
|---|---|
| data_processing | Required. Storing your account and entries so the app works. |
| crisis_intervention | Safety features and crisis event handling. |
| analytics | Counting your anonymous data in group statistics. Groups smaller than 10 are hidden. |
| counsellor_sharing | Letting a counsellor you choose see specific context (for example recent assessment bands). |
| peer_support | Community features. |
| research | Optional research use. |

Your data is not shared with university administration, professors or third parties. A counsellor can see your assessments, safety plan or risk events only through a time-limited sharing grant that you give and can revoke. The dean's view shows aggregate counts only.

TODO: the exact wording of each purpose shown in the app and the privacy policy needs legal review (see 07-privacy-dpia.md).

## 4. Counsellor flows

Counsellors sign in with a counsellor profile (or choose the counsellor role in Demo Mode). They should see only their own appointments, the student's alias and booking note, and only the extra context a student has chosen to share.

**Current status.** With a real sign-in, `/counsellor` shows the API-backed dashboard (caseload, risk-event queue, trajectory chart, encrypted session notes, in `src/features/counsellor/`). In Demo Mode it shows a static sample page with fixed rows and a notice. The dashboard has unit and UI tests, and the real-backend end-to-end run exercised sign-in, the route sweep and the crisis follow-through loop against a local Supabase. Real counsellors have not used it.

### 4.1 The risk-event queue and the follow-up steps
- A counsellor sees a student's risk events only while that student holds a current, unrevoked sharing grant with scope `risk_events`.
- A new crisis event appears in the queue within about a second, without reloading the page, while the queue is open. If the live connection is down, reload the page.
- Each event moves through five steps: open, acknowledged, contacted, check-back, closed. Steps cannot be skipped, and every step is written to the audit log.
- Use **Acknowledge** to take ownership. The queue shows how long the event has waited. An event that stays open too long escalates to a backup counsellor (limits are in 24-crisis-followup.md).
- A banner states that alerts are **in-app only and not monitored 24/7**. Nobody is paged by email, SMS or push. An event is seen only when a counsellor signs in.
- An event detected while the student's device was offline is marked as such and shows when it was received. It may arrive hours late.
- Counsellors can offer a session and hand a student over to another counsellor (warm handoff). A student can switch off check-back prompts, and the server enforces this. These parts have unit, database and UI tests but no real-browser end-to-end check.

## 5. The encrypted journal and the lost passphrase

**How it works.**
1. You choose a passphrase of at least 8 characters. The app derives an encryption key from it in your browser (PBKDF2 with SHA-256, 600,000 rounds) and encrypts each entry with AES-256-GCM.
2. Only ciphertext, a random initialisation value and a random salt are sent to the server. The server, your university, counsellors and the developers cannot read your entries.
3. The app also stores a small check value (so it can tell if your passphrase is right) and an encrypted copy of your passphrase protected by a **recovery code**.
4. You are shown the recovery code once, in the form `XXXX-XXXX-XXXX-XXXX`. Write it down or store it safely.

**If you forget your passphrase.** On the unlock screen choose **I forgot my passphrase** and enter your recovery code. The vault unlocks and shows your passphrase once so you can note it down.

**If you lose both the passphrase and the recovery code.** Nobody can recover your entries. This is by design: the keys never leave your device, and there is no reset. Your options are:
- Delete the old entries and start a new vault. TODO: check whether the app offers a "reset vault" action. If it does not, erase the account from Settings and register again.
- Do not contact support expecting recovery; support cannot decrypt anything.

Your passphrase is not stored on the server in readable form and is never sent to it.

## 6. Moderator flows

Moderators review posts that were reported or held by the safety screening. They approve, reject or remove items, and never see the author's real identity.

**Current status.** The `/moderator` page is a **static sample page**. A working moderation queue component (`ModeratorQueue`) exists and is tested, and it is shown inside the Stories page for users with the moderator role. TODO: verify in a running app with a real moderator account.

Guidance for moderators: if a post suggests someone is in danger, do not reply with advice. Make sure the helplines are shown to the author and follow the escalation steps agreed with the campus counselling service (TODO: agree these steps with a real service; see 08-clinical-safety-case.md).

## 7. Admin flows

Roles: `institution_admin` (for example the Dean of Student Welfare) and `super_admin`.

- Institution admins see **aggregate** wellbeing statistics for their institution only. Groups smaller than 10 people are suppressed in the database views. No individual data is visible.
- Super admins manage institutions at the platform level.

**Current status.** With a real sign-in, `/admin` shows the API-backed aggregate dashboard (`src/features/admin/`). In Demo Mode it shows a static sample page with fixed numbers and a notice; do not quote those numbers. Hosted behaviour has not been checked.

## 8. Accessibility and language

The interface is available in English and Hindi. A native speaker has not reviewed the Hindi strings (see 27). It targets WCAG 2.1 AA: keyboard operation, visible focus, labelled icon buttons, dialogs that trap focus and close with Escape. Day and night themes are available. Automated axe checks found no serious or critical violations on 14 routes, in light and dark mode, at 1280 and 375 pixel widths. There has been no manual audit and no screen-reader test (see 18-testing-report.md).

## 9. Troubleshooting

| Problem | What to do |
|---|---|
| Magic link does not arrive | Check spam. Use Demo Mode to preview. Check that the project's Supabase email settings are configured. |
| "Unable to send magic link" | The backend is not configured (missing `VITE_SUPABASE_URL` or key). Use Demo Mode. |
| Chat shows a fallback message | The AI service is unavailable or not configured. Use the helpline links; try again later. |
| Journal says entries could not be decrypted | Wrong passphrase. Try again or use your recovery code. |
| Booking fails with a conflict | Someone else took the slot. Choose another. |
