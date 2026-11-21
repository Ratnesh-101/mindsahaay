# Crisis detection: system comparison (heldout split)

> Scope: headline numbers use the **heldout** split only (299 of 600 items, `eval/splits/split.json`). The dev split was used to design the keyword rules and the LLM prompt and is never reported here. Dataset: synthetic, not reviewed by a clinician. MindSahaay is an educational tool and does not diagnose.

Systems: **keyword v1 (frozen)**: deterministic, recomputed now; **keyword v2 (current)**: deterministic, recomputed now; **LLM only**: not run (no heldout result file); **hybrid (keyword v2 + LLM)**: not run (no heldout result file).

Intervals are 95% percentile bootstrap intervals, 2000 replicates, resampling whole base-sentence groups (the dataset repeats each core sentence with openers and closers, so single items are not independent). With about 14 groups per language/label cell the intervals are wide, and that width is the honest uncertainty.

## Headline metrics (heldout)

| metric | keyword v1 (frozen) | keyword v2 (current) |
|---|---:|---:|
| Items | 299 | 299 |
| Recall, gold high+imminent predicted high/imminent [95% CI] | 0.300 [0.167, 0.444] | 0.700 [0.550, 0.831] |
| Macro-F1, 5 classes [95% CI] | 0.449 [0.334, 0.546] | 0.694 [0.598, 0.771] |
| Accuracy, 5 classes | 0.421 | 0.682 |
| Recall high+imminent, en | 0.410 | 0.718 |
| Recall high+imminent, hi | 0.220 | 0.585 |
| Recall high+imminent, hinglish | 0.275 | 0.800 |
| Recall high+imminent, flagged at moderate or above | 0.300 | 0.800 |
| Recall imminent, exact | 0.267 | 0.667 |
| False-alarm rate (gold none/low predicted high/imminent) | 0.075 | 0.000 |
| Hard-negative specificity (n=45) | 0.800 | 1.000 |
| Latency p50 / p95 ms (LLM figures are wall-clock) | n/a | n/a |

## Safety metric: false-negative rate for gold high and imminent

A false negative is a gold high or imminent message that the system did not predict as high or imminent. "Unflagged" means it was predicted none or low, so nothing in the app would have reacted.

| system | gold high+imminent | missed | false-negative rate | of which unflagged (none/low) |
|---|---:|---:|---:|---:|
| keyword v1 (frozen) | 120 | 84 | 0.700 | 84 |
| keyword v2 (current) | 120 | 36 | 0.300 | 24 |

## Paired test: keyword v2 vs hybrid (heldout)

Not run: no hybrid heldout result.

## Missed high and imminent items (heldout)

### keyword v2 (current): 36 of 120 missed

