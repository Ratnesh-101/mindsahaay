# Chapter 8. Ethics and Clinical Safety

## 8.1 Positioning

MindSahaay is an educational wellbeing tool. It does not diagnose, treat or monitor, and it is not presented as a medical device. This positioning is a design decision stated to users in every screening result and in the companion's labelling. It is not a regulatory determination. [STUDENT: obtain written confirmation of the regulatory position from the supervisor or institution. docs/08 records this as TODO.]

The platform is designed with reference to the Mental Healthcare Act 2017 (respect for dignity and autonomy), the UGC guidelines on student wellbeing and the Digital Personal Data Protection Act 2023 [S2, S23, S27] **[VERIFY]**. None of the three has been legally reviewed against the design.

## 8.2 Ethical principles applied

**Beneficence and non-maleficence.** The crisis path is always one tap away (SOS control in the header, `/crisis` route), the AI is never the sole safeguard, and the design accepts false positives to reduce false negatives (hazard HZ-10 is accepted deliberately: "safety over precision").

**Autonomy and dignity.** Consent is per purpose with opt-in defaults and equal-ease withdrawal. Students can export and erase their data without administrative approval. Data are not shared with the university. The in-platform counsellor alert is a feature of the platform, not a report to the institution.

**Justice and inclusion.** Hindi and Hinglish are in scope because English-only tools exclude many students. Languages beyond these three are unsupported, which excludes many students too (HZ-16); Tele-MANAS is listed as covering many languages, which must be verified against [S25] **[VERIFY]**.

**Transparency.** The companion is labelled as an AI at all times. Limits are stated to users: the app cannot detect every crisis, is not monitored by humans in real time and is not a substitute for professional care.

**Honesty in reporting.** Dev-set scores are not quoted as results. "Compliant" is replaced by "designed with reference to". The limitations document is part of the deliverable.

## 8.3 Research ethics

Two studies are planned (docs/09). Study S1 is a scenario-based usability study with 12 to 15 students aged 18 or over. Study S2 is the AI evaluation on synthetic and curated text, with no human participants. No real distressing text from real people is collected in either study.

Safeguards for S1 include voluntary participation without academic credit, withdrawal with data deletion, exclusion of anyone under 18 or currently in acute distress, a moderator trained in a distress protocol (pause, offer Tele-MANAS 14416, KIRAN 1800-599-0019 and 112, notify the supervisor), fictional scenarios without graphic content, a crisis scenario that is announced beforehand and always last, participant codes only, and test accounts so that no real mood or journal data is entered. A consent form template and a ten-item SUS procedure are included in docs/09.

**Status.** No ethics approval or exemption is recorded and no participant has been recruited. [STUDENT: insert the committee name, approval number and date, or the written statement of exemption. No study may start before this.] [STUDENT: insert supervisor sign-off.]

For the dataset, authors write fictional content only, are told the content is distressing, and have helplines available. The dataset avoids method detail. It was written by one person, which is an ethics-neutral but scientifically significant limit.

## 8.4 Clinical safety case

### 8.4.1 Method

The hazard analysis follows the style of clinical risk management for health software (the NHS DCB0129 and DCB0160 standards or ISO 14971 are models [S26] **[VERIFY]**; neither is a legal requirement here). Severity runs from 1 (minor) to 4 (catastrophic, self-harm). Likelihood runs from A (rare) to D (likely). The acceptance rule is that a severity 4 hazard needs a residual likelihood of A and clinical advisor sign-off.

### 8.4.2 Safety claim

The system helps students notice distress and reach human help. Safety argument: (1) crisis signals always lead to human helplines; (2) the AI is constrained and never the sole safeguard; (3) limits are stated plainly to users.

### 8.4.3 Hazard log (selected)

The full log has 25 hazards (HZ-01 to HZ-25; HZ-19 to HZ-25 were added on 2026-11-20 for the follow-up loop and the offline layer, and are written by a non-clinician). Table 8.1 shows the most important with current evidence.

**Table 8.1 Hazards and current evidence**

