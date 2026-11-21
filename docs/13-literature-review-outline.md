# 13 Literature Review Outline

**Important:** every source below is a *candidate* recalled from general knowledge and is marked **to verify**. Authors, years, titles and venues may be wrong. No DOIs are given on purpose. Before citing, find the source, check the details and record the real DOI or URL. Nothing here may be quoted as evidence until verified.

Status 2026-11-20: no source in this outline has been verified yet. Nothing here may be cited as evidence.

## 1. Themes and guiding questions

| Theme | Question |
|---|---|
| T1 Student mental health in India | What is the prevalence, help-seeking gap and counsellor capacity? |
| T2 Digital mental health interventions | Do apps and chatbots improve outcomes, and what is engagement like? |
| T3 Screening instruments | How valid are PHQ-4/PHQ-9 for self-screening, including in India and in Hindi? |
| T4 Conversational agents and LLMs in mental health | Benefits, harms, evaluation methods |
| T5 Suicide risk detection in text | Methods and measured performance, multilingual and code-mixed text |
| T6 Safety, ethics and regulation | Clinical safety, Mental Healthcare Act 2017, UGC guidance, ethics of AI companions |
| T7 Privacy and data protection | DPDP Act 2023, health data privacy, app privacy practices |
| T8 Usability and accessibility | SUS, WCAG, design for distressed users |
| T9 Peer support and online communities | Benefits, moderation, risks of contagion |

## 2. Candidate sources (about 30, all to verify)

| # | Theme | Candidate | Note | Status |
|---|---|---|---|---|
| 1 | T1 | National Mental Health Survey of India 2015-16 (NIMHANS) | Prevalence, treatment gap | to verify |
| 2 | T1 | UGC guidelines on promotion of physical and mental wellbeing in HEIs | Policy basis already cited in project steering | to verify |
| 3 | T1 | NCRB accidental deaths and suicides in India report (student suicides) | Statistics, pick the latest edition | to verify |
| 4 | T1 | Studies on mental health of Indian medical or engineering students (systematic reviews) | Search needed, no specific paper chosen | to verify |
| 5 | T1 | Kota / entrance coaching pressure studies; Supreme Court of India 2025 student mental health guidance | Check whether and what was issued | to verify |
| 6 | T2 | Linardon et al., meta-analysis of smartphone mental health apps (World Psychiatry, around 2019) | Effectiveness | to verify |
| 7 | T2 | Torous et al., on app engagement and real-world retention | Engagement | to verify |
| 8 | T2 | Baumel et al., on engagement with digital mental health interventions (JMIR) | Engagement | to verify |
| 9 | T2 | Evidence on digital interventions for university students (systematic reviews) | Search needed | to verify |
| 10 | T3 | Kroenke, Spitzer, Williams, PHQ-9 validity study (J Gen Intern Med, 2001) | Core instrument | to verify |
| 11 | T3 | Kroenke et al., PHQ-4 ultra-brief screener (Psychosomatics, 2009) | Core instrument | to verify |
| 12 | T3 | Validation of PHQ-9 in Hindi or Indian populations | Search needed | to verify |
| 13 | T3 | Studies on PHQ-9 item 9 and later suicide risk | Rationale for item 9 rule; check strength of evidence | to verify |
| 14 | T4 | Fitzpatrick et al., Woebot randomised trial (JMIR Mental Health, 2017) | Chatbot CBT | to verify |
| 15 | T4 | Abd-Alrazaq et al., systematic reviews on chatbots in mental health | Effectiveness | to verify |
| 16 | T4 | Reviews of LLM chatbots in mental health care (2023 to 2025) | Search needed | to verify |
| 17 | T4 | Reports on harmful responses from general-purpose chatbots to users in distress | Search; use only peer-reviewed or reputable reports | to verify |
| 18 | T4 | Miner et al., smartphone assistants' responses to mental health questions (JAMA Intern Med, 2016) | Early safety evidence | to verify |
| 19 | T5 | Coppersmith et al., quantifying suicidal ideation via language on social media | Text-based detection | to verify |
| 20 | T5 | CLPsych shared task papers on suicide risk | Benchmarks | to verify |
| 21 | T5 | Surveys of NLP for suicide risk detection | Overview | to verify |
| 22 | T5 | Studies of code-mixed Hindi-English NLP (for example datasets and benchmarks such as LinCE or GLUECoS) | Hinglish methods | to verify |
| 23 | T6 | Mental Healthcare Act 2017 (India), full text | Primary legal source | to verify |
| 24 | T6 | WHO guidance on ethics and governance of AI for health (2021) | Ethics | to verify |
| 25 | T6 | Tele-MANAS and KIRAN programme documentation (MoHFW, DEPwD) | Helpline facts, confirm numbers | to verify |
| 26 | T6 | NHS DCB0129 / DCB0160 clinical risk management standards | Basis for hazard log | to verify |
| 27 | T7 | Digital Personal Data Protection Act 2023 and DPDP Rules (as notified) | Primary legal source | to verify |
| 28 | T7 | Studies on privacy of mental health apps (for example Mozilla "Privacy Not Included" reviews, academic audits) | Privacy practices | to verify |
| 29 | T8 | Brooke, "SUS: a quick and dirty usability scale" (1996) | Method | to verify |
| 30 | T8 | W3C WCAG 2.2 recommendation | Standard | to verify |
| 31 | T9 | Research on online peer support and moderation in mental health communities | Search needed | to verify |
| 32 | T7 | OWASP ASVS and OWASP Top 10 for LLM Applications | Security standards | to verify |

## 3. Review method

1. Search databases (Google Scholar, PubMed, ACM DL, IEEE Xplore, ACL Anthology) with documented search strings.
2. Inclusion: peer-reviewed or official documents, 2015 onward unless foundational; English. Exclusion: marketing material.
3. Record each source in a spreadsheet: citation, DOI/URL (as found), method, sample, finding, limitations, relevance to requirement IDs.
4. Appraise quality; do not generalise Western findings to India without noting it.
5. Synthesis: map findings to design decisions (for example PHQ-9 item 9 rule, hybrid detection, client-side encryption).

## 4. Gaps this project addresses (hypotheses until verified)

- TODO: the two newer features need their own candidate sources, none chosen yet: follow-up ("caring contacts") after a suicide-risk flag, and the safety of offline or delayed crisis alerts.
- Few tools combining privacy-first design, Hinglish support and an explicit crisis path for Indian students. TODO: confirm with a structured search before claiming novelty.

## 5. Proposed chapter structure

Introduction; Student mental health context; Digital interventions and chatbots; Risk detection and safety; Privacy and regulation; Evaluation methods; Gap and positioning.
