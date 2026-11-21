# 23 Frontend Security Audit & Hardening Report

**Project:** MindSahaay – Privacy-First Digital Mental Health Platform for Indian University Students  
**Document Version:** 1.1.0 (statuses refreshed 2026-11-20)  
**Target Environment:** React 19 + Vite 8 + Tailwind CSS v4 + TypeScript Frontend, Supabase Backend, Claude API Companion  
**Compliance Context:** India Digital Personal Data Protection (DPDP) Act 2023, Mental Healthcare Act 2017, UGC Guidelines on Student Well-being in HEIs, OWASP ASVS v4.0.3 Level 1, OWASP Top 10 for LLM Applications (2025)  
**Safety Mandate:** PHQ-9 Item 9 non-zero triggers mandatory crisis protocol; 24/7 National Helplines: Tele-MANAS (14416 / 1800-891-4416), KIRAN (1800-599-0019), National Emergency (112); Educational screening only, never clinical diagnosis.

---

## 1. Executive Summary

A comprehensive frontend security audit of the MindSahaay client codebase (`src/**`, `utils/**`, `index.html`, and configuration) was conducted to evaluate data protection posture, cross-site scripting (XSS) resilience, session security, third-party integration boundaries, and regulatory compliance under India's DPDP Act 2023.

Because MindSahaay handles sensitive student psychological well-being data—including suicide ideation triage, encrypted personal journals, mood history, and tele-counselling sessions—frontend defenses must enforce strict data minimization, zero-knowledge local cryptography, and defense-in-depth isolation.

> **Status refresh, 2026-11-20.** SEC-03 (the High finding) is fixed and was verified in a browser: CBT records, safety-card anchors and the trusted contact are stored only as AES-GCM ciphertext under opaque keys, unreadable while the vault is locked, and the safety card still shows helplines while locked. Findings SEC-01, SEC-02, SEC-04, SEC-05, SEC-07 and SEC-08 were re-checked against the source on this date and are **still open** (no code change found). SEC-06 was not re-checked in detail and is kept open. On the server side, the original IDOR on `GET /students/<id>/export` is closed (verified with real JWTs against the real edge runtime, see doc 22). No ZAP scan, no dependency audit run and no CI run on a real runner has happened. The "Highlights" below are the original audit text; where one is superseded, it is marked.