| ID | Hazard | Sev | Controls | Evidence now |
|---|---|---:|---|---|
| HZ-01 | Missed crisis expression in chat | 4 | Hybrid lexicon and LLM with OR rule; recall target 0.95 | Keyword held-out recall 0.70; hybrid not measured. Residual risk is **not** demonstrated to be acceptable |
| HZ-02 | PHQ-9 item 9 positive but no crisis action | 4 | Rule in scoring and routing, tests on all four values, crisis card before score | Client logic tested; item 9 e2e journey passes; server path verified on a local stack (PHQ-9 item 9 = 2 created a crisis risk event with helplines); hosted project not tried |
| HZ-03 | Banner dismissed, user left without help | 3 | Not dismissible without deliberate action; helplines in header | Chat crisis card has no close control (e2e). Not verified on every surface |
| HZ-04 | Wrong or outdated helpline number | 4 | Single source of truth array, tel: link tests, release checklist | tel: links tested; numbers must be re-verified each release |
| HZ-06 | AI gives harmful advice | 4 | System prompt, output guard, crisis template | No red-team evaluation; guard untested |
| HZ-10 | False positives cause alarm | 2 | Calm wording; accepted | 0.000 false alarm on synthetic held-out, which does not predict real use |
| HZ-11 | Outage when help is needed | 3 | Browser lexicon, static helplines, timeout fallback | Degraded mode tested. A service worker now serves the crisis page offline after one online visit (desktop Chromium only, never on a phone) |
| HZ-14 | Harmful peer content | 4 | Pre-moderation, auto-hold, reports | Posts default to `approved` in the table; pre-moderation depends on application code not confirmed (L22) |
| HZ-16 | Hindi or other language crisis text not understood | 4 | Hindi and Hinglish in scope | Held-out Hindi recall 0.585 |
| HZ-19 | A high or crisis alert is raised but nobody reads it | 4 | Five-step recorded loop; overdue notifications to counsellors and a backup (4 h crisis, 12 h high, +2 h); plain "not monitored 24/7" wording; helplines always shown | pgTAP and Vitest pass; the controls inform and page nobody. Residual **High**: no service is staffed (L29) |
| HZ-20 | Offline: a crisis message is written with no connection and nobody is alerted for hours or ever | 4 | Crisis card and helplines at once from the on-device lexicon; encrypted outbox with consent re-check and server timestamp | Unit and browser-checked on desktop Chromium; offline recall 0.70; vault must be unlocked. Residual **High**; the helpline is the control, not the queue |
| HZ-21 | False reassurance from a tidy workflow ("your counsellor has been told") | 3 | Honest card wording; answers can never close an event | The independent review found the card showing this wording when no care share existed (docs/28, G6-SEC-05); fixed: the card now says plainly "Alert recorded. It was not shared with a counsellor." with the helplines first; unit-tested |
| HZ-22 | Check-back is intrusive or unwanted | 2 | Two optional answers, opt-out stored on the server, no push or SMS | Database tests pass (file 11); no user feedback |
| HZ-23 | Stale or wrong helpline cached on a device | 4 | One helpline file with a verified date; cache name hashes it | Unit and Playwright tests; no documented official-source check |
| HZ-24 | The logout dialog gets in the way of a student in distress | 3 | Escape is the safe option; helplines inside the dialog | Fixed after the independent review; unit-tested. Escape now closes the dialog without logging out |
| HZ-25 | A reopened event was never escalated again (found by the independent review, docs/28, G6-SEC-01, Critical) | 4 | Fixed in migration 0007: notification idempotency per follow-up cycle; regression tests written first (pgTAP files 12 and 13) | **Closed in code, local database only.** Not run on a hosted project; alerts still reach nobody if no service is staffed (HZ-19) |

### 8.4.4 Honest assessment of residual risk

Under the project's own acceptance rule, **HZ-01 is not closed**. It is a severity 4 hazard whose controls have measured at 0.70 recall on synthetic data for the deterministic layer and not at all for the layer that is supposed to bring the system to 0.95. Even a measured 0.95 would miss about one expression in twenty, which the clinical safety case states openly. The acceptable conclusion for a capstone is that the platform is a demonstration of a safety architecture, not a system cleared to serve students in distress. It must not be deployed to real students without a clinical advisor's review, a measured hybrid recall with an honest lower bound, and a staffed response to alerts.

### 8.4.5 Missing clinical governance

