# 31 Demo Data Architecture & Security Contract

**Author:** Worker D1 (Database)  
**Date:** November 2026  
**Status:** Implemented & Verified  
**Scope:** `supabase/migrations/0009_demo_data.sql`, `supabase/tests/15_demo_data.test.sql`, `docs/31-demo-data.md`  
**Compliance Standards:** India Digital Personal Data Protection (DPDP) Act 2023, Mental Healthcare Act 2017, UGC Guidelines on Student Well-being  

---

## 1. Overview & Core Design Principles

MindSahaay operates on a strict **"No Fabricated Data / Real Data Is Saved"** principle:
1. **Zero Default Fabrication:** A brand-new student account or first page load displays empty states with true zeros and clear calls to action. The dashboard never displays hardcoded, fabricated metrics (e.g. 78/100 wellbeing, 24/100 stress, fake 4-day streaks).
2. **Explicit Opt-in Demonstration:** Demo data is an intentional user action initiated via "Load demo data" and removed via "Clear demo data".
3. **Account Scoping & Complete Isolation:** Demo rows are inserted directly into the signed-in user's account (`auth.uid()`) and tagged with `is_demo = true`. They are completely isolated from other students, counsellors, and institutional analytics.
4. **Non-Destructive Clearance:** Clearing demo data removes ONLY records with `is_demo = true`. A student's genuine mood check-ins and clinical assessments are strictly preserved.

---

## 2. Database Schema Changes

Migration `0009_demo_data.sql` introduces the `is_demo` flag and optimizing composite indexes:

```sql
ALTER TABLE public.mood_entries
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mood_entries_student_demo
  ON public.mood_entries (student_id, is_demo);

CREATE INDEX IF NOT EXISTS idx_assessments_student_demo
  ON public.assessments (student_id, is_demo);
```

- Default value is `false`, ensuring that standard user entries created via UI forms remain real entries without requiring schema rewrites.
- Indexes optimize client queries detecting demo status (`GET /mood_entries?is_demo=eq.true&select=id`) and deletion operations in `clear_demo_data()`.

---

## 3. Database Functions (RPC Contract)

Both RPCs are implemented as `SECURITY DEFINER` functions with `search_path = public, pg_temp`. They accept **zero arguments** to prevent ID spoofing.

### 3.1 `public.load_demo_data() RETURNS jsonb`
- **Security & Authorization:** Executable exclusively by the `authenticated` role (`REVOKE ALL FROM PUBLIC; REVOKE ALL FROM anon;`).
- **Session Check:** Verifies `auth.uid() IS NOT NULL`, raising an exception (`ERRCODE = 28000`) if unauthenticated.
- **Idempotency:** Deletes existing `is_demo = true` rows for the calling user prior to insertion, guaranteeing that multiple invocations never duplicate records.
- **Dataset Contents:**
  - **Mood Check-ins (26 records):** Distributed over 30 days (days 25, 19, 11, and 6 skipped for natural irregularity). Scores range from 1 to 10 with a gentle positive recovery trend and realistic mid-point academic stress (score 4–5). Emotion tags use the standard app vocabulary: `Anxious`, `Calm`, `Exhausted`, `Grateful`, `Homesick`, `Overwhelmed`, `Hopeful`, `Stressed`, `Lonely`, `Focused`, `Relieved`, `Burnout`. Notes are `NULL` (no synthetic free text).
  - **Standardized Screenings (3 records):**
    1. *PHQ-9 (Mild):* Answers `[1, 1, 1, 1, 0, 1, 0, 1, 0]`, Total = 6, Severity = `'Mild'`, Item 9 = 0.
    2. *GAD-7 (Mild):* Answers `[1, 1, 1, 1, 1, 1, 0]`, Total = 6, Severity = `'Mild anxiety'`.
    3. *PHQ-9 (Minimal):* Answers `[0, 1, 0, 1, 0, 0, 0, 1, 0]`, Total = 3, Severity = `'Minimal or None'`, Item 9 = 0.
- **Return Shape:**
  ```json
  { "moods": 26, "assessments": 3 }
  ```

### 3.2 `public.clear_demo_data() RETURNS jsonb`
- **Security & Authorization:** Executable exclusively by `authenticated`.
- **Targeted Deletion:** Executes:
  ```sql
  DELETE FROM public.mood_entries WHERE student_id = auth.uid() AND is_demo = true;
  DELETE FROM public.assessments WHERE student_id = auth.uid() AND is_demo = true;
  ```
