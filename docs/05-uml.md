# 05 UML Models

Updated 2026-11-19 to use the module, table and function names that exist in the repository, and on 2026-11-20 with the Crisis Follow-Through Loop and Lifeline Offline (sections 8 to 10; use cases 14 to 16; the `Outbox` and `RiskQueueApi` classes). No diagram has been rendered by a tool; each was checked by reading the Mermaid syntax. Where the code differs from the original design, the text says so.

## 1. Use-case diagram

```mermaid
flowchart LR
  student(["Student"])
  counsellor(["Counsellor"])
  moderator(["Moderator"])
  admin(["Institution admin"])
  claude(["Claude API"])

  subgraph MindSahaay
    uc1(["Log mood"])
    uc2(["Take PHQ-4, PHQ-9 or GAD-7"])
    uc3(["Write encrypted journal"])
    uc4(["Chat with AI companion"])
    uc5(["Book appointment"])
    uc6(["Join circles and post"])
    uc7(["Export or erase data"])
    uc8(["Manage consent ledger"])
    uc9(["Show crisis card and helplines"])
    uc10(["Review appointments and consented context"])
    uc11(["Moderate posts and reports"])
    uc12(["View k-anonymous aggregates"])
    uc13(["Edit safety plan"])
    uc14(["Work the risk-event queue and advance follow-up steps"])
    uc15(["Answer a check-back"])
    uc16(["Queue mood and crisis events while offline"])
  end

  student --- uc1 & uc2 & uc3 & uc4 & uc5 & uc6 & uc7 & uc8 & uc13 & uc15 & uc16
  counsellor --- uc10 & uc14
  moderator --- uc11
  admin --- uc12
  uc4 --- claude
  uc1 -. include .-> uc9
  uc2 -. include .-> uc9
  uc3 -. include .-> uc9
  uc4 -. include .-> uc9
```

Crisis checking is an `include` of every free-text use case. The admin use case exposes aggregates only, through views with a minimum group size of 10. Implementation status of the counsellor, moderator and admin screens is in 02-srs.md (the routed pages are still static mock pages in demo mode; the risk-event queue, use case 14, is API-backed and was checked by hand with a real counsellor session on a local Supabase).

## 2. Class diagram (domain modules and services)

Names match `src/domain`, `src/shared/lib/api` and `supabase/functions/server`. Methods are the exported functions, shown as operations.

```mermaid
classDiagram
  class Phq9 {
    +scorePHQ9(answers) Phq9Result
    +item9Flag bool
    +requiresCrisisProtocol bool
  }
  class Phq4 {
    +scorePHQ4(answers) Phq4Result
  }
  class Gad7 {
    +scoreGAD7(answers) Gad7Result
  }
  class Lexicon {
    +detectRisk(text) RiskResult
  }
  class RiskRouting {
    +routeRisk(input) RoutingDecision
    +routeDetectedRisk(result) RoutingDecision
    +MANDATORY_HELPLINES
  }
  class JournalCrypto {
    +encryptJournal(text, passphrase) Payload
    +decryptJournal(payload, passphrase) string
    +generateRecoveryCode() string
    +validateRecoveryCode(code) bool
  }
  class Vault {
    +getVaultPassphrase() string
    +lockVault()
    +VAULT_SENTINEL
  }
  class ApiClient {
    +submitAssessment()
    +addMood()
    +saveJournal()
    +streamChat()
    +grantConsent()
    +revokeConsent()
    +exportStudentData()
    +deleteStudentAccount()
  }
  class DoctorsApi {
    +fetchCounsellors()
    +fetchSlots()
    +bookAppointment()
    +cancelAppointment()
    +requestVideoToken()
  }
  class CommunityApi {
    +fetchCircles()
    +submitPost()
    +reportPost()
    +fetchModerationQueue()
    +decideQueueItem()
  }
  class Outbox {
    +enqueueRiskEvent(row) string
    +enqueueMood(row) string
    +flushOutbox(userId) FlushResult
    +hasUnsynced(userId) number
    +resolveUnsyncedOnLogout(userId, choice)
    +purgeExpired(userId, maxAgeDays) number
  }
  class RiskQueueApi {
    +fetchRiskQueue()
    +advanceFollowup()
    +runOverdueEscalation()
  }
  class EdgeFunction {
    +JWT verification
    +CORS from ALLOWED_ORIGINS
  }
  class ClaudeModule {
    +streamMindMateCompanion()
    +classifyRiskLevel()
    +checkOutputGuard()
  }
  class RateLimiter {
    +check_rate_limit()
  }
  class Postgres {
    +book_appointment_atomic()
    +get_institution_wellbeing_summary()
    +purge_expired_chat_messages()
    +advance_risk_followup()
    +escalate_overdue_risk()
  }

  Phq9 ..> Lexicon : separate paths
  RiskRouting ..> Phq9 : item 9 rule
  RiskRouting ..> Lexicon : risk level
  Vault ..> JournalCrypto
  ApiClient ..> Vault : passphrase for journal
  ApiClient ..> Outbox : offline mood and crisis writes
  Outbox ..> Vault : key for encryption
  Outbox ..> Postgres : insert under RLS after reconnection
  RiskQueueApi ..> Postgres : RPC and view
  ApiClient ..> EdgeFunction : HTTPS
  DoctorsApi ..> EdgeFunction
  CommunityApi ..> EdgeFunction
  EdgeFunction ..> ClaudeModule
  EdgeFunction ..> RateLimiter
  EdgeFunction ..> Postgres
  RateLimiter ..> Postgres
```

