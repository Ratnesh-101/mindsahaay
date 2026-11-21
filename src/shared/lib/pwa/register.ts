/**
 * Service worker registration. Registers only in production builds that are not demo builds
 * (VITE_PWA_E2E=true lets the PWA end-to-end build opt in). Never runs in dev or tests.
 */

export type UpdateAvailableHandler = (applyUpdate: () => void) => void;

interface RegisterOptions {
  onUpdateAvailable?: UpdateAvailableHandler;
}

export function shouldRegister(): boolean {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  if (!import.meta.env.PROD) return false;
  const demo = String(import.meta.env.VITE_DEMO_MODE) === "true";
  const e2e = String(import.meta.env.VITE_PWA_E2E) === "true";
  return !demo || e2e;
}

/** Asks a waiting worker to take over. The page then reloads on controllerchange. */
export function skipWaiting(worker: ServiceWorker | null | undefined): void {
  worker?.postMessage({ type: "SKIP_WAITING" });
}

export async function registerServiceWorker(options: RegisterOptions = {}): Promise<ServiceWorkerRegistration | null> {
  if (!shouldRegister()) return null;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

    const announce = (worker: ServiceWorker | null) => {
      // Only announce when an older worker is controlling the page (a real update, not first install).
      if (worker && navigator.serviceWorker.controller) {
        options.onUpdateAvailable?.(() => {
          applying = true;
          skipWaiting(worker);
        });
      }
    };
    let applying = false;

    if (registration.waiting) announce(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      installing?.addEventListener("statechange", () => {
        if (installing.state === "installed") announce(registration.waiting ?? installing);
      });
    });

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // clients.claim() also fires this on the very first install; only reload after a confirmed update.
      if (reloading || !applying) return;
      reloading = true;
      window.location.reload();
    });

    return registration;
  } catch {
    return null;
  }
}

/** Test helper: removes every registration and every MindSahaay cache. */
export async function unregisterServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((r) => r.unregister()));
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("mindsahaay-")).map((k) => caches.delete(k)));
  }
}