### Key Audit Highlights:
1. **Zero Dangerous DOM Sink Primitives:** Grep and AST inspection identified **0** instances of `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `window.open`, or `postMessage`. React 19's default JSX string escaping is maintained universally across UI components.
2. **Clean Secret Separation:** No production secrets (such as `ANTHROPIC_API_KEY` or `DAILY_API_KEY`) exist in frontend bundles or `utils/supabase/info.tsx`. All LLM calls and Daily token requests are mediated exclusively by backend Supabase Edge Functions.
3. **Daily.co Tele-Consultation Hardening Needed:** The Daily.co tele-consultation iframe in `src/features/modals/VideoSessionModal.tsx` correctly validates room domains via `buildDailyEmbedUrl` but lacks an explicit `sandbox` attribute. Additionally, the backup link fails to validate the hostname against trusted Daily.co domains.
4. **Browser Storage Remediation (SEC-03, now fixed; this bullet describes the original finding):** Multiple mental health artifacts (unencrypted CBT activities, worry lists, emergency grounding anchors, and trusted friend contact details) are currently persisted in browser `localStorage` in plaintext. Under the DPDP Act 2023, these items must either be protected by the zero-knowledge PBKDF2 WebCrypto vault or purged on session end.
5. **Open Redirect Vector in Auth Provider:** `signInWithEmail` and `signInWithGoogle` accept an unvalidated `redirectTo` parameter that should be constrained to relative same-origin paths.
6. **Hardening Implemented:** Production HTTP response headers—including Content-Security-Policy (CSP), Referrer-Policy, Permissions-Policy, X-Content-Type-Options, Strict-Transport-Security, and SPA routing rewrites—were configured in `vercel.json`. Public crawler disallowance was deployed in `public/robots.txt` and an RFC 9116 disclosure contact was published in `public/.well-known/security.txt`. Automated security verification (Gitleaks, CodeQL, non-blocking npm audit, pgTAP database tests, and nightly keyword/LLM evaluations) was established in `.github/workflows/`.

---

## 2. Audit Methodology & Scope

The audit covered static security analysis and manual code review across all TypeScript/TSX modules in `src/` and `utils/`. The analysis investigated twelve mandatory security areas:
1. `dangerouslySetInnerHTML` and `innerHTML` sinks
2. Dynamic code evaluation (`eval`, `new Function`)
3. Unsanitised URLs in `href` or `src`
4. External link attributes (`target="_blank"` without `rel="noopener noreferrer"`)
5. Popup and window manipulation (`window.open`)
6. Cross-document messaging (`postMessage`)
7. Browser storage persistence (`localStorage` and `sessionStorage` key inventory)
8. Console logging of user input, mental health notes, or crisis text
9. Hardcoded secrets, keys, and tokens (including `utils/supabase/info.tsx`)
10. Third-party scripts and embedded iframes (specifically Daily.co video consultation)
11. Open redirect vulnerabilities in authentication callbacks
12. Personally Identifiable Information (PII) leakage in error messages and exceptions

---

## 3. Summary of Findings Matrix

| Finding ID | Area | Severity | File & Location | Status | Summary |
|---|---|---|---|---|---|
| **SEC-01** | Third-Party Iframe | Medium | `src/features/modals/VideoSessionModal.tsx:74` | **Open** (re-checked 2026-11-20) | Daily.co video iframe missing `sandbox` attribute. |
| **SEC-02** | URL Sanitisation | Medium | `src/features/modals/VideoSessionModal.tsx:44,90` | **Open** (re-checked 2026-11-20) | `appointment.meetingUrl` regex `/^https:\/\//` does not restrict hostname to `*.daily.co`. |
| **SEC-03** | Data at Rest | High | `src/features/cbt/storage.ts:3-4`<br>`src/features/modals/SafetyCardModal.tsx:14`<br>`src/features/crisis/CrisisPage.tsx:56` | **Fixed and browser-verified (2026-11-20)** | Remediated via zero-knowledge AES-256-GCM secureStore wrapper with opaque keys, one-time plaintext migration, unblocked crisis card, and centralized clearAllLocalUserData(). Verified by saving data through the UI and inspecting storage: no plaintext, no passphrase. |
| **SEC-04** | Auth / Redirect | Medium | `src/app/providers/AuthProvider.tsx:220,245` | **Open** (re-checked 2026-11-20) | `redirectTo` parameter unvalidated against external open redirects. |
| **SEC-05** | Error / Logging | Medium | `src/app/ErrorBoundary.tsx:27` | **Open** (re-checked 2026-11-20) | Uncaught Error Boundary logs raw `error` & `errorInfo` stack to console in production. |
| **SEC-06** | Error Handling / PII | Medium | `src/shared/lib/api/assessments.ts:222`<br>`src/shared/lib/api/errors.ts:29` | **Open** (not re-checked in detail) | Postgres error messages and Zod validation issue objects retain raw user input in details. |
| **SEC-07** | Auth / Headers | Low | `src/api.ts:44` | **Open** (re-checked 2026-11-20) | Legacy API helper passes `SUPABASE_ANON_KEY` as Bearer token rather than user JWT session. |
| **SEC-08** | Content Security | Low | `src/shared/data/mockData.ts:36,48,60` | **Open** (re-checked 2026-11-20) | Doctor mock avatar URLs point to `images.unsplash.com` blocked by strict `img-src self data: blob:`. |
| **SEC-09** | Secret Handling | Clean / Info | `utils/supabase/info.tsx:23-25` | Resolved / Documented | Confirmed clean: anon key and project ID are dynamically read from `import.meta.env`. |
| **SEC-10** | DOM Sinks | Clean | Universal `src/**` | Resolved / Documented | Confirmed clean: 0 instances of `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function`. |
| **SEC-11** | External Links | Clean | `src/features/modals/VideoSessionModal.tsx:90` | Resolved / Documented | Confirmed clean: link specifies `target="_blank" rel="noreferrer noopener"`. |
| **SEC-12** | Window / Messaging | Clean | Universal `src/**` | Resolved / Documented | Confirmed clean: 0 instances of `window.open` or `window.postMessage`. |

---

## 4. Comprehensive Inventory of LocalStorage & SessionStorage Keys

A complete scan of all browser storage calls across the frontend was performed. The application uses **17 distinct `localStorage` keys** and **1 `sessionStorage` key**. This inventory is the original audit table. After the SEC-03 fix (2026-11-20), the CBT records, worry list, safety plan, three anchors and the trusted contact no longer appear as plaintext under the names below: they are stored as AES-GCM ciphertext under opaque `mindsahaay_sec_*` keys, and `clearAllLocalUserData()` removes all `mindsahaay*` and `sb-*` keys on logout and erase while keeping theme and language. The "Vulnerability" text in those rows describes the original state.

