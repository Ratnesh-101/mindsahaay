# 33 Chat Persistence, Encrypted Blob Sync & Stories Likes Architecture

**Author:** Wave 3 Architectural Lead & Documentation  
**Date:** 2026-11-27  
**Status:** Implemented & Verified  
**Scope:** `supabase/migrations/0010_chat_and_encrypted_blobs.sql`, `supabase/tests/16_chat_persistence.test.sql`, `supabase/tests/17_encrypted_blobs.test.sql`, `src/features/chat/**`, `src/shared/lib/storage/**`, `src/features/stories/**`, `src/features/modals/StoryDetailModal.tsx`, `supabase/functions/server/**`, `e2e/real/chat-persistence.spec.ts`, `e2e/real/blob-sync.spec.ts`  
**Compliance Standards:** India Digital Personal Data Protection (DPDP) Act 2023, Zero-Knowledge Vault Encryption Architecture

---

## 1. Overview & Owner Decisions

On 2026-11-27, three fundamental architectural decisions were finalized by the project owner:

1. **Chat Conversations ARE Saved:** Chat sessions are persisted client-side encrypted using AES-GCM with keys derived from the user's vault passphrase and a per-session cryptographic salt. A strict 30-day retention window is enforced by database triggers and an automated purge function. Counsellors, moderators, and database operators have zero access to decrypted conversation text.
2. **NO Per-User Story Likes Table:** The system deliberately omits a per-user `post_likes` table, and the read-only like counter is hidden in the "Voices of Courage" UI and story detail modal. **Rationale:** A per-user likes table would create an indelible, server-readable log of sensitive mental-health topics and stories a student engaged with or empathized with. Furthermore, visible popularity counters introduce social media comparison and validation pressure contrary to the non-judgmental, therapeutic aims of the platform.
3. **Encrypted Blob Sync Across Devices:** Sensitive therapeutic state—Cognitive Behavioural Therapy (CBT) behavioural activation activities, worry-time scheduler parameters, and Stanley-Brown safety-card anchors—now synchronizes across a student's devices as encrypted blobs (`encrypted_blobs` table, `put_blob` RPC) with optimistic concurrency conflict resolution where the newer server copy wins.

---

## 2. Chat Persistence Architecture

### 2.1 Cryptographic Key Scheme
Chat encryption utilizes the student's zero-knowledge vault passphrase:
- **Key Derivation:** For each chat conversation session, an independent, non-extractable 256-bit AES-GCM key is derived using PBKDF2 (`deriveEncryptionKey` in `src/domain/crypto/journalCrypto.ts`) with 600,000 SHA-256 iterations, combining the user's vault passphrase and a cryptographically random 16-byte base64 salt (`salt text NOT NULL` on `chat_sessions`).
- **Session Key Caching:** Derived session keys are cached in memory in a module-level `Map<string, Promise<CryptoKey>>` (`src/features/chat/chatCrypto.ts`). When the user locks the vault (`lockVault()`) or signs out (`clearVaultState()`), `clearChatKeys()` purges every cached key from memory.
- **Message Encryption & AAD Binding:** Each message encrypts text using AES-GCM with a fresh 12-byte initialization vector (`iv text NOT NULL`). To prevent message splicing, re-ordering, or cross-session row injection attacks, Additional Authenticated Data (AAD) is bound to every ciphertext:
  $$\text{AAD} = \text{TextEncoder.encode}(\text{sessionId} \parallel "|" \parallel \text{senderRole} \parallel "|" \parallel \text{seq})$$
  Any database-level tampering with session identifiers, sender roles, or message sequence indices invalidates GCM authentication tag verification and causes decryption to fail loudly.

### 2.2 Database Schema & Row Level Security (RLS)
Migration `0010_chat_and_encrypted_blobs.sql` updates `chat_sessions` and `chat_messages`:

```sql
-- chat_sessions enhancements
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS salt text NOT NULL DEFAULT encode(gen_random_bytes(16), 'base64'),
  ADD COLUMN IF NOT EXISTS key_version smallint NOT NULL DEFAULT 1,
  ADD CONSTRAINT chat_sessions_title_check CHECK (title = 'Well-being Chat'),
  ADD CONSTRAINT chat_sessions_retention_ttl_days_check CHECK (retention_ttl_days = 30);
ALTER TABLE public.chat_sessions DROP COLUMN IF EXISTS risk_level;

-- chat_messages enhancements
ALTER TABLE public.chat_messages
  ALTER COLUMN iv SET NOT NULL,
  ADD COLUMN IF NOT EXISTS seq int NOT NULL,
  ADD CONSTRAINT chat_messages_session_id_seq_key UNIQUE (session_id, seq),
  ADD CONSTRAINT chat_messages_sender_role_check CHECK (sender_role IN ('user', 'assistant'));
ALTER TABLE public.chat_messages DROP COLUMN IF EXISTS risk_level;
```

**Row Level Security:**
- `chat_sessions`: Authenticated students can `SELECT`, `INSERT`, `UPDATE`, and `DELETE` strictly where `user_id = auth.uid()`.
- `chat_messages`: Access is restricted strictly to messages belonging to sessions owned by `auth.uid()`.
- **Retention Filtering:** The `SELECT` policy on `chat_messages` enforces `retention_expires_at > now()`, hiding expired messages immediately even prior to physical disk purge.
- **Zero Access by Staff:** Counsellors, moderators, and institution administrators have no policies granting access to `chat_sessions` or `chat_messages`.

### 2.3 Retention Triggers & Purge Mechanism
- **Server-Enforced Timestamps:** The `trg_chat_messages_force_dates` trigger on `BEFORE INSERT` overrides any client timestamps, setting `created_at := now()` and `retention_expires_at := now() + interval '30 days'`.
- **Automated Purge Function:** `public.purge_expired_chat_messages() RETURNS integer` runs with `SECURITY DEFINER` (search_path pinned to `public, pg_temp` and permissions granted only to `service_role`). It deletes all messages where `retention_expires_at < now() OR created_at < (now() - interval '30 days')` and subsequently removes empty sessions older than 30 days.

### 2.4 Client API & UI Behaviour
The client interface is implemented in `src/features/chat/history.ts`:
- `canSaveChats(): boolean`: Returns true only when the vault is unlocked and the session is not in preview/demo mode.
- `listSessions(): Promise<SavedSession[]>`: Lists session UUIDs, creation timestamps, and message counts without requiring decryption. Works while vault is locked.
- `createSession(): Promise<string>`: Initializes a session row with a fresh random salt; throws `ChatLockedError` if locked.
- `loadSession(id: string): Promise<SavedMessage[]>`: Decrypts all messages in sequence using the cached or derived session key; throws `ChatLockedError` if locked.
- `saveMessage(sessionId, seq, role, text): Promise<void>`: Encrypts and writes a single message turn; throws on any network or database failure (never swallowed).
- `deleteSession(id: string): Promise<void>` / `deleteAllSessions(): Promise<number>`: Deletes individual conversations or wipes all past history with explicit confirmation.

**UI State & Transitions:**
- **Unlocked Vault:** Chat persistence is active by default. A per-conversation toggle ("Don't save this conversation" / `dontSaveToggle`) allows students to conduct ephemeral conversations without saving.
- **Locked Vault / Vault Not Created:** Chat remains fully functional in an ephemeral state. A prominent banner informs the user: *"Unlock your vault to save and see past conversations. This conversation is not being saved."* Unlocking mid-conversation retroactively saves turns from that point forward.
- **Lock Event:** Calling `lockVault()` immediately purges cached decryption keys and unmounts/clears the on-screen decrypted transcript.
- **Failed Save:** If network or backend failure occurs during a save, the message is retained in memory marked *"Not saved yet"* (`notSavedYet`) and retried automatically on the subsequent turn.
- **Notice Text:** The UI explicitly states: *"Saved for 30 days, encrypted with your vault passphrase. MindSahaay staff and counsellors cannot read it. Each message is still sent to our AI provider to write a reply."*
- **Offline & Preview Mode:** Offline mode prevents new conversational turns (since AI streaming requires server connectivity); crisis detection operates offline via the keyword lexicon. Preview mode never persists conversations.

