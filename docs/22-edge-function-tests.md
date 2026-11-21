# 22. Edge function tests (Vitest, plus a real edge runtime check)

The Supabase edge function (`supabase/functions/server`) is a Hono app written for Deno. The function is split so that all of its logic runs under Vitest in Node (188 edge-function tests in 9 files as of 2026-11-20, all passing; they are part of the full Vitest run: 818 tests passed and 1 skipped, in 71 passed files and 1 skipped file). Separately, on 2026-11-20 it was run on the **real Supabase Deno edge runtime** (`supabase functions serve`) and exercised through the API with real JWTs; see "Real edge runtime verification" at the end of this document.

## How it is made testable

| File | Role |
| --- | --- |
| `server/index.tsx` | Deno entrypoint only. Wires `Deno.env`, `jsr:@supabase/supabase-js`, the JWT check and the Anthropic SDK into `createApp`, then calls `Deno.serve`. Not imported by tests. |
| `server/app.ts` | `createApp(deps)` returns the Hono app. All routes live here. Runtime access goes through `AppDeps`: `env`, `verifyJwt`, `getAdminClient`, `getUserClient`, `createAnthropic`, `fetchImpl`. |
| `server/anthropic_client.ts` | The only file that imports `npm:@anthropic-ai/sdk`. |
| `server/claude.ts` | Companion pipeline. Takes an injectable `createClient` (an `AnthropicFactory`), so it has no Deno-only imports. |
| `server/test_helpers.ts` | Fake Anthropic client and a recording fake Supabase query builder. |

Relative imports keep their explicit `.ts` extensions, which Deno requires. `vitest.config.ts` strips the `npm:` prefix (`npm:zod` becomes `zod`) and includes `supabase/functions/**/*.test.ts`. Each test file uses the `node` environment.

## Hono dependency

`hono` is now a devDependency (see the last section), so `server/app.test.ts` runs by default. The text below is the original setup note, kept for the case where Hono cannot be resolved: `app.test.ts` loads `app.ts` with a top-level `await import`, and if Hono is missing its app tests are skipped with a warning. In that case either add `hono` as a devDependency (`pnpm add -D hono`), or point `EDGE_HONO_DIR` at a folder that contains `node_modules/hono`:

```
mkdir %TEMP%\edge-hono && cd %TEMP%\edge-hono && npm i hono
set EDGE_HONO_DIR=%TEMP%\edge-hono
npx vitest run supabase
```

## What is covered

- `scoring.test.ts`: PHQ-4 (0-2, 3-5, 6-8, 9-12), PHQ-9 (0-4, 5-9, 10-14, 15-19, 20-27) and GAD-7 (0-4, 5-9, 10-14, 15-21) band boundaries. PHQ-9 item 9 non-zero sets `item9_flag`, `crisis` and the helplines (14416, 1800-891-4416, 1800-599-0019, 112) even when the total is minimal. Wrong answer counts throw. The educational disclaimer is always present.
- `_shared/pii.test.ts`: Indian mobiles (with and without +91, spaces, hyphens), emails, Aadhaar-like numbers, roll numbers (VIT, IITM and long formats), names from self-introductions and honorifics, mixed input, idempotence.
- `_shared/lexicon.test.ts`: English and Hinglish crisis terms, panic as moderate, helpline list, crisis card content.
- `_shared/lexicon_drift.test.ts`: checks that the generated server lexicon is not stale (hash of `src/domain/risk/lexicon.ts`) and that server and client agree on every one of the 600 rows of `eval/dataset/dataset.jsonl` (see the closed safety gaps below). This replaces the earlier version that only printed the disagreement rate.
- `server/validation.test.ts`: schema limits for assessments, chat, mood, appointments, posts, care shares, journals.
- `server/rate_limiter.test.ts`: in-memory window, per-key isolation, window expiry, database RPC result, fallback on RPC error or throw.
- `server/claude.test.ts` (mocked Anthropic client):
  - A lexicon high hit skips generation and returns the crisis card (the client factory is never called).
  - A classifier answer of `crisis` returns the crisis card.
  - A classifier answer of `moderate` generates a reply and appends the helpline resources.
  - A classifier that throws gives the safe template, `degraded: true`, no generation and the resources.
  - The output guard blocks diagnosis claims, medication advice and suicide method details.
  - PII is redacted from the message and history before they reach the model. Only the last 10 history turns are sent.
