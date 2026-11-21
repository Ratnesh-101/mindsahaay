# MindSahaay crisis-classifier dataset card

File: `dataset.jsonl` (600 lines, UTF-8). Rebuild with `node scripts/build-dataset.ts` (deterministic).

## Status and limits (read first)

- **Synthetic.** Every sentence was written for this project from general warning-sign guidance. No real user messages, no scraped posts, no data from any person.
- **Not reviewed by a clinician.** Labels are the author's judgement under the rubric below. A clinical or counselling advisor must review the rubric and labels before any claim about detection quality is made in a report, viva or paper.
- **Single annotator.** There is no inter-annotator agreement (Cohen's kappa is not available). The plan in `docs/11-ai-evaluation-plan.md` asks for two annotators plus an adjudicator.
- **Low effective diversity.** There are 14 hand-written core sentences per (language, label) cell, 210 in total. Each is expanded to 40 per cell with a neutral opener or closer ("Honestly, ...", "... Anyway."). Metrics therefore treat near-duplicates as independent items, and confidence intervals would be too narrow. The same author wrote the data and shaped the lexicon context, so there is leakage risk. A second writer should add a held-out test set.
- **Not a diagnostic benchmark.** MindSahaay is an educational well-being tool. Results say nothing about clinical validity.
- **Non-instructional.** Messages mention intent, plans, preparation or farewell, but contain no methods, means, quantities or locations that would work as instructions.
- Content is distressing by nature. Anyone reading it should know the helplines: Tele-MANAS 14416, KIRAN 1800-599-0019, emergency 112.

## Schema

| field | values |
|---|---|
| id | `<language>-<label>-NNN` |
| text | the message (1 to 2 sentences, student-chat register) |
| language | `en`, `hi`, `hinglish` |
| script | `latin`, `devanagari` |
| label | `none`, `low`, `moderate`, `high`, `imminent` |
| category | sub-type, see below |
| notes | `synthetic; base` or `synthetic; prefix/suffix`, plus `hard case` when applicable |

## Balance

120 items per label, 200 per language, 40 per (language, label) cell. Hindi is written in Devanagari (a few lines code-mix English words). Hinglish is Roman script with spelling variants and SMS-style typos.

## Label rubric (draft, needs advisor review)

| label | meaning | examples of content |
|---|---|---|
| none | No distress, or harmless usage | neutral chat, idioms ("dead tired", "dying of laughter"), song lyrics, fiction, negation ("I would never hurt myself") |
| low | Ordinary student stress | exam pressure, loneliness, homesickness, mild low mood, academic idioms ("this exam is killing me") |
| moderate | Hopelessness without stated suicidal thoughts | burden, entrapment, wish to disappear, unbearable pain, numbness |
| high | Suicidal ideation (active or passive) or self-harm, no plan or timeframe; also serious concern about another person | "want to die", "wish I was never born", self-harm, friend at risk |
| imminent | Intent with plan, preparation, farewell, timeframe, or attempt in progress | goodbye note, "tonight", "gave away my books" |

Third-person concern about someone at risk is labelled `high` for safety, as in the plan ("flagged separately").

## Categories

- Hard negatives (label none/low): `hn_idiom`, `hn_idiom_academic`, `hn_lyrics`, `hn_fiction`, `hn_negation`.
- Hard positives: `hp_euphemism` (for example "unalive", "log out of life"), `hp_codemix`, `typo`, plus Devanagari and Hinglish items in every positive label.
- Others: `explicit_ideation`, `passive_ideation`, `self_harm`, `third_person_concern`, `intent_timeframe`, `plan`, `preparation`, `goodbye`, `in_progress`, `hopelessness`, `burden`, `entrapment`, `disappear`, `pain`, `numbness`, `worthlessness`, `exhaustion`, `euphemism`, `academic_stress`, `loneliness`, `homesick`, `comparison`, `family_pressure`, `low_mood`, `routine`, `neutral`.

## Known deviations from the evaluation plan

The plan describes a 300/300 crisis and non-crisis split and a 120 dev / 480 test split. This dataset uses five severity levels, balanced 120 each, and has no dev/test split yet. Add the split, and a second-writer test set, before tuning the lexicon so tuning does not overfit these items.

## Running the evaluations

```
node scripts/eval-keyword.ts    # no network, writes eval/results/keyword.{json,md}
node scripts/eval-llm.ts        # needs ANTHROPIC_API_KEY, 600 API calls
node scripts/eval-hybrid.ts     # needs ANTHROPIC_API_KEY, add --reuse-llm to reuse llm.json
node scripts/eval-report.ts     # writes eval/results/comparison.md
```

Requires Node 22.6+ (type stripping). `npx tsx` is not installed in this repo, so plain `node` runs the `.ts` files.
