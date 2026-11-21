# MindSahaay Supabase Backend & Edge Architecture

A privacy-first, legally compliant mental health backend designed for Indian Higher Educational Institutions (HEIs). Operates under the **India Digital Personal Data Protection (DPDP) Act 2023**, the **Mental Healthcare Act 2017**, and the **UGC Guidelines on Student Well-being**.

---

## 1. Architecture Overview

```
                      +-----------------------------+
                      |  React 19 + Vite Frontend   |
                      +--------------+--------------+
                                     |
                         HTTPS / WSS with Bearer JWT
                                     |
                                     v
                  +-----------------------------------+
                  |  Hono + Deno Edge Functions       |
                  |  (Identity strictly from JWT)     |
                  +-----+-----------------------+-----+
                        |                       |
       Anthropic Claude Opus 5.5 Pipeline       | Supabase Client (RLS Enforced)
                        |                       |
      +-----------------+---------------+       v
      | 1. Deterministic Lexicon Check  |  +-----------------------------+
      | 2. PII Redaction                |  | PostgreSQL Database         |
      | 3. Structured Risk Classifier   |  | - 21 RLS-Secured Tables     |
      | 4. Frozen System Prompt         |  | - Immutable Audit Log       |
      | 5. Output Guard & Safe Fallback |  | - Zero-Knowledge Data       |
      +---------------------------------+  |   (Journals & Thought Recs) |
                                           | - Postgres Token Bucket RL  |
                                           | - k-Anonymity Views (k>=10) |
                                           | - Atomic Booking (FOR UPDATE|
                                           | - pg_cron Auto Retention TTL|
                                           +-----------------------------+
```

---

## 2. Environment Variables

Configure these variables in your Supabase project dashboard or local `.env`:

| Variable | Description | Required | Default / Example |
|---|---|---|---|
| `SUPABASE_URL` | Supabase project API URL | Yes | `https://xyz.supabase.co` |
| `SUPABASE_ANON_KEY` | Public anonymous API key (for RLS-scoped calls) | Yes | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin/audit operations | Yes | `eyJhbGciOi...` |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key for AI Companion | Yes | `sk-ant-api03-...` |
| `DAILY_API_KEY` | Daily.co API key for tele-consultation video rooms | Yes | `da_...` (or fallback mock) |
| `ALLOWED_ORIGINS` | Comma-delimited list of permitted CORS origins | Yes | `http://localhost:5173,http://localhost:8443,https://mindsahaay.org` |
| `FUNCTION_SLUG` | Edge function mounting slug (defaults to folder name `server`) | Optional | `server` |
| `PORT` | Edge runtime port (local dev) | Optional | `54321` / `8443` |

---

## 3. Database Migrations

### `migrations/0001_core.sql`
Defines 15 core tables with comprehensive Row Level Security (RLS) on every table:
1. `institutions`: HEI details, domains, emergency contacts.
2. `profiles`: `id = auth.users.id`, user roles (`student`, `counsellor`, `moderator`, `institution_admin`, `super_admin`), anonymous alias, locale.
3. `consents`: Append-only immutable ledger of student consent grants under DPDP Act 2023.
4. `mood_entries`: Check-ins and ecological momentary assessments.
5. `assessments`: Standardized mental health screenings (`phq4`, `phq9`, `gad7`) with `item9_flag`.
6. `journal_entries`: **Strict Zero-Knowledge**: stores `ciphertext`, `iv`, `salt` ONLY. Plaintext never touches the server.
7. `safety_plans`: Stanley-Brown Suicide Safety Planning intervention.
8. `risk_events`: Crisis escalations and audit tracking.
9. `counsellors`: Verified campus psychologists, RCI license numbers, specializations.
10. `availability_slots`: Counsellor booking slots with PostgreSQL `btree_gist` **exclusion constraint against overlapping slots**.
11. `appointments`: Tele-consultation sessions with unique video room links.
12. `session_notes`: Encrypted clinical consultation notes.
13. `care_shares`: Time-bound, revocable delegation of health data from student to counsellor.
14. `notifications`: In-app safety and appointment notifications.
15. `audit_log`: Append-only compliance ledger tracking all critical data actions.