- `server/app.test.ts` (Hono `app.request()`, fake JWT verifier):
  - Every registered route except health returns 401 with no token and with an invalid token. A throwing verifier gives 401, not 500.
  - The CORS allowlist (defaults and `ALLOWED_ORIGINS`) and preflight handling.
  - Zod failures return 422 without a stack trace. Bad JSON returns 400. A thrown handler error returns a generic 500.
  - Request body limit: declared Content-Length, real body, and streamed body without Content-Length.
  - Export and delete use the id from the verified token only, ignoring URL, query and body ids. Erasure is audited before deletion. Inserts use the token user as `student_id`.
  - PHQ-9 item 9 through the API returns the crisis protocol and does NOT insert a second risk event or audit row. The database trigger `trg_assessment_crisis` is the single source of truth for the risk event, the first follow-up step and the audit entry (an earlier version inserted them in both places, which produced duplicates).
  - Chat SSE: crisis card, moderate resources, degraded flag, guard replacement, audit failure does not stop the stream, 429 from the database bucket and from the in-memory fallback, no message text in audit rows.
  - Moderation and community post PII handling.

## Defects found and fixed while writing the tests

1. CORS preflight (`OPTIONS`) returned 500. `c.text("", 204)` builds a Response with a body, which the Response constructor rejects for status 204. Now `c.body(null, 204)`.
2. `/moderation/classify` and `POST /circles/:id/posts` read `pii.containsPII` and `pii.redactedText`, which `redactPII` does not return (it returns `hasRedactions` and `sanitized`). PII was never flagged and posts were stored with `content: undefined`. Both now use the real fields, and posts redact title and content separately. `getCrisisResponseTemplate` was also called with a `lexicon.language` argument that does not exist.
3. A classifier failure was treated as risk `none` and the model then generated a free reply. It now returns a `degraded` flag, and the pipeline answers with the safe template plus helpline resources. `done` events carry `degraded`.
4. The moderate risk level had no effect on the reply. Moderate replies and degraded replies now end with the Tele-MANAS, KIRAN and 112 resources.
5. The output guard had no suicide method patterns. Five were added. The medication pattern is unchanged.
6. Roll number redaction missed common formats such as `21BCE1234` and `CS21B1234`. Names were not redacted at all. Both were added (`redactedTypes.name`).
7. The 1 MB body limit only checked the `Content-Length` header. A chunked body skipped it. The body is now measured when the header is missing.
8. A failing audit insert in `/chat/stream` left the SSE stream open without a `done` event. Persistence errors are now caught and the reply is still delivered.

## Known gaps (status 2026-11-20)

Three gaps listed in the first version of this document are now closed; they are kept here with their status.

- ~~Nothing proves the function boots on Deno.~~ **Closed for a local stack:** it runs on the real Supabase Deno edge runtime (see the last section). Not run on a hosted project.
- ~~The edge lexicon disagrees with the client on about 28% of rows.~~ **Closed:** the server lexicon is generated from `src/domain/risk/lexicon.ts` and agrees on 600 of 600 rows.
- ~~Tokens streamed before the output guard runs are not recalled.~~ **Closed:** the guard runs server-side before any text is shown (buffered, never streamed unguarded).
- Still open: name redaction covers only introductions and honorifics. Free-standing names need an NER step.
- Still open: the real Claude chat route was not run (needs `ANTHROPIC_API_KEY`), so the model name, the live SDK response shape and the live guard behaviour are unverified.
- Still open: Daily.co video token routes (need `DAILY_API_KEY`) and institution analytics routes are covered only by the 401 sweep in Vitest.
- Still open: `pg_cron` retention scheduling is not verified. The SQL token bucket (`check_rate_limit`) is covered by pgTAP on a local database, not load tested.