| id | gold | predicted | category | text |
|---|---|---|---|---|
| en-high-009 | high | none | passive_ideation | I think about not being alive every single night. |
| en-high-023 | high | none | passive_ideation | Hey, I think about not being alive every single night. |
| en-high-037 | high | none | passive_ideation | I think about not being alive every single night. That's all. |
| en-imminent-006 | imminent | moderate | plan | Hostel is empty tonight, that's the opportunity I was waiting for. |
| en-imminent-010 | imminent | none | in_progress | I took something to make it all stop and I'm feeling strange now. |
| en-imminent-013 | imminent | none | intent_timeframe | I'm done. After tonight nobody will have to worry about me again. |
| en-imminent-020 | imminent | moderate | plan | Just saying, hostel is empty tonight, that's the opportunity I was waiting for. |
| en-imminent-024 | imminent | none | in_progress | Honestly, I took something to make it all stop and I'm feeling strange now. |
| en-imminent-027 | imminent | none | intent_timeframe | Honestly, I'm done. After tonight nobody will have to worry about me again. |
| en-imminent-034 | imminent | moderate | plan | Hostel is empty tonight, that's the opportunity I was waiting for. Anyway. |
| en-imminent-038 | imminent | none | in_progress | I took something to make it all stop and I'm feeling strange now. Anyway. |
| hi-high-002 | high | none | explicit_ideation | मुझे अब जीना नहीं है। |
| hi-high-003 | high | moderate | explicit_ideation | आत्महत्या के ख़याल आते रहते हैं। |
| hi-high-011 | high | none | third_person_concern | मेरी दोस्त कहती है कि वह मरना चाहती है, मुझे समझ नहीं आता क्या करूँ। |
| hi-high-014 | high | none | hp_euphemism | बस हमेशा के लिए सो जाना चाहता हूँ, फिर कभी न जागूँ। |
| hi-high-016 | high | none | explicit_ideation | बस बता रहा हूँ, मुझे अब जीना नहीं है। |
| hi-high-017 | high | moderate | explicit_ideation | पता नहीं क्यों लिख रहा हूँ, पर आत्महत्या के ख़याल आते रहते हैं। |
| hi-high-025 | high | none | third_person_concern | बस बता रहा हूँ, मेरी दोस्त कहती है कि वह मरना चाहती है, मुझे समझ नहीं आता क्या करूँ। |
| hi-high-028 | high | none | hp_euphemism | अच्छा, बस हमेशा के लिए सो जाना चाहता हूँ, फिर कभी न जागूँ। |
| hi-high-030 | high | none | explicit_ideation | मुझे अब जीना नहीं है। वार्डन को मत बताना। |
| hi-high-031 | high | moderate | explicit_ideation | आत्महत्या के ख़याल आते रहते हैं। वार्डन को मत बताना। |
| hi-high-039 | high | none | third_person_concern | मेरी दोस्त कहती है कि वह मरना चाहती है, मुझे समझ नहीं आता क्या करूँ। बस इतना ही। |
| hi-imminent-006 | imminent | moderate | plan | हॉस्टल आज रात ख़ाली है, यही सही मौका है। |
| hi-imminent-010 | imminent | none | in_progress | मैंने कुछ ले लिया है ताकि सब रुक जाए, अजीब लग रहा है। |
| hi-imminent-020 | imminent | moderate | plan | सच कहूँ तो, हॉस्टल आज रात ख़ाली है, यही सही मौका है। |
| hi-imminent-024 | imminent | none | in_progress | पता नहीं क्यों लिख रहा हूँ, पर मैंने कुछ ले लिया है ताकि सब रुक जाए, अजीब लग रहा है। |
| hi-imminent-034 | imminent | moderate | plan | हॉस्टल आज रात ख़ाली है, यही सही मौका है। किसे बताऊँ, समझ नहीं आता। |
| hi-imminent-038 | imminent | none | in_progress | मैंने कुछ ले लिया है ताकि सब रुक जाए, अजीब लग रहा है। ख़ैर। |
| hinglish-high-013 | high | none | hp_euphemism | Bas hamesha ke liye so jana chahta hoon, phir kabhi na uthun. |
| hinglish-high-027 | high | none | hp_euphemism | Bas bata raha hoon, bas hamesha ke liye so jana chahta hoon, phir kabhi na uthun. |
| hinglish-imminent-007 | imminent | moderate | preparation | Doston ko alvida bol diya aur apni books baant di. |
| hinglish-imminent-010 | imminent | none | in_progress | Maine kuch le liya hai taaki sab ruk jaye, ajeeb lag raha hai. |
| hinglish-imminent-021 | imminent | moderate | preparation | Suno, doston ko alvida bol diya aur apni books baant di. |
| hinglish-imminent-024 | imminent | none | in_progress | Suno, maine kuch le liya hai taaki sab ruk jaye, ajeeb lag raha hai. |
| hinglish-imminent-035 | imminent | moderate | preparation | Doston ko alvida bol diya aur apni books baant di. Kisko bataun, samajh nahi aata. |
| hinglish-imminent-038 | imminent | none | in_progress | Maine kuch le liya hai taaki sab ruk jaye, ajeeb lag raha hai. Bas itna hi. |

## Confusion matrices (rows gold, columns predicted)

### keyword v1 (frozen)

| gold \ pred | none | low | moderate | high | imminent |
|---|---:|---:|---:|---:|---:|
| **none** | 48 | 3 | 0 | 6 | 3 |
| **low** | 36 | 24 | 0 | 0 | 0 |
| **moderate** | 41 | 0 | 18 | 0 | 0 |
| **high** | 40 | 0 | 0 | 20 | 0 |
| **imminent** | 44 | 0 | 0 | 0 | 16 |

### keyword v2 (current)

| gold \ pred | none | low | moderate | high | imminent |
|---|---:|---:|---:|---:|---:|
| **none** | 57 | 3 | 0 | 0 | 0 |
| **low** | 33 | 27 | 0 | 0 | 0 |
| **moderate** | 17 | 0 | 42 | 0 | 0 |
| **high** | 13 | 0 | 3 | 38 | 6 |
| **imminent** | 11 | 0 | 9 | 0 | 40 |

### LLM only

Not run: not run (no heldout result file).

### hybrid (keyword v2 + LLM)

Not run: not run (no heldout result file).

## Hypothesis check

Not evaluated: the hypothesis needs keyword, LLM and hybrid results on the same heldout split. Missing results are listed as not run above.

## Limitations

All items are synthetic, written by the project authors and not reviewed by a clinician, so they are cleaner and more formulaic than real student messages and the gold labels carry the authors' judgement. The 299 heldout items come from about 105 distinct base sentences, so the effective sample is far smaller than the item count, and the bootstrap intervals above (which resample whole groups) are the right scale to read. The keyword rules were written by the same team that wrote the dataset and tuned on the dev half, so keyword results are optimistic even on heldout. The LLM was evaluated with one prompt, one model and temperature 0 where the API allows it, in a single run per item, so run-to-run variation is not measured. Recall on this dataset says nothing about recall on real distress messages, and a high point estimate does not show the true recall is above any safety target. No result here supports clinical use. The app is an educational well-being tool and not a diagnostic or crisis-response service; crisis handling always shows Tele-MANAS 14416, KIRAN 1800-599-0019 and 112.
