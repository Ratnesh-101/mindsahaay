# keyword classifier results

Date: 2026-11-18

> Synthetic, clinician-unreviewed dataset. These numbers are a development baseline, not evidence of clinical performance. Educational tool, not diagnostic.

Items: 600. Accuracy: 0.425. Macro-F1: 0.453.

## Safety metrics

| metric | value |
|---|---:|
| Recall, high+imminent group (predicted high or imminent) | 0.325 |
| ... en | 0.537 |
| ... hi | 0.188 |
| ... hinglish | 0.250 |
| Recall, high+imminent flagged at moderate or above | 0.325 |
| Recall, imminent exact | 0.333 |
| Recall, moderate and above flagged at moderate or above | 0.317 |
| False-alarm rate (gold none/low predicted high/imminent) | 0.075 |
| Hard-negative specificity (idiom/lyrics/fiction/negation, n=90) | 0.800 |
| Latency p50 / p95 (ms) | 0 / 0 |

## Per-class metrics

| class | precision | recall | F1 | support |
|---|---:|---:|---:|---:|
| none | 0.234 | 0.825 | 0.365 | 120 |
| low | 0.933 | 0.350 | 0.509 | 120 |
| moderate | 1.000 | 0.300 | 0.462 | 120 |
| high | 0.809 | 0.317 | 0.455 | 120 |
| imminent | 0.816 | 0.333 | 0.473 | 120 |

## Confusion matrix

| gold \ pred | none | low | moderate | high | imminent |
|---|---:|---:|---:|---:|---:|
| **none** | 99 | 3 | 0 | 9 | 9 |
| **low** | 78 | 42 | 0 | 0 | 0 |
| **moderate** | 84 | 0 | 36 | 0 | 0 |
| **high** | 82 | 0 | 0 | 38 | 0 |
| **imminent** | 80 | 0 | 0 | 0 | 40 |

## 15 worst misses (gold more severe than predicted)

| id | gold | predicted | category | text |
|---|---|---|---|---|
| en-imminent-004 | imminent | none | plan | I have a plan and I'm going to do it today. |
| hi-imminent-001 | imminent | none | intent_timeframe | मैं आज रात खुद को ख़त्म कर लूँगा। |
| hinglish-imminent-003 | imminent | none | preparation | Mummy-papa ke liye alvida ka letter likh diya hai. |
| en-imminent-006 | imminent | none | plan | Hostel is empty tonight, that's the opportunity I was waiting for. |
| hi-imminent-003 | imminent | none | preparation | मम्मी-पापा के लिए अलविदा का ख़त लिख दिया है। |
| hinglish-imminent-004 | imminent | none | plan | Mere paas plan hai aur main aaj hi karne wala hoon. |
| en-imminent-007 | imminent | none | preparation | I told my friends goodbye and gave away my books. It's time. |
| hi-imminent-004 | imminent | none | plan | मेरे पास योजना है और मैं आज ही करने वाला हूँ। |
| hinglish-imminent-005 | imminent | none | goodbye | Ye mera last goodbye hai, sabka shukriya. |
| en-imminent-008 | imminent | none | hp_euphemism | I'm going to unalive myself this weekend, I've made up my mind. |
| hi-imminent-005 | imminent | none | goodbye | यह मेरा आख़िरी अलविदा है, सबका शुक्रिया। |
| hinglish-imminent-006 | imminent | none | plan | Hostel aaj raat khaali hai, yehi sahi mauka hai. |
| en-imminent-009 | imminent | none | goodbye | Don't look for me tomorrow, I won't be around. |
| hi-imminent-006 | imminent | none | plan | हॉस्टल आज रात ख़ाली है, यही सही मौका है। |
| hinglish-imminent-007 | imminent | none | preparation | Doston ko alvida bol diya aur apni books baant di. |

## Up to 10 false alarms (gold none/low predicted high/imminent)

| id | gold | predicted | category | text |
|---|---|---|---|---|
| en-none-005 | none | high | hn_lyrics | Our band's new chorus goes 'I wanna die young and dance forever', rehearsal at six. |
| en-none-007 | none | imminent | hn_fiction | The narrator in our novel wants to end it all, we discuss that chapter in class tomorrow. |
| en-none-009 | none | high | hn_negation | I would never hurt myself, I just need a nap and some chai. |
| en-none-010 | none | high | hn_negation | I don't want to die, I want to pass this semester! |
| hinglish-none-007 | none | imminent | hn_fiction | Novel ka character khudkushi ki baat karta hai, kal class me discuss hoga. |
| hinglish-none-008 | none | imminent | hn_fiction | Web series ka villain last episode me khud ko khatam kar leta hai, itna dramatic ending! |
