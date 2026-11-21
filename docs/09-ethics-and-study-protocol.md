# 09 Ethics and Study Protocol

Status (2026-11-20): draft for submission to the institutional ethics committee. TODO: committee approval number. **No ethics approval has been obtained, no participant has been recruited, and no usability study, survey or interview has been run.** There are no SUS results. Automated accessibility checks (axe) and the real-backend browser tests are engineering tests and do not replace this study.

TODO: add tasks for the two newer features before the study: the crisis follow-through status card (a student reads "Alert recorded. It was not shared with a counsellor." and finds the helplines) and the offline crisis page. Treat any crisis scenario with the same distress protocol as T7.

## 1. Studies

| Study | Participants | Purpose |
|---|---|---|
| S1 Usability | 12 to 15 university students aged 18+ | SUS, task success, comprehension of disclaimers |
| S2 AI evaluation | None (synthetic and curated text only, see 11-ai-evaluation-plan.md) | Crisis detection metrics |

Real distressing text from people is not collected in either study. Scenarios are fictional.

## 2. Ethical safeguards

- Voluntary, no academic credit or penalty, withdrawal at any time with data deletion.
- Exclusion: age under 18; people who say they are currently in acute distress (they are offered helplines and not enrolled that day).
- The moderator is trained to follow the distress protocol: pause, offer helplines (Tele-MANAS 14416, KIRAN 1800-599-0019, 112), and notify the supervisor.
- Scenarios avoid graphic content. A crisis scenario uses a fictional character and is announced beforehand.
- No identity linked to responses; participant codes only. Data stored on an encrypted drive, deleted after the retention period (TODO set, for example 12 months after the report).
- Test accounts only; no participant's real mood or journal data is entered.

## 3. Informed consent form (template)

> **Title:** Testing MindSahaay, a student wellbeing app prototype
> **Researcher:** TODO name, email. **Supervisor:** TODO.
> **What this is.** You are invited to try a prototype and tell us what is easy or hard. MindSahaay is an educational app. It does not diagnose or treat anyone. We are testing the app, not you.
> **What you will do.** About 45 minutes: complete 6 short tasks using made-up scenarios, answer a 10 question survey, and join a short chat about your experience. We will record the screen and your voice if you agree below.
> **Risks.** The app discusses stress and mood, and one task shows how the app responds to a fictional person in distress. This may be uncomfortable. You may skip any task or stop at any time.
> **If you need support.** Tele-MANAS 14416 (24/7), KIRAN 1800-599-0019 (24/7), emergency 112. Campus counselling: TODO.
> **Privacy.** We do not ask for your real feelings or personal stories. Your name is not linked to your answers. Data is kept as described above and is not shared with your university.
> **Voluntary.** You can withdraw before, during, or until TODO date after the session, and we will delete your data.
> **Contact for questions or complaints.** TODO researcher, ethics committee contact.
>
> ☐ I am 18 or older. ☐ I have read this form and had my questions answered. ☐ I agree to take part. ☐ I agree to screen and audio recording (optional).
> Name / code: ________ Signature: ________ Date: ________

## 4. Scenario-based usability protocol

Session (45 min): welcome and consent (5), pre-questions on device and language (3), tasks (25), SUS and open questions (7), debrief (5).

| Task | Scenario (fictional persona) | Success criterion |
|---|---|---|
| T1 | "Aarav feels low after exams. Log his mood as 2 with tag 'exams'." | Completed within 60 s, no help |
| T2 | "Complete the PHQ-4 screening and say what the result means." | Participant states it is not a diagnosis |
| T3 | "Priya wants to write a private journal entry and be sure no one else can read it." | Entry saved; participant can explain encryption in own words (rough) |
| T4 | "Chat with the companion in Hinglish about a stressful viva." | Receives relevant reply; label as AI noticed |
| T5 | "Book the earliest Hindi-speaking counsellor slot." | Booking confirmed |
| T6 | "Show how to download your data and delete your account (test account)." | Both done |
| T7 (optional, announced) | "A fictional student types a message that signals crisis. Observe what the app does." | Participant finds helpline buttons within 10 s |

Measures per task: success (yes/partial/no), time, errors, think-aloud notes, severity rating of problems (0 to 4). Order of T1 to T6 is rotated (Latin square), T7 is last.

## 5. System Usability Scale

Ten items, each rated 1 (strongly disagree) to 5 (strongly agree). Items (standard SUS wording, TODO verify against Brooke 1996 before use):
1. I think that I would like to use this system frequently.
2. I found the system unnecessarily complex.
3. I thought the system was easy to use.
4. I think that I would need the support of a technical person to be able to use this system.
5. I found the various functions in this system were well integrated.
6. I thought there was too much inconsistency in this system.
7. I would imagine that most people would learn to use this system very quickly.
8. I found the system very cumbersome to use.
9. I felt very confident using the system.
10. I needed to learn a lot of things before I could get going with this system.

Scoring: odd items contribute (response - 1), even items contribute (5 - response); sum times 2.5 gives 0 to 100. Target mean >= 68 (commonly cited average; TODO verify). Report mean, SD, 95% CI. With n = 12 the CI will be wide, and this is stated as a limitation. Add 3 own items on trust, privacy clarity and crisis clarity (5-point Likert), reported separately and not part of SUS.

## 6. Debrief script

1. Thank the participant. Say that everything shown was a prototype and every scenario was fictional.
2. Ask "How are you feeling after the session?" If uncomfortable, repeat the helplines and offer a break.
3. Explain the purpose: to improve usability and check that help is easy to find.
4. Explain what the app cannot do (diagnose, monitor, replace a counsellor).
5. Remind them how to withdraw and when data is deleted.
6. Give the printed helpline card.

## 7. Analysis plan

Descriptive statistics for SUS and task success; thematic coding of notes by two coders on a subset (TODO report agreement); problems prioritised by severity and frequency and fed back to the roadmap.
