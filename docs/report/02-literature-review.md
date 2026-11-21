# Chapter 2. Literature Review

> **Status of this chapter.** This is a scaffold, not a finished review. Every source below is a *candidate* taken from the candidate list in docs/13-literature-review-outline.md. None has been located, read or verified. Authors, years, titles and venues may be wrong. Each citation is marked **[VERIFY]** and numbered by its row in that list ([S1] to [S32]). No DOI is given. No statistic is stated. Where a factual claim needs a source that is not on the candidate list, the text says **[CITATION NEEDED]**. Before submission each source must be found, read and either confirmed with its real details or deleted along with every sentence that depends on it.

## 2.1 Method

The planned review method (docs/13, section 3) is: search Google Scholar, PubMed, ACM Digital Library, IEEE Xplore and the ACL Anthology with documented search strings; include peer-reviewed or official documents from 2015 onward unless foundational; exclude marketing material; record each source in a spreadsheet with method, sample, finding, limitations and the requirement identifiers it informs; and note when Western findings are generalised to India. [STUDENT: insert the actual search strings, dates, number of records screened and included. This has not been done.]

The review is organised by the nine themes T1 to T9 of docs/13. For each theme the text states what the project needs from the literature and which candidate sources might provide it. Design consequences are drawn only in the form "the design assumes X, which must be supported by the sources named".

## 2.2 T1. Student mental health in India

The project's motivation depends on three claims: that mental health problems are common among Indian university students, that the gap between need and treatment is large, and that counselling capacity on campuses is limited. [CITATION NEEDED for each claim.]

Candidate sources are the National Mental Health Survey of India 2015-16 conducted by NIMHANS [S1] **[VERIFY]**, which is a candidate for general prevalence and the treatment gap; the University Grants Commission guidelines on promotion of physical and mental wellbeing in higher education institutions [S2] **[VERIFY]**, which the project already uses as its policy basis; National Crime Records Bureau reports on accidental deaths and suicides, specifically any student-related tables [S3] **[VERIFY]**, where the latest edition must be chosen and the exact table cited; systematic reviews on medical or engineering students [S4] **[VERIFY]** (no specific paper chosen); and writing on entrance-coaching pressure and any Supreme Court of India guidance on student mental health [S5] **[VERIFY]** (it is not known whether such guidance exists or what it says).

Design consequence to be supported: the target users are students under exam and placement pressure who may hesitate to approach campus services. The platform therefore offers an anonymous alias, local-first privacy and an explicit promise not to report to the institution.

## 2.3 T2. Digital mental health interventions

The project assumes that app-based tools can offer some benefit as a supplement to, not a replacement for, professional care, and that engagement with such tools is typically hard to sustain. Both statements need sources. [CITATION NEEDED]

Candidates: a meta-analysis of smartphone mental health apps by Linardon et al., published in World Psychiatry around 2019 [S6] **[VERIFY]**; work by Torous et al. on real-world app engagement and retention [S7] **[VERIFY]**; work by Baumel et al. on engagement with digital mental health interventions in JMIR [S8] **[VERIFY]**; and systematic reviews on digital interventions for university students [S9] **[VERIFY]** (search needed).

Design consequence to be supported: the platform keeps interaction short (mood in three taps, PHQ-4 in four items), and treats the app as a route to a counsellor (booking and care-share features) rather than an end in itself. The effectiveness of MindSahaay itself is not established by any study in this project.

## 2.4 T3. Screening instruments

The platform implements the PHQ-4, PHQ-9 and GAD-7 as educational self-assessments. Their use depends on published validation work and on the licence and translation status of each instrument.

Candidates: the original PHQ-9 validity study by Kroenke, Spitzer and Williams in the Journal of General Internal Medicine, 2001 [S10] **[VERIFY]**; the PHQ-4 ultra-brief screener by Kroenke et al. in Psychosomatics, 2009 [S11] **[VERIFY]**; validation of the PHQ-9 in Hindi or Indian populations [S12] **[VERIFY]** (search needed, none chosen); and studies of PHQ-9 item 9 and later suicide risk [S13] **[VERIFY]**. The comment header of `src/domain/scoring/phq9.ts` already cites the PHQ-9 validity paper, and `phq4.ts` cites the PHQ-4 paper. Those in-code references are also **[VERIFY]** until checked.

Two points need care. First, the band thresholds in the code (PHQ-9: 0 to 4, 5 to 9, 10 to 14, 15 to 19, 20 to 27; PHQ-4: 0 to 2, 3 to 5, 6 to 8, 9 to 12; GAD-7: 0 to 4, 5 to 9, 10 to 14, 15 to 21) must be checked against the instruments' publications [S10, S11] **[VERIFY]**. Second, the strength of evidence linking a non-zero item 9 response to later suicidal behaviour must be read from [S13] **[VERIFY]** and described accurately. The project applies the item 9 rule as a conservative safety measure, not as a prediction. A non-zero response is treated as a reason to show help, never as a classification of the student.

## 2.5 T4. Conversational agents and large language models

The companion is an LLM-backed chatbot. The literature question is what is known about the benefit and the harms of such systems.

Candidates: the randomised trial of the Woebot chatbot by Fitzpatrick et al. in JMIR Mental Health, 2017 [S14] **[VERIFY]**; systematic reviews by Abd-Alrazaq et al. on chatbots in mental health [S15] **[VERIFY]**; reviews of LLM chatbots in mental health care from 2023 to 2025 [S16] **[VERIFY]** (search needed); reports of harmful responses from general-purpose chatbots to users in distress [S17] **[VERIFY]** (peer-reviewed or reputable reports only); and Miner et al. on smartphone assistants' responses to mental health questions in JAMA Internal Medicine, 2016 [S18] **[VERIFY]**.