| Storage Key | Storage API | Component / Module | Data Stored | Sensitivity / DPDP Classification | Risk & Recommended Fix |
|---|---|---|---|---|---|
| `mindsahaay-theme` | `localStorage` | `AppLayout.tsx:36,44`<br>`Settings.tsx:30,38` | `"dark"` or `"light"` string | Low (UI Preference) | Low risk. Safe to retain in `localStorage`. |
| `mindsahaay_demo_mode` | `localStorage` | `demoMode.ts:67,73`<br>`supabase.ts:24` | `"true"` or `"false"` string | Low (Application Flag) | Low risk. Presentation toggle. |
| `mindsahaay_demo_role` | `localStorage` | `demoMode.ts:76,84` | `"student"`, `"counsellor"`, `"moderator"`, `"institution_admin"` | Low (Role Selector) | Low risk for demo presentation. |
| `mindsahaay-cbt-activities` | `localStorage` | `src/features/cbt/storage.ts:3` | JSON array of `Activity` objects (activity name, moodBefore, moodAfter, category) | **High** (Personal Psychological Data) | **Vulnerability:** Plaintext CBT behavioral activation records accessible to any script and anyone with access to a shared lab or hostel computer. **Fix:** Encrypt using WebCrypto AES-GCM before saving or store in authenticated Supabase table. |
| `mindsahaay-cbt-worry` | `localStorage` | `src/features/cbt/storage.ts:4` | JSON object of `WorryState` (worry time, duration, array of parked worry thought strings) | **High** (Intimate Thought Records) | **Vulnerability:** Plaintext storage of personal anxieties and intrusive thoughts. **Fix:** Encrypt via `encryptJournal` before saving. |
| `mindsahaay_demo_consents` | `localStorage` | `ConsentLedger.tsx:50`<br>`Onboarding.tsx:71`<br>`Settings.tsx:65` | JSON record of active user consents | Medium (Consent Status) | Used as demo fallback. Production uses `consents` Postgres table. |
| `mindsahaay_demo_safety_plan` | `localStorage` | `CrisisPage.tsx:56,125`<br>`Settings.tsx:67` | JSON object of suicide safety plan (warning signs, internal copings, safe places, emergency anchors) | **Critical** (Crisis Safety Plan) | **Vulnerability:** Unencrypted crisis intervention data. If local device is compromised, private coping mechanisms and distress indicators are exposed. **Fix:** Require vault passphrase to unlock. |
| `mindsahaay-habits-YYYY-MM-DD` | `localStorage` | `DailyMicroHabits.tsx:5,17` | JSON array of completed habit IDs for the current calendar date | Low (Habit Checklist) | Low risk wellness tracking. |
| `mindsahaay-habit-streak` | `localStorage` | `DailyMicroHabits.tsx:26,44` | Integer string representing active streak days | Low (Habit Counter) | Low risk gamification metric. |
| `mindsahaay-anchor1` | `localStorage` | `SafetyCardModal.tsx:11,18` | Grounding anchor text string (e.g., "Ice water on face & wrists + 4-7-8 breathing") | Medium-High (Crisis Anchor) | Crisis grounding text. Should be cleared upon logout. |
| `mindsahaay-anchor2` | `localStorage` | `SafetyCardModal.tsx:12,19` | Grounding anchor text string (e.g., "Step outside hostel block to the campus lawn") | Medium-High (Crisis Anchor) | Crisis grounding text. Should be cleared upon logout. |
| `mindsahaay-anchor3` | `localStorage` | `SafetyCardModal.tsx:13,20` | Grounding anchor text string (e.g., "Play 432Hz Tibetan Bowl soundscape...") | Medium-High (Crisis Anchor) | Crisis grounding text. Should be cleared upon logout. |
| `mindsahaay-friend` | `localStorage` | `SafetyCardModal.tsx:14,21` | Trusted emergency contact string (e.g., `"Kabir (Roommate) · +91 98765 43210"`) | **High** (Third-Party PII: Name & Phone Number) | **Vulnerability:** Plaintext contact name and personal mobile phone number stored without encryption. **Fix:** Encrypt or store in encrypted safety plan. |
| `mindsahaay_demo_alias` | `localStorage` | `Onboarding.tsx:72` | Student chosen display alias/pseudonym | Medium (Identity pseudonym) | Stored during demo onboarding. |
| `mindsahaay_onboarding_completed` | `localStorage` | `Onboarding.tsx:75` | `"true"` flag | Low (State Flag) | Low risk. |
| `mindsahaay_demo_moods` | `localStorage` | `Settings.tsx:66` | JSON array of mood check-in records | **High** (Affective/Mood History) | Read during settings export if populated. |
| `sb-<project-id>-auth-token` | `localStorage` | Managed by `@supabase/supabase-js` (referenced in `AuthProvider.tsx:53`) | Supabase auth session: JWT `access_token`, `refresh_token`, expiry | **Critical** (Session Bearer Token) | **Vulnerability:** Standard browser storage for single-page apps; token accessible if XSS occurs. **Fix:** Mitigated by strict CSP (`script-src 'self'`); future architecture should consider HttpOnly session cookies. |
| `mindsahaay_demo_vault_meta` | `sessionStorage` | `src/features/journal/vault.ts:79,119` | JSON object containing PBKDF2 salt, iteration count, and ciphertext check sentinel | **High** (Crypto Vault Metadata) | Properly isolated to `sessionStorage` (tab lifecycle only). Automatically purged when tab closes. |