Operation names were checked against the exported names in `src/domain` (`scorePHQ9`, `scorePHQ4`, `scoreGAD7`, `detectRisk`, `routeRisk`, `routeDetectedRisk`, `encryptJournal`, `decryptJournal`, `generateRecoveryCode`, `validateRecoveryCode`). Parameter and result types in the diagram are simplified and not copied from the signatures.

The persistent entities (profiles, consents, mood_entries, assessments, journal_entries, appointments, posts and so on) are in 04-erd.md.

## 3. Sequence: chat with crisis handling

```mermaid
sequenceDiagram
  actor S as Student
  participant UI as Chat.tsx
  participant LX as domain/risk/lexicon
  participant EF as Edge Function POST /chat/stream
  participant RL as check_rate_limit
  participant CM as claude.ts
  participant C as Claude API

  S->>UI: types message
  UI->>LX: detectRisk(text)
  alt high or imminent on client
    LX-->>UI: risk level
    UI-->>S: CrisisCard with 14416, 1800-599-0019, 112
  end
  UI->>EF: stream request (Bearer JWT, message)
  EF->>EF: verify JWT, validate message length
  EF->>RL: check_rate_limit(user)
  alt over limit
    RL-->>EF: denied
    EF-->>UI: 429
  else allowed
    EF->>CM: lexicon pre-screen, PII redaction, classifyRiskLevel
    alt crisis detected
      CM-->>EF: crisis, safe fallback text
      EF-->>UI: crisis response with helplines
    else not crisis
      CM->>C: stream(frozen system prompt, redacted text)
      C-->>CM: tokens
      CM->>CM: checkOutputGuard(full text)
      CM-->>EF: tokens or safe fallback
      EF-->>UI: SSE stream
      UI-->>S: reply labelled as AI
    end
  end
  opt network or model failure
    UI-->>S: degraded mode message and helpline links
  end
```

Differences from the earlier design: the output guard runs on the completed text, so a violation replaces the reply after streaming (TODO: confirm how the UI handles this); `risk_events` logging goes through `logChatCrisisEvent` in `features/chat/api.ts`.

## 4. Sequence: booking

```mermaid
sequenceDiagram
  actor S as Student
  participant UI as Doctors.tsx
  participant EF as Edge Function POST /appointments
  participant DB as book_appointment_atomic
  actor D as Counsellor

  S->>UI: choose counsellor and slot
  UI->>EF: book (slot id, note, Bearer JWT)
  EF->>DB: call function
  DB->>DB: SELECT slot FOR UPDATE
  alt slot free
    DB->>DB: set is_booked, insert appointment
    DB-->>EF: appointment
    EF-->>UI: 201 appointment
    UI-->>S: BookingConfirmationModal
    S->>UI: join video session
    UI->>EF: POST /appointments/id/video-token
    EF-->>UI: Daily.co token
  else slot taken
    DB-->>EF: error
    EF-->>UI: conflict
    UI-->>S: choose another slot
  end
  Note over D: Counsellor sees the booking in the Counsellor workspace
```

