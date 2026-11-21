# 27. Hindi strings for native-speaker review

Status: **open**. No string in this list has been checked by a native Hindi speaker. The Hindi was written by AI workers. Every string in this file is therefore unreviewed, and the Hindi UI and the Hindi offline page must not be called native-reviewed until a reviewer has filled the last column (2026-11-20: no reviewer yet). Where the wording of an English string changed after it was first listed (for example "helpline below" became "helpline from this card"), the English and Hindi columns here show the current text.

## How to use this

1. A reviewer reads the table, edits the **Reviewer correction** column, and returns the file.
2. Whoever applies it edits the Hindi file named in the first column and runs `npx vitest run`.
3. Strings in `public/offline.html` and `public/offline.js` are not in a JSON bundle. The emergency label is also in `vite.config.ts` (`OFFLINE_EMERGENCY_HI`), so change it in both places.

## Scope and source

- Included: strings that the worker reports flagged as uncertain (wB: counsellor and follow-up strings; wF: offline UI strings), plus strings added by G3 (the Hindi offline page and the update toast).
- Reports checked: wA, wB, wC, wD, wE, wF, uiA, uiB, datalayer, domain, eval, lexicon, perf, safetysync and the rest in the logs folder. wC, uiA, uiB and datalayer describe their Hindi as natural and flag nothing, so none of their strings are listed. If a reviewer has a wider concern, those bundles are `src/locales/hi.json`, `src/features/*/locales/hi.json`.
- Not covered: detection of Hindi crisis phrases (`src/domain/risk/lexicon.ts`). That is a separate matter and eval.report.md records low Hindi recall (0.188).
- Ordering: crisis and safety strings first (Tier 1), then status wording (Tier 2), then everything else (Tier 3).
- `{{x}}` and `{date}` are placeholders; keep them.
## Strings

### Tier 1: crisis and safety wording (review before release)

