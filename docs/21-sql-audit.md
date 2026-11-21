# 21 Independent SQL & Security Audit Report

**Project:** MindSahaay — Privacy-First Digital Mental Health Platform for Indian Higher Educational Institutions (HEIs)  
**Review Type:** Independent Skeptical Static Code & Security Audit  
**Date:** November 2026  
**Audited Assets:**
- `supabase/migrations/0001_core.sql`
- `supabase/migrations/0002_triggers.sql`
- `supabase/migrations/0003_rate_limit.sql`
- `supabase/migrations/0004_community_booking.sql`
- `supabase/seed.sql`
- `supabase/tests/01_cross_user_isolation.test.sql`
- `supabase/tests/02_care_shares_counsellor.test.sql`
- `supabase/tests/03_zero_knowledge_journals.test.sql`
- `supabase/tests/04_triggers_and_append_only.test.sql`
- `supabase/tests/05_k_anonymity_aggregates.test.sql`
- `supabase/tests/06_community_and_chat.test.sql`
- `supabase/tests/07_security_gaps.test.sql` *(New)*

---

> **Status 2026-11-20 (final).** This document began as a static (read-only) audit. The SQL has since been **executed** on a local Supabase (CLI 3.2.0, Docker): all 8 migrations (0001 to 0008) and `seed.sql` apply, 24 tables exist with row level security enabled on all of them, and the 14 pgTAP files (146 tests) pass. Execution found 7 more defects (findings 22 to 28, see the runtime section) that this static audit missed. Later work added migration 0007 (security fixes from the independent review in docs/28) and 0008 (realtime publication); see the last section. Sections 1 and 5 below describe the situation **before** the first run and are kept as the record of what static reading could and could not find. Hosted Supabase has **not** been tried.

## 1. Executive Summary & Verification Environment

This audit was conducted by acting as a skeptical independent reviewer over the entire SQL codebase of MindSahaay. At the time of this static audit, the SQL migrations and pgTAP tests had **not yet been executed** against a running PostgreSQL engine, Docker daemon, or Supabase CLI (they were executed later, see the final section).

### Machine-Checking Tooling Status
- **PostgreSQL / Docker / Supabase CLI:** Not available during the static pass (a local Supabase stack was used afterwards).
- **Pure-JS Postgres Parser Check:** `node_modules` was inspected for pure-JS parsers (`pglite`, `pgsql-parser`, `@electric-sql/pglite`, etc.); none were present in the project scaffold. Scope constraints strictly prohibited running `pnpm install` or `npm install`. Running `npx --no-install pglite` returned an npm 404 (package not cached locally).
- **Verification Reality (static pass):** No SQL files were machine-checked by a running parser or engine during this pass. All findings 1 to 21 were identified by line-by-line manual analysis. The later execution is described in the final section.

Every identified defect has been **fixed in place** across the migrations, tests, and seed file.

---

## 2. Numbered Defect Log

