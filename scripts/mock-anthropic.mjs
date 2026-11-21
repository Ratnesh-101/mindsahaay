#!/usr/bin/env node
/**
 * Local MOCK of the Anthropic Messages API for testing scripts/eval-llm.ts and eval-hybrid.ts.
 * Plain Node http, no dependencies. NOT a model: levels come from simple keyword rules plus noise,
 * so every number produced against it is meaningless and is stored under eval/results/mock/.
 *
 *   node scripts/mock-anthropic.mjs [--port 8787] [--noise 0.15] [--p429 0] [--p529 0] [--p500 0]
 *                                   [--pmalformed 0] [--ptimeout 0] [--delay 0] [--seed 1]
 *                                   [--valid-key KEY] [--fail-after N]
 *   then:  $env:ANTHROPIC_BASE_URL = "http://127.0.0.1:8787"; node scripts/eval-llm.ts --split dev --limit 20
 *
 * Endpoints: POST /v1/messages (tool call or JSON text), GET /__stats (counters), POST /__reset.
 * Failure injection is probabilistic per request (seeded). --valid-key makes any other x-api-key a 401.
 * --fail-after N answers 500 to every request after N successful ones (to test crash/resume).
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const PORT = Number(opt("port", process.env.MOCK_PORT ?? 8787));
const NOISE = Number(opt("noise", 0.15));
const P429 = Number(opt("p429", 0));
const P529 = Number(opt("p529", 0));
const P500 = Number(opt("p500", 0));
const PMAL = Number(opt("pmalformed", 0));
const PTIMEOUT = Number(opt("ptimeout", 0));
const DELAY = Number(opt("delay", 0));
const VALID_KEY = opt("valid-key", "");
const FAIL_AFTER = Number(opt("fail-after", -1));
let seed = Number(opt("seed", 1)) >>> 0;

const LEVELS = ["none", "low", "moderate", "high", "imminent"];

// Seeded PRNG for failure injection.
function rand() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Per-text deterministic noise so the same message always gets the same mock answer.
function textRand(text, salt) {
  const h = createHash("sha256").update(`${salt}|${text}`).digest();
  return h.readUInt32BE(0) / 4294967296;
}

const R = (s) => new RegExp(s, "iu");
const IDIOM = R("dead tired|killing me|dying of laugh|dying to|mar gaya|mar gayi|hasi se mar|मर रहा हूँ.*हंस|thak ke mar|मेरी जान ले");
const IMMINENT = R("after tonight|tonight.*(opportunity|mean it|bye)|empty tonight|goodbye|good bye|bye everyone|told my friends|gave away|don'?t look for me|about to end|end it all|took something|final note|suicide note|wrote (a )?note|have (the )?pills|plan (is )?ready|मेरे पास योजना|आज ही|आज रात|अलविदा|आख़िरी|मरने जा|आत्महत्या करने जा|मैंने कुछ ले लिया|alvida|aaj raat|mar jaunga|mujhe dhundhna mat|kuch le liya|suicide (karne|ka plan)|faisla ho chuka|ja raha hoon|doston ko alvida");
const HIGH = R("want to die|wanna die|end my life|ending my life|kill myself|kil myself|suicid|sucide|unalive|harm myself|hurt myself|hurting myself|cut myself|self[- ]harm|never been born|better off dead|not being alive|wake up tomorrow|can'?t go on living|don'?t want to (live|be alive)|मरना चाहता|मरना चाहती|जीना नहीं|जान दे|आत्महत्या|पैदा ही न|सो जाना चाहता|खुद को (नुकसान|चोट)|marna chahta|marna chahti|jeena nahi|jeena nhi|jeene ki koi wajah|paida hi na|so jana chahta|sab khatam kar|jaan de|khudkushi|aatmahatya|khud ko (hurt|nuksan|chot)");
const MODERATE = R("hopeless|burden|disappear|no way out|trapped|can'?t take it anymore|better without me|worthless|point of anything|tired of being|sleep and not|pretending|unbearable|nobody would miss|बोझ|उम्मीद नहीं|ग़ायब|गायब|बेकार|खाली|सुन्न|मतलब नहीं|खुद से बहुत थक|कोई रास्ता नहीं|bojh|umeed nahi|gayab|bekaar|bardasht|apne aap se bahut thak|so jaun|koi raasta nahi");
const LOW = R("stress|anxious|anxiety|lonely|alone|homesick|worried|sad|exam|backlog|cgpa|placement|miss (home|my)|tension|pareshan|akela|ghar ki yaad|चिंता|तनाव|अकेला|घर की याद|परेशान|उदास");

function ruleLevel(text) {
  if (IDIOM.test(text) && !HIGH.test(text) && !IMMINENT.test(text)) return "none";
  // A very rough "plan or timeframe" rule: imminent phrases win, then explicit ideation.
  if (IMMINENT.test(text)) return HIGH.test(text) && !/tonight|aaj raat|आज|goodbye|plan|योजना|ready/i.test(text) ? "high" : "imminent";
  if (HIGH.test(text)) return "high";
  if (MODERATE.test(text)) return "moderate";
  if (LOW.test(text)) return "low";
  return "none";
}

function noisyLevel(text) {
  const base = ruleLevel(text);
  if (textRand(text, "noise") >= NOISE) return base;
  const i = LEVELS.indexOf(base);
  const up = textRand(text, "dir") < 0.5;
  const j = Math.max(0, Math.min(LEVELS.length - 1, i + (up ? 1 : -1)));
  return LEVELS[j];
}

const estTokens = (s) => Math.ceil(s.length / 3.5);

let inflight = 0;
const stats = { maxInflight: 0, requests: 0, ok: 0, e401: 0, e429: 0, e529: 0, e500: 0, malformed: 0, timeouts: 0, byText: 0 };
const seen = new Map();
let okCount = 0;

function send(res, status, body, headers = {}) {
  const s = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(s);
}

function apiError(res, status, type, message, headers) {
  send(res, status, { type: "error", error: { type, message } }, headers);
}

const server = createServer((req, res) => {
  const url = (req.url ?? "").split("?")[0];
  if (req.method === "GET" && url === "/__stats") return send(res, 200, { ...stats, distinctTexts: seen.size, repeatedTexts: [...seen.values()].filter((n) => n > 1).length });
  if (req.method === "POST" && url === "/__reset") {
    for (const k of Object.keys(stats)) stats[k] = 0;
    seen.clear();
    okCount = 0;
    return send(res, 200, { ok: true });
  }
  if (req.method !== "POST" || url !== "/v1/messages") return apiError(res, 404, "not_found_error", "Not found");

  stats.requests++;
  inflight++;
  stats.maxInflight = Math.max(stats.maxInflight, inflight);
  res.on("close", () => { inflight--; });
  const key = req.headers["x-api-key"];
  if (!key || (VALID_KEY && key !== VALID_KEY) || key === "invalid-key") {
    stats.e401++;
    return apiError(res, 401, "authentication_error", "invalid x-api-key");
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return apiError(res, 400, "invalid_request_error", "body is not JSON");
    }
    if (!Array.isArray(body.messages) || typeof body.model !== "string") return apiError(res, 400, "invalid_request_error", "messages and model are required");

    if (FAIL_AFTER >= 0 && okCount >= FAIL_AFTER) {
      stats.e500++;
      return apiError(res, 500, "api_error", "mock: fail-after reached");
    }
    const r = rand();
    if (r < P429) {
      stats.e429++;
      return apiError(res, 429, "rate_limit_error", "mock rate limit", { "retry-after": "0" });
    }
    if (r < P429 + P529) {
      stats.e529++;
      return apiError(res, 529, "overloaded_error", "mock overloaded");
    }
    if (r < P429 + P529 + P500) {
      stats.e500++;
      return apiError(res, 500, "api_error", "mock internal error");
    }
    if (r < P429 + P529 + P500 + PTIMEOUT) {
      stats.timeouts++;
      return; // never answer: the client timeout must fire
    }

    const content = body.messages.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n");
    const m = /<message>\n?([\s\S]*?)\n?<\/message>/.exec(content);
    const text = m ? m[1] : content;
    seen.set(text, (seen.get(text) ?? 0) + 1);
    stats.byText = seen.size;

    const level = noisyLevel(text);
    const input = { level, confidence: Number((0.6 + textRand(text, "conf") * 0.39).toFixed(2)), rationale: `mock rule-based answer (${level})` };
    const asTool = body.tool_choice?.type === "tool" || (Array.isArray(body.tools) && body.tools.length > 0);
    const malformed = rand() < PMAL;
    const outBlock = malformed
      ? { type: "text", text: "I cannot classify this." }
      : asTool
        ? { type: "tool_use", id: "toolu_mock", name: "report_risk", input }
        : { type: "text", text: JSON.stringify(input) };
    if (malformed) stats.malformed++;
    const inTok = estTokens(JSON.stringify(body.system ?? "")) + estTokens(JSON.stringify(body.tools ?? "")) + estTokens(content) + (asTool ? 346 : 0);
    const reply = {
      id: `msg_mock_${stats.requests}`,
      type: "message",
      role: "assistant",
      model: body.model,
      content: [outBlock],
      stop_reason: asTool && !malformed ? "tool_use" : "end_turn",
      stop_sequence: null,
      usage: { input_tokens: inTok, output_tokens: estTokens(JSON.stringify(outBlock)) },
    };
    setTimeout(() => {
      okCount++;
      stats.ok++;
      send(res, 200, reply, { "x-mindsahaay-mock": "1" });
    }, DELAY);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock-anthropic listening on http://127.0.0.1:${PORT}  (noise=${NOISE} p429=${P429} p529=${P529} p500=${P500} pmalformed=${PMAL} ptimeout=${PTIMEOUT} delay=${DELAY}ms)`);
  console.log("MOCK ONLY: answers are keyword rules plus noise, not model output.");
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