### `migrations/0002_triggers.sql`
- **Auto-Profile Creation**: Automatically initializes anonymous profile on `auth.users` signup.
- **Append-Only Protection**: Database-level triggers preventing any `UPDATE` or `DELETE` on `consents` and `audit_log`.
- **Automatic Crisis Escalation**: Trigger on `assessments` that immediately creates a `risk_event` when `item9_flag = true`.
- **k-Anonymity Aggregates ($k \ge 10$)**:
  - `institution_assessment_aggregates`
  - `institution_mood_aggregates`
  - `institution_risk_aggregates`
  - All cohort views strictly enforce `HAVING count(*) >= 10`. Any group with fewer than 10 participants is completely suppressed to prevent deanonymization.

### `migrations/0003_rate_limit.sql`
- **Postgres Token-Bucket Rate Limiter**: Replaces fragile in-memory maps with a persistent, distributed rate-limiting table (`public.rate_limits`).
- **Atomic `check_rate_limit` Stored Procedure**: `SECURITY DEFINER` function with `SET search_path = public, pg_temp` and `SELECT ... FOR UPDATE` row-level locking.
- **Strict Default Deny RLS**: Direct client table access is revoked (`REVOKE ALL FROM PUBLIC, anon, authenticated`). Only the definer procedure and service role access the bucket state.
- **Stale Record Housekeeping**: `cleanup_stale_rate_limits()` function to prune records older than 24 hours.

### `migrations/0004_community_booking.sql`
- **Peer Circles & Memberships**: `circles` and `circle_members` for safe institutional and cross-campus peer support communities.
- **Moderated Content**: `posts` and `comments` with `moderation_status` enum (`pending`, `approved`, `flagged`, `rejected`) and `ai_moderation` JSONB audit.
- **Moderation Reports**: `reports` table for reporting problematic content with role-based moderator triage.
- **Zero-Knowledge CBT Thought Records**: `thought_records` storing client-side encrypted situation, automatic thoughts, distortions, and rational reframing (`ciphertext`, `iv`, `salt`). Shielded from counsellors and institution admins.
- **Encrypted Chat Sessions & Messages**: `chat_sessions` and `chat_messages` with `risk_level` classification, encrypted payloads, and `retention_expires_at` (default 30 days).
- **Atomic Slot Booking**: `public.book_appointment_atomic()` stored procedure using `SELECT ... FOR UPDATE` locking on `availability_slots` to eliminate concurrent race condition double-bookings.
- **Retention TTL Cleanup Job**: Automated message purge function `purge_expired_chat_messages()` registered with `pg_cron` (daily at 03:00 UTC).

---

## 4. Edge Function API Endpoints

The main Edge Function code lives in `supabase/functions/server` and is served at:
- **Production Base URL**: `https://<projectId>.supabase.co/functions/v1/server`
- **Local Development URL**: `http://localhost:54321/functions/v1/server`
- **Frontend Configuration**: Defined by `VITE_FUNCTIONS_SLUG` (defaults to `"server"`)
- **Backward Compatibility**: Routes also respond to the legacy `/make-server-6534ec8c` prefix and root `/<subPath>`.

All authenticated routes strictly resolve identity from verified JWT claims (`auth.uid()`), completely eliminating Insecure Direct Object References (IDOR):

- `POST /assessments`: Server-side scoring for PHQ-4, PHQ-9, and GAD-7. Non-zero score on PHQ-9 Item 9 triggers immediate crisis protocol and logs a `risk_event`.
- `GET /me/export`: DPDP Act 2023 Section 11 Data Portability export returning complete student records.
- `DELETE /me`: DPDP Act 2023 Section 12 Right to Erasure / Forgotten with cascading deletion across auth and profiles, with immutable audit logging.
- `POST /chat/stream`: Real-time streaming companion powered by Claude Opus 5.5 (`claude-opus-5-5`) with:
  1. Deterministic lexicon pre-screen (Hinglish + English).
  2. PII redactor (Indian phones, emails, Aadhaar, roll numbers).
  3. Structured risk triage classifier.
  4. Frozen system prompt companion (peer support, non-diagnostic, language-mirroring).
  5. Output guard validating non-clinical boundaries.
  6. Distributed PostgreSQL token-bucket rate limiting (max 20 requests per minute).