---

## 5. Detailed Findings & Required Fixes for `src` Owner

Because the security worker is restricted by project boundaries to read-only access on `src/**`, the following items detail the exact vulnerability, line numbers, and recommended code modifications that the `src` folder owner must implement.

### Finding SEC-01: Daily.co Video Consultation Iframe Lacks `sandbox` Attribute
- **File:** `src/features/modals/VideoSessionModal.tsx`
- **Lines:** 74–80
- **Severity:** Medium-High
- **Vulnerability Description:**
  The tele-counselling video room embeds Daily.co via an `<iframe>`:
  ```tsx
  <iframe
    title={t("video.iframeTitle", { name: appointment?.doctorName ?? "" })}
    src={room.src}
    allow="camera; microphone; fullscreen; display-capture; autoplay"
    className="h-[420px] w-full rounded-xl border border-[var(--line)] bg-[var(--canvas)]"
  />
  ```
  Although `room.src` is validated via `buildDailyEmbedUrl`, the `<iframe>` tag does not include a `sandbox` attribute. Without sandboxing, an embedded frame has broader document privileges than required for WebRTC video calling.
- **Recommended Fix:**
  Add the least-privilege `sandbox` attribute necessary for Daily.co prebuilt calling (`allow-scripts allow-same-origin allow-forms allow-popups allow-modals`):
  ```tsx
  <iframe
    title={t("video.iframeTitle", { name: appointment?.doctorName ?? "" })}
    src={room.src}
    allow="camera; microphone; fullscreen; display-capture; autoplay"
    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
    className="h-[420px] w-full rounded-xl border border-[var(--line)] bg-[var(--canvas)]"
  />
  ```

---

### Finding SEC-02: Unvalidated Backup Meeting URL Hostname
- **File:** `src/features/modals/VideoSessionModal.tsx`
- **Lines:** 44 and 90
- **Severity:** Medium
- **Vulnerability Description:**
  In `VideoSessionModal.tsx`, the backup link logic is:
  ```tsx
  const backup = appointment?.meetingUrl && /^https:\/\//.test(appointment.meetingUrl) ? appointment.meetingUrl : null;
  ```
  This regular expression only confirms that the URL begins with `https://`. If a compromised or malicious appointment record contains an external URL (such as `https://phishing.example.com`), clicking the backup link opens that untrusted destination in a new tab.
- **Recommended Fix:**
  Enforce the same domain validation used by `buildDailyEmbedUrl`:
  ```tsx
  const backup = (() => {
    if (!appointment?.meetingUrl) return null;
    try {
      const u = new URL(appointment.meetingUrl);
      return (u.protocol === "https:" && (u.hostname === "daily.co" || u.hostname.endsWith(".daily.co")))
        ? appointment.meetingUrl
        : null;
    } catch {
      return null;
    }
  })();
  ```

---

### Finding SEC-03: Plaintext Storage of PII & Psychological Data in `localStorage`
- **File:** `src/features/modals/SafetyCardModal.tsx` (Lines 14, 21), `src/features/cbt/storage.ts` (Lines 3–4, 26–42), and `src/features/crisis/CrisisPage.tsx` (Lines 56, 125)
- **Severity:** High
- **Vulnerability Description:**
  1. `SafetyCardModal.tsx` stores a friend's full name and personal telephone number (`mindsahaay-friend`) directly in browser `localStorage`.
  2. `src/features/cbt/storage.ts` stores user CBT thought records and parked worries in `mindsahaay-cbt-activities` and `mindsahaay-cbt-worry`.
  3. `CrisisPage.tsx` stores the student's personal suicide safety plan in `mindsahaay_demo_safety_plan`.
  
  On shared university terminals, unencrypted `localStorage` remains readable across browser restarts until manually cleared.