| # | File | Line(s) | Problem Description | Applied Fix | Severity |
|---|------|---------|---------------------|-------------|----------|
| **1** | `supabase/migrations/0001_core.sql` | 8–11 | Extensions `uuid-ossp`, `pgcrypto`, `btree_gist` created without schema qualification. In Supabase, extensions belong in `extensions` schema. Furthermore, if `btree_gist` operators reside in `extensions` and `extensions` is not in `search_path`, the GiST exclusion constraint on `availability_slots` fails at table creation. | Created schema `extensions` if not exists, enabled extensions `WITH SCHEMA extensions`, and set migration session `search_path TO public, extensions`. | **High** |
| **2** | `supabase/migrations/0001_core.sql` | 82–104 | `profiles.id` references `auth.users(id)` and policies reference `auth.uid()`. In pure PostgreSQL or non-Supabase test runners, schema `auth` and table `auth.users` do not exist, causing migration 0001 to abort immediately. | Preemptively declared `CREATE SCHEMA IF NOT EXISTS auth;`, created fallback `auth.users` table, and created fallback `auth.uid()` and `auth.role()` functions supporting both `request.jwt.claims` and `request.jwt.claim.sub`. | **High** |
| **3** | `supabase/migrations/0001_core.sql` | 369–379 | **Privilege Escalation:** `profiles` UPDATE policy checked only `WITH CHECK (id = auth.uid())`. Any authenticated student could execute `UPDATE profiles SET role = 'super_admin'` or `'counsellor'`, hijacking admin privileges. Direct INSERT also lacked role constraint. | Added `prevent_profile_role_escalation()` BEFORE UPDATE trigger that raises an exception if a non-super-admin modifies `role`. Restricted `profiles` INSERT policy to `role = 'student' OR is_super_admin()`. | **Critical** |
| **4** | `supabase/migrations/0001_core.sql` | 521–526 | **Clinical Identity Spoofing:** `counsellors` table `FOR ALL` policy checked only `WITH CHECK (id = auth.uid())`. Any student could insert themselves into `public.counsellors` with `verified = true`, bypassing verification and gaining access to student health records. | Restricted `counsellors` self-management to profiles where `role = 'counsellor'`. Added `prevent_counsellor_self_verification()` trigger preventing self-verification. Added admin management policy. | **Critical** |
| **5** | `supabase/migrations/0001_core.sql` | 275–294 | Stale/Revoked Counsellor Access: `has_active_care_share()` checked date and active flag, but did not check if the counsellor record itself was still `verified = true`. A deregistered counsellor could still view sensitive records. | Added `AND EXISTS (SELECT 1 FROM public.counsellors c WHERE c.id = cs.counsellor_id AND c.verified = true)` and set `search_path = public, pg_temp`. | **High** |
| **6** | `supabase/migrations/0001_core.sql` | 297–325 | `is_super_admin()` and `is_institution_admin()` used `SET search_path = public` without `pg_temp`, leaving `SECURITY DEFINER` functions susceptible to temporary schema hijacking (CVE-2018-1058 pattern). | Updated `SET search_path = public, pg_temp` on both functions. | **Medium** |
| **7** | `supabase/migrations/0001_core.sql` | 557–562 | Missing appointment cross-check on `session_notes`: Counsellors could insert clinical session notes referencing arbitrary `appointment_id` or `student_id` not belonging to their consultations. | Tightened `WITH CHECK` to enforce `appointment_id` belongs to `counsellor_id = auth.uid()` and matches `student_id`. | **Medium** |
| **8** | `supabase/migrations/0002_triggers.sql` | 28, 99–103 | `handle_new_user()` used `encode(gen_random_bytes(3), 'hex')` under `search_path = public`. When `pgcrypto` is in `extensions`, `gen_random_bytes` cannot be resolved. Also, `supabase_auth_admin` was never granted `EXECUTE` on the function. Unchecked `institution_id` in metadata could also cause FK crashes on signup. | Used built-in `substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)`, validated `institution_id` exists before assignment, and granted `EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin`. | **High** |
| **9** | `supabase/migrations/0002_triggers.sql` | 109–136 | **DPDP Right to Erasure Deadlock:** `enforce_consents_append_only()` and `enforce_audit_log_append_only()` triggers unconditionally threw exceptions on DELETE/UPDATE. When a student deleted their profile (`DELETE FROM profiles WHERE id = auth.uid()`), foreign key cascades to `consents` and `audit_log` aborted with trigger errors, preventing data wiping. | Added `IF pg_trigger_depth() > 1 THEN RETURN OLD / NEW; END IF;` so cascading deletes/nullifications succeed during parent profile erasure while blocking direct client tampering (`depth <= 1`). | **High** |
| **10** | `supabase/migrations/0002_triggers.sql` | 234–289 | **Clinical Suicide Crisis Protocol Gap:** `trg_assessment_crisis` only triggered if `NEW.item9_flag = true`. If a client failed to compute `item9_flag` but `answers[9] > 0`, suicidal ideation would not activate crisis protocols. | Added BEFORE INSERT trigger `enforce_assessment_crisis_flag()` that automatically sets `NEW.item9_flag := true` when `instrument = 'phq9'` and `answers[9] > 0`. | **Critical** |
| **11** | `supabase/migrations/0002_triggers.sql` | 299–357 | **Supabase Linter 0010 (`security_definer_view`):** Views `institution_assessment_aggregates`, `institution_mood_aggregates`, and `institution_risk_aggregates` were created without `WITH (security_invoker = true)` and granted to `authenticated`, running with table owner privileges and bypassing RLS. | Added `WITH (security_invoker = true)` to all three institutional aggregate views. | **High** |
| **12** | `supabase/migrations/0004_community_booking.sql` | 226–230 | **Circle Role Spoofing & Private Circle Breach:** `circle_members` INSERT policy checked only `WITH CHECK (user_id = auth.uid())`. Allowed users to self-assign `role = 'admin'` or join private circles without moderator approval. | Constrained policy to `(role = 'member' OR is_moderator())` and verified circle is public (`is_private = false`) unless caller is moderator. Added moderator UPDATE policy. | **High** |
| **13** | `supabase/migrations/0004_community_booking.sql` | 251–287 | **Content Moderation Bypass:** Authors of posts and comments could update their own records and modify `moderation_status` from `flagged`/`rejected` to `approved`. | Added trigger `protect_post_moderation()` preventing non-moderators from altering `moderation_status` on posts and comments. | **High** |
| **14** | `supabase/migrations/0004_community_booking.sql` | 294–297 | Report Status Tampering: `reports` INSERT policy did not restrict initial `moderation_status`, allowing reporters to submit pre-approved or pre-dismissed reports. | Enforced `(moderation_status = 'pending' OR is_moderator())` in `WITH CHECK`. | **Medium** |
| **15** | `supabase/migrations/0004_community_booking.sql` | 440 | Missing extension in function `search_path`: `book_appointment_atomic()` called `gen_random_bytes(8)` with `search_path = public, pg_temp`. If `p_meeting_url` was null, booking aborted with `gen_random_bytes does not exist`. | Switched to `substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)` (built-in) and added `extensions` to `search_path`. | **High** |
| **16** | `supabase/migrations/0004_community_booking.sql` | 532–544 | **Compile-Time Migration Failure:** `DO $$` block called `PERFORM cron.schedule(...)` statically. In environments without `pg_cron` pre-installed, Postgres failed at block compilation with `schema "cron" does not exist`, which `EXCEPTION WHEN OTHERS` could not catch. | Replaced static call with dynamic SQL `EXECUTE 'SELECT cron.schedule(...)'`. | **High** |
| **17** | `supabase/tests/*.test.sql` (All 6 test files) | Various | **Foreign Key Constraint Violations:** All 6 test files inserted dummy user UUIDs directly into `public.profiles` without inserting into `auth.users`, triggering `profiles_id_fkey` constraint crashes on line 20–30. | Added setup blocks inserting mock user UUIDs into `auth.users` with `ON CONFLICT (id) DO NOTHING` and changed `profiles` inserts to `ON CONFLICT (id) DO UPDATE`. | **High** |
| **18** | `supabase/tests/*.test.sql` (All 6 test files) | Various | **Supabase Mock JWT Incompatibility:** Tests set `SET LOCAL "request.jwt.claim.sub"` but omitted `SET LOCAL "request.jwt.claims"`. In Supabase environments, `auth.uid()` reads the JSON `request.jwt.claims`, causing `auth.uid()` to evaluate to `NULL` and failing RLS tests. | Set `SET LOCAL "request.jwt.claims" = '{"sub": "<uuid>", "role": "authenticated"}';` across all test context switches. | **High** |
| **19** | `supabase/seed.sql` | 128–137, 223 | **Seed Ledger Duplication & Missing Demo Care Shares:** `consents` insert had `ON CONFLICT DO NOTHING` without conflict target, creating duplicates. Booked appointments had no active `care_shares`, preventing demo counsellors from viewing patient health data. | Added `NOT EXISTS` condition for seed consents and seeded active care shares for Student-Aarav (Dr. Ananya) and Student-Rohan (Dr. Rajesh). | **Medium** |
| **20** | `supabase/tests/07_security_gaps.test.sql` | 1–180 | **Missing Test Coverage for Critical Security Boundaries:** No pgTAP tests existed for role escalation denial, counsellor self-verification denial, rate_limits unreachability, or WITH CHECK spoofing attempts. | Created new pgTAP test file `07_security_gaps.test.sql` covering all 10 security boundaries with 10 matching assertions. | **Medium** |