| File | i18n key | English | Current Hindi | Concern | Reviewer correction |
| --- | --- | --- | --- | --- | --- |
| `public/offline.html` | `(static text) h1` | You are offline | आप ऑफ़लाइन हैं | New in G3. Written by an AI worker, no native review. Also set as the page title in public/offline.js. | |
| `public/offline.html` | `(static text) intro` | This page is not saved on your device yet. If you need help right now, you can still call. These numbers work without the app. | यह पेज अभी आपके डिवाइस पर सहेजा नहीं गया है। अगर आपको अभी मदद चाहिए, तो आप फिर भी कॉल कर सकते हैं। ये नंबर बिना ऐप के भी काम करते हैं। | New in G3. Safety-critical: this is the text a student reads when the app cannot load. Check that "ये नंबर बिना ऐप के भी काम करते हैं" reads as "you can call these from any phone", not "the app is not needed". | |
| `public/offline.html` | `(static text) emergency label` | Emergency | आपातकालीन सेवा | Also flagged by wF for the offline banner. Also hard-coded in vite.config.ts (OFFLINE_EMERGENCY_HI) so the static page matches. Confirm this is what 112 is called in Hindi. | |
| `public/offline.html` | `(static text) crisis list label` | Crisis helplines | संकट हेल्पलाइन | New in G3 (aria-label of the helpline list, also in public/offline.js). Check "संकट" is the right word for a student-facing label. | |
| `public/offline.html` | `(static text) verified and not-monitored note` | Numbers last verified on {date}. MindSahaay is an educational support tool, not a medical service, and alerts inside it are not monitored 24/7. | नंबर अंतिम बार {date} को सत्यापित किए गए। MindSahaay एक शैक्षिक सहायता उपकरण है, चिकित्सा सेवा नहीं, और इसके भीतर के अलर्ट की 24/7 निगरानी नहीं होती। | New in G3. Safety-critical: the "not monitored 24/7" statement must not be softened by the translation. The date is shown as ISO yyyy-mm-dd. | |
| `public/offline.html` | `(static text) retry button` | Try again | फिर कोशिश करें | New in G3. | |
| `public/offline.html` | `(static text) language switch` | View in English / हिन्दी में देखें | हिन्दी में देखें | New in G3. Low risk. | |
| `src/features/counsellor/locales/hi.json` | `counsellor.bannerText` | In-app alerts only. This is not monitored 24/7. If a student may be in immediate danger, use emergency services. | केवल ऐप के अंदर की सूचनाएँ। इनकी 24/7 निगरानी नहीं होती। अगर किसी विद्यार्थी की जान को तुरंत ख़तरा हो सकता है, तो आपातकालीन सेवाओं से संपर्क करें। | Flagged by wB (safety banner). Counsellors must not read this as a promise of 24/7 monitoring. | |
| `src/features/followup/locales/hi.json` | `followup.statusHint.open` | Alerts reach them inside the app. Nobody watches the app around the clock, so they may see it only the next time they sign in. | सूचना उन तक ऐप के अंदर पहुँचती है। ऐप की निगरानी चौबीसों घंटे कोई नहीं करता, इसलिए हो सकता है वे इसे अगली बार साइन इन करने पर ही देखें। | Flagged by wB. Says nobody watches the app around the clock: the wording must stay clear. | |
| `src/features/followup/locales/hi.json` | `followup.answeredTalk` | Thank you. We have told your counsellor that you would like to talk. This is an in-app alert and may not be seen right away. If you need someone now, call a helpline from this card. | धन्यवाद। हमने आपके काउंसलर को बता दिया है कि आप बात करना चाहते हैं। यह ऐप के अंदर की सूचना है और हो सकता है उन्हें तुरंत न दिखे। अभी किसी से बात करनी हो तो इस कार्ड पर दी गई हेल्पलाइन पर कॉल करें। | Flagged by wB. Student has just said they want to talk, and the text must not imply someone will respond at once. | |
| `src/features/followup/locales/hi.json` | `followup.wantToTalk` | I want to talk | मैं बात करना चाहता/चाहती हूँ | Flagged by wB. Uses the slash form (चाहता/चाहती) to cover both genders. Check that a screen reader reads it sensibly, or pick a gender-neutral phrasing. | |
| `src/features/offline-ui/hi.json` | `banner.message` | You are offline. Helplines and your safety plan still work. Chat checks messages only with the keyword safety layer while offline. | आप ऑफ़लाइन हैं। हेल्पलाइन और आपका सुरक्षा प्लान अब भी काम करते हैं। ऑफ़लाइन रहते हुए चैट संदेशों को केवल कीवर्ड-आधारित सुरक्षा परत से जाँचती है। | Flagged by wF. Check the part about the keyword safety layer ("कीवर्ड-आधारित सुरक्षा परत"): it must tell the student that offline chat checks are limited. | |
| `src/features/offline-ui/hi.json` | `banner.emergency` | Emergency | आपातकालीन सेवा | Flagged by wF. Same label as the static offline page. | |
| `src/features/offline-ui/hi.json` | `crisis.verified` | Helpline numbers last verified {{date}} | हेल्पलाइन नंबर अंतिम बार {{date}} को सत्यापित किए गए | Flagged by wF. Shown on the crisis page next to the helpline numbers. | |
| `src/features/counsellor/locales/hi.json` | `counsellor.closure.referred_to_emergency_services` | Referred to emergency services | आपातकालीन सेवाओं के लिए भेजा गया | Flagged by wB (counsellor.closure.*). Closure reason in a risk case. Judged safety-critical by G3. | |

### Tier 2: status and workflow wording flagged by workers