- **Status:** **FIXED AND BROWSER-VERIFIED (2026-11-20)**
- **Implemented Remediation:**
  1. Created `src/shared/lib/storage/secureStore.ts`: zero-knowledge AES-256-GCM encrypted wrapper over `localStorage` utilizing in-memory PBKDF2 vault key material (`journalCrypto.ts`, `vault.ts`).
  2. Opaque prefixed storage keys (`mindsahaay_sec_*`) prevent semantic leakage of mental health artifact types.
  3. One-time automatic migration on vault unlock encrypts any pre-existing plaintext records and deletes plaintext originals from browser storage.
  4. Crisis Safety Card (`SafetyCardModal.tsx`) ensures students are never blocked by a locked vault: generic grounding anchors and 24/7 helplines (Tele-MANAS 14416, KIRAN 1800-599-0019, 112) remain static in code, offering vault unlock for personal anchors.
  5. Centralized `clearAllLocalUserData()` cleans up all application-owned keys (`mindsahaay*`, `sb-*`) on `signOut` and account erasure while explicitly preserving theme and language preferences.
- **Verification (2026-11-20):** data was saved through the UI and storage was inspected: no plaintext and no passphrase are present, and the records are unreadable while the vault is locked. The safety card still shows the helplines while the vault is locked.
- **Original recommended fix (superseded by the remediation above):** encrypt the friend contact, anchors and CBT records, or keep them in memory only.

---

### Finding SEC-04: Open Redirect Vulnerability in Auth Callbacks
- **File:** `src/app/providers/AuthProvider.tsx`
- **Lines:** 213–248
- **Severity:** Medium
- **Vulnerability Description:**
  In `AuthProvider.tsx`:
  ```tsx
  const signInWithEmail = useCallback(
    async (email: string, redirectTo?: string) => {
      ...
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo:
            redirectTo || (typeof window !== "undefined" ? window.location.origin : undefined),
        },
      });
  ```
  And similarly in `signInWithGoogle`:
  ```tsx
  redirectTo: redirectTo || (typeof window !== "undefined" ? window.location.origin : undefined),
  ```
  If `redirectTo` is supplied from an untrusted source (such as `window.location.search`), an attacker could craft an email magic link or OAuth initiation with `?redirectTo=https://attacker.com/malicious`.
- **Recommended Fix:**
  Sanitize and validate `redirectTo` before passing it to Supabase. Ensure it is either a safe relative path or belongs to the current application origin:
  ```tsx
  function sanitizeRedirectUrl(url?: string): string | undefined {
    if (!url) return undefined;
    if (url.startsWith("/") && !url.startsWith("//")) {
      return `${window.location.origin}${url}`;
    }
    try {
      const parsed = new URL(url);
      if (parsed.origin === window.location.origin) return parsed.toString();
    } catch {
      // Fall through to fallback
    }
    return window.location.origin;
  }
  ```

---

### Finding SEC-05: Potential Sensitive Data Exposure in ErrorBoundary Console Logging
- **File:** `src/app/ErrorBoundary.tsx`
- **Lines:** 24–29
- **Severity:** Medium
- **Vulnerability Description:**
  ```tsx
  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (process.env.NODE_ENV !== "test") {
      console.error("MindSahaay Uncaught Error Boundary:", error, errorInfo);
    }
  }
  ```
  In production, if a component crashes while rendering a student's private journal entry, suicide crisis note, chat history, or personal phone number, `errorInfo.componentStack` and the `error` object may output component props or state into the browser console.
- **Recommended Fix:**
  Sanitize error telemetry in production. Only log `error.name` or strip props from component stacks, and log details only when `import.meta.env.DEV` is true:
  ```tsx
  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("MindSahaay Error Boundary:", error.name, error.message);
    }
  }
  ```

---

### Finding SEC-06: Potential PII in Database and Validation Error Details
- **File:** `src/shared/lib/api/assessments.ts` (Line 222), `src/shared/lib/api/consents.ts` (Line 44), `src/shared/lib/api/errors.ts` (Line 29)
- **Severity:** Medium
- **Vulnerability Description:**
  Direct forwarding of Postgres error messages (`throw new ApiError(error.message, 500, error.code, { original: error })`). Database constraint violation messages frequently echo violating data inputs (such as student emails or record IDs). Additionally, `ValidationError` embeds raw Zod issues `parsed.error.issues`, which contain `issue.input`.
- **Recommended Fix:**
  In `ApiError` instantiation, return sanitized user-facing messages (e.g., `"Unable to save assessment at this time"`) and preserve raw database errors solely within server Edge Function logs.

