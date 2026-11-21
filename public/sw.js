/* MindSahaay service worker (hand-written, no dependencies).
 *
 * The Vite plugin in vite.config.ts rewrites the three marked constants below at build time:
 * VERSION (hash of the precache list + src/shared/lib/pwa/helplines.ts), PRECACHE (resolved from the
 * real build manifest) and SHELL_ROUTES. In dev this file is never registered.
 *
 * Privacy rule: anything that could carry personal data is NEVER cached or intercepted. Only the
 * static app shell and its build assets are stored.
 */
const VERSION = /*SW_VERSION*/ "dev";
const PRECACHE = /*SW_PRECACHE*/ ["/index.html", "/offline.html", "/offline.js"];
const SHELL_ROUTES = /*SW_SHELL_ROUTES*/ ["/", "/login", "/crisis", "/chat", "/dashboard"];

const CACHE_PREFIX = "mindsahaay-shell-";
const CACHE_NAME = CACHE_PREFIX + VERSION;
const PRECACHE_SET = new Set(PRECACHE);
const NETWORK_ONLY_PATHS = ["/functions/", "/rest/", "/auth/", "/realtime/", "/storage/"];

self.addEventListener("install", (event) => {
  // No automatic skipWaiting: the page confirms via postMessage so a student is never reloaded mid-exercise.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE.map((url) =>
          fetch(new Request(url, { cache: "reload", credentials: "omit" })).then((res) => {
            if (!res.ok) throw new Error("Precache failed: " + url + " " + res.status);
            return cache.put(url, res);
          }),
        ),
      ),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data && event.data.type === "GET_VERSION" && event.source) {
    event.source.postMessage({ type: "VERSION", version: VERSION, cache: CACHE_NAME });
  }
});

function isNetworkOnly(request, url) {
  if (request.method !== "GET") return true;
  if (url.origin !== self.location.origin) return true; // Supabase and every other third-party origin
  if (request.headers.has("Authorization")) return true;
  return NETWORK_ONLY_PATHS.some((p) => url.pathname.includes(p));
}

async function staleWhileRevalidate(request, url) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url.pathname);
  const refresh = fetch(request)
    .then((res) => {
      if (res && res.ok && res.type === "basic") cache.put(url.pathname, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (cached) {
    // Keep the worker alive until the background refresh settles.
    return cached;
  }
  const fresh = await refresh;
  return fresh || Response.error();
}

async function handleNavigation(request, url) {
  try {
    return await fetch(request);
  } catch (_err) {
    const cache = await caches.open(CACHE_NAME);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    if (SHELL_ROUTES.includes(path)) {
      const shell = await cache.match("/index.html");
      if (shell) return shell;
    }
    const offline = await cache.match("/offline.html");
    return offline || new Response("Offline. Emergency: call 112. Tele-MANAS 14416. KIRAN 1800-599-0019.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (isNetworkOnly(request, url)) return; // do not intercept: browser handles it, nothing is cached

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request, url));
    return;
  }
  if (PRECACHE_SET.has(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, url));
  }
});