---

## 3. Detailed Architectural & Security Findings

### 3.1 DPDP Act 2023 Right to Erasure vs Append-Only Ledger Deadlock
- **The Conflict:** Section 12 of India DPDP Act 2023 guarantees students the right to erase all personal health records with immediate effect. In the database design, `public.profiles` is the parent anchor for all student data (`consents`, `mood_entries`, `assessments`, `journal_entries`, `thought_records`, `chat_sessions`), all configured with `ON DELETE CASCADE`.
- **The Bug:** `trg_prevent_consents_tampering` fired on `BEFORE DELETE ON consents` and unconditionally raised an exception. When a student ran `DELETE FROM public.profiles WHERE id = auth.uid()`, the foreign key cascade triggered `DELETE FROM consents`, raising the exception and aborting the entire user erasure transaction.
- **The Fix:** Leveraged PostgreSQL's built-in `pg_trigger_depth()`. When a direct statement deletes from consents (`pg_trigger_depth() <= 1`), the trigger raises an exception. When the deletion is part of a foreign key cascade initiated from `profiles` (`pg_trigger_depth() > 1`), the trigger permits `RETURN OLD`, enabling erasure while preserving append-only immutability against direct student manipulation.

### 3.2 Clinical Safety Standard: PHQ-9 Item 9 Automatic Escalation
- **The Standard:** Indian HEI mental health guidelines and suicide prevention protocols dictate that any non-zero score on PHQ-9 Item 9 (*"thoughts that you would be better off dead, or of hurting yourself in some way"*) requires immediate activation of crisis triage protocols and presentation of emergency helplines:
  - Tele-MANAS: **14416** / **1800-891-4416**
  - KIRAN Helpline: **1800-599-0019**
  - Emergency Services: **112**