---

### Finding SEC-07: Legacy API Anon Key Bearer Header
- **File:** `src/api.ts`
- **Line:** 44
- **Severity:** Low
- **Vulnerability Description:**
  ```ts
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  ```
  In `legacyRequest`, passing `SUPABASE_ANON_KEY` in the `Authorization: Bearer` header invokes edge functions under the unauthenticated `anon` role rather than the student's authenticated session.
- **Recommended Fix:**
  Complete migration away from the deprecated `src/api.ts` shim to `src/shared/lib/api/*`, where calls use `session.access_token` via `getAuthenticatedSession()`.

---

### Finding SEC-08: External Image Origin in Mock Data Blocked by Strict CSP
- **File:** `src/shared/data/mockData.ts`
- **Lines:** 36, 48, 60
- **Severity:** Low
- **Vulnerability Description:**
  Mock counsellor avatars reference `https://images.unsplash.com/...`. The production CSP enforces `img-src 'self' data: blob:`. Consequently, in production environments enforcing this policy, unsplash images will be blocked by the browser.
- **Recommended Fix:**
  Bundle counsellor avatar SVG/PNG assets locally under `/public/avatars/` or include `https://images.unsplash.com` in `img-src` if external demo stock photos remain required.

---

## 6. Security Hardening Implemented

### 6.1 Production HTTP Headers in `vercel.json`
A new `vercel.json` was created at the project root with the following security headers applied to all routes (`/(.*)`):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "cleanUrls": true,
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src https://*.daily.co; img-src 'self' data: blob:; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        }
      ]
    }
  ]
}
```

#### Directive Justification & Proof of Audit Requirements:
1. **`default-src 'self'` & `script-src 'self'`:** Restricts executable scripts strictly to application bundles origin. Inline `<script>` execution is forbidden.
2. **`style-src 'self' 'unsafe-inline'` – Audit Proof:**
   - **Audit Finding:** Multiple components across the codebase rely on dynamic inline React styles (`style={{ ... }}`):
     - `src/app/ErrorBoundary.tsx` (Lines 56–65, 71, 78–85, 93–124, 131, 139)
     - `src/features/auth/ProtectedRoute.tsx` (Line 88: `style={{ textDecoration: "none", display: "inline-flex" }}`)
     - `src/features/dashboard/CounsellorPortal.tsx` (Line 60: `style={{ fontSize: 13 }}`)
     - `src/features/modals/VideoSessionModal.tsx` (Line 47: `cardStyle={{ maxWidth: 760 }}`)
     - `src/features/mood/MoodCheckIn.tsx` (Lines 201, 204, 207: inline background and decoration styling)
     - Tailwind CSS v4 runtime and CSS variable bindings (`var(--line)`, `var(--canvas)`).
   - **Conclusion:** Without `'unsafe-inline'` in `style-src`, React's JSX inline style properties are blocked by the browser, corrupting the UI presentation and crisis layout.
3. **`connect-src 'self' https://*.supabase.co wss://*.supabase.co`:**
   - Supabase client connects to REST endpoints, Auth endpoints, Edge Functions (`https://*.supabase.co`), and Realtime WebSocket subscriptions (`wss://*.supabase.co`).
   - Browser client does **NOT** connect directly to `api.anthropic.com`. All Claude AI interactions are proxied through Supabase Edge Functions (`/chat/stream`), ensuring server API keys remain completely inaccessible to the browser.
4. **`frame-src https://*.daily.co`:**
   - Permits embedded tele-consultation video rooms hosted exclusively on Daily.co domains.
5. **`img-src 'self' data: blob:` & `media-src 'self' blob:`:**
   - Permits client-generated Blob URLs used for DPDP machine-readable data export downloads (`PrivacyModal.tsx:27`, `Settings.tsx:84`).
6. **`frame-ancestors 'none'` & `X-Frame-Options: DENY`:**
   - Defends students from clickjacking attacks by preventing external origins from framing MindSahaay.
7. **`Permissions-Policy: camera=(self), microphone=(self), geolocation=(), payment=(), usb=()`:**
   - Restricts sensitive hardware permissions (camera and microphone) exclusively to the first-party origin for verified Daily.co tele-health consultations. Disables unnecessary browser capabilities (geolocation, payment, USB).

---

### 6.2 Technical Reasoning on Meta CSP in `index.html` vs. Vite Dev Server
The user instructions required:
> *"Mirror a conservative CSP as a meta tag in index.html only if it does not break Vite dev (report your reasoning)."*

