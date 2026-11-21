# keyword lexicon v2 vs v1 (dev / heldout)

Date: 2026-11-18

> Synthetic, clinician-unreviewed dataset (see eval/dataset/README.md). Educational tool, not diagnostic. Rules were designed by looking at **dev** items only (eval/splits/split.json). **Heldout** is the honest estimate. Both splits are grouped so variants of one core sentence share a split, but the same author wrote the data and the rules' design context, so even heldout is optimistic versus real student text.

| system | split | n | hi+imm recall | en | hi | hinglish | flagged>=moderate | imminent exact | moderate+ recall | false-alarm (none/low->high+) | hard-neg specificity | accuracy | macro-F1 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| v1 | dev | 301 | 0.350 | 0.659 | 0.154 | 0.225 | 0.350 | 0.400 | 0.331 | 0.075 | 0.800 (n=45) | 0.429 | 0.453 |
| v1 | heldout | 299 | 0.300 | 0.410 | 0.220 | 0.275 | 0.300 | 0.267 | 0.302 | 0.075 | 0.800 (n=45) | 0.421 | 0.449 |
| v2 | dev | 301 | 0.975 | 1.000 | 1.000 | 0.925 | 1.000 | 0.950 | 1.000 | 0.000 | 1.000 (n=45) | 0.990 | 0.990 |
| v2 | heldout | 299 | 0.700 | 0.718 | 0.585 | 0.800 | 0.800 | 0.667 | 0.771 | 0.000 | 1.000 (n=45) | 0.682 | 0.694 |

## v1 dev: confusion (rows gold, cols pred: none low moderate high imminent)

none      51	0	0	3	6
low       42	18	0	0	0
moderate  43	0	18	0	0
high      42	0	0	18	0
imminent  36	0	0	0	24

## v1 heldout: confusion (rows gold, cols pred: none low moderate high imminent)

none      48	3	0	6	3
low       36	24	0	0	0
moderate  41	0	18	0	0
high      40	0	0	20	0
imminent  44	0	0	0	16

## v2 dev: confusion (rows gold, cols pred: none low moderate high imminent)

none      60	0	0	0	0
low       0	60	0	0	0
moderate  0	0	61	0	0
high      0	0	0	60	0
imminent  0	0	3	0	57

## v2 heldout: confusion (rows gold, cols pred: none low moderate high imminent)

none      57	3	0	0	0
low       33	27	0	0	0
moderate  17	0	42	0	0
high      13	0	3	38	6
imminent  11	0	9	0	40

## v2 heldout: worst misses (base sentences)

| id | gold | predicted | category | text |
|---|---|---|---|---|
| en-imminent-010 | imminent | none | in_progress | I took something to make it all stop and I'm feeling strange now. |
| hi-imminent-010 | imminent | none | in_progress | मैंने कुछ ले लिया है ताकि सब रुक जाए, अजीब लग रहा है। |
| hinglish-imminent-010 | imminent | none | in_progress | Maine kuch le liya hai taaki sab ruk jaye, ajeeb lag raha hai. |
| en-imminent-013 | imminent | none | intent_timeframe | I'm done. After tonight nobody will have to worry about me again. |
| hi-high-002 | high | none | explicit_ideation | मुझे अब जीना नहीं है। |
| hinglish-high-013 | high | none | hp_euphemism | Bas hamesha ke liye so jana chahta hoon, phir kabhi na uthun. |
| en-high-009 | high | none | passive_ideation | I think about not being alive every single night. |
| hi-high-011 | high | none | third_person_concern | मेरी दोस्त कहती है कि वह मरना चाहती है, मुझे समझ नहीं आता क्या करूँ। |
| hinglish-imminent-007 | imminent | moderate | preparation | Doston ko alvida bol diya aur apni books baant di. |
| en-imminent-006 | imminent | moderate | plan | Hostel is empty tonight, that's the opportunity I was waiting for. |
| hi-high-014 | high | none | hp_euphemism | बस हमेशा के लिए सो जाना चाहता हूँ, फिर कभी न जागूँ। |
| hinglish-moderate-008 | moderate | none | exhaustion | Main apne aap se bahut thak gaya hoon. |
| en-moderate-009 | moderate | none | euphemism | I wish I could just sleep and not deal with anything ever again. |
| hi-imminent-006 | imminent | moderate | plan | हॉस्टल आज रात ख़ाली है, यही सही मौका है। |
| hinglish-moderate-014 | moderate | none | euphemism | Bas so jaun aur kuch feel na karun, yehi chahta hoon. |

## v2 heldout: false alarms (base sentences)

| id | gold | predicted | category | text |
|---|---|---|---|---|


## Reading these numbers honestly

- The headline estimate is the **heldout** row: high+imminent recall 0.700 for v2 (v1: 0.300), with 0 false alarms and hard-negative specificity 1.000 (v1: 0.800). Both specificity figures come from only 45 hard negatives per split, so they are coarse.
- The dev row (0.975) is **not** an estimate of anything. The rules were designed while looking at dev items, so dev recall measures how well the rules were fitted, not how well they generalise. The 0.975 vs 0.700 gap is the overfitting the split was built to expose.
- Heldout recall is below 0.95. **A deterministic lexicon alone cannot reach 0.95 on this kind of text; the LLM layer is required.** The lexicon's role is a fast, auditable safety net with very few false alarms, run alongside the LLM and never as a replacement for it.
- Heldout was evaluated once, after the rules were frozen. No rule was tuned on it. Rules were additionally checked against 68 independent paraphrases written by the rule author (src/domain/risk/lexicon.v2.test.ts), which are also not an unbiased test.
- Caveats from eval/dataset/README.md still apply: synthetic data, one annotator, no clinician review, same author for data and rules. Educational tool, not diagnostic.
- Known limits: no past-tense or conditional handling ("I used to want to die" is still flagged, which is the safe direction), the hostel-empty-plus-opportunity pattern is only graded moderate, and paraphrases outside the rule families are missed.
