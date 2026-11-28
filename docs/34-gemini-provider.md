# 34 Google Gemini Provider Integration & Multi-Provider AI Architecture

**Author:** Wave 4 Architectural & Documentation Worker (G3)  
**Date:** 2026-11-28  
**Status:** Implemented, Tested with Mocks & Documented  
**Scope:** `supabase/functions/server/gemini_client.ts`, `supabase/functions/server/claude.ts`, `supabase/functions/server/app.ts`, `supabase/functions/server/index.tsx`, `src/features/chat/**`, `docs/**`, `README.md`  
**Compliance & Standards:** India Digital Personal Data Protection (DPDP) Act 2023, Google Generative AI Terms of Service, Zero-Knowledge Storage Architecture

---

## 1. Executive Summary & Goals

MindSahaay features an interactive AI companion ("MindMate") designed to offer non-judgmental, empathetic active listening, grounded self-care grounding exercises, and immediate deterministic escalation to certified Indian national helplines (Tele-MANAS 14416, KIRAN 1800-599-0019, emergency 112).

Originally, the server edge function exclusively targeted the Anthropic Claude API (`claude-opus-5-5`). While Anthropic provides enterprise-grade privacy and safety guarantees, obtaining paid Anthropic API credits is a barrier for student evaluation and academic project assessment.

**Primary Goal:** The MindMate companion must work seamlessly with a **FREE Google Gemini API key** (obtained from Google AI Studio) provided by the evaluator or project owner, while Anthropic Claude remains the default production provider.

To achieve this without compromising patient safety, student privacy, or code cleanliness:
1. **Unified Pipeline Reuse:** A zero-SDK, fetch-based Gemini client (`gemini_client.ts`) matches the exact return interface of the Anthropic client, completely reusing the multi-layered safety pipeline: client/server lexicon detection, PII scrubbing/redaction, risk classification, server-buffered output guardrails, and deterministic fallbacks.
2. **Strict Data-Tier Gating:** Because Google's unpaid/free-tier terms permit human reviewers to read interaction logs and allow Google to use prompt/response text to train models, the server strictly refuses to call Gemini on the free tier unless an explicit administrative override (`AI_ALLOW_FREE_TIER=true`) is configured.
3. **Transparent Client Notice & Gate:** When running in free-tier demo mode, the web client displays a non-dismissible red warning banner and enforces a one-time user acknowledgement modal stored exclusively in `sessionStorage` before permitting any message dispatch.
4. **Resilient Rate Limiting & Graceful Degradation:** Project-wide call counters (`GEMINI_CALLS_PER_MIN` and `GEMINI_CALLS_PER_DAY`) track companion and classifier invocations against Google AI Studio quotas. Quota exhaustion or HTTP 429 responses trigger instant graceful degradation to deterministic empathetic templates and helpline footers—never throwing unhandled errors or leaking provider failure states.

---

## 2. Multi-Provider Architecture

The Edge Function runtime (`supabase/functions/server`) abstracts the underlying LLM provider behind a unified interface:

```
                          +---------------------------------------+
                          |   Student Client (React / Web App)    |
                          +---------------------------------------+
                                              |
                             POST /chat/message (SSE Stream)
                             GET  /chat/config  (Provider Metadata)
                                              v
                          +---------------------------------------+
                          |     Supabase Edge Runtime (Hono)      |
                          +---------------------------------------+
                                              |
                                              v
                          +---------------------------------------+
                          |      PII Scrubbing & Redaction        |
                          |  (Names, emails, phones, roll numbers)|
                          +---------------------------------------+
                                              |
                                              v
                          +---------------------------------------+
                          |     Crisis Lexicon Safety Check       |
                          +---------------------------------------+
                                 |                         |
                           Crisis Detected           Clean / Ambiguous
                                 |                         |
                                 v                         v
                       +-------------------+    +--------------------+
                       | Deterministic     |    |   AI_PROVIDER ?    |
                       | Crisis Template   |    +--------------------+
                       | + Helplines Card  |      /                \
                       +-------------------+     /                  \
                                                v                    v
                                       AI_PROVIDER=claude   AI_PROVIDER=gemini
                                                |                    |
                                                v                    v
                                      +-----------------+  +-------------------+
                                      | Anthropic Client|  |   Gemini Client   |
                                      | (Claude Messages|  | (Google Generative|
                                      |  x-api-key)     |  |  x-goog-api-key)  |
                                      +-----------------+  +-------------------+
                                                \                    /
                                                 \                  /
                                                  v                v
                                      +--------------------------------+
                                      |     Server Response Buffer     |
                                      +--------------------------------+
                                                      |
                                                      v
                                      +--------------------------------+
                                      | Output Guard & Validation      |
                                      | (No diagnosis, no harm methods)|
                                      +--------------------------------+
                                           |                      |
                                         Pass                    Fail
                                           |                      |
                                           v                      v
                             +-------------------------+  +--------------------+
                             | SSE 32-Char Chunk Stream|  | Empathetic Fallback|
                             | (preparing/chunk/done)  |  | + Helpline Footer  |
                             +-------------------------+  +--------------------+
```

