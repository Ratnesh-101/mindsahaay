# 15 Roadmap (18 weeks from 2026-11-23)

Week 1 starts Monday 2026-11-23 (a Monday; TODO re-check against the academic calendar). Week 18 ends Sunday 2027-03-28. Holidays and exam periods are not accounted for. TODO adjust.

| Wk | Dates | Milestone | Deliverables |
|---|---|---|---|
| 1 | 11-23 to 11-29 | Kick-off, proposal | 01 proposal approved, repo and CI skeleton, roles |
| 2 | 11-30 to 12-06 | Requirements | 02 SRS v1, personas, ethics application drafted |
| 3 | 12-07 to 12-13 | Architecture and data | 03, 04, 05; submit ethics application; seek clinical advisor |
| 4 | 12-14 to 12-20 | Security and privacy design | 06, 07 v1; test tooling set up (axe, Vitest) |
| 5 | 12-21 to 12-27 | Auth and RLS migration | Supabase Auth, schema, RLS; fixes TH-01 (RK-02) |
| 6 | 12-28 to 01-03 | Core features 1 | Mood, journal encryption, consent screens. Low-capacity week (holidays) |
| 7 | 01-04 to 01-10 | Core features 2 | PHQ-4/9 with item 9 rule, privacy page (export, erase) |
| 8 | 01-11 to 01-17 | Crisis module | Client and server detector, banner, offline mode; hazard log v1 (08) |
| 9 | 01-18 to 01-24 | AI proxy | Claude proxy, streaming, rate limits, output filter |
| 10 | 01-25 to 01-31 | Evaluation dataset | 600-item dataset written and annotated; interim keyword baseline |
| 11 | 02-01 to 02-07 | Booking and community | Booking state machine, counsellor view, stories with moderation |
| 12 | 02-08 to 02-14 | Integration, performance | e2e suite, TTFT load test, Lighthouse fixes. Ethics approval needed by now (RK-04) |
| 13 | 02-15 to 02-21 | Accessibility and i18n | WCAG 2.2 AA audit, Hindi UI, 09 protocol finalised |
| 14 | 02-22 to 02-28 | AI evaluation | Run systems A, B, C; error analysis; update HZ-01 |
| 15 | 03-01 to 03-07 | Hardening | Coverage >= 80%, security checklist, bug fixing, feature freeze |
| 16 | 03-08 to 03-14 | Usability study | Sessions with 12 or more participants (if approved), SUS |
| 17 | 03-15 to 03-21 | Analysis and writing | Results, literature review (13) verified, final docs update |
| 18 | 03-22 to 03-28 | Submission and demo | Final report, 14 demo rehearsed twice, handover, retrospective |

## Status on 2026-11-20

The table above is the original plan and its dates were not changed. Engineering is ahead of the plan and the human work is behind it. Done: auth, RLS and 8 migrations checked on a local Postgres (14 pgTAP files, 146 tests passing), the crisis module, the keyword lexicon (heldout recall 0.70) and two selected features (Crisis Follow-Through Loop, Lifeline Offline). Not done: ethics approval (needed by week 12), the LLM and hybrid evaluation runs (need an API key), the usability study, Lighthouse and OWASP ZAP runs, a hosted Supabase deployment, clinical review, native review of the Hindi strings (docs/27), and a first CI run on a real runner. The project is not in a git repository yet.

## Critical path

Auth/RLS (wk 5) then crisis module (wk 8) then dataset and evaluation (wk 10, 14) then report. Ethics approval gates the usability study.

## Scope control

Cut order if late: Dean aggregates, anonymous alias mode, story likes, app lock, then Hindi story content. Never cut: crisis path, disclaimers, export and erase, tests for item 9.

## Checkpoints

Supervisor review at weeks 4, 8, 12, 16. Each checkpoint reviews the risk register (12) and hazard log (08).