Design consequences to be supported: scripted or rule-based chatbot trials [S14] do not transfer automatically to a generative model, so the project treats the LLM as an untrusted component. The model never handles a crisis-flagged turn (a template is returned), its output passes an output guard, and it is labelled as an AI. The report does not claim therapeutic benefit.

## 2.6 T5. Suicide risk detection in text

Crisis detection is the safety-critical NLP task of the project.

Candidates: Coppersmith et al. on quantifying suicidal ideation through language on social media [S19] **[VERIFY]**; CLPsych shared-task papers on suicide risk [S20] **[VERIFY]**; surveys of NLP for suicide risk detection [S21] **[VERIFY]**; and studies on code-mixed Hindi-English NLP, for example datasets and benchmarks such as LinCE or GLUECoS [S22] **[VERIFY]**.

What the project needs from this theme is threefold: typical performance ranges and evaluation practice for text-based risk detection, so that the 0.95 recall target in NFR-SAFE-01 can be judged for realism **[CITATION NEEDED: no source on the candidate list has been confirmed to report such ranges]**; known difficulties with code-mixed and romanised text, which motivate the dedicated Hinglish normalisation in the lexicon; and the ethics of using social-media data, which motivates the decision to use synthetic data only. The project has not compared its results with any published benchmark.

## 2.7 T6. Safety, ethics and regulation

Candidates: the full text of the Mental Healthcare Act 2017 [S23] **[VERIFY]**; WHO guidance on the ethics and governance of artificial intelligence for health, 2021 [S24] **[VERIFY]**; programme documentation for Tele-MANAS and KIRAN from the Ministry of Health and Family Welfare and the Department of Empowerment of Persons with Disabilities [S25] **[VERIFY]**, which must confirm every helpline number before each release; and the NHS clinical risk management standards DCB0129 and DCB0160 [S26] **[VERIFY]**, which are the model for the hazard log of Chapter 8. The applicability of those NHS standards to an Indian student project is itself an open question; they are used only as a method.

The helpline numbers used by the platform (Tele-MANAS 14416 and 1800-891-4416, KIRAN 1800-599-0019, emergency 112) come from project documents and the steering rules of the repository. They are **[VERIFY]** against [S25] and must be rechecked before any release.

## 2.8 T7. Privacy and data protection

Candidates: the Digital Personal Data Protection Act 2023 and Rules as notified [S27] **[VERIFY]**; studies of privacy practices of mental health apps, including the Mozilla "Privacy Not Included" reviews and academic audits [S28] **[VERIFY]**; and the OWASP Application Security Verification Standard and the OWASP Top 10 for LLM Applications [S32] **[VERIFY]**, used to organise the threat model.

The report refers to the Act only with the phrase "designed with reference to". Section numbers quoted in the repository (for example for portability and erasure) were not checked against the legal text and must be treated as **[VERIFY]**.

## 2.9 T8. Usability and accessibility

Candidates: Brooke's System Usability Scale paper from 1996 [S29] **[VERIFY]**, which defines the ten-item questionnaire planned for the usability study; and the W3C Web Content Accessibility Guidelines 2.2 [S30] **[VERIFY]**. The design-system steering file of the repository requires a contrast ratio above 4.5:1 for normal text and 3:1 for large text, visible `:focus-visible` outlines, accessible names on icon-only buttons, and modal dialogs that trap focus, close on Escape and have an explicit close button. These rules are taken from [S30] and must be checked against it.

## 2.10 T9. Peer support and online communities

Candidate: research on online peer support and moderation in mental health communities [S31] **[VERIFY]** (search needed, none chosen). The project assumes that peer circles can provide a sense of belonging and that unmoderated content may harm vulnerable readers, including through exposure to methods of self-harm. Both assumptions require sources. [CITATION NEEDED]

## 2.11 Synthesis and positioning

Table 2.1 maps each design decision to the literature that must support it.

**Table 2.1 Design decisions and the evidence they depend on**

| Design decision | Evidence needed | Candidate sources | State |
|---|---|---|---|
| PHQ-9 item 9 above zero always triggers the crisis protocol | Item 9 as risk marker; limits of that evidence | S10, S13 | [VERIFY] |
| Hybrid of keyword and LLM detection | Limits of keyword matching; LLM behaviour on risk text | S19 to S22 | [VERIFY] |
| Crisis turns never reach free generation | Harms of general-purpose chatbots in distress | S17, S18 | [VERIFY] |
| Client-side journal encryption | Privacy failings of mental health apps | S28 | [VERIFY] |
| Aggregate-only institutional view with suppression | Re-identification risk in small cohorts | [CITATION NEEDED] | no candidate |
| Hindi and Hinglish support | Code-mixed NLP difficulty; language preference of users | S22 and [CITATION NEEDED] | [VERIFY] |
| Pre-moderated peer circles | Benefits and harms of online peer support | S31 | [VERIFY] |

**Gap statement (hypothesis).** The project's working hypothesis, recorded in docs/13 section 4, is that few existing tools combine a privacy-first design, Hinglish support and an explicit crisis path aimed at Indian students. This has not been confirmed by a structured search and must not be presented as a novelty claim until it is. [STUDENT: run the structured search and either confirm, narrow or drop the gap statement.]

## 2.12 Checklist before submission

- [ ] Every [S] entry located and details copied from the real source, with DOI or URL.
- [ ] Every unverifiable entry deleted, together with the sentences that rely on it.
- [ ] Every [CITATION NEEDED] resolved or the claim removed.
- [ ] Search log inserted.
- [ ] Reference list written in the institution's required style.