---

## 3. Synced Encrypted Blobs (CBT, Worry Time & Safety Card)

### 3.1 Design & Slot Architecture
To allow students to use multiple devices (e.g. laptop and phone) without storing plaintext on servers, sensitive anchors sync as encrypted blobs:
- **Table `public.encrypted_blobs`:**
  - `user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE`
  - `slot text NOT NULL`: Whitelisted to opaque, non-revealing hex identifiers:
    - `'mindsahaay_sec_0f9a2b8e3d1c4a7e'` : Behavioral activation (`cbt_activities`)
    - `'mindsahaay_sec_4c8b1a7d2e9f0a3b'` : Worry-time scheduler (`cbt_worry`)
    - `'mindsahaay_sec_7e1d4a9b2c8f0e3a'` : Safety-card anchors & trusted contact (`safety_card`)
  - `ciphertext text NOT NULL, iv text NOT NULL, salt text NOT NULL`
  - `version integer NOT NULL DEFAULT 1`
  - `updated_at timestamptz NOT NULL DEFAULT now()`
  - Primary Key: `(user_id, slot)`
- **RLS:** Strict owner isolation (`user_id = auth.uid()`). No access for counsellors or moderators.

### 3.2 Atomic Version RPC: `put_blob`
Blob writes are executed through `public.put_blob`:
```sql
CREATE OR REPLACE FUNCTION public.put_blob(
  p_slot text,
  p_ciphertext text,
  p_iv text,
  p_salt text,
  p_expected_version integer
) RETURNS integer;
```
- **Concurrency Control:** Performs `SELECT version FROM encrypted_blobs WHERE user_id = auth.uid() AND slot = p_slot FOR UPDATE`.
- **Conflict Handling:**
  - If `p_expected_version = 0` and a row exists, raises exception `'VERSION_CONFLICT'`.
  - If `p_expected_version > 0` and current version $\neq$ `p_expected_version`, raises `'VERSION_CONFLICT'`.
  - Otherwise, updates or inserts the record and returns the incremented `v_new_version`.

### 3.3 Client Sync Protocol (`remoteSync.ts` & `secureStore.ts`)
1. **Local-First Write:** Every save writes to local encrypted storage (`secureStore`) first.
2. **Immediate Push:** The identical ciphertext, IV, and salt are pushed to the backend via `put_blob`.
3. **Dirty Queue:** If a push fails due to network outage, server unavailability, or locked state, the slot is recorded in `mindsahaay_sync_meta` dirty list. The dirty metadata contains **only** opaque slot IDs and version numbers; no plaintext or ciphertext is placed in the metadata.
4. **Retry on Unlock / Online:** When the vault is unlocked or connectivity is restored, dirty slots are re-pushed.
5. **Conflict Resolution (Server Wins):** If `put_blob` returns `VERSION_CONFLICT` or a newer version exists on the server during pull, the remote copy replaces the local store, and the UI displays a notification: *"Another device has a newer copy that replaced this device's copy"* (`cbt.sync.conflict`).
6. **Sign-Out & Erasure:** Sign-out wipes local decrypted caches while leaving encrypted server blobs intact for multi-device recovery. Account erasure cascades through foreign key `ON DELETE CASCADE`, destroying both local and remote blobs permanently.

---

## 4. Stories Likes Decision

The platform intentionally omits a per-user `post_likes` table.
- **Privacy Protection:** In a student mental health setting, recording which peer stories a user "liked" would create a sensitive history of personal mental health struggles, vulnerabilities, and shared peer trauma.
- **Wellbeing Safeguard:** Displaying like counters fosters unhealthy comparison and social pressure.
- **UI Modification:** The like button was removed from the "Voices of Courage" feed (`CampusStories.tsx`), and the read-only count was removed from `StoryDetailModal.tsx`. The underlying schema column `posts.likes_count` is retained for backwards compatibility but not populated or displayed.

---

## 5. DPDP Data Export Integration