### 2.1 Provider Selection

Provider routing is controlled by the server environment variable `AI_PROVIDER`:
- `AI_PROVIDER=claude` (default): Uses the Anthropic client (`claude.ts`).
- `AI_PROVIDER=gemini`: Uses the Google Gemini client (`gemini_client.ts`).
- Any other value or unset (when keys are absent): Disables LLM calls entirely and gracefully defaults to the static deterministic supportive template with helplines.

---

## 3. Gemini Client Specification (`gemini_client.ts`)

The Gemini integration is implemented in `supabase/functions/server/gemini_client.ts` using standard Web Fetch without external npm/Deno SDKs, maintaining compatibility with the Supabase Edge Runtime.

### 3.1 Endpoint & Authentication

- **Endpoint:** `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- **Security Rule for API Keys:** The Google API key is transmitted **EXCLUSIVELY** via the HTTP header `x-goog-api-key: <GEMINI_API_KEY>`. The key is **NEVER** appended as a URL query parameter (`?key=...`). This guarantees that the key is not recorded in HTTP proxy logs, server access logs, or error traces.
- **Model Identifier:** Stored in a single constant `DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"`, overridable via the `GEMINI_MODEL` environment variable (with `gemini-3.5-flash-lite` designated as the low-quota alternative).
  > [!NOTE]
  > As recorded in Section 9, the exact model identifier `gemini-3.8-flash` is **UNVERIFIED** against Google's live API table. The constant is centralized in one file to allow immediate adjustment if Google alters model naming.

### 3.2 Request Structure

1. **System Instruction:**
   ```json
   {
     "systemInstruction": {
       "parts": [{ "text": "<MindMate System Prompt>" }]
     }
   }
   ```
2. **Contents & History Mapping:**
   Prior conversation turns from the encrypted database history are already scrubbed of PII. Roles are mapped to Gemini's expected schema:
   - `user` -> `user`
   - `assistant` -> `model`
   ```json
   {
     "contents": [
       { "role": "user", "parts": [{ "text": "I feel overwhelmed with finals." }] },
       { "role": "model", "parts": [{ "text": "I hear how demanding this period is for you..." }] },
       { "role": "user", "parts": [{ "text": "Yes, I cannot sleep." }] }
     ]
   }
   ```
3. **Generation Configuration:**
   - For companion chat: `maxOutputTokens: 1024`, `temperature: 0.7`.
   - For risk classifier: `temperature: 0`, `responseMimeType: "application/json"`, with `responseSchema`:
     ```json
     {
       "type": "STRING",
       "enum": ["crisis", "moderate", "low", "none"]
     }
     ```

### 3.3 Safety Settings & Candidate Block Handling

Google Gemini applies automated safety classifiers across four categories:
- `HARM_CATEGORY_HARASSMENT`
- `HARM_CATEGORY_HATE_SPEECH`
- `HARM_CATEGORY_SEXUALLY_EXPLICIT`
- `HARM_CATEGORY_DANGEROUS_CONTENT`

Because mental health conversations frequently discuss distress, despair, or self-harm, improper safety thresholds could prematurely drop or corrupt safety-critical responses:

1. **Risk Classifier Safety Configuration:**
   - Threshold set to `BLOCK_NONE` across all 4 categories.
   - **Reason:** The classifier must inspect raw distress expressions to categorize crisis severity. If Google blocks the message before the classifier analyzes it, risk detection fails.
   - **Fail-Safe Mechanism:** If Google's safety filter nonetheless triggers a block with finish reason `SAFETY` for `HARM_CATEGORY_DANGEROUS_CONTENT`, the server immediately overrides the outcome to `CRISIS`. Any other block fails safe to the degraded template + helplines.
2. **Companion Chat Safety Configuration:**
   - Threshold set to `BLOCK_ONLY_HIGH` across all 4 categories.
   - If the candidate response is blocked by safety filters or returns empty text:
     - The output guard triggers a fallback.
     - The server delivers the deterministic supportive fallback reply and appends the mandatory support footer containing Tele-MANAS (14416), KIRAN (1800-599-0019), and emergency (112).
3. **Candidate Text Aggregation:**
   Candidate parts are joined across all candidate text segments (`parts.map(p => p.text).join('')`) to prevent truncated responses.

### 3.4 Non-Streaming Buffering & SSE Emulation

The Gemini client performs non-streaming HTTP fetches. The server edge function buffers the response until complete, runs the output guard verification (`validateOutput()`), and subsequently streams the response to the frontend client in 32-character Server-Sent Event (SSE) chunks:
- `event: preparing\ndata: {}\n\n`
- `event: chunk\ndata: {"text": "..."}\n\n`
- `event: done\ndata: {}\n\n`

This preserves 100% byte-level wire compatibility with the frontend `Chat.tsx` streaming consumer.

---

## 4. Rate Limiting, Quotas & Error Handling

Google AI Studio free tier imposes strict quotas:
- Flash models typically enforce 15 Requests Per Minute (RPM), 1,500 Requests Per Day (RPD), or 1,000,000 Tokens Per Minute (TPM).

### 4.1 Server-Side Rate Limiter

The server enforces project-wide rate limits using the existing Postgres `rate_limits` table and `check_rate_limit()` RPC:
- `llm:gemini:min`: Governed by `GEMINI_CALLS_PER_MIN` (recommended `12`, ~80% of 15 RPM).
- `llm:gemini:day`: Governed by `GEMINI_CALLS_PER_DAY` (recommended `1200`, ~80% of 1,500 RPD).
- Companion chat turns and classifier calls both draw from this shared counter.

### 4.2 Fail-Safe Degradation Matrix

| Event | Status Code | Server Behavior | Client Impact |
|---|---|---|---|
| Rate limit exceeded | Internal check | Degraded supportive template + helplines | Clean response, zero error banner |
| Google 429 Quota Exceeded | HTTP 429 | Degraded supportive template + helplines | Clean response, zero error banner |
| Google 500 / 503 Internal Error | HTTP 5xx | Degraded supportive template + helplines | Clean response, zero error banner |
| Network Timeout (> 30s) | Fetch abort | Degraded supportive template + helplines | Clean response, zero error banner |
| Safety Block (Classifier - Dangerous) | Finish reason `SAFETY` | Fails safe to **CRISIS** trigger | Immediate crisis card & helplines |
| Safety Block (Companion) | Finish reason `SAFETY` | Fallback reply + helpline footer | Empathetic guidance & helplines |
| Output Guard Violation | Regex match | Fallback reply + helpline footer | No diagnostic advice rendered |

**Zero In-Request Retries:** Under rate-limited or error conditions, the server never loops or retries inside the request, preventing request pile-ups and socket exhaustion.

### 4.3 Logging Restrictions

To protect student privacy and satisfy DPDP requirements:
- **Allowed Logs:** HTTP status code, Google error status code (e.g. `RESOURCE_EXHAUSTED`), and token usage metadata.
- **Strictly Forbidden Logs:** Prompts, messages, completions, PII, URLs with query parameters, or API keys.

---

## 5. Security & Privacy Safeguards (Data-Tier Gating)

### 5.1 The Data-Tier Dilemma