| File | i18n key | English | Current Hindi | Concern | Reviewer correction |
| --- | --- | --- | --- | --- | --- |
| `src/features/counsellor/locales/hi.json` | `counsellor.step.open` | Open | खुला | Flagged by wB (counsellor.step.*). | |
| `src/features/counsellor/locales/hi.json` | `counsellor.step.acknowledged` | Acknowledged | स्वीकार किया | Flagged by wB (counsellor.step.*). | |
| `src/features/counsellor/locales/hi.json` | `counsellor.step.contacted` | Contacted | संपर्क किया | Flagged by wB (counsellor.step.*). | |
| `src/features/counsellor/locales/hi.json` | `counsellor.step.handed_off` | Handed off | आगे सौंपा | Flagged by wB, specifically "आगे सौंपा" for handed off. | |
| `src/features/counsellor/locales/hi.json` | `counsellor.step.closed` | Closed | बंद | Flagged by wB (counsellor.step.*). | |
| `src/features/counsellor/locales/hi.json` | `counsellor.closure.student_reached_safe` | Student reached and safe | विद्यार्थी से संपर्क हुआ और वे सुरक्षित हैं | Flagged by wB (counsellor.closure.*). | |
| `src/features/counsellor/locales/hi.json` | `counsellor.closure.referred_to_counsellor_session` | Referred to a counsellor session | काउंसलर सत्र के लिए भेजा गया | Flagged by wB (counsellor.closure.*). | |
| `src/features/counsellor/locales/hi.json` | `counsellor.closure.unable_to_reach_documented` | Unable to reach (attempts documented) | संपर्क नहीं हो सका (प्रयास दर्ज हैं) | Flagged by wB (counsellor.closure.*). | |
| `src/features/counsellor/locales/hi.json` | `counsellor.closure.false_alarm` | False alarm | झूठी चेतावनी | Flagged by wB (counsellor.closure.*). | |
| `src/features/followup/locales/hi.json` | `followup.notShared` | No counsellor can see this alert, because you have not shared risk alerts with one. If you need support now, please call a helpline from this card. | कोई काउंसलर इस चेतावनी को नहीं देख सकता, क्योंकि आपने जोखिम की सूचनाएँ किसी के साथ साझा नहीं की हैं। अभी सहारा चाहिए तो कृपया इस कार्ड पर दी गई हेल्पलाइन पर कॉल करें। | Listed here by G3, not flagged by wB: it tells a student nobody can see the alert, then sends them to the helplines. Review with the wB strings. | |

### Tier 3: sync wording and general loanwords flagged by wF

| File | i18n key | English | Current Hindi | Concern | Reviewer correction |
| --- | --- | --- | --- | --- | --- |
| `src/features/offline-ui/hi.json` | `sync.label` | Sync status | सिंक की स्थिति | Flagged by wF: "सिंक" kept as a loanword. | |
| `src/features/offline-ui/hi.json` | `sync.pending_one` | {{count}} item waiting to sync | {{count}} आइटम सिंक होने की प्रतीक्षा में | Flagged by wF: "सिंक" kept as a loanword. One and other forms use the same text. | |
| `src/features/offline-ui/hi.json` | `sync.pending_other` | {{count}} items waiting to sync | {{count}} आइटम सिंक होने की प्रतीक्षा में | Flagged by wF: "सिंक" kept as a loanword. One and other forms use the same text. | |
| `src/features/offline-ui/hi.json` | `sync.syncNow` | Sync now | अभी सिंक करें | Flagged by wF: "सिंक" kept as a loanword. | |
| `src/features/offline-ui/hi.json` | `sync.syncing` | Syncing… | सिंक हो रहा है… | Flagged by wF: "सिंक" kept as a loanword. | |
| `src/features/offline-ui/hi.json` | `sync.synced` | Synced just now | अभी सिंक हुआ | Flagged by wF: "सिंक" kept as a loanword. | |
| `src/features/offline-ui/hi.json` | `logout.discard` | Discard | हटा दें | Flagged by wF. Is "हटा दें" clear enough for a destructive choice (entries are lost for good)? | |
| `src/features/offline-ui/hi.json` | `update.message` | A new version of MindSahaay is available. | MindSahaay का नया संस्करण उपलब्ध है। | New in G3. Not flagged by a worker. Low risk, listed because it is new. | |
| `src/features/offline-ui/hi.json` | `update.applying` | Updating… | अपडेट हो रहा है… | New in G3. Not flagged by a worker. Low risk, listed because it is new. | |
| `src/features/offline-ui/hi.json` | `update.refresh` | Refresh now | अभी रीफ़्रेश करें | New in G3. Not flagged by a worker. Low risk, listed because it is new. | |
| `src/features/offline-ui/hi.json` | `update.later` | Later | बाद में | New in G3. Not flagged by a worker. Low risk, listed because it is new. | |

