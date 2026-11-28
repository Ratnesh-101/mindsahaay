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

## Added 2026-11-27: strings from the demo-data and persistence change set

Status: **needs native review**. These keys are new in the uncommitted diffs of `src/**/locales/hi.json` and in the untracked locale files (including `src/features/demo-data/locales/hi.json`). Only keys that did not exist at the last commit are listed, so existing strings were not re-reviewed. Written by AI workers. Keep `{{x}}` placeholders. The list was produced by comparing each `hi.json` with `git show HEAD:<file>`, and `en.json` of the same folder supplies the English column. Safety-relevant wording to read first: `src/features/crisis/locales/hi.json` (safety plan, helplines), `src/features/consent/locales/hi.json`, `src/features/chat/locales/hi.json` (the "not saved" line), and `src/features/dashboard/locales/hi.json`.

| File | i18n key | English | Current Hindi | Concern | Reviewer correction |
| --- | --- | --- | --- | --- | --- |
| `src/features/cbt/locales/hi.json` | `cbt.thought.deleted` | Thought record deleted. | विचार रिकॉर्ड हटा दिया गया। | New, needs native review. | |
| `src/features/cbt/locales/hi.json` | `cbt.thought.deleteError` | We could not delete this record, so it is still saved. Please try again. | हम यह रिकॉर्ड हटा नहीं सके, इसलिए यह अब भी सुरक्षित है। कृपया फिर कोशिश करें। | New, needs native review. | |
| `src/features/cbt/locales/hi.json` | `cbt.activity.saved` | Saved on this device. | इस डिवाइस पर सहेज लिया गया। | New, needs native review. | |
| `src/features/cbt/locales/hi.json` | `cbt.activity.removed` | Activity removed from this device. | गतिविधि इस डिवाइस से हटा दी गई। | New, needs native review. | |
| `src/features/cbt/locales/hi.json` | `cbt.activity.saveError` | We could not save this on your device, so it was not saved. Your browser may be blocking storage. Please try again. | हम इसे आपके डिवाइस पर सहेज नहीं सके, इसलिए यह सहेजा नहीं गया। हो सकता है आपका ब्राउज़र स्टोरेज रोक रहा हो। कृपया फिर कोशिश करें। | New, needs native review. | |
| `src/features/cbt/locales/hi.json` | `cbt.worry.parkedSaved` | Worry parked and saved on this device. | चिंता को अलग रखकर इस डिवाइस पर सहेज लिया गया। | New, needs native review. | |
| `src/features/cbt/locales/hi.json` | `cbt.worry.removedSaved` | Worry removed from this device. | चिंता इस डिवाइस से हटा दी गई। | New, needs native review. | |
| `src/features/cbt/locales/hi.json` | `cbt.worry.saveError` | We could not save this on your device, so it was not saved. Your browser may be blocking storage. Please try again. | हम इसे आपके डिवाइस पर सहेज नहीं सके, इसलिए यह सहेजा नहीं गया। हो सकता है आपका ब्राउज़र स्टोरेज रोक रहा हो। कृपया फिर कोशिश करें। | New, needs native review. | |
| `src/features/chat/locales/hi.json` | `chat.notSaved` | MindSahaay does not save this conversation. It disappears when you reload or leave this page, so you will not see it again. | MindSahaay इस बातचीत को सहेजता नहीं है। रीलोड करने या इस पेज से जाने पर यह मिट जाती है, इसलिए आप इसे दोबारा नहीं देख पाएँगे। | New, needs native review. | |
| `src/features/community/locales/hi.json` | `stories.anonymousPeer` | Anonymous peer | गुमनाम साथी | New, needs native review. | |
| `src/features/community/locales/hi.json` | `stories.minRead` | {{count}} min read | {{count}} मिनट में पढ़ें | New, needs native review. | |
| `src/features/community/locales/hi.json` | `stories.loadError` | We could not load the stories. Please try again. | हम कहानियाँ लोड नहीं कर सके। कृपया फिर कोशिश करें। | New, needs native review. | |
| `src/features/community/locales/hi.json` | `stories.emptyFiltered` | No stories in this category yet. | इस श्रेणी में अभी कोई कहानी नहीं है। | New, needs native review. | |
| `src/features/community/locales/hi.json` | `stories.likesOnly` | {{count}} found this helpful | {{count}} लोगों को यह मददगार लगा | New, needs native review. | |
| `src/features/counsellor/locales/hi.json` | `counsellor.noteFetchError` | We could not load the saved notes. They have not been deleted. Please try again. | हम सहेजे गए नोट लोड नहीं कर सके। वे हटाए नहीं गए हैं। कृपया फिर कोशिश करें। | New, needs native review. | |
| `src/features/doctors/locales/hi.json` | `doctors.mineError` | We could not load your appointments and reminders. This does not mean you have none. Please try again. | हम आपकी अपॉइंटमेंट और रिमाइंडर लोड नहीं कर सके। इसका मतलब यह नहीं कि आपके पास कोई नहीं है। कृपया फिर कोशिश करें। | New, needs native review. | |
| `src/features/journal/locales/hi.json` | `vault.lockedNote` | Your saved entries and records are still stored safely. After a reload, a new tab or a lock they stay hidden until you enter your passphrase. Nothing has been lost. | आपकी सहेजी हुई प्रविष्टियाँ और रिकॉर्ड अब भी सुरक्षित रखे हैं। रीलोड, नया टैब या लॉक के बाद वे तब तक छिपे रहते हैं जब तक आप पासफ़्रेज़ नहीं डालते। कुछ भी खोया नहीं है। | New, needs native review. | |
| `src/features/assessment/locales/hi.json` | `assessmentSave.saving` | Saving your result... | आपका परिणाम सहेजा जा रहा है... | New, needs native review. | |
| `src/features/assessment/locales/hi.json` | `assessmentSave.saved` | Your result is saved to your private history. | आपका परिणाम आपके निजी इतिहास में सहेज लिया गया। | New, needs native review. | |
| `src/features/assessment/locales/hi.json` | `assessmentSave.failed` | Your result was NOT saved. The score above is only shown on this screen. Please try saving again. | आपका परिणाम सहेजा नहीं गया। ऊपर का स्कोर सिर्फ़ इस स्क्रीन पर दिख रहा है। कृपया दोबारा सहेजने की कोशिश करें। | New, needs native review. | |
| `src/features/assessment/locales/hi.json` | `assessmentSave.retry` | Try saving again | फिर से सहेजने की कोशिश करें | New, needs native review. | |
| `src/features/assessment/locales/hi.json` | `assessmentSave.preview` | Preview mode: this result is kept for this tab only and is not saved anywhere. | प्रीव्यू मोड: यह परिणाम सिर्फ़ इस टैब में रखा गया है और कहीं सहेजा नहीं गया। | New, needs native review. | |
| `src/features/assessment/locales/hi.json` | `assessmentSave.historyError` | We could not load your past screenings. Please try again. | हम आपकी पिछली स्क्रीनिंग लोड नहीं कर सके। कृपया फिर कोशिश करें। | New, needs native review. | |
| `src/features/assessment/locales/hi.json` | `assessmentSave.historyEmpty` | No screenings saved yet. Your completed screenings will appear here. | अभी कोई स्क्रीनिंग सहेजी नहीं गई है। आपकी पूरी की गई स्क्रीनिंग यहाँ दिखेंगी। | New, needs native review. | |
| `src/features/consent/locales/hi.json` | `consentPage.granted` | Consent recorded in your ledger: granted for {{title}}. | आपके लेजर में सहमति दर्ज हुई: {{title}} के लिए दी गई। | New, needs native review. | |
| `src/features/consent/locales/hi.json` | `consentPage.revoked` | Consent recorded in your ledger: revoked for {{title}}. | आपके लेजर में सहमति दर्ज हुई: {{title}} के लिए वापस ली गई। | New, needs native review. | |
| `src/features/consent/locales/hi.json` | `consentPage.toggleError` | We could not record this change, so your consent for {{title}} is unchanged. Please try again. | हम यह बदलाव दर्ज नहीं कर सके, इसलिए {{title}} के लिए आपकी सहमति जैसी थी वैसी ही है। कृपया फिर कोशिश करें। | New, needs native review. | |
| `src/features/consent/locales/hi.json` | `consentPage.loadError` | We could not load your consent choices, so none are shown. Nothing has been changed. Please try again. | हम आपके सहमति विकल्प लोड नहीं कर सके, इसलिए कोई नहीं दिखाया गया। कुछ भी बदला नहीं गया है। कृपया फिर कोशिश करें। | New, needs native review. | |
| `src/features/consent/locales/hi.json` | `consentPage.ledgerError` | We could not load your audit ledger. Please try again later. | हम आपका ऑडिट लेजर लोड नहीं कर सके। कृपया बाद में फिर कोशिश करें। | New, needs native review. | |
| `src/features/consent/locales/hi.json` | `onboardingSave.saveError` | We could not record your choices, so nothing was saved yet. Please check your connection and try again. | हम आपके विकल्प दर्ज नहीं कर सके, इसलिए अभी कुछ भी सहेजा नहीं गया। कृपया अपना कनेक्शन जाँचकर फिर कोशिश करें। | New, needs native review. | |
| `src/features/consent/locales/hi.json` | `onboardingSave.aliasError` | Your consent was recorded, but we could not save your display name. Please try again. | आपकी सहमति दर्ज हो गई, लेकिन हम आपका प्रदर्शित नाम सहेज नहीं सके। कृपया फिर कोशिश करें। | New, needs native review. | |
| `src/features/consent/locales/hi.json` | `onboardingSave.aliasLabel` | Display name or alias | प्रदर्शित नाम या उपनाम | New, needs native review. | |
| `src/features/consent/locales/hi.json` | `onboardingSave.aliasRequired` | Please enter a name or alias, or generate an anonymous one. | कृपया कोई नाम या उपनाम डालें, या गुमनाम उपनाम बनवाएँ। | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.loading` | Loading your safety plan... | आपकी सुरक्षा योजना लोड हो रही है... | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.loadError` | We could not load your safety plan. Nothing has been changed. Please try again. | हम आपकी सुरक्षा योजना लोड नहीं कर सके। कुछ भी बदला नहीं गया है। कृपया फिर कोशिश करें। | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.lockedTitle` | Your saved safety plan is encrypted | आपकी सहेजी हुई सुरक्षा योजना एन्क्रिप्टेड है | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.lockedBody` | Enter the passphrase you chose when you saved it to read it. Until then it stays hidden. Nothing has been lost. | इसे पढ़ने के लिए वही पासफ़्रेज़ डालें जो आपने सहेजते समय चुना था। तब तक यह छिपी रहती है। कुछ भी खोया नहीं है। | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.unlockLabel` | Safety plan passphrase | सुरक्षा योजना का पासफ़्रेज़ | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.unlock` | Unlock plan | योजना अनलॉक करें | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.wrongPassphrase` | That passphrase did not open your plan. Please check it and try again. | इस पासफ़्रेज़ से आपकी योजना नहीं खुली। कृपया जाँचकर फिर कोशिश करें। | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.startNew` | Start a new plan instead | इसके बजाय नई योजना शुरू करें | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.startNewNote` | A new plan replaces the encrypted one only when you save it. | नई योजना एन्क्रिप्टेड योजना को तभी बदलती है जब आप उसे सहेजते हैं। | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.saved` | Safety plan saved to your account. | सुरक्षा योजना आपके खाते में सहेज ली गई। | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.savedDevice` | Safety plan encrypted and saved on this device. | सुरक्षा योजना एन्क्रिप्ट करके इस डिवाइस पर सहेज ली गई। | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.savedPreview` | This preview keeps the plan for this tab only. It is not stored anywhere. | यह प्रीव्यू योजना को सिर्फ़ इस टैब में रखता है। यह कहीं भी सहेजी नहीं जाती। | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.saveError` | We could not save your safety plan, so nothing was saved. Your changes are still on this screen. Please try again. | हम आपकी सुरक्षा योजना सहेज नहीं सके, इसलिए कुछ भी सहेजा नहीं गया। आपके बदलाव अब भी इस स्क्रीन पर हैं। कृपया फिर कोशिश करें। | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.needPassphrase` | Enter a passphrase to encrypt this plan, or switch encryption off. | इस योजना को एन्क्रिप्ट करने के लिए पासफ़्रेज़ डालें, या एन्क्रिप्शन बंद करें। | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.emptyHint` | Nothing is saved yet. Add your own warning signs, coping steps, trusted people and reasons for living, then save. | अभी कुछ सहेजा नहीं गया है। अपने चेतावनी संकेत, सहारे के कदम, भरोसेमंद लोग और जीने की वजहें जोड़कर सहेजें। | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `crisisPlan.saving` | Saving... | सहेजा जा रहा है... | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `safetyCard.saved` | Anchors encrypted and saved on this device. | एंकर एन्क्रिप्ट करके इस डिवाइस पर सहेज लिए गए। | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `safetyCard.saveError` | We could not save your anchors on this device, so nothing was saved. Please try again. | हम आपके एंकर इस डिवाइस पर सहेज नहीं सके, इसलिए कुछ भी सहेजा नहीं गया। कृपया फिर कोशिश करें। | New, needs native review. | |
| `src/features/crisis/locales/hi.json` | `safetyCard.deviceOnly` | Your anchors are stored encrypted on this device only. They are not sent to the server. | आपके एंकर सिर्फ़ इसी डिवाइस पर एन्क्रिप्टेड रखे जाते हैं। वे सर्वर को नहीं भेजे जाते। | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `greetingMorning` | Good morning, {{name}}. | शुभ प्रभात, {{name}}। | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `greetingAfternoon` | Good afternoon, {{name}}. | शुभ दोपहर, {{name}}। | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `greetingEvening` | Good evening, {{name}}. | शुभ संध्या, {{name}}। | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `checkinPrompt` | Small daily check-ins create meaningful change. How are you feeling today? | दैनिक छोटे चेक-इन से बड़ा बदलाव आता है। आज आप कैसा महसूस कर रहे हैं? | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `saving` | Saving… | सहेजा जा रहा है… | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `saved` | Saved | सहेजा गया | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `savedOffline` | Saved on this device. It will sync when you are back online. | इस डिवाइस पर सहेजा गया। ऑनलाइन होने पर सिंक होगा। | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `saveError` | We could not save your check-in. Please try again. | चेक-इन सहेजने में विफल। कृपया पुन: प्रयास करें। | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `avgMoodTitle` | Average mood (last 7 days) | औसत मूड (पिछले 7 दिन) | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `checkinsThisWeek` | Check-ins this week | इस सप्ताह चेक-इन | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `latestCheckin` | Latest check-in | नवीनतम चेक-इन | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `latestScreening` | Latest screening | नवीनतम स्क्रीनिंग | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `notEnoughDataTrend` | Need at least 4 check-ins in both weeks for 7-day trend | 7-दिवसीय रुझान के लिए दोनों हफ्तों में कम से कम 4 चेक-इन आवश्यक हैं | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `trendUp` | ↑ {{diff}}% vs prior 7 days | पिछले 7 दिनों से ↑ {{diff}}% | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `trendDown` | ↓ {{diff}}% vs prior 7 days | पिछले 7 दिनों से ↓ {{diff}}% | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `trendEqual` | No change vs prior 7 days | पिछले 7 दिनों की तुलना में कोई बदलाव नहीं | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `noMoodsYet` | No check-ins yet | अभी कोई चेक-इन नहीं | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `noScreeningYet` | No screenings completed | कोई स्क्रीनिंग पूर्ण नहीं | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `takeScreening` | Take a 2-minute screening | 2 मिनट की स्क्रीनिंग करें | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `emptyStateTitle` | Welcome to your mindful space | आपके मन की शांति के स्थान में स्वागत है | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `emptyStateDesc` | You haven't logged any check-ins yet. Take a moment to log how you feel today, or load sample data to preview features. | आपने अभी तक कोई चेक-इन दर्ज नहीं किया है। ऊपर अपना मूड दर्ज करें, या सुविधाओं को देखने के लिए डेमो डेटा लोड करें। | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `logFirstCheckin` | Log your first check-in | पहला चेक-इन दर्ज करें | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `includesDemo` | Includes demo data | डेमो डेटा शामिल है | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `moodRhythm` | Your mood rhythm | आपकी मनोदशा की लय | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `moodRhythmSubtitle` | Based on your real daily check-ins | आपके वास्तविक दैनिक चेक-इन पर आधारित | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `noChartData` | No mood entries recorded yet. Complete a daily check-in above to begin tracking your mood rhythm. | अभी कोई मूड प्रविष्टि नहीं। अपनी मनोदशा ट्रैक करने के लिए ऊपर दैनिक चेक-इन करें। | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `upcomingSession` | Upcoming session | आगामी सत्र | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `noUpcomingSession` | No upcoming sessions. Need support? Book a confidential consultation with a campus counsellor. | कोई आगामी सत्र नहीं। सहायता चाहिए? परिसर परामर्शदाता के साथ गोपनीय सत्र बुक करें। | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `findCounsellor` | Find a counsellor | परामर्शदाता खोजें | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `joinSession` | Join video session | वीडियो सत्र से जुड़ें | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `weeklyCheckin` | Weekly check-in | साप्ताहिक चेक-इन | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `weeklyCheckinCta` | 2 minutes can help | 2 मिनट मदद कर सकते हैं | New, needs native review. | |
| `src/features/dashboard/locales/hi.json` | `weeklyCheckinDesc` | Understand how you're really doing. | समझें कि आप वास्तव में कैसा महसूस कर रहे हैं। | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `heading` | Demo data | डेमो डेटा | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `description` | Adds about 30 days of sample check-ins and 3 sample screenings so you can explore charts and insights. Everything is labelled Demo. Your own entries are never changed. You can remove it at any time. | इसमें लगभग 30 दिनों के नमूना चेक-इन और 3 नमूना स्क्रीनिंग जुड़ जाती हैं, ताकि आप चार्ट और इनसाइट्स देख सकें। हर चीज़ पर "डेमो" का लेबल रहता है। आपकी अपनी प्रविष्टियाँ कभी नहीं बदलतीं। आप इसे कभी भी हटा सकते हैं। | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `load` | Load demo data | डेमो डेटा लोड करें | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `loading` | Loading demo data… | डेमो डेटा लोड हो रहा है… | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `checking` | Checking demo data… | डेमो डेटा की जाँच हो रही है… | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `loadedTitle` | Demo data is loaded | डेमो डेटा लोड है | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `counts` | Sample check-ins: {{moods}} · Sample screenings: {{assessments}} | नमूना चेक-इन: {{moods}} · नमूना स्क्रीनिंग: {{assessments}} | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `loadedHelp` | Sample rows are labelled Demo wherever they appear. They stay in your own account and are never shown to counsellors or your institution. | नमूना पंक्तियाँ जहाँ भी दिखती हैं, उन पर "डेमो" का लेबल होता है। वे सिर्फ़ आपके अपने खाते में रहती हैं और काउंसलर या आपके संस्थान को कभी नहीं दिखतीं। | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `clear` | Clear demo data | डेमो डेटा हटाएँ | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `clearing` | Removing demo data… | डेमो डेटा हटाया जा रहा है… | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `confirmTitle` | Clear demo data? | डेमो डेटा हटाएँ? | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `confirmBody` | This removes only the sample data. Your own entries stay. | इससे सिर्फ़ नमूना डेटा हटेगा। आपकी अपनी प्रविष्टियाँ बनी रहेंगी। | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `confirmClear` | Yes, clear demo data | हाँ, डेमो डेटा हटाएँ | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `cancel` | Cancel | रद्द करें | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `close` | Close | बंद करें | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `loadSuccess` | Demo data loaded: {{moods}} sample check-ins and {{assessments}} sample screenings. | डेमो डेटा लोड हो गया: {{moods}} नमूना चेक-इन और {{assessments}} नमूना स्क्रीनिंग। | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `clearSuccess` | Demo data cleared: {{moods}} sample check-ins and {{assessments}} sample screenings removed. Your own entries were not changed. | डेमो डेटा हटा दिया गया: {{moods}} नमूना चेक-इन और {{assessments}} नमूना स्क्रीनिंग हटाई गईं। आपकी अपनी प्रविष्टियाँ नहीं बदली गईं। | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `errorLoad` | Demo data could not be loaded. Nothing was added. Please try again. | डेमो डेटा लोड नहीं हो सका। कुछ भी जोड़ा नहीं गया। कृपया फिर से कोशिश करें। | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `errorClear` | Demo data could not be cleared. Nothing was removed. Please try again. | डेमो डेटा हटाया नहीं जा सका। कुछ भी हटाया नहीं गया। कृपया फिर से कोशिश करें। | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `errorStatus` | Could not check whether demo data is loaded. | यह जाँच नहीं हो सकी कि डेमो डेटा लोड है या नहीं। | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `errorAuth` | Please sign in again to use demo data. | डेमो डेटा इस्तेमाल करने के लिए कृपया दोबारा साइन इन करें। | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `errorUnavailable` | Demo data is not available on this server yet. | इस सर्वर पर डेमो डेटा अभी उपलब्ध नहीं है। | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `retry` | Try again | फिर से कोशिश करें | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `previewTitle` | This preview already uses sample data | यह प्रीव्यू पहले से नमूना डेटा इस्तेमाल करता है | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `previewBody` | You are in the offline preview, which shows sample content without a backend. Sign in with a real account to add labelled demo data to it. | आप ऑफ़लाइन प्रीव्यू में हैं, जो बिना बैकएंड के नमूना सामग्री दिखाता है। अपने असली खाते में लेबल वाला डेमो डेटा जोड़ने के लिए असली खाते से साइन इन करें। | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `badge` | Demo | डेमो | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `includesNotice` | Includes demo data | इसमें डेमो डेटा शामिल है | New, needs native review. | |
| `src/features/demo-data/locales/hi.json` | `tagDemoCount` | {{n}} Demo | {{n}} डेमो | New, needs native review. | |
| `src/features/modals/locales/hi.json` | `notifications.loadError` | We could not load your notifications. This does not mean there are none. Please try again. | हम आपकी सूचनाएँ लोड नहीं कर सके। इसका मतलब यह नहीं कि कोई सूचना नहीं है। कृपया फिर कोशिश करें। | New, needs native review. | |
| `src/features/modals/locales/hi.json` | `notifications.retry` | Try again | फिर कोशिश करें | New, needs native review. | |

Existing keys whose wording changed in the same diffs (also needs native review):

| File | i18n key | English now | Hindi now |
| --- | --- | --- | --- |
| `src/features/community/locales/hi.json` | `stories.voicesSubtitle` | Recent posts shared by students in Campus Peer Circles. They are anonymous and were approved by moderation. | कैंपस पीयर सर्कल में छात्रों द्वारा साझा की गई हाल की पोस्ट। ये गुमनाम हैं और मॉडरेशन द्वारा स्वीकृत की गई हैं। |
| `src/features/community/locales/hi.json` | `stories.filtersLabel` | Circle categories | सर्कल की श्रेणियाँ |
| `src/features/community/locales/hi.json` | `stories.empty` | No stories here yet. Posts that are approved in Campus Peer Circles will appear here. | यहाँ अभी कोई कहानी नहीं है। कैंपस पीयर सर्कल में स्वीकृत पोस्ट यहाँ दिखेंगी। |

## Added 2026-11-27: strings from the chat-persistence and encrypted-blobs sync change set (Wave 3)

Status: **needs native review**. These keys were added or modified in the Wave 3 change set across `src/features/chat/locales/hi.json`, `src/features/cbt/locales/hi.json`, and `src/features/crisis/locales/hi.json`. Written by AI workers; none has been reviewed by a native Hindi speaker. Ordering: safety and persistence notices first, then sync and UI workflow actions. Keep `{{count}}` placeholders.

| File | i18n key | English | Current Hindi | Concern | Reviewer correction |
| --- | --- | --- | --- | --- | --- |
| `src/features/chat/locales/hi.json` | `chat.notSaved` | Saved for 30 days, encrypted with your vault passphrase. MindSahaay staff and counsellors cannot read it. Each message is still sent to our AI provider to write a reply. | 30 दिनों के लिए सुरक्षित, आपके वॉल्ट पासफ़्रेज़ से एन्क्रिप्टेड। MindSahaay का स्टाफ़ और काउंसलर्स इसे नहीं पढ़ सकते। जवाब तैयार करने के लिए प्रत्येक संदेश हमारे AI प्रदाता को भेजा जाता है। | Safety and privacy notice. Replaces the former "MindSahaay does not save" text. Verify accuracy of AI provider disclosure and 30-day retention phrasing. | |
| `src/features/chat/locales/hi.json` | `chat.lockedBanner` | Unlock your vault to save and see past conversations. This conversation is not being saved. | पिछली बातचीत देखने और सहेजने के लिए अपना वॉल्ट अनलॉक करें। यह बातचीत सहेजी नहीं जा रही है। | Banner shown when vault is locked. | |
| `src/features/chat/locales/hi.json` | `chat.dontSaveToggle` | Don't save this conversation | इस बातचीत को सहेजें नहीं | Toggle label for per-conversation ephemerality. | |
| `src/features/chat/locales/hi.json` | `chat.notSavedThisConvo` | This conversation is not being saved. | यह बातचीत सहेजी नहीं जा रही है। | Inline notice when toggle is active. | |
| `src/features/chat/locales/hi.json` | `chat.demoNotice` | Preview mode: conversations are not saved. | प्रीव्यू मोड: बातचीत सहेजी नहीं जाती है। | Preview mode status text. | |
| `src/features/chat/locales/hi.json` | `chat.notSavedYet` | Not saved yet | अभी सहेजा नहीं गया | Status indicator when background save is retrying. | |
| `src/features/chat/locales/hi.json` | `chat.pastConversations` | Past conversations | पिछली बातचीत | Button and header label. | |
| `src/features/chat/locales/hi.json` | `chat.noPastConversations` | No past conversations yet. | अभी तक कोई पिछली बातचीत नहीं है। | Empty state in past chats modal. | |
| `src/features/chat/locales/hi.json` | `chat.pastChatsTitle` | Saved Conversations | सहेजी गई बातचीत | Modal title for past conversation drawer/dialog. | |
| `src/features/chat/locales/hi.json` | `chat.closeHistory` | Close | बंद करें | Modal close button. | |
| `src/features/chat/locales/hi.json` | `chat.openPastChat` | Open | खोलें | Open button for past session. | |
| `src/features/chat/locales/hi.json` | `chat.newChat` | New chat | नई बातचीत | Action button. | |
| `src/features/chat/locales/hi.json` | `chat.deleteConvo` | Delete conversation | बातचीत हटाएं | Deletion action. | |
| `src/features/chat/locales/hi.json` | `chat.deleteConvoConfirm` | Are you sure you want to delete this conversation? This cannot be undone. | क्या आप वाकई इस बातचीत को हटाना चाहते हैं? इसे वापस नहीं लाया जा सकता। | Destructive action confirmation dialog. | |
| `src/features/chat/locales/hi.json` | `chat.deleteAllChats` | Delete all chats | सभी चैट हटाएं | Destructive bulk action button. | |
| `src/features/chat/locales/hi.json` | `chat.deleteAllChatsConfirm` | Are you sure you want to delete all saved conversations? This cannot be undone. | क्या आप वाकई सभी सहेजी गई बातचीत हटाना चाहते हैं? इसे वापस नहीं लाया जा सकता। | Destructive action confirmation dialog. | |
| `src/features/chat/locales/hi.json` | `chat.deleteConfirm` | Yes, delete | हाँ, हटाएं | Modal confirmation CTA. | |
| `src/features/chat/locales/hi.json` | `chat.deleteCancel` | Cancel | रहने दें | Modal cancel button. | |
| `src/features/chat/locales/hi.json` | `chat.deletedNotice` | Conversation deleted. | बातचीत हटा दी गई। | Toast notification. | |
| `src/features/chat/locales/hi.json` | `chat.allDeletedNotice` | All conversations deleted. | सभी बातचीत हटा दी गई। | Toast notification. | |
| `src/features/chat/locales/hi.json` | `chat.messagesCount` | {{count}} messages | {{count}} संदेश | Session list count format. | |
| `src/features/chat/locales/hi.json` | `chat.messagesCount_one` | 1 message | 1 संदेश | Singular form. | |
| `src/features/chat/locales/hi.json` | `chat.messagesCount_other` | {{count}} messages | {{count}} संदेश | Plural form. | |
| `src/features/cbt/locales/hi.json` | `cbt.sync.synced` | Synced | सिंक हो गया | Sync status badge. | |
| `src/features/cbt/locales/hi.json` | `cbt.sync.waiting` | Waiting to sync | सिंक होने की प्रतीक्षा में | Sync dirty/retry status. | |
| `src/features/cbt/locales/hi.json` | `cbt.sync.conflict` | A newer copy from another device replaced the copy on this device. | दूसरे डिवाइस की नई प्रति ने इस डिवाइस की प्रति को बदल दिया। | Conflict notification banner. | |
| `src/features/cbt/locales/hi.json` | `cbt.sync.dismiss` | Dismiss | बंद करें | Banner dismiss action. | |
| `src/features/cbt/locales/hi.json` | `cbt.activity.intro` | When mood is low, small planned activities can lift it. Plan something, do it, then rate your mood. Encrypted and synced to your account. | मन उदास हो तो छोटी योजनाबद्ध गतिविधियाँ उसे उठा सकती हैं। कुछ तय करें, करें, फिर अपना मूड आँकें। एन्क्रिप्ट होकर आपके खाते में सिंक होता है। | Changed from "केवल इसी डिवाइस पर सहेजा जाता है।" to synced disclosure. | |
| `src/features/cbt/locales/hi.json` | `cbt.worry.intro` | Pick a daily 15 to 20 minute slot for worrying. When a worry shows up at other times, park it here and come back to it later. Encrypted and synced to your account. | चिंता करने के लिए रोज़ 15 से 20 मिनट का समय तय करें। बाकी समय कोई चिंता आए तो उसे यहाँ रख दें और बाद में देखें। एन्क्रिप्ट होकर आपके खाते में सिंक होता है। | Changed from "केवल इसी डिवाइस पर सहेजा जाता है।" to synced disclosure. | |
| `src/features/crisis/locales/hi.json` | `safetyCard.deviceOnly` | Encrypted and synced to your account. Your anchors are encrypted with your vault passphrase, so MindSahaay cannot read them, and they appear on your other devices after you unlock. | एन्क्रिप्ट होकर आपके खाते में सिंक होता है। आपके एंकर आपके वॉल्ट पासफ़्रेज़ से एन्क्रिप्ट होते हैं, इसलिए MindSahaay उन्हें पढ़ नहीं सकता, और अनलॉक करने के बाद वे आपके दूसरे डिवाइस पर भी दिखते हैं। | Updated from local-only disclaimer to encrypted multi-device sync explanation. | |