Under the **Google AI Studio Terms of Service for Unpaid Services**:
1. **Model Training:** Google may use prompts, completions, and conversation context to train, tune, and improve Google products and machine-learning models.
2. **Human Review:** Human reviewers may read, annotate, and process user interactions.
3. **Medical Disclaimer:** The service cannot be used for medical advice or clinical diagnosis.
4. **Age Restriction:** Restricted to users aged 18 and older.

Under the **India Digital Personal Data Protection (DPDP) Act 2023**:
- Mental health conversations constitute sensitive personal data requiring strict purpose limitation (Section 6).
- Processing data for unauthorized third-party model training without explicit, itemized, informed consent violates DPDP fiduciary obligations.

### 5.2 Two-Tier Administrative Gate

To prevent accidental data exposure in production, the server enforces a double-lock:

```
                  +----------------------------------+
                  |     AI_PROVIDER == 'gemini'      |
                  +----------------------------------+
                                   |
                  +----------------------------------+
                  |       Check AI_DATA_TIER         |
                  +----------------------------------+
                     /                            \
           AI_DATA_TIER='paid'             AI_DATA_TIER='free'
                   /                                \
                  v                                  v
       [ ALLOW GEMINI CALL ]          +------------------------------+
       (Zero training, enterprise)     |    Check AI_ALLOW_FREE_TIER  |
                                      +------------------------------+
                                         /                        \
                                  == 'true'                    != 'true'
                                     /                              \
                                    v                                v
                        [ ALLOW DEMO GEMINI ]             [ REJECT GEMINI CALL ]
                        (Banner + Modal Gate)             (Fallback to template)
```

The server configuration strictly refuses to call Google Gemini (falling back to deterministic templates) unless:
1. `AI_DATA_TIER=paid`, OR
2. `AI_DATA_TIER=free` **AND** `AI_ALLOW_FREE_TIER=true`.

### 5.3 Client-Side Banner & Acknowledgement Gate

The client queries `GET /chat/config` on component initialization. When `{ provider: 'gemini', dataTier: 'free' }` is returned:

1. **Non-Dismissible Warning Banner:**
   A prominent red warning banner is pinned above the chat conversation:
   > **Demo mode:** Messages go to Google's free Gemini service, may be read by human reviewers and used to improve Google products. Do not enter real or identifying information.
   *(Localized in English and Hindi)*.
2. **One-Time Acknowledgement Modal:**
   Before the student can type or send their first chat message, a modal dialog blocks input until the user acknowledges the demo terms.
3. **Session-Only Persistence:**
   The acknowledgement state is recorded strictly in `sessionStorage` (`mindsahaay_gemini_demo_ack`). It is never written to `localStorage` or synced to the backend database, ensuring that any new browser session or tab re-prompts the user.

---

## 6. Pipeline Fixes & Refactoring

During the Gemini integration, two critical cross-cutting pipeline improvements were incorporated:

1. **Moderation Route Pre-Redaction (`app.ts`):**
   - *Previous Defect:* The community moderation classifier endpoint passed raw, unredacted user text to the LLM classifier (around line 1008).
   - *Fix:* Text is now piped through `redactPii()` prior to invoking the classifier, preventing roll numbers, emails, and phone numbers from reaching LLM provider endpoints.
2. **Output Guard & Fallback Enforcement (`claude.ts`):**
   - *Previous Defect:* An empty string returned by an LLM could bypass output validation.
   - *Fix:* Empty candidate replies are explicitly categorized as output guard failures.
   - *Helpline Guarantee:* The final catch-all fallback path guarantees attachment of the standard support footer with verified helpline numbers.

---

## 7. Owner Runbook: Running with a Free Gemini API Key

This section provides the exact operational procedure for the project owner or evaluator to run MindSahaay locally with a free Google Gemini API key.