- `POST /appointments`: Atomic slot booking with row-level locking (`book_appointment_atomic`).
- `POST /appointments/:id/video-token`: Issues Daily.co private consultation video room token. **Strict access control**: Only the scheduled student and verified counsellor may obtain tokens.
- `POST /moderation/classify`: Reuses the platform risk triage pipeline (lexicon check, PII redaction, crisis classification, output guard) to screen community posts before publication.
- `GET /institutions/:id/analytics`: Returns aggregate well-being trends strictly through views enforcing $k \ge 10$ suppression. Accessible only to verified `institution_admin` or `super_admin`.
- `POST /moods`: Log mood check-in.
- `GET /dashboard`: Aggregate dashboard bundle for authenticated student.
- `GET /journals`, `POST /journals`, `DELETE /journals/:id`: Zero-knowledge encrypted journal sync.
- `GET /thought-records`, `POST /thought-records`, `DELETE /thought-records/:id`: Zero-knowledge CBT thought records sync.
- `GET /circles`, `GET /circles/:id/posts`, `POST /circles/:id/posts`: Community peer circle browsing and posting.
- `GET /safety-plan`, `PUT /safety-plan`: Stanley-Brown safety plan management.

---

## 5. Demo Fixtures (`supabase/seed.sql`)

The demo dataset provides comprehensive, strictly synthetic fixtures:
- **1 Institution**: Indian Institute of Science & Technology (IIST).
- **1 Super Admin**: `admin@mindsahaay.test` (`SuperAdmin-System`).
- **1 Institution Admin**: `dean.wellbeing@iist.ac.in` (`Admin-IIST-Dean`).
- **1 Moderator**: `moderator@iist.ac.in` (`Moderator-SafeSpace`).
- **3 Counsellors**: Dr. Ananya Sharma, Dr. Rajesh Nair, Priya Mukherjee (with verified RCI license numbers and availability slots).
- **12 Students**: 12 active student profiles (`Student-Aarav` through `Student-Sneha`) with mood check-ins, standardized assessments ($N \ge 10$ satisfying $k \ge 10$ analytics views), and zero-knowledge CBT thought records.
- **4 Peer Circles**: Study Stress, Hostel Life, Mindfulness, and Career Anxiety with moderated posts and comments.

---

## 6. Crisis Protocols & Indian Emergency Resources

Under the Mental Healthcare Act 2017 and platform safety rules:
- **Tele-MANAS**: `14416` or `1800-891-4416` (24/7, Toll-Free, 20+ Indian languages)
- **KIRAN Mental Health Helpline**: `1800-599-0019` (24/7, Toll-Free, DEPwD)
- **National Emergency Number**: `112` (Ambulance, Police)
- **Vandrevala Foundation**: `9999-666-555`

---

## 7. Running pgTAP Security Tests

The test suite in `supabase/tests/` verifies cross-user RLS isolation, care share access control, zero-knowledge journal privacy, community moderation boundaries, and $k \ge 10$ suppression:

```bash
# Run all pgTAP tests locally with Supabase CLI
supabase test db

# Or run specific test files
pg_prove -U postgres -d postgres supabase/tests/01_cross_user_isolation.test.sql
pg_prove -U postgres -d postgres supabase/tests/02_care_shares_counsellor.test.sql
pg_prove -U postgres -d postgres supabase/tests/03_zero_knowledge_journals.test.sql
pg_prove -U postgres -d postgres supabase/tests/04_triggers_and_append_only.test.sql
pg_prove -U postgres -d postgres supabase/tests/05_k_anonymity_aggregates.test.sql
pg_prove -U postgres -d postgres supabase/tests/06_community_and_chat.test.sql
```

---

## 8. Lexicon Sync (Client & Server Single Source of Truth)

The edge function crisis lexicon is synchronized from the domain lexicon (`src/domain/risk/lexicon.ts`) to maintain a single source of truth across both client and server:

```bash
# Sync lexicon from src/domain/risk/lexicon.ts to supabase/functions/_shared/lexicon.generated.ts
pnpm sync:lexicon
# or
npm run sync:lexicon
```

A dedicated staleness test verifies that `supabase/functions/_shared/lexicon.generated.ts` is in sync with `src/domain/risk/lexicon.ts` via SHA-256 hash validation, and a drift test asserts 100% exact risk level agreement across all evaluation dataset rows.