- **The Bug:** In `0002_triggers.sql`, the crisis trigger only checked `IF NEW.item9_flag = true`. If a client implementation submitted an assessment where `answers[9] > 0` but failed to set `item9_flag = true`, the database would have recorded the assessment without escalating to `public.risk_events`.
- **The Fix:** Introduced `trg_assessment_crisis_flag` as a `BEFORE INSERT` trigger on `public.assessments`. If `NEW.instrument = 'phq9'` and `answers[9] > 0`, the server enforces `NEW.item9_flag := true` before row insertion, guaranteeing that `handle_assessment_crisis_trigger()` will always fire and generate the crisis risk event.

### 3.3 Statistical k-Anonymity Institutional Views & Supabase Linter 0010
- **The Standard:** Institutional administrators (Deans of Student Welfare, Directors) must never see individual student health records. They may only see aggregate trends where cohort size $k \ge 10$ to prevent statistical deanonymization.
- **The Bug:** The views `institution_assessment_aggregates`, `institution_mood_aggregates`, and `institution_risk_aggregates` were created with standard `CREATE OR REPLACE VIEW` and granted to `authenticated`. In PostgreSQL, standard views run as `SECURITY DEFINER` (as the view creator, `postgres`). Supabase Linter 0010 flags this as a security vulnerability because any authenticated user could query the view directly and bypass underlying table RLS.
- **The Fix:** Added `WITH (security_invoker = true)` to all three views. Under `security_invoker = true`, queries respect the invoker's RLS policies. For administrative access, the controlled `SECURITY DEFINER` function `get_institution_wellbeing_summary()` enforces strict RBAC checking that the caller is an institution admin for that specific institution.

### 3.4 pgTAP Testing Integrity: Foreign Keys and JWT Simulation
- **The Bug:** All six existing pgTAP tests attempted to insert mock user UUIDs (such as `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`) into `public.profiles`. Because `profiles.id` has a foreign key constraint referencing `auth.users(id)`, every test would have failed at runtime with a foreign key violation.
- **The Bug:** Tests switched roles using `SET LOCAL "request.jwt.claim.sub"` instead of `SET LOCAL "request.jwt.claims"`. In Supabase, `auth.uid()` inspects `request.jwt.claims::jsonb ->> 'sub'`, resulting in `auth.uid()` returning `NULL`.
- **The Fix:** In all test setups, mock users are first registered in `auth.users` with `ON CONFLICT (id) DO NOTHING`. Profiles are inserted with `ON CONFLICT (id) DO UPDATE`. All context switches now set both `request.jwt.claims` (JSON string) and `request.jwt.claim.sub`.