- **Real Data Preservation:** Real records (`is_demo = false`) are never touched.
- **Zero-Demo Behavior:** If called on an account with no demo rows, returns:
  ```json
  { "moods": 0, "assessments": 0 }
  ```

---

## 4. Privacy, Multi-Tenancy & Access Isolation

### 4.1 Counsellor Care Share Isolation
Under India DPDP Act 2023, counsellors granted care shares must only view authentic clinical records. Migration 0009 updates RLS policies on `mood_entries` and `assessments`:

```sql
CREATE POLICY "Students own mood entries read"
  ON public.mood_entries FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR (
      public.has_active_care_share(student_id, auth.uid(), 'moods')
      AND is_demo = false
    )
  );

CREATE POLICY "Assessments viewable by owner or authorized counsellor"
  ON public.assessments FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR (
      public.has_active_care_share(student_id, auth.uid(), 'assessments')
      AND is_demo = false
    )
  );
```

- When a student inspects their own dashboard, `student_id = auth.uid()` evaluates to `true`, rendering both real and demo rows.
- When an authorized counsellor views the student's chart, `has_active_care_share(...) AND is_demo = false` filters out all demo records.

### 4.2 Statistical k-Anonymity Institutional Views
Institutional aggregate views (`institution_assessment_aggregates`, `institution_mood_aggregates`, and `get_institution_wellbeing_summary`) are protected by $k \ge 10$ suppression. Migration 0009 ensures demo rows are excluded from calculation:

```sql
WHERE a.is_demo = false
...
HAVING count(*) >= 10;
```

A campus dashboard will never count synthetic demo data toward institutional student distress metrics.

---

## 5. Clinical Safety & Emergency Protocol Protection

MindSahaay enforces automatic crisis protocol escalation when Item 9 of PHQ-9 is positive:
- Tele-MANAS: **14416** / **1800-891-4416**
- KIRAN Helpline: **1800-599-0019**
- Emergency Services: **112**

To guarantee that demo data creation never triggers crisis cascades:
1. **Item 9 Value:** All demo PHQ-9 screenings strictly set Item 9 = 0.
2. **Trigger Hardening:** `handle_assessment_crisis_trigger()` includes an explicit guard:
   ```sql
   IF NEW.instrument = 'phq9' AND NEW.item9_flag = true AND COALESCE(NEW.is_demo, false) = false THEN
   ```
3. **Verification:** pgTAP test 15 confirms that running `load_demo_data()` produces:
   - `0` rows in `public.risk_events`
   - `0` rows in `public.risk_followups`
   - `0` rows in `public.audit_log` with action `'CRISIS_PROTOCOL_ACTIVATED'`

---

## 6. Architectural Limits & Exclusions

1. **Client-Side Encrypted Tables:** Demo data does **not** populate `public.journal_entries` or `public.thought_records`. In MindSahaay, journals and thought records utilize Zero-Knowledge Client-Side Encryption (Web Crypto AES-GCM-256 with student-derived passkeys). Inserting synthetic plaintext or pseudo-ciphertext in the database without the student's unique browser key would produce un-decryptable records.
2. **Offline-Preview vs Backend-Demo:** The login screen provides an offline preview mode ("Enter Demo as Student") backed by `sessionStorage`. In contrast, the in-app "Load demo data" feature operates on the real database for the authenticated user, enabling realistic end-to-end testing of charts, exports, and history.

---

## 7. Verification Results

All 15 pgTAP test suites passed against local Supabase CLI (CLI 3.2.0, PostgreSQL 15, Docker):
- `supabase/tests/01` to `14`: 146 tests passing (no regressions)
- `supabase/tests/15_demo_data.test.sql`: 38 tests passing (100% coverage of demo data contract)
- **Total:** 15 test files, 184 tests, 0 failures.

---

## 8. Unverified Areas & Host Limits

In accordance with independent verification standards:
1. **Local Stack vs Hosted Supabase:** All migrations and pgTAP tests have been verified exclusively against the local Docker-based Supabase stack (PostgreSQL 15.20, Supabase CLI 3.2.0). Deployment against a remote, hosted Supabase project was not performed.
2. **Third-Party Integrations:** External vendor integrations (Daily.co video tokens, Claude API endpoints requiring external API credentials) were mocked or bypassed as they operate outside the database demo data engine.
3. **pg_cron Cluster Configuration:** Automated retention schedules scheduled via dynamic SQL inside `pg_cron` remain unverified for long-term background daemon triggers on managed production instances.