Not implemented from the original: a "requested" state and counsellor confirmation step. Appointments are created directly; the enum default is `confirmed`.

## 5. Sequence: screening (PHQ-9)

```mermaid
sequenceDiagram
  actor S as Student
  participant UI as Assessment.tsx
  participant SC as domain/scoring/phq9
  participant API as submitAssessment
  participant DB as assessments table

  UI-->>S: educational notice, not a diagnosis
  S->>UI: answers 9 items
  UI->>SC: score answers
  SC->>SC: total, band, item9 = answers[8]
  alt item 9 greater than 0
    SC-->>UI: item9Flag and requiresCrisisProtocol
    UI-->>S: crisis card first, then result
  end
  UI->>API: submit (answers)
  API->>DB: insert own row
  DB->>DB: trigger creates one risk_event when item9_flag (single source of truth)
  UI-->>S: band, suggestions, educational notice repeated
```

## 6. Sequence: journal vault and recovery

```mermaid
sequenceDiagram
  actor S as Student
  participant VG as VaultGate.tsx
  participant V as vault.ts
  participant JC as journalCrypto
  participant AU as Supabase Auth metadata
  participant J as Journal.tsx
  participant DB as journal_entries

  S->>VG: choose passphrase (first use)
  VG->>V: create vault
  V->>JC: encrypt sentinel with passphrase (check)
  V->>JC: generateRecoveryCode, encrypt passphrase with code (recovery)
  V->>AU: store check and recovery blobs
  V-->>S: show recovery code once
  S->>J: write entry
  J->>JC: encryptJournal(text, passphrase)
  J->>DB: insert ciphertext, iv, salt
  Note over S,V: Later session, vault locked
  S->>VG: enter passphrase
  VG->>V: decrypt check blob
  alt correct
    V-->>J: unlock, passphrase kept in memory
  else wrong
    V-->>VG: error, stay locked
    S->>VG: enter recovery code instead
    VG->>V: decrypt recovery blob, set new passphrase
  end
```

The exact first-use and reset steps in `VaultGate.tsx` were not read line by line. TODO: verify the diagram against the component before quoting it.

## 7. Appointment state machine

```mermaid
stateDiagram-v2
  [*] --> Scheduled : booked
  Scheduled --> Confirmed : confirmed
  Scheduled --> Cancelled : cancelled
  Confirmed --> Cancelled : cancelled at least 2 h before
  Confirmed --> Completed : session done
  Completed --> [*]
  Cancelled --> [*]
```

This matches the `appointment_status` enum (scheduled, confirmed, completed, cancelled). The table default is `confirmed`, so in practice rows may start in Confirmed. The earlier states Requested, Rescheduled and NoShow are not implemented. TODO: confirm with counsellors whether they are needed.

## 8. State machine: follow-up of a risk event

Source: `supabase/migrations/0005_crisis_followup.sql` (trigger `validate_risk_followup_transition`) and `0006_handoff_and_optout.sql` (the accept-handoff path). The same diagram appears in 24-crisis-followup.md. The independent review (28-new-features-security-review.md, G6-SEC-01, Critical) found that the overdue job did not escalate a reopened event a second time; migration 0007 fixed it (idempotency is per follow-up cycle) and pgTAP 12 passes.

```mermaid
stateDiagram-v2
    [*] --> open: high or crisis event inserted
    open --> acknowledged: counsellor acknowledges
    acknowledged --> contacted: counsellor marks contacted
    contacted --> handed_off: counsellor hands off, or student accepts a handoff offer (0006)
    handed_off --> closed: counsellor closes with a reason
    acknowledged --> open: student answers want_to_talk
    contacted --> open: student answers want_to_talk
    handed_off --> open: student answers want_to_talk
    closed --> [*]
```

A step can only move forward by exactly one. Going back to `open` happens only through the check-back trigger. A "want to talk" answer on an event that is already `open` appends another `open` row (not drawn). A closed event cannot be reopened or advanced. A student answer can never close or lower an event.

## 9. Sequence: follow-up loop and check-back

