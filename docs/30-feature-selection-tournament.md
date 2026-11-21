# 30. How the last two features were chosen: a structured AI debate

**Date:** 2026-11-20. **Method:** six advocate agents, one judge agent, two elimination rounds. **Result:** two features were built: the *Crisis Follow-Through Loop* and *Lifeline Offline*.

> Honesty note for readers and examiners: this was a *decision-support exercise* run with AI agents (Claude Opus). It is not a user study and not evidence that the chosen features are clinically valuable. It is evidence of a documented, criteria-based selection process and of the weaknesses that were surfaced and then acted on. Scores are the judge agent's, not measurements.

## 1. Why a tournament

Several good ideas competed for about 2 to 3 weeks of build time each, and the team wanted the choice to be explicit, criteria-based and adversarially tested rather than a preference. Six "counsel" each argued for one feature from a different lane; a judge applied a fixed rubric; survivors were cross-examined on their weakest point; the final two had to be complementary.

## 2. Rules given to every advocate

- Read the real repository first (read-only) and do not propose anything that already exists.
- Fit the existing architecture; about 2 to 3 weeks of AI-assisted work; no real user data; no clinical-safety or privacy harm.
- Opening argument of at most 450 words under fixed headings: the feature; why it wins grades; how it fits the codebase; safety, privacy and ethics; cost and schedule; *your own weakest point*.

## 3. The six candidates (opening arguments)

| # | Lane | Feature | Core idea | Self-declared weakest point |
|---|---|---|---|---|
| 1 | AI | Weekly Reflection | Claude writes a short weekly letter from the student's own mood and assessment numbers; a validator rejects numbers not computed by code; skipped when a crisis flag exists | 7 to 14 data points cannot support real correlations; may present noise as insight |
| 2 | Community | Saathi Listener Desk | Anonymous 30-minute text sessions with a trained student volunteer; every message passes the crisis checks; high risk ends the session | No counselling service receives alerts; keyword recall only 0.70, so about 3 in 10 high-risk messages could reach a peer; one-to-one peer chat is the riskiest form |
| 3 | Clinical | Crisis Follow-Through Loop | Replace the single `resolved` boolean with a five-state protocol (open, acknowledged, contacted, handed off, closed), timed check-backs, warm handoff; also fixes an RLS hole | Depends on parts that were assumed untested; nobody staffs the other end |
| 4 | Self-care | Pariksha Mode | Exam-aware sleep and routine diary, statistics from the student's own data, kept on the device | "A habit tracker on top of a habit tracker"; fragile 14-day statistics; counsellors cannot see it |
| 5 | Institution | Campus Pulse | Privacy-preserving counselling-capacity forecast for the dean from k-anonymous aggregates | Forecast would be trained on synthetic data the team writes itself (near-circular); small campuses mostly suppressed |
| 6 | Access | Lifeline Offline | Installable offline-first PWA: crisis screen, helplines and the local lexicon work offline; encrypted outbox syncs later | PWAs are a commodity; iOS Safari has no Background Sync; proof against real Postgres |

## 4. Judge's rubric (weights)

Capstone grade value (innovation, depth, demo moment) 30%; real-world impact and honesty about it 20%; fit with existing code and feasibility 20%; safety, privacy and ethics including the quality of the feature's own risk analysis 20%; candour about the weakest point 10%. The judge also had to prefer a *complementary* final pair and to fact-check counsel claims against the repository.

## 5. Round 1 ruling: eliminate two

Fact-checks (judge, against the repo): the RLS claim of counsel 3 was **true** (a student could update their own risk event; `0001_core.sql` lines 660 to 670); the hard-coded fake statistics in `Insights.tsx` claimed by counsel 4 and 1 were **true**; there was no manifest or service worker (counsel 6, **true**); no appointment aggregate view existed (counsel 5, **true**). Two counsel overstated their own prerequisite work ("mount the dashboard first, about 2 days"): the live dashboards were already routed for signed-in users. All counsel cited "the SQL has never been executed", which had become out of date because the migrations had just been run on a real local database.

| # | Weighted | Outcome |
|---|---|---|
| 6 Lifeline Offline | 7.7 | survived |
| 1 Weekly Reflection | 7.6 | survived |
| 3 Crisis Follow-Through Loop | 7.6 | survived |
| 4 Pariksha Mode | 6.9 | survived |
| 5 Campus Pulse | 6.1 | **eliminated** (circular forecast; goes dark on small campuses; lowest real-world value) |
| 2 Saathi Listener Desk | 6.0 | **eliminated** (its own stated failure mode is a suicidal student talking to an untrained peer with nobody behind them; honest admission does not make it safe) |

## 6. Round 2: cross-examination of the four survivors

Each survivor received one pointed question and had to answer concretely, say what it would change, and rebut the rival it feared most.

- **Counsel 1** conceded that nothing in its design rejected a causal claim ("mood rose *because* you journalled more"), and found its own demo example was wrong (the mood tags are emotion words, not activities). Redesign: code writes every factual sentence from fixed templates; Claude writes one warm opening sentence and picks from a closed list; banned causal words; minimum 4 check-ins per week for any trend.
- **Counsel 3** corrected a false claim (a scheduler did exist in the repo) and redesigned the check-backs as insert-only, plus a guarded overdue-escalation function; admitted notifications are in-app only.
- **Counsel 4** gave the strongest statistical answer (whole-week permutation test, false-discovery-rate correction, minimum effect size, property test that random data never yields a pattern) but remained a device-local habit feature.
- **Counsel 6** found a real cross-account bug in its own design (the outbox would have attached the student identifier at send time, so on a shared phone one student's offline entry could land in the next student's account) and redesigned it with per-user encrypted stores; admitted nobody is alerted while a device is offline.

Round 2 scores: Crisis Follow-Through Loop **8.4**, Lifeline Offline **7.9**, Weekly Reflection 7.3 (the AI part had shrunk to one sentence), Pariksha Mode 7.2.

## 7. Final ruling

**Champions: Crisis Follow-Through Loop and Lifeline Offline.** They work at different layers (clinical workflow in the database versus client infrastructure) and they connect: a crisis event queued offline arrives in the follow-up loop labelled "detected offline at X, received at Y". The judge also imposed mandatory acceptance conditions (regression tests that a student can no longer resolve their own event, that check-backs cannot be edited, that illegal state jumps fail, that the escalation function is idempotent and content-free, a shared-device test, a replay test, server-side timestamps, consent re-checked at send time, an offline Playwright test, and a plain statement that nobody is alerted while a device is offline).

## 8. What the process actually produced (outcomes, not claims)

- The tournament surfaced a **real security bug** (students could resolve their own crisis events); it is fixed with a regression test.
- Building and then *running* the features in real browsers found further defects that tests had missed: a global CSS class collision that made the counsellor's Acknowledge button unclickable; offline crisis events delayed behind a retried network consent lookup; offline mood check-ins that never queued because the query library paused the mutation. All fixed, each with a regression test.
- An independent security review (docs/28) found a Critical defect (reopened events never re-escalated), an alias leak, a logout dialog that could trap a distressed student, and a misleading status card. All were fixed with tests written first.

## 9. Limits of this exercise

AI agents argued, scored and judged; they share training and can share blind spots. No student, counsellor or clinician took part. The rubric weights were chosen by the team. The scores are ordinal judgements, not measurements. The features still need clinical review, a user study and ethics approval before any real use ([STUDENT: add your supervisor's view and your own reflection here]).