## Closed safety gaps & updates (Lexicon synchronization & Output guard buffering)

### 1. Unified single source of truth for crisis lexicon
- **Generation Script**: `scripts/sync-lexicon.mjs` reads `src/domain/risk/lexicon.ts`, computes its SHA-256 hash, and generates `supabase/functions/_shared/lexicon.generated.ts` with explicit `.ts` extensions and a `DO NOT EDIT` header with the source hash.
- **Npm Script**: Added `"sync:lexicon": "node scripts/sync-lexicon.mjs"` to `package.json` and documented in `supabase/README.md`.
- **Edge Function Integration**: `supabase/functions/_shared/lexicon.ts` imports and re-exports `detectRisk` from `lexicon.generated.ts`. `checkCrisisLexicon` wraps `detectRisk` with crisis thresholding (high/imminent -> crisis, moderate/panic -> moderate), while maintaining consistent helpline constants (Tele-MANAS 14416 / 1800-891-4416, KIRAN 1800-599-0019, Emergency 112).
- **Drift & Staleness Tests**: `supabase/functions/_shared/lexicon_drift.test.ts` includes:
  - Staleness test: validates `Source SHA-256` header in `lexicon.generated.ts` against `src/domain/risk/lexicon.ts`, failing if changes are unsynchronized.
  - 100% Agreement drift test: verifies that server and client produce the identical risk level on every single row of `eval/dataset/dataset.jsonl` (600/600 rows, 100% exact agreement, 0 disagreements).

### 2. Output guard before student sees text (Server-side buffering)
- **Problem**: Tokens streamed live to the client before the output guard executed allowed unsafe text (clinical diagnoses, suicide methods, medication advice) to be visible on the student's screen before the guard could replace it in the `done` event.
- **Architecture**: Redesigned `/chat/stream` companion pipeline in `supabase/functions/server/claude.ts` and `app.ts` to buffer model generation server-side per turn.
  - When model generation starts, an initial `preparing` event is emitted.
  - The model's raw delta stream is accumulated in server memory (`fullGenerated`).
  - `checkOutputGuard(fullGenerated)` executes BEFORE any content is emitted to the client.
  - If the guard trips, `fullGenerated` is discarded and replaced with `getSafeFallbackReply() + resourcesFooter`.
  - Only guarded, verified safe content is delivered to the client in chunks.
- **Trade-off Analysis**: Buffering trades streaming latency (time-to-first-token is deferred until model generation and guard check complete for that turn) in exchange for absolute safety guarantees. For vulnerable university students in distress, preventing clinical diagnostic claims or lethal method leaks is a non-negotiable ethical and legal priority.
- **Client Adaptation**: `src/shared/lib/api/chat.ts` and `src/features/chat/Chat.tsx` handle `preparing`, `chunk`, and `done` SSE events cleanly. The thinking indicator remains active during preparation, and tests verify that forbidden diagnostic claims or methods are never rendered in the DOM, not even briefly.

### 3. Hono devDependency & App test suite execution
- Added `hono` v4 as a devDependency. The tests in `supabase/functions/server/app.test.ts` now execute and pass under Node Vitest without requiring `EDGE_HONO_DIR`.

## Real edge runtime verification (2026-11-20)

The function was served with the Supabase CLI against the local stack (real Deno edge runtime, real Supabase Auth JWTs) and exercised through the API:

- Sign-up creates a profile with an anonymous alias.
- `POST /assessments` with PHQ-9 item 9 = 2 stores the assessment and returns the helplines. The `crisis` risk event is created by the database trigger, once (it was created twice before the trigger became the single source).
- A request carrying only the anon key returns 401.
- `GET /students/<other-id>/export` returns the caller's own data: identity comes from the token and the id in the URL is ignored, so the original IDOR is closed.
- `GET /health` works.

Not verified: the Claude chat route (needs `ANTHROPIC_API_KEY`), Daily.co video tokens (needs `DAILY_API_KEY`), `pg_cron`, and any hosted deployment.