### Step 1: Obtain a Free Google Gemini API Key
1. Sign in to [Google AI Studio](https://aistudio.google.com/).
2. Click **Get API key** and create an API key in a Google Cloud project.
3. Note your key (`AIzaSy...`). Keep it confidential.

### Step 2: Confirm Git-Ignore Status
Ensure your local environment file will never be committed:
```powershell
git check-ignore -v supabase/.env
```
*Expected output:* `.env*` or `supabase/.env` showing that git ignores the file.

### Step 3: Create Local Environment File `supabase/.env`
Create or edit `supabase/.env` with the following configuration:
```ini
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8443
AI_PROVIDER=gemini
GEMINI_API_KEY=AIzaSyYourActualKeyHere
GEMINI_MODEL=gemini-3.8-flash
AI_DATA_TIER=free
AI_ALLOW_FREE_TIER=true
GEMINI_CALLS_PER_MIN=12
GEMINI_CALLS_PER_DAY=1200
```

### Step 4: Launch Edge Functions & Development Server
In terminal 1 (Edge Functions):
```powershell
supabase functions serve --env-file supabase/.env
```

In terminal 2 (Frontend Client):
```powershell
pnpm dev
```

### Step 5: Verify Free-Tier Experience
1. Open `http://localhost:8443` (or `5173`) and sign in or use Demo Mode.
2. Navigate to `/chat`.
3. Verify that the **red demo banner** is visible above the chat area.
4. Verify that the **acknowledgement modal** appears before sending the first message.
5. Send a synthetic prompt (e.g. *"I am stressed about my exam tomorrow"*).
6. Verify that the assistant responds empathetically and stream chunks arrive smoothly.
7. Test safety escalation: Send *"I want to kill myself"*.
8. Verify that the crisis card immediately renders with Tele-MANAS (14416), KIRAN (1800-599-0019), and 112, bypassing the LLM companion.

### Step 6: Post-Evaluation Cleanup
- **NEVER** run `supabase secrets set GEMINI_API_KEY=...` on a hosted Supabase project with a free key.
- Immediately delete or rotate the API key in Google AI Studio after completing evaluation.

---

## 8. Provider Comparison Matrix

| Dimension | Anthropic Claude (Default) | Google Gemini Free Tier | Google Gemini Paid / Vertex AI |
|---|---|---|---|
| **Primary Use Case** | Production / Pilot Deployment | Academic Demo & Local Evaluation | Scaled Enterprise Production |
| **Data Training Policy** | Zero customer data training on API | Content used to train Google models | Zero customer data training |
| **Human Review** | No human review of API calls | Human reviewers may inspect chats | No human review |
| **Cross-Border Transfer** | Processes outside India | Processes globally | Option for `asia-south1` (Mumbai) |
| **DPDP Act Compliance** | Requires signed commercial DPA | **Non-compliant** for real user data | Fully compliant with enterprise DPA |
| **Rate Limits** | Tiered tokens/min (high) | Strict 15 RPM / 1,500 RPD | High quota scalable by billing |
| **Cost** | Paid per million tokens | **Free ($0)** | Paid per million tokens |
| **Client UI Indication** | Normal companion UI | Red warning banner + modal gate | Normal companion UI |
| **Authentication Header** | `x-api-key` | `x-goog-api-key` | `x-goog-api-key` or OAuth2 bearer |

---

## 9. Limitations & Unverified Aspects

To maintain the honest engineering standard established in `docs/19-known-limitations.md`:

1. **Unverified Model Identifier (`gemini-3.8-flash`):**
   - The default model string `gemini-3.8-flash` was recommended by architectural advisors but **has not been validated against the live Google API endpoint table**.
   - If Google's API returns `404 Model Not Found`, update the constant `DEFAULT_GEMINI_MODEL` in `supabase/functions/server/gemini_client.ts` to `gemini-1.5-flash` or `gemini-2.0-flash`.
2. **Live External Endpoint Smoke Test:**
   - Automated CI and test runs mock the Google Gemini endpoints.
   - Live network tests are explicitly skipped unless both `GEMINI_API_KEY` and `RUN_LIVE_AI=1` are present in the environment.
   - Live streaming latency (time-to-first-token) and candidating behavior under poor mobile network conditions have not been field-tested.
3. **Classifier Safety Filter Interception:**
   - While `BLOCK_NONE` is configured for the classifier, Google may occasionally enforce server-side hard safety blocks. The platform is designed to fail safe to `CRISIS` if dangerous content triggers a block, but this has been tested only against synthetic mocks.
4. **Free Tier Concurrency:**
   - The free-tier 15 RPM cap cannot support concurrent users. If multiple students access chat simultaneously in demo mode, requests will quickly trigger the 429 fallback path.