- **No clinician review** of the label rubric, lexicon, AI prompt, crisis wording, safety plan template or hazard log (L3). The hazard log was written by a non-clinician. [STUDENT: insert the advisor's review note and sign-off, or state that none was obtained.]
- **No escalation process.** No counselling service has agreed to receive or respond to in-platform alerts (L29). Risk events could sit unread.
- **Instrument licensing and translation.** PHQ and GAD wording, band names and Hindi translations were not checked against licence terms or validated translations (L27).
- **Helpline verification.** The numbers come from project documents. A Vandrevala Foundation number in the server README is unverified and unused elsewhere (L28).

### 8.4.6 Quality assurance as a safety activity

The safety-critical paths were tested by running them, not only by reading them, and running them found defects that unit tests had missed. Each was fixed and given a regression test.

- A permissive RLS UPDATE policy let a student resolve their own crisis event. The feature tournament's fact-check found it (docs/30).
- Six SQL defects appeared only on a real Postgres, including two infinite recursions in RLS policies (docs/21).
- A global CSS class collision (`.p-0` to `.p-5`) made the counsellor Acknowledge button unclickable.
- Offline crisis events waited behind a retried consent lookup and could be lost if the tab closed. They are now queued at once from a consent cache filled while online, and consent is verified again on the server at send time.
- Offline mood check-ins never queued, because the query library pauses mutations offline.
- The Realtime publication was empty, so the counsellor queue got no live updates (migration 0008).
- One PHQ-9 item 9 answer created two risk events and two audit rows (edge function plus database trigger). The trigger is now the only source.
- Erasing an account left queued entries on the device and wiped local data before the server delete. The server delete now comes first and the local wipe discards the outbox.
- The logout dialog could trap a student in distress, and the status card said "Your counsellor has been told" when no counsellor could see the alert (HZ-21, HZ-24).
- The independent review (docs/28) found the Critical defect in HZ-25, an alias leak through a `SECURITY DEFINER` helper, escalation RPC permission and concurrency gaps, a revoked care share still counting as active, and spoofable notifications. Migration 0007 fixes them, with tests written to fail first.

A mutation check by hand broke three safety-critical lines and the tests caught each break. This shows the tests are sensitive to those lines. It does not show that the lines are clinically right.

### 8.4.7 Items still open

- Nobody is alerted while a device is offline. An event may arrive hours late or never (HZ-20).
- Alerts are in-app only: no email, SMS or push, and no service is staffed 24/7 (HZ-19, L29).
- Keyword lexicon held-out recall is 0.70. The LLM and hybrid evaluations are pending and need an API key (HZ-01).
- No clinician review, no ethics approval, and no survey, interviews or usability study yet.
- Hindi strings have not been reviewed by a native speaker (docs/27).
- The CI workflows have never run on a real runner, and there is no git repository yet.
- iOS Safari has no Background Sync; browser tests covered Chromium only.
- The counsellor-to-student warm handoff and the server-side check-back opt-out are built (migration 0006, 22 pgTAP tests) but have no real-browser end-to-end check.
- The hosted Supabase project, the Anthropic chat route and Daily.co video were not verified.
## 8.5 Risks of the AI companion

Four ethical risks deserve separate treatment. **Over-reliance** (HZ-05): the companion could replace seeking care; controls are labelling, nudges to book a counsellor and no claims of therapy, with residual risk rated medium. **False reassurance and diagnosis** (HZ-07, HZ-08, HZ-09): controls are prompt rules, an output guard and the disclaimer before and after results. **Data sharing with a provider**: chat text leaves the platform, which the consent notice must state plainly. **Anthropomorphism**: a warm tone can lead users to over-disclose; the labelling requirement is a mitigation but not a proof of understanding.

## 8.6 Liability and accountability

This is a student project and no operator exists. If it were deployed, the operating organisation would be the data fiduciary under the Act and would carry responsibility for safety processes, response to alerts, grievance handling and breach notification. Educational positioning and disclaimers reduce the risk of misunderstanding but do not remove duties of care. Questions of liability need a lawyer, and this report does not answer them. [STUDENT: state who would be accountable in a pilot and under which agreement.]

## 8.7 Ethics reflections

[STUDENT: personal reflection on handling the topic of self-harm in design and testing, wellbeing of the team during dataset writing, and how views on the responsibility of builders changed during the project.]