## Added by the lead after the independent review (G6-SEC-03)

| File | i18n key | English | Current Hindi | Concern | Reviewer correction |
|---|---|---|---|---|---|
| src/features/offline-ui/hi.json | logout.helplinesTitle | Need to talk to someone right now? Call: | अभी किसी से बात करनी है? कॉल करें: | Safety-critical (shown inside the logout dialog beside the helplines). Check tone: warm, plain, not clinical. | |

## Added by worker H2 (security fixes G6-SEC-05 and G6-SEC-08)

Safety-critical strings first. None of these has been reviewed by a native speaker.

| File | i18n key | English meaning | Current Hindi | Concern | Reviewer correction |
|---|---|---|---|---|---|
| src/features/followup/locales/hi.json | followup.status.openNotShared | Alert recorded. It was not shared with a counsellor. | चेतावनी दर्ज हो गई है। इसे किसी काउंसलर के साथ साझा नहीं किया गया। | SAFETY-CRITICAL: replaces a falsely reassuring headline; must be unmistakable and not alarming. | |
| src/features/followup/locales/hi.json | followup.answeredTalkNotShared | Thanks, your answer is saved, but no counsellor can see it because you have not shared risk alerts; call a helpline on this card if you want to talk now | धन्यवाद। आपका जवाब सहेज लिया गया है, लेकिन कोई काउंसलर इसे नहीं देख सकता, क्योंकि आपने जोखिम की सूचनाएँ किसी के साथ साझा नहीं की हैं। अभी किसी से बात करनी हो तो इस कार्ड पर दी गई हेल्पलाइन पर कॉल करें। | SAFETY-CRITICAL: shown to a student who just said "I want to talk"; tone must be warm and direct. | |
| src/features/followup/locales/hi.json | followup.offerGone | This offer is no longer available and no session was booked | यह पेशकश अब उपलब्ध नहीं है और कोई सत्र बुक नहीं हुआ। आप फिर भी संपर्क कर सकते हैं या इस कार्ड पर दी गई हेल्पलाइन पर कॉल कर सकते हैं। | Check "पेशकश" (offer) reads naturally for a counselling session. | |
| src/features/followup/locales/hi.json | followup.optOutError | We could not save this choice. Please try again. | हम यह विकल्प सहेज नहीं सके। कृपया फिर कोशिश करें। | Low risk. | |
| src/features/followup/locales/hi.json | followup.refreshError | Your action went through but this card could not refresh; reopen the page | आपकी कार्रवाई हो गई, लेकिन यह कार्ड ताज़ा नहीं हो सका। नवीनतम स्थिति के लिए पेज दोबारा खोलें। | Low risk. | |
| src/features/followup/locales/hi.json | followup.notShared, answeredOkay, answeredTalk, answerError, offerError, optOutHint | wording changed from "below" to "on this card" | (see the file; "नीचे दी गई" became "इस कार्ड पर दी गई") | Re-read the changed sentences in context. | |
| src/features/counsellor/locales/hi.json | counsellor.eventType.chat_crisis | Chat crisis alert | चैट संकट सूचना | Counsellor-facing; check "संकट". | |
| src/features/counsellor/locales/hi.json | counsellor.eventType.phq9_item9 | PHQ-9 question 9 answer | PHQ-9 प्रश्न 9 का उत्तर | Counsellor-facing. | |
| src/features/counsellor/locales/hi.json | counsellor.eventType.counsellor_contact_requested | Student asked for contact | विद्यार्थी ने संपर्क माँगा | Counsellor-facing. | |
| src/features/counsellor/locales/hi.json | counsellor.eventType.manual / lexicon_match / assessment_escalation / other | Manual alert / Chat keyword alert / Alert escalated from an assessment / Other alert | मैन्युअल सूचना / चैट कीवर्ड सूचना / मूल्यांकन से बढ़ाई गई सूचना / अन्य सूचना | Counsellor-facing. | |