---

## 4. New Test Suite: `07_security_gaps.test.sql`

A dedicated test suite was added to verify previously untested security boundaries:

```
Test Plan: 10 assertions
1. Student cannot escalate their own role to 'counsellor' or 'super_admin' (throws Unauthorized)
2. Student cannot self-verify into public.counsellors (throws Unauthorized)
3. Authenticated user cannot read public.rate_limits table directly (is_empty)
4. Authenticated user cannot insert into public.rate_limits table (throws privilege error)
5. WITH CHECK: Student Alice cannot spoof mood_entries for Student Bob (throws 42501)
6. WITH CHECK: Student Alice cannot spoof assessments for Student Bob (throws 42501)
7. Student Alice cannot join a private circle without authorization (throws 42501)
8. Student Alice cannot join a public circle with role = 'admin' (throws 42501)
9. Post author cannot unflag their own flagged post (throws Unauthorized)
10. DPDP Right to Erasure: Profile deletion successfully cascades and deletes associated records (lives_ok)
```

---

## 5. What Remained Unverified After the Static Pass (status 2026-11-20 in brackets)

As mandated by this skeptical audit, the following limitations were stated:
1. **No Live Engine Execution:** [Resolved for a local stack: executed on local Supabase, now 146 pgTAP tests in 14 files pass. Still not executed on a hosted Supabase project.]
2. **Dynamic SQL Syntax inside pg_cron:** The call `EXECUTE 'SELECT cron.schedule(...)'` handles environments where `pg_cron` is not installed; however, in a live cluster where `pg_cron` is active, the exact schedule parameters and cron background worker configuration must be verified.
3. **GiST Exclusion Constraint Index Performance:** The exclusion constraint `no_overlapping_slots` on `availability_slots` relies on `btree_gist`. Under extreme concurrent slot creation, lock contention on GiST trees should be benchmarked under simulated load.
4. **End-to-End Migration Sequence:** Once a local Docker or Supabase CLI environment is provisioned, `supabase db reset` and `supabase test db` should be executed to validate live execution against a real Postgres 15+ container.

## Follow-up review (lead session)

- **Finding 21 (high, fixed):** the audit's portability fallbacks used `CREATE OR REPLACE FUNCTION auth.uid()` and `auth.role()` in `0001_core.sql`. On a real Supabase project these functions are owned by `supabase_auth_admin`, so the migration would either fail with an ownership error or overwrite the platform definition. They are now created only when `to_regprocedure('auth.uid()')` / `to_regprocedure('auth.role()')` is NULL, so the block is a no-op on Supabase. `CREATE TABLE IF NOT EXISTS auth.users` is already a no-op there.
- At the time of this review nothing had been executed. That has since been done on a local Supabase, see the runtime verification below. A hosted project has not been tried.

## Runtime verification (2026-11-19, local Supabase via Docker, CLI 3.2.0)

The migrations, seed and pgTAP tests were executed for the first time with `supabase start`, `supabase db reset` and `supabase test db`. **Result: 7 test files, 57 tests, all passing** (that was the count on 2026-11-19; the final count is 14 files and 146 tests, see the last section). Running the SQL found defects that the static audit above missed:

| # | Defect found only by execution | Fix |
|---|---|---|
| 22 | `CREATE TABLE IF NOT EXISTS auth.users` fails on real Supabase with `permission denied for schema auth` (schema CREATE privilege is checked even when the table exists) | Guarded by `to_regclass('auth.users') IS NULL` inside a DO block |
| 23 | Seed script blocked by the counsellor self-verification trigger (and the role-escalation trigger would block trusted backends) | New `is_trusted_backend()`: active role `none`/`postgres`/`supabase_admin`/`service_role`. PostgREST always switches the active role to anon/authenticated/service_role, so end users never qualify |
| 24 | First attempt used `session_user` for the trust check; in tests `session_user` stays `postgres` after `SET ROLE authenticated`, so a student looked trusted (caught by test 07) | Use `current_setting('role')` instead |
| 25 | **RLS infinite recursion** between `profiles` (reads `counsellors`) and `counsellors` (reads `profiles`); any profile read by a user could fail | SECURITY DEFINER helpers `is_counsellor_role()` and `is_verified_counsellor()` |
| 26 | **RLS infinite recursion** between `circles` and `circle_members` | SECURITY DEFINER helpers `is_circle_member()`, `is_public_circle()`, `is_joinable_circle()` |
| 27 | Test data used non-hex UUID literals (`mmmm...`, `t0000001-...`) | Replaced with valid hex UUIDs |
| 28 | `supabase/config.toml` used the removed `[inbucket]` key and did not declare the `index.tsx` function entrypoint | `[local_smtp]` and `[functions.server]` with explicit entrypoint |