```mermaid
sequenceDiagram
  actor S as Student
  participant FC as FollowUpCard.tsx
  participant DB as Postgres with RLS and triggers
  participant RQ as RiskQueue.tsx
  actor C as Counsellor

  S->>DB: risk event, crisis or high, no message text
  DB->>DB: trigger writes step open, created_at is now()
  DB-->>RQ: Realtime change on risk_events (migration 0008), the queue refetches
  C->>RQ: opens the queue
  RQ->>DB: escalate_overdue_risk()
  RQ->>DB: read view risk_queue
  DB-->>RQ: events of students who shared risk_events
  C->>RQ: Acknowledge
  RQ->>DB: advance_risk_followup(event, acknowledged)
  DB->>DB: check care share and legal next step, write audit_log
  DB->>DB: create check-back prompts h24 and h72
  Note over DB: later steps are contacted, handed_off, then closed with a reason
  S->>FC: opens the Dashboard after 24 hours
  FC->>DB: read own steps and prompts
  DB-->>FC: status and the due prompt
  S->>FC: answers I want to talk
  FC->>DB: insert risk_checkbacks, want_to_talk
  DB->>DB: reopen the event to open, notify counsellors who hold a share
  DB-->>RQ: reopened event and notification
  alt still open after 4 hours for crisis or 12 hours for high
    DB->>DB: escalate_overdue_risk notifies counsellors, then the backup after 2 more hours
  end
```

Nobody is paged. The notifications appear only when a counsellor signs in (24-crisis-followup.md section 6, L29).

## 10. Sequence: crisis event queued offline, then sent

```mermaid
sequenceDiagram
  actor S as Student
  participant CH as Chat.tsx
  participant LX as domain/risk/lexicon
  participant API as logChatCrisisEvent
  participant OB as outbox.ts
  participant IDB as IndexedDB
  participant SB as supabase-js
  participant DB as risk_events

  Note over S,DB: the device is offline
  S->>CH: types a message
  CH->>LX: detectRisk(text)
  LX-->>CH: high or imminent
  CH-->>S: crisis card with 14416, 1800-599-0019, 112 at once
  CH->>API: logChatCrisisEvent()
  API->>API: read the crisis-consent cache
  alt consent cached and vault unlocked
    API->>OB: enqueueRiskEvent with layer, detected_at, offline
    OB->>OB: encrypt with the vault key
    OB->>IDB: store the encrypted item
  else no consent cache or vault locked
    API-->>CH: not queued, the crisis card is still shown
  end
  Note over S,DB: the device is back online
  OB->>OB: flush on app start, online event or Sync now
  OB->>SB: fetch active consents
  alt crisis_intervention consent withdrawn
    OB->>IDB: delete the item, nothing is sent
  else consent present
    OB->>OB: decrypt and drop created_at
    OB->>SB: upsert risk_events by client UUID, ignore duplicates
    SB->>DB: insert, trigger sets created_at to now()
    DB->>DB: trigger writes step open
    OB->>IDB: delete the item after success
  end
```

Risk events are sent before mood entries. If sending fails the item stays with exponential backoff, and it is deleted after 7 days. Nobody is alerted until this flush succeeds (L38).

## 11. Sequence: warm handoff offer (migration 0006)

```mermaid
sequenceDiagram
  actor C as Counsellor
  participant RQ as RiskQueue.tsx
  participant DB as Postgres RPCs
  participant FC as FollowUpCard.tsx
  actor S as Student

  C->>RQ: chooses Offer a session on a queue row
  RQ->>DB: offer_handoff_slot(event, slot, note)
  DB->>DB: check care share, own future unbooked slot, no pending offer
  DB->>DB: notification handoff_offer with slot time and alias, audit_log row
  S->>FC: opens the Dashboard
  FC->>DB: read notifications
  DB-->>FC: the offer, valid for 24 hours
  alt student accepts
    S->>FC: Accept this session
    FC->>DB: accept_handoff_offer(notification)
    DB->>DB: book_appointment_atomic, mark accepted
    opt follow-up step is contacted
      DB->>DB: append step handed_off
    end
  else student declines
    S->>FC: Not now
    FC->>DB: decline_handoff_offer(notification)
  end
```

Accepting twice books once. If the follow-up is still at `open` or `acknowledged` the session is booked but the step is not forced forward. The offer is an in-app notification only: nobody phones or messages the student (L43, L29).