#### Technical Evaluation:
1. **WebSocket HMR Rejection:** During local development and within the Figma Make development environment, Vite serves the app on `$PORT` (default 8443 or 5173). The Vite client (`/@vite/client`) maintains an active Hot Module Replacement (HMR) WebSocket connection to `ws://localhost:8443` or `ws://localhost:5173`. If a production CSP meta tag containing `connect-src 'self' https://*.supabase.co wss://*.supabase.co` is placed in `index.html`, the browser immediately blocks `ws://localhost:*` as a CSP violation, terminating HMR and breaking live updates.
2. **Dynamic Script & Inline Module Injection:** Vite dynamically transforms ES modules and injects inline scripts/styles during development. A strict meta tag without dev host allowlists causes CSP evaluation errors across modules.
3. **Figma Make Iframe Embedding:** In Figma Make, the development preview is rendered inside an iframe. Enforcing strict framing restrictions in dev meta tags interferes with the preview panel.
4. **Implementation Decision:**
   - The active CSP is authoritatively delivered via HTTP response headers in `vercel.json` for production deployments.
   - In `index.html`, an explicit developer reference block was inserted inside `<head>`, detailing the production policy while omitting the active meta tag to preserve Vite HMR and dev server stability.

---

### 6.3 Public Privacy & Vulnerability Disclosure Files
1. **`public/robots.txt`:**
   Created with a universal disallow rule (`User-agent: *`, `Disallow: /`). For a university mental health platform holding student well-being records, search engine crawling and external web indexing must be completely blocked to prevent accidental indexing of student profiles, assessment results, or care queues.
2. **`public/.well-known/security.txt`:**
   Created following RFC 9116 specifications. Features canonical URL, preferred languages (`en, hi`), standard expiry date (`2027-12-31T23:59:59.000Z`), and placeholder contact marked `[STUDENT: set contact]`.

---

### 6.4 Continuous Integration & Automated Security Workflows

The `.github/workflows/` directory was extended with five modular, least-privilege GitHub Actions workflows:

1. **`ci.yml` (Optimized with Playwright Browser Caching):**
   - Preserves typecheck, lint, coverage test, build, and E2E test execution.
   - Extends the `e2e` job with `actions/cache@v4` targeting `~/.cache/ms-playwright` keyed by `runner.os` and `pnpm-lock.yaml`, avoiding redundant browser binary downloads.
2. **`e2e.yml` (Dedicated Playwright E2E Workflow):**
   - Installs Chromium with OS dependencies (`npx playwright install --with-deps chromium`).
   - Runs `npx playwright test`.
   - Uploads HTML report and trace artifacts (`actions/upload-artifact@v4`) with 14-day retention (`if: always()`).
3. **`security.yml` (Multi-Layer Security Scanning):**
   - **Gitleaks (`gitleaks/gitleaks-action@v2`):** Scans git history for exposed credentials, API keys, or tokens (`permissions: contents: read`).
   - **CodeQL (`github/codeql-action/init@v3`, `analyze@v3`):** Performs semantic static analysis for JavaScript and TypeScript vulnerability patterns (`permissions: security-events: write`).
   - **Dependency Audit:** Runs `npm audit --audit-level=high` in a non-blocking configuration (`continue-on-error: true`), surfacing high-severity vulnerability alerts without blocking continuous delivery.
4. **`pgtap.yml` (Database pgTAP Test Suite):**
   - Uses `supabase/setup-cli@v1` with Docker on `ubuntu-latest`.
   - Starts local Supabase stack (`supabase start`).
   - Executes database schema migrations and seed scripts (`supabase db reset`).
   - Runs the complete pgTAP regression test suite (`supabase test db`) covering RLS isolation, care shares, zero-knowledge journals, append-only triggers, and k-anonymity matrices.
5. **`eval-nightly.yml` (Nightly Crisis Detection Evaluation):**
   - Runs nightly at 02:00 UTC via cron schedule (`0 2 * * *`) and on manual dispatch.
   - Executes deterministic keyword evaluation (`node scripts/eval-keyword.ts`) against the synthetic crisis dataset.
   - Conditionally executes LLM evaluation (`node scripts/eval-llm.ts`) only when the `ANTHROPIC_API_KEY` GitHub Actions secret is present.
   - Generates the unified comparison report (`node scripts/eval-report.ts`) and uploads results as an artifact (`eval/results/`).

*Note on CI Execution:* The YAML workflow definitions have been validated by careful schema reading and linting according to GitHub Actions specifications. As per testing environment constraints, they have not been run against live GitHub Actions runners.

---

## 7. Action Plan for `src` Code Owner