Edge function smoke test against the local stack (real Deno runtime, real JWTs): sign-up creates a profile with an anonymous alias; `POST /assessments` with PHQ-9 item 9 = 2 stores the assessment, creates a `crisis` risk event with the helplines; a request with only the anon key returns 401; `GET /students/<other-id>/export` returns the caller's own data (identity comes from the token, the URL id is ignored).

Real-backend browser checks (done by hand, not part of the automated Playwright tests; the same checks are now automated in the real-backend project, docs/29): magic-link sign-in through the local mail catcher (port 54324) lands on `/dashboard` with no console errors; all 12 main routes load with a real session with no console errors and no failed API calls; the counsellors page shows real seeded counsellors and slots from the database.

Still NOT verified: the Claude chat route (needs `ANTHROPIC_API_KEY`), Daily.co video tokens (needs `DAILY_API_KEY`), `pg_cron` retention job, and anything on a hosted Supabase project.

## Later migrations: 0007 and 0008 (2026-11-20)

Migrations 0005 and 0006 (crisis follow-up, warm handoff and opt-out) were reviewed in docs/28, not in this document. Two further migrations came out of running and reviewing the system.

**0007_security_fixes.sql** (worker H1, failing-first tests in `supabase/tests/12_g6_sec_findings.test.sql` and `13_systematic_security_sweep.test.sql`):

| Finding | Defect | Fix |
|---|---|---|
| G6-SEC-01 (Critical) | A reopened crisis event was never re-escalated, because the overdue notification was idempotent per event and level instead of per follow-up cycle | Idempotency keyed on `followup_id`; partial unique index `idx_notifications_risk_overdue_cycle` |
| G6-SEC-02 (High) | `get_student_alias_for_care()` was a SECURITY DEFINER helper that returned any student's alias to any caller | Returns the alias only to a trusted backend, super admin, the student, or a verified counsellor with an active care share; otherwise NULL |
| G6-SEC-07 (Medium) | `escalate_overdue_risk()` could be called by anyone and ran concurrently | Caller restricted to trusted backend or a verified counsellor with a `risk_events` share; advisory transaction lock |
| Revocation gap | `has_active_care_share()` ignored `revoked_at`, so a revoked share still counted as active | Requires `revoked_at IS NULL` |
| Spoofable notifications | A permissive `FOR ALL` policy let clients write notifications | Separate SELECT, UPDATE, DELETE policies; INSERT only for trusted backend; immutability trigger leaves clients only the read flags |
| Handoff RPCs | Slot hijacking, cross-user acceptance, replayed declines, opt-out set by non-students | Row lock, ownership checks, replay guard, role check |
| SECURITY DEFINER sweep | Public functions executable by PUBLIC and anon | EXECUTE revoked from PUBLIC and anon on all public SECURITY DEFINER functions, with `check_rate_limit` as the only anon allowlist entry; explicit `search_path` verified on every one |

**0008_realtime_publication.sql:** the `supabase_realtime` publication was empty, so the counsellor crisis queue never received live updates. Found by a real-browser test, because unit tests mocked the channel. The migration adds `risk_events`, `risk_followups` and `notifications` (skipped on plain Postgres without the publication). Realtime still applies row level security. Checked by `supabase/tests/14_realtime_publication.test.sql`.

**Related defect found by running, fixed outside the migrations:** one PHQ-9 item 9 created two risk events and two audit rows (edge function plus trigger). The database trigger `trg_assessment_crisis` is now the single source of truth.

**Final pgTAP result:** 14 files (01 to 14), 146 tests, all passing on a real local Postgres. Migrations 0001 to 0008. Not verified: hosted Supabase, `pg_cron` on a managed host, load behaviour.