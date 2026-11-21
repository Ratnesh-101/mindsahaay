import type {
  AuthChangeEvent,
  RealtimeChannel,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";

// ------------------------------------------------------------------------------
// Edge Function Slug Definition (Default: "server")
// ------------------------------------------------------------------------------
export const FUNCTIONS_SLUG: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_FUNCTIONS_SLUG) || "server";

// ------------------------------------------------------------------------------
// Environment & Demo Mode Detection
// ------------------------------------------------------------------------------
const isDemoMode: boolean = Boolean(
  (typeof import.meta !== "undefined" &&
    (import.meta.env?.VITE_DEMO_MODE === "true" ||
      import.meta.env?.VITE_DEMO_MODE === true ||
      import.meta.env?.MODE === "test")) ||
    (typeof window !== "undefined" &&
      window.localStorage?.getItem("mindsahaay_demo_mode") === "true") ||
    (typeof process !== "undefined" && process.env?.NODE_ENV === "test"),
);

const envUrl: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  (projectId ? `https://${projectId}.supabase.co` : "");

const envKey: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  publicAnonKey ||
  "";

// Require Supabase credentials outside demo/test mode
if (!isDemoMode && (!envUrl || !envKey)) {
  throw new Error(
    "MindSahaay Configuration Error: Missing required environment variables VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY.\n" +
      "Please provide valid Supabase credentials in your .env or .env.local file.\n" +
      "To run MindSahaay in offline/demo mode without Supabase backend credentials, launch with VITE_DEMO_MODE=true.",
  );
}

export const SUPABASE_URL: string = envUrl || "https://demo.supabase.co";
export const SUPABASE_ANON_KEY: string = envKey || "demo-anon-key";

export const FUNCTIONS_BASE_URL: string = `${SUPABASE_URL}/functions/v1/${FUNCTIONS_SLUG}`;

export function getFunctionUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${FUNCTIONS_BASE_URL}${cleanPath}`;
}

// ------------------------------------------------------------------------------
// Lazy client
//
// The Supabase SDK is large and the login screen does not need it to paint. The exported `supabase`
// object keeps the same call shapes as SupabaseClient (the subset this app uses) but only loads the
// SDK on first use, via a dynamic import. Query builders are recorded synchronously and replayed on
// the real client when awaited.
// ------------------------------------------------------------------------------
let clientPromise: Promise<SupabaseClient> | null = null;

/** Resolves the real Supabase client, creating it on first call. */
export function getSupabase(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import("./supabaseClient").then((m) =>
      m.createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY),
    );
  }
  return clientPromise;
}

type Step = { kind: "get"; prop: string } | { kind: "call"; args: unknown[] };

function replay(client: unknown, steps: Step[]): unknown {
  let current: unknown = client;
  let receiver: unknown = client;
  for (const step of steps) {
    if (step.kind === "get") {
      receiver = current;
      current = (current as Record<string, unknown>)[step.prop];
    } else {
      current = (current as (...a: unknown[]) => unknown).apply(receiver, step.args);
    }
  }
  return current;
}

function recorder(steps: Step[]): unknown {
  let pending: Promise<unknown> | null = null;
  const run = (): Promise<unknown> => {
    pending ??= getSupabase().then((client) => replay(client, steps));
    return pending;
  };
  return new Proxy(function recorded() {}, {
    get(_target, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "then" && steps.length > 0) {
        return (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          run().then(onFulfilled, onRejected);
      }
      return recorder([...steps, { kind: "get", prop }]);
    },
    apply(_target, _this, args) {
      return recorder([...steps, { kind: "call", args }]);
    },
  });
}

function asyncMethod(name: string) {
  return (...args: unknown[]) =>
    getSupabase().then((client) => {
      const auth = client.auth as unknown as Record<string, (...a: unknown[]) => unknown>;
      return auth[name](...args);
    });
}

const AUTH_ASYNC_METHODS = [
  "getSession",
  "getUser",
  "updateUser",
  "signInWithOtp",
  "signInWithOAuth",
  "signInWithPassword",
  "signUp",
  "signOut",
  "refreshSession",
  "setSession",
  "exchangeCodeForSession",
  "resend",
  "verifyOtp",
  "resetPasswordForEmail",
] as const;

const lazyAuth: Record<string, unknown> = {};
for (const name of AUTH_ASYNC_METHODS) lazyAuth[name] = asyncMethod(name);

/** Returns a subscription handle immediately and attaches the real listener once the SDK is loaded. */
lazyAuth.onAuthStateChange = (
  callback: (event: AuthChangeEvent, session: Session | null) => void | Promise<void>,
) => {
  let cancelled = false;
  let real: { unsubscribe: () => void } | null = null;
  getSupabase().then((client) => {
    if (cancelled) return;
    real = client.auth.onAuthStateChange(callback).data.subscription;
  });
  return {
    data: {
      subscription: {
        id: "lazy-auth-subscription",
        callback,
        unsubscribe() {
          cancelled = true;
          real?.unsubscribe();
        },
      },
    },
  };
};

interface LazyChannel {
  on: (...args: unknown[]) => LazyChannel;
  subscribe: (callback?: (status: string) => void) => LazyChannel;
  unsubscribe: () => Promise<unknown>;
  real: Promise<RealtimeChannel> | null;
}

// Every lazy channel gets a UNIQUE topic. supabase-js returns the already-existing channel when
// client.channel() is called again with the same name, and calling .on() on a channel that is
// already subscribed throws "cannot add postgres_changes callbacks ... after subscribe()". React
// effects re-subscribe (dependency changes, hot reload) while the previous channel is still being
// removed asynchronously, which hit exactly that error on the counsellor crisis queue and left it
// without live updates. A unique suffix makes each subscription independent; postgres_changes
// are matched by their table and filter, not by the topic name, so nothing else changes.
let channelSeq = 0;

function lazyChannel(name: string, opts?: unknown): LazyChannel {
  const listeners: unknown[][] = [];
  const uniqueName = `${name}:${++channelSeq}`;
  const self: LazyChannel = {
    real: null,
    on(...args) {
      listeners.push(args);
      return self;
    },
    subscribe(callback) {
      self.real ??= getSupabase().then((client) => {
        const channel = client.channel(uniqueName, opts as never) as unknown as {
          on: (...a: unknown[]) => unknown;
          subscribe: (cb?: (status: string) => void) => unknown;
        };
        for (const args of listeners) channel.on(...args);
        channel.subscribe(callback);
        return channel as unknown as RealtimeChannel;
      });
      return self;
    },
    async unsubscribe() {
      return self.real ? (await self.real).unsubscribe() : "ok";
    },
  };
  return self;
}

const lazyClient = {
  auth: lazyAuth,
  from: (table: string) => (recorder([{ kind: "get", prop: "from" }, { kind: "call", args: [table] }])),
  rpc: (...args: unknown[]) => recorder([{ kind: "get", prop: "rpc" }, { kind: "call", args }]),
  channel: (name: string, opts?: unknown) => lazyChannel(name, opts),
  async removeChannel(channel: LazyChannel | RealtimeChannel) {
    let target: RealtimeChannel;
    if ("real" in channel) {
      if (!channel.real) return "ok";
      target = await channel.real;
    } else {
      target = channel;
    }
    const client = await getSupabase();
    return client.removeChannel(target);
  },
};

export const supabase: SupabaseClient = lazyClient as unknown as SupabaseClient;

export default supabase;