In compliance with DPDP Act Section 11 portability requirements, the export endpoint (`/me/export` and `/students/:id/export` in `supabase/functions/server/app.ts`) includes:
- `chatSessions`: Array of session metadata (`id`, `title`, `salt`, `key_version`, `created_at`).
- `chatMessages`: Array of encrypted messages (`session_id`, `sender_role`, `encrypted_content`, `iv`, `seq`, `created_at`).
- `encryptedBlobs`: Array of encrypted sync slots (`slot`, `ciphertext`, `iv`, `salt`, `version`, `updated_at`).

All exported chat and blob data consists solely of encrypted ciphertexts; no plaintext is exposed or decrypted on the server.

---

## 6. Verification & Test Evidence

The implementation is verified across unit, integration, database, and real-backend browser test suites:

| Test Suite | File / Scope | Tests Passed | Validated Behaviour |
|---|---|---|---|
| **pgTAP** | `supabase/tests/16_chat_persistence.test.sql` | 25 | Chat salt, title constraint, 30-day retention TTL, message sequence uniqueness, AAD binding, BEFORE INSERT date triggers, owner RLS, `purge_expired_chat_messages` |
| **pgTAP** | `supabase/tests/17_encrypted_blobs.test.sql` | 22 | Encrypted blob table, slot whitelist constraint, owner RLS, `put_blob` atomic versioning & conflict checks |
| **Vitest** | `src/features/chat/history.test.ts` | 8 | Session creation, message saving, load/list, deletion, locked errors |
| **Vitest** | `src/features/chat/chatCrypto.test.ts` | 6 | Key derivation, AES-GCM encryption, AAD validation, key cache clearing |
| **Vitest** | `src/features/chat/ChatPersistence.test.tsx` | 8 | UI toggle, locked banner, history modal, clear conversation confirm |
| **Vitest** | `src/features/chat/ChatHistoryIntegration.test.tsx` | 5 | End-to-end component encryption, save on unlock, session list |
| **Vitest** | `src/shared/lib/storage/remoteSync.test.ts` | 9 | Dirty queue, `put_blob` sync, conflict detection, pull updates |
| **Vitest** | `src/features/cbt/SyncUi.test.tsx` | 4 | UI sync badge, conflict banner display and dismissal |
| **Playwright Real** | `e2e/real/chat-persistence.spec.ts` | 9 | Real-browser session save, ciphertext verification, lock transcript clearing, delete |
| **Playwright Real** | `e2e/real/blob-sync.spec.ts` | 3 | Real-browser blob push via `put_blob`, cross-tab conflict resolution |

---

## 7. Known Limitations & Residual Risks

1. **Lost Passphrase Means Lost Chat History:** Because chat decryption relies on the client vault passphrase, losing the passphrase permanently prevents decryption of saved chats. There is zero server-side recovery.
2. **Metadata Visibility to Database Operator:** While message content is encrypted, session metadata (creation time, message count, message sequence, ciphertext length, and timestamps) remains visible to database administrators.
3. **In-Flight AI Provider Processing:** During an active chat, message text is sent in plaintext over TLS to the external AI provider (Anthropic Claude API) to generate replies. Persistence protects rest storage, not processing transit.
4. **Passphrase Changes Require Re-encryption:** If a student changes their vault passphrase, past chat sessions and encrypted blobs would require complete re-encryption. This re-encryption workflow is currently not implemented; changing passphrase would invalidate access to previous sessions.
5. **Partial Browser Test Coverage of Slots:** Only the `cbt_activities` slot is exercised in end-to-end browser tests (`blob-sync.spec.ts`). The `cbt_worry` and `safety_card` slots are validated through unit tests and database allowlist assertions.
6. **VERSION_CONFLICT UI Path:** Conflict detection logic is covered in unit tests; triggering and resolving conflicting writes simultaneously from two live browser contexts has not been tested end-to-end in automated Playwright.
7. **Unverified Live Anthropic Chat Stream:** The edge function streaming route has been tested with simulated and mock tokens; it has not been executed against a live Anthropic API key in production.
