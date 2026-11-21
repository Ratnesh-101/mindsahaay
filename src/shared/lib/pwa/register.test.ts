import { describe, it, expect, vi, afterEach } from "vitest";
import { registerServiceWorker, shouldRegister, skipWaiting } from "./register";

type Listener = () => void;

function fakeServiceWorkerContainer(opts: { controller: boolean; waiting?: ServiceWorker | null }) {
  const listeners: Record<string, Listener[]> = {};
  const registration = {
    waiting: opts.waiting ?? null,
    installing: null as ServiceWorker | null,
    addEventListener: vi.fn(),
  };
  const container = {
    controller: opts.controller ? ({} as ServiceWorker) : null,
    register: vi.fn().mockResolvedValue(registration),
    addEventListener: (type: string, fn: Listener) => {
      (listeners[type] ??= []).push(fn);
    },
  };
  vi.stubGlobal("navigator", { ...navigator, serviceWorker: container });
  return { container, registration, emit: (type: string) => listeners[type]?.forEach((fn) => fn()) };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("shouldRegister", () => {
  it("is false outside production builds (tests, dev)", () => {
    expect(shouldRegister()).toBe(false);
  });

  it("is false in a demo build unless the PWA e2e flag is set", () => {
    fakeServiceWorkerContainer({ controller: false });
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_DEMO_MODE", "true");
    expect(shouldRegister()).toBe(false);
    vi.stubEnv("VITE_PWA_E2E", "true");
    expect(shouldRegister()).toBe(true);
  });

  it("is true in a real production build", () => {
    fakeServiceWorkerContainer({ controller: false });
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_DEMO_MODE", "false");
    expect(shouldRegister()).toBe(true);
  });
});

describe("skipWaiting", () => {
  it("posts SKIP_WAITING and tolerates a missing worker", () => {
    const worker = { postMessage: vi.fn() } as unknown as ServiceWorker;
    skipWaiting(worker);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(() => skipWaiting(null)).not.toThrow();
  });
});

describe("registerServiceWorker update flow", () => {
  it("returns null and registers nothing when registration is not allowed", async () => {
    const { container } = fakeServiceWorkerContainer({ controller: true });
    expect(await registerServiceWorker()).toBeNull();
    expect(container.register).not.toHaveBeenCalled();
  });

  it("announces a waiting worker only when an older worker controls the page, and apply posts SKIP_WAITING", async () => {
    const waiting = { postMessage: vi.fn() } as unknown as ServiceWorker;
    const { container } = fakeServiceWorkerContainer({ controller: true, waiting });
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_DEMO_MODE", "false");
    const onUpdateAvailable = vi.fn();
    await registerServiceWorker({ onUpdateAvailable });
    expect(container.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    expect(onUpdateAvailable).toHaveBeenCalledTimes(1);
    onUpdateAvailable.mock.calls[0][0]();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("does not announce on the very first install", async () => {
    const waiting = { postMessage: vi.fn() } as unknown as ServiceWorker;
    fakeServiceWorkerContainer({ controller: false, waiting });
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_DEMO_MODE", "false");
    const onUpdateAvailable = vi.fn();
    await registerServiceWorker({ onUpdateAvailable });
    expect(onUpdateAvailable).not.toHaveBeenCalled();
  });

  it("reloads once on controllerchange, only after apply()", async () => {
    const waiting = { postMessage: vi.fn() } as unknown as ServiceWorker;
    const { emit } = fakeServiceWorkerContainer({ controller: true, waiting });
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_DEMO_MODE", "false");
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    const onUpdateAvailable = vi.fn();
    await registerServiceWorker({ onUpdateAvailable });

    emit("controllerchange");
    expect(reload).not.toHaveBeenCalled();

    onUpdateAvailable.mock.calls[0][0]();
    emit("controllerchange");
    emit("controllerchange");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("returns null when registration throws", async () => {
    const { container } = fakeServiceWorkerContainer({ controller: true });
    container.register.mockRejectedValue(new Error("blocked"));
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_DEMO_MODE", "false");
    expect(await registerServiceWorker()).toBeNull();
  });

  it("handles updatefound and installing worker statechange to installed", async () => {
    const installingListeners: Record<string, Listener[]> = {};
    const installingWorker = {
      state: "installing",
      addEventListener: (type: string, fn: Listener) => {
        (installingListeners[type] ??= []).push(fn);
      },
      postMessage: vi.fn(),
    } as unknown as ServiceWorker;

    const regListeners: Record<string, Listener[]> = {};
    const registration = {
      waiting: null as ServiceWorker | null,
      installing: installingWorker,
      addEventListener: (type: string, fn: Listener) => {
        (regListeners[type] ??= []).push(fn);
      },
    };

    const container = {
      controller: {} as ServiceWorker,
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: vi.fn(),
    };
    vi.stubGlobal("navigator", { ...navigator, serviceWorker: container });
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_DEMO_MODE", "false");

    const onUpdateAvailable = vi.fn();
    await registerServiceWorker({ onUpdateAvailable });

    // Trigger updatefound
    regListeners["updatefound"]?.forEach((fn) => fn());

    // Worker finishes installing
    Object.defineProperty(installingWorker, "state", { value: "installed", configurable: true });
    installingListeners["statechange"]?.forEach((fn) => fn());

    expect(onUpdateAvailable).toHaveBeenCalledTimes(1);
  });
});