To complete the remediation of all identified findings, the `src` owner should apply the following diffs:

```diff
--- a/src/features/modals/VideoSessionModal.tsx
+++ b/src/features/modals/VideoSessionModal.tsx
@@ -44,1 +44,8 @@
-  const backup = appointment?.meetingUrl && /^https:\/\//.test(appointment.meetingUrl) ? appointment.meetingUrl : null;
+  const backup = (() => {
+    if (!appointment?.meetingUrl) return null;
+    try {
+      const u = new URL(appointment.meetingUrl);
+      return (u.protocol === "https:" && (u.hostname === "daily.co" || u.hostname.endsWith(".daily.co")))
+        ? appointment.meetingUrl
+        : null;
+    } catch {
+      return null;
+    }
+  })();
@@ -77,1 +84,2 @@
           src={room.src}
+          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
           allow="camera; microphone; fullscreen; display-capture; autoplay"
```

```diff
--- a/src/app/providers/AuthProvider.tsx
+++ b/src/app/providers/AuthProvider.tsx
@@ -213,2 +213,9 @@
+  const resolveSafeRedirect = (target?: string) => {
+    if (!target) return typeof window !== "undefined" ? window.location.origin : undefined;
+    if (target.startsWith("/") && !target.startsWith("//")) {
+      return typeof window !== "undefined" ? `${window.location.origin}${target}` : undefined;
+    }
+    return typeof window !== "undefined" ? window.location.origin : undefined;
+  };
   const signInWithEmail = useCallback(
     async (email: string, redirectTo?: string): Promise<{ error: Error | null }> => {
@@ -220,2 +227,1 @@
-            emailRedirectTo:
-              redirectTo || (typeof window !== "undefined" ? window.location.origin : undefined),
+            emailRedirectTo: resolveSafeRedirect(redirectTo),
@@ -245,2 +251,1 @@
-            redirectTo:
-              redirectTo || (typeof window !== "undefined" ? window.location.origin : undefined),
+            redirectTo: resolveSafeRedirect(redirectTo),
```

```diff
--- a/src/app/ErrorBoundary.tsx
+++ b/src/app/ErrorBoundary.tsx
@@ -25,3 +25,3 @@
-    if (process.env.NODE_ENV !== "test") {
-      console.error("MindSahaay Uncaught Error Boundary:", error, errorInfo);
+    if (import.meta.env.DEV) {
+      console.error("MindSahaay Uncaught Error Boundary:", error.name, error.message);
     }
```

---

## 8. Update 2026-11-20 and conclusion

Verified since the first version of this document:

- SEC-03 fixed and browser-verified (see above).
- Server side: the edge function runs on the real Supabase Deno edge runtime. With real JWTs, a request carrying only the anon key returns 401, and `GET /students/<other-id>/export` returns the caller's own data (identity comes from the token, the URL id is ignored), so the original IDOR is closed. Doc 22 lists the 8 edge-function bugs fixed.
- SEC-09 stays clean: `utils/supabase/info.tsx` reads only `VITE_*` variables and holds no fallback project.
- Client-side findings from the independent review of the new features (docs/28) were fixed after this audit and are separate from SEC-01 to SEC-12: offline outbox metadata (kind, time) now sits inside the encrypted payload and the database name uses a salted hash (G6-SEC-06); the offline page templating escapes values (G6-SEC-10); the crisis consent cache is only a hint and consent is re-verified on the server at send time (G6-SEC-09); the logout dialog now has Escape as the safe option and shows the three helplines (G6-SEC-03). Account erasure now deletes on the server first and then wipes local data including the outbox.
- Accessibility check with axe on 14 routes, light and dark, at 1280 and 375 px wide (57 combinations in the Playwright run) found zero serious or critical violations. The real-backend route sweep (docs/29) found no console errors and no failing Supabase requests. Both ran on Chromium only.

Still not done: SEC-01, SEC-02, SEC-04, SEC-05, SEC-07 and SEC-08 (and SEC-06 unconfirmed) remain open in `src`; no OWASP ZAP scan; no `pnpm audit` run; the five workflows in `.github/workflows/` have never run on a real runner; the project is not in a git repository yet; nothing is deployed to a hosted environment.

### Conclusion

With the deployment of `vercel.json` HTTP security headers, `public/robots.txt`, RFC 9116 `security.txt`, and comprehensive GitHub Actions workflows, the MindSahaay platform has a documented security baseline. Implementing the recommended `src` modifications would address the remaining client-side findings. This is not a claim of compliance with India's DPDP Act 2023: no legal review has been done and no dynamic scan has been run.
